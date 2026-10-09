import type { NextFunction, Request, Response } from 'express';
import { COOKIE } from '../services/cookies.js';
import { verifyAccessToken } from '../services/tokens.js';
import { unauthorized } from '../utils/errors.js';

/** Rejects the request unless it carries a valid, unexpired access token cookie. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const userId = verifyAccessToken(req.cookies?.[COOKIE.access]);
  if (!userId) return next(unauthorized());
  req.userId = userId;
  next();
}

/** For controllers that sit behind requireAuth. */
export function uid(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
