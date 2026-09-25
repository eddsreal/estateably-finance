import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowActions } from './RowActions';

const onRowClick = vi.fn<() => void>();

function renderActions() {
  onRowClick.mockClear();
  const onEdit = vi.fn<() => void>();
  const onDelete = vi.fn<() => void>();
  render(
    <>
      <RowActions label="Actions for Market" onEdit={onEdit} onDelete={onDelete} />
      <button type="button">After</button>
    </>,
  );
  document.body.addEventListener('click', onRowClick);
  const button = screen.getByRole('button', { name: 'Actions for Market' });
  return { user: userEvent.setup(), button, onEdit, onDelete, onRowClick };
}

describe('RowActions', () => {
  afterEach(() => document.body.removeEventListener('click', onRowClick));

  it('is a collapsed menu button that opens on click with focus on Edit', async () => {
    const { user, button, onRowClick } = renderActions();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Actions for Market' });
    expect(button).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('is operable by keyboard: arrows, Home, End, Escape and Enter', async () => {
    const { user, button, onDelete } = renderActions();
    button.focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('runs Edit, and closes on Tab or a click outside without acting', async () => {
    const { user, button, onEdit, onDelete } = renderActions();
    await user.click(button);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    await user.click(button);
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'After' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
