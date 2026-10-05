import type { CurrentUser } from '@/modules/auth/types/auth.types';

export type ThrottledRequest = {
  ip: string;
  session?: CurrentUser;
};
