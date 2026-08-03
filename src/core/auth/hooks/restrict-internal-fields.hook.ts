import { Injectable } from '@nestjs/common';
import {
  BeforeHook,
  Hook,
  type AuthHookContext,
} from '@thallesp/nestjs-better-auth';
interface RestrictedBody {
  imageKey?: unknown;
  isActive?: unknown;
  [key: string]: unknown;
}

@Hook()
@Injectable()
export class RestrictInternalFieldsHook {
  @BeforeHook('/sign-up/email')
  handleSignUp(ctx: AuthHookContext) {
    const body = ctx.body as RestrictedBody;
    if (body.imageKey) delete body.imageKey;
    if (body.isActive) delete body.isActive;
    if (body.deactivatedAt) delete body.deactivatedAt;
  }
}
