import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class ConfirmReactivationDto {
  @ApiProperty({
    description: 'The reactivation token sent to the user via email',
    example:
      '1f504f9dcb951ade38f32bfe285b655e650437ce74f787e5eb8dc5f1931e55e9&amp',
  })
  @IsString()
  @Length(64, 64)
  token!: string;

  @ApiProperty({
    description: 'The user id associated with the reactivation token',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @Length(36, 36)
  @IsUUID('7')
  userId!: string;
}
