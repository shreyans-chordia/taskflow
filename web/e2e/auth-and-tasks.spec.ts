import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * The whole path a new user takes, on the real API and database:
 * sign up → "desk is ready" → add a task → reload (session survives) → tick it → sign out → sign in again
 * with the emailed code. Requirement IDs refer to the TaskFlow IEEE SRS.
 */

const PASSWORD = 'Deskbound#7';
const unique = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up your desk' })).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create my desk' }).click();
  await expect(page.getByRole('heading', { name: /Your desk is ready/ })).toBeVisible();
  await page.getByRole('button', { name: 'Go to my desk' }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
}

/** The 6-digit code in the newest email the API wrote for `to` (see MAIL_TRANSPORT=file in playwright.config.ts). */
async function latestCode(to: string): Promise<string> {
  const dir = process.env.E2E_OUTBOX!;
  let code = '';
  await expect
    .poll(async () => {
      const files = (await readdir(dir).catch(() => [])).sort().reverse();
      for (const f of files) {
        const mail = JSON.parse(await readFile(path.join(dir, f), 'utf8')) as { to: string; text: string };
        const found = mail.to === to ? mail.text.match(/\b(\d{6})\b/)?.[1] : undefined;
        if (found) return (code = found); // skips mails without a code, such as the "password changed" notice
      }
      return '';
    })
    .toMatch(/^\d{6}$/);
  return code;
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await openSignIn(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open my desk' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await latestCode(email));
  await page.getByRole('button', { name: 'Verify and open my desk' }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
}

async function openSignIn(page: Page) {
  const welcome = page.getByRole('heading', { name: 'Welcome back' });
  if (!(await welcome.isVisible())) await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(welcome).toBeVisible();
}

test('a new user signs up, pins a task, and finds it again after signing back in (TASK-1, TASK-2, TASK-4, PR-1)', async ({ page }) => {
  const email = unique('flow');
  await signUp(page, 'Shreyans', email);
  await expect(page.getByText('Signed in as')).toContainText('Shreyans');

  // Add a task with an explicit priority level.
  await page.getByLabel('New task').fill('Submit Lab 7 record');
  await page.getByLabel('Priority').selectOption({ label: 'High' });
  await page.getByRole('button', { name: 'Pin it' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Submit Lab 7 record' });
  await expect(row).toContainText('High');

  // The session lives in HttpOnly cookies, so a reload keeps you signed in and the task comes back from the API.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
  await expect(row).toBeVisible();

  // Mark it done; the state is saved on the server.
  await row.getByRole('checkbox').check();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: 'Submit Lab 7 record' }).getByRole('checkbox')).toBeChecked();

  // Sign out, then back in: password, then the code from the email (AUTH-6).
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, email);
  await expect(page.getByText('Submit Lab 7 record')).toBeVisible();
});

test('a forgotten password is reset with an emailed code, and the old one stops working (AUTH-8, AUTH-9)', async ({ page }) => {
  const email = unique('reset');
  await signUp(page, 'Forgetful', email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await openSignIn(page);

  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await latestCode(email));
  await page.getByLabel('New password').fill('Brand-new#Pass9');
  await page.getByRole('button', { name: 'Save and open my desk' }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await openSignIn(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Open my desk' }).click();
  await expect(page.getByRole('alert')).toContainText(/email or password/i);
  await signIn(page, email, 'Brand-new#Pass9');
});

test('session cookies are invisible to page scripts', async ({ page }) => {
  await signUp(page, 'Cookie check', unique('cookie'));
  // tf_at and tf_rt are HttpOnly; only the CSRF cookie may be readable, and even that is not needed by the app.
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain('tf_at');
  expect(visible).not.toContain('tf_rt');
});

test('a wrong password gets one generic message', async ({ page }) => {
  const email = unique('wrong');
  await signUp(page, 'Wrong', email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await openSignIn(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Open my desk' }).click();
  await expect(page.getByRole('alert')).toContainText(/email or password/i);
});

test("one account never sees another account's tasks", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();

  await signUp(pa, 'Alice', unique('alice'));
  await pa.getByLabel('New task').fill('Alice private task');
  await pa.getByRole('button', { name: 'Pin it' }).click();
  await expect(pa.getByText('Alice private task')).toBeVisible();

  await signUp(pb, 'Bob', unique('bob'));
  await expect(pb.getByText('Nothing pinned yet')).toBeVisible();
  await expect(pb.getByText('Alice private task')).toHaveCount(0);

  await a.close();
  await b.close();
});
