import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

export class ConfirmPhoneChangeDto {
  @ApiProperty({
    description: 'Phone number in E.164 format that received the code',
    example: '+201234567890',
  })
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber!: string;

  @ApiProperty({
    description: 'Six-digit SMS verification code',
    example: '123456',
  })
  @Matches(/^\d{6}$/, { message: 'code must be a six-digit OTP' })
  code!: string;
}
