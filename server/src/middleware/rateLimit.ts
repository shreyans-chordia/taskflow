import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const json = (message: string) => ({ error: { code: 'RATE_LIMITED', message } });

/** A loose ceiling for the whole API, mainly against runaway scripts. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 10_000 : 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('Too many requests. Slow down for a minute.'),
});

/** Sign-in and sign-up are where password guessing happens, so they get a much tighter budget per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: json('Too many attempts. Try again in 15 minutes.'),
});

/**
 * Asking for a code always "succeeds" (forgot-password answers 200 for any email), so this limiter counts every
 * request. Together with the per-account hourly cap in services/otp.ts it stops an inbox from being flooded.
 */
export const codeEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('Too many codes requested. Try again in 15 minutes.'),
});
