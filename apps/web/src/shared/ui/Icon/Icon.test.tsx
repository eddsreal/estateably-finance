import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon, ICONS } from './Icon';

describe('Icon', () => {
  it('draws the given path, hidden from assistive technology, in the current colour', () => {
    const { container } = render(<Icon path={ICONS.bank} size="size-19" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveClass('size-19');
    expect(svg.querySelector('path')).toHaveAttribute('d', ICONS.bank);
  });
});
