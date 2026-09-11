/**
 * <IndexedLines> — several series rebased to 100 at a reference month.
 *
 * §8 tab 2's "Age-band indexed lines", and the chart that answers the one
 * question a legislator asks about their own county: **is it worse than Texas?**
 *
 * Levels cannot answer that. Harris has sixty times the caseload of a rural
 * county, so on a shared level axis every rural line sits flat against the
 * bottom of the chart. Indexing removes the size difference and leaves only the
 * shape, which is the comparison being claimed.
 *
 * The 100 line is drawn solid and labelled, because "below the line" is the
 * whole reading.
 */
import { fmtMonth, fmtPctDelta } from '../lib/format';
import { lastFinite } from './LineChart';
import styles from './charts.module.css';

export interface IndexedSeries {
  label: string;
  /** Already indexed — see indexTo() in src/lib/insights.ts. */
  values: (number | null)[];
  color?: string;
  /** Thicker, drawn last: the series the chart is about. */
  emphasis?: boolean;
  dashed?: boolean;
}

export interface IndexedLinesProps {
  months: string[];
  series: IndexedSeries[];
  /** Index of the month everything is rebased to; gets the 100 marker. */
  refIndex: number;
  height?: number;
  viewWidth?: number;
  title: string;
}

const PALETTE = [
  'var(--ja-navy)',
  'var(--ja-burgundy)',
  'var(--ja-teal)',
  '#288c46',
  'var(--ja-orange)',
];

export function IndexedLines({
  months,
  series,
  refIndex,
  height = 250,
  viewWidth: W = 1000,
  title,
}: IndexedLinesProps) {
  /*
   * Right margin sized to the longest label plus its percentage suffix. Fixed at
   * 116 it clipped "Children under 18 −12.5%" mid-number, which is worse than no
   * label at all — a truncated figure still reads as a figure.
   */
  const longest = series.reduce((n, s) => Math.max(n, s.label.length), 0);
  const M = { top: 16, right: Math.max(70, Math.ceil(longest * 5.4) + 46), bottom: 22, left: 40 };

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!all.length || months.length < 2) return null;

  const lo = Math.min(100, ...all);
  const hi = Math.max(100, ...all);
  const pad = (hi - lo) * 0.1 || 2;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const x = (i: number) => M.left + (i / (months.length - 1)) * (W - M.left - M.right);
  const y = (v: number) =>
    M.top + (1 - (v - yMin) / (yMax - yMin)) * (height - M.top - M.bottom);

  const path = (values: (number | null)[]) => {
    let d = '';
    let open = false;
    values.forEach((v, i) => {
      if (v == null) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`;
      open = true;
    });
    return d;
  };

  /**
   * End labels are stacked to avoid collisions. Series ending within ~11 units
   * of each other would otherwise print on top of one another, which on a
   * five-band age chart happens every time.
   */
  const ends = series
    .map((s, si) => ({ si, last: lastFinite(s.values) }))
    .filter((e): e is { si: number; last: { i: number; v: number } } => e.last != null)
    .map((e) => ({ si: e.si, lastIndex: e.last.i, value: e.last.v }))
    .sort((a, b) => a.value - b.value);

  const placed = new Map<number, number>();
  let lastY = Infinity;
  for (let k = ends.length - 1; k >= 0; k--) {
    const e = ends[k];
    let ty = y(e.value);
    if (lastY - ty < 11) ty = lastY - 11;
    placed.set(e.si, ty);
    lastY = ty;
  }

  // Sorted so the emphasised series paints on top of the rest.
  const order = series
    .map((s, si) => ({ s, si }))
    .sort((a, b) => Number(!!a.s.emphasis) - Number(!!b.s.emphasis));

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {[yMin, yMax].map((v) => (
        <text key={v} x={M.left - 5} y={y(v) + 3} textAnchor="end" className={styles.axis}>
          {v.toFixed(0)}
        </text>
      ))}

      {/* The 100 line: everything below it is a loss since the reference month. */}
      <line x1={M.left} x2={W - M.right} y1={y(100)} y2={y(100)} className={styles.zeroLine} />
      <text x={M.left - 5} y={y(100) + 3} textAnchor="end" className={styles.axis}>
        100
      </text>
      <text x={M.left + 4} y={y(100) - 5} className={styles.axisLabel}>
        {fmtMonth(months[refIndex] ?? months[0])} = 100
      </text>

      {[0, months.length - 1].map((i) => (
        <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : 'end'} className={styles.axis}>
          {fmtMonth(months[i])}
        </text>
      ))}

      {order.map(({ s, si }) => {
        const color = s.color ?? PALETTE[si % PALETTE.length];
        return (
          <path
            key={s.label}
            d={path(s.values)}
            fill="none"
            stroke={color}
            strokeWidth={s.emphasis ? 2.4 : 1.3}
            strokeOpacity={s.emphasis ? 1 : 0.85}
            strokeDasharray={s.dashed ? '4 3' : undefined}
          />
        );
      })}

      {ends.map((e) => {
        const s = series[e.si];
        const color = s.color ?? PALETTE[e.si % PALETTE.length];
        const ty = placed.get(e.si) ?? y(e.value);
        return (
          <g key={s.label}>
            {/* Leader line, because the label may have been nudged off its
                series to avoid a collision. */}
            <line
              x1={x(e.lastIndex)}
              x2={W - M.right + 2}
              y1={y(e.value)}
              y2={ty}
              stroke={color}
              strokeWidth={0.5}
              strokeOpacity={0.5}
            />
            <text
              x={W - M.right + 5}
              y={ty + 3}
              fill={color}
              className={s.emphasis ? styles.endLabelStrong : styles.endLabel}
            >
              {s.label}
              <tspan className={styles.endLabelValue}> {fmtPctDelta((e.value - 100) / 100, 1)}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
