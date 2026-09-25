import type { CurrentUser } from '@/core/auth/auth.types';

export type ThrottledRequest = {
  ip: string;
  session?: CurrentUser;
};
