import { expect, Locator, Page, test } from '@playwright/test';

const run = Date.now();
const API = 'http://localhost:3000';
const expenseDesc = `Report groceries us3 ${run}`;

async function expectRecorded(page: Page, description: string): Promise<void> {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const response = await page.request.get(
    `${API}/transactions?q=${encodeURIComponent(description)}`,
  );
  expect((await response.json()).total).toBe(1);
}

function isoDate(monthOffset: number, day: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + monthOffset, day))
    .toISOString()
    .slice(0, 10);
}

function monthLabel(monthOffset: number): string {
  const now = new Date();
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(now.getFullYear(), now.getMonth() + monthOffset, 1)));
}

const currentMonthDate = isoDate(0, 1);
const lastMonthDate = isoDate(-1, 1);

function parseDollars(text: string): bigint {
  return BigInt(text.replace(/[$,.]/g, ''));
}

test.describe.configure({ mode: 'serial' });

async function press(locator: Locator, key = 'Enter'): Promise<void> {
  await locator.focus();
  await locator.press(key);
}

async function typeInto(locator: Locator, text: string): Promise<void> {
  await locator.focus();
  await locator.fill('');
  await locator.pressSequentially(text);
}

async function pickOption(page: Page, combo: Locator, optionText: string): Promise<void> {
  await press(combo, 'Enter');
  for (let step = 0; step < 40; step += 1) {
    const activeId = await combo.getAttribute('aria-activedescendant');
    if (activeId) {
      const active = page.locator(`[id="${activeId}"]`);
      if ((await active.innerText()).startsWith(optionText)) {
        await combo.press('Enter');
        return;
      }
    }
    await combo.press('ArrowDown');
  }
  throw new Error(`option ${optionText} never became active`);
}

function groceriesSummary(page: Page): Locator {
  return page.locator('summary').filter({ hasText: 'Groceries' });
}

test('category totals sum to the grand total and drill down shows the expenses behind them (US3 #1, #3)', async ({
  page,
}) => {
  await page.goto('/transactions');
  await press(page.getByRole('button', { name: 'New transaction' }));
  const modal = page.getByRole('dialog');
  await typeInto(modal.getByLabel('Amount'), '55.25');
  await typeInto(modal.getByLabel('Description'), expenseDesc);
  await modal.getByLabel('Date').fill(currentMonthDate);
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), 'Checking');
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), 'Groceries');
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expectRecorded(page, expenseDesc);

  await press(page.getByRole('link', { name: 'Monthly expenses', exact: true }));
  await expect(page.getByRole('heading', { name: 'Monthly report' })).toBeVisible();
  await expect(page.getByText(monthLabel(0)).first()).toBeVisible();

  const spent = page.getByRole('status', { name: /^Spent in / });
  await expect(spent).toHaveText(/^-?\$[\d,]+\.\d{2}$/);
  const grandTotal = parseDollars(await spent.innerText());
  const categoryTotals = (await page.locator('summary').allInnerTexts()).map((text) =>
    text.match(/-?\$[\d,]+\.\d{2}/g)!.at(-1)!,
  );
  expect(categoryTotals.length).toBeGreaterThan(0);
  const summed = categoryTotals.reduce((sum, text) => sum + parseDollars(text), 0n);
  expect(summed).toBe(grandTotal);

  await press(groceriesSummary(page), 'Enter');
  await expect(page.getByRole('button', { name: expenseDesc })).toBeVisible();
  await expect(page.getByText('$55.25').first()).toBeVisible();
});

test('an expense edited into last month moves between both reports, month switch without a reload (US3 #4, #5)', async ({
  page,
}) => {
  await page.goto('/report');
  await page.evaluate(() => {
    (globalThis as { __noReloadMarker?: boolean }).__noReloadMarker = true;
  });

  await press(groceriesSummary(page), 'Enter');
  await press(page.getByRole('button', { name: expenseDesc }));
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Date').fill(lastMonthDate);
  await press(modal.getByRole('button', { name: 'Save changes' }));
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('button', { name: expenseDesc })).not.toBeVisible();

  await press(page.getByRole('button', { name: 'Previous month' }));
  await expect(page.getByText(monthLabel(-1)).first()).toBeVisible();
  await press(groceriesSummary(page), 'Enter');
  await expect(page.getByRole('button', { name: expenseDesc })).toBeVisible();

  const markerSurvived = await page.evaluate(
    () => (globalThis as { __noReloadMarker?: boolean }).__noReloadMarker === true,
  );
  expect(markerSurvived).toBe(true);
});
