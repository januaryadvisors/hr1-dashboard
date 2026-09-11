/**
 * <ScatterChart> — §7 / §6.8 "Where need meets capacity".
 *
 * Vulnerability percentile on x, listed enrollment-support sites per 10,000
 * residents on y. Median crosshairs; the bottom-right quadrant is tinted and
 * labelled GAP QUADRANT. Points scale by population.
 *
 * Hovering or pinning a county on the map highlights it here with a ring and a
 * label. The 254 base points are memoised into their own layer so a hover
 * repaints only the two-element highlight overlay, not the whole cloud — which
 * is what keeps map-hover smooth.
 */
import { memo, useMemo } from 'react';
import styles from './charts.module.css';

export interface ScatterPoint {
  geoid: string;
  name: string;
  x: number;
  y: number;
  /** Drives radius. */
  weight: number;
}

interface Scales {
  x: (v: number) => number;
  y: (v: number) => number;
  r: (w: number) => number;
}

/** Base cloud. Depends only on the data and the scales, never on hover state. */
const Points = memo(function Points({
  points,
  scales,
}: {
  points: ScatterPoint[];
  scales: Scales;
}) {
  return (
    <g>
      {points.map((p) => (
        <circle
          key={p.geoid}
          cx={scales.x(p.x)}
          cy={scales.y(p.y)}
          r={scales.r(p.weight)}
          className={styles.point}
        />
      ))}
    </g>
  );
});

export function ScatterChart({
  points,
  height = 260,
  viewWidth: W = 1000,
  hovered,
  onHover,
  xLabel = 'Vulnerability percentile →',
  yLabel = 'Sites per 10k',
  quadrantNote,
  showQuadrant = true,
}: {
  points: ScatterPoint[];
  height?: number;
  /** See ColumnChart: keep near the rendered width so the type stays legible. */
  viewWidth?: number;
  hovered?: string | null;
  onHover?: (geoid: string | null) => void;
  xLabel?: string;
  yLabel?: string;
  /**
   * Appended to the quadrant label, e.g. "62 counties". Passed in rather than
   * counted here so the caller's side note and this label read off one number.
   */
  quadrantNote?: string;
  /**
   * Draw the tinted bottom-right corner.
   *
   * Off when the axis pair cannot support the reading. "Gap quadrant" means
   * much of a bad thing and little of a good one, which only holds when x rises
   * with need and y rises with capacity — on any other pair the tint would
   * assert something the axes do not say. See gapQuadrantApplies().
   */
  showQuadrant?: boolean;
}) {
  /*
 * Left margin carries the rotated y-axis label. At 46 the label sat half off
 * the viewBox — the axis names are now caller-supplied and can be long
 * ("Share of child caseload lost"), so the gutter has to fit a rotated string
 * rather than the one short label it was sized for.
 */
const M = { top: 14, right: 18, bottom: 30, left: 68 };

  const { scales, mx, my } = useMemo(() => {
    if (!points.length) {
      const id = (v: number) => v;
      return { scales: { x: id, y: id, r: () => 0 } as Scales, mx: 0, my: 0 };
    }
    const xMax = Math.max(...points.map((p) => p.x)) || 1;
    // Clip the y-axis at the 98th percentile so a single outlier does not flatten
    // every other county onto the axis.
    const ys = points.map((p) => p.y).sort((a, b) => a - b);
    const yMax = Math.max(ys[Math.floor(ys.length * 0.98)] || 1, 0.5);
    const maxWeight = Math.max(...points.map((p) => p.weight)) || 1;

    const median = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    return {
      scales: {
        x: (v: number) => M.left + (v / xMax) * (W - M.left - M.right),
        y: (v: number) => M.top + (1 - Math.min(v, yMax) / yMax) * (height - M.top - M.bottom),
        r: (w: number) => 2 + Math.sqrt(w / maxWeight) * 7,
      },
      mx: median(points.map((p) => p.x)),
      my: median(points.map((p) => p.y)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, height]);

  if (!points.length) return null;

  const byGeoid = (id: string | null | undefined) =>
    id ? points.find((p) => p.geoid === id) : undefined;

  const active = byGeoid(hovered);

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label="Vulnerability percentile against listed enrollment-support sites per 10,000 residents"
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Bottom-right quadrant: high need, nothing listed to meet it. */}
      {showQuadrant && (
        <>
          <rect
            x={scales.x(mx)}
            y={scales.y(my)}
            width={W - M.right - scales.x(mx)}
            height={height - M.bottom - scales.y(my)}
            className={styles.quadrant}
          />
          <text
            x={W - M.right - 6}
            y={scales.y(my) + 12}
            textAnchor="end"
            className={styles.quadrantLabel}
          >
            Gap quadrant{quadrantNote ? ` · ${quadrantNote}` : ''}
          </text>
        </>
      )}

      <line
        x1={scales.x(mx)}
        x2={scales.x(mx)}
        y1={M.top}
        y2={height - M.bottom}
        className={styles.gridline}
        strokeDasharray="3 3"
      />
      <line
        x1={M.left}
        x2={W - M.right}
        y1={scales.y(my)}
        y2={scales.y(my)}
        className={styles.gridline}
        strokeDasharray="3 3"
      />

      <line
        x1={M.left}
        x2={W - M.right}
        y1={height - M.bottom}
        y2={height - M.bottom}
        className={styles.zeroLine}
      />
      <line
        x1={M.left}
        x2={M.left}
        y1={M.top}
        y2={height - M.bottom}
        className={styles.zeroLine}
      />

      <Points points={points} scales={scales} />

      {/* Interaction targets, kept separate so the painted cloud stays memoised. */}
      <g>
        {points.map((p) => (
          <circle
            key={`hit-${p.geoid}`}
            cx={scales.x(p.x)}
            cy={scales.y(p.y)}
            r={Math.max(4, scales.r(p.weight))}
            fill="transparent"
            onMouseEnter={() => onHover?.(p.geoid)}
          />
        ))}
      </g>

      {/* Highlight overlay — the only part that repaints on hover. */}
      {active && (
        <g className={styles.highlight}>
          <circle
            cx={scales.x(active.x)}
            cy={scales.y(active.y)}
            r={scales.r(active.weight)}
            className={styles.highlightDot}
          />
          <circle
            cx={scales.x(active.x)}
            cy={scales.y(active.y)}
            r={scales.r(active.weight) + 4}
            className={styles.highlightRing}
          />
          <text
            // Flip the label inboard near the right edge so it never clips.
            x={scales.x(active.x) + (scales.x(active.x) > W * 0.7 ? -1 : 1) * (scales.r(active.weight) + 7)}
            y={scales.y(active.y) + 3.5}
            textAnchor={scales.x(active.x) > W * 0.7 ? 'end' : 'start'}
            className={styles.highlightLabel}
          >
            {active.name}
          </text>
        </g>
      )}

      <text x={W - M.right} y={height - 6} textAnchor="end" className={styles.axisLabel}>
        {xLabel}
      </text>
      {/*
        Centred on the plot's height and rotated about its own origin. It used
        to anchor at the top-left and run downward, which pushed a long label
        ("Share of child caseload lost") off the bottom of the viewBox — the
        axis names are caller-supplied now, so the label cannot be sized for.
      */}
      <text
        className={styles.axisLabel}
        transform={`translate(16 ${(M.top + height - M.bottom) / 2}) rotate(-90)`}
        textAnchor="middle"
      >
        {yLabel}
      </text>
    </svg>
  );
}
