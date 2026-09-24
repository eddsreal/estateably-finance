import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Delta } from './Delta';

describe('Delta (FR-004)', () => {
  it('marks a rise with ▲ and the signed amount', () => {
    const { container } = render(<Delta cents="12000" />);
    expect(container).toHaveTextContent('▲Up+$120.00');
    expect(container.firstElementChild).toHaveClass('text-accent-hover');
  });

  it('marks a fall with ▼ and keeps the minus sign', () => {
    const { container } = render(<Delta cents="-12000" />);
    expect(container).toHaveTextContent('▼Down-$120.00');
    expect(container.firstElementChild).toHaveClass('text-negative-strong');
  });

  it('shows no change as ▲ $0.00 with no sign', () => {
    const { container } = render(<Delta cents="0" />);
    expect(container).toHaveTextContent('▲Up$0.00');
  });

  it('never uses the kind arrows', () => {
    const { container } = render(<Delta cents="-1" />);
    expect(container.textContent).not.toMatch(/[↑↓]/);
  });
});
