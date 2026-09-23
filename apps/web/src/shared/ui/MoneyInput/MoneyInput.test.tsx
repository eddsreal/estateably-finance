import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Harness({ autoFocus = false, initial = '' }: { autoFocus?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="amount">Amount</label>
      <MoneyInput id="amount" value={value} onChange={setValue} autoFocus={autoFocus} />
      <button type="button">elsewhere</button>
    </>
  );
}

describe('MoneyInput', () => {
  it('normalises valid input to 1,234.50 on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Amount');
    await user.type(input, '1234.5');
    await user.tab();
    expect(input).toHaveValue('1,234.50');
  });

  it('leaves invalid input as typed for validation to report', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Amount');
    await user.type(input, '12.345');
    await user.tab();
    expect(input).toHaveValue('12.345');
  });

  it('keeps an explicit minus through normalisation', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Amount');
    await user.type(input, '-$500');
    await user.tab();
    expect(input).toHaveValue('-500.00');
  });

  it('autofocuses only when asked', () => {
    render(<Harness autoFocus />);
    expect(screen.getByLabelText('Amount')).toHaveFocus();
  });
});
