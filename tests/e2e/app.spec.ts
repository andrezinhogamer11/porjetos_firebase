import { expect, test } from '@playwright/test';

test('shows Firebase setup instructions when the project is not configured', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Configure as variáveis do Firebase')).toBeVisible();
});
