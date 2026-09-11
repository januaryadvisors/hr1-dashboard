/**
 * One domain row in the county tooltip: the layer's binned ramp as segments, a
 * caret marking where this county sits, and a tick at the state median.
 *
 * The caret is positioned by PERCENTILE, not by bin, so two counties in the same
 * bin still read differently — the bins are the colour scheme, the caret is the
 * value.
 */
import { binIndex, binsFor, rampFor } from '../../lib/scales';
/**
 * @typedef {import('../../types').LayerKey} LayerKey
 */

const W = 300;
const BAR_H = 11;
const CARET_H = 6;
const GAP = 2;

/**
 * @typedef {Object} DomainScaleProps
 * @property {LayerKey} layer
 * @property {number | null} value - This county's value, on the layer's own scale.
 * @property {number} median - The statewide median, on the same scale.
 * @property {[number, number]} domain - Scale bounds — 0–1 for domains, 0–4 for the composite.
 * @property {'full' | 'compact'} [variant] - 'full'    every band coloured, plus a caret and the median tick.
 *   'compact' only the band this county falls in is coloured; the rest are
 *   neutral. Reads as "which band" at a glance and takes half the
 *   height, which is what lets the unfocused domains sit in a 2x2.
 */

const MUTED = '#efeded';

export function DomainScale({
  layer,
  value,
  median,
  domain,
  variant = 'full',
}) {
  const stops = rampFor(layer);
  const bins = binsFor(layer);
  if (!stops.length) return null;

  const [lo, hi] = domain;
  const frac = (v) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const x = (v) => frac(v) * W;

  // Segments are drawn at equal width — the ramp is a key to the bins, not a
  // second axis, and unequal widths would read as a distorted scale.
  const segW = (W - GAP * (stops.length - 1)) / stops.length;

  if (variant === 'compact') {
    const activeBin = binIndex(value, bins);
    const h = 8;
    return (
      <svg
        viewBox={`0 0 ${W} ${h}`}
        width="100%"
        style={{ display: 'block', height: 'auto' }}
        aria-hidden="true"
      >
        {stops.map((c, i) => (
          <rect
            key={c + i}
            x={i * (segW + GAP)}
            y={0}
            width={segW}
            height={h}
            rx={1.5}
            fill={i === activeBin ? c : MUTED}
          />
        ))}
      </svg>
    );
  }

  const height = BAR_H + CARET_H + 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      style={{ display: 'block', height: 'auto' }}
      aria-hidden="true"
    >
      {stops.map((c, i) => (
        <rect
          key={c + i}
          x={i * (segW + GAP)}
          y={0}
          width={segW}
          height={BAR_H}
          rx={1.5}
          fill={c}
        />
      ))}

      {/* State median tick, drawn through the bar. */}
      <line
        x1={x(median)}
        x2={x(median)}
        y1={-1}
        y2={BAR_H + 1}
        stroke="var(--ja-ink)"
        strokeWidth={0.9}
        strokeOpacity={0.55}
      />

      {value != null && (
        <path
          d={`M${x(value)} ${BAR_H + 1.5}L${x(value) + 4.5} ${BAR_H + CARET_H + 1.5}L${
            x(value) - 4.5
          } ${BAR_H + CARET_H + 1.5}Z`}
          fill="var(--ja-ink)"
        />
      )}

      {/* Bin boundaries, faint — they explain why the colour changes where it does. */}
      {bins.slice(1, -1).map((b) => (
        <line
          key={b}
          x1={x(b)}
          x2={x(b)}
          y1={BAR_H - 2.5}
          y2={BAR_H}
          stroke="#ffffff"
          strokeWidth={0.8}
          strokeOpacity={0.7}
        />
      ))}
    </svg>
  );
}
