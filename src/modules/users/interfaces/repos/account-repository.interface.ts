import type { User } from '@/infrastructure/database/schema/schema.types';

export interface IAccountRepository {
  findByEmail(email: string): Promise<Partial<User> | undefined>;
  updateUser(userId: string, data: Partial<User>): Promise<void>;
  deleteInactiveAccountsBefore(cutoffDate: Date): Promise<number>;
}
