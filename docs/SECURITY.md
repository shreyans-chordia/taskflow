# Security design

TaskFlow is a single-user personal task manager, but it stores personal data behind accounts, so the API is built to the
standard of any public web service. This document records what is protected, how, and what is still open.
It maps to SRS section 5.3 (Security Requirements).

## Threats and controls

| Threat | Control | Where |
| --- | --- | --- |
| Stolen database leaks passwords | bcrypt (cost 12) with a per-hash salt; passwords over 72 bytes rejected (bcrypt truncates) | `services/passwords.ts` |
| Stolen database leaks sessions | Refresh tokens are 384-bit random values stored only as SHA-256 hashes | `services/tokens.ts`, `models/RefreshToken.ts` |
| Token theft via XSS | Access and refresh tokens live in `HttpOnly` cookies, never in `localStorage` or JS memory | `services/cookies.ts` |
| Long-lived stolen token | Access token expires in 15 min; refresh tokens rotate on every use and keep their original 30-day expiry | `services/tokens.ts` |
| Replayed refresh token | Reuse of an already-rotated token revokes the whole token family (both thief and owner must sign in again); a race between two refreshes is settled atomically | `rotateRefreshToken` |
| Forged JWT | HS256 only (`alg: none` and algorithm swapping rejected), issuer and audience checked, secret ≥ 32 chars enforced at boot | `verifyAccessToken`, `config/env.ts` |
| Cross-site request forgery | `SameSite` cookies + Origin allow-list + double-submit CSRF token in the `X-CSRF-Token` header on every unsafe request, including sign-in | `middleware/csrf.ts` |
| Cookie injection from a sibling subdomain | `__Host-` / `__Secure-` cookie prefixes in production | `services/cookies.ts` |
| Password guessing | 20 failed sign-ins per IP per 15 min; account locks for 15 min after 10 consecutive failures | `middleware/rateLimit.ts`, `auth.controller.ts` |
| Account enumeration via sign-in | Same message and same work (dummy bcrypt compare) for unknown email and wrong password | `login` |
| NoSQL operator injection | Strict zod schemas reject non-string values and unknown keys; Mongoose `sanitizeFilter` wraps any stray `$` operator; intentional operators are marked with `mongoose.trusted()` | `schemas/index.ts`, `db/connect.ts` |
| Reading or editing another user's data (IDOR) | Every query is scoped by `userId` from the verified token; foreign ids return 404; category and priority ids are checked for ownership before they are attached to a task | controllers, `tests/tasks.test.ts` |
| Mass assignment | Unknown body fields are rejected (`z.strictObject`) | `schemas/index.ts` |
| Oversized payloads / ReDoS | 100 kB JSON limit, length limits on every field, search text escaped before it becomes a regex | `app.ts`, `tasks.controller.ts` |
| Leaking internals | Generic 500 messages in production, `x-powered-by` off, secrets redacted from logs, `Cache-Control: no-store` | `middleware/error.ts`, `utils/logger.ts` |
| Clickjacking, MIME sniffing, etc. | Helmet headers with a deny-all CSP (the API serves JSON only) | `app.ts` |
| Session theft from the web app | The React client never reads or stores tokens: it sends cookies with `credentials: 'include'`, keeps the CSRF token in memory, and uses `localStorage` only for the theme. A Playwright test checks that page scripts cannot see the session cookies | `web/src/api/client.ts`, `web/e2e` |
| Stale CSRF token after a long idle | A 403 with code `CSRF` makes the client fetch a new token and retry once; any other 403 (for example a foreign `Origin`) is final | `middleware/csrf.ts`, `web/src/api/client.ts` |
| Weak deployment config | All config validated at boot; the server refuses to start with a missing or short secret, or `SameSite=None` outside production | `config/env.ts` |

## Known gaps / next steps

- **Sign-up reveals whether an email is registered.** This is a deliberate UX trade-off (the design shows
  "This email already has a desk"); it is rate-limited. Email verification would remove the need.
- **No email verification or password reset yet.** Needs an email provider; out of the current SRS scope.
- **Rate limits are in-memory.** Fine for one instance; use a shared store (Redis) if the API is scaled out.
- **The web app has no Content-Security-Policy yet.** It is set by whatever hosts the built files; add
  `default-src 'self'` plus the Google Fonts origins when the deployment target is chosen.
- **Dependency scanning** runs as `npm audit` in CI; consider Dependabot once the repo is public.
