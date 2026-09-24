import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { ProjectDetailPage } from './ProjectDetailPage';

const projects = [
  {
    id: '2',
    name: 'Home office',
    status: 'active',
    budget: '5000',
    spent: '7650',
    remaining: '-2650',
    overBudget: true,
  },
];

const accounts = {
  items: [
    {
      id: '1',
      name: 'Checking',
      kind: 'bank',
      openingBalance: '0',
      openingDate: '2026-09-01',
      archived: false,
      balance: '0',
    },
    {
      id: '4',
      name: 'Cash',
      kind: 'cash',
      openingBalance: '0',
      openingDate: '2026-09-01',
      archived: false,
      balance: '0',
    },
  ],
  totalBalance: '0',
};

const categories = [{ id: '8', name: 'Shopping', type: 'expense', archived: false }];

const expenses = {
  items: [
    {
      id: '50',
      kind: 'expense',
      date: '2026-09-24',
      description: 'Bookstore',
      amount: '2550',
      accountId: '4',
      categoryId: '8',
      projectId: '2',
    },
    {
      id: '51',
      kind: 'expense',
      date: '2026-08-24',
      description: 'Desk lamp',
      amount: '5100',
      accountId: '1',
      categoryId: '8',
      projectId: '2',
    },
  ],
  total: 2,
  limit: 50,
  offset: 0,
};

function renderPage(projectId = '2') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectDetailPage projectId={projectId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ProjectDetailPage', () => {
  it('shows spent against budget, the over-budget flag with its overrun, and the expenses from both accounts (US5 #2, #4)', async () => {
    stubApi({
      'GET /projects': projects,
      'GET /projects/2/transactions': expenses,
      'GET /accounts': accounts,
      'GET /categories': categories,
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: /Home office/ })).toHaveTextContent(
      'Over budget',
    );
    expect(screen.getByRole('status', { name: 'Spent' })).toHaveTextContent('$76.50');
    expect(screen.getByText('of a $50.00 budget')).toBeInTheDocument();
    expect(screen.getByText('$26.50 over')).toBeInTheDocument();
    const table = within(await screen.findByRole('table', { name: 'Expenses in Home office' }));
    expect(await table.findByText('Cash')).toBeInTheDocument();
    expect(table.getByText('Checking')).toBeInTheDocument();
    expect(table.getByText('-$25.50')).toBeInTheDocument();
    expect(screen.getByText('1–2 of 2')).toBeInTheDocument();
  });

  it('keeps the project when an expense is edited from the project', async () => {
    let sent: { projectId?: string } | undefined;
    stubApi({
      'GET /projects': projects,
      'GET /projects/2/transactions': expenses,
      'GET /accounts': accounts,
      'GET /categories': categories,
      'PUT /transactions/50': (_url: URL, init?: RequestInit) => {
        sent = JSON.parse(init?.body as string);
        return { body: expenses.items[0] };
      },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Bookstore' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('combobox', { name: /Project/ })).toHaveTextContent('Home office');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(sent?.projectId).toBe('2'));
  });

  it('shows the empty state for a project without expenses', async () => {
    stubApi({
      'GET /projects': [
        { id: '3', name: 'Remodel', status: 'active', spent: '0', overBudget: false },
      ],
      'GET /projects/3/transactions': { items: [], total: 0, limit: 50, offset: 0 },
      'GET /accounts': accounts,
      'GET /categories': categories,
    });
    renderPage('3');
    expect(await screen.findByText('No expenses in this project yet')).toBeInTheDocument();
    expect(screen.getByText('No budget')).toBeInTheDocument();
  });

  it('explains a missing project instead of rendering zeros', async () => {
    stubApi({
      'GET /projects': projects,
      'GET /projects/9/transactions': () => ({ status: 404, body: {} }),
      'GET /accounts': accounts,
      'GET /categories': categories,
    });
    renderPage('9');
    expect(await screen.findByRole('alert')).toHaveTextContent('This project does not exist.');
  });
});
