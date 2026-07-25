import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @Length(3, 50)
  @IsNotEmpty()
  name!: string;
}
