import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * src/config/env.ts validates the environment at import time and exits on bad config, so each case runs it in a
 * fresh child process with only the variables under test.
 */
function boot(overrides: Record<string, string>) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', "import('./src/config/env.ts')"], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://127.0.0.1:1/never-connected',
      DOTENV_CONFIG_PATH: 'no-such-file.env', // ignore any local .env
      ...overrides,
    },
    encoding: 'utf8',
  });
  return { code: result.status, stderr: result.stderr };
}

describe('JWT_ACCESS_SECRET validation at boot', () => {
  it('starts with a long random secret', () => {
    expect(boot({ JWT_ACCESS_SECRET: 'kS3v9QxZ2pLm7TnB4wYc8HdJ1fRgA6uE0oVi5' }).code).toBe(0);
  });

  it('refuses the placeholder copied from .env.example', () => {
    const { code, stderr } = boot({ JWT_ACCESS_SECRET: 'replace-me-with-a-long-random-string' });
    expect(code).toBe(1);
    expect(stderr).toContain('placeholder');
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(boot({ JWT_ACCESS_SECRET: 'kS3v9QxZ2pLm7TnB' }).code).toBe(1);
  });

  it('refuses a long but repetitive secret', () => {
    const { code, stderr } = boot({ JWT_ACCESS_SECRET: 'abababababababababababababababababab' });
    expect(code).toBe(1);
    expect(stderr).toContain('repetitive');
  });
});
