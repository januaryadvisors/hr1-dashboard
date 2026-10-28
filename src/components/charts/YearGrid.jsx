/**
 * <YearGrid> — a vertical gridline and a year label at the first month of each
 * year. Labels closer together than `minGap` are dropped from the left, so a
 * partial first year never prints over the next one.
 */
import { yearStarts } from '../../lib/chart';
import styles from './charts.module.css';

/**
 * @typedef {Object} YearGridProps
 * @property {string[]} months
 * @property {(i: number) => number} x - Month index to x.
 * @property {number} top - Plot's top edge.
 * @property {number} bottom - Plot's bottom edge; the labels sit below it.
 * @property {number} labelY
 * @property {number} [minGap]
 */

/** @param {YearGridProps} props */
export function YearGrid({ months, x, top, bottom, labelY, minGap = 34 }) {
  const years = yearStarts(months);
  return years.map((t, k) => {
    const next = years[k + 1];
    const labelled = !next || x(next.i) - x(t.i) >= minGap;
    return (
      <g key={t.label}>
        {/* The plot's left edge is its own frame; no gridline on top of it. */}
        {t.i > 0 && <line x1={x(t.i)} x2={x(t.i)} y1={top} y2={bottom} className={styles.gridline} />}
        {labelled && (
          <text x={x(t.i)} y={labelY} textAnchor="middle" className={styles.axis}>
            {t.label}
          </text>
        )}
      </g>
    );
  });
}
