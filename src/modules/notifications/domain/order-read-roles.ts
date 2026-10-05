import {
  organizationOwner,
  organizationManager,
  support,
} from '@/modules/auth/permissions/permissions';

export const orderReadRoles = Object.entries({
  owner: organizationOwner,
  manager: organizationManager,
  support,
})
  .filter(([, role]) => role.statements.order?.includes('read'))
  .map(([name]) => name);
