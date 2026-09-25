import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeRow } from './SwipeRow';

function renderRow() {
  const onEdit = vi.fn<() => void>();
  const onDelete = vi.fn<() => void>();
  const onRowClick = vi.fn<() => void>();
  render(
    <SwipeRow onEdit={onEdit} onDelete={onDelete}>
      <button type="button" onClick={onRowClick}>
        Market
      </button>
    </SwipeRow>,
  );
  const row = screen.getByRole('button', { name: 'Market' }).parentElement as HTMLElement;
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 64));
  const swipe = (from: number, to: number) => {
    fireEvent.pointerDown(row, { clientX: from });
    fireEvent.pointerMove(row, { clientX: to });
    fireEvent.pointerUp(row, { clientX: to });
  };
  return { row, swipe, onEdit, onDelete, onRowClick };
}

describe('SwipeRow', () => {
  it('lets vertical panning through and translates the row while dragging', () => {
    const { row } = renderRow();
    expect(row.className).toContain('touch-pan-y');
    fireEvent.pointerDown(row, { clientX: 300 });
    fireEvent.pointerMove(row, { clientX: 240 });
    expect(row.style.transform).toMatch(/^translateX\(-60/);
    expect(screen.getByText('Delete')).toBeInTheDocument();
    fireEvent.pointerMove(row, { clientX: 360 });
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('snaps back with no action at or below 35% of the row width', () => {
    const { row, swipe, onEdit, onDelete } = renderRow();
    swipe(300, 160);
    swipe(100, 240);
    expect(onDelete).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(row.style.transform).toBe('');
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('deletes past 35% to the left and edits past 35% to the right', () => {
    const { swipe, onEdit, onDelete } = renderRow();
    swipe(350, 150);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    swipe(50, 250);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('swallows the click that ends a drag but keeps a plain tap', () => {
    const { row, swipe, onRowClick } = renderRow();
    swipe(300, 200);
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.pointerDown(row, { clientX: 100 });
    fireEvent.pointerUp(row, { clientX: 100 });
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
