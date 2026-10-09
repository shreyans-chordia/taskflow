import { pino } from 'pino';
import { env } from '../config/env.js';

/** Structured JSON logs. Secrets that could end up in a log line are redacted at the source. */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]', '*.password', '*.passwordHash'],
    censor: '[redacted]',
  },
});
