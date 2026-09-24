import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('is decorative and hidden from assistive technology', () => {
    const { container } = render(<Sparkline series={['0', '100']} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks a series that held or rose as rising, and one that fell as falling', () => {
    const { container, rerender } = render(<Sparkline series={['100', '100']} />);
    expect(container.firstElementChild).toHaveAttribute('data-trend', 'rising');
    rerender(<Sparkline series={['100', '-1']} />);
    expect(container.firstElementChild).toHaveAttribute('data-trend', 'falling');
  });

  it('renders a single day and a 10-year series without failing', () => {
    const long = Array.from({ length: 3650 }, (_, i) => (i % 97).toString());
    expect(() => render(<Sparkline series={['42']} />)).not.toThrow();
    expect(() => render(<Sparkline series={long} />)).not.toThrow();
  });
});
