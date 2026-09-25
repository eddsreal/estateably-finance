import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { parseDollars } from '../../lib/money';
import { Keypad, pressKey } from './Keypad';

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <output aria-label="Amount">{value}</output>
      <Keypad value={value} onChange={setValue} />
    </>
  );
}

describe('pressKey', () => {
  it('appends digits and one decimal point, and refuses a third decimal', () => {
    expect(pressKey('', '4')).toBe('4');
    expect(pressKey('42', '.')).toBe('42.');
    expect(pressKey('42.', '.')).toBe('42.');
    expect(pressKey('42.5', '0')).toBe('42.50');
    expect(pressKey('42.50', '1')).toBe('42.50');
    expect(pressKey('', '.')).toBe('0.');
    expect(pressKey('0', '7')).toBe('7');
  });

  it('backspaces the last character and drops the thousands separators MoneyInput adds', () => {
    expect(pressKey('42.50', '⌫')).toBe('42.5');
    expect(pressKey('', '⌫')).toBe('');
    expect(pressKey('1,234.50', '⌫')).toBe('1234.5');
    expect(pressKey('1,234', '5')).toBe('12345');
  });

  it('only writes strings money.ts parses to the same cents', () => {
    let value = '';
    for (const key of ['1', '2', '3', '4', '.', '5', '6', '7'] as const) {
      value = pressKey(value, key);
    }
    expect(value).toBe('1234.56');
    expect(parseDollars(value)).toBe('123456');
  });
});

describe('Keypad', () => {
  it('writes into the value by click and by keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    for (const name of ['1', '8', 'Decimal point', '4', '0', '9']) {
      await user.click(screen.getByRole('button', { name }));
    }
    expect(screen.getByLabelText('Amount')).toHaveTextContent('18.40');
    await user.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(screen.getByLabelText('Amount')).toHaveTextContent('18.4');
    screen.getByRole('button', { name: '2' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Amount')).toHaveTextContent('18.42');
    expect(screen.getByRole('group', { name: 'Keypad' })).toBeInTheDocument();
  });
});
