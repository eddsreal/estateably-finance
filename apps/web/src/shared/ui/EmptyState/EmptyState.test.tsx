import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('names what is missing, what fills it, and one primary action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn<() => void>();
    render(
      <EmptyState
        title="No accounts yet"
        hint="Create your first account to start recording transactions."
        actionLabel="New account"
        onAction={onAction}
      />,
    );
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New account' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('renders without an action', () => {
    render(<EmptyState title="No transactions match these filters" hint="Loosen the filters." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
