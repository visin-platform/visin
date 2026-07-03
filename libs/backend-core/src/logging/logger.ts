import winston from 'winston';

const levels = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };

winston.addColors({ error: 'red', warn: 'yellow', info: 'green', http: 'magenta', debug: 'white' });

function level(): string {
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${rest}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Structured logger for all backend services, replacing scattered
 * `console.log`/`console.error` calls. Human-readable + colorized outside
 * production, JSON (for log aggregation) in production. Always writes to
 * stdout/stderr — Docker/compose captures that directly, no file transport
 * needed.
 */
export const logger = winston.createLogger({
  level: level(),
  levels,
  format: process.env.NODE_ENV === 'production' ? jsonFormat : consoleFormat,
  transports: [new winston.transports.Console()]
});
