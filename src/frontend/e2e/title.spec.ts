import { expect, test } from '@playwright/test';

test.describe('Homepage title validation', () => {
  test('shows the correct browser tab title', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('AkaMoney - URL Shortener');
  });

  test('shows the AkaMoney brand in navbar', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.navbar-brand')).toContainText('AkaMoney');
  });
});
