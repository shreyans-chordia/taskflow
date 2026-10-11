import { describe, expect, it } from 'vitest';
import { OtpChallengeModel } from '../src/models/OtpChallenge.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { UserModel } from '../src/models/User.js';
import { outbox } from '../src/services/mailer.js';
import { maskEmail, newCode } from '../src/services/otp.js';
import { Client, codeFor, cookieFrom, settle, useDb } from './helpers.js';

/**
 * Two-step sign-in with an emailed one-time code (AUTH-6, AUTH-7) and password reset by code (AUTH-8, AUTH-9).
 * Codes are read from the in-memory outbox the mailer uses under test.
 */
useDb();

/** A signed-up account plus a second browser that has passed the password step for it. */
async function atCodeStep() {
  const owner = await Client.signedUp();
  const c = new Client();
  await c.getCsrf();
  const res = await c.post('/api/auth/login', { email: owner.email, password: owner.password });
  expect(res.status).toBe(200);
  return { owner, c, step1: res };
}

/** Pushes a challenge's resend cooldown into the past. */
const skipCooldown = () => OtpChallengeModel.updateMany({}, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });

describe('one-time codes', () => {
  it('are six digits, leading zeros kept, and emails are masked', () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
    expect(maskEmail('shreyans@example.com')).toBe('s••••••s@example.com');
    expect(maskEmail('ab@example.com')).toBe('a•b@example.com');
    expect(maskEmail('a@example.com')).toBe('a•@example.com');
  });

  it('are stored only as hashes, never as the code or the cookie value (AUTH-7)', async () => {
    const { owner, step1 } = await atCodeStep();
    const code = await codeFor(owner.email);
    const token = cookieFrom(step1, 'tf_otp')!;
    expect(token).toBeTruthy();
    const line = (step1.headers['set-cookie'] as unknown as string[]).find((l) => l.startsWith('tf_otp='));
    expect(line).toMatch(/Path=\/api\/auth;.*HttpOnly/);
    const row = await OtpChallengeModel.findOne().lean();
    expect(JSON.stringify(row)).not.toContain(code);
    expect(JSON.stringify(row)).not.toContain(token);
  });
});

describe('two-step sign-in (AUTH-6, AUTH-7)', () => {
  it('rejects a wrong code, says how many tries are left, and still accepts the right one', async () => {
    const { owner, c } = await atCodeStep();
    const code = await codeFor(owner.email);
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await c.post('/api/auth/login/verify', { code: wrong });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('OTP_INVALID');
    expect(res.body.error.fields.code).toMatch(/4 tries left/);
    expect((await c.post('/api/auth/login/verify', { code })).status).toBe(200);
  });

  it('throws the challenge away after 5 wrong codes, so the right code no longer works', async () => {
    const { owner, c } = await atCodeStep();
    const code = await codeFor(owner.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect((await c.post('/api/auth/login/verify', { code: wrong })).body.error.code).toBe('OTP_INVALID');
    const fifth = await c.post('/api/auth/login/verify', { code: wrong });
    expect(fifth.body.error.code).toBe('OTP_EXPIRED');
    const late = await c.post('/api/auth/login/verify', { code });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe('OTP_EXPIRED');
    expect(await OtpChallengeModel.countDocuments()).toBe(0);
  });

  it('counts parallel guesses atomically: at most 5 get checked', async () => {
    const { owner, c } = await atCodeStep();
    const code = await codeFor(owner.email);
    const wrong = code === '000000' ? '111111' : '000000';
    const results = await Promise.all(Array.from({ length: 12 }, () => c.post('/api/auth/login/verify', { code: wrong })));
    expect(results.filter((r) => r.body.error?.code === 'OTP_INVALID').length).toBeLessThanOrEqual(4);
    expect((await c.post('/api/auth/login/verify', { code })).status).toBe(401);
  });

  it('works once only', async () => {
    const { owner, c } = await atCodeStep();
    const code = await codeFor(owner.email);
    expect((await c.post('/api/auth/login/verify', { code })).status).toBe(200);
    const again = await c.post('/api/auth/login/verify', { code });
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe('OTP_EXPIRED');
  });

  it('expires after OTP_TTL_MIN minutes', async () => {
    const { owner, c } = await atCodeStep();
    const code = await codeFor(owner.email);
    await OtpChallengeModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await c.post('/api/auth/login/verify', { code });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('is bound to the browser that passed the password step: the code alone is useless elsewhere', async () => {
    const { owner } = await atCodeStep();
    const code = await codeFor(owner.email);
    const thief = new Client();
    await thief.getCsrf();
    const res = await thief.post('/api/auth/login/verify', { code });
    expect(res.status).toBe(401);
    expect((await thief.get('/api/auth/me')).status).toBe(401);
  });

  it('refuses anything but six digits without spending a try', async () => {
    const { owner, c } = await atCodeStep();
    for (const code of ['12345', '1234567', 'abcdef', '12 456']) expect((await c.post('/api/auth/login/verify', { code })).status).toBe(400);
    expect((await c.post('/api/auth/login/verify', { code: { $gt: '' } })).status).toBe(400);
    expect((await OtpChallengeModel.findOne())!.attempts).toBe(0);
    expect((await c.post('/api/auth/login/verify', { code: await codeFor(owner.email) })).status).toBe(200);
  });

  it('a wrong password sends no code', async () => {
    const owner = await Client.signedUp();
    const c = new Client();
    await c.getCsrf();
    expect((await c.post('/api/auth/login', { email: owner.email, password: 'not-it-at-all' })).status).toBe(401);
    expect(outbox).toHaveLength(0);
    expect(await OtpChallengeModel.countDocuments()).toBe(0);
  });

  it('resends after the cooldown with a new code, and the old code stops working', async () => {
    const { owner, c } = await atCodeStep();
    const first = await codeFor(owner.email);

    const early = await c.post('/api/auth/otp/resend');
    expect(early.status).toBe(429);
    expect(early.body.error.code).toBe('OTP_COOLDOWN');

    await skipCooldown();
    const res = await c.post('/api/auth/otp/resend');
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(2);
    const second = await codeFor(owner.email);
    if (second !== first) expect((await c.post('/api/auth/login/verify', { code: first })).body.error.code).toBe('OTP_INVALID');
    expect((await c.post('/api/auth/login/verify', { code: second })).status).toBe(200);
  });

  it('caps code emails per account per hour', async () => {
    const owner = await Client.signedUp();
    await UserModel.updateOne({ _id: owner.user.id }, { $set: { codeEmailsSent: 10, codeEmailsWindowStart: new Date() } });
    const c = new Client();
    await c.getCsrf();
    const res = await c.post('/api/auth/login', { email: owner.email, password: owner.password });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('OTP_LIMIT');
    expect(outbox).toHaveLength(0);

    // A new hour, a new allowance.
    await UserModel.updateOne({ _id: owner.user.id }, { $set: { codeEmailsWindowStart: new Date(Date.now() - 61 * 60_000) } });
    expect((await c.post('/api/auth/login', { email: owner.email, password: owner.password })).status).toBe(200);
  });
});

describe('forgot password (AUTH-8)', () => {
  it('answers the same for a known and an unknown email, and emails only the real account', async () => {
    const owner = await Client.signedUp('known@example.com');
    const a = new Client();
    await a.getCsrf();
    const known = await a.post('/api/auth/password/forgot', { email: 'Known@Example.com' });
    const b = new Client();
    await b.getCsrf();
    const unknown = await b.post('/api/auth/password/forgot', { email: 'nobody@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).sort());
    expect(known.body.otpRequired).toBe(true);
    expect(cookieFrom(known, 'tf_otp')).toBeTruthy();
    expect(cookieFrom(unknown, 'tf_otp')).toBeTruthy();

    await codeFor(owner.email);
    await settle();
    expect(outbox.map((m) => m.to)).toEqual(['known@example.com']);
  });

  it('a code for an unknown email fails exactly like a wrong code', async () => {
    const c = new Client();
    await c.getCsrf();
    await c.post('/api/auth/password/forgot', { email: 'nobody@example.com' });
    const res = await c.post('/api/auth/password/reset', { code: '123456', password: 'Brand-new#Pass9' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('sends nothing once the account has had its hourly codes, but answers the same', async () => {
    const owner = await Client.signedUp();
    await UserModel.updateOne({ _id: owner.user.id }, { $set: { codeEmailsSent: 10, codeEmailsWindowStart: new Date() } });
    const c = new Client();
    await c.getCsrf();
    expect((await c.post('/api/auth/password/forgot', { email: owner.email })).status).toBe(200);
    await settle();
    expect(outbox).toHaveLength(0);
  });
});

describe('password reset (AUTH-9)', () => {
  it('sets the new password, signs out every other device, signs this browser in and sends a notice', async () => {
    const owner = await Client.signedUp(); // stands for the old session on another device
    const c = new Client();
    await c.getCsrf();
    await c.post('/api/auth/password/forgot', { email: owner.email });
    const code = await codeFor(owner.email);
    expect(outbox[0]!.subject).toMatch(/password reset code/);

    const res = await c.post('/api/auth/password/reset', { code, password: 'Brand-new#Pass9' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(owner.email);
    expect((await c.get('/api/auth/me')).status).toBe(200);

    // Every older session is gone.
    expect((await owner.post('/api/auth/refresh')).status).toBe(401);
    expect(await RefreshTokenModel.countDocuments({ revokedAt: null })).toBe(1);

    // The old password is dead, the new one reaches the code step.
    const other = new Client();
    await other.getCsrf();
    expect((await other.post('/api/auth/login', { email: owner.email, password: owner.password })).status).toBe(401);
    expect((await other.post('/api/auth/login', { email: owner.email, password: 'Brand-new#Pass9' })).body.otpRequired).toBe(true);

    await settle();
    expect(outbox.some((m) => m.subject === 'Your TaskFlow password was changed')).toBe(true);
  });

  it('checks the new password before the code, so a weak one does not spend a try', async () => {
    const owner = await Client.signedUp();
    const c = new Client();
    await c.getCsrf();
    await c.post('/api/auth/password/forgot', { email: owner.email });
    const code = await codeFor(owner.email);
    const weak = await c.post('/api/auth/password/reset', { code, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.fields.password).toBeTruthy();
    expect((await OtpChallengeModel.findOne())!.attempts).toBe(0);
    expect((await c.post('/api/auth/password/reset', { code, password: 'Long-enough#1' })).status).toBe(200);
  });

  it('unlocks an account that was locked by wrong passwords', async () => {
    const owner = await Client.signedUp();
    const c = new Client();
    await c.getCsrf();
    for (let i = 0; i < 10; i++) await c.post('/api/auth/login', { email: owner.email, password: `wrong-${i}` });
    expect((await c.post('/api/auth/login', { email: owner.email, password: owner.password })).body.error.code).toBe('LOCKED');

    await c.post('/api/auth/password/forgot', { email: owner.email });
    expect((await c.post('/api/auth/password/reset', { code: await codeFor(owner.email), password: 'Fresh#Start42' })).status).toBe(200);
    const user = await UserModel.findById(owner.user.id).select('+lockedUntil +failedLogins');
    expect(user!.lockedUntil).toBeNull();
    expect(user!.failedLogins).toBe(0);
  });

  it('a sign-in code cannot be used to reset the password', async () => {
    const { owner, c } = await atCodeStep();
    const res = await c.post('/api/auth/password/reset', { code: await codeFor(owner.email), password: 'Hijacked#Pass1' });
    expect(res.status).toBe(401);
    const other = new Client();
    await other.getCsrf();
    expect((await other.post('/api/auth/login', { email: owner.email, password: 'Hijacked#Pass1' })).status).toBe(401);
  });
});
