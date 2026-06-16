import { Environment } from '@/common/enums';
import { format, transports, LoggerOptions } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const IS_PRODUCTION: boolean = process.env.NODE_ENV === Environment.Production;
const LOG_DIR: string = 'logs';
// const IS_TEST = process.env.NODE_ENV === Environment.Test;

export const loggerConfig: LoggerOptions = {
  level: 'info',
  //   silent: IS_TEST,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json(),
  ),
  defaultMeta: { service: 'App' },

  // Application logging
  transports: [
    new transports.Console({
      format: IS_PRODUCTION
        ? format.json()
        : format.combine(format.colorize({ all: true }), format.simple()),
      handleExceptions: true,
      handleRejections: true,
    }),

    new DailyRotateFile({
      dirname: `${LOG_DIR}/application`,
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],

  // Exception and rejection logging
  exceptionHandlers: [
    new DailyRotateFile({
      dirname: `${LOG_DIR}/exceptions`,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],

  rejectionHandlers: [
    new DailyRotateFile({
      dirname: `${LOG_DIR}/rejections`,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],

  //   exitOnError: true,
};
