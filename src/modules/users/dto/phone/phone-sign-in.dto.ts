import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class PhoneSignInDto {
  @ApiProperty({ example: '+201234567890' })
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber!: string;

  @ApiProperty({ example: 'a-secure-password' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({
    description: 'Keep the session beyond the browser session.',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
