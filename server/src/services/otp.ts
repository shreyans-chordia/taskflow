import { createHash, createHmac, randomInt } from 'node:crypto';
import mongoose, { type Types } from 'mongoose';
import { env } from '../config/env.js';
import { OtpChallengeModel } from '../models/OtpChallenge.js';
import { UserModel } from '../models/User.js';
import { randomToken, safeEqual, sha256 } from './tokens.js';

const { trusted } = mongoose;

/** Wrong guesses allowed per code before the challenge is thrown away. 5 guesses at a 6-digit code: a 1 in 200,000 chance. */
export const OTP_MAX_ATTEMPTS = 5;
/** Codes one challenge may send (the first plus resends). */
export const OTP_MAX_SENDS = 5;
export const OTP_RESEND_COOLDOWN_SEC = 60;
/** Code emails one account may receive per hour, whoever asks for them. */
export const CODE_EMAILS_PER_HOUR = 10;

export type OtpPurpose = 'login' | 'reset';

const ttlMs = () => env.OTP_TTL_MIN * 60 * 1000;

// A key of its own for codes, derived from the server secret, so the stored HMACs cannot be checked without it.
const otpKey = createHash('sha256').update(`taskflow-otp:${env.JWT_ACCESS_SECRET}`).digest();
/** Binds the code to its challenge: the same 6 digits hash differently in every challenge. */
const hashCode = (token: string, code: string) => createHmac('sha256', otpKey).update(`${token}:${code}`).digest('hex');

/** A uniformly random 6-digit code, leading zeros kept. */
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export async function createChallenge(purpose: OtpPurpose, userId: Types.ObjectId | string | null): Promise<{ token: string; code: string }> {
  const token = randomToken(32);
  const code = newCode();
  const now = Date.now();
  await OtpChallengeModel.create({
    tokenHash: sha256(token),
    purpose,
    userId,
    codeHash: hashCode(token, code),
    lastSentAt: new Date(now),
    expiresAt: new Date(now + ttlMs()),
  });
  return { token, code };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid'; attemptsLeft: number }
  | { ok: false; reason: 'expired' };

/**
 * Checks a code. The attempt is counted before the comparison, in one atomic update, so parallel guesses
 * cannot slip past the limit. A correct code deletes the challenge, so it works exactly once.
 */
export async function verifyChallenge(token: string | undefined, purpose: OtpPurpose, code: string): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: 'expired' };
  const tokenHash = sha256(token);
  const row = await OtpChallengeModel.findOneAndUpdate(
    { tokenHash, purpose, attempts: trusted({ $lt: OTP_MAX_ATTEMPTS }), expiresAt: trusted({ $gt: new Date() }) },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!row) {
    await OtpChallengeModel.deleteOne({ tokenHash });
    return { ok: false, reason: 'expired' };
  }
  // A reset for an unknown email has no user and simply never matches, so it answers exactly like a wrong code.
  if (!row.userId || !safeEqual(row.codeHash, hashCode(token, code))) {
    const attemptsLeft = OTP_MAX_ATTEMPTS - row.attempts;
    if (attemptsLeft > 0) return { ok: false, reason: 'invalid', attemptsLeft };
    await OtpChallengeModel.deleteOne({ _id: row._id });
    return { ok: false, reason: 'expired' };
  }
  const used = await OtpChallengeModel.deleteOne({ _id: row._id });
  if (used.deletedCount !== 1) return { ok: false, reason: 'expired' }; // a parallel request used it first
  return { ok: true, userId: String(row.userId) };
}

export type ResendResult =
  | { ok: true; code: string; purpose: OtpPurpose; userId: string | null }
  | { ok: false; reason: 'expired' | 'limit' }
  | { ok: false; reason: 'cooldown'; waitSec: number };

/** Replaces the code of a live challenge with a fresh one (the old code stops working) and restarts its clock. */
export async function resendChallenge(token: string | undefined): Promise<ResendResult> {
  if (!token) return { ok: false, reason: 'expired' };
  const row = await OtpChallengeModel.findOne({ tokenHash: sha256(token), expiresAt: trusted({ $gt: new Date() }) });
  if (!row) return { ok: false, reason: 'expired' };
  if (row.sends >= OTP_MAX_SENDS) return { ok: false, reason: 'limit' };
  const waitSec = Math.ceil(OTP_RESEND_COOLDOWN_SEC - (Date.now() - row.lastSentAt.getTime()) / 1000);
  if (waitSec > 0) return { ok: false, reason: 'cooldown', waitSec };

  const code = newCode();
  const now = Date.now();
  // Matching on `sends` makes two simultaneous resends produce one code, not two.
  const updated = await OtpChallengeModel.findOneAndUpdate(
    { _id: row._id, sends: row.sends },
    { $set: { codeHash: hashCode(token, code), attempts: 0, lastSentAt: new Date(now), expiresAt: new Date(now + ttlMs()) }, $inc: { sends: 1 } },
  );
  if (!updated) return { ok: false, reason: 'cooldown', waitSec: OTP_RESEND_COOLDOWN_SEC };
  return { ok: true, code, purpose: row.purpose as OtpPurpose, userId: row.userId ? String(row.userId) : null };
}

/**
 * Reserves one code email for this account. Returns false once it has had CODE_EMAILS_PER_HOUR in the
 * current hour, which stops anyone from flooding a person's inbox through "Forgot password?".
 */
export async function claimCodeEmail(userId: Types.ObjectId | string): Promise<boolean> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const fresh = await UserModel.updateOne(
    { _id: userId, $or: [{ codeEmailsWindowStart: null }, { codeEmailsWindowStart: trusted({ $lte: hourAgo }) }] },
    { $set: { codeEmailsWindowStart: now, codeEmailsSent: 1 } },
  );
  if (fresh.modifiedCount === 1) return true;
  const counted = await UserModel.updateOne({ _id: userId, codeEmailsSent: trusted({ $lt: CODE_EMAILS_PER_HOUR }) }, { $inc: { codeEmailsSent: 1 } });
  return counted.modifiedCount === 1;
}

/** "shreyans@example.com" → "s••••••s@example.com": enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  const local = email.slice(0, at);
  const hidden = '•'.repeat(Math.min(Math.max(local.length - 2, 1), 6));
  return `${local[0]}${hidden}${local.length > 1 ? local.at(-1) : ''}${email.slice(at)}`;
}
