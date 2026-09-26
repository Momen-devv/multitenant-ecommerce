-- Database writes, not auth after-hooks, own lifecycle capture. No historical
-- initial emails: existing pending invitations are seeded as already announced.
CREATE FUNCTION record_invitation_notification(invitation_key text, event_name text, generation integer DEFAULT 0)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  st invitation_notification_state%ROWTYPE;
  recipients jsonb := '[]'::jsonb;
  source text;
  intent jsonb;
  destination text;
  store_name text;
  inviter_name text;
  invite_role text;
  title text;
  body text;
BEGIN
  SELECT * INTO st FROM invitation_notification_state WHERE invitation_id = invitation_key FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  source := 'invitation:' || invitation_key || ':' || event_name || ':' || generation;
  SELECT name INTO store_name FROM store WHERE id = st.store_id;
  SELECT name, email INTO inviter_name, destination FROM "user" WHERE id = st.inviter_user_id;
  SELECT role INTO invite_role FROM invitation WHERE id = invitation_key;
  IF event_name IN ('created', 'reminder', 'cancelled') AND st.normalized_email IS NOT NULL THEN
    recipients := recipients || jsonb_build_array(jsonb_build_object('userId', st.bound_user_id,
      'email', st.normalized_email, 'audiences', jsonb_build_array('invitee')));
  END IF;
  IF event_name NOT IN ('created', 'reminder') THEN
    recipients := recipients || jsonb_build_array(jsonb_build_object('userId', st.inviter_user_id,
      'email', destination, 'audiences', jsonb_build_array('inviter')));
  END IF;
  title := CASE event_name WHEN 'created' THEN 'You have been invited' WHEN 'reminder' THEN 'Invitation reminder'
    ELSE 'Invitation ' || event_name END;
  body := CASE WHEN event_name IN ('created', 'reminder') THEN
    coalesce(inviter_name, 'A Store owner') || ' invited you to join ' || coalesce(store_name, 'the Store') || ' as ' || coalesce(invite_role, 'staff') || '.'
    ELSE 'The invitation to ' || coalesce(store_name, 'the Store') || ' was ' || event_name || '.' END;
  intent := jsonb_build_object('sourceKey', source, 'eventType', 'invitation.' || event_name,
    'aggregateId', invitation_key, 'aggregateVersion', generation + 1, 'storeId', st.store_id,
    'payloadVersion', 1, 'occurredAt', clock_timestamp(), 'recipients', recipients,
    'display', jsonb_build_object('title', title, 'body', body),
    'resource', jsonb_build_object('kind', 'invitation', 'id', invitation_key));
  INSERT INTO notification_milestones(source_key, event_type, aggregate_id, occurred_at)
    VALUES(source, 'invitation.' || event_name, invitation_key, clock_timestamp()) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    INSERT INTO outbox_events(id, event_type, aggregate_id, payload, deduplication_key)
      VALUES(gen_random_uuid(), 'notification.intent', invitation_key, intent, source) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION capture_invitation_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  store_key uuid;
  bound_key text;
  st invitation_notification_state%ROWTYPE;
  next_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO st FROM invitation_notification_state WHERE invitation_id = OLD.id FOR UPDATE;
    IF FOUND AND st.status IN ('pending', 'accepting') THEN
      UPDATE invitation_notification_state SET status = 'cancelled', outcome_recorded_at = clock_timestamp(), updated_at = clock_timestamp() WHERE invitation_id = OLD.id;
      PERFORM record_invitation_notification(OLD.id, 'cancelled');
    END IF;
    RETURN OLD;
  END IF;
  SELECT id INTO store_key FROM store WHERE organization_id = NEW.organization_id;
  IF store_key IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('invitation-email:' || store_key || ':' || lower(trim(NEW.email))));
    IF EXISTS (SELECT 1 FROM invitation_notification_state prior
      WHERE prior.store_id = store_key AND prior.normalized_email = lower(trim(NEW.email))
        AND coalesce(prior.last_resent_at, prior.created_at) > clock_timestamp() - interval '1 minute') THEN
      RAISE EXCEPTION 'Invitation resend cooldown is one minute' USING ERRCODE = 'PIR01';
    END IF;
  END IF;
  SELECT id INTO bound_key FROM "user" WHERE lower(trim(email)) = lower(trim(NEW.email)) AND email_verified = true;
  INSERT INTO invitation_notification_state(invitation_id, store_id, inviter_user_id, normalized_email,
    bound_user_id, status, expires_at, created_at)
    VALUES(NEW.id, store_key, NEW.inviter_id, lower(trim(NEW.email)), bound_key, 'pending', NEW.expires_at, NEW.created_at)
    ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM invitation_notification_state WHERE invitation_id = NEW.id FOR UPDATE;
  -- Better Auth represents expiry as pending + a past expires_at. Later cleanup
  -- or cancellation of that row must not report a second terminal outcome.
  IF st.status = 'expired' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM record_invitation_notification(NEW.id, 'created');
  ELSIF NEW.status = 'pending' AND OLD.status = 'pending' AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    IF coalesce(st.last_resent_at, st.created_at) > clock_timestamp() - interval '1 minute' THEN
      RAISE EXCEPTION 'Invitation resend cooldown is one minute' USING ERRCODE = 'PIR01';
    END IF;
    UPDATE invitation_notification_state SET resend_generation = resend_generation + 1,
      last_resent_at = clock_timestamp(), expires_at = NEW.expires_at, updated_at = clock_timestamp()
      WHERE invitation_id = NEW.id RETURNING * INTO st;
    PERFORM record_invitation_notification(NEW.id, 'created', st.resend_generation);
  END IF;
  next_status := CASE NEW.status WHEN 'canceled' THEN 'cancelled' WHEN 'accepted' THEN 'accepting' ELSE NEW.status END;
  IF NEW.status IS DISTINCT FROM OLD.status OR TG_OP = 'INSERT' THEN
    -- Better Auth accepts before its membership transaction and can compensate
    -- back to pending. Only the membership INSERT confirms an accepted outcome.
    IF next_status = 'accepting' AND EXISTS (SELECT 1 FROM member m JOIN "user" u ON u.id = m.user_id
      WHERE m.organization_id = NEW.organization_id AND lower(trim(u.email)) = lower(trim(NEW.email)) AND u.email_verified) THEN
      next_status := 'accepted';
    END IF;
    UPDATE invitation_notification_state SET status = next_status, expires_at = NEW.expires_at,
      updated_at = clock_timestamp(), outcome_recorded_at = CASE WHEN next_status IN ('accepted','rejected','cancelled') THEN clock_timestamp() ELSE NULL END
      WHERE invitation_id = NEW.id;
    IF next_status IN ('accepted', 'rejected', 'cancelled') THEN
      PERFORM record_invitation_notification(NEW.id, next_status);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invitation_notification_capture AFTER INSERT OR UPDATE OR DELETE ON invitation
  FOR EACH ROW EXECUTE FUNCTION capture_invitation_notification();
--> statement-breakpoint
CREATE FUNCTION confirm_invitation_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invitation_key text;
BEGIN
  FOR invitation_key IN SELECT i.id FROM invitation i JOIN "user" u ON u.id = NEW.user_id
    WHERE i.organization_id = NEW.organization_id AND i.status = 'accepted'
      AND lower(trim(i.email)) = lower(trim(u.email)) AND u.email_verified
  LOOP
    UPDATE invitation_notification_state SET status = 'accepted', bound_user_id = NEW.user_id,
      outcome_recorded_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE invitation_id = invitation_key AND status = 'accepting';
    IF FOUND THEN PERFORM record_invitation_notification(invitation_key, 'accepted'); END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invitation_membership_confirmation AFTER INSERT ON member
  FOR EACH ROW EXECUTE FUNCTION confirm_invitation_membership();
--> statement-breakpoint
INSERT INTO invitation_notification_state(invitation_id, store_id, inviter_user_id, normalized_email,
  bound_user_id, status, expires_at, created_at)
SELECT i.id, s.id, i.inviter_id, lower(trim(i.email)), u.id, 'pending', i.expires_at, i.created_at
FROM invitation i JOIN store s ON s.organization_id = i.organization_id
LEFT JOIN "user" u ON lower(trim(u.email)) = lower(trim(i.email)) AND u.email_verified
WHERE i.status = 'pending' AND i.expires_at > now() ON CONFLICT DO NOTHING;
