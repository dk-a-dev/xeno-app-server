import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  level: env.LOG_LEVEL
});
