import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from '@/common/dto';

export function ApiErrorResponse(
  status: HttpStatus,
  description: string,
  example?: unknown,
) {
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ErrorResponseDto) },
          { properties: { statusCode: { example: status } } },
        ],
        ...(example ? { example } : {}),
      },
    }),
  );
}
