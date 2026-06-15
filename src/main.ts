import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log(`Server is running on port ${process.env.NODE_ENV}`);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
