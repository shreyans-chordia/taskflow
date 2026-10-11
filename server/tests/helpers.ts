import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDb } from '../src/db/connect.js';
import { outbox } from '../src/services/mailer.js';

export const app = createApp();
export const ORIGIN = 'http://localhost:5173';

/** Connects once per file and wipes every collection before each test. */
export function useDb() {
  beforeAll(async () => {
    await connectDb(env.MONGODB_URI);
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  });
  beforeEach(async () => {
    outbox.length = 0;
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });
}

/** A browser-like client: keeps cookies between requests and remembers the CSRF token the API hands out. */
export class Client {
  agent = request.agent(app);
  csrf = '';

  async getCsrf() {
    const res = await this.agent.get('/api/auth/csrf').set('Origin', ORIGIN);
    this.csrf = res.body.csrfToken;
    return this.csrf;
  }

  private send(method: 'post' | 'patch' | 'put' | 'delete', url: string, body?: object) {
    const req = this.agent[method](url).set('Origin', ORIGIN).set('X-CSRF-Token', this.csrf);
    return body ? req.send(body) : req;
  }
  get(url: string) {
    return this.agent.get(url).set('Origin', ORIGIN);
  }
  post(url: string, body?: object) {
    return this.send('post', url, body).then((r) => this.keep(r));
  }
  patch(url: string, body?: object) {
    return this.send('patch', url, body);
  }
  put(url: string, body?: object) {
    return this.send('put', url, body);
  }
  del(url: string, body?: object) {
    return this.send('delete', url, body);
  }
  /** Sign-in, sign-up and refresh rotate the CSRF token. */
  private keep(res: request.Response) {
    if (res.body?.csrfToken) this.csrf = res.body.csrfToken;
    return res;
  }

  static async signedUp(email = `u${Math.random().toString(36).slice(2, 8)}@example.com`, name = 'Test User', password = 'Deskbound#7') {
    const c = new Client();
    await c.getCsrf();
    const res = await c.post('/api/auth/signup', { name, email, password });
    if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
    return Object.assign(c, { email, password, user: res.body.user as { id: string; name: string; email: string } });
  }
}

/**
 * The 6-digit code in the newest email to `to`. Some codes are sent in the background (forgot password),
 * so this waits briefly for the email to land.
 */
export async function codeFor(to: string, timeoutMs = 2000): Promise<string> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const mail = outbox.findLast((m) => m.to === to);
    const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    if (Date.now() > end) throw new Error(`no code email for ${to}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Lets background work (a code email that is sent after the response) finish before checking it did not happen. */
export const settle = () => new Promise((r) => setTimeout(r, 150));

/** Reads a cookie value out of a Set-Cookie header list. */
export function cookieFrom(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0]?.slice(name.length + 1);
}
