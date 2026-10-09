import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';
import { randomToken, refreshTtlMs } from './tokens.js';

/**
 * In production the cookie names use the `__Host-` prefix where possible: the browser then refuses
 * them unless they are Secure, set by this exact host and scoped to "/", which blocks a sibling
 * subdomain from planting or overwriting them.
 */
export const COOKIE = {
  access: env.isProd ? '__Host-tf_at' : 'tf_at',
  refresh: env.isProd ? '__Secure-tf_rt' : 'tf_rt',
  csrf: env.isProd ? '__Host-tf_csrf' : 'tf_csrf',
};

const base = (): CookieOptions => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.COOKIE_SAMESITE,
});

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): string {
  res.cookie(COOKIE.access, accessToken, { ...base(), path: '/', maxAge: env.ACCESS_TOKEN_TTL_MIN * 60 * 1000 });
  // The refresh cookie only travels to the auth endpoints, never with ordinary API calls.
  res.cookie(COOKIE.refresh, refreshToken, { ...base(), path: '/api/auth', maxAge: refreshTtlMs() });
  return setCsrfCookie(res);
}

/** Double-submit CSRF token: kept in a cookie and also returned in the body for the app to send back as a header. */
export function setCsrfCookie(res: Response): string {
  const token = randomToken(24);
  res.cookie(COOKIE.csrf, token, { ...base(), path: '/', maxAge: refreshTtlMs() });
  return token;
}

export function clearAuthCookies(res: Response): void {
  const b = base();
  res.clearCookie(COOKIE.access, { ...b, path: '/' });
  res.clearCookie(COOKIE.refresh, { ...b, path: '/api/auth' });
  res.clearCookie(COOKIE.csrf, { ...b, path: '/' });
}
