# TaskFlow

A personal task manager whose home screen is a 3D desk: tasks are sticky notes on a corkboard, deadlines sit on a wall
calendar, categories are trays on a shelf, and a Pomodoro clock ticks on the desk.

> Status: the secure REST API (`server/`) and the React front end (`web/`) are connected: sign-up, sign-in and tasks
> run on the real API and MongoDB. The 3D desk from the prototype (`prototype/room.html`) is being ported to React Three
> Fiber next.

## Stack

| Layer | Tech |
| --- | --- |
| API | Node.js 20+, Express 5, TypeScript |
| Data | MongoDB with Mongoose 8 |
| Validation | zod 4 (strict schemas on every request) |
| Auth | bcrypt, 15-minute JWT access token + rotating refresh token, both in HttpOnly cookies, CSRF tokens |
| Web | React 19, TypeScript, Vite 7, TanStack Query |
| Tests | Vitest, Supertest, mongodb-memory-server (API) · Vitest + Testing Library (web) · Playwright (end to end) |
| CI | GitHub Actions: lint, typecheck, unit and integration tests, build, npm audit, Playwright against MongoDB 7 |

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
6. In a second PowerShell window, start the web app (it forwards `/api` calls to the API on port 4000):
   ```powershell
   cd web
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` and create an account.
7. Optional, end-to-end tests in a real browser (needs MongoDB from step 2; uses its own ports and database):
   ```powershell
   npx playwright install chromium
   npm run e2e
   ```

## API

See [`docs/API.md`](docs/API.md).

## Course context

Built for INT3131 Software Engineering Lab (Manipal University Jaipur) across the full SDLC: IEEE SRS, UML models,
implementation and testing.
