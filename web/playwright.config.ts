import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive a real browser against the real stack: Vite (web) → proxy → Express API → MongoDB.
 * They use their own ports (5174 / 4100) and database so they never touch your dev data.
 *
 * Needs a MongoDB at E2E_MONGODB_URI (default: the docker compose one on localhost:27017).
 */
const WEB_PORT = 5174;
const API_PORT = 4100;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const ci = !!process.env.CI;
// The API writes each email here as JSON (MAIL_TRANSPORT=file), so the specs can read sign-in and reset codes.
const OUTBOX = path.join(import.meta.dirname, 'e2e', '.outbox');
process.env.E2E_OUTBOX = OUTBOX;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: 1,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: point at an already-installed Chromium instead of running `npx playwright install`.
        ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
      },
    },
  ],
  webServer: [
    {
      // CI builds the API first and runs the compiled output; locally tsx runs the source.
      command: ci ? 'npm start' : 'npx tsx src/server.ts',
      cwd: '../server',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !ci,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        MONGODB_URI: process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/taskflow_e2e',
        CORS_ORIGINS: WEB_URL,
        JWT_ACCESS_SECRET: 'e2e-only-secret-not-used-anywhere-else-0123456789',
        BCRYPT_COST: '10',
        LOG_LEVEL: 'warn',
        MAIL_TRANSPORT: 'file',
        MAIL_OUTBOX_DIR: OUTBOX,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: !ci,
      timeout: 60_000,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
