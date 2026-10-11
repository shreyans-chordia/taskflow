# TaskFlow API

Base path `/api`. JSON in, JSON out. Errors always look like:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Some fields need a look.", "fields": { "title": "Give the task a title." } } }
```

## Calling the API from the web app

1. `GET /api/auth/csrf` → `{ csrfToken }`. Keep it in memory.
2. Send every `POST`/`PATCH`/`PUT`/`DELETE` with `credentials: 'include'` and the header `X-CSRF-Token: <csrfToken>`.
3. Sign-in (step 2), sign-up, password reset, refresh and `GET /me` return a fresh `csrfToken`; replace the one you hold.
4. On a `401` from any endpoint, call `POST /api/auth/refresh` once, then retry. If refresh also returns `401`, show the sign-in screen.
5. On a `403` with code `CSRF` (stale or missing token), fetch a new token and retry once. A `403` with code
   `FORBIDDEN` (for example an unknown `Origin`) is final; do not retry it.

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/auth/csrf` | – | Issues a CSRF token |
| POST | `/auth/signup` | `{ name, email, password }` | 201 `{ user, csrfToken }`; sets session cookies; seeds default categories and priority levels |
| POST | `/auth/login` | `{ email, password }` | Step 1 of 2. 200 `{ otpRequired: true, email (masked), expiresInSec, resendInSec }`, emails a 6-digit code and sets the `tf_otp` challenge cookie; **no session yet**. 401 generic message; 429 `LOCKED` after 10 failures; 429 `OTP_LIMIT` after 10 code emails in an hour; 503 `MAIL_FAILED` |
| POST | `/auth/login/verify` | `{ code }` | Step 2. 200 `{ user, csrfToken }` and session cookies. 401 `OTP_INVALID` (with `fields.code` and tries left) or `OTP_EXPIRED` (start again) |
| POST | `/auth/otp/resend` | – | New code for the pending sign-in or reset (the old one stops working). 200 `{ expiresInSec, resendInSec }`; 429 `OTP_COOLDOWN` (60 s between codes) or `OTP_LIMIT` (5 codes per attempt); 401 `OTP_EXPIRED` |
| POST | `/auth/password/forgot` | `{ email }` | Always 200 with the same body as step 1 of sign-in, whether or not the email has an account; emails a code only if it does |
| POST | `/auth/password/reset` | `{ code, password }` | 200 `{ user, csrfToken }`: new password set, account unlocked, every other session revoked, notice emailed, this browser signed in. 400 for a weak password (checked before the code); 401 `OTP_INVALID` / `OTP_EXPIRED` |
| POST | `/auth/refresh` | – | Rotates the refresh cookie, returns `{ user, csrfToken }` |
| POST | `/auth/logout` | – | 204; ends this device's session |
| POST | `/auth/logout-all` | – | 204; ends every session |
| GET | `/auth/me` | – | `{ user, csrfToken }` |
| DELETE | `/auth/me` | `{ password }` | 204; deletes the account and all its data |

### One-time codes

Six digits, emailed, valid for `OTP_TTL_MIN` minutes (default 10), usable once, 5 wrong tries per code. The challenge
they belong to lives in the HttpOnly `tf_otp` cookie (path `/api/auth`), so a code is useless in any other browser.
A 401 from `/auth/login/verify`, `/auth/otp/resend` or `/auth/password/*` means a wrong or expired code, not an expired
session: do not call `/auth/refresh` for it.

## Tasks (signed in)

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/tasks` | `?q=&category=<id>&priority=<id>&status=all\|open\|done&from=YYYY-MM-DD&to=YYYY-MM-DD` |
| POST | `/tasks` | `{ title, description?, categoryIds?, priorityId?, deadline?, hasTime? }` |
| GET | `/tasks/:id` | – |
| PATCH | `/tasks/:id` | any of `title, description, categoryIds, priorityId, deadline, hasTime, done` |
| DELETE | `/tasks/:id` | – (subtasks go with it) |
| POST | `/tasks/:id/subtasks` | `{ title }` |
| PATCH | `/tasks/:id/subtasks/:subId` | `{ title?, done? }` |
| DELETE | `/tasks/:id/subtasks/:subId` | – |

`deadline` is `null`, a date (`2026-10-20`) or an ISO date-time with offset (`2026-10-20T17:00:00+05:30`).

## Categories and priority levels (signed in)

| Method | Path | Body |
| --- | --- | --- |
| GET | `/categories` | – (sorted; the first six are the desk trays) |
| POST | `/categories` | `{ name, color }` |
| PATCH | `/categories/:id` | `{ name?, color? }` |
| DELETE | `/categories/:id` | – removes it from tasks, keeps the tasks |
| PUT | `/categories/order` | `{ ids: [...] }` every id exactly once |
| GET | `/priorities` | – (order 0 = most important) |
| POST | `/priorities` | `{ name, color, position? }` |
| PATCH | `/priorities/:id` | `{ name?, color?, isDefault?: true }` |
| DELETE | `/priorities/:id` | – moves its tasks to the next level |
| PUT | `/priorities/order` | `{ ids: [...] }` |
