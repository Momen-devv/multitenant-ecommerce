import { Module } from '@nestjs/common';
import { ResendMailService } from './resend.service';
import { MailService } from '@/common/abstracts';

@Module({
  providers: [
    {
      provide: MailService,
      useClass: ResendMailService,
    },
  ],

  exports: [MailService],
})
export class MailModule {}
