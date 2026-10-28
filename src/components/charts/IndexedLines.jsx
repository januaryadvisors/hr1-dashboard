/**
 * <IndexedLines> — several series rebased to 100 at a reference month.
 *
 * The chart that answers the one question a legislator asks about their own
 * county: **is it worse than Texas?**
 *
 * Levels cannot answer that. Harris has sixty times the caseload of a rural
 * county, so on a shared level axis every rural line sits flat against the
 * bottom of the chart. Indexing removes the size difference and leaves only the
 * shape, which is the comparison being claimed.
 *
 * The 100 line is drawn solid and labelled, because "below the line" is the
 * whole reading. Gridlines run every 10 points (indexAxis) and at each year,
 * and the months from the reference month on are shaded like <LineChart>'s
 * window, with the "JUL 2025 = 100" label at the top of the shading.
 */
import { scaleLinear } from 'd3-scale';
import { endLabelMargin, indexAxis, lastFinite, linePath, seriesColor, stackLabels } from '../../lib/chart';
import { fmtMonth, fmtPctDelta } from '../../lib/format';
import { YearGrid } from './YearGrid';
import { YGrid } from './YGrid';
import styles from './charts.module.css';

/**
 * @typedef {Object} IndexedSeries
 * @property {string} label
 * @property {(number | null)[]} values - Already indexed — see indexTo() in src/lib/insights.js.
 * @property {string} [color]
 * @property {boolean} [emphasis] - Thicker, drawn last: the series the chart is about.
 * @property {boolean} [dashed]
 */

/**
 * @typedef {Object} IndexedLinesProps
 * @property {string[]} months
 * @property {IndexedSeries[]} series
 * @property {number} refIndex - Index of the month everything is rebased to; gets the 100 marker.
 * @property {number} [height]
 * @property {number} [viewWidth]
 * @property {string} title
 */

/** Minimum vertical distance between two end labels. */
const LABEL_GAP = 11;

export function IndexedLines({
  months,
  series,
  refIndex,
  height = 250,
  viewWidth: W = 1000,
  title,
}) {
  // Sized for the longest label plus its percentage suffix.
  const right = endLabelMargin(series.map((s) => s.label), { perChar: 7, extra: 46, min: 70 });
  const M = { top: 16, right, bottom: 22, left: 48 };

  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length || months.length < 2) return null;

  const axis = indexAxis(all);
  const x = scaleLinear().domain([0, months.length - 1]).range([M.left, W - M.right]);
  const y = scaleLinear().domain(axis.domain).range([height - M.bottom, M.top]);

  const ends = series
    .map((s, si) => ({ s, si, last: lastFinite(s.values) }))
    .filter((e) => e.last != null);
  const labelY = stackLabels(
    ends.map((e) => y(e.last.v)),
    LABEL_GAP,
    height - 4,
  );

  // Sorted so the emphasised series paints on top of the rest.
  const order = series
    .map((s, si) => ({ s, si }))
    .sort((a, b) => Number(!!a.s.emphasis) - Number(!!b.s.emphasis));

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      <rect
        x={x(refIndex)}
        y={M.top}
        width={x(months.length - 1) - x(refIndex)}
        height={height - M.top - M.bottom}
        className={styles.windowBand}
      />
      <line x1={x(refIndex)} x2={x(refIndex)} y1={M.top} y2={height - M.bottom} className={styles.windowEdge} />
      <text x={x(refIndex) + 4} y={M.top + 9} className={styles.annotation}>
        {fmtMonth(months[refIndex])} = 100
      </text>

      <YGrid
        ticks={axis.ticks.filter((v) => v !== 100)}
        y={y}
        x1={M.left}
        x2={W - M.right}
        format={String}
        gap={5}
      />

      {/* The 100 line: everything below it is a loss since the reference month. */}
      <line x1={M.left} x2={W - M.right} y1={y(100)} y2={y(100)} className={styles.zeroLine} />
      <text x={M.left - 5} y={y(100) + 3} textAnchor="end" className={styles.axis}>
        100
      </text>

      <YearGrid months={months} x={x} top={M.top} bottom={height - M.bottom} labelY={height - 6} />

      {order.map(({ s, si }) => (
        <path
          key={s.label}
          d={linePath(s.values, x, y)}
          fill="none"
          stroke={seriesColor(s, si)}
          strokeWidth={s.emphasis ? 2.4 : 1.3}
          strokeOpacity={s.emphasis ? 1 : 0.85}
          strokeDasharray={s.dashed ? '4 3' : undefined}
        />
      ))}

      {ends.map(({ s, si, last }, k) => {
        const color = seriesColor(s, si);
        const ty = labelY[k];
        return (
          <g key={s.label}>
            {/* Leader line, because the label may have been nudged off its
                series to avoid a collision. */}
            <line
              x1={x(last.i)}
              x2={W - M.right + 2}
              y1={y(last.v)}
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
              <tspan className={styles.endLabelValue}> {fmtPctDelta((last.v - 100) / 100, 1)}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
