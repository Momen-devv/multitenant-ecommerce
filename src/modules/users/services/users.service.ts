import { Injectable } from '@nestjs/common';
import { UpdateProfileDto } from '../dto';
import auth from '@/core/auth/auth';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

@Injectable()
export class UsersService {
  constructor(private readonly authService: AuthService<typeof auth>) {}

  async updateProfile(dto: UpdateProfileDto, headers: Record<string, string>) {
    return await this.authService.api.updateUser({
      body: { name: dto.name },
      headers: fromNodeHeaders(headers),
    });
  }
}
