export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error === null || error === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error (unserializable)';
  }
}
