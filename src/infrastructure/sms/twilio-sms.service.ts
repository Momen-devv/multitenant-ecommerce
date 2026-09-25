import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import twilio, { type Twilio } from 'twilio';
import { SmsService } from '@/common/abstracts';
import { smsConfig } from '@/core/config';
import { LoggerService } from '@/infrastructure/logger/logger.service';

@Injectable()
export class TwilioSmsService extends SmsService {
  private readonly client?: Twilio;

  constructor(
    @Inject(smsConfig.KEY)
    private readonly configuration: ConfigType<typeof smsConfig>,
    private readonly logger: LoggerService,
  ) {
    super();

    if (
      this.configuration.twilioAccountSid &&
      this.configuration.twilioAuthToken
    ) {
      this.client = twilio(
        this.configuration.twilioAccountSid,
        this.configuration.twilioAuthToken,
      );
    }
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.client || !this.configuration.twilioFrom) {
      const error = new Error('Twilio SMS is not configured');
      this.logger.error(error.message, error, SmsService.name);
      throw error;
    }

    try {
      const message = await this.client.messages.create({
        to,
        from: this.configuration.twilioFrom,
        body,
      });

      this.logger.log(
        `SMS sent successfully to ${to}. Message ID: ${message.sid}`,
        SmsService.name,
      );
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${to}.`, error, SmsService.name);
      throw error;
    }
  }
}
