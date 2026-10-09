import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { RefreshTokenModel } from '../models/RefreshToken.js';

const ISSUER = 'taskflow-api';
const AUDIENCE = 'taskflow-web';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* ---------- access tokens: short-lived JWTs, verified without a database round trip ---------- */
export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
  });
}

/** Returns the user id, or null when the token is missing, tampered with, expired or signed with another algorithm. */
export function verifyAccessToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/* ---------- refresh tokens: opaque, stored hashed, rotated on every use ---------- */
export const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export async function issueRefreshToken(userId: Types.ObjectId | string, family = randomUUID(), userAgent = ''): Promise<string> {
  const token = randomToken(48);
  await RefreshTokenModel.create({
    userId,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + refreshTtlMs()),
    userAgent: userAgent.slice(0, 300),
  });
  return token;
}

export type RotateResult =
  | { ok: true; userId: string; refreshToken: string }
  | { ok: false; reason: 'missing' | 'unknown' | 'expired' | 'reused' };

/**
 * Exchanges a refresh token for a new one. Presenting a token that was already exchanged means two
 * parties hold copies of it, so every token from that sign-in is revoked and both must sign in again.
 */
export async function rotateRefreshToken(token: string | undefined, userAgent = ''): Promise<RotateResult> {
  if (!token) return { ok: false, reason: 'missing' };
  const row = await RefreshTokenModel.findOne({ tokenHash: sha256(token) });
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revokedAt) {
    await RefreshTokenModel.updateMany({ family: row.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return { ok: false, reason: 'reused' };
  }
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  const next = randomToken(48);
  // Revoke the old token only if nobody else revoked it first, so two simultaneous refreshes cannot both win.
  const claimed = await RefreshTokenModel.findOneAndUpdate(
    { _id: row._id, revokedAt: null },
    { $set: { revokedAt: new Date(), replacedBy: sha256(next) } },
  );
  if (!claimed) {
    await RefreshTokenModel.updateMany({ family: row.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return { ok: false, reason: 'reused' };
  }
  await RefreshTokenModel.create({
    userId: row.userId,
    tokenHash: sha256(next),
    family: row.family,
    // Rotation keeps the original expiry: a session cannot be extended forever without signing in again.
    expiresAt: row.expiresAt,
    userAgent: userAgent.slice(0, 300),
  });
  return { ok: true, userId: String(row.userId), refreshToken: next };
}

export async function revokeRefreshToken(token: string | undefined): Promise<void> {
  if (!token) return;
  const row = await RefreshTokenModel.findOne({ tokenHash: sha256(token) });
  if (row) await RefreshTokenModel.updateMany({ family: row.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export const revokeAllForUser = (userId: string) =>
  RefreshTokenModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
