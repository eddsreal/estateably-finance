import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CategoryPicker } from './CategoryPicker';

const categories = [
  { id: '1', name: 'Groceries', type: 'expense' as const, archived: false },
  { id: '10', name: 'Salary', type: 'income' as const, archived: false },
  { id: '13', name: 'Subscriptions', type: 'expense' as const, archived: true },
];

describe('CategoryPicker', () => {
  it('filters by type and excludes archived categories', async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="category">Category</label>
        <CategoryPicker
          id="category"
          value={null}
          onChange={() => {}}
          categories={categories}
          type="expense"
        />
      </>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Salary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Subscriptions' })).not.toBeInTheDocument();
  });
});
