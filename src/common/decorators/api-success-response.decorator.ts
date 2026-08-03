import { applyDecorators, Type, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { SuccessResponseDto } from '@/common/dto/success-response.dto';

export function ApiSuccessResponse<TModel extends Type<unknown>>(options: {
  status?: HttpStatus;
  description: string;
  model?: TModel;
}) {
  const { status = HttpStatus.OK, description, model } = options;

  return applyDecorators(
    ApiExtraModels(SuccessResponseDto, ...(model ? [model] : [])),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(SuccessResponseDto) },
          {
            properties: {
              data: model
                ? { $ref: getSchemaPath(model) }
                : { type: 'object', nullable: true, example: null },
            },
          },
        ],
      },
    }),
  );
}
