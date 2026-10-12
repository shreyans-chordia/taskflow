import { expect, test } from '@playwright/test';

/**
 * Runs in the "chromium-no-webgl" project, where the browser has 3D graphics switched off.
 * The app must still work: it shows the plain task list instead of the desk, with calendar and search as tabs
 * (TASK-1, TASK-2, CAL-1, SF-1).
 */

const unique = () => `flat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

test('without WebGL the home screen is the 2D task list, fully usable', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Flat');
  await page.getByLabel('Email').fill(unique());
  await page.getByLabel('Password', { exact: true }).fill('Deskbound#7');
  await page.getByRole('button', { name: 'Create my desk' }).click();
  await page.getByRole('button', { name: 'Go to my desk' }).click();

  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Desk shortcuts' })).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(0);

  await page.getByLabel('New task').fill('Works in 2D too');
  await page.getByRole('button', { name: 'Pin it' }).click();
  await page.reload();
  await expect(page.getByText('Works in 2D too')).toBeVisible();

  // The calendar and search are tabs here, in place of the desk's objects (CAL-1, SF-1).
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  await tabs.getByRole('button', { name: 'Calendar' }).click();
  await expect(page.getByRole('heading', { name: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) })).toBeVisible();
  await tabs.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('2D');
  await expect(page.getByRole('list', { name: 'Matching tasks' })).toContainText('Works in 2D too');
});
