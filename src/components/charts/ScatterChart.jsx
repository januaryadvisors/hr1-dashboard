/**
 * The "Where need meets capacity" scatter.
 *
 * Two metrics from a preset (config/metrics.js), with the preset's concern
 * corner tinted and counted. Points scale by population.
 *
 * Each axis runs from the 2nd to the 98th percentile with the Texas median at
 * its midpoint, so the four quadrants are equal (a linear axis bunches the
 * cloud in one corner). The two halves therefore have different scales, so the
 * ends and the median are labelled; counties past the ends sit on the edge (≤ / ≥).
 *
 * The points are memoised in their own layer, so a hover repaints only the highlight.
 */
import { memo, useMemo } from 'react';
import { splitQuadrants } from '../../config/metrics';
import { median } from '../../lib/stats';
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
const Points = memo(function Points({ points, scales }) {
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
  const M = { top: 32, right: 18, bottom: 48, left: 76 };
  /** Inset from the axis lines, so a county clamped to an end is not drawn on the axis. */
  const INSET = 10;
  /**
   * Dot radius in pixels: R_MIN for the smallest county, R_MIN + R_SPAN for the
   * largest. Clearances below are measured from a dot's EDGE, so they use the
   * largest radius.
   */
  const R_MIN = 3;
  const R_SPAN = 9;
  const R_MAX = R_MIN + R_SPAN;
  /**
   * Height of the corner quadrant labels' band along the top and bottom edges
   * of the plot, and the gap kept between that band and the nearest dot edge.
   * Dot centres stop LABEL_BAND + GAP + R_MAX from the edge, so even the
   * largest county clears the label text instead of sitting on it (and
   * stealing its hover).
   */
  const LABEL_BAND = 16;
  const GAP = 3;
  const CLEAR = LABEL_BAND + GAP + R_MAX;

  const { scales, split, ticks, floor: FLOOR, floorDots: FLOOR_DOTS } = useMemo(() => {
    if (!points.length) {
      const id = (v) => v;
      return { scales: { x: id, y: id, r: () => 0 }, split: splitQuadrants([], ySplit), ticks: null, floor: 0, floorDots: 0 };
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
    const yMid = ySplit === 'any' ? (median(yVals) ?? 1) : split.my;
    const yLo = yVals.length ? Math.min(quantile(yVals, 0.02), yMid) : 0;
    const yHi = yVals.length ? Math.max(quantile(yVals, 0.98), yMid) : 1;

    const maxWeight = Math.max(...points.map((p) => p.weight)) || 1;
    /*
       Radii are PIXELS, not viewBox units — the caller authors the viewBox
       at the element's real size, so a 3px dot is 3px on screen. Floored
       at R_MIN so the smallest counties stay a visible mark (and a big enough
       hover target) instead of a speck.
    */
    const r = (w) => R_MIN + Math.sqrt(w / maxWeight) * R_SPAN;

    /*
       The strip along the bottom that holds the zeros on a `ySplit: 'any'`
       axis. Without it the "none listed" counties — most of Texas on a
       capacity axis — would sit ON the x axis and the two lower quadrants
       would have no height to tint or label. Sized to its own largest dot: a
       gap, the row of dots, a gap, then the corner labels' band.
    */
    const zeroR = Math.max(R_MIN, ...points.filter((p) => p.y <= 0).map((p) => r(p.weight)));
    const floor = ySplit === 'any' ? GAP + 2 * zeroR + GAP + LABEL_BAND : 0;
    /** Zeros ride at the top of the strip; its bottom is left for the two corner labels. */
    const floorDots = GAP + zeroR;

    const x = pivotScale(xLo, split.mx, xHi, M.left + INSET, W - M.right - INSET);
    // Over a floor the lower labels are in the strip, so only INSET is needed there.
    const yPos = pivotScale(yLo, yMid, yHi, bottom - (floor ? floor + INSET : CLEAR), M.top + CLEAR);

    return {
      scales: {
        x,
        y: (v) => (floor && v <= 0 ? bottom - floor + floorDots : yPos(v)),
        r,
      },
      split,
      floor,
      floorDots,
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
     Geometry for each named quadrant.

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
        All four quadrants, labelled, with the finding tinted: a quadrant chart
        that labels one corner asks the reader to infer the other three.

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
            {/* Arrows point the way each label's x reads: lower to the left, higher to the right. */}
            {q.corner.startsWith('hi') ? (
              <>
                {q.label} <tspan className={styles.quadrantArrow}>→</tspan>
              </>
            ) : (
              <>
                <tspan className={styles.quadrantArrow}>←</tspan> {q.label}
              </>
            )}
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
        Centred on the plot's height and rotated about its own origin, so a
        long caller-supplied name grows in both directions instead of running
        off the bottom of the viewBox.
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
