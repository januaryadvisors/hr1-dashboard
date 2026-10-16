/**
 * <ScatterChart> — §7 / §6.8 "Where need meets capacity".
 *
 * Two county metrics chosen by a preset (config/metrics.js). Median
 * crosshairs, or a none-listed floor strip on a zero-inflated y axis; the
 * preset's concern corner is tinted and counted. Points scale by population.
 *
 * MEDIAN-CENTRED AXES, 2026-10-16. Each axis runs from the 2nd to the 98th
 * percentile with the Texas median at its midpoint, so the crosshair sits in the
 * middle of the plot and the four quadrants are the same size. On a plain linear
 * axis from zero the cloud bunched into one corner — most counties lost a
 * similar share and a few lost far more — and the quadrants were unreadable.
 * The two halves of an axis have different units per pixel as a result, so the
 * ends and the median are labelled with their values; the few counties past
 * the 2nd/98th percentiles sit on the edge, and the end labels say ≤ / ≥.
 *
 * Hovering or pinning a county on the map highlights it here with a ring and a
 * label. The 254 base points are memoised into their own layer so a hover
 * repaints only the two-element highlight overlay, not the whole cloud — which
 * is what keeps map-hover smooth.
 */
import { memo, useMemo } from 'react';
import { splitQuadrants } from '../../config/metrics';
import styles from './charts.module.css';

/**
 * @typedef {Object} ScatterPoint
 * @property {string} geoid
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} weight - Drives radius.
 */

/** Value at quantile `p` of an ascending array. */
const quantile = (sorted, p) => sorted[Math.round((sorted.length - 1) * p)];

/**
 * A two-piece linear scale: lo → r0, mid → the midpoint of the range, hi → r1.
 * Values outside [lo, hi] clamp to the ends.
 */
function pivotScale(lo, mid, hi, r0, r1) {
  const rm = (r0 + r1) / 2;
  return (v) => {
    if (v <= mid) {
      return mid > lo ? r0 + ((Math.max(v, lo) - lo) / (mid - lo)) * (rm - r0) : rm;
    }
    return hi > mid ? rm + ((Math.min(v, hi) - mid) / (hi - mid)) * (r1 - rm) : rm;
  };
}

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
  xFormat = String,
  yFormat = String,
  quadrants = [],
  ySplit = 'median',
  renderOverlay,
}) {
  /*
   * Left margin: the rotated y-axis name and, inboard of it, the y tick values.
   * Top: the "Texas median" label over the vertical crosshair. Bottom: the x
   * tick values and, under them, the x-axis name.
   */
  const M = { top: 26, right: 18, bottom: 48, left: 76 };
  /** Inset from the axis lines, so a county clamped to an end is not drawn on the axis. */
  const INSET = 10;

  /**
   * Height of the strip along the bottom that holds the zeros on a `ySplit:
   * 'any'` axis. Without it the "none listed" counties — most of Texas on a
   * capacity axis — would sit ON the x axis and the two lower quadrants would
   * have no height to tint or label.
   */
  const FLOOR = ySplit === 'any' ? 34 : 0;
  /** Zeros ride in the strip's upper half; its lower half is left for the two corner labels. */
  const FLOOR_DOTS = 11;

  const { scales, split, ticks } = useMemo(() => {
    if (!points.length) {
      const id = (v) => v;
      return { scales: { x: id, y: id, r: () => 0 }, split: splitQuadrants([], ySplit), ticks: null };
    }
    const split = splitQuadrants(points, ySplit);
    const bottom = height - M.bottom;
    const asc = (arr) => [...arr].sort((a, b) => a - b);

    const xs = asc(points.map((p) => p.x));
    const xLo = Math.min(quantile(xs, 0.02), split.mx);
    const xHi = Math.max(quantile(xs, 0.98), split.mx);

    // On a floor-split axis only the listed (positive) values are scaled; the
    // zeros ride in the strip below, which is where the crosshair is drawn.
    const yVals = asc(points.map((p) => p.y).filter((v) => ySplit !== 'any' || v > 0));
    const yMid = ySplit === 'any' ? (yVals.length ? quantile(yVals, 0.5) : 1) : split.my;
    const yLo = yVals.length ? Math.min(quantile(yVals, 0.02), yMid) : 0;
    const yHi = yVals.length ? Math.max(quantile(yVals, 0.98), yMid) : 1;

    const x = pivotScale(xLo, split.mx, xHi, M.left + INSET, W - M.right - INSET);
    const yPos = pivotScale(yLo, yMid, yHi, bottom - FLOOR - INSET, M.top + INSET);
    const maxWeight = Math.max(...points.map((p) => p.weight)) || 1;

    return {
      scales: {
        x,
        y: (v) => (FLOOR && v <= 0 ? bottom - FLOOR + FLOOR_DOTS : yPos(v)),
        /*
           Radii are PIXELS, not viewBox units — both callers now author their
           viewBox at the element's real size, so a 3px dot is 3px on screen.
           Floored at 3 rather than 2 so the smallest counties stay a visible
           mark (and a big enough hover target) instead of a speck.
        */
        r: (w) => 3 + Math.sqrt(w / maxWeight) * 9,
      },
      split,
      // Ends get ≤ / ≥ only when some county actually lies past them.
      ticks: {
        x: [
          { v: xLo, pre: xs[0] < xLo ? '≤ ' : '' },
          { v: split.mx, pre: '' },
          { v: xHi, pre: xs[xs.length - 1] > xHi ? '≥ ' : '' },
        ],
        y: yVals.length
          ? [
              { v: yLo, pre: yVals[0] < yLo ? '≤ ' : '' },
              { v: yMid, pre: '' },
              { v: yHi, pre: yVals[yVals.length - 1] > yHi ? '≥ ' : '' },
            ]
          : [],
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, height, ySplit]);

  const { mx, my } = split;

  if (!points.length) return null;

  /*
     Geometry and population for each named quadrant.

     `hi` on y is the TOP of the plot whatever the metric means, so a preset
     that worries about high capacity and one that worries about low capacity
     both describe their corner the same way and this does not have to know
     which is which — see SCATTER_PRESETS.
  */
  const qx = scales.x(mx);
  const qy = FLOOR ? height - M.bottom - FLOOR : scales.y(my);
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
        (p) => split.isHiX(p) === hiX && split.isHiY(p) === hiY,
      ).length,
    };
  });

  const byGeoid = (id) =>
    id ? points.find((p) => p.geoid === id) : undefined;

  const active = byGeoid(hovered);

  return (
    <>
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
        counties", never "bad" in absolute terms. The one exception is a
        `ySplit: 'any'` axis, where the horizontal line separates the strip of
        counties with none listed from those with any — see splitQuadrants().
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
        y1={qy}
        y2={qy}
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

      {/* Tick values: each axis's two ends and its median. A short tick on
          the axis marks each one. */}
      {ticks.x.map((t, i) => {
        const tx = scales.x(t.v);
        return (
          <g key={`xt-${i}`}>
            <line x1={tx} x2={tx} y1={height - M.bottom} y2={height - M.bottom + 4} className={styles.zeroLine} />
            <text
              x={tx}
              y={height - M.bottom + 17}
              textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
              className={i === 1 ? styles.tickMedian : styles.tick}
            >
              {t.pre}
              {xFormat(t.v)}
            </text>
          </g>
        );
      })}
      {ticks.y.map((t, i) => {
        const ty = scales.y(t.v);
        return (
          <g key={`yt-${i}`}>
            <line x1={M.left - 4} x2={M.left} y1={ty} y2={ty} className={styles.zeroLine} />
            <text
              x={M.left - 8}
              y={ty + 4}
              textAnchor="end"
              className={i === 1 && ySplit !== 'any' ? styles.tickMedian : styles.tick}
            >
              {t.pre}
              {yFormat(t.v)}
            </text>
          </g>
        );
      })}
      {FLOOR > 0 && (
        <text x={M.left - 8} y={height - M.bottom - FLOOR + FLOOR_DOTS + 4} textAnchor="end" className={styles.tick}>
          None
        </text>
      )}

      {/* Names the crosshair, so "the middle of the chart" reads as the Texas
          median rather than as an arbitrary line. */}
      <text x={scales.x(mx)} y={M.top - 9} textAnchor="middle" className={styles.medianLabel}>
        Texas median
      </text>

      <text x={W - M.right} y={height - 8} textAnchor="end" className={styles.axisLabel}>
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
        transform={`translate(14 ${(M.top + height - M.bottom) / 2}) rotate(-90)`}
        textAnchor="middle"
      >
        {yLabel}
      </text>
    </svg>
    {/* HTML beside the active point — the tooltip. The viewBox is authored at
        the slot's real pixels, so these coordinates are CSS pixels in it. */}
    {active &&
      renderOverlay?.({
        geoid: active.geoid,
        x: scales.x(active.x),
        y: scales.y(active.y),
        r: scales.r(active.weight),
        width: W,
        height,
      })}
    </>
  );
}
