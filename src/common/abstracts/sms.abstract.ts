export abstract class SmsService {
  abstract sendSms(to: string, body: string): Promise<void>;
}
