export abstract class MailService {
  abstract sendEmail(
    to: string,
    subject: string,
    html: string,
    options?: { idempotencyKey?: string },
  ): Promise<{ providerMessageId?: string }>;
}
