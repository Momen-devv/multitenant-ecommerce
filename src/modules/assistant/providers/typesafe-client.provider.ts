import { type Provider } from '@nestjs/common';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { ConfigType } from '@nestjs/config';
import { typesafeConfig } from '@/core/config';

export const TYPESAFE_CLIENT = Symbol('TYPESAFE_CLIENT');

export const typesafeClientProvider: Provider = {
  provide: TYPESAFE_CLIENT,
  inject: [typesafeConfig.KEY],
  useFactory: (configuration: ConfigType<typeof typesafeConfig>) => {
    return new TypeSafeClient({
      apiKey: configuration.apiKey,
      defaultModel: configuration.defaultModel,
    });
  },
};
