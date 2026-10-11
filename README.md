# TaskFlow

A personal task manager whose home screen is a 3D desk: tasks are sticky notes on a corkboard, deadlines sit on a wall
calendar, categories are trays on a shelf, and a Pomodoro clock ticks on the desk.

> Status: the secure REST API (`server/`) and the React front end (`web/`) are connected, and the home screen is the
> live 3D desk (React Three Fiber), drawn from your real tasks. Clicking an object flies the camera to it and opens your
> task list; the dedicated panels (calendar, search, weekly review, Pomodoro) are being ported from the prototype next.
> Browsers without WebGL get the same task list as a plain 2D page.

## Stack

| Layer | Tech |
| --- | --- |
| API | Node.js 20+, Express 5, TypeScript |
| Data | MongoDB with Mongoose 8 |
| Validation | zod 4 (strict schemas on every request) |
| Auth | bcrypt, two-step sign-in with emailed one-time codes, password reset by code, 15-minute JWT access token + rotating refresh token in HttpOnly cookies, CSRF tokens |
| Email | Nodemailer over SMTP (any provider, e.g. Gmail with an App Password) |
| Web | React 19, TypeScript, Vite 7, TanStack Query |
| 3D | three.js + React Three Fiber; every texture is painted procedurally on canvases (no image or model files) |
| Tests | Vitest, Supertest, mongodb-memory-server (API) · Vitest + Testing Library (web) · Playwright (end to end) |
| CI | GitHub Actions: lint, typecheck, unit and integration tests, build, npm audit, Playwright against MongoDB 7 |

## Security highlights

Two-step sign-in with emailed one-time codes, enumeration-proof password reset, refresh-token rotation with reuse detection, double-submit CSRF protection with an Origin allow-list, account lockout and
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
   Check `http://localhost:4000/api/health` returns `{"ok":true}`. Sign-in now asks for a 6-digit code after the
   password. With the default `MAIL_TRANSPORT=console` no email is sent: the code appears in this PowerShell window.
   To receive real emails, see [Sending real email](#sending-real-email).
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

## Sending real email

Sign-in codes and password reset codes go out over SMTP. With a Gmail account:

1. Turn on 2-Step Verification for the Google account (an App Password needs it).
2. Create an App Password: Google Account → Security → 2-Step Verification → App passwords. Copy the 16 letters.
3. In `server/.env` set:
   ```
   MAIL_TRANSPORT=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=you@gmail.com
   SMTP_PASS=the16letterapppassword
   MAIL_FROM=TaskFlow <you@gmail.com>
   ```
4. Restart `npm run dev`. Never commit `.env`; the App Password can send mail as you.

In production the API refuses to start without SMTP settings, so sign-in can never silently stop working.

## API

See [`docs/API.md`](docs/API.md).

## Course context

Built for INT3131 Software Engineering Lab (Manipal University Jaipur) across the full SDLC: IEEE SRS, UML models,
implementation and testing.
