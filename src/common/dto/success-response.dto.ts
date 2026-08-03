import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto<T> {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ example: 'Operation completed successfully' })
  message!: string;

  data!: T | null;

  @ApiProperty({ example: '2026-08-04T12:34:56.789Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/account/deactivate' })
  path!: string;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  correlationId!: string;
}
