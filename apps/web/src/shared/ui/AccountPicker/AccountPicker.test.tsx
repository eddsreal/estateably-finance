import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AccountPicker } from './AccountPicker';

const accounts = [
  { id: '1', name: 'Checking', archived: false },
  { id: '2', name: 'Savings', archived: false },
  { id: '3', name: 'Old Bank', archived: true },
];

describe('AccountPicker', () => {
  it('shows the transfer source disabled with "— source" and archived accounts flagged', async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="destination">To account</label>
        <AccountPicker
          id="destination"
          value={null}
          onChange={() => {}}
          accounts={accounts}
          sourceId="1"
        />
      </>,
    );
    await user.click(screen.getByRole('combobox', { name: 'To account' }));
    const source = screen.getByRole('option', { name: /Checking/ });
    expect(source).toHaveAttribute('aria-disabled', 'true');
    expect(source).toHaveTextContent('— source');
    const archived = screen.getByRole('option', { name: /Old Bank/ });
    expect(archived).toHaveAttribute('aria-disabled', 'true');
    expect(archived).toHaveTextContent('— archived');
    expect(screen.getByRole('option', { name: 'Savings' })).not.toHaveAttribute('aria-disabled');
  });
});
