import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { AccountsPage } from './AccountsPage';

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
      id: '3',
      name: 'Visa',
      kind: 'card',
      openingBalance: '-50000',
      openingDate: '2026-09-01',
      archived: false,
      balance: '-50000',
    },
  ],
  totalBalance: '395750',
};

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
  it('renders balances and the dashboard total in dollars only, never raw cents (SC-009)', async () => {
    stubApi({ 'GET /accounts': accounts });
    renderPage();
    expect(await screen.findByText('$4,457.50')).toBeInTheDocument();
    expect(screen.getByText('-$500.00')).toBeInTheDocument();
    expect(screen.getByText('$3,957.50')).toBeInTheDocument();
    expect(screen.queryByText('445750')).not.toBeInTheDocument();
    expect(screen.queryByText('395750')).not.toBeInTheDocument();
    expect(screen.queryByText('-50000')).not.toBeInTheDocument();
  });

  it('opens the create form with the money input autofocused and a max-today date', async () => {
    stubApi({ 'GET /accounts': accounts });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('$4,457.50');
    await user.click(screen.getByRole('button', { name: 'New account' }));
    expect(screen.getByLabelText('Opening balance')).toHaveFocus();
    expect(screen.getByLabelText('Opening date')).toHaveAttribute('max');
  });

  it('reports a money parse error beside the field', async () => {
    stubApi({ 'GET /accounts': accounts });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('$4,457.50');
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
    stubApi({
      'GET /accounts': accounts,
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
    await screen.findByText('$4,457.50');
    await user.click(screen.getByRole('button', { name: 'New account' }));
    await user.type(screen.getByLabelText('Name'), 'Cash box');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const group = await screen.findByRole('radiogroup', { name: 'Kind' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('kind must be bank, cash or card');
  });

  it('shows an error state with retry instead of stale balances when the list cannot load', async () => {
    stubApi({ 'GET /accounts': () => ({ status: 500, body: { message: 'down' } }) });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be refreshed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('$4,457.50')).not.toBeInTheDocument();
  });
});
