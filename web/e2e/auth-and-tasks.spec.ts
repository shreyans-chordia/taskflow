import { expect, test, type Page } from '@playwright/test';

/**
 * The whole path a new user takes, on the real API and database:
 * sign up → "desk is ready" → add a task → reload (session survives) → tick it → sign out → sign in again.
 * Requirement IDs refer to the TaskFlow IEEE SRS.
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

  // Sign out, then back in.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await openSignIn(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Open my desk' }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
  await expect(page.getByText('Submit Lab 7 record')).toBeVisible();
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
