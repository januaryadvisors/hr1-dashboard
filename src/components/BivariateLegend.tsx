/**
 * <BivariateLegend> — the 3x3 key for the bivariate work layer.
 *
 * A ramp bar cannot explain a two-axis scheme, so the legend is the scheme
 * itself: the matrix, rotated 45° so the "both high" corner points at the
 * reader, with an arrow along each edge.
 *
 * Both arrows point the same way — toward difficulty — which is the one thing
 * about this map that has to be unambiguous. See LAYERS.work_both.axes.
 */
import { bivariatePalette, BIVARIATE_STEPS } from '../lib/scales';
import type { BivariateAxis } from '../config/layers';
import styles from './BivariateLegend.module.css';

export interface BivariateLegendProps {
  /** [red axis, blue axis], in the order LayerValues carries them. */
  axes: [BivariateAxis, BivariateAxis];
  steps?: number;
}

/** Cell edge in px. The whole key is ~76px across once rotated. */
const CELL = 15;

export function BivariateLegend({ axes, steps = BIVARIATE_STEPS }: BivariateLegendProps) {
  const grid = bivariatePalette(steps);
  const side = CELL * steps;
  // The rotated square needs a box its diagonal fits inside.
  const box = Math.ceil(side * Math.SQRT2) + 2;
  const [red, blue] = axes;

  return (
    <div className={styles.root}>
      <div className={styles.matrixWrap}>
        <svg
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          role="img"
          aria-label={`Bivariate key. Red axis: ${red.label}. Blue axis: ${blue.label}. The darkest corner is both at once.`}
        >
          <g transform={`translate(${box / 2} ${box / 2}) rotate(-45) translate(${-side / 2} ${-side / 2})`}>
            {grid.map((row, bi) =>
              row.map((fill, ai) => (
                <rect
                  key={`${bi}-${ai}`}
                  // Row 0 is the low end of the blue axis, so it draws at the
                  // bottom — SVG y grows downward.
                  x={ai * CELL}
                  y={(steps - 1 - bi) * CELL}
                  width={CELL}
                  height={CELL}
                  fill={fill}
                />
              )),
            )}
            {/* Axis arrows along the two bottom edges of the unrotated square,
                which become the two lower edges of the diamond. */}
            <path
              d={`M0 ${side + 3}L${side} ${side + 3}`}
              className={styles.axis}
              markerEnd="url(#biv-arrow)"
            />
            <path
              d={`M-3 ${side}L-3 0`}
              className={styles.axis}
              markerEnd="url(#biv-arrow)"
            />
          </g>
          <defs>
            <marker
              id="biv-arrow"
              viewBox="0 0 8 8"
              refX="6"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 1L6 4L0 7Z" fill="currentColor" />
            </marker>
          </defs>
        </svg>
      </div>

      <div className={styles.keys}>
        <span className={styles.key}>
          <span className={styles.swatch} style={{ background: grid[0][steps - 1] }} />
          {red.label}
        </span>
        <span className={styles.key}>
          <span className={styles.swatch} style={{ background: grid[steps - 1][0] }} />
          {blue.label}
        </span>
        <span className={styles.key}>
          <span className={styles.swatch} style={{ background: grid[steps - 1][steps - 1] }} />
          Both at once
        </span>
      </div>
    </div>
  );
}
