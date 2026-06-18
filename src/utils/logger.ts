import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isProduction = process.env['NODE_ENV'] === 'production';

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProduction
      ? combine(timestamp(), errors({ stack: true }), json())
      : combine(colorize(), simple()),
  }),
];

if (isProduction) {
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '7d',
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
  );
}

export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: combine(timestamp(), errors({ stack: true }), json()),
  defaultMeta: { service: 'conn3ct-pnl' },
  transports,
  exceptionHandlers: isProduction
    ? [new DailyRotateFile({ filename: path.join('logs', 'exceptions-%DATE%.log'), datePattern: 'YYYY-MM-DD', maxFiles: '7d' })]
    : [new winston.transports.Console()],
  rejectionHandlers: isProduction
    ? [new DailyRotateFile({ filename: path.join('logs', 'rejections-%DATE%.log'), datePattern: 'YYYY-MM-DD', maxFiles: '7d' })]
    : [new winston.transports.Console()],
});

export function createChildLogger(module: string): winston.Logger {
  return logger.child({ module });
}
