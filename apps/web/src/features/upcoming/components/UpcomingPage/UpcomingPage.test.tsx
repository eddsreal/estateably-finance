import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { dueLabel, UpcomingPage } from './UpcomingPage';

function localDate(offsetDays: number): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA').format(now);
}

const accounts = {
  items: [
    {
      id: '1',
      name: 'Checking',
      kind: 'bank',
      openingBalance: '0',
      openingDate: '2026-01-01',
      archived: false,
      balance: '445750',
    },
    {
      id: '2',
      name: 'Old Bank',
      kind: 'bank',
      openingBalance: '0',
      openingDate: '2026-01-01',
      archived: true,
      balance: '0',
    },
  ],
  totalBalance: '445750',
};

const categories = [
  { id: '10', name: 'Rent', type: 'expense', archived: false },
  { id: '11', name: 'Salary', type: 'income', archived: false },
];

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: '7',
    kind: 'bill',
    description: 'Rent',
    amount: '120000',
    accountId: '1',
    categoryId: '10',
    nextDueDate: localDate(3),
    recurrence: 'monthly',
    status: 'active',
    overdue: false,
    overdueCount: 0,
    accountArchived: false,
    ...overrides,
  };
}

function renderPage(items: unknown[]) {
  stubApi({
    'GET /scheduled-items': items,
    'GET /accounts': accounts,
    'GET /categories': categories,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpcomingPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('dueLabel', () => {
  it('names today, tomorrow, future days and overdue days', () => {
    expect(dueLabel('2026-09-24', '2026-09-24')).toBe('Due today');
    expect(dueLabel('2026-09-25', '2026-09-24')).toBe('Due tomorrow');
    expect(dueLabel('2026-09-30', '2026-09-24')).toBe('Due in 6 days');
    expect(dueLabel('2026-09-23', '2026-09-24')).toBe('Overdue 1 day');
    expect(dueLabel('2026-08-24', '2026-09-24')).toBe('Overdue 31 days');
  });
});

describe('UpcomingPage', () => {
  it('lists items with relative due labels and dollar amounts only (SC-009)', async () => {
    renderPage([
      item(),
      item({
        id: '8',
        kind: 'income',
        description: 'Dog walking',
        amount: '4500',
        categoryId: '11',
        nextDueDate: localDate(1),
        recurrence: 'weekly',
      }),
    ]);
    expect(await screen.findByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('$1,200.00')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.queryByText('120000')).not.toBeInTheDocument();
    expect(screen.getByText('Due in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Due tomorrow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark paid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark received' })).toBeInTheDocument();
  });

  it('flags overdue items and items on an archived account', async () => {
    renderPage([
      item({ nextDueDate: localDate(-40), overdue: true, overdueCount: 2 }),
      item({ id: '9', description: 'Old dues', accountId: '2', accountArchived: true }),
    ]);
    expect(await screen.findByText(/Overdue 40 days · 2 missed/)).toBeInTheDocument();
    expect(screen.getByText('Account archived')).toBeInTheDocument();
  });

  it('shows the empty state when nothing is scheduled', async () => {
    renderPage([]);
    expect(await screen.findByText('Nothing scheduled')).toBeInTheDocument();
    expect(
      screen.getByText('Future bills and income you add will be listed here by due date.'),
    ).toBeInTheDocument();
  });

  it('opens the confirm modal pre-filled from the item with every field editable (FR-018)', async () => {
    renderPage([item({ nextDueDate: localDate(0) })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Mark as paid')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('1,200.00');
    expect(within(dialog).getByLabelText('Date')).toHaveValue(localDate(0));
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Rent');
    expect(within(dialog).getByLabelText('Amount')).toBeEnabled();
    expect(within(dialog).getByLabelText('Date')).toBeEnabled();
    expect(within(dialog).getByLabelText('Description')).toBeEnabled();
  });

  it('opens the edit form when the description is activated', async () => {
    renderPage([item()]);
    await userEvent.click(await screen.findByRole('button', { name: 'Rent' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit scheduled item')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Next due date')).toHaveValue(localDate(3));
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
