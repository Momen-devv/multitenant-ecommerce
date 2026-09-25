import { registerAs } from '@nestjs/config';

export default registerAs('typesafe', () => ({
  apiKey: process.env.TYPESAFE_API_KEY!,
  defaultModel: process.env.TYPESAFE_DEFAULT_MODEL!,
}));
