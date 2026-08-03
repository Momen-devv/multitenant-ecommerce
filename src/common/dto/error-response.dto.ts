import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: '2026-08-04T12:34:56.789Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/account/reactivate/confirm' })
  path!: string;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  correlationId!: string;

  @ApiProperty({
    description:
      'Error message. Can be a single string or an array of validation errors.',
    oneOf: [
      { type: 'string', example: 'Invalid or expired reactivation token' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['email must be a valid email'],
      },
    ],
  })
  message!: string | string[];
}
