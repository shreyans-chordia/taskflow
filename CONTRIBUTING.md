# Contributing to TaskFlow

Thanks for taking the time to look. Bug reports, ideas and pull requests are all welcome.

## Getting set up

Follow [Getting started](README.md#getting-started) in the README to run the API and the web app locally.
You need Node.js 20.11 or newer (22 LTS recommended) and, for the API and end-to-end tests, a MongoDB instance
(Docker Compose provides one). The API's integration tests start their own in-memory MongoDB.

## Before you open a pull request

Run the checks for whichever side you changed; CI runs all of them.

```bash
# server/
npm run lint && npm run typecheck && npm test

# web/
npm run lint && npm run typecheck && npm test
npm run e2e        # needs MongoDB; see README
```

Keep pull requests focused on one change, and describe what it does and how you checked it.
Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) where it fits:
`feat(web): …`, `fix(server): …`, `docs: …`, `test(e2e): …`.

## Engineering rules

These keep the security model intact. Pull requests that break them will be asked to change.

**API**

- Every new endpoint has a `z.strictObject` schema for its body and query, sits behind `requireAuth`, scopes every
  query by `userId`, and comes with a test proving another account cannot read or change the data.
- Intentional MongoDB operators are marked with `mongoose.trusted()` (`sanitizeFilter` is on globally).
- Never return `passwordHash` or any token hash. Never log secrets.
- When a security control changes, update [`docs/SECURITY.md`](docs/SECURITY.md); when an endpoint changes, update
  [`docs/API.md`](docs/API.md).

**Web**

- Never read or store tokens in JavaScript. The session lives in HttpOnly cookies, the CSRF token only in memory, and
  `localStorage` is for UI preferences only.
- The 3D canvas renders on demand: anything that animates must call `invalidate()`.
- Global stylesheets are imported in `main.tsx` before `App`, so component CSS wins ties. Keep that order.
- Done tasks are crossed out with the hand-drawn scribble (`--sq` tokens), never `text-decoration: line-through`.

**Product**

- The Pomodoro timer stays independent of tasks: no imports from `tasks/` or the API (requirement POM-5).
- Priority is always chosen by the user; nothing in the app ranks tasks automatically.
- Dark mode is a token swap in `tokens.css` only.

## Requirement IDs

Tests reference requirement IDs such as `TASK-1` or `AUTH-6` in their names, so every behaviour can be traced back to
a requirement. The catalogue is in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md); add new IDs there when you add a
feature.

## Reporting security issues

Please do not open a public issue for a vulnerability. See [SECURITY.md](.github/SECURITY.md).
