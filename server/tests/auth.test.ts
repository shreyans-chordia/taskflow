import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CategoryModel } from '../src/models/Category.js';
import { PriorityModel } from '../src/models/Priority.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { UserModel } from '../src/models/User.js';
import { app, Client, codeFor, cookieFrom, ORIGIN, useDb } from './helpers.js';

useDb();

describe('sign up', () => {
  it('creates the account, starts a session and seeds default categories and priority levels', async () => {
    const c = new Client();
    await c.getCsrf();
    const res = await c.post('/api/auth/signup', { name: 'Shreyans', email: 'Shreyans@Example.com', password: 'Deskbound#7' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Shreyans', email: 'shreyans@example.com' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.csrfToken).toBeTruthy();

    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/tf_at=[^;]+;.*HttpOnly/);
    expect(cookies).toMatch(/tf_rt=[^;]+;.*Path=\/api\/auth;.*HttpOnly/);

    const stored = await UserModel.findOne({ email: 'shreyans@example.com' }).select('+passwordHash');
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt, never the plain password
    expect(await CategoryModel.countDocuments({ userId: stored!._id })).toBe(6);
    expect(await PriorityModel.countDocuments({ userId: stored!._id })).toBe(3);
    expect((await c.get('/api/auth/me')).status).toBe(200);
  });

  it('rejects a short password and a malformed email with field messages', async () => {
    const c = new Client();
    await c.getCsrf();
    const res = await c.post('/api/auth/signup', { name: 'A', email: 'nope', password: 'desk' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rejects a duplicate email', async () => {
    const a = await Client.signedUp('dup@example.com');
    expect(a.user.email).toBe('dup@example.com');
    const c = new Client();
    await c.getCsrf();
    const res = await c.post('/api/auth/signup', { name: 'B', email: 'DUP@example.com', password: 'Deskbound#7' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.email).toMatch(/already has a desk/);
  });

  it('rejects unknown fields, so nobody can sneak in extra properties', async () => {
    const c = new Client();
    await c.getCsrf();
    const res = await c.post('/api/auth/signup', { name: 'A', email: 'a@example.com', password: 'Deskbound#7', isAdmin: true });
    expect(res.status).toBe(400);
  });
});

describe('CSRF and origin checks', () => {
  it('blocks a state-changing request without the CSRF header', async () => {
    const res = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({ name: 'A', email: 'a@example.com', password: 'Deskbound#7' });
    expect(res.status).toBe(403);
    // A distinct code lets the web client fetch a fresh token and retry once.
    expect(res.body.error.code).toBe('CSRF');
  });

  it('blocks a request from an unknown origin even with a valid token', async () => {
    const c = new Client();
    await c.getCsrf();
    const res = await c.agent.post('/api/auth/signup').set('Origin', 'https://evil.example').set('X-CSRF-Token', c.csrf).send({ name: 'A', email: 'a@example.com', password: 'Deskbound#7' });
    expect(res.status).toBe(403);
    // Not retryable: the client must not treat a foreign origin as a stale token.
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('sign in', () => {
  it('asks for an emailed code after the right password, and only that code opens the session (AUTH-6)', async () => {
    const u = await Client.signedUp();
    const c = new Client();
    await c.getCsrf();
    const step1 = await c.post('/api/auth/login', { email: u.email, password: u.password });
    expect(step1.status).toBe(200);
    expect(step1.body).toMatchObject({ otpRequired: true, expiresInSec: 600, resendInSec: 60 });
    expect(step1.body.user).toBeUndefined();
    expect(step1.body.email).not.toBe(u.email); // masked
    expect(cookieFrom(step1, 'tf_at')).toBeUndefined(); // no session yet
    expect((await c.get('/api/auth/me')).status).toBe(401);

    const res = await c.post('/api/auth/login/verify', { code: await codeFor(u.email) });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(u.email);
    expect((await c.get('/api/auth/me')).status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const u = await Client.signedUp();
    const c = new Client();
    await c.getCsrf();
    const wrong = await c.post('/api/auth/login', { email: u.email, password: 'wrong-password' });
    const unknown = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses query operators in place of credentials (NoSQL injection)', async () => {
    await Client.signedUp('victim@example.com');
    const c = new Client();
    await c.getCsrf();
    const res = await c.post('/api/auth/login', { email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('locks the account for a while after 10 wrong passwords', async () => {
    const u = await Client.signedUp();
    const c = new Client();
    await c.getCsrf();
    for (let i = 0; i < 10; i++) await c.post('/api/auth/login', { email: u.email, password: `wrong-${i}` });
    const res = await c.post('/api/auth/login', { email: u.email, password: u.password });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('LOCKED');
  });
});

describe('access tokens', () => {
  it('rejects requests without a session', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/tasks')).status).toBe(401);
  });

  it('rejects a token signed with another secret or with alg "none"', async () => {
    const u = await Client.signedUp();
    const forged = jwt.sign({}, 'some-other-secret-that-is-also-long-enough', { subject: u.user.id, issuer: 'taskflow-api', audience: 'taskflow-web' });
    const none = jwt.sign({}, '', { algorithm: 'none', subject: u.user.id, issuer: 'taskflow-api', audience: 'taskflow-web' });
    for (const t of [forged, none]) {
      const res = await request(app).get('/api/auth/me').set('Cookie', `tf_at=${t}`);
      expect(res.status).toBe(401);
    }
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token on every use and revokes the old one', async () => {
    const c = await Client.signedUp();
    const first = await c.post('/api/auth/refresh');
    expect(first.status).toBe(200);
    const second = await c.post('/api/auth/refresh');
    expect(second.status).toBe(200);
    expect(await RefreshTokenModel.countDocuments({ revokedAt: null })).toBe(1);
  });

  it('ends the whole session family when an old refresh token is replayed', async () => {
    const c = await Client.signedUp();
    const res = await c.post('/api/auth/refresh');
    const stolen = cookieFrom(res, 'tf_rt');
    expect(stolen).toBeTruthy();
    await c.post('/api/auth/refresh'); // the real user moves on; `stolen` is now an old token

    // The attacker's own browser: no cookie jar of the victim, just the copied refresh token and its own CSRF pair.
    const csrfRes = await request(app).get('/api/auth/csrf').set('Origin', ORIGIN);
    const csrf = csrfRes.body.csrfToken as string;
    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .set('Cookie', `tf_rt=${stolen}; tf_csrf=${csrf}`);
    expect(replay.status).toBe(401);
    // ...and the legitimate holder is signed out too, because we cannot tell which copy is the thief's.
    expect((await c.post('/api/auth/refresh')).status).toBe(401);
  });

  it('signing out revokes the refresh token', async () => {
    const c = await Client.signedUp();
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    expect(await RefreshTokenModel.countDocuments({ revokedAt: null })).toBe(0);
  });
});

describe('account deletion', () => {
  it('needs the password and removes everything the account owned', async () => {
    const c = await Client.signedUp();
    await c.post('/api/tasks', { title: 'Something' });
    expect((await c.del('/api/auth/me', { password: 'wrong-one' })).status).toBe(401);
    expect((await c.del('/api/auth/me', { password: c.password })).status).toBe(204);
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await CategoryModel.countDocuments()).toBe(0);
  });
});
