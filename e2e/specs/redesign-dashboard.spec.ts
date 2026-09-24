import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

const API = 'http://localhost:3000';
const run = Date.now();
const archivedName = `Dashboard archived ${run}`;

type Account = { id: string; name: string; archived: boolean; balance: string };

test.describe.configure({ mode: 'serial' });

function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, '0');
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${whole}.${digits.slice(-2)}`;
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function formatDay(date: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('day')} ${part('month')} ${part('year')}`;
}

async function accounts(request: APIRequestContext, includeArchived = false): Promise<Account[]> {
  const response = await request.get(`${API}/accounts?includeArchived=${includeArchived}`);
  return (await response.json()).items;
}

async function activeTotalAsOf(request: APIRequestContext, date: string): Promise<bigint> {
  let total = 0n;
  for (const account of await accounts(request)) {
    const response = await request.get(`${API}/accounts/${account.id}/balance?asOf=${date}`);
    total += BigInt((await response.json()).balance);
  }
  return total;
}

async function press(locator: Locator, key = 'Enter'): Promise<void> {
  await locator.focus();
  await locator.press(key);
}

async function selectDay(slider: Locator, index: number): Promise<void> {
  await press(slider, 'Home');
  for (let step = 0; step < Math.floor(index / 7); step += 1) await slider.press('PageUp');
  for (let step = 0; step < index % 7; step += 1) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(index));
}

function headline(page: Page): Locator {
  return page.getByRole('status', { name: 'Total across accounts' });
}

async function settledHeadline(page: Page): Promise<string> {
  await expect(headline(page)).toHaveAttribute('aria-busy', 'false');
  return headline(page).innerText();
}

function accountCard(page: Page, name: string): Locator {
  return page
    .getByRole('list', { name: 'Accounts' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
}

function slider(page: Page): Locator {
  return page.getByRole('slider', { name: 'Total balance by day' });
}

async function serverToday(page: Page): Promise<string> {
  const max = await page.getByLabel('Balance as of').getAttribute('max');
  expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  return max!;
}

test('every sampled chart day equals the summed as-of balances, and the last equals the total (SC-005, US2 #1, #2)', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(slider(page)).toBeVisible();
  const today = await serverToday(page);
  const { totalBalance } = await (await request.get(`${API}/accounts`)).json();

  for (const [label, days] of [
    ['7D', 7],
    ['30D', 30],
    ['90D', 90],
    ['1Y', 365],
    ['All', null],
  ] as const) {
    await press(page.getByRole('radio', { name: label }), 'Space');
    const from =
      days === null
        ? (await (await request.get(`${API}/accounts/balance-history`)).json()).from
        : addDays(today, -(days - 1));
    const max = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
    );
    await expect(slider(page)).toHaveAttribute('max', String(max));
    const first = await activeTotalAsOf(request, from);

    for (const index of [0, Math.floor(max / 2), max]) {
      await selectDay(slider(page), index);
      const total = await activeTotalAsOf(request, addDays(from, index));
      const delta = total - first;
      await expect(slider(page)).toHaveAttribute(
        'aria-valuetext',
        `${formatDay(addDays(from, index))}, ${formatCents(total)}, ${delta < 0n ? '▼' : '▲'} ${formatCents(delta < 0n ? -delta : delta)}`,
      );
      await expect(headline(page)).toHaveText(formatCents(total));
      if (index === max) expect(formatCents(total)).toBe(formatCents(BigInt(totalBalance)));
    }
  }
});

test('the arrow keys move the selected day and the headline follows (US2 #4)', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const today = await serverToday(page);
  await press(slider(page), 'End');
  await expect(slider(page)).toHaveValue('29');
  await slider(page).press('ArrowLeft');
  await expect(slider(page)).toHaveValue('28');
  const total = await activeTotalAsOf(request, addDays(today, -1));
  await expect(headline(page)).toHaveText(formatCents(total));
  await expect(page.getByText(`Balance on ${formatDay(addDays(today, -1))}`)).toBeVisible();
  await slider(page).press('ArrowRight');
  await expect(slider(page)).toHaveValue('29');
});

test('a past Balance as of moves the range, the headline and every card to that date (US2 #5)', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const past = addDays(await serverToday(page), -10);
  await page.getByLabel('Balance as of').fill(past);

  await expect(slider(page)).toHaveAttribute('aria-valuetext', new RegExp(`^${formatDay(past)}, `));
  await expect(slider(page)).toHaveAttribute('max', '29');
  const total = await activeTotalAsOf(request, past);
  await settledHeadline(page);
  await expect(headline(page)).toHaveText(formatCents(total));
  for (const account of await accounts(request)) {
    const response = await request.get(`${API}/accounts/${account.id}/balance?asOf=${past}`);
    const balance = BigInt((await response.json()).balance);
    await expect(accountCard(page, account.name)).toContainText(formatCents(balance));
  }
});

test('archived accounts are only listed: the note names them and the toggle never moves the total (US2 #3)', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/accounts`, {
    data: { name: archivedName, kind: 'bank', openingBalance: '12345', openingDate: '2026-01-01' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect((await request.post(`${API}/accounts/${id}/archive`)).ok()).toBe(true);

  const archived = (await accounts(request, true)).filter((account) => account.archived);
  const archivedSum = archived.reduce((sum, account) => sum + BigInt(account.balance), 0n);
  const plural = archived.length === 1 ? '' : 's';

  await page.goto('/');
  const before = await settledHeadline(page);
  await expect(accountCard(page, archivedName)).toHaveCount(0);
  await expect(
    page.getByText(
      `${archived.length} archived account${plural} · ${formatCents(archivedSum)} · not counted in total`,
    ),
  ).toBeVisible();

  await press(page.getByRole('switch', { name: 'Show archived' }), 'Space');
  await expect(accountCard(page, archivedName)).toContainText('Archived');
  await expect(accountCard(page, archivedName)).toContainText('$123.45');
  await expect(headline(page)).toHaveText(before);
});
