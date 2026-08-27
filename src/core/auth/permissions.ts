import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';

const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const platformSuperAdmin = ac.newRole({
  ...adminAc.statements,
});

export const user = ac.newRole({});
