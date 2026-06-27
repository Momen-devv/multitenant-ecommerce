import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from '@/infrastructure/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.enableShutdownHooks();
  app.useLogger(app.get(LoggerService));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
