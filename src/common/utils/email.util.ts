const EMAIL_PATTERN_SOURCE = '\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b';

export const EMAIL_PATTERN = new RegExp(EMAIL_PATTERN_SOURCE, 'i');

const EMAILS_PATTERN = new RegExp(EMAIL_PATTERN_SOURCE, 'gi');

export function extractEmail(command: string): string | undefined {
  return command.match(EMAIL_PATTERN)?.[0];
}

export function removeEmails(command: string): string {
  return command.replace(EMAILS_PATTERN, ' ');
}
