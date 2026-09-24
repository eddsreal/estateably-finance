import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

const API = 'http://localhost:3000';
const run = Date.now();
const today = new Intl.DateTimeFormat('en-CA').format(new Date());
const accountName = `U6 ${run}`;
let accountId = '';

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
  for (let step = 0; step < 80; step += 1) {
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

function toasts(page: Page): Locator {
  return page.locator('[aria-live="polite"]');
}

function undoButton(page: Page): Locator {
  return toasts(page).getByRole('button', { name: /^Undo/ });
}

async function record(page: Page, description: string): Promise<void> {
  await press(page.getByRole('button', { name: 'New transaction' }));
  const modal = page.getByRole('dialog', { name: 'New transaction' });
  await typeInto(modal.getByLabel('Amount'), '12.34');
  await typeInto(modal.getByLabel('Description'), description);
  await pickOption(page, modal.getByRole('combobox', { name: 'Account' }), accountName);
  await pickOption(page, modal.getByRole('combobox', { name: 'Category' }), 'Groceries');
  await press(modal.getByRole('button', { name: 'Record transaction' }));
  await expect(modal).toBeHidden();
  await expect(undoButton(page)).toBeVisible();
  await expect(page.getByRole('button', { name: description })).toBeVisible();
}

async function pressUndoShortcut(page: Page): Promise<void> {
  await page.locator('main h1').click();
  await page.keyboard.press('ControlOrMeta+z');
}

async function balance(request: APIRequestContext): Promise<string> {
  const accounts = (await (await request.get(`${API}/accounts`)).json()).items as {
    id: string;
    balance: string;
  }[];
  return accounts.find((account) => account.id === accountId)?.balance ?? '';
}

async function matching(request: APIRequestContext, q: string) {
  const response = await request.get(`${API}/transactions?q=${encodeURIComponent(q)}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).items as { id: string; description: string }[];
}

test.beforeAll(async ({ request }) => {
  const created = await request.post(`${API}/accounts`, {
    data: { name: accountName, kind: 'bank', openingBalance: '0', openingDate: today },
  });
  expect(created.status()).toBe(201);
  accountId = (await created.json()).id;
});

test.afterAll(async ({ request }) => {
  for (const item of await matching(request, `u6 ${run}`)) {
    expect((await request.delete(`${API}/transactions/${item.id}`)).ok()).toBe(true);
  }
});

test('Undo within 5 s removes the row everywhere and restores balances (US6 #1)', async ({
  page,
  request,
}) => {
  const description = `U6 ${run} button`;
  await page.goto('/transactions');
  await record(page, description);
  expect(await balance(request)).toBe('-1234');

  await press(undoButton(page));
  await expect(undoButton(page)).toHaveCount(0);
  await expect(toasts(page).getByText('Transaction removed.')).toBeVisible();
  await expect(page.getByRole('button', { name: description })).toHaveCount(0);
  expect(await matching(request, description)).toEqual([]);
  expect(await balance(request)).toBe('0');

  await page.goto(`/accounts/${accountId}`);
  await expect(page.getByRole('status', { name: 'Current balance' })).toHaveText('$0.00');
  await expect(page.getByText(description)).toHaveCount(0);
});

test('⌘Z inside a text field undoes text only; outside it undoes the create (US6 #4)', async ({
  page,
  request,
}) => {
  const description = `U6 ${run} shortcut`;
  await page.goto('/transactions');
  await record(page, description);

  await press(page.getByRole('button', { name: 'New transaction' }));
  const field = page.getByRole('dialog', { name: 'New transaction' }).getByLabel('Description');
  await typeInto(field, 'abc');
  await field.press('ControlOrMeta+z');
  await expect(field).not.toHaveValue('abc');
  await expect(undoButton(page)).toBeVisible();
  expect(await matching(request, description)).toHaveLength(1);

  await page.keyboard.press('Escape');
  await pressUndoShortcut(page);
  await expect(undoButton(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: description })).toHaveCount(0);
  expect(await matching(request, description)).toEqual([]);
});

test('a second press sends no second DELETE', async ({ page, request }) => {
  const description = `U6 ${run} once`;
  const deletes: string[] = [];
  page.on('request', (sent) => {
    if (sent.method() === 'DELETE') deletes.push(sent.url());
  });
  await page.goto('/transactions');
  await record(page, description);

  await undoButton(page).click();
  await pressUndoShortcut(page);
  await expect(page.getByRole('button', { name: description })).toHaveCount(0);
  await expect(toasts(page).getByText('Transaction removed.')).toBeVisible();
  expect(deletes).toHaveLength(1);
  expect(await matching(request, description)).toEqual([]);
});

test('a failed Undo shows the error toast with its correlation id and keeps the row', async ({
  page,
  request,
}) => {
  const description = `U6 ${run} failed`;
  await page.goto('/transactions');
  await record(page, description);
  await page.route(
    (url) => url.port === '3000' && url.pathname.startsWith('/transactions/'),
    (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 500,
            json: {
              code: 'INTERNAL',
              message: 'Something went wrong.',
              correlationId: 'E2E-UNDO-FAIL',
            },
          })
        : route.fallback(),
  );

  await press(undoButton(page));
  await expect(toasts(page).getByText('Correlation ID E2E-UNDO-FAIL')).toBeVisible();
  await expect(page.getByRole('button', { name: description })).toBeVisible();
  expect(await matching(request, description)).toHaveLength(1);
  await page.unrouteAll();
});

test('a second create replaces the first Undo', async ({ page, request }) => {
  const first = `U6 ${run} first`;
  const second = `U6 ${run} second`;
  await page.goto('/transactions');
  await record(page, first);
  await record(page, second);
  await expect(undoButton(page)).toHaveCount(1);

  await press(undoButton(page));
  await expect(page.getByRole('button', { name: second })).toHaveCount(0);
  await expect(page.getByRole('button', { name: first })).toBeVisible();
  expect(await matching(request, second)).toEqual([]);
  expect(await matching(request, first)).toHaveLength(1);
});

test('editing the new row closes its Undo, and the edit toast has no Undo', async ({
  page,
  request,
}) => {
  const description = `U6 ${run} edited`;
  await page.goto('/transactions');
  await record(page, description);

  await press(page.getByRole('button', { name: description }));
  const modal = page.getByRole('dialog', { name: 'Edit transaction' });
  await typeInto(modal.getByLabel('Description'), `${description} again`);
  await press(modal.getByRole('button', { name: 'Save changes' }));
  await expect(toasts(page).getByText('Transaction saved.')).toBeVisible();
  await expect(undoButton(page)).toHaveCount(0);

  await pressUndoShortcut(page);
  await expect(page.getByRole('button', { name: `${description} again` })).toBeVisible();
  expect(await matching(request, `${description} again`)).toHaveLength(1);
});

test('no Undo after 5 s, and the delete toast has no Undo (US6 #2, #3)', async ({
  page,
  request,
}) => {
  const description = `U6 ${run} late`;
  await page.goto('/transactions');
  await record(page, description);

  await expect(undoButton(page)).toHaveCount(0, { timeout: 7000 });
  await pressUndoShortcut(page);
  await expect(page.getByRole('button', { name: description })).toBeVisible();
  expect(await matching(request, description)).toHaveLength(1);

  await press(page.getByRole('button', { name: description }));
  await press(
    page.getByRole('dialog', { name: 'Edit transaction' }).getByRole('button', { name: 'Delete' }),
  );
  await expect(toasts(page).getByText('Transaction deleted.')).toBeVisible();
  await expect(undoButton(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: description })).toHaveCount(0);
});
