/**
 * <ColumnChart> — §7. Month-over-month change from a zero line, green above and
 * burgundy below (§6.8 / §8 tab 1).
 */
import { fmtDelta, fmtMonth } from '../lib/format';
import styles from './charts.module.css';

export interface Annotation {
  month: string;
  label: string;
}

export interface ColumnChartProps {
  months: string[];
  values: (number | null)[];
  annotations?: Annotation[];
  height?: number;
  labelEveryMonth?: boolean;
  /**
   * viewBox width. Keep it near the rendered CSS width so one SVG unit is about
   * one pixel — otherwise the 9px axis type is scaled down with the chart and
   * becomes illegible in a narrow card.
   */
  viewWidth?: number;
}

export function ColumnChart({
  months,
  values,
  annotations = [],
  height = 190,
  labelEveryMonth = false,
  viewWidth: W = 1000,
}: ColumnChartProps) {
  const M = { top: 18, right: 10, bottom: 20, left: 44 };
  const finite = values.filter((v): v is number => v != null);
  const extent = Math.max(1, ...finite.map(Math.abs));

  const bandWidth = (W - M.left - M.right) / months.length;
  const x = (i: number) => M.left + i * bandWidth;
  const y = (v: number) => M.top + (1 - (v + extent) / (2 * extent)) * (height - M.top - M.bottom);
  const zero = y(0);

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img"
      aria-label="Month-over-month change in enrolled individuals">
      {[extent, extent / 2, -extent / 2, -extent].map((v) => (
        <g key={v}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className={styles.gridline} />
          <text x={M.left - 5} y={y(v) + 3} textAnchor="end" className={styles.axis}>
            {fmtDelta(v)}
          </text>
        </g>
      ))}

      {values.map((v, i) =>
        v == null ? null : (
          <rect
            key={months[i]}
            x={x(i) + bandWidth * 0.15}
            y={Math.min(zero, y(v))}
            width={bandWidth * 0.7}
            height={Math.max(0.6, Math.abs(zero - y(v)))}
            fill={v >= 0 ? '#4DA068' : 'var(--ja-burgundy)'}
          />
        ),
      )}

      <line x1={M.left} x2={W - M.right} y1={zero} y2={zero} className={styles.zeroLine} />

      {months.map((m, i) =>
        labelEveryMonth || m.endsWith('-01') ? (
          <text
            key={m}
            x={x(i) + bandWidth / 2}
            y={height - 5}
            textAnchor="middle"
            className={styles.axis}
            transform={labelEveryMonth ? `rotate(-90 ${x(i) + bandWidth / 2} ${height - 5})` : undefined}
          >
            {labelEveryMonth ? fmtMonth(m).slice(0, 3) : m.slice(0, 4)}
          </text>
        ) : null,
      )}

      {annotations.map((a) => {
        const i = months.indexOf(a.month);
        if (i === -1) return null;
        const v = values[i];
        if (v == null) return null;
        return (
          <g key={a.month}>
            <line
              x1={x(i) + bandWidth / 2}
              x2={x(i) + bandWidth / 2}
              y1={y(v)}
              y2={M.top + 6}
              stroke="var(--ja-burgundy)"
              strokeWidth={0.6}
              strokeDasharray="2 2"
            />
            <text x={x(i) + bandWidth / 2 + 3} y={M.top + 4} className={styles.annotation}>
              {a.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
