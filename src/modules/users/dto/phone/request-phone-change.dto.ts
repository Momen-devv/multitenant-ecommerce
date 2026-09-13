import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

export class RequestPhoneChangeDto {
  @ApiProperty({
    description: 'New phone number in E.164 format',
    example: '+201234567890',
  })
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber!: string;
}
