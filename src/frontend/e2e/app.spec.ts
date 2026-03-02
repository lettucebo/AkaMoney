import { test, expect } from '@playwright/test';

test('has correct page title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/AkaMoney/);
});

test('login page displays sign in button', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Sign in with Microsoft/i })).toBeVisible();
});

test('login page displays heading', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});
