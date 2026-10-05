import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from '@/infrastructure/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(LoggerService));
  app.enableShutdownHooks();
  process.send?.('ready');
}

bootstrap().catch((error) => {
  const logger = new LoggerService();
  logger.error('Failed to bootstrap the scheduler', error);
  process.exit(1);
});
