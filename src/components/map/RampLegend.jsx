/**
 * <RampLegend> — §7 / §6.5.
 *
 * Rate measure: a continuous ramp bar labelled PERCENTILE IN TEXAS, p0 to p100.
 *
 * Count measure: the SAME bar, labelled with the real headcounts at either end.
 * §6.5 asked for "three nested circles with real values", which was right while
 * count drew proportional symbols; count is a choropleth as of 2026-09-11, and a
 * circle key for a map with no circles on it would be a key to nothing.
 *
 * The bands are equal-COUNT, not equal-interval (see countBinsFor), so the bar
 * says so. Without that line a reader would reasonably assume the midpoint
 * colour meant the midpoint headcount, and on a distribution this skewed it is
 * nowhere near it.
 */
import { fmtInt } from '../../lib/format';
import { rampFor } from '../../lib/scales';
/**
 * @typedef {import('../../types').LayerKey} LayerKey
 */
import styles from './RampLegend.module.css';

/**
 * @typedef {Object} RampLegendProps
 * @property {LayerKey} layer
 * @property {'rate' | 'count'} mode
 * @property {number} [maxCount] - Max count in the current selection; the fallback high label when `bins` is absent.
 * @property {readonly number[]} [bins] - Count class edges from countBinsFor, so the key's numbers are the map's.
 * @property {string} [loLabel]
 * @property {string} [hiLabel]
 * @property {string} [label]
 */

export function RampLegend({
  layer,
  mode,
  maxCount = 0,
  bins,
  loLabel = 'p0',
  hiLabel = 'p100',
  label,
}) {
  const stops = rampFor(layer);

  if (!stops.length) return null;

  const counting = mode === 'count';
  // Real edges where the caller has them; the plain range otherwise.
  const lo = counting ? fmtInt(bins ? bins[0] : 0) : loLabel;
  const hi = counting ? fmtInt(bins ? bins[bins.length - 1] : maxCount) : hiLabel;

  return (
    <div className={styles.root}>
      <div className={styles.label}>{label ?? (counting ? 'People' : 'Percentile in Texas')}</div>
      <div className={styles.bar} aria-hidden="true">
        {stops.map((c) => (
          <span key={c} className={styles.swatch} style={{ background: c }} />
        ))}
      </div>
      <div className={styles.ends}>
        <span className={counting ? 'tabular' : undefined}>{lo}</span>
        <span className={counting ? 'tabular' : undefined}>{hi}</span>
      </div>
      {counting && (
        <div className={styles.note}>
          Equal-count bands: the same number of counties in every colour.
        </div>
      )}
    </div>
  );
}
