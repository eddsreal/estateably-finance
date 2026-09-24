import { expect, Locator, Page, Route, test } from '@playwright/test';

const run = Date.now();
const today = new Intl.DateTimeFormat('en-CA').format(new Date());

test.describe.configure({ mode: 'serial' });

async function press(locator: Locator, key = 'Enter'): Promise<void> {
  await locator.focus();
  await locator.press(key);
}

function api(page: Page, method: string, path: string, handler: (route: Route) => unknown) {
  return page.route(
    (url) => url.port === '3000' && url.pathname === path,
    (route) => (route.request().method() === method ? handler(route) : route.fallback()),
  );
}

function json(body: unknown, status = 200) {
  return (route: Route) => route.fulfill({ status, json: body });
}

function failure(code: string, message: string, correlationId: string, status = 503) {
  return json({ code, message, correlationId }, status);
}

const EMPTY_PAGE = { items: [], total: 0, limit: 50, offset: 0 };

test('the 8 empty states show their screen 20 copy (SC-007)', async ({ page }) => {
  await api(page, 'GET', '/accounts', json({ items: [], totalBalance: '0' }));
  await api(
    page,
    'GET',
    '/accounts/balance-history',
    json({ from: today, to: today, total: ['0'], accounts: [] }),
  );
  await page.goto('/');
  await expect(page.getByText('No accounts yet')).toBeVisible();
  await expect(
    page.getByText('Add a bank account, cash or a card to start tracking balances.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add account' })).toBeVisible();

  await api(page, 'GET', '/reports/monthly', (route) =>
    route.fulfill({
      json: {
        month: new URL(route.request().url()).searchParams.get('month'),
        grandTotal: '0',
        categories: [],
      },
    }),
  );
  await page.goto('/report');
  await expect(page.getByText('No expenses this month')).toBeVisible();
  await expect(
    page.getByText(/^Expenses recorded in .* will appear here by category\.$/),
  ).toBeVisible();

  await page.goto('/transactions');
  await api(page, 'GET', '/transactions', json(EMPTY_PAGE));
  await press(page.getByRole('radio', { name: 'Income' }), 'Space');
  await expect(page.getByText('No transactions match these filters')).toBeVisible();
  await expect(
    page.getByText('Try a wider date range or clear the type, category and project filters.'),
  ).toBeVisible();

  await api(page, 'GET', '/scheduled-items', json([]));
  await page.goto('/upcoming');
  await expect(page.getByText('No scheduled payments')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Schedule payment' })).toBeVisible();

  await api(page, 'GET', '/projects', json([]));
  await page.goto('/projects');
  await expect(page.getByText('No projects yet')).toBeVisible();

  await api(page, 'GET', '/categories', async (route) => {
    const response = await route.fetch();
    const categories = (await response.json()) as { archived: boolean }[];
    await route.fulfill({ json: categories.filter((category) => !category.archived) });
  });
  await page.goto('/categories');
  await press(page.getByRole('switch', { name: 'Show archived' }), 'Space');
  await expect(page.getByText('No archived categories')).toBeVisible();

  await api(page, 'GET', '/reports/similar', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        from: params.get('from'),
        to: params.get('to'),
        groups: [],
        topTransactions: [],
        topGroupKey: null,
      },
    });
  });
  await page.goto('/similar');
  await press(page.getByRole('button', { name: 'Generate report' }));
  await expect(page.getByText('No similar expenses in this range')).toBeVisible();
  await press(page.getByRole('button', { name: 'Change dates' }));
  await expect(page.getByLabel('From')).toBeFocused();

  await api(page, 'GET', '/projection', (route) =>
    route.fulfill({
      json: {
        horizon: new URL(route.request().url()).searchParams.get('horizon'),
        startingBalance: '404471',
        finalBalance: '404471',
        occurrences: [],
      },
    }),
  );
  await page.goto('/projection');
  await expect(page.getByText(/^Nothing scheduled before /)).toBeVisible();
  await expect(
    page.getByText('The balance stays at $4,044.71. Schedule a payment or pick a later date.'),
  ).toBeVisible();
});

test('a failing request shows its correlation id and Copy ID copies it (US4 #2)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const correlationId = `e2e-down-${run}`;
  await api(
    page,
    'GET',
    '/transactions',
    failure('SERVICE_UNAVAILABLE', 'The service is unavailable.', correlationId),
  );
  await page.goto('/transactions');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("The transactions couldn't load.");
  await expect(alert).toContainText(`Correlation ID ${correlationId}`);
  await press(alert.getByRole('button', { name: 'Copy ID' }));
  await expect(alert.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate('navigator.clipboard.readText()')).toBe(correlationId);

  await page.unrouteAll();
  await press(alert.getByRole('button', { name: 'Try again' }));
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failing AI provider shows a dismissible notice and the report stays (FR-013)', async ({
  page,
}) => {
  await api(page, 'GET', '/ai/status', json({ configured: true }));
  await api(
    page,
    'POST',
    '/reports/similar/narrative',
    failure('AI_PROVIDER_ERROR', 'The AI provider failed.', `e2e-ai-${run}`, 502),
  );
  await page.goto('/similar');
  await press(page.getByRole('button', { name: 'Generate report' }));
  const top = page.getByRole('list', { name: 'Top 5 most expensive' });
  await expect(top).toBeVisible();
  await press(page.getByRole('button', { name: '✦ Summarize with AI' }));
  const notice = page.getByRole('alert');
  await expect(notice).toContainText("The AI summary couldn't be generated.");
  await expect(notice).toContainText(`Correlation ID e2e-ai-${run}`);
  await expect(top).toBeVisible();
  await press(notice.getByRole('button', { name: 'Dismiss' }));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(top).toBeVisible();
});

test('with no AI key, Summarize with AI is disabled on first render with its reason (US4 #4)', async ({
  page,
}) => {
  await api(page, 'GET', '/ai/status', json({ configured: false }));
  await page.goto('/similar');
  const button = page.getByRole('button', { name: '✦ Summarize with AI' });
  await expect(page.getByText('Disabled until an AI key is configured.')).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription('Disabled until an AI key is configured.');
});

test('a failed balance refresh keeps the change and a Retry toast until Retry succeeds (US4 #3)', async ({
  page,
}) => {
  const name = `States ${run}`;
  await page.goto('/');
  await expect(page.getByRole('slider')).toBeVisible();
  await press(page.getByRole('link', { name: 'Categories', exact: true }));
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();

  await api(page, 'GET', '/accounts', (route) => route.abort());
  await press(page.getByRole('button', { name: 'New category' }));
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await press(dialog.getByRole('button', { name: 'Create category' }));

  await expect(page.getByText('Category saved.')).toBeVisible();
  const toast = page.getByText("Balances couldn't update.");
  await expect(toast).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();

  const retry = page.getByRole('button', { name: 'Retry', exact: true });
  await press(retry);
  await expect(page.getByRole('button', { name: 'Retrying…' })).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(toast).toBeVisible();

  await page.unrouteAll();
  await press(retry);
  await expect(toast).toHaveCount(0);
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
});
