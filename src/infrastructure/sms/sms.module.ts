import { Module } from '@nestjs/common';
import { SmsService } from '@/common/abstracts';
import { TwilioSmsService } from './twilio-sms.service';

@Module({
  providers: [
    {
      provide: SmsService,
      useClass: TwilioSmsService,
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
