/**
 * <DumbbellChart> — §7 / §6.8 "Who is falling off".
 * Dot at the window start, arrowhead at the latest month, percent change
 * right-aligned.
 */
import { fmtInt, fmtPctDelta } from '../lib/format';
import styles from './charts.module.css';

export interface DumbbellRow {
  label: string;
  from: number;
  to: number;
  pctChange: number;
}

export function DumbbellChart({
  rows,
  xMax = 1.6e6,
  height,
  viewWidth: W = 1000,
}: {
  rows: DumbbellRow[];
  xMax?: number;
  height?: number;
  /** See ColumnChart: keep near the rendered width so the type stays legible. */
  viewWidth?: number;
}) {
  const M = { top: 14, right: 74, bottom: 22, left: 62 };
  const rowH = 26;
  const h = height ?? M.top + rows.length * rowH + M.bottom;

  const x = (v: number) => M.left + (v / xMax) * (W - M.left - M.right);
  const y = (i: number) => M.top + i * rowH + rowH / 2;

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${h}`} role="img"
      aria-label="Change in enrolled individuals by age band">
      <defs>
        <marker id="dumbbell-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7"
          markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--ja-burgundy)" />
        </marker>
      </defs>

      {[0, xMax / 2, xMax].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={M.top} y2={h - M.bottom} className={styles.gridline} />
          <text x={x(v)} y={h - 8} textAnchor="middle" className={styles.axis}>
            {v === 0 ? '0' : fmtInt(v)}
          </text>
        </g>
      ))}

      {rows.map((r, i) => (
        <g key={r.label}>
          <text x={M.left - 8} y={y(i) + 3} textAnchor="end" className={styles.axis}
            style={{ fontSize: 10, fill: 'var(--text)' }}>
            {r.label}
          </text>
          <line x1={x(0)} x2={x(Math.max(r.from, r.to))} y1={y(i)} y2={y(i)}
            stroke="var(--hairline)" strokeWidth={3} strokeLinecap="round" />
          <line
            x1={x(r.from)}
            x2={x(r.to)}
            y1={y(i)}
            y2={y(i)}
            stroke="var(--ja-burgundy)"
            strokeWidth={2}
            markerEnd="url(#dumbbell-arrow)"
          />
          <circle cx={x(r.from)} cy={y(i)} r={3.5} fill="#4d8bb0" />
          <text x={W - M.right + 62} y={y(i) + 3} textAnchor="end"
            className={`${styles.annotation} tabular`}>
            {fmtPctDelta(r.pctChange)}
          </text>
        </g>
      ))}
    </svg>
  );
}
