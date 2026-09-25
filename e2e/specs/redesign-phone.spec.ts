import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

const API = 'http://localhost:3000';
const run = Date.now();
const today = new Intl.DateTimeFormat('en-CA').format(new Date());
const accountName = `P7 ${run}`;
const typed = `p7 keypad ${run}`;
const seeded = `p7 swipe ${run}`;
let accountId = '';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function pickOption(page: Page, combo: Locator, optionText: string): Promise<void> {
  await combo.focus();
  await combo.press('Enter');
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

function swipeRow(page: Page, description: string): Locator {
  return page.locator('.touch-pan-y', { hasText: description });
}

async function swipe(page: Page, row: Locator, share: number): Promise<void> {
  const box = await row.boundingBox();
  if (!box) throw new Error('row is not visible');
  const y = box.y + box.height / 2;
  const start = share < 0 ? box.x + box.width * 0.9 : box.x + box.width * 0.1;
  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(start + box.width * share, y, { steps: 10 });
  await page.mouse.up();
}

async function hasNoSidewaysScroll(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow, page.url()).toBeLessThanOrEqual(0);
}

test.beforeAll(async ({ request }) => {
  const created = await request.post(`${API}/accounts`, {
    data: { name: accountName, kind: 'bank', openingBalance: '0', openingDate: today },
  });
  expect(created.status()).toBe(201);
  accountId = (await created.json()).id;
  const categories = (await (await request.get(`${API}/categories`)).json()) as {
    id: string;
    name: string;
  }[];
  const groceries = categories.find((category) => category.name === 'Groceries');
  const transaction = await request.post(`${API}/transactions`, {
    data: {
      kind: 'expense',
      date: today,
      description: seeded,
      amount: '500',
      accountId,
      categoryId: groceries?.id,
    },
  });
  expect(transaction.status()).toBe(201);
});

test.afterAll(async ({ request }) => {
  for (const item of await matching(request, `p7 `)) {
    if (item.description.endsWith(String(run))) {
      expect((await request.delete(`${API}/transactions/${item.id}`)).ok()).toBe(true);
    }
  }
});

test('no route scrolls sideways at 390 px', async ({ page, request }) => {
  const projects = (await (await request.get(`${API}/projects`)).json()) as { id: string }[];
  const routes = [
    '/',
    `/accounts/${accountId}`,
    '/transactions',
    '/report',
    '/similar',
    '/upcoming',
    '/projection',
    '/projects',
    ...(projects[0] ? [`/projects/${projects[0].id}`] : []),
    '/categories',
  ];
  for (const route of routes) {
    await page.goto(route);
    await hasNoSidewaysScroll(page);
  }
});

test('the tab bar and More reach every primary route, with no sidebar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('complementary')).toBeHidden();
  const tabs = page.getByRole('navigation', { name: 'Tabs' });
  for (const [name, path] of [
    ['Report', '/report'],
    ['Upcoming', '/upcoming'],
    ['Accounts', '/'],
  ]) {
    await tabs.getByRole('link', { name }).click();
    await expect(page).toHaveURL(path);
    await expect(tabs.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  }
  for (const [name, path] of [
    ['Transactions', '/transactions'],
    ['Similar transactions', '/similar'],
    ['Projection', '/projection'],
    ['Projects', '/projects'],
    ['Categories', '/categories'],
  ]) {
    await tabs.getByRole('button', { name: 'More' }).click();
    const more = page.getByRole('dialog', { name: 'More' });
    await more.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(more).toBeHidden();
  }
});

test('an expense is recorded through the keypad sheet', async ({ page, request }) => {
  await page.goto(`/accounts/${accountId}`);
  await page
    .getByRole('navigation', { name: 'Tabs' })
    .getByRole('button', { name: 'New transaction' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'New transaction' });
  const keypad = sheet.getByRole('group', { name: 'Keypad' });
  for (const key of ['1', '8', 'Decimal point', '4', '0', '9']) {
    await keypad.getByRole('button', { name: key, exact: true }).click();
  }
  await expect(sheet.getByLabel('Amount')).toHaveValue('18.40');
  await expect(sheet.getByLabel('Amount')).toHaveAttribute('inputmode', 'none');
  await sheet.getByLabel('Description').fill(typed);
  await pickOption(page, sheet.getByRole('combobox', { name: 'Account' }), accountName);
  await pickOption(page, sheet.getByRole('combobox', { name: 'Category' }), 'Groceries');
  await sheet.getByRole('button', { name: 'Record transaction' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(typed)).toBeVisible();
  await expect.poll(() => balance(request)).toBe('-2340');
});

test('a short swipe snaps back with no action', async ({ page }) => {
  await page.goto(`/accounts/${accountId}`);
  const row = swipeRow(page, seeded);
  await swipe(page, row, -0.2);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(row).toHaveCSS('transform', 'none');
  await swipe(page, row, 0.2);
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('a long right swipe opens the edit form', async ({ page }) => {
  await page.goto(`/accounts/${accountId}`);
  await swipe(page, swipeRow(page, seeded), 0.6);
  const dialog = page.getByRole('dialog', { name: 'Edit transaction' });
  await expect(dialog.getByLabel('Description')).toHaveValue(seeded);
  await expect(dialog.getByRole('button', { name: 'Delete transaction' })).toBeHidden();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('"⋯" offers Edit and Delete by keyboard', async ({ page }) => {
  await page.goto(`/accounts/${accountId}`);
  const actions = page.getByRole('button', { name: `Actions for ${seeded}` });
  await actions.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Edit transaction' });
  await expect(dialog.getByLabel('Description')).toHaveValue(seeded);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(actions).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Delete transaction' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(seeded)).toBeVisible();
});

test('a long left swipe asks for confirmation, then deletes', async ({ page, request }) => {
  await page.goto(`/accounts/${accountId}`);
  await swipe(page, swipeRow(page, seeded), -0.6);
  const dialog = page.getByRole('dialog', { name: 'Edit transaction' });
  await expect(dialog.getByRole('button', { name: 'Delete transaction' })).toBeVisible();
  expect(await matching(request, seeded)).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Delete transaction' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(seeded)).toBeHidden();
  expect(await matching(request, seeded)).toHaveLength(0);
  await expect.poll(() => balance(request)).toBe('-1840');
});
