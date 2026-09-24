import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Cents, formatCents } from '../../lib/money';
import { Amount } from './Amount';

function text(element: ReactElement): string | null {
  return render(element).container.textContent;
}

describe('Amount', () => {
  it.each(['445750', '-50000', '0', '1000000000000000'])(
    'renders %s exactly as money.ts formats it',
    (cents) => {
      expect(text(<Amount cents={cents} />)).toBe(formatCents(cents as Cents));
      expect(text(<Amount cents={cents} size="large" />)).toBe(formatCents(cents as Cents));
    },
  );

  it('keeps the minus sign and the negative colour together', () => {
    const { container } = render(<Amount cents="-12000" />);
    expect(container.textContent).toBe('-$120.00');
    expect(container.firstElementChild).toHaveClass('text-negative');
  });

  it('adds an explicit plus only when asked, never on zero', () => {
    expect(text(<Amount cents="300000" sign="always" />)).toBe('+$3,000.00');
    expect(text(<Amount cents="0" sign="always" />)).toBe('$0.00');
    expect(text(<Amount cents="-300000" sign="always" />)).toBe('-$3,000.00');
  });

  it('renders the cents of a large amount in their own fainter span', () => {
    const { container } = render(<Amount cents="445750" size="large" />);
    const cents = container.querySelector('.text-text-3');
    expect(cents).toHaveTextContent('.50');
    expect(container.firstElementChild?.firstChild?.textContent).toBe('$4,457');
  });
});
