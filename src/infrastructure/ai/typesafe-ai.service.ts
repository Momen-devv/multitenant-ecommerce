import { Inject, Injectable } from '@nestjs/common';
import type {
  Questions,
  SystemOneRequest,
  SystemOneResult,
  TypeSafeClient,
} from '@typesafe-ai/sdk';
import { AiService } from '@/common/abstracts';
import { TYPESAFE_CLIENT } from './providers/typesafe-client.provider';

@Injectable()
export class TypeSafeAiService extends AiService {
  constructor(
    @Inject(TYPESAFE_CLIENT)
    private readonly typesafeClient: TypeSafeClient,
  ) {
    super();
  }

  decide<const Q extends Questions>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResult<Q>> {
    return this.typesafeClient.systemOne(request);
  }
}
