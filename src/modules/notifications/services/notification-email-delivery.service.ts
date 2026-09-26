import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { renderNotificationEmail } from '@/infrastructure/mail/templates/notificationEmailTemplate';
import { appConfig } from '@/core/config';
import { MailService } from '@/common/abstracts';
import { MailDeliveryError } from '@/common/errors/mail-delivery.error';
import { NotificationEmailDeliveryRepository } from '../repos/notification-email-delivery.repository';
import { NotificationPreferencesRepository } from '../repos/notification-preferences.repository';
import { NotificationRecipientPolicyService } from './notification-recipient-policy.service';
import {
  parseNotificationIntent,
  type NotificationIntent,
} from '../domain/notification-event';
import {
  normalizeNotificationEmail,
  notificationEmailOwner,
} from '../domain/notification-recipient';
import { PROVIDER_SAFETY_MS } from '../repos/notification-work';

@Injectable()
export class NotificationEmailDeliveryService {
  constructor(
    private readonly deliveries: NotificationEmailDeliveryRepository,
    private readonly preferences: NotificationPreferencesRepository,
    private readonly policy: NotificationRecipientPolicyService,
    private readonly mail: MailService,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  async send(id: string) {
    const delivery = await this.deliveries.claim(id);
    if (!delivery?.leaseToken) return;
    const token = delivery.leaseToken;
    // Renew ownership while provider/database calls are pending; expired owners cannot dispatch.
    const heartbeat = setInterval(() => {
      void this.deliveries.renew(id, token).catch(() => undefined);
    }, 60_000);
    heartbeat.unref();
    try {
      let intent: NotificationIntent;
      let destination: string;
      try {
        intent = parseNotificationIntent(delivery.payload);
        destination = normalizeNotificationEmail(delivery.recipientEmail ?? '');
      } catch {
        await this.deliveries.fail(id, token, true);
        return;
      }
      if (Date.now() >= intent.occurredAt.getTime() + 180 * 86400000) {
        await this.deliveries.suppress(
          id,
          token,
          'Source replay period expired',
        );
        return;
      }
      const recipient = {
        userId: delivery.recipientUserId,
        email: destination,
        audiences: delivery.audiences,
      };
      if (
        notificationEmailOwner(intent.eventType, recipient) === 'legacy_order'
      ) {
        await this.deliveries.suppress(
          id,
          token,
          'Shopper email owns this transition',
        );
        return;
      }
      const audiences = await this.policy.eligibleAudiences(recipient, intent);
      if (!audiences.length) {
        await this.deliveries.suppress(
          id,
          token,
          'Recipient inactive or access revoked',
        );
        return;
      }
      if (
        !(await this.preferences.recipientEmailEnabled(
          { ...recipient, audiences },
          intent.storeId,
          intent.eventType,
        ))
      ) {
        await this.deliveries.suppress(id, token, 'Email preference disabled');
        return;
      }
      if (
        delivery.providerDispatchedAt &&
        Date.now() - delivery.providerDispatchedAt.getTime() >=
          PROVIDER_SAFETY_MS
      ) {
        await this.deliveries.fail(id, token, false, true);
        return;
      }
      const url = new URL(`/api/v1/notifications`, this.app.baseUrl).toString();
      const html = renderNotificationEmail(intent.display, url);
      if (!(await this.deliveries.beginProviderRequest(id, token))) return;
      const sent = await this.mail.sendEmail(
        destination,
        intent.display.title,
        html,
        { idempotencyKey: delivery.providerIdempotencyKey },
      );
      await this.deliveries.sent(id, token, sent.providerMessageId);
    } catch (error) {
      await this.deliveries.fail(
        id,
        token,
        error instanceof MailDeliveryError && error.permanent,
      );
    } finally {
      clearInterval(heartbeat);
    }
  }
}
