/**
 * <LineChart> — levels over months, with the policy window shaded.
 *
 * §8 tab 1's "Enrollment line 2022 → May 2026". The shaded band is what makes
 * the chart an argument rather than a time series: it puts the pre-policy years
 * on the same axis as the decline, so the reader can see the caseload was flat
 * before the window and is not now.
 *
 * Y is fitted to the data rather than starting at zero, because a 3.0M–4.0M
 * range on a 0-based axis flattens a 15% fall to nothing. Its ends are rounded
 * out to round values so every gridline carries a number a reader can quote.
 */
import { scaleLinear } from 'd3-scale';
import { endLabelMargin, lastFinite, linePath, seriesColor } from '../../lib/chart';
import { fmtMillions, fmtMonth } from '../../lib/format';
import { YearGrid } from './YearGrid';
import { YGrid } from './YGrid';
import styles from './charts.module.css';

/**
 * @typedef {Object} LineSeries
 * @property {string} label
 * @property {(number | null)[]} values
 * @property {string} [color] - CSS colour. Defaults to the series palette, navy first.
 * @property {boolean} [dashed] - Dashed, for a comparison series that is not the subject.
 */

/**
 * @typedef {Object} LineChartProps
 * @property {string[]} months
 * @property {LineSeries[]} series
 * @property {[string, string]} [shade] - Inclusive month range to shade, usually the policy window.
 * @property {(v: number) => string} [formatY] - Formatter for the y axis. Defaults to millions.
 * @property {number} [height]
 * @property {number} [viewWidth]
 * @property {string} title
 */

export function LineChart({
  months,
  series,
  shade,
  formatY = fmtMillions,
  height = 240,
  viewWidth: W = 1000,
  title,
}) {
  // ~6.8 units per character in the 12px display face.
  const right = endLabelMargin(series.map((s) => s.label), { perChar: 6.8, extra: 12, min: 24 });
  const M = { top: 16, right, bottom: 22, left: 58 };

  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length || months.length < 2) return null;

  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  // A flat series would otherwise have no height; give it a nominal band.
  const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.08 || 1;

  const x = scaleLinear().domain([0, months.length - 1]).range([M.left, W - M.right]);
  const y = scaleLinear()
    .domain([rawMin - pad, rawMax + pad])
    .nice(5)
    .range([height - M.bottom, M.top]);

  const shadeFrom = shade ? months.indexOf(shade[0]) : -1;
  const shadeTo = shade ? months.indexOf(shade[1]) : -1;

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {shadeFrom >= 0 && shadeTo > shadeFrom && (
        <>
          <rect
            x={x(shadeFrom)}
            y={M.top}
            width={x(shadeTo) - x(shadeFrom)}
            height={height - M.top - M.bottom}
            className={styles.windowBand}
          />
          <line
            x1={x(shadeFrom)}
            x2={x(shadeFrom)}
            y1={M.top}
            y2={height - M.bottom}
            className={styles.windowEdge}
          />
          <text x={x(shadeFrom) + 4} y={M.top + 9} className={styles.annotation}>
            {fmtMonth(months[shadeFrom])}
          </text>
        </>
      )}

      <YGrid ticks={y.ticks(5)} y={y} x1={M.left} x2={W - M.right} format={formatY} />
      <YearGrid months={months} x={x} top={M.top} bottom={height - M.bottom} labelY={height - 6} />

      {series.map((s, si) => {
        const color = seriesColor(s, si);
        const last = lastFinite(s.values);
        return (
          <g key={s.label}>
            <path
              d={linePath(s.values, x, y)}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeDasharray={s.dashed ? '4 3' : undefined}
            />
            {/* End label instead of a legend: the reader's eye is already at the
                right-hand end of the line, which is where the answer is. */}
            {last && (
              <text x={x(last.i) + 5} y={y(last.v) + 3} fill={color} className={styles.endLabel}>
                {s.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
