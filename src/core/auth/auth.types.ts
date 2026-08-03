import type { Auth } from '@/core/auth/auth';

export type CurrentUser = Auth['$Infer']['Session'];
