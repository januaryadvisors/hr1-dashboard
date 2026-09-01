/**
 * <RankList> — §7 / M-09.
 *
 * "Six rows maximum — a longer list drifts toward the 1-to-254 ranking
 * requirement F9 rules out." The cap is enforced here, not left to callers.
 */
import styles from './RankList.module.css';

export interface RankRow {
  geoid: string;
  name: string;
  /** 0–1 for the mini bar. */
  fraction: number;
  /** Right-aligned display value, e.g. "p98". */
  value: string;
}

export interface RankListProps {
  rows: RankRow[];
  max?: number;
  activeGeoid?: string | null;
  onHover?: (geoid: string | null) => void;
}

export function RankList({ rows, max = 6, activeGeoid, onHover }: RankListProps) {
  return (
    <div className={styles.root} onMouseLeave={() => onHover?.(null)}>
      {rows.slice(0, Math.min(max, 6)).map((row, i) => (
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
