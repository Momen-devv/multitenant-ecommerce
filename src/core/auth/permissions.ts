import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';
import {
  adminAc as organizationAdminAc,
  defaultStatements as organizationDefaultStatements,
  ownerAc as organizationOwnerAc,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  ...organizationDefaultStatements,
  store: ['read', 'update', 'delete'],
  product: ['read', 'create', 'update', 'delete'],
  order: ['read', 'create', 'update', 'fulfill', 'refund'],
  customer: ['read', 'update'],
  report: ['read'],
} as const;

export const ac = createAccessControl(statement);

export const platformSuperAdmin = ac.newRole({
  ...adminAc.statements,
});

export const user = ac.newRole({});

const allCommercePermissions = {
  store: ['read', 'update', 'delete'],
  product: ['read', 'create', 'update', 'delete'],
  order: ['read', 'create', 'update', 'fulfill', 'refund'],
  customer: ['read', 'update'],
  report: ['read'],
} as const;

export const organizationOwner = ac.newRole({
  ...organizationOwnerAc.statements,
  ...allCommercePermissions,
});

export const organizationManager = ac.newRole({
  ...organizationAdminAc.statements,
  store: ['read', 'update'],
  product: ['read', 'create', 'update', 'delete'],
  order: ['read', 'create', 'update', 'fulfill', 'refund'],
  customer: ['read', 'update'],
  report: ['read'],
});

export const support = ac.newRole({
  order: ['read'],
  customer: ['read', 'update'],
});
