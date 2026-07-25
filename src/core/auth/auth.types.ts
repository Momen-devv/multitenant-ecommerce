import type { auth } from '@/core/auth/auth';

export type CurrentUser = typeof auth.$Infer.Session;
