/**
 * <FunnelPlot> — §8 tab 5's "Funnel plot".
 *
 * Percentage change against the caseload it was measured on, with 2sd control
 * limits that widen as caseload shrinks.
 *
 * WHY THIS CHART EXISTS, and it is the most important thing on the Insights
 * page for an outside reader: a 300-person caseload can move 20% on sixty
 * households. On a plain ranking of percentage change, the top ten counties are
 * ten tiny counties, every time, and the list says more about denominators than
 * about policy. Here a county only reads as unusual if it sits outside the band
 * FOR ITS OWN SIZE.
 *
 * The band is fitted to the counties' own dispersion for the window on screen
 * (buildFunnel / fitFunnel in lib/insights.js), ported from the analysis
 * notebook so "outside the limits" means the same thing here as there.
 *
 * `markOutliers` defaults to false and the caller turns it on only when the band
 * is calibrated. The first build used binomial-style limits (sd = 0.9/sqrt(n)),
 * which put 43% of counties outside a band meant to catch ~5% — county-to-county
 * variation is structural, not sampling noise. The fitted band catches ~7% on the
 * policy window. InsightsPage still withholds the colouring if a window ever
 * pushes that past 10% — see docs/SPEC-DEVIATIONS.md §Q2 and §U.
 *
 * X is log-scaled because Texas county caseloads span three orders of magnitude.
 */
import { fmtInt, fmtPctDelta } from '../../lib/format';
/**
 * @typedef {import('../../lib/insights').FunnelData} FunnelData
 */
import { funnelBand } from '../../lib/insights';
import styles from './charts.module.css';

/**
 * @typedef {Object} FunnelPlotProps
 * @property {FunnelData} data
 * @property {string | null} [highlight] - Geoid to call out — the scoped county.
 * @property {boolean} [markOutliers] - Colour points that fall outside the limits. Off until the published limits
 *   are calibrated to the observed dispersion — see the note above.
 * @property {number} [height]
 * @property {number} [viewWidth]
 * @property {(geoid: string | null) => void} [onHover]
 */

export function FunnelPlot({
  data,
  highlight = null,
  markOutliers = false,
  height = 320,
  viewWidth: W = 1000,
  onHover,
}) {
  const M = { top: 18, right: 18, bottom: 34, left: 50 };
  const { points, center } = data;
  if (!points.length) return null;

  const caseloads = points.map((p) => p.caseload);
  const minC = Math.max(1, Math.min(...caseloads));
  const maxC = Math.max(...caseloads);

  const band = funnelBand(data, minC, maxC);

  const pcts = points.map((p) => p.pct);
  const bandPcts = band.flatMap((b) => [b.lo, b.hi]);
  const lo = Math.min(...pcts, ...bandPcts);
  const hi = Math.max(...pcts, ...bandPcts);
  const pad = (hi - lo) * 0.08 || 0.02;

  const lx = Math.log10(minC);
  const hx = Math.log10(maxC);
  const x = (c) =>
    M.left + ((Math.log10(Math.max(1, c)) - lx) / (hx - lx || 1)) * (W - M.left - M.right);
  const y = (v) =>
    M.top + (1 - (v - (lo - pad)) / (hi + pad - (lo - pad))) * (height - M.top - M.bottom);

  const bandPath =
    `M${band.map((b) => `${x(b.caseload).toFixed(2)} ${y(b.hi).toFixed(2)}`).join('L')}` +
    `L${[...band].reverse().map((b) => `${x(b.caseload).toFixed(2)} ${y(b.lo).toFixed(2)}`).join('L')}Z`;

  /** Decade ticks inside the data range: 100, 1k, 10k, 100k, 1M. */
  const decades = [];
  for (let e = Math.ceil(lx); e <= Math.floor(hx); e++) decades.push(10 ** e);

  // Centre is drawn separately, so it is excluded here to stop the Texas label
  // printing on top of an axis tick at the same height.
  const yTicks = [hi + pad, lo - pad];
  const outside = points.filter((p) => p.outside).length;
  const hit = highlight ? points.find((p) => p.geoid === highlight) ?? null : null;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={`Funnel plot: percentage change in enrollment against caseload size, for ${points.length} counties. The shaded band is the published two-standard-deviation control limits.${
        markOutliers ? ` ${outside} counties fall outside them.` : ''
      }`}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* The band first, so every point sits on top of it. */}
      <path d={bandPath} className={styles.funnelBand} />

      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className={styles.gridline} />
          <text x={M.left - 6} y={y(v) + 3} textAnchor="end" className={styles.axis}>
            {fmtPctDelta(v, 0)}
          </text>
        </g>
      ))}

      <line x1={M.left} x2={W - M.right} y1={y(center)} y2={y(center)} className={styles.zeroLine} />
      <text x={M.left + 4} y={y(center) - 5} className={styles.axisLabel}>
        Texas {fmtPctDelta(center, 1)}
      </text>

      {decades.map((c) => (
        <text key={c} x={x(c)} y={height - 16} textAnchor="middle" className={styles.axis}>
          {fmtInt(c)}
        </text>
      ))}
      <text x={(M.left + W - M.right) / 2} y={height - 3} textAnchor="middle" className={styles.axisLabel}>
        Caseload at window start (log scale) →
      </text>

      <g>
        {points.map((p) => (
          <circle
            key={p.geoid}
            cx={x(p.caseload)}
            cy={y(p.pct)}
            r={p.geoid === highlight ? 5 : 2.6}
            className={markOutliers && p.outside ? styles.funnelPointOutside : styles.point}
            onMouseEnter={() => onHover?.(p.geoid)}
          >
            <title>{`${p.name}: ${fmtPctDelta(p.pct, 1)} on a caseload of ${fmtInt(p.caseload)}`}</title>
          </circle>
        ))}
      </g>

      {hit && (
        <g className={styles.highlight}>
          <circle cx={x(hit.caseload)} cy={y(hit.pct)} r={8} className={styles.highlightRing} />
          <text
            x={x(hit.caseload) + 12}
            y={y(hit.pct) + 3}
            className={styles.highlightLabel}
            textAnchor={x(hit.caseload) > W * 0.72 ? 'end' : 'start'}
            dx={x(hit.caseload) > W * 0.72 ? -22 : 0}
          >
            {hit.name} · {fmtPctDelta(hit.pct, 1)} on {fmtInt(hit.caseload)}
          </text>
        </g>
      )}
    </svg>
  );
}
