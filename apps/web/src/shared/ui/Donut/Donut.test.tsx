import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Cents, formatCents, share } from '../../lib/money';
import { Donut, DonutSegment } from './Donut';

const segments: DonutSegment[] = [
  { id: 'home', name: 'Home', total: '132000' },
  { id: 'travel', name: 'Travel', total: '110000' },
  { id: 'groceries', name: 'Groceries', total: '4250' },
];

function Harness({ items = segments }: { items?: DonutSegment[] }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <Donut label="Spending by category" segments={items} active={active} onActive={setActive} />
  );
}

describe('Donut', () => {
  it('shows the grand total and the category count when nothing is focused', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Spending by category' });
    expect(group).toHaveTextContent('Total');
    expect(group).toHaveTextContent('$2,462.50');
    expect(group).toHaveTextContent('3 categories');
  });

  it('labels every segment with its exact amount and its share from share()', () => {
    render(<Harness />);
    const shares = share(segments.map((segment) => segment.total as Cents));
    segments.forEach((segment, index) => {
      expect(
        screen.getByRole('button', {
          name: `${segment.name}, ${formatCents(segment.total as Cents)}, ${shares[index]}%`,
        }),
      ).toBeInTheDocument();
    });
    expect(shares.reduce((sum, value) => sum + Number(value) * 10, 0)).toBe(1000);
  });

  it('moves keyboard focus through the segments and shows the focused one in the centre', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    const group = screen.getByRole('group', { name: 'Spending by category' });
    expect(group).toHaveTextContent('Home');
    expect(group).toHaveTextContent('$1,320.00');
    expect(group).toHaveTextContent('53.6% of spend');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /^Travel/ })).toHaveFocus();
    expect(group).toHaveTextContent('$1,100.00');
    expect(group).toHaveTextContent('44.7% of spend');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('button', { name: /^Groceries/ })).toHaveFocus();
    expect(group).toHaveTextContent('1.7% of spend');
    expect(screen.getByRole('button', { name: /^Groceries/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('is not drawn when the grand total is zero', () => {
    const { container } = render(<Harness items={[{ id: 'a', name: 'A', total: '0' }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
