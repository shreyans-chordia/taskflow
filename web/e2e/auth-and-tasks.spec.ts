import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * The whole path a new user takes, on the real API and database, with the 3D desk as the home screen:
 * sign up → "desk is ready" → open the corkboard → add a task → reload (session survives) → tick it → sign out →
 * sign in again with the emailed code. Requirement IDs refer to the TaskFlow IEEE SRS.
 */

const PASSWORD = 'Deskbound#7';
const unique = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/** Lands on the desk and opens the task list from the shortcut rail (the same as clicking the corkboard). */
async function openTasks(page: Page) {
  await page.getByRole('navigation', { name: 'Desk shortcuts' }).getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your tasks' })).toBeVisible();
}

/** Closes the open panel; the camera flies back and the top bar is reachable again. */
async function closePanel(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up your desk' })).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create my desk' }).click();
  await expect(page.getByRole('heading', { name: /Your desk is ready/ })).toBeVisible();
  await page.getByRole('button', { name: 'Go to my desk' }).click();
  await openTasks(page);
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
  await openTasks(page);
}

async function signOut(page: Page) {
  if (await page.getByRole('dialog').isVisible()) await closePanel(page);
  await page.getByRole('button', { name: /^TaskFlow account menu/ }).click(); // Sign out lives in the logo's menu
  await page.getByRole('button', { name: 'Sign out' }).click();
}

async function openSignIn(page: Page) {
  const welcome = page.getByRole('heading', { name: 'Welcome back' });
  if (!(await welcome.isVisible())) await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(welcome).toBeVisible();
}

test('a new user signs up, pins a task, and finds it again after signing back in (TASK-1, TASK-2, TASK-4, PR-1)', async ({ page }) => {
  test.slow(); // sign-up, two reloads and a sign-in each rebuild the room on CI's CPU-only renderer
  const email = unique('flow');
  await signUp(page, 'Shreyans', email);
  await expect(page.getByRole('button', { name: 'TaskFlow account menu, signed in as Shreyans' })).toBeVisible();

  // Add a task with an explicit priority level.
  await page.getByLabel('New task').fill('Submit Lab 7 record');
  await page.getByLabel('Priority').selectOption({ label: 'High' });
  await page.getByRole('button', { name: 'Pin it' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Submit Lab 7 record' });
  await expect(row).toContainText('High');

  // The session lives in HttpOnly cookies, so a reload keeps you signed in and the task comes back from the API.
  await page.reload();
  await openTasks(page);
  await expect(row).toBeVisible();

  // Mark it done; the state is saved on the server.
  await row.getByRole('checkbox').check();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await page.reload();
  await openTasks(page);
  await expect(page.getByRole('listitem').filter({ hasText: 'Submit Lab 7 record' }).getByRole('checkbox')).toBeChecked();

  // Sign out, then back in: password, then the code from the email (AUTH-6).
  await signOut(page);
  await signIn(page, email);
  await expect(page.getByText('Submit Lab 7 record')).toBeVisible();
});

test('a task gets every detail, a checklist and an edit, survives a reload, then is deleted (TASK-3, TASK-5, TASK-6, DL-1, CAT-2, SUB-1)', async ({ page }) => {
  test.slow();
  await signUp(page, 'Details', unique('detail'));
  const panel = page.getByRole('dialog');

  // The full form, from the list.
  await panel.getByRole('button', { name: '+ Add task' }).click();
  await expect(panel.getByRole('heading', { name: 'New task' })).toBeVisible();
  await panel.getByLabel('Title').fill('Write Lab 8 record');
  await panel.getByLabel('Description · optional').fill('State and interaction diagrams.');
  await panel.getByRole('button', { name: 'Study', exact: true }).click();
  await panel.getByRole('button', { name: 'Career', exact: true }).click();
  await panel.getByRole('radio', { name: 'High' }).click();
  await panel.getByLabel('Deadline · optional').fill('2030-01-15');
  await panel.getByLabel('Time · optional').fill('18:30');
  await panel.getByRole('button', { name: 'Pin to corkboard' }).click();
  await expect(panel.getByRole('status')).toContainText('Pinned “Write Lab 8 record”');
  await panel.getByRole('button', { name: 'Done' }).click();

  // Open it from the list: everything that was set is there.
  await panel.getByRole('button', { name: /^Write Lab 8 record/ }).click();
  await expect(panel.getByRole('heading', { name: 'Write Lab 8 record', exact: true })).toBeVisible();
  // exact: the sticky-note preview repeats the deadline inside a longer line.
  await expect(panel.getByText('High priority', { exact: true })).toBeVisible();
  await expect(panel.getByText('State and interaction diagrams.', { exact: true })).toBeVisible();
  await expect(panel.getByText('Due Tue 15 Jan 6:30 PM', { exact: true })).toBeVisible();

  // A checklist item, ticked.
  await panel.getByLabel('New checklist item').fill('Draw the state diagram');
  await panel.getByLabel('New checklist item').press('Enter');
  await panel.getByRole('checkbox', { name: 'Draw the state diagram' }).check();
  await expect(panel.getByText('Checklist · 1 of 1 done')).toBeVisible();

  // It is all on the server: a reload brings it back.
  await page.reload();
  await openTasks(page);
  await panel.getByRole('button', { name: /^Write Lab 8 record/ }).click();
  await expect(panel.getByText('Checklist · 1 of 1 done', { exact: true })).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: 'Draw the state diagram' })).toBeChecked();

  // Edit the title; saving returns to the task.
  await panel.getByRole('button', { name: 'Edit task' }).click();
  await panel.getByLabel('Title').fill('Write Lab 8 record (final)');
  await panel.getByRole('button', { name: 'Save changes' }).click();
  await expect(panel.getByRole('heading', { name: 'Write Lab 8 record (final)', exact: true })).toBeVisible();

  // Delete asks first, then lands back on the list.
  await panel.getByRole('button', { name: 'Delete', exact: true }).click();
  await panel.getByRole('button', { name: 'Delete task' }).click();
  await expect(panel.getByRole('status')).toContainText('Deleted “Write Lab 8 record (final)”.');
  await expect(panel.getByRole('button', { name: /^Write Lab 8 record/ })).toHaveCount(0);
});

test('the wall calendar shows a deadline and the search key finds the task (CAL-1, CAL-3, SF-1, SF-4, SF-5, SF-6)', async ({ page }) => {
  test.slow();
  await signUp(page, 'Planner', unique('plan'));
  const panel = page.getByRole('dialog');
  const rail = page.getByRole('navigation', { name: 'Desk shortcuts' });

  // A task due on the 15th of this month, with a word only its description holds.
  const now = new Date();
  const month = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const due = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
  await panel.getByRole('button', { name: '+ Add task' }).click();
  await panel.getByLabel('Title').fill('Viva for Lab 9');
  await panel.getByLabel('Description · optional').fill('Component and deployment diagrams.');
  await panel.getByLabel('Deadline · optional').fill(due);
  await panel.getByRole('button', { name: 'Pin to corkboard' }).click();
  await expect(panel.getByRole('status')).toContainText('Pinned “Viva for Lab 9”');
  await closePanel(page);

  // The wall calendar: the task sits on the 15th and opens from there; Back returns to the month.
  await rail.getByRole('button', { name: 'Calendar' }).click();
  await expect(panel.getByRole('heading', { name: month })).toBeVisible();
  const grid = panel.getByRole('table', { name: month });
  await expect(grid.getByRole('button', { name: /: 1 task$/ })).toHaveAccessibleName(/ 15 /);
  await grid.getByRole('button', { name: /^Viva for Lab 9/ }).click();
  await expect(panel.getByRole('heading', { name: 'Viva for Lab 9', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '← Back' }).click();
  await expect(panel.getByRole('heading', { name: month })).toBeVisible();
  await closePanel(page);

  // The search key: a word from the description finds it on the server; asking for complete tasks finds nothing.
  await rail.getByRole('button', { name: 'Search' }).click();
  await expect(panel.getByRole('searchbox', { name: 'Search' })).toBeFocused();
  await panel.getByRole('searchbox', { name: 'Search' }).fill('deployment');
  await expect(panel.getByText('1 match', { exact: true })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Matching tasks' })).toContainText('Viva for Lab 9');
  await panel.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Complete', exact: true }).click(); // exact: not "Incomplete"
  await expect(panel.getByText('No matching tasks. Try another keyword or loosen a filter.')).toBeVisible();
});

test('the desk opens a tray as that category and closes back to the room (CAT-2)', async ({ page }) => {
  await signUp(page, 'Trays', unique('tray'));
  await page.getByLabel('New task').fill('Revise normal forms');
  await page.getByRole('button', { name: 'Pin it' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Revise normal forms' })).toBeVisible();
  await closePanel(page);

  // "Categories" on the rail flies to the organizer; Escape brings the camera home and the rail back.
  const rail = page.getByRole('navigation', { name: 'Desk shortcuts' });
  await rail.getByRole('button', { name: 'Categories' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await closePanel(page);
  await expect(rail.getByRole('button', { name: 'Tasks', exact: true })).toBeEnabled();
});

test('a forgotten password is reset with an emailed code, and the old one stops working (AUTH-8, AUTH-9)', async ({ page }) => {
  const email = unique('reset');
  await signUp(page, 'Forgetful', email);
  await signOut(page);
  await openSignIn(page);

  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await latestCode(email));
  await page.getByLabel('New password', { exact: true }).fill('Brand-new#Pass9');
  await page.getByRole('button', { name: 'Save and open my desk' }).click();
  await openTasks(page);

  await signOut(page);
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
  await signOut(page);
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
