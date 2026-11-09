const { test, expect } = require('@playwright/test');

test('login page renders and switches from Password to PIN mode', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Masuk ke akun Anda' })).toBeVisible();
  await expect(page.getByLabel('Email / Username')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();

  await page.getByRole('button', { name: 'PIN' }).click();

  await expect(page.getByLabel('PIN (6 digit)')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
});
