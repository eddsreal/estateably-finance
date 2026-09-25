import { fireEvent, render, screen } from '@testing-library/react';
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

  it('opens the sheet variant with a drag handle, the same title, close and focus handling', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(
      <Modal title="New transaction" open onClose={onClose} variant="sheet">
        <input aria-label="Amount" data-autofocus />
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'New transaction' });
    expect(dialog.className).toContain('mt-auto');
    expect(dialog.className).toContain('open:animate-sheet');
    expect(dialog.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('dismisses the sheet when the handle is dragged down past 35% of its height', () => {
    const onClose = vi.fn<() => void>();
    render(
      <Modal title="New transaction" open onClose={onClose} variant="sheet">
        <p>form here</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 200, 390, 600));
    const handle = dialog.firstElementChild as HTMLElement;

    fireEvent.pointerDown(handle, { clientY: 210 });
    fireEvent.pointerMove(handle, { clientY: 300 });
    expect(dialog.style.transform).toMatch(/^translateY\(90/);
    fireEvent.pointerUp(handle, { clientY: 300 });
    expect(dialog.style.transform).toBe('');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { clientY: 210 });
    fireEvent.pointerMove(handle, { clientY: 480 });
    fireEvent.pointerUp(handle, { clientY: 480 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
