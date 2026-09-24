import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups the routes as Money, Reports, Planning and Setup, in order', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const groups = within(nav).getAllByRole('list');
    expect(groups.map((list) => list.getAttribute('aria-labelledby'))).toEqual([
      'nav-Money',
      'nav-Reports',
      'nav-Planning',
      'nav-Setup',
    ]);
    expect(
      groups.map((list) =>
        within(list)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ),
    ).toEqual([
      ['Accounts', 'Transactions'],
      ['Monthly expenses', 'Similar transactions'],
      ['Upcoming', 'Projection', 'Projects'],
      ['Categories'],
    ]);
    expect(screen.getByRole('list', { name: 'Planning' })).toBeInTheDocument();
  });

  it('marks only the active route with aria-current', () => {
    renderAt('/report');
    expect(screen.getByRole('link', { name: 'Monthly expenses' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
  });

  it('marks Accounts on the index route only', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Transactions' })).not.toHaveAttribute('aria-current');
  });

  it('shows the current date and the currency in the footer', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 22, 10, 0));
    renderAt('/');
    expect(screen.getByText('Sep 22, 2026 · USD')).toBeInTheDocument();
  });
});
