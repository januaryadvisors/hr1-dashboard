/**
 * <RampLegend> — §7 / §6.5.
 *
 * Rate measure: a continuous ramp bar labelled PERCENTILE IN TEXAS, p0 to p100.
 * Count measure: "three nested circles with real values."
 */
import { fmtInt } from '../lib/format';
import { rampFor } from '../lib/scales';
import type { LayerKey } from '../types';
import styles from './RampLegend.module.css';

export interface RampLegendProps {
  layer: LayerKey;
  mode: 'rate' | 'count';
  /** Max count in the current selection, for the circle legend. */
  maxCount?: number;
  maxRadius?: number;
  loLabel?: string;
  hiLabel?: string;
  label?: string;
}

export function RampLegend({
  layer,
  mode,
  maxCount = 0,
  maxRadius = 22,
  loLabel = 'p0',
  hiLabel = 'p100',
  label,
}: RampLegendProps) {
  const stops = rampFor(layer);

  if (mode === 'count') {
    // Three nested circles at 1/9, 4/9 and 9/9 of the max, so the radii step
    // evenly under the sqrt scale.
    const values = [maxCount / 9, (maxCount * 4) / 9, maxCount].filter((v) => v > 0);
    const size = maxRadius * 2 + 4;
    return (
      <div className={styles.root}>
        <div className={styles.label}>{label ?? 'People'}</div>
        <div className={styles.circles}>
          {values.map((v) => {
            const r = Math.sqrt(v / maxCount) * maxRadius;
            return (
              <div key={v} className={styles.circleItem}>
                <svg width={r * 2 + 2} height={size} aria-hidden="true">
                  <circle
                    cx={r + 1}
                    cy={size - r - 1}
                    r={r}
                    fill={stops[stops.length - 2] ?? 'var(--ja-navy)'}
                    fillOpacity={0.8}
                    stroke="rgba(38,38,38,0.4)"
                    strokeWidth={0.5}
                  />
                </svg>
                <span className="tabular">{fmtInt(v)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!stops.length) return null;

  return (
    <div className={styles.root}>
      <div className={styles.label}>{label ?? 'Percentile in Texas'}</div>
      <div className={styles.bar} aria-hidden="true">
        {stops.map((c) => (
          <span key={c} className={styles.swatch} style={{ background: c }} />
        ))}
      </div>
      <div className={styles.ends}>
        <span>{loLabel}</span>
        <span>{hiLabel}</span>
      </div>
    </div>
  );
}
