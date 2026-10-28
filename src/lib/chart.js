/** Geometry shared by the SVG charts: series colours, line paths and end-label layout. */
import { line } from 'd3-shape';

/** Colours for series that do not set their own, in order. */
export const SERIES_COLORS = [
  'var(--ja-navy)',
  'var(--ja-burgundy)',
  'var(--ja-teal)',
  '#288c46',
  'var(--ja-orange)',
];

/** A series' own colour, or the palette's colour for its position. */
export const seriesColor = (series, i) => series.color ?? SERIES_COLORS[i % SERIES_COLORS.length];

/** Last index with a finite value, for an end label: { i, v }. null when there is none. */
export function lastFinite(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (Number.isFinite(values[i])) return { i, v: values[i] };
  }
  return null;
}

/**
 * SVG path through `values[from..to]`, plotted at their index on `x` and value
 * on `y`. Missing values break the line rather than dropping it to zero.
 */
export function linePath(values, x, y, from = 0, to = values.length - 1) {
  return line()
    .defined((d) => Number.isFinite(d[1]))
    .x((d) => x(d[0]))
    .y((d) => y(d[1]))(values.slice(from, to + 1).map((v, k) => [from + k, v]));
}

/**
 * Right margin wide enough for the longest end label: `perChar` viewBox units
 * per character plus `extra`, and never under `min`. A clipped label is worse
 * than none, because a truncated figure still reads as a figure.
 */
export function endLabelMargin(labels, { perChar, extra, min }) {
  const longest = labels.reduce((n, l) => Math.max(n, l.length), 0);
  return Math.max(min, Math.ceil(longest * perChar) + extra);
}

/**
 * Label positions for line ends at `ys`, each at least `gap` below the one
 * above it so labels of lines that finish close together do not overprint.
 * If that pushes the lowest past `maxY`, the whole stack moves up. Returned in
 * the order of `ys`.
 */
export function stackLabels(ys, gap, maxY = Infinity) {
  const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
  const out = new Array(ys.length);
  let prev = -Infinity;
  for (const i of order) {
    prev = Math.max(ys[i], prev + gap);
    out[i] = prev;
  }
  const overflow = prev - maxY;
  return overflow > 0 ? out.map((y) => y - overflow) : out;
}

/** The first month of each year in `months`, as { i, label: "2024" }. */
export function yearStarts(months) {
  const out = [];
  months.forEach((m, i) => {
    const year = m.slice(0, 4);
    if (!out.some((t) => t.label === year)) out.push({ i, label: year });
  });
  return out;
}

/**
 * A y domain and gridlines for an indexed chart (100 = the reference month):
 * steps of 10, wider where the lines spread far, with a clear step of headroom
 * above and below the data so no line runs along the frame.
 *
 * @returns {{ domain: [number, number], ticks: number[] }}
 */
export function indexAxis(values) {
  const lo = Math.min(100, ...values);
  const hi = Math.max(100, ...values);
  const span = hi - lo;
  const step = span <= 60 ? 10 : span <= 120 ? 20 : 50;
  // `+ 0` turns a -0 into 0, so a zero tick prints as "0".
  const min = Math.ceil(lo / step - 1) * step + 0;
  const max = Math.floor(hi / step + 1) * step;
  const ticks = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { domain: [min, max], ticks };
}
