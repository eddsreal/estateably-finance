import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cents, formatCents } from '../../lib/money';
import { LineChart } from './LineChart';

const series = ['150000', '150000', '145750', '445750', '445750', '457750'];

function Harness({ values, from = '2026-09-17' }: { values: string[]; from?: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <LineChart
        label="Total balance by day"
        from={from}
        series={values}
        selected={selected ?? values.length - 1}
        onSelect={setSelected}
      />
      <output aria-label="Selected">{selected ?? 'latest'}</output>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('LineChart', () => {
  it('is a slider over the day index whose value text names the date, balance and change', () => {
    render(<Harness values={series} />);
    const slider = screen.getByRole('slider', { name: 'Total balance by day' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '5');
    expect(slider).toHaveValue('5');
    expect(slider).toHaveAttribute('aria-valuetext', '22 Sep 2026, $4,577.50, ▲ $3,077.50');
  });

  it('moves one day with the arrows, 7 with page keys and jumps with Home and End', async () => {
    const user = userEvent.setup();
    const long = Array.from({ length: 30 }, (_, i) => (i * 100).toString());
    render(<Harness values={long} from="2026-08-24" />);
    const slider = screen.getByRole('slider');
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(slider).toHaveValue('28');
    await user.keyboard('{PageDown}');
    expect(slider).toHaveValue('21');
    await user.keyboard('{Home}');
    expect(slider).toHaveValue('0');
    expect(slider).toHaveAttribute('aria-valuetext', '24 Aug 2026, $0.00, ▲ $0.00');
    await user.keyboard('{ArrowLeft}');
    expect(slider).toHaveValue('0');
    await user.keyboard('{PageUp}{ArrowRight}');
    expect(slider).toHaveValue('8');
    await user.keyboard('{End}');
    expect(slider).toHaveValue('29');
  });

  it('reports a falling day with ▼ and the size of the drop', async () => {
    const user = userEvent.setup();
    render(<Harness values={['100000', '-2550']} from="2026-09-21" />);
    const slider = screen.getByRole('slider');
    await user.tab();
    await user.keyboard('{End}');
    expect(slider).toHaveAttribute('aria-valuetext', '22 Sep 2026, -$25.50, ▼ $1,025.50');
  });

  it('shows the exact source figure for the selected day in the tooltip', async () => {
    const user = userEvent.setup();
    render(<Harness values={series} />);
    await user.tab();
    for (let index = series.length - 1; index >= 0; index -= 1) {
      expect(screen.getByRole('tooltip')).toHaveTextContent(formatCents(series[index] as Cents));
      await user.keyboard('{ArrowLeft}');
    }
    expect(screen.getByRole('tooltip')).toHaveTextContent('17 Sep 2026');
  });

  it('selects the day under the pointer and returns to the latest day on leave', () => {
    render(<Harness values={series} />);
    const slider = screen.getByRole('slider');
    const plot = slider.parentElement!;
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 500,
      top: 0,
      height: 190,
    } as DOMRect);
    fireEvent.pointerMove(plot, { clientX: 200 });
    expect(slider).toHaveValue('2');
    expect(screen.getByRole('status', { name: 'Selected' })).toHaveTextContent('2');
    fireEvent.pointerLeave(plot);
    expect(screen.getByRole('status', { name: 'Selected' })).toHaveTextContent('latest');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('reaches every day of a 3 650-day series from the keyboard', async () => {
    const user = userEvent.setup();
    const long = Array.from({ length: 3650 }, (_, i) => ((i * 7919) % 100000).toString());
    render(<Harness values={long} from="2016-09-25" />);
    const slider = screen.getByRole('slider');
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(slider).toHaveValue('3648');
    expect(screen.getByRole('tooltip')).toHaveTextContent(formatCents(long[3648] as Cents));
  });
});
