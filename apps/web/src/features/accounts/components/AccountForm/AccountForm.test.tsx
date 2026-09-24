import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { AccountForm, EditableAccount } from './AccountForm';

const oldSavings: EditableAccount = {
  id: '9',
  name: 'Old Savings',
  kind: 'bank',
  openingBalance: '25000',
  openingDate: '2024-03-03',
  archived: true,
  balance: '21000',
};

let calls: string[] = [];

function stubRoutes() {
  calls = [];
  const record = (url: URL) => {
    calls.push(url.pathname);
    return { body: { ...oldSavings, archived: url.pathname.endsWith('/archive') } };
  };
  stubApi({ 'POST /accounts/9/archive': record, 'POST /accounts/9/unarchive': record });
}

function renderForm(account: EditableAccount | null) {
  const onDone = vi.fn<() => void>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountForm account={account} onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
}

afterEach(() => vi.unstubAllGlobals());

describe('AccountForm', () => {
  it('creates without archive controls and explains negative opening balances', () => {
    renderForm(null);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
    expect(screen.getByText(/The opening balance can be negative/)).toBeInTheDocument();
    expect(screen.getByText('0/60')).toBeInTheDocument();
  });

  it('offers Unarchive for an archived account and notes its scheduled payments cannot be marked paid', async () => {
    stubRoutes();
    const onDone = renderForm(oldSavings);
    expect(
      screen.getByText(/Scheduled payments on this account can't be marked paid\./),
    ).toBeInTheDocument();
    expect(screen.getByText('11/60')).toBeInTheDocument();
    expect(screen.getByText('$210.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive account' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls).toEqual(['/accounts/9/unarchive']);
  });

  it('offers Archive account for an active account, without the archived note', async () => {
    stubRoutes();
    const onDone = renderForm({ ...oldSavings, archived: false });
    expect(screen.queryByText(/can't be marked paid/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Archive account' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls).toEqual(['/accounts/9/archive']);
  });
});
