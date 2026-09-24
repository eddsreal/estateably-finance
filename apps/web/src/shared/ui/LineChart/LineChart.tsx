import { KeyboardEvent, PointerEvent, useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  EasingInput,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { addDays, formatDay } from '../../lib/dates';
import { Cents, change, formatCents, isNegative, toPlotSeries } from '../../lib/money';
import { durationMs, easeOutCurve } from '../../lib/motion';

const Y_DOMAIN: [number, number] = [-0.05, 1.05];

const KEYS: Record<string, (index: number, last: number) => number> = {
  ArrowLeft: (index) => index - 1,
  ArrowDown: (index) => index - 1,
  ArrowRight: (index) => index + 1,
  ArrowUp: (index) => index + 1,
  PageDown: (index) => index - 7,
  PageUp: (index) => index + 7,
  Home: () => 0,
  End: (_, last) => last,
};

type LineChartProps = {
  label: string;
  from: string;
  series: string[];
  selected: number;
  onSelect: (index: number | null) => void;
};

export function LineChart({ label, from, series, selected, onSelect }: LineChartProps) {
  const values = series as Cents[];
  const last = values.length - 1;
  const index = Math.min(Math.max(selected, 0), last);
  const gradient = useId();
  const [active, setActive] = useState(false);
  const data = useMemo(() => toPlotSeries(values).map((plot, day) => ({ day, plot })), [values]);
  const morph = durationMs('--dur-morph');

  const day = formatDay(addDays(from, index));
  const balance = formatCents(values[index]);
  const delta = change(values[0], values[index]);
  const valueText = `${day}, ${balance}, ${isNegative(delta) ? '▼' : '▲'} ${formatCents(delta).replace('-', '')}`;
  const x = last === 0 ? 100 : (index / last) * 100;
  const y = ((Y_DOMAIN[1] - data[index].plot) / (Y_DOMAIN[1] - Y_DOMAIN[0])) * 100;

  const select = (next: number) => onSelect(Math.min(Math.max(next, 0), last));
  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return index;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(ratio * last);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const move = KEYS[event.key];
    if (!move) return;
    event.preventDefault();
    setActive(true);
    select(move(index, last));
  };
  const leave = () => {
    setActive(false);
    onSelect(null);
  };

  return (
    <div className="flex flex-col gap-8">
      <div
        className="relative h-190 cursor-crosshair touch-none rounded-sm has-focus-visible:shadow-focus"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setActive(true);
          select(indexAt(event));
        }}
        onPointerMove={(event) => {
          setActive(true);
          select(indexAt(event));
        }}
        onPointerLeave={leave}
      >
        <AreaChart
          responsive
          accessibilityLayer={false}
          aria-hidden="true"
          data={data}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" type="number" domain={[0, last]} hide />
          <YAxis domain={Y_DOMAIN} hide />
          <CartesianGrid vertical={false} stroke="var(--color-sand-200)" />
          <Area
            dataKey="plot"
            type="linear"
            stroke="var(--color-accent)"
            strokeWidth="var(--chart-stroke)"
            fill={`url(#${gradient})`}
            dot={false}
            activeDot={false}
            isAnimationActive={morph > 0}
            animationDuration={morph}
            animationEasing={easeOutCurve() as EasingInput}
          />
          {active && (
            <ReferenceLine x={index} stroke="var(--color-sand-600)" strokeDasharray="4 4" />
          )}
          <ReferenceDot
            x={index}
            y={data[index].plot}
            r={7}
            fill="var(--color-accent)"
            stroke="var(--color-sand-0)"
            strokeWidth={3}
          />
        </AreaChart>
        <input
          type="range"
          aria-label={label}
          aria-valuetext={valueText}
          min={0}
          max={last}
          step={1}
          value={index}
          className="pointer-events-none absolute inset-0 size-full opacity-0"
          onChange={(event) => select(Number(event.target.value))}
          onKeyDown={onKeyDown}
          onFocus={() => setActive(true)}
          onBlur={leave}
        />
        {active && (
          <div
            role="tooltip"
            className={`pointer-events-none absolute flex -translate-y-full flex-col gap-2 rounded-md bg-ink-900 px-12 py-8 whitespace-nowrap shadow-tooltip ${x > 70 ? '-ml-14 -translate-x-full' : 'ml-14'}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="font-mono text-11 text-ink-300 uppercase">{day}</span>
            <span className="text-14 font-semibold text-text-on-ink tabular-nums">{balance}</span>
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between font-mono text-11 text-text-3 uppercase"
      >
        <span>{formatDay(from)}</span>
        <span>{formatDay(addDays(from, Math.floor(last / 2)))}</span>
        <span>{formatDay(addDays(from, last))}</span>
      </div>
    </div>
  );
}
