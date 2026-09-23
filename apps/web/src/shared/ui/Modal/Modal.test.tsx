import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders the title and content when open, nothing when closed', () => {
    const { rerender } = render(
      <Modal title="New account" open onClose={() => {}}>
        <p>form here</p>
      </Modal>,
    );
    expect(screen.getByRole('heading', { name: 'New account' })).toBeInTheDocument();
    rerender(
      <Modal title="New account" open={false} onClose={() => {}}>
        <p>form here</p>
      </Modal>,
    );
    expect(screen.queryByRole('heading', { name: 'New account' })).not.toBeInTheDocument();
  });

  it('closes on Escape and on the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(
      <Modal title="Edit" open onClose={onClose}>
        <input aria-label="Name" />
      </Modal>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
