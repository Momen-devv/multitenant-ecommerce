export enum QueueNames {
  EMAIL = 'email',
  RESOURCE_CLEANUP = 'resource-cleanup',
}

export const JobNames = {
  EMAIL: {
    WELCOME: 'welcome',
    RESET_PASSWORD: 'reset-password',
    VERIFICATION: 'verification',
    ACCOUNT_DEACTIVATED: 'account-deactivated',
    ACCOUNT_REACTIVATION: 'account-reactivation',
  },
  RESOURCE_CLEANUP: {
    DELETE_ORPHANED_FILE: 'delete-orphaned-file',
    DELETE_OLD_FILE: 'delete-old-file',
  },
} as const;

export type EmailJobName = (typeof JobNames.EMAIL)[keyof typeof JobNames.EMAIL];
export type ResourceCleanupJobName =
  (typeof JobNames.RESOURCE_CLEANUP)[keyof typeof JobNames.RESOURCE_CLEANUP];
