import { expect, test } from '@playwright/test';

test('the SPA loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Estateably Finance');
  await expect(page.locator('#root main')).toBeAttached();
});

test('/docs serves the frozen contract', async ({ page }) => {
  const yaml = await page.request.get('/docs/openapi.yaml');
  expect(yaml.ok()).toBe(true);
  expect(await yaml.text()).toContain('Estateably Finance API');

  await page.goto('/docs/');
  await expect(page).toHaveTitle('Estateably Finance API');
  await expect(page.getByText('Estateably Finance API', { exact: false }).first()).toBeVisible();
});
