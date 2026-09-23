import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Picker, PickerOption } from './Picker';

const options: PickerOption[] = [
  { value: '1', label: 'Checking' },
  { value: '2', label: 'Savings' },
  { value: '3', label: 'Old Bank', note: '— archived', disabled: true },
];

function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <label htmlFor="account">Account</label>
      <Picker id="account" value={value} onChange={setValue} options={options} placeholder="—" />
      <p data-testid="picked">{value ?? 'none'}</p>
    </>
  );
}

describe('Picker', () => {
  it('opens with the keyboard, arrows through options and selects with Enter', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Account' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByTestId('picked')).toHaveTextContent('2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('skips disabled options when arrowing and never selects them', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2" />);
    const trigger = screen.getByRole('combobox', { name: 'Account' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByTestId('picked')).toHaveTextContent('2');
  });

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup();
    render(<Harness initial="1" />);
    const trigger = screen.getByRole('combobox', { name: 'Account' });
    trigger.focus();
    await user.keyboard('{Enter}{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('picked')).toHaveTextContent('1');
  });

  it('clears the value through the placeholder row', async () => {
    const user = userEvent.setup();
    render(<Harness initial="1" />);
    const trigger = screen.getByRole('combobox', { name: 'Account' });
    await user.click(trigger);
    await user.click(screen.getAllByRole('option')[0]);
    expect(screen.getByTestId('picked')).toHaveTextContent('none');
  });

  it('shows disabled options with their note', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    const archived = screen.getByRole('option', { name: /Old Bank/ });
    expect(archived).toHaveAttribute('aria-disabled', 'true');
    expect(archived).toHaveTextContent('— archived');
  });
});
