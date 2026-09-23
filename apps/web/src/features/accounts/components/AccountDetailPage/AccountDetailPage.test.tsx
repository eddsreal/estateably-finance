import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { invalidateEntryDerived } from '../../../../shared/lib/query-keys';
import { AccountDetailPage } from './AccountDetailPage';

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
  ],
  totalBalance: '445750',
};

const balancesByDate: Record<string, string> = {
  '2026-09-12': '145750',
  '2026-08-15': '0',
};

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
  it('shows the current balance and the as-of balance for today in dollars only (SC-009)', async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText('Current balance')).toBeInTheDocument();
    expect((await screen.findAllByText('$4,457.50')).length).toBeGreaterThanOrEqual(2);
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
    expect((await screen.findAllByText('$4,457.50')).length).toBeGreaterThanOrEqual(2);

    stubRoutes({ current: '345750', balance: '345750' });
    await invalidateEntryDerived(queryClient);
    expect((await screen.findAllByText('$3,457.50')).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('$4,457.50')).not.toBeInTheDocument();
  });

  it('says so when the account does not exist', async () => {
    stubRoutes();
    renderPage('99');
    expect(await screen.findByText('This account does not exist.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to accounts' })).toBeInTheDocument();
  });
});
