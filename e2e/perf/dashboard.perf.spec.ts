import { expect, test } from '@playwright/test';

const BUDGET_MS = 2000;

test('the dashboard with its 1Y chart is usable within 2 s on the perf seed (SC-006)', async ({
  page,
}) => {
  const started = Date.now();
  await page.goto('/');
  const range = page.getByRole('radio', { name: '1Y' });
  await range.focus();
  await range.press('Space');

  const slider = page.getByRole('slider', { name: 'Total balance by day' });
  await expect(slider).toHaveAttribute('max', '364');
  await expect(page.getByRole('status', { name: 'Total across accounts' })).toBeVisible();
  await expect(page.locator('.recharts-area-curve')).toBeVisible();
  await slider.focus();
  await slider.press('End');
  await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('363');

  expect(Date.now() - started).toBeLessThan(BUDGET_MS);
});
