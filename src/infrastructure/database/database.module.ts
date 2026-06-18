import { ConfigType } from '@nestjs/config';
import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import {
  DATABASE_POOL,
  DATABASE,
} from '@/common/constants/injection-tokens.constants';
import { drizzle } from 'drizzle-orm/node-postgres/driver';
import { Pool } from 'pg';
import * as schema from './schema';
import databaseConfig from '@/core/config/database.config';
import { LoggerService } from '../logger/logger.service';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [databaseConfig.KEY, LoggerService],
      useFactory: (
        config: ConfigType<typeof databaseConfig>,
        logger: LoggerService,
      ) => {
        const pool = new Pool({
          connectionString: config.url,
          max: 10,
          min: 2,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          maxUses: 7500,
        });

        pool.on('error', (err) => {
          logger.error(
            'Unexpected error on idle PostgreSQL client',
            err.stack,
            'DatabasePool',
          );
        });

        return pool;
      },
    },
    {
      provide: DATABASE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => {
        return drizzle(pool, { schema });
      },
    },
  ],

  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationShutdown() {
    this.logger.log('Closing database pool...', DatabaseModule.name);
    try {
      await this.pool.end();
      this.logger.log('Database pool closed gracefully.', DatabaseModule.name);
    } catch (err) {
      this.logger.error(
        'Error closing database pool',
        (err as Error).stack,
        DatabaseModule.name,
      );
    }
  }
}
