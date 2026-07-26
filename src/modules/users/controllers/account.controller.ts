import { Controller, Post } from '@nestjs/common';

@Controller('account')
export class AccountController {
  constructor() {}
  @Post('activate')
  activateAccount() {}

  @Post('deactivate')
  deactivateAccount() {}
}
