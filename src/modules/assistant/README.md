# Assistant

Assistant routes natural-language management commands into a fixed set of supported actions using typed AI decisions. Store commands use `POST /api/v1/stores/me/assistant/commands`; platform commands use `POST /api/v1/platform/assistant/commands`.

## Execution path

1. The controller establishes Store membership or platform super admin access.
2. The service submits the command to `AiService.decide` with the appropriate typed questions.
3. The selected action is dispatched to the corresponding actions service.
4. Existing management services execute the operation with their authorization and lifecycle rules.

Store actions cover invitations, membership roles, removal, and leaving. Platform actions cover user bans, activation, sessions, roles, and Store suspension/reactivation. Authoritative action sets are [StoreAssistantAction](../../common/enums/store-assistant-action.enum.ts) and [PlatformAssistantAction](../../common/enums/platform-assistant-action.enum.ts).

`questions/` defines classification questions; `services/` separates classification from action execution; the repository resolves action targets. Unsupported classifications return a message. Some action failures are also represented in the action result's message, so HTTP success alone does not prove the requested change occurred.

When adding an action, update its enum, typed questions, dispatcher, target validation, and underlying permission checks together. AI classification selects a supported operation; it does not grant authority. See [AI infrastructure](../../infrastructure/ai/README.md), [Stores](../stores/README.md), and [Users](../users/README.md).
