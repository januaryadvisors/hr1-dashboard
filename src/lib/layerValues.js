/**
 * One place that turns (counties, layer, window) into the numbers a map draws.
 *
 * A loss layer's value is enrollment change across the brush window, which is
 * not a column and changes every time the brush moves. Rather than teach the map
 * about windows, the page computes the values here and hands them down — so the
 * hero map, the thumbnails, the rank list and the search results all read one
 * set of values and cannot disagree.
 */
import { layerBasis, layerByKey, scoreFieldOrNull } from '../config/layers';
import { binsFor, BIVARIATE_STEPS, equalShareBins, quantileBins, roundedQuantileBins } from './scales';
import { fmtPct, fmtPercentile } from './format';
import { lossShare, lostCount, windowEnds } from './series';
/**
 * @typedef {import('../types').County} County
 * @typedef {import('../types').LayerKey} LayerKey
 */

/**
 * @typedef {Object} LayerValues
 * @property {Map<string, number | null>} fill - Fill value per county, on the layer's own scale. null where there is none.
 * @property {Map<string, number> | null} count - Count basis per county — people, for the proportional-symbol map. null for
 *   the whole layer where no count basis exists (C-03).
 * @property {number} maxCount - Largest count in the selection, for the nested-circle legend.
 * @property {readonly number[]} bins - The bin thresholds these values should be coloured with.
 *   Carried alongside the values because a loss layer's bands are anchored to
 *   the statewide loss over the SAME window — so the bands and the values have
 *   to travel together or the map colours one window's numbers with another
 *   window's scale.
 * @property {number} statewideShare - Statewide loss over the window, as a fraction of its own start caseload.
 *   Zero on a score layer. The legend prints it so the anchor is visible.
 * @property {{ fill: Map<string, number | null>; bins: readonly number[]; }} [secondary] - The second axis of a bivariate layer, absent on every other layer.
 *   Its presence is what tells <CountyMap> to colour from the red-blue scheme
 *   instead of a ramp — the map does not need to know which layer keys are
 *   bivariate, only that it was handed two axes.
 */

/**
 * Loss as a share of the window-start caseload, and the headcount behind it.
 *
 * A county whose caseload GREW over the window contributes zero, not a negative:
 * this layer answers "where are people losing benefits", and a diverging scale
 * would spend half its ink on the handful of counties going the other way. The
 * panel copy says so, and the tooltip still shows the true signed change.
 */
function lossLayerValues(
  counties,
  series,
  i0,
  i1,
) {
  const fill = new Map();
  const count = new Map();
  let maxCount = 0;
  // Summed from the counties rather than read off statewide.json, so the anchor
  // is the same population the map is drawing — and so the child layer gets a
  // child-caseload anchor rather than an all-persons one.
  let stateStart = 0;
  let stateEnd = 0;

  for (const c of counties) {
    const ends = windowEnds(c[series], i0, i1);
    if (!ends) {
      // A missing series reads as absence, not as zero loss — NO_DATA grey.
      fill.set(c.geoid, null);
      continue;
    }
    const lost = lostCount(ends);
    fill.set(c.geoid, lossShare(ends));
    count.set(c.geoid, lost);
    if (lost > maxCount) maxCount = lost;
    stateStart += ends.start;
    stateEnd += ends.end;
  }

  const statewideShare = lossShare({ start: stateStart, end: stateEnd }) ?? 0;

  const bins = equalShareBins([...fill.values()].filter((v) => v != null));
  return { fill, count, maxCount, bins, statewideShare };
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
function workBivariate(counties, i0) {
  const fill = new Map();
  const secondaryFill = new Map();

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

  const aValues = [...fill.values()].filter((v) => v != null);
  const bValues = [...secondaryFill.values()].filter((v) => v != null);

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
  counties,
  layer,
  i0,
  i1,
) {
  const def = layerByKey(layer);
  const basis = layerBasis(layer);

  if (basis === 'bivariate') return workBivariate(counties, i0);
  if (basis === 'window') {
    return lossLayerValues(counties, def.seriesField ?? 'snap_enrolled', i0, i1);
  }

  const field = scoreFieldOrNull(layer);
  const fill = new Map();
  const countField = def.countField;
  const count = countField ? new Map() : null;
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
 * A layer's value as display text. The scales differ in unit and must not be
 * formatted alike: a percentile is `p61`, the composite is a 0–4 sum, a loss
 * share is a percent of caseload, and a rate layer says its own.
 */
export function formatLayerValue(layer, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const basis = layerBasis(layer);
  if (basis === 'window') return `−${fmtPct(value, 1)}`;
  if (basis === 'rate') return layerByKey(layer).format(value);
  // A bivariate layer's primary axis is a share of caseload, unsigned.
  if (basis === 'bivariate') return fmtPct(value, 1);
  if (layer === 'composite') return value.toFixed(2);
  return fmtPercentile(value);
}

/**
 * Class breaks for a COUNT choropleth: five quintile classes, their edges
 * rounded to nice numbers (roundedQuantileBins), not equal-interval.
 *
 * County headcounts are heavily skewed — Harris carries more SNAP recipients
 * than the smallest hundred counties combined — so equal-interval breaks put
 * essentially every county in the bottom band and the map says nothing. Quintile
 * breaks put about the same number of counties in each colour instead, and the
 * rounding keeps the key's numbers ones a reader can quote.
 *
 * Shared by <CountyMap>, which colours with them, and <RampLegend>, which prints
 * their edges. The two must not compute this separately: a legend whose numbers
 * come from a different binning than the map is worse than no legend.
 *
 * @param {LayerValues} values
 * @param {LayerKey} layer
 * @returns {readonly number[] | null} null when the layer has no count basis.
 */
export function countBinsFor(values, layer) {
  if (!values.count || values.count.size === 0) return null;
  // A layer with fixed breaks keeps them; the top class runs to the largest county.
  const fixed = layerByKey(layer).countBins;
  if (fixed) return [...fixed, Math.max(values.maxCount ?? 0, fixed[fixed.length - 1] + 1)];
  return roundedQuantileBins([...values.count.values()], 5);
}
