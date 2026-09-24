import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('marks the container busy and names what is loading', () => {
    const { container } = render(
      <Skeleton label="Loading transactions…" shapes={['line', 'block', 'row']} />,
    );
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(screen.getByText('Loading transactions…')).toHaveClass('sr-only');
    expect(busy?.children).toHaveLength(4);
  });

  it('shimmers only when motion is allowed', () => {
    const { container } = render(<Skeleton label="Loading…" shapes={['line']} />);
    const bone = container.querySelector('.bg-sand-350');
    expect(bone?.className).toContain('motion-safe:after:animate-shimmer');
    expect(bone?.className).not.toMatch(/(^|\s)after:animate-shimmer/);
  });
});
