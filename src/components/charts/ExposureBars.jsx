/**
 * <ExposureBars> — the foot of the county tooltip on the Work requirements view.
 *
 * Replaces the caseload sparkline there, on client direction 2026-09-10: the
 * question on that view is how many people the requirement reaches, and a line
 * of total enrollment does not answer it.
 *
 * Three bars, one shared axis, because all three are counts of people in the
 * same county over the same window:
 *
 *   caseload       everyone enrolled at the start of the window
 *   newly subject  the modelled subset the expanded requirement reaches
 *   left SNAP      how many actually went, over that same window
 *
 * The third bar is the point of the chart. "Newly subject" on its own is a
 * projection; setting it beside the observed departure is what lets the reader
 * see whether the exposure and the loss are the same size — and they are not.
 */
import { fmtInt, fmtPct } from '../../lib/format';
import styles from './ExposureBars.module.css';

/**
 * @typedef {Object} ExposureRow
 * @property {string} label
 * @property {number} value
 * @property {number | null} [share] - Share of the caseload, printed after the count. Omitted on the baseline.
 * @property {'base' | 'subject' | 'left'} tone
 * @property {boolean} [modelled] - §10: the newly-subject estimate is PUMS-modelled, not a lookup.
 */

/**
 * @typedef {Object} ExposureBarsProps
 * @property {ExposureRow[]} rows
 */

export function ExposureBars({ rows }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  if (max <= 0) return null;

  return (
    <div className={styles.root}>
      {rows.map((r) => (
        <div key={r.label} className={styles.row}>
          <span className={styles.label}>{r.label}</span>
          <span className={styles.track}>
            <span
              className={`${styles.bar} ${styles[r.tone]}`}
              // A real count of zero still has to read as a bar at zero rather
              // than as a missing row, so it keeps a 1px stub.
              style={{ width: `${Math.max(0.6, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className={`${styles.value} tabular`}>
            {fmtInt(r.value)}
            {/* §10: flag the modelled estimate wherever it is shown. The dagger
                sits on the number rather than the label so all three rows stay
                one line tall and the bars keep a shared baseline. */}
            {r.modelled && (
              <abbr className={styles.modelled} title="PUMS-modelled estimate, not a lookup">
                †
              </abbr>
            )}
            {r.share != null && <span className={styles.share}>{fmtPct(r.share, 0)}</span>}
          </span>
        </div>
      ))}
      {rows.some((r) => r.modelled) && (
        <p className={styles.note}>† PUMS-modelled estimate, not a lookup.</p>
      )}
    </div>
  );
}
