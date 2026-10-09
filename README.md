# TaskFlow

A personal task manager whose home screen is a 3D desk: tasks are sticky notes on a corkboard, deadlines sit on a wall
calendar, categories are trays on a shelf, and a Pomodoro clock ticks on the desk.

> Status: the front end exists as a single-file prototype (`prototype/room.html`). The secure REST API in `server/` is
> the first part of the real application; the React front end comes next.

## Stack

| Layer | Tech |
| --- | --- |
| API | Node.js 20+, Express 5, TypeScript |
| Data | MongoDB with Mongoose 8 |
| Validation | zod 4 (strict schemas on every request) |
| Auth | bcrypt, 15-minute JWT access token + rotating refresh token, both in HttpOnly cookies, CSRF tokens |
| Tests | Vitest, Supertest, mongodb-memory-server |
| CI | GitHub Actions: lint, typecheck, tests, build, npm audit |

## Security highlights

Refresh-token rotation with reuse detection, double-submit CSRF protection with an Origin allow-list, account lockout and
rate limiting, timing-safe sign-in, NoSQL-injection-proof queries, strict per-account data isolation (tested), Helmet
headers and validated configuration. Details and the threat model: [`docs/SECURITY.md`](docs/SECURITY.md).

## Run it locally (Windows, PowerShell)

1. Install [Node.js 22 LTS](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   (or use a free MongoDB Atlas cluster instead of Docker).
2. Start MongoDB:
   ```powershell
   docker compose up -d mongo
   ```
3. Install and configure the API:
   ```powershell
   cd server
   npm install
   Copy-Item .env.example .env
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Paste the printed value into `.env` as `JWT_ACCESS_SECRET`.
4. Run it:
   ```powershell
   npm run dev
   ```
   Check `http://localhost:4000/api/health` returns `{"ok":true}`.
5. Run the tests (no Docker needed, they start their own MongoDB):
   ```powershell
   npm test
   ```

## API

See [`docs/API.md`](docs/API.md).

## Course context

Built for INT3131 Software Engineering Lab (Manipal University Jaipur) across the full SDLC: IEEE SRS, UML models,
implementation and testing.
