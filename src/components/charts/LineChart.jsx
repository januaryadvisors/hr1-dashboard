/**
 * <LineChart> — levels over months, with the policy window shaded.
 *
 * §8 tab 1's "Enrollment line 2022 → May 2026". The shaded band is what makes
 * the chart an argument rather than a time series: it puts the pre-policy years
 * on the same axis as the decline, so the reader can see the caseload was flat
 * before the window and is not now.
 *
 * Y starts at zero only when asked. §I4/§J8 in the deviations doc record the
 * client changing their mind on this twice; the default here is a fitted axis
 * because a 3.0M–4.0M range on a 0-based axis flattens a 15% fall to nothing.
 */
import { fmtMillions, fmtMonth } from '../../lib/format';
import styles from './charts.module.css';

/**
 * @typedef {Object} LineSeries
 * @property {string} label
 * @property {(number | null)[]} values
 * @property {string} [color] - CSS colour. Defaults to navy for the first series.
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
 * @property {boolean} [zeroBaseline]
 * @property {string} title
 */

const DEFAULT_COLORS = ['var(--ja-navy)', 'var(--ja-burgundy)', 'var(--ja-teal)'];

/** Last month with a value, for the end label. null when the series is empty. */
export function lastFinite(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return { i, v };
  }
  return null;
}

export function LineChart({
  months,
  series,
  shade,
  formatY = fmtMillions,
  height = 240,
  viewWidth: W = 1000,
  zeroBaseline = false,
  title,
}) {
  /*
   * The right margin is sized to the longest end label, not fixed. At 58 a
   * label like "Harris County" ran off the edge of the viewBox and was clipped;
   * at ~5.2 units per character in the 9px display face it now always fits.
   */
  const longest = series.reduce((n, s) => Math.max(n, s.label.length), 0);
  const M = { top: 16, right: Math.max(24, Math.ceil(longest * 5.2) + 12), bottom: 22, left: 52 };

  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length || months.length < 2) return null;

  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  // A flat series would otherwise divide by zero; give it a nominal band.
  const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.08 || 1;
  const yMin = zeroBaseline ? 0 : rawMin - pad;
  const yMax = rawMax + pad;

  const x = (i) => M.left + (i / (months.length - 1)) * (W - M.left - M.right);
  const y = (v) =>
    M.top + (1 - (v - yMin) / (yMax - yMin)) * (height - M.top - M.bottom);

  const path = (values) => {
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

  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax];

  /**
   * One label per year, at its first month present in the series.
   *
   * The series starts in November 2021, so the 2021 and 2022 labels land two
   * months apart and print on top of each other. A partial first year gets
   * dropped rather than nudged — there is no room for it and the next tick says
   * the same thing.
   */
  const yearTicks = [];
  months.forEach((m, i) => {
    const year = m.slice(0, 4);
    if (!yearTicks.some((t) => t.label === year)) yearTicks.push({ i, label: year });
  });
  const MIN_TICK_GAP = 34;
  const visibleYearTicks = yearTicks.filter((t, k) => {
    const next = yearTicks[k + 1];
    return !next || x(next.i) - x(t.i) >= MIN_TICK_GAP;
  });

  const shadeFrom = shade ? months.indexOf(shade[0]) : -1;
  const shadeTo = shade ? months.indexOf(shade[1]) : -1;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={title}
    >
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

      {ticks.map((v) => (
        <g key={v}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className={styles.gridline} />
          <text x={M.left - 6} y={y(v) + 3} textAnchor="end" className={styles.axis}>
            {formatY(v)}
          </text>
        </g>
      ))}

      {visibleYearTicks.map((t) => (
        <text key={t.label} x={x(t.i)} y={height - 6} textAnchor="middle" className={styles.axis}>
          {t.label}
        </text>
      ))}

      {series.map((s, si) => {
        const color = s.color ?? DEFAULT_COLORS[si % DEFAULT_COLORS.length];
        const last = lastFinite(s.values);
        return (
          <g key={s.label}>
            <path
              d={path(s.values)}
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
