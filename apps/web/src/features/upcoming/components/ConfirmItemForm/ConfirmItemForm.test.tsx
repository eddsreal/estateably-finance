import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { ConfirmItemForm } from './ConfirmItemForm';

function localDate(offsetDays: number): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA').format(now);
}

const accounts = [{ id: '1', name: 'Checking', kind: 'bank' as const, archived: false }];
const categories = [{ id: '10', name: 'Utilities', type: 'expense' as const, archived: false }];

function renderForm(onDone = vi.fn<() => void>()) {
  let body: unknown = null;
  stubApi({
    'POST /scheduled-items/7/confirm': (_url: URL, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return { status: 201, body: {} };
    },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmItemForm
        item={{
          id: '7',
          kind: 'bill',
          description: 'Internet',
          amount: '6500',
          accountId: '1',
          categoryId: '10',
          nextDueDate: localDate(-4),
          recurrence: 'monthly',
        }}
        accounts={accounts}
        categories={categories}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return { sent: () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe('ConfirmItemForm', () => {
  it('opens pre-filled from the item with its due state', () => {
    renderForm();
    expect(screen.getByText('Internet · Monthly')).toBeInTheDocument();
    expect(screen.getByText('⚠ Overdue 4 days')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('65.00');
    expect(screen.getByLabelText('Date')).toHaveValue(localDate(-4));
    expect(screen.getByLabelText('Description')).toHaveValue('Internet');
    expect(screen.getByText('8/120')).toBeInTheDocument();
    expect(screen.queryByText(/Scheduled:/)).not.toBeInTheDocument();
  });

  it('shows the scheduled amount next to an edited amount and records the edited one', async () => {
    const onDone = vi.fn<() => void>();
    const { sent } = renderForm(onDone);
    const amount = screen.getByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '68.20');
    expect(screen.getByText('Scheduled: $65.00')).toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, '65');
    expect(screen.queryByText(/Scheduled:/)).not.toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, '68.20');
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(sent()).toEqual({
      amount: '6820',
      date: localDate(-4),
      accountId: '1',
      categoryId: '10',
      description: 'Internet',
    });
  });
});
