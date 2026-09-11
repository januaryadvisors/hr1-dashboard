/**
 * Bins, ramps and the percentile→colour mapping. Every value here is traceable
 * to rscripts/build_scores.R or to spec §6.4 — do not tune them for looks.
 */
import { colorRampPalette } from './colorRamp';
/**
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').LossKey} LossKey
 */

/**
 * The two windowed-loss layers. They read a fraction of the window-start
 * caseload, not a percentile, so they get their own bins — and they share one
 * ramp on purpose: the all-persons and children maps are the same measure on
 * different denominators, and a shared scale is what makes them comparable.
 */
export const LOSS_LAYERS = ['loss', 'child_loss'];

const isLoss = (layer) => (LOSS_LAYERS).includes(layer);

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
  // d5 (Children) has no source column — see spec §3 warning. No ramp assigned.
  /*
   * Plum, and NOT the burgundy of the hero number, which is what these layers
   * were first drawn in.
   *
   * Two reasons. The composite already owns burgundy, traceable to
   * build_scores.R's cumulative-impact ramp, and at thumbnail size a burgundy
   * loss map and a burgundy composite map are the same picture — three of the
   * four view cards became indistinguishable. And a grey or ink ramp, the other
   * obvious way to say "observed, not modelled", would collide with NO_DATA:
   * a pale county and an absent county have to stay tellable apart.
   *
   * Both loss layers share it, so the all-persons and children maps are read on
   * one scale.
   */
  loss: ['#F5F1F7', '#C2A7CF', '#7B4A96', '#3E1B4D'],
  child_loss: ['#F5F1F7', '#C2A7CF', '#7B4A96', '#3E1B4D'],
};

/**
 * Bands for a loss layer, as multiples of the STATEWIDE loss over the same
 * window.
 *
 * A fixed absolute scale cannot work here, because the brush is a first-class
 * control and loss grows with the length of the window: bands tuned to the full
 * policy window leave a six-month window uniformly pale, and bands tuned to six
 * months leave the full window uniformly black. Both are the same failure — the
 * reader loses all contrast between counties, which is the only thing the map is
 * for.
 *
 * Anchoring to the statewide rate makes the midpoint of the ramp "losing at the
 * same pace as Texas" at every window length, so the map always answers "who is
 * losing faster than the state" — and the headline number above it still carries
 * the absolute magnitude. The legend prints the resulting percentages, so the
 * reader is never shown a multiplier without the number behind it.
 */
export const LOSS_BAND_MULTIPLES = [0, 0.6, 0.8, 0.95, 1.1, 1.3];

/**
 * Loss bands for one window. `statewideShare` is the statewide loss as a
 * fraction of its own window-start caseload.
 *
 * Falls back to a flat spread when the state as a whole did not lose anyone —
 * every multiple of zero is zero, which would collapse the bins.
 */
export function binsForLoss(statewideShare) {
  if (!Number.isFinite(statewideShare) || statewideShare <= 0) {
    return [0, 0.02, 0.05, 0.08, 0.12, 0.18, 1.0];
  }
  // Final bound is 1.0: a county can at most lose its entire caseload.
  return [...LOSS_BAND_MULTIPLES.map((m) => m * statewideShare), 1.0];
}

/**
 * Spec §6.4 — the composite index is rebinned because it sums four percentiles
 * onto a 0–4 range with a very different distribution than a single domain.
 */
export const BINS_COMPOSITE = [0.8, 1.35, 1.65, 1.85, 2.05, 2.27, 2.66, 3.4];

/** build_scores.R:478 — integer bins for cumulative_impact 0…4. */
export const BINS_CUMULATIVE = [-0.5, 0.5, 1.5, 2.5, 3.5, 4.5];

/**
 * Thresholds for a layer: the composite has its own rebin.
 *
 * A loss layer's bands depend on the window, which this signature knows nothing
 * about, so it returns the zero-statewide fallback. Callers drawing a loss layer
 * pass the real bands explicitly — see LayerValues.bins.
 */
export function binsFor(layer) {
  if (isLoss(layer)) return binsForLoss(0);
  return layer === 'composite' ? BINS_COMPOSITE : BINS_SCORE;
}

/**
 * Colours for a layer, one per bin interval.
 *
 * NOTE: build_scores.R generates 7 colours per domain but bins_score defines only
 * 6 intervals. We generate 6 — one per interval. Flagged for reconciliation with
 * the R side so the review maps and the dashboard cannot diverge.
 */
export function rampFor(layer) {
  const anchors = RAMP_ANCHORS[layer];
  if (!anchors) return [];
  return colorRampPalette(anchors, binsFor(layer).length - 1);
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
  const ramp = rampFor(layer);
  const i = binIndex(value, bins);
  if (i < 0 || !ramp.length) return NO_DATA;
  return ramp[Math.min(i, ramp.length - 1)];
}

// ------------------------------------------------------------------ bivariate

/**
 * The 3x3 red-blue scheme for the bivariate work layer.
 *
 * NOT from build_scores.R — this layer does not exist on the R side. It is an
 * experiment requested on 2026-09-10, and it is the one ramp in this file with
 * no upstream to stay bit-identical to. If it is kept, the R review maps will
 * need the same corners.
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
 * corner and 231 for the neutral. The first draft used a darker red (L75) and
 * this blue, which made a high-blue/low-red county read as nearly as urgent as a
 * both-high one and wasted the scheme's whole point. Matching them means
 * lightness now encodes only ONE thing: how much of both is going on. Check any
 * replacement corners against that before committing them.
 *
 * Nine classes, not sixteen: at 254 counties a 4x4 asks the reader to tell
 * apart colours that differ by a few RGB units. At 3x3 the closest adjacent
 * pair is ~58 units apart in RGB.
 *
 * The requested framing was "red at one opacity over blue at another". Blending
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

  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const out = [sorted[0]];
  for (let i = 1; i < classes; i++) out.push(at(i / classes));
  out.push(sorted[sorted.length - 1]);

  // binIndex needs strictly increasing edges, and a tied distribution (every
  // county at zero, say) would otherwise collapse them.
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1e-9;
  }
  return out;
}

/** Quintile 1–5 from a 0–1 percentile. Mirrors build_scores.R's tier(). */
export function quintile(p) {
  if (p == null || !Number.isFinite(p)) return null;
  return Math.min(5, Math.floor(p * 5) + 1);
}
