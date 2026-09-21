import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AssistantCommandDto {
  @ApiProperty({
    description: 'Natural-language command for the role-aware assistant',
    example: 'Show me the sales of my store this month',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  command!: string;
}
