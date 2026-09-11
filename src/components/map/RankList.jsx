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
 *
 * THE GLYPH IN THE MIDDLE COLUMN follows the view — 2026-09-11 direction:
 *
 *   'line'    a sparkline of that county's enrollment for the group being
 *             mapped. On the enrollment views the shortlist is ten counties
 *             that all lost a lot, so a bar of "how much" repeated the value
 *             column; the line says something the number cannot, which is
 *             whether the fall was steady or cliff-edged.
 *   'bucket'  the layer's class intervals as steps, with a caret on the one
 *             this county is in. On a percentile view the ten counties are all
 *             in the top class by construction — a bar showing them all at 100%
 *             was a row of full bars — so the honest glyph is WHERE the class
 *             sits on the scale, not how long the bar is.
 *   'bar'     the original proportional bar. Still the fallback.
 */
import styles from './RankList.module.css';

/**
 * @typedef {Object} RankRow
 * @property {string} geoid
 * @property {string} name
 * @property {number} fraction - 0–1. The bar's length, and the caret's position on the bucket scale.
 * @property {string} value - Right-aligned display value, e.g. "p98".
 * @property {number[]} [series] - Enrollment over the window, for glyph 'line'. Nulls break the line.
 * @property {number} [bin] - Which class interval this county falls in, for glyph 'bucket'.
 */

/**
 * @typedef {Object} RankListProps
 * @property {RankRow[]} rows
 * @property {number} [max]
 * @property {'line' | 'bucket' | 'bar'} [glyph] - What the middle column draws. See the note above.
 * @property {number} [bins] - How many class intervals, for glyph 'bucket'.
 * @property {string | null} [activeGeoid]
 * @property {(geoid: string | null) => void} [onHover]
 */

/** The hard ceiling. See the note above before raising it. */
const MAX_ROWS = 10;

/* The glyph column, in its own coordinates. Small enough that these are the
   real pixel sizes at the rendered width. */
const GW = 54;
const GH = 14;

/**
 * A county's enrollment over the window.
 *
 * Scaled to its OWN range, not a shared one: the shortlist spans Harris and
 * Loving, and on a shared scale every line but the largest is flat. The shape
 * is the content here — the value column already carries the magnitude.
 */
function LineGlyph({ series }) {
  const points = (series ?? []).map((v, i) => [i, v]);
  const valid = points.filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length < 2) return <span className={styles.glyphEmpty} />;

  const values = valid.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => (points.length < 2 ? 0 : (i / (points.length - 1)) * GW);
  const y = (v) => 1 + (1 - (v - min) / span) * (GH - 2);

  // Break rather than bridge where a month has no value: a straight line across
  // a month nobody published is a fabricated reading.
  let d = '';
  let pen = false;
  for (const [i, v] of points) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  }

  const lastValid = valid[valid.length - 1];
  return (
    <svg className={styles.glyph} viewBox={`0 0 ${GW} ${GH}`} aria-hidden="true">
      <path d={d} className={styles.glyphLine} />
      <circle cx={x(lastValid[0])} cy={y(lastValid[1])} r={1.6} className={styles.glyphDot} />
    </svg>
  );
}

/**
 * The layer's class intervals as steps, with a caret on this county's class.
 *
 * Steps rather than a bar because the shortlist is, by definition, ten counties
 * in the top class: a proportional bar draws ten identical full bars and says
 * nothing. This says which class, against all of them.
 */
function BucketGlyph({ bin, bins }) {
  const n = Math.max(2, bins);
  const w = GW / n;
  const at = Math.max(0, Math.min(n - 1, bin ?? 0));
  return (
    <svg className={styles.glyph} viewBox={`0 0 ${GW} ${GH}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={i * w + 0.5}
          // Stepped: each class is taller than the last, so the scale reads as a
          // scale and the caret's position means something on its own.
          y={GH - 3 - ((i + 1) / n) * (GH - 6)}
          width={w - 1}
          height={((i + 1) / n) * (GH - 6)}
          className={i === at ? styles.bucketOn : styles.bucketOff}
        />
      ))}
      <path
        d={`M${(at + 0.5) * w - 2.4} ${GH} L${(at + 0.5) * w} ${GH - 2.8} L${(at + 0.5) * w + 2.4} ${GH} Z`}
        className={styles.bucketCaret}
      />
    </svg>
  );
}

export function RankList({ rows, max = MAX_ROWS, glyph = 'bar', bins = 6, activeGeoid, onHover }) {
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
          {glyph === 'line' ? (
            <LineGlyph series={row.series} />
          ) : glyph === 'bucket' ? (
            <BucketGlyph bin={row.bin} bins={bins} />
          ) : (
            <span className={styles.barTrack}>
              <span
                className={styles.bar}
                style={{
                  width: `${Math.max(2, Math.min(100, row.fraction * 100))}%`,
                  display: 'block',
                }}
              />
            </span>
          )}
          <span className={`${styles.value} tabular`}>{row.value}</span>
        </button>
      ))}
    </div>
  );
}
