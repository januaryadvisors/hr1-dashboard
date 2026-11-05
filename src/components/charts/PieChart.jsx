/**
 * <PieChart> — a part-to-whole of a few slices, with a key beside it that is
 * also the table: each slice's name, count and share, so no figure depends on
 * reading an angle or a colour.
 *
 * Slices draw clockwise from twelve o'clock in the order given, a 2px surface
 * gap between them. A share is printed inside any slice big enough to hold it.
 * Hovering a slice or its key row picks it out and shows its figures by it.
 *
 * `compact` is for the Map story's rail: a small pie with its caption and a
 * tighter key stacked beside it on one row, so the step stays short enough to
 * scroll past.
 */
import { useState } from 'react';
import { arc as d3arc, pie as d3pie } from 'd3-shape';
import { cx } from '../../lib/cx';
import styles from './PieChart.module.css';

/**
 * @typedef {Object} PieSlice
 * @property {string} label
 * @property {number} value - Non-negative; a zero slice is listed in the key but not drawn.
 * @property {string} color
 * @property {string} count - The value as display text, for the key and the tooltip.
 * @property {string} share - The slice's share as display text.
 */

/** Smallest slice, as a share of the whole, that holds its own label. */
const LABEL_MIN = 0.1;

/**
 * @param {{ slices: PieSlice[], size?: number, countLabel: string, shareLabel?: string, title: string,
 *   compact?: boolean, caption?: string }} props
 *   `size` is the pie's drawn diameter in px. `countLabel` and `shareLabel` head the key's two figure columns.
 *   `caption`, compact only, sits above the key, beside the pie.
 */
export function PieChart({ slices, size = 200, countLabel, shareLabel = 'Share', title, compact, caption }) {
  const [active, setActive] = useState(null);
  const r = size / 2;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const arcs = d3pie()
    .sort(null)
    .value((s) => s.value)(slices.filter((s) => s.value > 0));
  const shape = d3arc().innerRadius(0).outerRadius(r);
  const labelAt = d3arc().innerRadius(r * 0.55).outerRadius(r * 0.55);

  const hovered = arcs.find((a) => a.data.label === active);
  /** The tooltip sits over the slice's middle, as a share of the pie's box. */
  const tipAt = hovered ? labelAt.centroid(hovered).map((v) => ((v + r) / size) * 100) : null;

  return (
    <div className={cx(styles.root, compact && styles.compact)} onPointerLeave={() => setActive(null)}>
      <div className={styles.pie} style={{ width: size }}>
        <svg viewBox={`${-r} ${-r} ${size} ${size}`} className={styles.svg} role="img" aria-label={title}>
          {arcs.map((a) => (
            <path
              key={a.data.label}
              d={shape(a)}
              fill={a.data.color}
              className={cx(styles.slice, active && active !== a.data.label && styles.faded)}
              onPointerEnter={() => setActive(a.data.label)}
              onPointerDown={() => setActive(a.data.label)}
            />
          ))}
          {total > 0 &&
            arcs
              .filter((a) => a.data.value / total >= LABEL_MIN)
              .map((a) => {
                const [x, y] = labelAt.centroid(a);
                return (
                  <text key={a.data.label} x={x} y={y} dy="0.35em" textAnchor="middle" className={styles.inLabel}>
                    {a.data.share}
                  </text>
                );
              })}
        </svg>
        {hovered && (
          <div className={styles.tip} style={{ left: `${tipAt[0]}%`, top: `${tipAt[1]}%` }} aria-hidden="true">
            <div className={styles.tipName}>{hovered.data.label}</div>
            <div>
              <strong>{hovered.data.count}</strong> · {hovered.data.share}
            </div>
          </div>
        )}
      </div>

      <div className={styles.side}>
        {compact && caption && <p className={styles.caption}>{caption}</p>}
        <table className={styles.key}>
          <thead>
            <tr>
              <th scope="col">Age</th>
              <th scope="col" className={styles.num}>
                {countLabel}
              </th>
              <th scope="col" className={styles.num}>
                {shareLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr
                key={s.label}
                className={cx(active === s.label && styles.rowOn)}
                onPointerEnter={() => setActive(s.value > 0 ? s.label : null)}
              >
                <th scope="row">
                  <span className={styles.swatch} style={{ background: s.color }} aria-hidden="true" />
                  {s.label}
                </th>
                <td className={cx(styles.num, 'tabular')}>{s.count}</td>
                <td className={cx(styles.num, 'tabular')}>{s.share}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
