import { HttpException, HttpStatus } from '@nestjs/common';

export class CodedHttpError extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ message, code, ...(details ? { details } : {}) }, status);
  }
}
