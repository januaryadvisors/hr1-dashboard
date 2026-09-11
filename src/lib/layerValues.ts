/**
 * One place that turns (counties, layer, window) into the numbers a map draws.
 *
 * Before the 2026-09-10 view rework every layer was a stored percentile, so
 * <CountyMap> could read `county[scoreField(layer)]` itself. The two loss layers
 * broke that: their value is enrollment change across the brush window, which is
 * not a column and changes every time the brush moves. Rather than teach the map
 * about windows, the page computes both maps here and hands them down — so the
 * hero map, the four thumbnails, the rank list and the search results are all
 * reading one set of values and cannot disagree.
 */
import { layerBasis, layerByKey, scoreFieldOrNull } from '../config/layers';
import { binsFor, binsForLoss, BIVARIATE_STEPS, quantileBins } from './scales';
import { fmtInt, fmtPct, fmtPercentile } from './format';
import type { County, LayerKey } from '../types';

export interface LayerValues {
  /** Fill value per county, on the layer's own scale. null where there is none. */
  fill: Map<string, number | null>;
  /**
   * Count basis per county — people, for the proportional-symbol map. null for
   * the whole layer where no count basis exists (C-03).
   */
  count: Map<string, number> | null;
  /** Largest count in the selection, for the nested-circle legend. */
  maxCount: number;
  /**
   * The bin thresholds these values should be coloured with.
   *
   * Carried alongside the values because a loss layer's bands are anchored to
   * the statewide loss over the SAME window — so the bands and the values have
   * to travel together or the map colours one window's numbers with another
   * window's scale.
   */
  bins: readonly number[];
  /**
   * Statewide loss over the window, as a fraction of its own start caseload.
   * Zero on a score layer. The legend prints it so the anchor is visible.
   */
  statewideShare: number;
  /**
   * The second axis of a bivariate layer, absent on every other layer.
   *
   * Its presence is what tells <CountyMap> to colour from the red-blue scheme
   * instead of a ramp — the map does not need to know which layer keys are
   * bivariate, only that it was handed two axes.
   */
  secondary?: {
    fill: Map<string, number | null>;
    bins: readonly number[];
  };
}

/**
 * Loss as a share of the window-start caseload, and the headcount behind it.
 *
 * A county whose caseload GREW over the window contributes zero, not a negative:
 * this layer answers "where are people losing benefits", and a diverging scale
 * would spend half its ink on the handful of counties going the other way. The
 * panel copy says so, and the tooltip still shows the true signed change.
 */
function windowLoss(
  counties: County[],
  series: 'snap_enrolled' | 'snap_children',
  i0: number,
  i1: number,
): LayerValues {
  const fill = new Map<string, number | null>();
  const count = new Map<string, number>();
  let maxCount = 0;
  // Summed from the counties rather than read off statewide.json, so the anchor
  // is the same population the map is drawing — and so the child layer gets a
  // child-caseload anchor rather than an all-persons one.
  let stateStart = 0;
  let stateEnd = 0;

  for (const c of counties) {
    const months = c[series];
    const start = months?.[i0];
    const end = months?.[i1];
    if (typeof start !== 'number' || typeof end !== 'number') {
      // A missing series reads as absence, not as zero loss — NO_DATA grey.
      fill.set(c.geoid, null);
      continue;
    }
    const lost = Math.max(0, start - end);
    // No caseload to lose is not the same as losing none of it.
    fill.set(c.geoid, start > 0 ? lost / start : null);
    count.set(c.geoid, lost);
    if (lost > maxCount) maxCount = lost;
    stateStart += start;
    stateEnd += end;
  }

  const statewideShare = stateStart > 0 ? Math.max(0, stateStart - stateEnd) / stateStart : 0;

  return { fill, count, maxCount, bins: binsForLoss(statewideShare), statewideShare };
}

/**
 * The bivariate work layer: exposure against reachable work.
 *
 * Red is `newly_subject_persons` as a share of the county's own caseload at the
 * window start, NOT as a share of population and NOT the raw count. A count
 * would put Harris in the top class on its own; a share of population is close
 * to a restatement of D1, since that is roughly how the estimate is built. The
 * share of caseload is the policy-relevant reading — how much of the people this
 * county is actually feeding now has to document work.
 *
 * Blue is D3 in its published direction, high = work harder to reach. See the
 * note on LAYERS.work_both.axes for why both axes point the same way.
 */
function workBivariate(counties: County[], i0: number): LayerValues {
  const fill = new Map<string, number | null>();
  const secondaryFill = new Map<string, number | null>();

  for (const c of counties) {
    const caseload = c.snap_enrolled?.[i0];
    const subject = c.newly_subject_persons;
    fill.set(
      c.geoid,
      typeof caseload === 'number' && caseload > 0 && typeof subject === 'number'
        ? subject / caseload
        : null,
    );
    secondaryFill.set(c.geoid, typeof c.d3_score === 'number' ? c.d3_score : null);
  }

  const aValues = [...fill.values()].filter((v): v is number => v != null);
  const bValues = [...secondaryFill.values()].filter((v): v is number => v != null);

  return {
    fill,
    count: null,
    maxCount: 0,
    bins: quantileBins(aValues, BIVARIATE_STEPS),
    statewideShare: 0,
    secondary: { fill: secondaryFill, bins: quantileBins(bValues, BIVARIATE_STEPS) },
  };
}

export function buildLayerValues(
  counties: County[],
  layer: LayerKey,
  i0: number,
  i1: number,
): LayerValues {
  const def = layerByKey(layer);
  const basis = layerBasis(layer);

  if (basis === 'bivariate') return workBivariate(counties, i0);
  if (basis === 'window') {
    return windowLoss(counties, def.seriesField ?? 'snap_enrolled', i0, i1);
  }

  const field = scoreFieldOrNull(layer);
  const fill = new Map<string, number | null>();
  const countField = def.countField;
  const count = countField ? new Map<string, number>() : null;
  let maxCount = 0;

  for (const c of counties) {
    const v = field ? c[field] : null;
    fill.set(c.geoid, typeof v === 'number' ? v : null);
    if (countField && count) {
      const n = c[countField];
      const num = typeof n === 'number' ? n : 0;
      count.set(c.geoid, num);
      if (num > maxCount) maxCount = num;
    }
  }

  return { fill, count, maxCount, bins: binsFor(layer), statewideShare: 0 };
}

/**
 * A layer's value as display text. Three scales, three units, and they must not
 * be formatted alike: a percentile is `p61`, the composite is a 0–4 sum, and a
 * loss share is a percent of caseload.
 */
export function formatLayerValue(layer: LayerKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const basis = layerBasis(layer);
  if (basis === 'window') return `−${fmtPct(value, 1)}`;
  // A bivariate layer's primary axis is a share of caseload, unsigned.
  if (basis === 'bivariate') return fmtPct(value, 1);
  if (layer === 'composite') return value.toFixed(2);
  return fmtPercentile(value);
}

/**
 * The same value as a 0–1 fraction, for the rank list's mini bar.
 *
 * A loss share is already 0–1 but only ever occupies its bottom fifth, so it is
 * normalised to the layer's own top band — otherwise every bar in the list is a
 * stub the reader cannot compare.
 */
export function fractionOf(layer: LayerKey, value: number, values?: LayerValues): number {
  if (layer === 'composite') return value / 4;
  if (layerBasis(layer) === 'bivariate') {
    const top = values?.bins[values.bins.length - 1] ?? 1;
    return top > 0 ? Math.min(1, value / top) : 0;
  }
  if (layerBasis(layer) === 'window') {
    const top = values?.bins[values.bins.length - 2] ?? 0.18;
    return top > 0 ? Math.min(1, value / top) : 0;
  }
  return value;
}

/** Right-hand label under a count legend, e.g. "12,400 people". */
export const fmtCount = fmtInt;
