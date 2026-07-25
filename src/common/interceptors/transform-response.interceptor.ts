import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '@/common/decorators/response-message.decorator';
import { SKIP_RESPONSE_TRANSFORM_KEY } from '@/common/decorators/skip-response-transform.decorator';
import { getCorrelationId } from '../context/request-context';

export interface SuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T | null;
  timestamp: string;
  path: string;
  correlationId?: string;
}

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T> | T> {
    const skip = this.reflector.get<boolean>(
      SKIP_RESPONSE_TRANSFORM_KEY,
      context.getHandler(),
    );

    if (skip) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const message =
      this.reflector.get<string>(RESPONSE_MESSAGE_KEY, context.getHandler()) ??
      'Operation completed successfully';

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        statusCode: response.statusCode,
        message,
        data: data ?? null,
        timestamp: new Date().toISOString(),
        path: request.url,
        correlationId: getCorrelationId(),
      })),
    );
  }
}
