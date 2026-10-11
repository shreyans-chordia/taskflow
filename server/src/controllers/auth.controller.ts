import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { uid } from '../middleware/auth.js';
import { CategoryModel } from '../models/Category.js';
import { OtpChallengeModel } from '../models/OtpChallenge.js';
import { PriorityModel } from '../models/Priority.js';
import { RefreshTokenModel } from '../models/RefreshToken.js';
import { TaskModel } from '../models/Task.js';
import { UserModel } from '../models/User.js';
import { forgotPasswordSchema, loginSchema, otpVerifySchema, parse, resetPasswordSchema, signupSchema } from '../schemas/index.js';
import { COOKIE, clearAuthCookies, clearOtpCookie, setAuthCookies, setCsrfCookie, setOtpCookie } from '../services/cookies.js';
import { codeEmail, passwordChangedEmail, sendMail } from '../services/mailer.js';
import {
  claimCodeEmail,
  createChallenge,
  maskEmail,
  OTP_RESEND_COOLDOWN_SEC,
  resendChallenge,
  verifyChallenge,
  type OtpPurpose,
  type VerifyResult,
} from '../services/otp.js';
import { dummyHash, hashPassword, verifyPassword } from '../services/passwords.js';
import { seedDefaults } from '../services/seed.js';
import { issueRefreshToken, revokeAllForUser, revokeRefreshToken, rotateRefreshToken, sha256, signAccessToken } from '../services/tokens.js';
import { AppError, conflict, notFound, unauthorized } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

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

/** POST /api/auth/login — step one of two: checks the password, then emails a one-time code. */
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

  // AUTH-6: the right password only opens step two. A one-time code goes to the account's email,
  // and the session starts once that code comes back (POST /auth/login/verify).
  if (!(await claimCodeEmail(user._id))) throw tooManyCodes();
  const { token, code } = await createChallenge('login', user._id);
  try {
    await sendMail(codeEmail(user.email, user.name, code, 'login'));
  } catch (err) {
    await OtpChallengeModel.deleteOne({ tokenHash: sha256(token) });
    logger.error({ err }, 'Could not send a sign-in code');
    throw mailFailed();
  }
  setOtpCookie(res, token);
  res.json(challengeBody(user.email));
}

/* ---------- one-time codes: second sign-in step and password reset ---------- */

const challengeBody = (email: string) => ({
  otpRequired: true,
  email: maskEmail(email),
  expiresInSec: env.OTP_TTL_MIN * 60,
  resendInSec: OTP_RESEND_COOLDOWN_SEC,
});
const tooManyCodes = () => new AppError(429, 'OTP_LIMIT', 'Too many codes were sent to this account. Try again in an hour.');
const mailFailed = () => new AppError(503, 'MAIL_FAILED', 'We could not send the code just now. Try again in a minute.');

/** A wrong code keeps the challenge alive; an expired or exhausted one is gone, so its cookie goes too. */
function otpError(res: Response, result: Exclude<VerifyResult, { ok: true }>): AppError {
  if (result.reason === 'invalid') {
    const left = result.attemptsLeft;
    const message = `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
    return new AppError(401, 'OTP_INVALID', message, { code: message });
  }
  clearOtpCookie(res);
  return new AppError(401, 'OTP_EXPIRED', 'That code has expired or had too many wrong tries. Start again to get a new one.');
}

/**
 * Sends a code without making the request wait for it. Used where the answer must not depend on whether
 * the account exists: "Forgot password?" responds the same, in the same time, for every email.
 */
function sendInBackground(userId: string, purpose: OtpPurpose, code: string): void {
  void (async () => {
    try {
      const user = await UserModel.findById(userId);
      if (!user) return;
      if (!(await claimCodeEmail(user._id))) {
        logger.warn({ userId }, 'Code email skipped: hourly limit reached');
        return;
      }
      await sendMail(codeEmail(user.email, user.name, code, purpose));
    } catch (err) {
      logger.error({ err }, 'Could not send a code email');
    }
  })();
}

/** POST /api/auth/login/verify — step two: the code from the email starts the session. */
export async function verifyLogin(req: Request, res: Response) {
  const { code } = parse(otpVerifySchema, req.body);
  const result = await verifyChallenge(req.cookies?.[COOKIE.otp], 'login', code);
  if (!result.ok) throw otpError(res, result);
  clearOtpCookie(res);
  const user = await UserModel.findById(result.userId);
  if (!user) throw unauthorized();
  const csrfToken = await startSession(req, res, result.userId);
  res.json({ user: user.toJSON(), csrfToken });
}

/** POST /api/auth/otp/resend — a fresh code for the pending sign-in or reset; the previous code stops working. */
export async function resendCode(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE.otp];
  const result = await resendChallenge(token);
  if (!result.ok) {
    if (result.reason === 'cooldown') {
      throw new AppError(429, 'OTP_COOLDOWN', `Wait ${result.waitSec} second${result.waitSec === 1 ? '' : 's'} before asking for another code.`);
    }
    clearOtpCookie(res);
    throw result.reason === 'limit'
      ? new AppError(429, 'OTP_LIMIT', 'That was the last code for this attempt. Start again to get a new one.')
      : new AppError(401, 'OTP_EXPIRED', 'That code has expired. Start again to get a new one.');
  }
  if (result.userId && result.purpose === 'login') {
    // The person already proved the password, so they hear about delivery problems.
    const user = await UserModel.findById(result.userId);
    if (!user) throw unauthorized();
    if (!(await claimCodeEmail(user._id))) throw tooManyCodes();
    try {
      await sendMail(codeEmail(user.email, user.name, result.code, 'login'));
    } catch (err) {
      logger.error({ err }, 'Could not resend a sign-in code');
      throw mailFailed();
    }
  } else if (result.userId) {
    sendInBackground(result.userId, result.purpose, result.code);
  }
  setOtpCookie(res, token!); // the challenge clock restarted, so the cookie's does too
  res.json({ expiresInSec: env.OTP_TTL_MIN * 60, resendInSec: OTP_RESEND_COOLDOWN_SEC });
}

/**
 * POST /api/auth/password/forgot — AUTH-8. Always answers 200 with the same body: whether the email has
 * an account is never revealed. A code is emailed only when it does.
 */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = parse(forgotPasswordSchema, req.body);
  const user = await UserModel.findOne({ email });
  const { token, code } = await createChallenge('reset', user?._id ?? null);
  setOtpCookie(res, token);
  if (user) sendInBackground(String(user._id), 'reset', code);
  res.json(challengeBody(email));
}

/**
 * POST /api/auth/password/reset — AUTH-9. A valid code sets the new password, unlocks the account, signs out
 * every other device, emails a notice, and signs this browser in (the person has just proved the inbox).
 */
export async function resetPassword(req: Request, res: Response) {
  // The new password is validated first, so a weak one does not cost a code attempt.
  const body = parse(resetPasswordSchema, req.body);
  const result = await verifyChallenge(req.cookies?.[COOKIE.otp], 'reset', body.code);
  if (!result.ok) throw otpError(res, result);
  clearOtpCookie(res);
  const user = await UserModel.findById(result.userId);
  if (!user) throw unauthorized();

  await UserModel.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(body.password), failedLogins: 0, lockedUntil: null } });
  await revokeAllForUser(result.userId);
  await OtpChallengeModel.deleteMany({ userId: user._id });
  sendMail(passwordChangedEmail(user.email, user.name)).catch((err) => logger.error({ err }, 'Could not send the password-changed notice'));

  const csrfToken = await startSession(req, res, result.userId);
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
    OtpChallengeModel.deleteMany({ userId: user._id }),
  ]);
  await user.deleteOne();
  clearAuthCookies(res);
  res.status(204).end();
}
