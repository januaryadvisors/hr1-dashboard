/**
 * <ScatterChart> — §7 / §6.8 "Where need meets capacity".
 *
 * Vulnerability percentile on x, listed enrollment-support sites per 10,000
 * residents on y. Median crosshairs; the bottom-right quadrant is tinted and
 * labelled GAP QUADRANT. Points scale by population.
 */
import styles from './charts.module.css';

export interface ScatterPoint {
  geoid: string;
  name: string;
  x: number;
  y: number;
  /** Drives radius. */
  weight: number;
}

export function ScatterChart({
  points,
  height = 260,
  viewWidth: W = 1000,
  pinned,
  hovered,
  onHover,
  onSelect,
  xLabel = 'Vulnerability percentile →',
  yLabel = 'Sites per 10k',
}: {
  points: ScatterPoint[];
  height?: number;
  /** See ColumnChart: keep near the rendered width so the type stays legible. */
  viewWidth?: number;
  pinned?: string | null;
  hovered?: string | null;
  onHover?: (geoid: string | null) => void;
  onSelect?: (geoid: string) => void;
  xLabel?: string;
  yLabel?: string;
}) {
  const M = { top: 14, right: 14, bottom: 30, left: 46 };
  if (!points.length) return null;

  const xMax = Math.max(...points.map((p) => p.x)) || 1;
  // Clip the y-axis at the 98th percentile so a single outlier does not flatten
  // every other county onto the axis.
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  const yMax = Math.max(ys[Math.floor(ys.length * 0.98)] || 1, 0.5);
  const maxWeight = Math.max(...points.map((p) => p.weight)) || 1;

  const x = (v: number) => M.left + (v / xMax) * (W - M.left - M.right);
  const y = (v: number) =>
    M.top + (1 - Math.min(v, yMax) / yMax) * (height - M.top - M.bottom);
  const r = (w: number) => 2 + Math.sqrt(w / maxWeight) * 7;

  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const mx = median(points.map((p) => p.x));
  const my = median(points.map((p) => p.y));

  const pinnedPoint = points.find((p) => p.geoid === pinned);

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img"
      aria-label="Vulnerability percentile against listed enrollment-support sites per 10,000 residents"
      onMouseLeave={() => onHover?.(null)}>
      {/* Bottom-right quadrant: high need, nothing listed to meet it. */}
      <rect
        x={x(mx)}
        y={y(my)}
        width={W - M.right - x(mx)}
        height={height - M.bottom - y(my)}
        className={styles.quadrant}
      />
      <text x={W - M.right - 6} y={y(my) + 12} textAnchor="end" className={styles.quadrantLabel}>
        Gap quadrant
      </text>

      <line x1={x(mx)} x2={x(mx)} y1={M.top} y2={height - M.bottom} className={styles.gridline}
        strokeDasharray="3 3" />
      <line x1={M.left} x2={W - M.right} y1={y(my)} y2={y(my)} className={styles.gridline}
        strokeDasharray="3 3" />

      <line x1={M.left} x2={W - M.right} y1={height - M.bottom} y2={height - M.bottom}
        className={styles.zeroLine} />
      <line x1={M.left} x2={M.left} y1={M.top} y2={height - M.bottom} className={styles.zeroLine} />

      {points.map((p) => (
        <circle
          key={p.geoid}
          cx={x(p.x)}
          cy={y(p.y)}
          r={r(p.weight)}
          className={styles.point}
          style={p.geoid === hovered ? { fill: 'var(--ja-burgundy)', fillOpacity: 0.9 } : undefined}
          onMouseEnter={() => onHover?.(p.geoid)}
          onClick={() => onSelect?.(p.geoid)}
        />
      ))}

      {pinnedPoint && (
        <g>
          <circle cx={x(pinnedPoint.x)} cy={y(pinnedPoint.y)} r={r(pinnedPoint.weight) + 3}
            className={styles.pointPinned} />
          <text x={x(pinnedPoint.x) + r(pinnedPoint.weight) + 6} y={y(pinnedPoint.y) + 3}
            className={styles.pointLabel}>
            {pinnedPoint.name}
          </text>
        </g>
      )}

      <text x={W - M.right} y={height - 6} textAnchor="end" className={styles.axisLabel}>
        {xLabel}
      </text>
      <text x={4} y={M.top + 4} className={styles.axisLabel}
        transform={`rotate(-90 4 ${M.top + 4})`} textAnchor="end">
        {yLabel}
      </text>
    </svg>
  );
}
