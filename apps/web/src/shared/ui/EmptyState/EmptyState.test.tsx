import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ICONS } from '../Icon/Icon';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('names what is missing, what fills it, and its one action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn<() => void>();
    render(
      <EmptyState
        icon={ICONS.accounts}
        title="No accounts yet"
        hint="Add a bank account, cash or a card to start tracking balances."
        action={{ label: 'Add account', onClick }}
      />,
    );
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders without an action', () => {
    render(
      <EmptyState
        icon={ICONS.categories}
        title="No archived categories"
        hint="Categories you archive show up here and can be restored at any time."
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
