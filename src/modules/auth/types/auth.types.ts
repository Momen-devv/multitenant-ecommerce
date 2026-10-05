import type { Auth } from '@/modules/auth/config/auth';

export type CurrentUser = Auth['$Infer']['Session'];
