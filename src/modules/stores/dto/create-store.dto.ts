import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  name!: string;

  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens only',
  })
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
