import { ConfigType } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';
import { DATABASE_CONNECTION } from './database.constants';
import { drizzle } from 'drizzle-orm/node-postgres/driver';
import { Pool } from 'pg';
import * as schema from './schema';
import databaseConfig from '@/core/config/database.config';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configuration: ConfigType<typeof databaseConfig>) => {
        const pool = new Pool({
          connectionString: configuration.url,
        });
        return drizzle(pool, {
          schema,
        });
      },
      inject: [databaseConfig.KEY],
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
