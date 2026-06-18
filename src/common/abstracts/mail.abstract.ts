export abstract class MailService {
  abstract sendEmail(to: string, subject: string, html: string): Promise<void>;
}
