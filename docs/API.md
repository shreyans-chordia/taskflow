# TaskFlow API

Base path `/api`. JSON in, JSON out. Errors always look like:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Some fields need a look.", "fields": { "title": "Give the task a title." } } }
```

## Calling the API from the web app

1. `GET /api/auth/csrf` → `{ csrfToken }`. Keep it in memory.
2. Send every `POST`/`PATCH`/`PUT`/`DELETE` with `credentials: 'include'` and the header `X-CSRF-Token: <csrfToken>`.
3. Sign-in, sign-up, refresh and `GET /me` return a fresh `csrfToken`; replace the one you hold.
4. On a `401` from any endpoint, call `POST /api/auth/refresh` once, then retry. If refresh also returns `401`, show the sign-in screen.

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/auth/csrf` | – | Issues a CSRF token |
| POST | `/auth/signup` | `{ name, email, password }` | 201 `{ user, csrfToken }`; sets session cookies; seeds default categories and priority levels |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user, csrfToken }`; 401 generic message; 429 `LOCKED` after 10 failures |
| POST | `/auth/refresh` | – | Rotates the refresh cookie, returns `{ user, csrfToken }` |
| POST | `/auth/logout` | – | 204; ends this device's session |
| POST | `/auth/logout-all` | – | 204; ends every session |
| GET | `/auth/me` | – | `{ user, csrfToken }` |
| DELETE | `/auth/me` | `{ password }` | 204; deletes the account and all its data |

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
