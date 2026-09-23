import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../../../test-api-stub';
import { CategoriesPage } from './CategoriesPage';

const categories = [
  { id: '1', name: 'Groceries', type: 'expense', archived: false },
  { id: '10', name: 'Salary', type: 'income', archived: false },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoriesPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CategoriesPage', () => {
  it('lists categories with their type chips', async () => {
    stubApi({ 'GET /categories': categories });
    renderPage();
    expect(await screen.findByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.getByText('income')).toBeInTheDocument();
  });

  it('opens the create form with name and type fields and enforces the 60-character cap', async () => {
    stubApi({ 'GET /categories': categories });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Groceries');
    await user.click(screen.getByRole('button', { name: 'New category' }));
    const name = screen.getByLabelText('Name');
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
    await user.type(name, 'x'.repeat(61));
    await user.click(screen.getByRole('button', { name: 'Create category' }));
    expect(await screen.findByText('name must be at most 60 characters')).toBeInTheDocument();
  });

  it('shows the empty state when no category exists', async () => {
    stubApi({ 'GET /categories': [] });
    renderPage();
    expect(await screen.findByText('No categories yet')).toBeInTheDocument();
  });
});
