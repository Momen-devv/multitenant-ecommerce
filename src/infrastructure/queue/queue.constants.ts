export enum QueueNames {
  EMAIL = 'email',
  RESOURCE_CLEANUP = 'resource-cleanup',
  DATA_SYNC = 'data-sync',
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
    DELETE_ORPHANED_ORG: 'delete-orphaned-org',
  },
  DATA_SYNC: {
    SYNC_ORG_NAME: 'sync-org-name',
  },
} as const;

export type EmailJobName = (typeof JobNames.EMAIL)[keyof typeof JobNames.EMAIL];
export type ResourceCleanupJobName =
  (typeof JobNames.RESOURCE_CLEANUP)[keyof typeof JobNames.RESOURCE_CLEANUP];
export type DataSyncJobName =
  (typeof JobNames.DATA_SYNC)[keyof typeof JobNames.DATA_SYNC];
