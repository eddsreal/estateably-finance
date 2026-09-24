import { expect, Locator, Page, test } from '@playwright/test';

const run = Date.now();
const accountName = `US2 Checking ${run}`;
const expenseDesc = `Market us2 ${run}`;
const incomeDesc = `Salary us2 ${run}`;
const lateIncomeDesc = `Bonus us2 ${run}`;

function isoDate(monthOffset: number, day: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + monthOffset, day))
    .toISOString()
    .slice(0, 10);
}

const openingDate = isoDate(-1, 1);
const expenseDate = isoDate(-1, 10);
const incomeDate = isoDate(-1, 15);
const betweenDate = isoDate(-1, 12);
const beforeDate = isoDate(-2, 15);

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

function dialog(page: Page): Locator {
  return page.getByRole('dialog');
}

async function recordTransaction(
  page: Page,
  kindRadio: string | null,
  amount: string,
  description: string,
  date: string | null,
  category: string,
): Promise<void> {
  await press(page.getByRole('button', { name: 'New transaction' }));
  const modal = dialog(page);
  if (kindRadio) {
    await press(modal.getByRole('radio', { name: kindRadio }), 'Space');
  }
  await typeInto(modal.getByLabel('Amount'), amount);
  await typeInto(modal.getByLabel('Description'), description);
  if (date) {
    await modal.getByLabel('Date').fill(date);
  }
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), accountName);
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), category);
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(page.getByRole('button', { name: description })).toBeVisible();
}

test('as-of balances match hand arithmetic before, between, on-date and today (US2 #1–#5)', async ({
  page,
}) => {
  await page.goto('/');
  await press(page.getByRole('button', { name: 'New account' }));
  const modal = dialog(page);
  await typeInto(modal.getByLabel('Opening balance'), '1500');
  await typeInto(modal.getByLabel('Name'), accountName);
  await modal.getByLabel('Opening date').fill(openingDate);
  await press(modal.getByRole('button', { name: 'Create account' }));
  await expect(page.getByRole('row', { name: new RegExp(accountName) })).toContainText('$1,500.00');

  await press(page.getByRole('link', { name: 'Transactions', exact: true }));
  await recordTransaction(page, null, '42.50', expenseDesc, expenseDate, 'Groceries');
  await recordTransaction(page, 'Income', '3,000.00', incomeDesc, incomeDate, 'Salary');

  await press(page.getByRole('link', { name: 'Accounts', exact: true }));
  await press(page.getByRole('link', { name: accountName }));
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Current balance' })).toHaveText('$4,457.50');

  const asOfInput = page.getByLabel('Balance as of');
  const asOfValue = page.getByRole('status', { name: /^Balance on / });

  await asOfInput.fill(betweenDate);
  await expect(page.getByText(`Balance on ${betweenDate}`)).toBeVisible();
  await expect(asOfValue).toHaveText('$1,457.50');

  await asOfInput.fill(expenseDate);
  await expect(page.getByText(`Balance on ${expenseDate}`)).toBeVisible();
  await expect(asOfValue).toHaveText('$1,457.50');

  await asOfInput.fill(beforeDate);
  await expect(page.getByText(`Balance on ${beforeDate}`)).toBeVisible();
  await expect(asOfValue).toHaveText('$0.00');
});

test('balances and the total update after a new transaction without a full-page reload (US2 #6, #8, FR-028)', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    (globalThis as { __noReloadMarker?: boolean }).__noReloadMarker = true;
  });
  const accountRow = page.getByRole('row', { name: new RegExp(accountName) });
  await expect(accountRow).toContainText('$4,457.50');
  const totalBefore = await page.getByRole('status', { name: 'Total across accounts' }).innerText();

  await press(page.getByRole('link', { name: 'Transactions', exact: true }));
  await recordTransaction(page, 'Income', '100', lateIncomeDesc, null, 'Salary');

  await press(page.getByRole('link', { name: 'Accounts', exact: true }));
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(accountName) })).toContainText('$4,557.50');
  await expect(page.getByRole('status', { name: 'Total across accounts' })).not.toHaveText(
    totalBefore,
  );

  await press(page.getByRole('link', { name: accountName }));
  await expect(page.getByRole('status', { name: 'Current balance' })).toHaveText('$4,557.50');

  const markerSurvived = await page.evaluate(
    () => (globalThis as { __noReloadMarker?: boolean }).__noReloadMarker === true,
  );
  expect(markerSurvived).toBe(true);
});
