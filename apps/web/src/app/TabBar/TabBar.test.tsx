import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { TabBar } from './TabBar';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderBar(path = '/') {
  const onAdd = vi.fn<() => void>();
  render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar onAdd={onAdd} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), onAdd };
}

describe('TabBar', () => {
  it('shows Accounts, Report, Add, Upcoming and More, only below the md breakpoint', () => {
    renderBar();
    const bar = screen.getByRole('navigation', { name: 'Tabs' });
    expect(bar.className).toContain('md:hidden');
    expect(
      [...bar.querySelectorAll('a, button')].map(
        (item) => item.getAttribute('aria-label') ?? item.textContent,
      ),
    ).toEqual(['Accounts', 'Report', 'New transaction', 'Upcoming', 'More']);
    expect(within(bar).getByRole('link', { name: 'Accounts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks the current tab and opens the new-transaction action from Add', async () => {
    const { user, onAdd } = renderBar('/upcoming');
    expect(screen.getByRole('link', { name: 'Upcoming' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Accounts' })).not.toHaveAttribute('aria-current');
    await user.click(screen.getByRole('button', { name: 'New transaction' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('opens More as a sheet with the remaining routes grouped as in the sidebar', async () => {
    const { user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'More' }));
    const more = screen.getByRole('dialog', { name: 'More' });
    expect(more.className).toContain('open:animate-sheet');
    const groups = within(more)
      .getAllByRole('list')
      .map((list) => [
        list.getAttribute('aria-labelledby'),
        within(list)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ]);
    expect(groups).toEqual([
      ['more-Money', ['Transactions']],
      ['more-Reports', ['Similar transactions']],
      ['more-Planning', ['Projection', 'Projects']],
      ['more-Setup', ['Categories']],
    ]);
    await user.click(within(more).getByRole('link', { name: 'Projection' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/projection');
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });
});
