/**
 * <RankList> — §7 / M-09.
 *
 * §7 said "six rows maximum — a longer list drifts toward the 1-to-254 ranking
 * requirement F9 rules out." Raised to TEN on client direction 2026-09-11.
 *
 * The F9 concern still holds and the cap still exists: ten of 254 is a
 * shortlist, not a ranking, and the card's own subhead says so. But the cap is
 * enforced here rather than left to callers, so if this creeps toward 25 the
 * change has to be made deliberately in one place.
 */
import styles from './RankList.module.css';

/**
 * @typedef {Object} RankRow
 * @property {string} geoid
 * @property {string} name
 * @property {number} fraction - 0–1 for the mini bar.
 * @property {string} value - Right-aligned display value, e.g. "p98".
 */

/**
 * @typedef {Object} RankListProps
 * @property {RankRow[]} rows
 * @property {number} [max]
 * @property {string | null} [activeGeoid]
 * @property {(geoid: string | null) => void} [onHover]
 */

/** The hard ceiling. See the note above before raising it. */
const MAX_ROWS = 10;

export function RankList({ rows, max = MAX_ROWS, activeGeoid, onHover }) {
  return (
    <div className={styles.root} onMouseLeave={() => onHover?.(null)}>
      {rows.slice(0, Math.min(max, MAX_ROWS)).map((row, i) => (
        <button
          key={row.geoid}
          type="button"
          className={`${styles.row} ${row.geoid === activeGeoid ? styles.active : ''}`}
          onMouseEnter={() => onHover?.(row.geoid)}
          onFocus={() => onHover?.(row.geoid)}
        >
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.name}>{row.name}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.bar}
              style={{ width: `${Math.max(2, Math.min(100, row.fraction * 100))}%`, display: 'block' }}
            />
          </span>
          <span className={`${styles.value} tabular`}>{row.value}</span>
        </button>
      ))}
    </div>
  );
}
