export const ASSISTANT_REPOSITORY = Symbol('ASSISTANT_REPOSITORY');

export interface IAssistantRepository {
  findUserIdByEmail(email: string): Promise<string | undefined>;
  findMemberIdByEmail(
    organizationId: string,
    email: string,
  ): Promise<string | undefined>;
  findInvitationIdByEmail(
    organizationId: string,
    email: string,
  ): Promise<string | undefined>;
}
