import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from '@/infrastructure/logger/logger.service';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: true,
    }),
  );

  app.enableShutdownHooks();

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const config = new DocumentBuilder()
    .setTitle('Multitenant E-commerce API')
    .setDescription(
      'API documentation for the Multitenant E-commerce application',
    )
    .setVersion('1.0')
    .addTag('Multitenant E-commerce')
    .addCookieAuth('mte.session_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'mte.session_token',
    })
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  app.useLogger(app.get(LoggerService));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error) => {
  const logger = new LoggerService();
  logger.error('Failed to bootstrap the application', error);
  process.exit(1);
});
