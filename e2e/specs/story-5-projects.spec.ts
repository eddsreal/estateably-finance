import { expect, Locator, Page, test } from '@playwright/test';

const run = Date.now();
const paris = `Paris e2e ${run}`;
const remodel = `Remodel e2e ${run}`;
const flights = `Flights ${run}`;
const hotel = `Hotel deposit ${run}`;
const taxi = `Untagged taxi ${run}`;

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

async function pickOption(
  page: Page,
  combo: Locator,
  optionText: string,
  direction: 'ArrowDown' | 'ArrowUp' = 'ArrowDown',
): Promise<void> {
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
    await combo.press(direction);
  }
  throw new Error(`option ${optionText} never became active`);
}

function dialog(page: Page): Locator {
  return page.getByRole('dialog');
}

function projectRow(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
}

async function createProject(page: Page, name: string, budget?: string): Promise<void> {
  await page.goto('/projects');
  await press(page.getByRole('button', { name: 'New project' }).first());
  const modal = dialog(page);
  await expect(modal.getByLabel('Name')).toBeFocused();
  await typeInto(modal.getByLabel('Name'), name);
  if (budget !== undefined) await typeInto(modal.getByLabel(/Budget/), budget);
  await press(modal.getByRole('button', { name: 'Create project' }));
  await expect(projectRow(page, name)).toBeVisible();
}

async function recordExpense(
  page: Page,
  description: string,
  amount: string,
  account: string,
  category: string,
  project?: string,
): Promise<void> {
  await page.goto('/transactions');
  await press(page.getByRole('button', { name: 'New transaction' }));
  const modal = dialog(page);
  await typeInto(modal.getByLabel('Amount'), amount);
  await typeInto(modal.getByLabel('Description'), description);
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), account);
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), category);
  if (project !== undefined) {
    await pickOption(page, modal.getByRole('combobox', { name: /Project/ }), project);
  }
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(page.getByRole('button', { name: description })).toBeVisible();
}

async function projectOptions(page: Page): Promise<Locator> {
  await page.goto('/transactions');
  await press(page.getByRole('button', { name: 'New transaction' }));
  await press(dialog(page).getByRole('combobox', { name: /Project/ }), 'Enter');
  return page.getByRole('listbox');
}

test('the seeded projects show spend, remaining and the over-budget overrun (US5 #4)', async ({
  page,
}) => {
  await page.goto('/');
  await press(page.getByRole('link', { name: 'Projects', exact: true }));
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  const trip = projectRow(page, 'Trip to France');
  await expect(trip).toContainText('active');
  await expect(trip).toContainText('$5,000.00');
  await expect(trip).toContainText('$585.00');
  await expect(trip).toContainText('$4,415.00');

  const office = projectRow(page, 'Home office');
  await expect(office).toContainText('closed');
  await expect(office).toContainText('Over budget');
  await expect(office).toContainText('$26.50 over');

  await press(page.getByRole('link', { name: 'Trip to France' }));
  await expect(page.getByRole('heading', { name: 'Trip to France' })).toBeVisible();
  const expenses = page.getByRole('table', { name: 'Expenses in Trip to France' });
  await expect(expenses).toContainText('Visa');
  await expect(expenses).toContainText('Checking');
});

test('expenses from two accounts and two categories add up; an untagged one does not count (US5 #1–#3)', async ({
  page,
}) => {
  await createProject(page, paris, '5,000.00');
  const created = projectRow(page, paris);
  await expect(created).toContainText('active');
  await expect(created).toContainText('$0.00');
  await expect(created).toContainText('$5,000.00');

  await recordExpense(page, flights, '800.00', 'Checking', 'Travel', paris);
  await recordExpense(page, hotel, '300.00', 'Savings', 'Dining', paris);
  await recordExpense(page, taxi, '50.00', 'Checking', 'Transport');

  await press(page.getByRole('link', { name: 'Projects', exact: true }));
  const row = projectRow(page, paris);
  await expect(row).toContainText('$1,100.00');
  await expect(row).toContainText('$3,900.00');
  await expect(row).not.toContainText('Over budget');

  await press(row.getByRole('link', { name: paris }));
  const expenses = page.getByRole('table', { name: `Expenses in ${paris}` });
  await expect(page.getByRole('row', { name: new RegExp(flights) })).toContainText('Checking');
  await expect(page.getByRole('row', { name: new RegExp(flights) })).toContainText('Travel');
  await expect(page.getByRole('row', { name: new RegExp(hotel) })).toContainText('Savings');
  await expect(page.getByRole('row', { name: new RegExp(hotel) })).toContainText('Dining');
  await expect(expenses).not.toContainText(taxi);
});

test('removing the project from an expense drops it from the total (US5 #5)', async ({ page }) => {
  await page.goto('/projects');
  await press(projectRow(page, paris).getByRole('link', { name: paris }));
  await press(page.getByRole('button', { name: flights }));
  const modal = dialog(page);
  await expect(modal.getByRole('combobox', { name: /Project/ })).toContainText(paris);
  await pickOption(page, modal.getByRole('combobox', { name: /Project/ }), 'No project', 'ArrowUp');
  await press(modal.getByRole('button', { name: 'Save changes' }));
  await expect(dialog(page)).toHaveCount(0);

  const expenses = page.getByRole('table', { name: `Expenses in ${paris}` });
  await expect(expenses.getByRole('button', { name: flights })).toHaveCount(0);
  await expect(expenses.getByRole('button', { name: hotel })).toBeVisible();
  await press(page.getByRole('link', { name: 'Back to projects' }));
  await expect(projectRow(page, paris)).toContainText('$300.00');
  await expect(projectRow(page, paris)).toContainText('$4,700.00');
});

test('deleting the seeded project is refused; close hides it, keeps its report, and reopen restores it (US5 #6)', async ({
  page,
}) => {
  await page.goto('/projects');
  await press(page.getByRole('button', { name: 'Delete Trip to France' }));
  await expect(page.getByRole('alert')).toContainText('DOMAIN_RULE_VIOLATION');
  await expect(page.getByRole('alert')).toContainText('close it instead');
  await expect(projectRow(page, 'Trip to France')).toContainText('$585.00');

  await press(page.getByRole('button', { name: 'Close Trip to France' }));
  await expect(projectRow(page, 'Trip to France')).toContainText('closed');
  await expect(projectRow(page, 'Trip to France')).toContainText('$585.00');

  await press(projectRow(page, 'Trip to France').getByRole('link', { name: 'Trip to France' }));
  await expect(page.getByRole('heading', { name: /Trip to France/ })).toContainText('closed');
  await expect(
    page.getByRole('table', { name: 'Expenses in Trip to France' }).getByRole('button', {
      name: 'Train tickets',
    }),
  ).not.toHaveCount(0);

  let options = await projectOptions(page);
  await expect(options.getByRole('option', { name: paris })).toBeVisible();
  await expect(options.getByRole('option', { name: 'Trip to France' })).toHaveCount(0);

  await page.goto('/projects');
  await press(page.getByRole('button', { name: 'Reopen Trip to France' }));
  const trip = projectRow(page, 'Trip to France');
  await expect(trip).toContainText('active');
  await expect(trip).toContainText('$585.00');
  await expect(trip).toContainText('$4,415.00');

  options = await projectOptions(page);
  await expect(options.getByRole('option', { name: 'Trip to France' })).toBeVisible();
});

test('income and transfers cannot carry a project (US5 #7)', async ({ page }) => {
  await page.goto('/transactions');
  await press(page.getByRole('button', { name: 'New transaction' }));
  const modal = dialog(page);
  await expect(modal.getByRole('combobox', { name: /Project/ })).toBeVisible();
  await press(modal.getByRole('radio', { name: 'Income' }), 'Space');
  await expect(modal.getByRole('combobox', { name: /Project/ })).toHaveCount(0);
  await press(modal.getByRole('radio', { name: 'Transfer' }), 'Space');
  await expect(modal.getByRole('combobox', { name: /Project/ })).toHaveCount(0);
});

test('a project without a budget shows no budget rather than zero, and an unused one can be deleted (US5 #8)', async ({
  page,
}) => {
  await createProject(page, remodel);
  const row = projectRow(page, remodel);
  await expect(row).toContainText('No budget');
  await expect(row).toContainText('—');
  await expect(row).not.toContainText('$0.00 over');

  await press(row.getByRole('link', { name: remodel }));
  await expect(page.getByText('No budget')).toBeVisible();
  await expect(page.getByText(/of a .* budget/)).toHaveCount(0);
  await expect(page.getByText('No expenses in this project yet')).toBeVisible();

  await press(page.getByRole('link', { name: 'Back to projects' }));
  await press(page.getByRole('button', { name: `Delete ${remodel}` }));
  await expect(projectRow(page, remodel)).toHaveCount(0);
});
