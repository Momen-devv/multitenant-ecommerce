export const ASSISTANT_REPOSITORY = Symbol('ASSISTANT_REPOSITORY');

export interface IAssistantRepository {
  findUserIdByEmail(email: string): Promise<string | undefined>;
  createCommand(command: string): Promise<never>;
}
