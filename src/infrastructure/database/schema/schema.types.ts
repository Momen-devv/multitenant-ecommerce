import {
  account,
  invitation,
  member,
  organization,
  user,
  verification,
} from './schema';

export type User = typeof user.$inferSelect;
// export type NewUser = typeof user.$inferInsert;

// export type Account = typeof account.$inferSelect;
// export type NewAccount = typeof account.$inferInsert;

// export type Organization = typeof organization.$inferSelect;
// export type NewOrganization = typeof organization.$inferInsert;

// export type Member = typeof member.$inferSelect;
// export type NewMember = typeof member.$inferInsert;

// export type Invitation = typeof invitation.$inferSelect;
// export type NewInvitation = typeof invitation.$inferInsert;

// export type Verification = typeof verification.$inferSelect;
// export type NewVerification = typeof verification.$inferInsert;
