import {
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { CurrentUser } from '@/core/auth/auth.types';
import { CodedHttpError } from '@/common/errors';

/** Enforces account availability from the session AuthGuard has just validated. */
@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      session?: CurrentUser;
    }>();
    const currentUser = request.session?.user;

    // AuthGuard has already rejected protected requests with no session.
    // Public and optional-auth requests may continue anonymously.
    if (!currentUser?.id) return true;

    const banExpires = currentUser.banExpires
      ? new Date(currentUser.banExpires)
      : null;
    const currentlyBanned =
      currentUser?.banned && (!banExpires || banExpires > new Date());

    if (currentUser.isActive === false || currentlyBanned) {
      throw new CodedHttpError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_UNAVAILABLE',
        'This account is not available.',
      );
    }
    return true;
  }
}
