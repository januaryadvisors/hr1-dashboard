/**
 * Bins, ramps and the percentile→colour mapping. Every value here is traceable
 * to rscripts/build_scores.R or to spec §6.4 — do not tune them for looks.
 */
import { colorRampPalette } from './colorRamp';
import type { LayerKey } from '../types';

/** build_scores.R:334 — bins on the 0–1 percentile score. Six intervals. */
export const BINS_SCORE = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0] as const;

/** build_scores.R:323–326 — anchors for each domain's sequential ramp. */
export const RAMP_ANCHORS: Record<string, readonly string[]> = {
  d1: ['#F0F3F8', '#7793B8', '#0E3464'], // work requirements (navy)
  d2: ['#EEF6F7', '#9CC8CD', '#3F8E96'], // citizenship (teal)
  d3: ['#FDF2E1', '#F8CE87', '#F2A02F'], // access to work (amber)
  d4: ['#EAF4EE', '#87BE9C', '#288C46'], // socioeconomic need (green)
  // build_scores.R:329 cumulative-impact ramp, reused for the composite index.
  // Spec §6.4 calls the composite ramp "burgundy, 6 stops"; these are the four
  // anchors the R code uses, interpolated to whatever bin count is in play.
  composite: ['#F2F0EE', '#D9A29A', '#B44A3F', '#5A1D18'],
  // d5 (Children) has no source column — see spec §3 warning. No ramp assigned.
};

/**
 * Spec §6.4 — the composite index is rebinned because it sums four percentiles
 * onto a 0–4 range with a very different distribution than a single domain.
 */
export const BINS_COMPOSITE = [0.8, 1.35, 1.65, 1.85, 2.05, 2.27, 2.66, 3.4] as const;

/** build_scores.R:478 — integer bins for cumulative_impact 0…4. */
export const BINS_CUMULATIVE = [-0.5, 0.5, 1.5, 2.5, 3.5, 4.5] as const;

/** Thresholds for a layer: the composite has its own rebin. */
export function binsFor(layer: LayerKey): readonly number[] {
  return layer === 'composite' ? BINS_COMPOSITE : BINS_SCORE;
}

/**
 * Colours for a layer, one per bin interval.
 *
 * NOTE: build_scores.R generates 7 colours per domain but bins_score defines only
 * 6 intervals. We generate 6 — one per interval. Flagged for reconciliation with
 * the R side so the review maps and the dashboard cannot diverge.
 */
export function rampFor(layer: LayerKey): string[] {
  const anchors = RAMP_ANCHORS[layer];
  if (!anchors) return [];
  return colorRampPalette(anchors, binsFor(layer).length - 1);
}

/**
 * Index of the bin a value falls in, or -1 when there is no value.
 * Intervals are [lo, hi) with the top interval closed, matching R's
 * include.lowest = TRUE on a right-open cut.
 */
export function binIndex(value: number | null | undefined, bins: readonly number[]): number {
  if (value == null || !Number.isFinite(value)) return -1;
  if (value < bins[0]) return 0; // clamp rather than drop
  for (let i = 1; i < bins.length; i++) {
    if (value < bins[i]) return i - 1;
  }
  return bins.length - 2;
}

/** Warm grey for "no value" — never a ramp colour, so absence reads as absence. */
export const NO_DATA = '#F0EDED';

export function colorFor(value: number | null | undefined, layer: LayerKey): string {
  const bins = binsFor(layer);
  const ramp = rampFor(layer);
  const i = binIndex(value, bins);
  if (i < 0 || !ramp.length) return NO_DATA;
  return ramp[Math.min(i, ramp.length - 1)];
}

/** Quintile 1–5 from a 0–1 percentile. Mirrors build_scores.R's tier(). */
export function quintile(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  return Math.min(5, Math.floor(p * 5) + 1);
}
