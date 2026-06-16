import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { Logger, createLogger } from 'winston';
import { loggerConfig } from '@/logger/logger.config';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger(loggerConfig);
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }
}
