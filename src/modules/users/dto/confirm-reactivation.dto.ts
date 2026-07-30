import { IsString, IsUUID, Length } from 'class-validator';

export class ConfirmReactivationDto {
  @IsString()
  @Length(64, 64)
  token!: string;

  @IsUUID('7')
  userId!: string;
}
