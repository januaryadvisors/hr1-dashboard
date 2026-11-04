/**
 * <PlaceRankList> — the Insights map's companion: the ten places with the most
 * people no longer on SNAP, and where the picked place sits if it is not one
 * of them.
 *
 * Ranked by people, not by share: every place has a rank that way, however
 * small. Ranked by share, a county of 400 that lost 200 tops the list on its
 * denominator alone, and a list with a caseload floor would leave a small
 * picked county with no place to show. The share is printed beside the count,
 * and the map beside the list is the share.
 *
 * Below the ten, a picked place appears at its own rank after a faded break
 * that says how many places it skips ("57 more counties"). Several picked
 * places (counties added together) each get their row, in rank order.
 */
import { cx } from '../../lib/cx';
import { fmtInt, fmtPct } from '../../lib/format';
import styles from './PlaceRankList.module.css';

/** The shortlist's length. */
const TOP = 10;
/** Picked places listed below the shortlist before the rest are summed up in a line. */
const MAX_EXTRA = 5;

/**
 * @typedef {Object} RankUnit
 * @property {string} key
 * @property {string} name
 * @property {number | null} lost - People no longer on SNAP; null where unknown.
 * @property {number | null} share - Share of the window-start caseload no longer on SNAP.
 */

/**
 * Every unit in rank order, most people lost first; unknowns last. A tie goes
 * to the larger share, then the name, so the order never depends on input order.
 *
 * @param {RankUnit[]} units
 */
export function rankUnits(units) {
  return [...units].sort(
    (a, b) =>
      (b.lost ?? -Infinity) - (a.lost ?? -Infinity) ||
      (b.share ?? -Infinity) - (a.share ?? -Infinity) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/**
 * The rows to draw: the top ten, then each picked place below them, with a
 * break wherever ranks are skipped.
 *
 * @param {RankUnit[]} ranked - From rankUnits.
 * @param {string[]} picked
 * @returns {({ type: 'row', unit: RankUnit, rank: number, on: boolean } | { type: 'gap', skipped: number } | { type: 'more', count: number })[]}
 */
export function rankRows(ranked, picked) {
  const on = new Set(picked);
  const below = ranked
    .map((u, i) => ({ u, i }))
    .filter(({ u, i }) => i >= TOP && on.has(u.key));
  const shown = [...Array(Math.min(TOP, ranked.length)).keys(), ...below.slice(0, MAX_EXTRA).map((b) => b.i)];

  const out = [];
  let prev = -1;
  for (const i of shown) {
    if (i - prev > 1) out.push({ type: 'gap', skipped: i - prev - 1 });
    out.push({ type: 'row', unit: ranked[i], rank: i + 1, on: on.has(ranked[i].key) });
    prev = i;
  }
  if (below.length > MAX_EXTRA) out.push({ type: 'more', count: below.length - MAX_EXTRA });
  return out;
}

/**
 * @param {{ units: RankUnit[], picked: string[], noun: string, singular: string }} props
 *   `noun` is the plural for the break and the heading ("counties", "House districts").
 */
export function PlaceRankList({ units, picked, noun, singular }) {
  const ranked = rankUnits(units);
  const rows = rankRows(ranked, picked);
  return (
    <div className={styles.root}>
      <h3 className={styles.title}>Most people no longer on SNAP</h3>
      <p className={styles.sub}>
        Rank among {fmtInt(ranked.length)} {noun}
      </p>
      <div className={cx(styles.row, styles.head)} aria-hidden="true">
        <span />
        <span />
        <span className={styles.value}>People</span>
        <span className={styles.share}>Share</span>
      </div>
      <ol className={styles.list}>
        {rows.map((r, idx) => {
          if (r.type === 'gap') {
            return (
              <li key={`gap-${idx}`} className={styles.gap} aria-label={`${r.skipped} ${noun} not shown`}>
                <span className={styles.gapLine} aria-hidden="true" />
                <span className={styles.gapText}>
                  {fmtInt(r.skipped)} more {r.skipped === 1 ? singular : noun}
                </span>
                <span className={styles.gapLine} aria-hidden="true" />
              </li>
            );
          }
          if (r.type === 'more') {
            return (
              <li key="more" className={styles.gap}>
                <span className={styles.gapText}>and {r.count} more picked lower down</span>
              </li>
            );
          }
          return (
            <li key={r.unit.key} className={cx(styles.row, r.on && styles.on)} aria-current={r.on || undefined}>
              <span className={cx(styles.rank, 'tabular')}>{r.rank}</span>
              <span className={styles.name}>{r.unit.name}</span>
              <span className={cx(styles.value, 'tabular')}>{r.unit.lost == null ? '—' : fmtInt(r.unit.lost)}</span>
              <span className={cx(styles.share, 'tabular')}>
                {r.unit.share == null ? '' : fmtPct(r.unit.share, 1)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
