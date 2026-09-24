import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All · 2' })).toBeChecked();
  });

  it('filters the list by type', async () => {
    stubApi({ 'GET /categories': categories });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Groceries');
    await user.click(screen.getByRole('radio', { name: 'Income · 1' }));
    expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
  });

  it('renames inline with Enter and returns focus to the Rename button', async () => {
    let body: unknown;
    stubApi({
      'GET /categories': categories,
      'PATCH /categories/1': (_url: URL, init?: RequestInit) => {
        body = JSON.parse(init?.body as string);
        return { body: { ...categories[0], name: 'Food' } };
      },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Groceries');
    await user.click(screen.getByRole('button', { name: 'Rename Groceries' }));
    const input = screen.getByLabelText('Rename "Groceries"');
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '  Food {Enter}');
    expect(body).toEqual({ name: 'Food' });
    expect(await screen.findByRole('button', { name: 'Rename Groceries' })).toHaveFocus();
    expect(screen.queryByLabelText('Rename "Groceries"')).not.toBeInTheDocument();
  });

  it('cancels the inline rename with Escape without saving', async () => {
    const patch = vi.fn<() => { body: unknown }>(() => ({ body: categories[0] }));
    stubApi({ 'GET /categories': categories, 'PATCH /categories/1': patch });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Groceries');
    await user.click(screen.getByRole('button', { name: 'Rename Groceries' }));
    await user.type(screen.getByLabelText('Rename "Groceries"'), 'x{Escape}');
    expect(screen.queryByLabelText('Rename "Groceries"')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Groceries' })).toHaveFocus();
    expect(patch).not.toHaveBeenCalled();
  });

  it('rejects a case-insensitive duplicate name inline without saving', async () => {
    const patch = vi.fn<() => { body: unknown }>(() => ({ body: categories[0] }));
    stubApi({ 'GET /categories': categories, 'PATCH /categories/1': patch });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Groceries');
    await user.click(screen.getByRole('button', { name: 'Rename Groceries' }));
    const input = screen.getByLabelText('Rename "Groceries"');
    await user.clear(input);
    await user.type(input, ' salary {Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A category named "Salary" already exists.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it('shows the server duplicate-name error inline and keeps the editor open', async () => {
    stubApi({
      'GET /categories': categories,
      'PATCH /categories/1': () => ({
        status: 409,
        body: {
          code: 'DUPLICATE_NAME',
          message: 'A category named "Pets" already exists',
          details: [{ field: 'name', message: 'name is already in use' }],
          correlationId: 'abc',
        },
      }),
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Groceries');
    const row = screen.getByText('Groceries').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Rename Groceries' }));
    const input = screen.getByLabelText('Rename "Groceries"');
    await user.clear(input);
    await user.type(input, 'Pets');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A category named "Pets" already exists',
    );
    expect(screen.getByLabelText('Rename "Groceries"')).toHaveValue('Pets');
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
