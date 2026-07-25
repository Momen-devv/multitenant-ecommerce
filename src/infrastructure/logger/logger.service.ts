import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { Logger, createLogger } from 'winston';
import { loggerConfig } from '@/infrastructure/logger/logger.config';
import { getErrorStack } from '@/common/utils/error';
import { getCorrelationId } from '@/common/context/request-context';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger(loggerConfig);
  }

  log(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, {
      context,
      correlationId: getCorrelationId(),
      ...meta,
    });
  }

  error(message: string, trace?: unknown, context?: string): void {
    this.logger.error(message, {
      trace: getErrorStack(trace),
      context,
      correlationId: getCorrelationId(),
    });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context, correlationId: getCorrelationId() });
  }
}
