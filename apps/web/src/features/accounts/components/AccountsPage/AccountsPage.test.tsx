import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, formatDay, localToday } from '../../../../shared/lib/dates';
import { stubApi } from '../../../../test-api-stub';
import { AccountsPage } from './AccountsPage';

const TODAY = localToday();

const accounts = {
  items: [
    {
      id: '1',
      name: 'Checking',
      kind: 'bank',
      openingBalance: '150000',
      openingDate: '2026-01-01',
      archived: false,
      balance: '179000',
    },
    {
      id: '3',
      name: 'Visa',
      kind: 'card',
      openingBalance: '-50000',
      openingDate: '2026-01-01',
      archived: false,
      balance: '-50000',
    },
    {
      id: '9',
      name: 'Old Savings',
      kind: 'bank',
      openingBalance: '21000',
      openingDate: '2026-01-01',
      archived: true,
      balance: '21000',
    },
  ],
  totalBalance: '129000',
};

let requests: URLSearchParams[] = [];

function history(url: URL) {
  requests.push(url.searchParams);
  const to = url.searchParams.get('to') ?? TODAY;
  const from = url.searchParams.get('from') ?? addDays(to, -99);
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  const checking = days.map((_, i) => (150000 + i * 1000).toString());
  const visa = days.map(() => '-50000');
  return {
    body: {
      from,
      to,
      total: checking.map((value, i) => (BigInt(value) + BigInt(visa[i])).toString()),
      accounts: [
        { accountId: '1', archived: false, balances: checking },
        { accountId: '3', archived: false, balances: visa },
        { accountId: '9', archived: true, balances: days.map(() => '21000') },
      ],
    },
  };
}

function stubDashboard(extra: Record<string, unknown> = {}) {
  requests = [];
  stubApi({ 'GET /accounts': accounts, 'GET /accounts/balance-history': history, ...extra });
}

function headline() {
  return screen.getByRole('status', { name: 'Total across accounts' });
}

function card(name: string) {
  return within(screen.getByRole('list', { name: 'Accounts' }))
    .getAllByRole('listitem')
    .find((item) => within(item).queryByRole('link', { name }) !== null);
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AccountsPage', () => {
  it('shows the active total, its change over the range and each card in dollars, never raw cents (SC-009)', async () => {
    stubDashboard();
    renderPage();
    expect(await screen.findByRole('slider')).toBeInTheDocument();
    expect(headline()).toHaveTextContent('$1,290.00');
    expect(screen.getByText(/since/)).toHaveTextContent('+$290.00');
    expect(screen.getByText(/since/)).toHaveTextContent('total of 2 active accounts');
    expect(card('Checking')).toHaveTextContent('$1,790.00');
    expect(card('Visa')).toHaveTextContent('-$500.00');
    expect(within(card('Checking')!).getByRole('button', { name: 'Edit Checking' })).toBeVisible();
    expect(
      within(card('Checking')!).getByRole('button', { name: 'Archive Checking' }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent('179000');
    expect(document.body).not.toHaveTextContent('129000');
    expect(document.body).not.toHaveTextContent('-50000');
  });

  it('maps each range to the days that end on the as-of date, and All to no from', async () => {
    stubDashboard();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('slider');
    expect(requests.at(-1)?.get('from')).toBe(addDays(TODAY, -29));
    expect(requests.at(-1)?.has('to')).toBe(false);
    expect(requests.at(-1)?.get('includeArchived')).toBe('true');
    for (const [label, days] of [
      ['7D', 7],
      ['90D', 90],
      ['1Y', 365],
    ] as const) {
      await user.click(screen.getByRole('radio', { name: label }));
      await screen.findByRole('slider', { name: 'Total balance by day' });
      expect(requests.at(-1)?.get('from')).toBe(addDays(TODAY, -(days - 1)));
    }
    await user.click(screen.getByRole('radio', { name: 'All' }));
    expect(requests.at(-1)?.has('from')).toBe(false);
    expect(requests.at(-1)?.has('to')).toBe(false);
  });

  it('bounds Balance as of by the server date and moves the whole dashboard to a past date', async () => {
    stubDashboard();
    renderPage();
    await screen.findByRole('slider');
    const asOf = screen.getByLabelText('Balance as of');
    expect(asOf).toHaveAttribute('max', TODAY);
    expect(asOf).toHaveValue(TODAY);
    const count = requests.length;
    fireEvent.change(asOf, { target: { value: addDays(TODAY, 1) } });
    expect(requests).toHaveLength(count);
    const past = addDays(TODAY, -10);
    fireEvent.change(asOf, { target: { value: past } });
    expect(await screen.findByText(/since/)).toBeInTheDocument();
    await vi.waitFor(() => expect(requests.at(-1)?.get('to')).toBe(past));
    expect(requests.at(-1)?.get('from')).toBe(addDays(past, -29));
    await vi.waitFor(() => expect(asOf).toHaveValue(past));
    expect(headline()).toHaveTextContent('$1,290.00');
    expect(card('Checking')).toHaveTextContent('$1,790.00');
  });

  it('hides archived cards behind a dashed note, and the toggle shows them without refetching or moving the total', async () => {
    stubDashboard();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('slider');
    expect(card('Old Savings')).toBeUndefined();
    expect(
      screen.getByText('1 archived account · $210.00 · not counted in total'),
    ).toBeInTheDocument();
    const count = requests.length;
    await user.click(screen.getByRole('switch', { name: 'Show archived' }));
    expect(card('Old Savings')).toHaveTextContent('Archived');
    expect(card('Old Savings')).toHaveTextContent('$210.00');
    expect(requests).toHaveLength(count);
    expect(headline()).toHaveTextContent('$1,290.00');
  });

  it('moves the headline to the day selected on the chart, with its change since the first day', async () => {
    stubDashboard();
    const user = userEvent.setup();
    renderPage();
    const slider = await screen.findByRole('slider');
    await user.click(screen.getByRole('radio', { name: '7D' }));
    await vi.waitFor(() => expect(slider).toHaveAttribute('max', '6'));
    slider.focus();
    await user.keyboard('{Home}{ArrowRight}');
    expect(headline()).toHaveTextContent('$1,010.00');
    expect(screen.getByText(/since/)).toHaveTextContent('+$10.00');
    expect(screen.getByText(/Balance on/)).toHaveTextContent(formatDay(addDays(TODAY, -5)));
  });

  it('shows the empty state when there are no accounts', async () => {
    stubApi({
      'GET /accounts': { items: [], totalBalance: '0' },
      'GET /accounts/balance-history': { from: TODAY, to: TODAY, total: ['0'], accounts: [] },
    });
    renderPage();
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('opens the create form with the money input autofocused and a max-today date', async () => {
    stubDashboard();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('slider');
    await user.click(screen.getByRole('button', { name: 'New account' }));
    expect(screen.getByLabelText('Opening balance')).toHaveFocus();
    expect(screen.getByLabelText('Opening date')).toHaveAttribute('max');
  });

  it('reports a money parse error beside the field', async () => {
    stubDashboard();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('slider');
    await user.click(screen.getByRole('button', { name: 'New account' }));
    await user.type(screen.getByLabelText('Name'), 'Cash box');
    await user.clear(screen.getByLabelText('Opening balance'));
    await user.type(screen.getByLabelText('Opening balance'), '12.345');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a dollar amount like 1,234.50',
    );
    const input = screen.getByLabelText('Opening balance');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'account-opening-balance-error');
  });

  it('ties a server error on the kind radio group to that group', async () => {
    stubDashboard({
      'POST /accounts': () => ({
        status: 400,
        body: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: [{ field: 'kind', message: 'kind must be bank, cash or card' }],
          correlationId: 'c-1',
        },
      }),
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('slider');
    await user.click(screen.getByRole('button', { name: 'New account' }));
    await user.type(screen.getByLabelText('Name'), 'Cash box');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const group = await screen.findByRole('radiogroup', { name: 'Kind' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('kind must be bank, cash or card');
  });

  it('shows an error state with retry instead of stale balances when the list cannot load', async () => {
    stubDashboard({ 'GET /accounts': () => ({ status: 500, body: { message: 'down' } }) });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be refreshed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('$1,290.00')).not.toBeInTheDocument();
  });
});
