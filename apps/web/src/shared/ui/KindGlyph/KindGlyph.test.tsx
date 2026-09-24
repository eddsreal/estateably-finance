import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Kind, KindGlyph } from './KindGlyph';

describe('KindGlyph (FR-004)', () => {
  it.each<[Kind, string, string, string]>([
    ['expense', '↑', 'Expense', 'text-negative'],
    ['income', '↓', 'Income', 'text-accent'],
    ['transfer', '⇄', 'Transfer', 'text-transfer-strong'],
    ['opening', '●', 'Opening balance', 'text-text-2'],
  ])('renders %s as glyph and colour together with a label', (kind, glyph, label, tone) => {
    const { container } = render(<KindGlyph kind={kind} />);
    const tile = container.firstElementChild;
    expect(tile).toHaveTextContent(`${glyph}${label}`);
    expect(tile).toHaveClass(tone);
    expect(screen.getByText(glyph)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(label)).toHaveClass('sr-only');
  });

  it('shows a visible label, hiding the glyph from assistive technology', () => {
    const { container } = render(<KindGlyph kind="expense" label="Bill" showLabel />);
    expect(container).toHaveTextContent('↑Bill');
    expect(container.querySelector('.sr-only')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('text-negative');
  });
});
