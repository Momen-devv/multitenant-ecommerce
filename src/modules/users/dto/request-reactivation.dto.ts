import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestReactivationDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
