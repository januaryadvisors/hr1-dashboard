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

/**
 * @typedef {Object} ScatterPoint
 * @property {string} geoid
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} weight - Drives radius.
 */

/**
 * @typedef {Object} Scales
 * @property {(v: number) => number} x
 * @property {(v: number) => number} y
 * @property {(w: number) => number} r
 */

/** Base cloud. Depends only on the data and the scales, never on hover state. */
const Points = memo(function Points({
  points,
  scales,
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
  quadrants = [],
}) {
  /*
 * Left margin carries the rotated y-axis label and NOTHING ELSE — this chart
 * draws no y tick values, so the gutter only has to fit one line of 8px type
 * turned on its side, plus a little air.
 *
 * It was 68, sized on the theory that a long caller-supplied name ("Share of
 * child caseload lost") needs room. It does not: rotating the label means a long
 * one grows DOWNWARD, not leftward, so the width it needs is the font's line
 * height either way. At 68 the label sat ~50px clear of the axis and the plot
 * read as a tall rectangle pushed to the right of its own frame.
 */
const M = { top: 14, right: 18, bottom: 30, left: 34 };

  const { scales, mx, my } = useMemo(() => {
    if (!points.length) {
      const id = (v) => v;
      return { scales: { x: id, y: id, r: () => 0 }, mx: 0, my: 0 };
    }
    const xMax = Math.max(...points.map((p) => p.x)) || 1;
    // Clip the y-axis at the 98th percentile so a single outlier does not flatten
    // every other county onto the axis.
    const ys = points.map((p) => p.y).sort((a, b) => a - b);
    const yMax = Math.max(ys[Math.floor(ys.length * 0.98)] || 1, 0.5);
    const maxWeight = Math.max(...points.map((p) => p.weight)) || 1;

    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    return {
      scales: {
        x: (v) => M.left + (v / xMax) * (W - M.left - M.right),
        y: (v) => M.top + (1 - Math.min(v, yMax) / yMax) * (height - M.top - M.bottom),
        /*
           Radii are PIXELS, not viewBox units — both callers now author their
           viewBox at the element's real size, so a 3px dot is 3px on screen.
           Floored at 3 rather than 2 so the smallest counties stay a visible
           mark (and a big enough hover target) instead of a speck.
        */
        r: (w) => 3 + Math.sqrt(w / maxWeight) * 9,
      },
      mx: median(points.map((p) => p.x)),
      my: median(points.map((p) => p.y)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, height]);

  if (!points.length) return null;

  /*
     Geometry and population for each named quadrant.

     `hi` on y is the TOP of the plot whatever the metric means, so a preset
     that worries about high capacity and one that worries about low capacity
     both describe their corner the same way and this does not have to know
     which is which — see SCATTER_PRESETS.
  */
  const qx = scales.x(mx);
  const qy = scales.y(my);
  const edge = { left: M.left, right: W - M.right, top: M.top, bottom: height - M.bottom };
  const PAD = 6;

  const quadrantBoxes = quadrants.map((q) => {
    const [xSide, ySide] = q.corner.split('-');
    const hiX = xSide === 'hi';
    const hiY = ySide === 'hi';

    const x = hiX ? qx : edge.left;
    const w = hiX ? edge.right - qx : qx - edge.left;
    const y = hiY ? edge.top : qy;
    const h = hiY ? qy - edge.top : edge.bottom - qy;

    return {
      ...q,
      x,
      y,
      w,
      h,
      // Labels sit in each quadrant's OUTER corner, so none of them lands on
      // the crosshair where the cloud is densest.
      labelX: hiX ? edge.right - PAD : edge.left + PAD,
      labelY: hiY ? edge.top + 9 : edge.bottom - PAD,
      anchor: hiX ? 'end' : 'start',
      count: points.filter(
        (p) => (hiX ? p.x >= mx : p.x < mx) && (hiY ? p.y >= my : p.y < my),
      ).length,
    };
  });

  const byGeoid = (id) =>
    id ? points.find((p) => p.geoid === id) : undefined;

  const active = byGeoid(hovered);

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={`${yLabel} against ${xLabel.replace(/\s*→$/, '')}, ${points.length} counties`}
      onMouseLeave={() => onHover?.(null)}
    >
      {/*
        ALL FOUR QUADRANTS, labelled, with the finding tinted — 2026-09-11.

        Only the one "gap" corner used to be drawn, which left the other three
        as unexplained empty space and made the chart look like it had a
        highlight rather than a structure. A quadrant chart that labels one
        corner is asking the reader to infer the other three.

        The dashed crosshair below sits on the MEDIAN of the plotted counties,
        so every quadrant holds roughly a quarter of them by construction. That
        is a relative reading, not a threshold — "worse than most Texas
        counties", never "bad" in absolute terms.
      */}
      {quadrantBoxes.map((q) => (
        <g key={q.corner}>
          {q.concern && <rect x={q.x} y={q.y} width={q.w} height={q.h} className={styles.quadrant} />}
          <text
            x={q.labelX}
            y={q.labelY}
            textAnchor={q.anchor}
            className={q.concern ? styles.quadrantLabelConcern : styles.quadrantLabel}
          >
            {q.label}
            {q.concern ? ` · ${q.count} ${q.count === 1 ? 'county' : 'counties'}` : ''}
          </text>
        </g>
      ))}

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
