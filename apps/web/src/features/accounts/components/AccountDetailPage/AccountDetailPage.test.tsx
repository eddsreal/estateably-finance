import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { localToday } from '../../../../shared/lib/dates';
import { refetchEntryDerived } from '../../../../shared/lib/query-keys';
import { ToastProvider, useToast } from '../../../../shared/ui/Toast/Toast';
import { AccountDetailPage, dayLabel } from './AccountDetailPage';

const accounts = {
  items: [
    {
      id: '1',
      name: 'Checking',
      kind: 'bank',
      openingBalance: '150000',
      openingDate: '2026-09-01',
      archived: false,
      balance: '445750',
    },
    {
      id: '2',
      name: 'Savings',
      kind: 'bank',
      openingBalance: '0',
      openingDate: '2026-09-01',
      archived: false,
      balance: '30000',
    },
  ],
  totalBalance: '445750',
};

const balancesByDate: Record<string, string> = {
  '2026-09-12': '145750',
  '2026-08-15': '0',
};

const transactions = [
  {
    id: 't6',
    kind: 'expense',
    date: localToday(),
    description: 'Market',
    amount: '4250',
    accountId: '1',
    categoryId: 'c1',
  },
  {
    id: 't5',
    kind: 'income',
    date: localToday(),
    description: 'Refund',
    amount: '1000',
    accountId: '1',
    categoryId: 'c2',
  },
  {
    id: 't4',
    kind: 'transfer',
    date: '2026-09-16',
    description: 'To savings',
    amount: '50000',
    accountId: '1',
    counterAccountId: '2',
  },
  {
    id: 't3',
    kind: 'transfer',
    date: '2026-09-16',
    description: 'From savings',
    amount: '20000',
    accountId: '2',
    counterAccountId: '1',
  },
  {
    id: 't2',
    kind: 'income',
    date: '2026-09-15',
    description: 'Salary',
    amount: '300000',
    accountId: '1',
    categoryId: 'c2',
  },
  {
    id: 't1',
    kind: 'opening',
    date: '2026-09-01',
    description: 'Opening balance',
    amount: '150000',
    accountId: '1',
  },
];

function stubRoutes(overrides: { balance?: string; current?: string } = {}) {
  stubApi({
    'GET /accounts': () =>
      overrides.current
        ? {
            body: {
              ...accounts,
              items: [{ ...accounts.items[0], balance: overrides.current }],
              totalBalance: overrides.current,
            },
          }
        : { body: accounts },
    'GET /categories': [
      { id: 'c1', name: 'Groceries', type: 'expense', archived: false },
      { id: 'c2', name: 'Salary', type: 'income', archived: false },
    ],
    'GET /projects': [],
    'GET /transactions': (url: URL) => ({
      body: {
        items: url.searchParams.get('accountId') === '1' ? transactions : [],
        total: 6,
        limit: 50,
        offset: 0,
      },
    }),
    'GET /accounts/1/balance': (url: URL) => {
      const asOf = url.searchParams.get('asOf') ?? '';
      return {
        body: {
          accountId: '1',
          asOf,
          balance: overrides.balance ?? balancesByDate[asOf] ?? '445750',
        },
      };
    },
  });
}

function renderPage(accountId = '1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AccountDetailPage accountId={accountId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}

afterEach(() => vi.unstubAllGlobals());

describe('AccountDetailPage', () => {
  it('shows a busy skeleton while the account loads', () => {
    stubRoutes();
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).toHaveTextContent('Loading account…');
  });

  it('shows the transactions empty state when the account has none', async () => {
    stubApi({
      'GET /accounts': accounts,
      'GET /categories': [],
      'GET /transactions': { items: [], total: 0, limit: 50, offset: 0 },
      'GET /accounts/1/balance': { accountId: '1', asOf: '2026-09-20', balance: '0' },
    });
    renderPage();
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
  });

  it('shows a failed transaction list with its correlation id and Try again', async () => {
    stubApi({
      'GET /accounts': accounts,
      'GET /categories': [],
      'GET /transactions': () => ({
        status: 500,
        body: { code: 'INTERNAL', message: 'Something broke.', correlationId: 'c-acct' },
      }),
      'GET /accounts/1/balance': { accountId: '1', asOf: '2026-09-20', balance: '0' },
    });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The transactions couldn't load.");
    expect(alert).toHaveTextContent('Correlation ID c-acct');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the current balance and the as-of balance for today in dollars only (SC-009)', async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByRole('status', { name: 'Current balance' })).toHaveTextContent(
      '$4,457.50',
    );
    expect(await screen.findByRole('status', { name: /^Balance on / })).toHaveTextContent(
      '$4,457.50',
    );
    expect(screen.queryByText('445750')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Balance as of')).toHaveValue(
      new Intl.DateTimeFormat('en-CA').format(new Date()),
    );
  });

  it('fetches the balance for the chosen date, including "0" before the first transaction (US2 #2, #4)', async () => {
    stubRoutes();
    renderPage();
    const dateInput = await screen.findByLabelText('Balance as of');

    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-09-12');
    expect(await screen.findByText('Balance on 2026-09-12')).toBeInTheDocument();
    expect(screen.getByText('$1,457.50')).toBeInTheDocument();

    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-08-15');
    expect(await screen.findByText('Balance on 2026-08-15')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.queryByText('145750')).not.toBeInTheDocument();
  });

  it('refetches every balance on screen when the entry-derived families are invalidated (FR-028)', async () => {
    stubRoutes();
    const { queryClient } = renderPage();
    expect(await screen.findByRole('status', { name: /^Balance on / })).toHaveTextContent(
      '$4,457.50',
    );
    expect(screen.getByRole('status', { name: 'Current balance' })).toHaveTextContent('$4,457.50');

    stubRoutes({ current: '345750', balance: '345750' });
    await refetchEntryDerived(queryClient);
    expect(await screen.findByText('$3,457.50')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Current balance' })).toHaveTextContent('$3,457.50');
    expect(screen.getByRole('status', { name: /^Balance on / })).toHaveTextContent('$3,457.50');
    expect(document.body).not.toHaveTextContent('$4,457.50');
  });

  it('groups rows by day with each day net signed by the account role (FR-008)', async () => {
    stubRoutes();
    renderPage();
    const list = await screen.findByRole('region', { name: 'Transactions on this account' });
    const days = await within(list).findAllByRole('region');
    expect(days.map((day) => day.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Today · /),
      expect.stringMatching(/^Wed · Sep 16/),
      expect.stringMatching(/^Tue · Sep 15/),
      expect.stringMatching(/^Tue · Sep 1(,|$)/),
    ]);
    const net = (day: HTMLElement) => within(day).getByRole('heading').textContent;
    expect(net(days[0])).toMatch(/-\$32\.50$/);
    expect(net(days[1])).toMatch(/-\$300\.00$/);
    expect(net(days[2])).toMatch(/\+\$3,000\.00$/);
    expect(net(days[3])).toMatch(/[^+]\$1,500\.00$/);
    expect(within(days[1]).getByText('→ Savings')).toBeInTheDocument();
    expect(within(days[1]).getByText('← Savings')).toBeInTheDocument();
    expect(within(days[1]).getByText('-$500.00')).toBeInTheDocument();
    expect(within(days[1]).getByText('+$200.00')).toBeInTheDocument();
    expect(within(days[0]).getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('6 transactions')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/debit|credit|entr(y|ies)/i);
  });

  it('labels days as Today or weekday and date, with the year only when it differs', () => {
    expect(dayLabel('2026-09-22', '2026-09-22')).toBe('Today · Sep 22');
    expect(dayLabel('2026-09-16', '2026-09-22')).toBe('Wed · Sep 16');
    expect(dayLabel('2025-12-31', '2026-01-02')).toBe('Wed · Dec 31, 2025');
  });

  it('says so when the account does not exist', async () => {
    stubRoutes();
    renderPage('99');
    expect(await screen.findByText('This account does not exist.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to accounts' })).toBeInTheDocument();
  });
});

function Flash() {
  const { show } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        show({
          kind: 'undo',
          message: 'Transaction recorded.',
          transactionId: 't6',
          onUndo: () => Promise.resolve(),
        })
      }
    >
      flash
    </button>
  );
}

describe('AccountDetailPage new-row highlight', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('highlights only the flashed row for --dur-flash, fading only when motion is allowed', async () => {
    document.documentElement.style.setProperty('--dur-undo', '5s');
    document.documentElement.style.setProperty('--dur-flash', '0.05s');
    stubRoutes();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ToastProvider>
            <Flash />
            <AccountDetailPage accountId="1" />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const row = (text: string) => screen.getByText(text).closest('li')?.firstElementChild;
    await screen.findByText('Market');
    await userEvent.setup().click(screen.getByRole('button', { name: 'flash' }));
    expect(row('Market')?.className).toContain('motion-safe:animate-flash');
    expect(row('Market')?.className).toContain('motion-reduce:bg-accent-highlight');
    expect(row('Refund')?.className).not.toContain('animate-flash');
    await vi.waitFor(() => expect(row('Market')?.className).not.toContain('animate-flash'));
  });
});

describe('AccountDetailPage row actions and swipe', () => {
  it('offers ⋯ Edit and Delete on every row but the opening balance', async () => {
    stubRoutes();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Market');
    expect(screen.getByRole('button', { name: 'Actions for Market' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Opening balance' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Actions for Salary' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Edit transaction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('Salary');
  });

  it('swipes rows on a phone: short snaps back, long left confirms a delete, right edits', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.startsWith('(width <'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    stubRoutes();
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByText('Market')).closest('.touch-pan-y') as HTMLElement;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 64));
    const swipe = (from: number, to: number) => {
      fireEvent.pointerDown(row, { clientX: from });
      fireEvent.pointerMove(row, { clientX: to });
      fireEvent.pointerUp(row, { clientX: to });
    };
    swipe(300, 200);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    swipe(350, 100);
    expect(screen.getByRole('button', { name: 'Delete transaction' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    swipe(50, 300);
    expect(screen.getByLabelText('Description')).toHaveValue('Market');
    expect(screen.queryByRole('button', { name: 'Delete transaction' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.touch-pan-y')).toHaveLength(transactions.length - 1);
  });
});
