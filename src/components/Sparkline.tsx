/** Monthly enrollment for one county across the active window. */
const W = 300;

export interface SparklineProps {
  values: number[];
  height?: number;
}

export function Sparkline({ values, height = 34 }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;
  const pad = 3;

  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const last = values.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: 'block', height: 'auto' }}
      aria-hidden="true">
      <path d={d} fill="none" stroke="var(--ja-burgundy)" strokeWidth={1.6} />
      <circle cx={x(last)} cy={y(values[last])} r={2.6} fill="var(--ja-burgundy)" />
    </svg>
  );
}
