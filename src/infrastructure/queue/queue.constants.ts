export enum QueueNames {
  EMAIL = 'email',
  RESOURCE_CLEANUP = 'resource-cleanup',
}

export const JobNames = {
  EMAIL: {
    WELCOME: 'welcome',
    RESET_PASSWORD: 'reset-password',
    VERIFICATION: 'verification',
    ORDER_CONFIRMATION: 'order-confirmation',
  },
  RESOURCE_CLEANUP: {
    DELETE_ORPHANED_FILE: 'delete-orphaned-file',
    DELETE_OLD_FILE: 'delete-old-file',
  },
};
