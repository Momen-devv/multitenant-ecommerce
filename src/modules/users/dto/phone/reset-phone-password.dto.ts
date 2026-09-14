import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ResetPhonePasswordDto {
  @ApiProperty({ example: '+201234567890' })
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'otp must be a six-digit OTP' })
  otp!: string;

  @ApiProperty({ example: 'a-new-secure-password' })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}
