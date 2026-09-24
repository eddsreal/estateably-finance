import { expect, Locator, Page, test } from '@playwright/test';

const run = Date.now();
const checkingName = `E2E Checking ${run}`;
const savingsName = `E2E Savings ${run}`;
const cardName = `E2E Card ${run}`;
const categoryName = `Pets ${run}`;
const expenseDesc = `Market e2e ${run}`;
const incomeDesc = `Salary e2e ${run}`;
const transferDesc = `To savings e2e ${run}`;
const petsDesc = `Pets expense ${run}`;

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

test('creates accounts with positive, zero and negative opening balances (US1 #1, #11)', async ({
  page,
}) => {
  await page.goto('/');
  await press(page.getByRole('button', { name: 'New account' }));

  const modal = dialog(page);
  await expect(modal.getByLabel('Opening balance')).toBeFocused();
  await typeInto(modal.getByLabel('Opening balance'), '1500');
  await typeInto(modal.getByLabel('Name'), checkingName);
  await press(modal.getByRole('button', { name: 'Create account' }));
  const checkingRow = page.getByRole('row', { name: new RegExp(checkingName) });
  await expect(checkingRow).toContainText('$1,500.00');

  await press(page.getByRole('button', { name: 'New account' }));
  await typeInto(dialog(page).getByLabel('Name'), savingsName);
  await press(dialog(page).getByRole('button', { name: 'Create account' }));
  await expect(page.getByRole('row', { name: new RegExp(savingsName) })).toContainText('$0.00');

  await press(page.getByRole('button', { name: 'New account' }));
  const cardModal = dialog(page);
  await typeInto(cardModal.getByLabel('Opening balance'), '-500');
  await typeInto(cardModal.getByLabel('Name'), cardName);
  await press(cardModal.getByRole('radio', { name: 'Card' }), 'Space');
  await press(cardModal.getByRole('button', { name: 'Create account' }));
  await expect(page.getByRole('row', { name: new RegExp(cardName) })).toContainText('-$500.00');
});

test('records an expense, an income and a transfer whose balances update without a reload (US1 #2–#4)', async ({
  page,
}) => {
  await page.goto('/transactions');
  await page.evaluate(() => {
    (globalThis as { __noReloadMarker?: boolean }).__noReloadMarker = true;
  });

  await press(page.getByRole('button', { name: 'New transaction' }));
  let modal = dialog(page);
  await expect(modal.getByLabel('Amount')).toBeFocused();
  await typeInto(modal.getByLabel('Amount'), '42.50');
  await typeInto(modal.getByLabel('Description'), expenseDesc);
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), checkingName);
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), 'Groceries');
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(page.getByRole('button', { name: expenseDesc })).toBeVisible();

  await press(page.getByRole('button', { name: 'New transaction' }));
  modal = dialog(page);
  await press(modal.getByRole('radio', { name: 'Income' }), 'Space');
  await typeInto(modal.getByLabel('Amount'), '3,000.00');
  await typeInto(modal.getByLabel('Description'), incomeDesc);
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), checkingName);
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), 'Salary');
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(page.getByRole('button', { name: incomeDesc })).toBeVisible();

  await press(page.getByRole('button', { name: 'New transaction' }));
  modal = dialog(page);
  await press(modal.getByRole('radio', { name: 'Transfer' }), 'Space');
  await typeInto(modal.getByLabel('Amount'), '500');
  await typeInto(modal.getByLabel('Description'), transferDesc);
  await pickOption(page, modal.getByRole('combobox', { name: 'From account' }), checkingName);
  await pickOption(page, modal.getByRole('combobox', { name: 'To account' }), savingsName);
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(page.getByRole('button', { name: transferDesc })).toBeVisible();

  const markerSurvived = await page.evaluate(
    () => (globalThis as { __noReloadMarker?: boolean }).__noReloadMarker === true,
  );
  expect(markerSurvived).toBe(true);

  await press(page.getByRole('link', { name: 'Accounts', exact: true }));
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(checkingName) })).toContainText(
    '$3,957.50',
  );
  await expect(page.getByRole('row', { name: new RegExp(savingsName) })).toContainText('$500.00');
});

test('shows dollars, never raw cents, everywhere (SC-009)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('row', { name: new RegExp(checkingName) })).toContainText(
    '$3,957.50',
  );
  await expect(page.locator('body')).not.toContainText('395750');
  await expect(page.locator('body')).not.toContainText('-50000');
});

test('edits a transaction into another kind and sees both balances move (US1 #5, #5a)', async ({
  page,
}) => {
  await page.goto('/transactions');
  await press(page.getByRole('button', { name: expenseDesc }).first());
  const modal = dialog(page);
  await press(modal.getByRole('radio', { name: 'Transfer' }), 'Space');
  await expect(modal.getByRole('combobox', { name: 'Category' })).toHaveCount(0);
  await typeInto(modal.getByLabel('Amount'), '50');
  await pickOption(page, modal.getByRole('combobox', { name: 'To account' }), savingsName);
  await press(modal.getByRole('button', { name: 'Save changes' }));
  await expect(dialog(page)).toHaveCount(0);

  await press(page.getByRole('link', { name: 'Accounts', exact: true }));
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(savingsName) })).toContainText('$550.00');
  await expect(page.getByRole('row', { name: new RegExp(checkingName) })).toContainText(
    '$3,950.00',
  );
});

test('rejects invalid input with errors tied to their fields (US1 #7)', async ({ page }) => {
  await page.goto('/transactions');
  await press(page.getByRole('button', { name: 'New transaction' }));
  const modal = dialog(page);
  await typeInto(modal.getByLabel('Amount'), 'not money');
  await typeInto(modal.getByLabel('Description'), 'Broken');
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(modal.getByText('Enter a dollar amount like 1,234.50')).toBeVisible();
  await expect(modal.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true');
  await expect(modal.getByLabel('Amount')).toBeFocused();

  await typeInto(modal.getByLabel('Amount'), '10');
  await modal.getByLabel('Date').fill('2999-01-01');
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), checkingName);
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), 'Groceries');
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(modal.getByText('must be today or earlier')).toBeVisible();
  await expect(modal.getByLabel('Date')).toHaveAttribute('aria-invalid', 'true');
  await press(modal.getByRole('button', { name: 'Cancel' }));
});

test('a new category is immediately usable on an expense, and deleting removes it everywhere (US1 #6, #10)', async ({
  page,
}) => {
  await page.goto('/categories');
  await press(page.getByRole('button', { name: 'New category' }));
  await typeInto(dialog(page).getByLabel('Name'), categoryName);
  await press(dialog(page).getByRole('button', { name: 'Create category' }));
  await expect(page.getByRole('row', { name: new RegExp(categoryName) })).toBeVisible();

  await press(page.getByRole('link', { name: 'Transactions', exact: true }));
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await press(page.getByRole('button', { name: 'New transaction' }));
  const modal = dialog(page);
  await typeInto(modal.getByLabel('Amount'), '12.34');
  await typeInto(modal.getByLabel('Description'), petsDesc);
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), checkingName);
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), categoryName);
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(page.getByRole('button', { name: petsDesc })).toBeVisible();

  await press(page.getByRole('button', { name: petsDesc }));
  await press(dialog(page).getByRole('button', { name: 'Delete' }));
  await expect(page.getByRole('button', { name: petsDesc })).toHaveCount(0);
});

test('archives an account out of the list and totals, then restores it intact (US1 #9)', async ({
  page,
}) => {
  await page.goto('/');
  const totalBefore = await page.getByRole('status', { name: 'Total across accounts' }).innerText();
  const cardRow = page.getByRole('row', { name: new RegExp(cardName) });
  await press(cardRow.getByRole('button', { name: 'Archive' }));
  await expect(page.getByRole('row', { name: new RegExp(cardName) })).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Total across accounts' })).not.toHaveText(
    totalBefore,
  );

  await press(page.getByLabel('Show archived accounts'), 'Space');
  const archivedRow = page.getByRole('row', { name: new RegExp(cardName) });
  await expect(archivedRow).toContainText('archived');
  await press(archivedRow.getByRole('button', { name: 'Unarchive' }));
  await expect(page.getByRole('row', { name: new RegExp(cardName) })).toContainText('-$500.00');
  await press(page.getByLabel('Show archived accounts'), 'Space');
  await expect(page.getByRole('status', { name: 'Total across accounts' })).toHaveText(totalBefore);
});
