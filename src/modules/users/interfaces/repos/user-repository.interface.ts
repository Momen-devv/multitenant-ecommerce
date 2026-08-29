import type { User } from '@/infrastructure/database/schema/schema.types';

export interface IUserRepository {
  findById(userId: string): Promise<User | undefined>;
  countPlatformSuperAdmins(): Promise<number>;
}
