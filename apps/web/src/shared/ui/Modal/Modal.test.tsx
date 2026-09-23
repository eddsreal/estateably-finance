import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Picker } from '../Picker/Picker';
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

  it('leaves the dialog open when Escape only closes a picker inside it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(
      <Modal title="Edit" open onClose={onClose}>
        <label htmlFor="kind">Kind</label>
        <Picker
          id="kind"
          value={null}
          onChange={() => {}}
          options={[{ value: 'a', label: 'A' }]}
          placeholder="—"
        />
      </Modal>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Kind' }));
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('listbox'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the control that opened it when it closes', () => {
    const tree = (open: boolean) => (
      <>
        <button type="button">Open</button>
        <Modal title="Edit" open={open} onClose={() => {}}>
          <input aria-label="Name" data-autofocus />
        </Modal>
      </>
    );
    const { rerender } = render(tree(false));
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    rerender(tree(true));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    rerender(tree(false));
    expect(opener).toHaveFocus();
  });
});
