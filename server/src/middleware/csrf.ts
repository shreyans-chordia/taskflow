import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { COOKIE } from '../services/cookies.js';
import { safeEqual } from '../services/tokens.js';
import { AppError, forbidden } from '../utils/errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Two layers against cross-site request forgery on every state-changing request:
 * 1. If the browser sent an Origin header, it must be one of ours.
 * 2. The X-CSRF-Token header must match the CSRF cookie. A page on another site can make the
 *    browser send our cookies, but it cannot read the token, so it cannot set the header.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !env.corsOrigins.includes(origin)) return next(forbidden('Request blocked: unknown origin.'));
  const cookie = req.cookies?.[COOKIE.csrf];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) return next(new AppError(403, 'CSRF', 'Request blocked: missing or invalid CSRF token. Reload and try again.'));
  next();
}
