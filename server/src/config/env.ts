import 'dotenv/config';
import { z } from 'zod';

/**
 * All configuration comes from environment variables and is validated once at start-up.
 * The process refuses to boot with a weak or missing secret rather than running insecurely.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  /** Comma-separated list of browser origins allowed to call the API with cookies. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  /** "lax" when the web app and API share a site; "none" (production only, needs HTTPS) when they live on different domains. */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Set when the API sits behind a reverse proxy (Render, Railway, Nginx) so rate limits see real client IPs. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /* ---------- email (one-time codes for two-step sign-in and password reset) ---------- */
  /**
   * smtp: real email (required in production). console: the code is printed in the API log (local development).
   * file: each email is written as JSON to MAIL_OUTBOX_DIR (end-to-end tests). memory: kept in an array (unit tests).
   * Left empty, it picks smtp in production, memory in tests and console otherwise.
   */
  MAIL_TRANSPORT: z.enum(['smtp', 'console', 'file', 'memory']).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /** "true" for port 465 (TLS from the first byte); "false" for 587, which upgrades with STARTTLS. */
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('TaskFlow <no-reply@taskflow.local>'),
  MAIL_OUTBOX_DIR: z.string().default('.mail-outbox'),
  /** How long a one-time code stays valid. */
  OTP_TTL_MIN: z.coerce.number().int().min(2).max(30).default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${lines}`);
  process.exit(1);
}

if (parsed.data.COOKIE_SAMESITE === 'none' && parsed.data.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.error('COOKIE_SAMESITE=none needs HTTPS, so it is only allowed when NODE_ENV=production.');
  process.exit(1);
}

const mailTransport =
  parsed.data.MAIL_TRANSPORT ?? (parsed.data.NODE_ENV === 'production' ? 'smtp' : parsed.data.NODE_ENV === 'test' ? 'memory' : 'console');

if (parsed.data.NODE_ENV === 'production' && mailTransport !== 'smtp') {
  // eslint-disable-next-line no-console
  console.error('Production must send real email: set MAIL_TRANSPORT=smtp (or leave it empty) and the SMTP_* variables.');
  process.exit(1);
}
if (mailTransport === 'smtp' && !(parsed.data.SMTP_HOST && parsed.data.SMTP_USER && parsed.data.SMTP_PASS)) {
  // eslint-disable-next-line no-console
  console.error('MAIL_TRANSPORT=smtp needs SMTP_HOST, SMTP_USER and SMTP_PASS. Sign-in codes cannot be sent without them.');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  mailTransport,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
};
export type Env = typeof env;
