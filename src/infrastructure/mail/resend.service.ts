import { Inject, Injectable } from '@nestjs/common';
import { mailConfig } from '@/core/config';
import { Resend } from 'resend';
import type { ConfigType } from '@nestjs/config';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { MailService } from '@/common/abstracts';
import { MailDeliveryError } from '@/common/errors/mail-delivery.error';

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

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    options?: { idempotencyKey?: string },
  ) {
    const { data, error } = await this.resend.emails.send(
      {
        from: this.configuration.mailFrom,
        to,
        subject,
        html,
      },
      options,
    );

    if (error) {
      this.logger.error(
        'Email provider rejected a request.',
        error.name,
        MailService.name,
      );
      throw new MailDeliveryError(error.name, error.statusCode ?? null);
    }

    this.logger.log(`Email provider accepted message ${data.id}`);
    return { providerMessageId: data.id };
  }
}
