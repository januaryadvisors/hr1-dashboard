/**
 * <DumbbellChart> — §7 / §6.8 "Who is falling off".
 * A rounded arrow from the window's start to its latest month, with a faint
 * tick where it began; percent change right-aligned. Redrawn 2026-10-16: the
 * blue start dot is gone (the tick says the same without a second colour), and
 * the arrow is a thicker rounded shaft with an open chevron head.
 */
import { fmtInt, fmtPctDelta } from '../../lib/format';
import styles from './charts.module.css';

/**
 * @typedef {Object} DumbbellRow
 * @property {string} label
 * @property {number} from
 * @property {number} to
 * @property {number} pctChange
 */

export function DumbbellChart({
  rows,
  xMax = 1.6e6,
  height,
  viewWidth: W = 1000,
}) {
  const M = { top: 14, right: 84, bottom: 22, left: 72 };
  const rowH = 32;
  const h = height ?? M.top + rows.length * rowH + M.bottom;

  const x = (v) => M.left + (v / xMax) * (W - M.left - M.right);
  const y = (i) => M.top + i * rowH + rowH / 2;

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${h}`} role="img"
      aria-label="Change in enrolled individuals by age band">
      {[0, xMax / 2, xMax].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={M.top} y2={h - M.bottom} className={styles.gridline} />
          <text x={x(v)} y={h - 8} textAnchor="middle" className={styles.axis}>
            {v === 0 ? '0' : fmtInt(v)}
          </text>
        </g>
      ))}

      {rows.map((r, i) => {
        const x0 = x(r.from);
        const x1 = x(r.to);
        const dir = x1 < x0 ? -1 : 1;
        const len = Math.abs(x1 - x0);
        // The chevron's depth, shortened for a tiny change so it never overshoots.
        const head = Math.min(7, Math.max(3, len * 0.6));
        const tone = r.pctChange < 0 ? 'var(--ja-burgundy)' : 'var(--ja-navy)';
        return (
          <g key={r.label}>
            <text x={M.left - 10} y={y(i) + 4} textAnchor="end" className={styles.dumbbellLabel}>
              {r.label}
            </text>
            {/* The band's size as a soft track, so the arrow reads against it. */}
            <line
              x1={x(0)}
              x2={x(Math.max(r.from, r.to))}
              y1={y(i)}
              y2={y(i)}
              stroke="var(--hairline)"
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.6}
            />
            {/* Where it started. */}
            <line x1={x0} x2={x0} y1={y(i) - 6} y2={y(i) + 6} stroke="var(--text-faint)" strokeWidth={1.5} strokeLinecap="round" />
            {len > 1 && (
              <>
                <line
                  x1={x0}
                  x2={x1 - dir * 1.5}
                  y1={y(i)}
                  y2={y(i)}
                  stroke={tone}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <path
                  d={`M${x1 - dir * head} ${y(i) - head} L${x1} ${y(i)} L${x1 - dir * head} ${y(i) + head}`}
                  fill="none"
                  stroke={tone}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            <text
              x={W - M.right + 62}
              y={y(i) + 4}
              textAnchor="end"
              className={`${styles.dumbbellValue} tabular`}
              fill={tone}
            >
              {fmtPctDelta(r.pctChange)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
