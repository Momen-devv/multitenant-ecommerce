import { Inject, Injectable } from '@nestjs/common';
import { mailConfig } from '@/core/config';
import { Resend } from 'resend';
import type { ConfigType } from '@nestjs/config';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { MailService } from '@/common/abstracts';

@Injectable()
export class ResendMailService extends MailService {
  private readonly resend: Resend;

  constructor(
    @Inject(mailConfig.KEY)
    private readonly configuration: ConfigType<typeof mailConfig>,
    private readonly logger: LoggerService,
  ) {
    super();
    this.resend = new Resend(this.configuration.resendApiKey);
  }

  async sendEmail(to: string, subject: string, html: string) {
    const { data, error } = await this.resend.emails.send({
      from: this.configuration.mailFrom,
      to,
      subject,
      html,
    });

    if (error) {
      this.logger.error(
        `Failed to send email to ${to}.`,
        error.message,
        MailService.name,
      );
      throw new Error(error.message); // For Bullmq to handle the error and retry sending the email
    }

    this.logger.log(`Email sent successfully to ${to}. Message ID: ${data.id}`);
  }
}
