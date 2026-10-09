import type { Request, Response } from 'express';
import { uid } from '../middleware/auth.js';
import { CategoryModel } from '../models/Category.js';
import { PriorityModel } from '../models/Priority.js';
import { RefreshTokenModel } from '../models/RefreshToken.js';
import { TaskModel } from '../models/Task.js';
import { UserModel } from '../models/User.js';
import { loginSchema, parse, signupSchema } from '../schemas/index.js';
import { COOKIE, clearAuthCookies, setAuthCookies, setCsrfCookie } from '../services/cookies.js';
import { dummyHash, hashPassword, verifyPassword } from '../services/passwords.js';
import { seedDefaults } from '../services/seed.js';
import { issueRefreshToken, revokeAllForUser, revokeRefreshToken, rotateRefreshToken, signAccessToken } from '../services/tokens.js';
import { AppError, conflict, notFound, unauthorized } from '../utils/errors.js';

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

async function startSession(req: Request, res: Response, userId: string) {
  const refresh = await issueRefreshToken(userId, undefined, req.get('user-agent') ?? '');
  return setAuthCookies(res, signAccessToken(userId), refresh);
}

/** GET /api/auth/csrf — hands out a CSRF token so the sign-in and sign-up forms can post. */
export function csrf(_req: Request, res: Response) {
  res.json({ csrfToken: setCsrfCookie(res) });
}

/** POST /api/auth/signup */
export async function signup(req: Request, res: Response) {
  const body = parse(signupSchema, req.body);
  if (await UserModel.exists({ email: body.email })) {
    throw conflict('This email already has a desk.', { email: 'This email already has a desk. Sign in instead.' });
  }
  const user = await UserModel.create({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password) });
  await seedDefaults(user._id);
  const csrfToken = await startSession(req, res, String(user._id));
  res.status(201).json({ user: user.toJSON(), csrfToken });
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response) {
  const body = parse(loginSchema, req.body);
  const user = await UserModel.findOne({ email: body.email }).select('+passwordHash +failedLogins +lockedUntil');
  if (!user) {
    await verifyPassword(body.password, await dummyHash()); // same work as a real check, so timing reveals nothing
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(429, 'LOCKED', `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  if (!(await verifyPassword(body.password, user.passwordHash))) {
    const failed = (user.failedLogins ?? 0) + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null } },
    );
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }
  if (user.failedLogins || user.lockedUntil) await UserModel.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null } });
  const csrfToken = await startSession(req, res, String(user._id));
  res.json({ user: user.toJSON(), csrfToken });
}

/** POST /api/auth/refresh — trades the refresh cookie for a new access token and a new refresh token. */
export async function refresh(req: Request, res: Response) {
  const result = await rotateRefreshToken(req.cookies?.[COOKIE.refresh], req.get('user-agent') ?? '');
  if (!result.ok) {
    clearAuthCookies(res);
    throw unauthorized(result.reason === 'reused' ? 'For your safety this session was ended. Please sign in again.' : 'Your session has ended. Please sign in again.');
  }
  const user = await UserModel.findById(result.userId);
  if (!user) {
    clearAuthCookies(res);
    throw unauthorized();
  }
  const csrfToken = setAuthCookies(res, signAccessToken(result.userId), result.refreshToken);
  res.json({ user: user.toJSON(), csrfToken });
}

/** POST /api/auth/logout — ends this device's session. */
export async function logout(req: Request, res: Response) {
  await revokeRefreshToken(req.cookies?.[COOKIE.refresh]);
  clearAuthCookies(res);
  res.status(204).end();
}

/** POST /api/auth/logout-all — ends every session of this account, on every device. */
export async function logoutAll(req: Request, res: Response) {
  await revokeAllForUser(uid(req));
  clearAuthCookies(res);
  res.status(204).end();
}

/** GET /api/auth/me — who is signed in. Also issues a fresh CSRF token for the app to keep in memory. */
export async function me(req: Request, res: Response) {
  const user = await UserModel.findById(uid(req));
  if (!user) throw unauthorized();
  res.json({ user: user.toJSON(), csrfToken: setCsrfCookie(res) });
}

/** DELETE /api/auth/me — deletes the account and everything in it. Needs the password again. */
export async function deleteAccount(req: Request, res: Response) {
  const { password } = parse(loginSchema.pick({ password: true }), req.body);
  const user = await UserModel.findById(uid(req)).select('+passwordHash');
  if (!user) throw notFound('Account');
  if (!(await verifyPassword(password, user.passwordHash))) throw unauthorized('That password does not match.');
  await Promise.all([
    TaskModel.deleteMany({ userId: user._id }),
    CategoryModel.deleteMany({ userId: user._id }),
    PriorityModel.deleteMany({ userId: user._id }),
    RefreshTokenModel.deleteMany({ userId: user._id }),
  ]);
  await user.deleteOne();
  clearAuthCookies(res);
  res.status(204).end();
}
