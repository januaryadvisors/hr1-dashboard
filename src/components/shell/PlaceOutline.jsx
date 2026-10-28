/**
 * <PlaceOutline> — the report card's left column: the place's own boundary in a
 * framed square, drawn large enough to read, and under it a small Texas with
 * the place filled in, so a reader can see where it is. Statewide, the square
 * holds Texas and there is nothing to locate.
 */
import styles from './PlaceOutline.module.css';

/**
 * @typedef {Object} PlaceOutlineProps
 * @property {string | null} d - The place's projected path; null for Texas.
 * @property {[[number, number], [number, number]] | null} bounds - Its projected bounding box.
 * @property {string} statePath - Texas, in the same projection.
 * @property {{ width: number, height: number }} canvas - The shared projection's.
 * @property {string} label
 */

/** Room around the boundary in its own drawing, as a share of its size. */
const PAD = 0.08;

/** @param {PlaceOutlineProps} props */
export function PlaceOutline({ d, bounds, statePath, canvas, label }) {
  const texas = `0 0 ${canvas.width} ${canvas.height}`;
  let own = texas;
  if (d && bounds) {
    const [[x0, y0], [x1, y1]] = bounds;
    const pad = Math.max(x1 - x0, y1 - y0) * PAD;
    own = `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`;
  }

  return (
    <div className={styles.root}>
      <div className={styles.frame}>
        <svg className={styles.svg} viewBox={own} role="img" aria-label={`Boundary of ${label}`}>
          <path d={d ?? statePath} className={styles.place} />
        </svg>
      </div>
      {d && (
        <div className={styles.locator}>
          <div className={styles.miniFrame}>
            <svg className={styles.svg} viewBox={texas} role="img" aria-label={`${label}, located in Texas`}>
              <path d={statePath} className={styles.state} />
              <path d={d} className={styles.marker} />
            </svg>
          </div>
          <span className={styles.caption}>Location in Texas</span>
        </div>
      )}
    </div>
  );
}
