import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/** bcrypt only looks at the first 72 bytes of a password, so longer ones are rejected at validation time. */
export const MAX_PASSWORD_BYTES = 72;

export const hashPassword = (plain: string) => bcrypt.hash(plain, env.isTest ? 4 : env.BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * A real bcrypt hash of a random string. Sign-in compares against it when the email is unknown,
 * so "no such account" and "wrong password" take the same time and cannot be told apart.
 */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(`no-account-${Math.random()}`));
