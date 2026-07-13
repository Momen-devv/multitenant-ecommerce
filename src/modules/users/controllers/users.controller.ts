import { Body, Controller, Delete, Headers, Patch, Post } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { UpdateProfileDto } from '../dto';

@Controller('profile')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch()
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Headers() headers: Record<string, string>,
  ) {
    return await this.usersService.updateProfile(dto, headers);
  }

  @Post('image')
  uploadProfileImage() {}

  @Delete('image')
  deleteProfileImage() {}

  @Post('activate')
  activateAccount() {}

  @Post('deactivate')
  deactivateAccount() {}
}
