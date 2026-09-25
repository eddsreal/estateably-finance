import { expect, Locator, Page, test } from '@playwright/test';

const run = Date.now();
const billDesc = `Rent e2e ${run}`;
const paidDesc = `Rent e2e paid ${run}`;
const overdraftDesc = `Overdraft e2e ${run}`;
const API = 'http://localhost:3000';

function localDate(offsetDays: number): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA').format(now);
}

function addMonthClamped(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

const dueDate = localDate(2);
const confirmDate = localDate(-1);
const advancedDate = addMonthClamped(dueDate);

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

function upcomingItem(page: Page, description: string): Locator {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: description, exact: true }) });
}

test('seeded items are listed by due date with relative labels and the overdue flag (US4 #1, FR-017)', async ({
  page,
}) => {
  await page.goto('/upcoming');
  await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
  for (const name of ['Property tax', 'Storage rent', 'Dog walking', 'Gym trial', 'Water bill']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  const waterItem = upcomingItem(page, 'Water bill');
  await expect(waterItem).toContainText(/⚠ Overdue \d+ days/);
  await expect(waterItem).toContainText('2 missed');
  await expect(upcomingItem(page, 'Dog walking')).toContainText(/Today|Tomorrow|In \d+ days/);

  const dates = await page
    .locator('li time[datetime]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('datetime') ?? ''));
  expect(dates.length).toBeGreaterThan(4);
  expect([...dates].sort((a, b) => a.localeCompare(b))).toEqual(dates);
});

test('the projection starts from the dashboard total and flags the below-zero occurrence (US4 #5, SC-005)', async ({
  page,
}) => {
  const accounts = await (await page.request.get(`${API}/accounts`)).json();
  const categories = await (await page.request.get(`${API}/categories`)).json();
  const created = await page.request.post(`${API}/scheduled-items`, {
    data: {
      kind: 'bill',
      description: overdraftDesc,
      amount: '100000000',
      accountId: accounts.items.find((account: { name: string }) => account.name === 'Checking').id,
      categoryId: categories.find((category: { name: string }) => category.name === 'Utilities').id,
      nextDueDate: localDate(1),
      recurrence: 'once',
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
    const dashboardTotal = page.getByRole('status', { name: 'Total across accounts' });
    await expect(dashboardTotal).toHaveAttribute('aria-busy', 'false');
    const dashboardText = await dashboardTotal.innerText();

    await press(page.getByRole('link', { name: 'Projection', exact: true }));
    await expect(page.getByRole('heading', { name: 'Projection' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Current total' })).toHaveText(dashboardText);
    await expect(page.getByRole('row', { name: new RegExp(overdraftDesc) })).toContainText(
      'Below $0.00',
    );
    await expect(page.getByRole('row', { name: /Property tax/ })).toContainText('-$9,000.00');
  } finally {
    await page.request.delete(`${API}/scheduled-items/${id}`);
  }
});

test('a bill can be created, marked paid with a changed amount and date, and everything updates (US4 #6, #7, #7a)', async ({
  page,
}) => {
  await page.goto('/upcoming');
  await press(page.getByRole('button', { name: 'New scheduled item' }));
  const createModal = dialog(page);
  await typeInto(createModal.getByLabel('Amount'), '1,200.00');
  await typeInto(createModal.getByLabel('Description'), billDesc);
  await pickOption(page, createModal.getByRole('combobox', { name: 'Account' }), 'Checking');
  await pickOption(page, createModal.getByRole('combobox', { name: 'Category' }), 'Rent');
  await createModal.getByLabel('Next due date').fill(dueDate);
  await press(createModal.getByRole('button', { name: 'Create scheduled item' }));
  const billItem = upcomingItem(page, billDesc);
  await expect(billItem).toContainText('$1,200.00');
  await expect(billItem.locator(`time[datetime="${dueDate}"]`)).toBeVisible();

  await press(page.getByRole('link', { name: 'Projection', exact: true }));
  await expect(page.getByRole('row', { name: new RegExp(billDesc) }).first()).toContainText(
    '-$1,200.00',
  );
  const projectedBefore = await page.getByRole('status', { name: 'Current total' }).innerText();

  await press(page.getByRole('link', { name: 'Upcoming', exact: true }));
  await press(upcomingItem(page, billDesc).getByRole('button', { name: 'Mark paid' }));
  const confirmModal = dialog(page);
  await expect(confirmModal.getByLabel('Amount')).toHaveValue('1,200.00');
  await typeInto(confirmModal.getByLabel('Amount'), '1,250.00');
  await expect(confirmModal.getByText('Scheduled: $1,200.00')).toBeVisible();
  await confirmModal.getByLabel('Date').fill(confirmDate);
  await typeInto(confirmModal.getByLabel('Description'), paidDesc);
  await press(confirmModal.getByRole('button', { name: 'Record payment' }));

  const advancedItem = upcomingItem(page, billDesc);
  await expect(advancedItem.locator(`time[datetime="${advancedDate}"]`)).toBeVisible();
  await expect(advancedItem).toContainText('$1,200.00');

  const paid = await page.request.get(`${API}/transactions?q=${encodeURIComponent(paidDesc)}`);
  const { items } = await paid.json();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ date: confirmDate, amount: '125000' });

  await press(page.getByRole('link', { name: 'Projection', exact: true }));
  await expect(page.getByRole('status', { name: 'Current total' })).not.toHaveText(projectedBefore);

  await press(page.getByRole('link', { name: 'Monthly expenses', exact: true }));
  await expect(page.getByRole('heading', { name: 'Monthly report' })).toBeVisible();
  if (confirmDate.slice(0, 7) !== localDate(0).slice(0, 7)) {
    await press(page.getByRole('button', { name: 'Previous month' }));
  }
  await press(page.locator('summary').filter({ hasText: 'Rent' }));
  await expect(page.getByRole('button', { name: paidDesc, exact: true })).toBeVisible();
});

test('Mark paid is disabled with its reason written next to it for an item on an archived account (US3 #7)', async ({
  page,
}) => {
  const description = `Archived bill e2e ${run}`;
  const account = await (
    await page.request.post(`${API}/accounts`, {
      data: {
        name: `Archived e2e ${run}`,
        kind: 'bank',
        openingBalance: '0',
        openingDate: localDate(0),
      },
    })
  ).json();
  const categories = await (await page.request.get(`${API}/categories`)).json();
  const created = await page.request.post(`${API}/scheduled-items`, {
    data: {
      kind: 'bill',
      description,
      amount: '4500',
      accountId: account.id,
      categoryId: categories.find((category: { name: string }) => category.name === 'Utilities').id,
      nextDueDate: localDate(3),
      recurrence: 'once',
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await page.request.post(`${API}/accounts/${account.id}/archive`);
  try {
    await page.goto('/upcoming');
    const item = upcomingItem(page, description);
    await expect(item).toContainText('In 3 days');
    await expect(item.getByRole('button', { name: 'Mark paid' })).toBeDisabled();
    await expect(item.getByText('Its account is archived')).toBeVisible();
    await expect(item.getByRole('button', { name: 'Mark paid' })).toHaveAccessibleDescription(
      'Its account is archived',
    );
  } finally {
    await page.request.delete(`${API}/scheduled-items/${id}`);
  }
});
