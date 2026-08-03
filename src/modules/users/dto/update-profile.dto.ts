import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'The updated name for the user',
    example: 'Ahmed Ali',
  })
  @IsString()
  @Length(3, 50)
  @IsNotEmpty()
  name!: string;
}
