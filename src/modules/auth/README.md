# Auth

This module constructs the Better Auth instance and exposes Nest controllers for sign-in, sign-up, social authentication, password recovery, email verification, sessions, and linked accounts.

## Entry points

Nest controller routes use `/api/v1/auth/...`. Better Auth's handler and OAuth callbacks use `/api/auth/...`. Preserve session cookies, and follow the [project CSRF instructions](../../../README.md) for protected writes. Services forward authentication responses through [send-auth-response.ts](http/send-auth-response.ts), preserving provider response behavior.

## Implementation map

- [auth.ts](config/auth.ts) constructs authentication with database, Redis, mail/SMS queues, plugins, and permissions.
- [permissions.ts](permissions/permissions.ts) defines authorization resources and roles.
- `controllers/` and `services/` expose authentication operations and their DTOs.
- `hooks/` enforces activation and internal-field restrictions and captures notification-related changes.
- [auth.cli.ts](config/auth.cli.ts) supplies configuration for authentication tooling.

[AuthModule](auth.module.ts) checks that invitation capture is installed before creating the runtime auth instance. Apply committed database migrations before startup. Coordinate user and invitation hooks with [notifications](../notifications/README.md) so state changes and durable notification capture stay consistent.

Authentication establishes identity. Store operations additionally require organization context and feature permissions; see [shared guards](../../common/README.md) and [Stores](../stores/README.md). Profile and account lifecycle operations belong to [Users](../users/README.md).
