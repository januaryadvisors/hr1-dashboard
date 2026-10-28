/** Monthly enrollment for one county across the active window. */
import { scaleLinear } from 'd3-scale';
import { linePath } from '../../lib/chart';

const W = 300;
const PAD = 3;

/**
 * @typedef {Object} SparklineProps
 * @property {number[]} values
 * @property {number} [height]
 */

export function Sparkline({ values, height = 34 }) {
  if (values.length < 2) return null;

  const x = scaleLinear().domain([0, values.length - 1]).range([0, W]);
  // A flat series has no extent; d3 draws it down the middle.
  const y = scaleLinear()
    .domain([Math.min(...values), Math.max(...values)])
    .range([height - PAD, PAD]);
  const last = values.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: 'block', height: 'auto' }}
      aria-hidden="true">
      <path d={linePath(values, x, y)} fill="none" stroke="var(--ja-burgundy)" strokeWidth={1.6} />
      <circle cx={x(last)} cy={y(values[last])} r={2.6} fill="var(--ja-burgundy)" />
    </svg>
  );
}
