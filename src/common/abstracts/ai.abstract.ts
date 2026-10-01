import type {
  Questions,
  SystemOneRequest,
  SystemOneResult,
} from '@typesafe-ai/sdk';

export abstract class AiService {
  abstract decide<const Q extends Questions>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResult<Q>>;
}
