import { expect, Locator, test } from '@playwright/test';

function isoDate(monthOffset: number, day: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + monthOffset, day))
    .toISOString()
    .slice(0, 10);
}

const from = isoDate(-2, 1);
const to = new Intl.DateTimeFormat('en-CA').format(new Date());

test.describe.configure({ mode: 'serial' });

async function press(locator: Locator, key = 'Enter'): Promise<void> {
  await locator.focus();
  await locator.press(key);
}

test('groups the seeded Uber rides and highlights the top group and top 5, keyboard only (US6 #1, #2)', async ({
  page,
}) => {
  await page.goto('/');
  await press(page.getByRole('link', { name: 'Similar' }));
  await expect(page.getByRole('heading', { name: 'Similar transactions' })).toBeVisible();
  await expect(page.getByText('No report yet')).toBeVisible();

  await page.getByLabel('From').fill(from);
  await page.getByLabel('To').fill(to);
  await press(page.getByRole('button', { name: 'Generate report' }));

  const groups = page.getByRole('table', { name: /^Groups from/ });
  const uber = groups.getByRole('row').filter({ has: page.getByRole('cell', { name: 'uber' }) });
  await expect(uber).toContainText('3');
  await expect(uber).toContainText('$54.90');
  await expect(groups.getByText('Most expensive group')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('5490');

  const top = page.getByRole('table', { name: 'Top 5 most expensive' });
  await expect(top.getByRole('row')).toHaveCount(6);
  await expect(top).toContainText('$');
});

test('the AI narrative button ends disabled and says why when no key is configured (FR-015)', async ({
  page,
}) => {
  test.skip(Boolean(process.env.LLM_API_KEY), 'the stack has an LLM key configured');
  await page.goto('/similar');
  await page.getByLabel('From').fill(from);
  await page.getByLabel('To').fill(to);
  await press(page.getByRole('button', { name: 'Generate report' }));
  await expect(page.getByRole('table', { name: 'Top 5 most expensive' })).toBeVisible();

  const narrative = page.getByRole('button', { name: '✦ AI narrative' });
  await press(narrative);
  await expect(narrative).toBeDisabled();
  await expect(narrative).toHaveAttribute(
    'title',
    'AI narrative is disabled: no API key configured.',
  );
  await expect(page.getByText('AI narrative is disabled: no API key configured.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Top 5 most expensive' })).toBeVisible();
});
