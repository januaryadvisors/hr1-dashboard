/**
 * <YGrid> — horizontal gridlines across the plot with their values in the left
 * margin. The classes default to the Insights charts' and can be swapped for
 * another stylesheet's.
 */
import styles from './charts.module.css';

/**
 * @typedef {Object} YGridProps
 * @property {number[]} ticks
 * @property {(v: number) => number} y
 * @property {number} x1 - Plot's left edge; the labels end `gap` units left of it.
 * @property {number} x2 - Plot's right edge.
 * @property {(v: number) => string | null} format - null leaves that gridline unlabelled.
 * @property {number} [gap]
 * @property {number | string} [dy] - Baseline offset that centres the label on its line.
 * @property {string} [lineClassName]
 * @property {string} [labelClassName]
 */

/** @param {YGridProps} props */
export function YGrid({
  ticks,
  y,
  x1,
  x2,
  format,
  gap = 6,
  dy = 3,
  lineClassName = styles.gridline,
  labelClassName = styles.axis,
}) {
  return ticks.map((t, i) => {
    const label = format(t);
    return (
      <g key={i}>
        <line x1={x1} x2={x2} y1={y(t)} y2={y(t)} className={lineClassName} />
        {label != null && (
          <text x={x1 - gap} y={y(t)} dy={dy} textAnchor="end" className={labelClassName}>
            {label}
          </text>
        )}
      </g>
    );
  });
}
