import { ConfigService } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@/database/database.constants';
import { drizzle } from 'drizzle-orm/node-postgres/driver';
import { Pool } from 'pg';
import * as schema from './schema';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
        });
        return drizzle(pool, {
          schema,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
