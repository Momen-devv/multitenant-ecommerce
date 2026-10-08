# Users

Users owns profiles, profile images, shipping addresses, phone changes and phone-based access, account deactivation/reactivation, and platform user administration.

## HTTP surfaces

| Prefix                           | Operations                                                       |
| -------------------------------- | ---------------------------------------------------------------- |
| `/api/v1/users/profile`          | Read/update profile; upload/delete profile image                 |
| `/api/v1/users/addresses`        | List/create/update/delete addresses; select a default            |
| `/api/v1/users/phone`            | Confirm phone changes, remove phone, sign in, recover password   |
| `/api/v1/users/account`          | Deactivate and request/confirm reactivation                      |
| `/api/v1/platform/users`         | Administrator user, role, ban, session, and lifecycle operations |
| `/api/v1/platform/impersonation` | Start and stop impersonation                                     |

See `controllers/` and `dto/` for exact routes, permissions, and payloads. Anonymous recovery endpoints have their own validation; platform administration requires the platform super admin role where declared.

## Workflow boundaries

`services/` separates profiles, addresses, phones, account lifecycle, and platform administration. Repository contracts and tokens live in `interfaces/repos/`; implementations live in `repos/`. [Address limits](domain/user-address-limits.ts) are defined separately from DTO validation.

Shipping addresses are shopper-owned inputs to [order quotes](../orders/README.md). Order snapshots preserve the purchase address and contact details. Do not replace historical Order snapshots with current profile data.

[AccountCleanupTask](tasks/account-cleanup.task.ts) runs daily at 03:00 when Nest scheduling is enabled. Review its cleanup conditions before changing lifecycle retention. Phone workflows depend on [SMS infrastructure](../../infrastructure/sms/README.md); image workflows use [storage](../../infrastructure/storage/README.md). Authentication sessions and credentials are coordinated with [Auth](../auth/README.md).
