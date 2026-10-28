/**
 * Bins, ramps and the percentile→colour mapping. Every value here is traceable
 * to rscripts/build_scores.R, rscripts/analyze_marketplace_aptc.R or spec §6.4
 * — do not tune them for looks.
 */
import { LOSS_LAYERS } from '../config/layers';
import { colorRampPalette } from './colorRamp';
import { quantileSorted } from './stats';
/**
 * @typedef {import('../types').LayerKey} LayerKey
 */

const isLoss = (layer) => LOSS_LAYERS.includes(layer);

/** build_scores.R:334 — bins on the 0–1 percentile score. Six intervals. */
export const BINS_SCORE = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0];

/** build_scores.R:323–326 — anchors for each domain's sequential ramp. */
export const RAMP_ANCHORS = {
  d1: ['#F0F3F8', '#7793B8', '#0E3464'], // work requirements (navy)
  d2: ['#EEF6F7', '#9CC8CD', '#3F8E96'], // citizenship (teal)
  d3: ['#FDF2E1', '#F8CE87', '#F2A02F'], // access to work (amber)
  d4: ['#EAF4EE', '#87BE9C', '#288C46'], // socioeconomic need (green)
  // build_scores.R:329 cumulative-impact ramp, reused for the composite index.
  // Spec §6.4 calls the composite ramp "burgundy, 6 stops"; these are the four
  // anchors the R code uses, interpolated to whatever bin count is in play.
  composite: ['#F2F0EE', '#D9A29A', '#B44A3F', '#5A1D18'],
  /*
   * Burnt orange to brown. The two SNAP loss layers share it on purpose:
   * all-persons and children are the same measure on different denominators,
   * and one scale is what makes them comparable. Distinct from D3's amber,
   * which is yellower and never reaches brown, and from the composite's red.
   */
  loss: ['#F6EFE7', '#E6B88C', '#C0682B', '#5C2C10'],
  child_loss: ['#F6EFE7', '#E6B88C', '#C0682B', '#5C2C10'],
  // analyze_marketplace_aptc.R's county APTC map, its ramp_aptc.
  aca_aptc: ['#EEF6F7', '#9CC8CD', '#3F8E96'],
};

// ------------------------------------------------------------ class breaks

/** Steps of the "nice number" ladder within one power of ten. */
const NICE = [1, 2.5, 5, 10];

/**
 * Nearest number on the 1 / 2.5 / 5 × 10ⁿ ladder: 120 → 100, 331 → 250,
 * 703 → 500, 1956 → 2500. Zero and negatives round to 0.
 */
export function niceRound(v) {
  if (!(v > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const best = NICE.reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a));
  return best * p;
}

/** The next number up the ladder from a nice number: 100 → 250 → 500 → 1000. */
function niceAbove(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v) + 1e-9);
  const i = NICE.findIndex((n) => n * p > v + 1e-9);
  return NICE[i] * p;
}

/**
 * COUNT KEYS: quintile breaks rounded to nice numbers. Counts are heavily skewed — the median county lost ~450 people,
 * Harris ~139,000 — so equal-width classes put 248 of 254 counties in the
 * bottom one. Quintiles fix that but print odd edges (104, 229, 454…) that move
 * with every window; rounding keeps the even spread and makes the key readable
 * and quotable: 0 / 100 / 250 / 500 / 2,500 / max.
 *
 * @param {number[]} values
 * @param {number} [classes]
 * @returns {number[]} classes + 1 strictly increasing edges, 0 first, the max last.
 */
export function roundedQuantileBins(values, classes = 5) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  const max = sorted.length ? sorted[sorted.length - 1] : 1;
  const edges = [0];
  for (let i = 1; i < classes; i++) {
    let e = niceRound(quantileSorted(sorted, i / classes) ?? 0);
    // Two quintiles rounding to the same number would collapse a class.
    if (e <= edges[edges.length - 1]) e = niceAbove(edges[edges.length - 1]);
    edges.push(e);
  }
  edges.push(Math.max(max, edges[edges.length - 1] + 1));
  return edges;
}

/**
 * SHARE KEYS (share of caseload lost): five equal steps of whole percents from
 * 0 to the 98th percentile, the top class open to 100%. At a top of ~28% that reads 0 / 6 / 12 / 18 / 24 / 100.
 *
 * The 98th percentile rather than the maximum, so one tiny county that lost
 * three quarters of a forty-child caseload does not stretch every class. Still
 * recomputed for the window on screen, so a short window keeps its contrast.
 *
 * @param {number[]} shares - 0–1 fractions.
 * @param {number} [classes]
 */
export function equalShareBins(shares, classes = 5) {
  const sorted = shares.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  const top = sorted.length ? quantileSorted(sorted, 0.98) : 0.25;
  const step = Math.max(1, Math.ceil((top * 100) / classes)) / 100;
  const edges = Array.from({ length: classes }, (_, i) => Number((i * step).toFixed(4)));
  edges.push(1);
  return edges;
}

/**
 * The Insights map's classes: share of the caseload lost, in equal 3-point
 * steps with open ends, the same on every map so a colour means the same
 * percent for a county and for a district. Centred on the statewide loss
 * (about 20%), where the counties and districts cluster.
 */
export const BINS_INSIGHTS_LOSS = [0, 0.12, 0.15, 0.18, 0.21, 0.24, 1];

/**
 * Spec §6.4 — the composite index is rebinned because it sums four percentiles
 * onto a 0–4 range with a very different distribution than a single domain.
 */
export const BINS_COMPOSITE = [0.8, 1.35, 1.65, 1.85, 2.05, 2.27, 2.66, 3.4];

/** analyze_marketplace_aptc.R's bins_aptc: APTC consumers per 1,000 residents. Seven classes. */
export const BINS_ACA = [0, 50, 75, 100, 125, 150, 200, Infinity];

/** A loss layer's bands before any window is known: 5 classes of 8 points. */
const BINS_LOSS_DEFAULT = [0, 0.08, 0.16, 0.24, 0.32, 1];

/**
 * Thresholds for a layer: the composite and the Marketplace layer have their own.
 *
 * A loss layer's bands depend on the window, which this signature knows nothing
 * about, so it returns a default. Callers drawing a loss layer pass the real
 * bands explicitly — see LayerValues.bins and equalShareBins.
 */
export function binsFor(layer) {
  if (isLoss(layer)) return BINS_LOSS_DEFAULT;
  if (layer === 'aca_aptc') return BINS_ACA;
  return layer === 'composite' ? BINS_COMPOSITE : BINS_SCORE;
}

/**
 * Colours for a layer, one per bin interval.
 *
 * `classes` defaults to the layer's own bins; a caller with other edges (the
 * count keys, the window's loss bands) passes their count, so the ramp always
 * has one colour per class.
 *
 * NOTE: build_scores.R generates 7 colours per domain but bins_score defines only
 * 6 intervals. We generate 6 — one per interval. Flagged for reconciliation with
 * the R side so the review maps and the dashboard cannot diverge.
 */
export function rampFor(layer, classes = binsFor(layer).length - 1) {
  const anchors = RAMP_ANCHORS[layer];
  if (!anchors) return [];
  return colorRampPalette(anchors, classes);
}

/**
 * Index of the bin a value falls in, or -1 when there is no value.
 * Intervals are [lo, hi) with the top interval closed, matching R's
 * include.lowest = TRUE on a right-open cut.
 */
export function binIndex(value, bins) {
  if (value == null || !Number.isFinite(value)) return -1;
  if (value < bins[0]) return 0; // clamp rather than drop
  for (let i = 1; i < bins.length; i++) {
    if (value < bins[i]) return i - 1;
  }
  return bins.length - 2;
}

/** Warm grey for "no value" — never a ramp colour, so absence reads as absence. */
export const NO_DATA = '#F0EDED';

export function colorFor(
  value,
  layer,
  /** Override for layers whose bands are not a function of the layer alone. */
  bins = binsFor(layer),
) {
  const ramp = rampFor(layer, bins.length - 1);
  const i = binIndex(value, bins);
  if (i < 0 || !ramp.length) return NO_DATA;
  return ramp[Math.min(i, ramp.length - 1)];
}

// ------------------------------------------------------------------ bivariate

/**
 * The 3x3 red-blue scheme for the bivariate work layer.
 *
 * NOT from build_scores.R — this layer does not exist on the R side, so it is
 * the one ramp in this file with no upstream to stay bit-identical to. R review
 * maps of this layer would need the same corners.
 *
 * The corners, and why these four:
 *
 *   lowLow    near-neutral, so "little of either" recedes
 *   highA     red   — a large share of the caseload newly subject
 *   highB     blue  — work is hard to reach
 *   highBoth  dark  — both at once, the corner the eye should land on
 *
 * THE TWO SINGLE-HIGH CORNERS ARE LUMINANCE-MATCHED ON PURPOSE — red #C13840
 * and blue #215E9E both sit at relative luminance 86, against 39 for the joint
 * corner and 231 for the neutral. With a darker red, a high-blue/low-red county
 * would read as nearly as urgent as a both-high one. Matching them means
 * lightness encodes only ONE thing: how much of both is going on. Check any
 * replacement corners against that before committing them.
 *
 * Nine classes, not sixteen: at 254 counties a 4x4 asks the reader to tell
 * apart colours that differ by a few RGB units. At 3x3 the closest adjacent
 * pair is ~58 units apart in RGB.
 *
 * The brief's framing is "red at one opacity over blue at another". Blending
 * two translucent layers over white is exactly a bilinear interpolation between
 * these corners, so that is what this computes — as one solid fill per county,
 * which keeps a single path per shape and avoids double-stroking every border.
 */
export const BIVARIATE_CORNERS = {
  lowLow: '#EAE7E5',
  highA: '#C13840',
  highB: '#215E9E',
  highBoth: '#37203F',
};

/** How many classes per axis. */
export const BIVARIATE_STEPS = 3;

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb) =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * The scheme as a matrix, indexed `[bBin][aBin]` — row 0 is the low end of the
 * blue axis, so the matrix reads bottom-up when rendered as a legend.
 */
export function bivariatePalette(steps = BIVARIATE_STEPS) {
  const ll = hexToRgb(BIVARIATE_CORNERS.lowLow);
  const ha = hexToRgb(BIVARIATE_CORNERS.highA);
  const hb = hexToRgb(BIVARIATE_CORNERS.highB);
  const hh = hexToRgb(BIVARIATE_CORNERS.highBoth);
  const last = Math.max(1, steps - 1);

  return Array.from({ length: steps }, (_, bi) => {
    const tb = bi / last;
    return Array.from({ length: steps }, (_, ai) => {
      const ta = ai / last;
      // Bilinear: interpolate along the A axis on both B edges, then between.
      return toHex(
        [0, 1, 2].map((c) => {
          const lowEdge = ll[c] + (ha[c] - ll[c]) * ta;
          const highEdge = hb[c] + (hh[c] - hb[c]) * ta;
          return lowEdge + (highEdge - lowEdge) * tb;
        }),
      );
    });
  });
}

/**
 * Colour for one county on the bivariate layer. Either value missing is
 * absence, not a low reading — a county with no D3 score is not a county where
 * work is easy to reach.
 */
export function bivariateColor(
  a,
  aBins,
  b,
  bBins,
  steps = BIVARIATE_STEPS,
) {
  const ai = binIndex(a, aBins);
  const bi = binIndex(b, bBins);
  if (ai < 0 || bi < 0) return NO_DATA;
  const grid = bivariatePalette(steps);
  return grid[Math.min(bi, steps - 1)][Math.min(ai, steps - 1)];
}

/**
 * Equal-count class breaks, as a bins array for binIndex.
 *
 * Quantile rather than fixed, because the bivariate axes are a modelled share
 * and a percentile — two distributions with no shared natural cut points, and a
 * fixed grid would leave most of the nine classes empty.
 */
export function quantileBins(values, classes) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!sorted.length) return Array.from({ length: classes + 1 }, (_, i) => i / classes);

  const out = [sorted[0]];
  for (let i = 1; i < classes; i++) out.push(quantileSorted(sorted, i / classes));
  out.push(sorted[sorted.length - 1]);

  // binIndex needs strictly increasing edges, and a tied distribution (every
  // county at zero, say) would otherwise collapse them.
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1e-9;
  }
  return out;
}
