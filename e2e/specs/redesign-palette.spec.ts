import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

const API = 'http://localhost:3000';
const run = Date.now();
const today = new Intl.DateTimeFormat('en-CA').format(new Date());

type Transaction = { id: string; date: string; description: string };

test.describe.configure({ mode: 'serial' });

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function press(locator: Locator, key = 'Enter'): Promise<void> {
  await locator.focus();
  await locator.press(key);
}

async function search(request: APIRequestContext, q: string) {
  const response = await request.get(`${API}/transactions?q=${encodeURIComponent(q)}&limit=8`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { items: Transaction[]; total: number };
}

async function openPalette(page: Page, opener: Locator): Promise<Locator> {
  await press(opener);
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  const input = palette.getByRole('combobox');
  await expect(input).toBeFocused();
  return input;
}

test.beforeAll(async ({ request }) => {
  const account = (await (await request.get(`${API}/accounts`)).json()).items.find(
    (item: { archived: boolean }) => !item.archived,
  );
  const category = (await (await request.get(`${API}/categories`)).json()).find(
    (item: { type: string; archived: boolean }) => item.type === 'expense' && !item.archived,
  );
  for (const days of [-2, -1]) {
    const created = await request.post(`${API}/transactions`, {
      data: {
        kind: 'expense',
        date: addDays(today, days),
        description: `Palette ${run} uber ${days}`,
        amount: '1290',
        accountId: account.id,
        categoryId: category.id,
      },
    });
    expect(created.status()).toBe(201);
  }
});

test.afterAll(async ({ request }) => {
  for (const item of (await search(request, `palette ${run} uber`)).items) {
    expect((await request.delete(`${API}/transactions/${item.id}`)).ok()).toBe(true);
  }
});

test('"uber" lists matching transactions newest first with the total count (US5 #1)', async ({
  page,
  request,
}) => {
  const expected = await search(request, 'uber');
  expect(expected.items.length).toBeGreaterThan(0);
  const dates = expected.items.map((item) => item.date);
  expect(dates).toEqual([...dates].sort().reverse());

  await page.goto('/report');
  const input = await openPalette(page, page.getByRole('button', { name: /^Search/ }));
  await input.pressSequentially('uber');

  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const transactions = palette.getByRole('group', { name: 'Transactions' }).getByRole('option');
  await expect(transactions).toHaveCount(expected.items.length);
  for (const [index, item] of expected.items.entries()) {
    await expect(transactions.nth(index)).toContainText(item.description);
  }
  await expect(palette.getByRole('status')).toHaveText(
    expected.total === 1 ? '1 result' : `${expected.total} results`,
  );
});

test('Enter opens the edit form over the current screen, and closing it returns focus to the opener (US5 #2)', async ({
  page,
  request,
}) => {
  const [newest, older] = (await search(request, `palette ${run} uber`)).items;
  expect(newest.date > older.date).toBe(true);

  await page.goto('/report');
  const opener = page.getByRole('button', { name: /^Search/ });
  const input = await openPalette(page, opener);
  await input.pressSequentially(`palette ${run} uber`);
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette.getByRole('option')).toHaveCount(2);
  await expect(palette.getByRole('status')).toHaveText('2 results');

  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(palette).toBeHidden();
  const form = page.getByRole('dialog', { name: 'Edit transaction' });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Description')).toHaveValue(older.description);
  expect(new URL(page.url()).pathname).toBe('/report');
  await expect(page.locator('main h1')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(palette).toBeHidden();
});

test('⌘K/Ctrl+K opens the palette from anywhere, Esc returns focus, Enter on a report navigates', async ({
  page,
}) => {
  await page.goto('/transactions');
  const opener = page.getByRole('link', { name: 'Upcoming' });
  await opener.focus();
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const input = palette.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.pressSequentially('proj');
  await expect(palette.getByRole('group', { name: 'Reports' }).getByRole('option')).toHaveText([
    /Projection/,
    /Projects/,
  ]);
  await input.press('Escape');
  await expect(palette).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(/\/transactions$/);

  await page.keyboard.press('ControlOrMeta+k');
  await input.pressSequentially('proj');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page).toHaveURL(/\/projects$/);
});
