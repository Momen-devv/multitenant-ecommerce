import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import { sha256Hex } from '@/common/utils';

@Injectable()
export class SecureTokenService {
  generate(bytes = 32): { token: string; hashedToken: string } {
    const token = randomBytes(bytes).toString('hex');
    const hashedToken = this.hash(token);
    return { token, hashedToken };
  }

  hash(token: string): string {
    return sha256Hex(token);
  }

  verify(token: string, hashedToken: string): boolean {
    const candidateHash = this.hash(token);

    if (candidateHash.length !== hashedToken.length) return false;

    return timingSafeEqual(
      Buffer.from(candidateHash),
      Buffer.from(hashedToken),
    );
  }
}
