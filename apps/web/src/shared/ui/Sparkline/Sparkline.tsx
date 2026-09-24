import { useMemo } from 'react';
import { Line, LineChart, YAxis } from 'recharts';
import { Cents, compareCents, toPlotSeries } from '../../lib/money';

export function Sparkline({ series }: { series: string[] }) {
  const values = series as Cents[];
  const data = useMemo(() => toPlotSeries(values).map((plot) => ({ plot })), [values]);
  const falling = compareCents(values[values.length - 1], values[0]) < 0;
  return (
    <div aria-hidden="true" className="h-28 w-full" data-trend={falling ? 'falling' : 'rising'}>
      <LineChart
        responsive
        accessibilityLayer={false}
        data={data}
        margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
        style={{ width: '100%', height: '100%' }}
      >
        <YAxis domain={[0, 1]} hide />
        <Line
          dataKey="plot"
          type="linear"
          stroke={falling ? 'var(--color-negative)' : 'var(--color-accent)'}
          strokeWidth="var(--spark-stroke)"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
