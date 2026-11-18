/**
 * What the map can show.
 *
 *   DOMAINS      the four scored domains of the vulnerability index
 *   LAYERS       each value the map can colour counties by
 *   VIEWS        the story's chapters: each maps one or two layers
 *   INFRA_TYPES  the assistance registries drawn on the index view
 *
 * Colours live in src/lib/scales.js, not here.
 *
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').ViewKey} ViewKey
 */
import { fmtMonthBody } from '../lib/format';

/**
 * How a layer gets its value.
 *
 *   'score'      a stored percentile column (d1_score … composite)
 *   'window'     computed from the brush window (src/lib/layerValues.js)
 *   'bivariate'  two values per county on one red-blue scheme, no single ramp
 *   'rate'       a stored value on its own scale, with its own field and format
 *
 * @typedef {'score' | 'window' | 'bivariate' | 'rate'} LayerBasis
 */

/**
 * @typedef {Object} DomainDef
 * @property {'d1' | 'd2' | 'd3' | 'd4'} key
 * @property {string} label - Metric-toggle / card title.
 * @property {string} formalName - The map's title and the story's index recipe.
 * @property {string} metricLabel - The scatter's metric picker (config/metrics.js).
 * @property {string} metricAxis - The scatter's axis title.
 * @property {string[]} measures - What goes into the domain, in plain words; its length is the component count.
 */

/** The four scored domains of the index, in framework order — rscripts/build_scores.R. */
export const DOMAINS = [
  {
    key: 'd1',
    label: 'Work requirements',
    formalName: 'Work-requirement exposure',
    metricLabel: 'Work-requirement exposure',
    metricAxis: 'D1 exposure',
    measures: [
      'SNAP enrollees newly subject to work rules',
      'households newly subject',
      'veterans on SNAP',
      'students experiencing homelessness',
      'youth aging out of foster care',
    ],
  },
  {
    key: 'd2',
    label: 'Citizenship',
    formalName: 'Citizenship and status',
    metricLabel: 'D2 — citizenship and status',
    metricAxis: 'D2 citizenship',
    measures: [
      'non-citizens on SNAP',
      'non-citizen households',
      'mixed-status households',
      'limited-English households',
    ],
  },
  {
    key: 'd3',
    label: 'Access to work',
    formalName: 'Access to work',
    metricLabel: 'Work is harder to reach',
    metricAxis: 'D3 access to work',
    measures: [
      'residents working in their own county',
      'jobs per worker',
      'households without a vehicle',
      'households without internet',
      'unemployment',
      'low-wage job mix',
      'average weekly wage',
    ],
  },
  {
    key: 'd4',
    label: 'Socioeconomic Need',
    formalName: 'Socioeconomic need',
    metricLabel: 'D4 — socioeconomic need',
    metricAxis: 'D4 socioeconomic need',
    measures: ['residents below 165% of the poverty line', 'adults without a high-school diploma'],
  },
];

export const domainByKey = (key) => DOMAINS.find((d) => d.key === key);

/** A domain's identity as LayerDef fields. */
function domainLayer(key) {
  const d = domainByKey(key);
  return { key: d.key, label: d.label, formalName: d.formalName, components: d.measures.length };
}

/**
 * One axis of a bivariate layer.
 *
 * @typedef {Object} BivariateAxis
 * @property {string} label - Legend axis label. Must state the direction, or the map lies.
 * @property {string} highLabel - The end of the axis the colour saturates toward.
 */

/**
 * @typedef {Object} LayerDef
 * @property {LayerKey} key
 * @property {string} label - Short name, for toggles and cards.
 * @property {string} formalName - The map's title.
 * @property {string} [copy] - A paragraph under the map, only where the map cannot speak for itself.
 * @property {number | null} components - How many measures make up the layer. null where unsourced.
 * @property {'newly_subject_persons' | 'noncit_snap_persons' | 'aptc_consumers' | null} countField - The count-measure field, or null where the layer has no count basis.
 * @property {string} [noCountReason] - Why there is no count, shown in place of a count map.
 * @property {LayerBasis} [basis] - Defaults to 'score'.
 * @property {'snap_enrolled' | 'snap_children'} [seriesField] - Window layers only: the monthly County series the loss is measured on.
 * @property {string} [countLabel] - Legend heading in count measure, where `countField` does not name it.
 * @property {number[]} [countBins] - Fixed count-measure class edges, lowest first (the top class is open).
 *   Overrides the rounded quintiles countBinsFor otherwise computes.
 * @property {[BivariateAxis, BivariateAxis]} [axes] - Bivariate layers only: the red axis then the blue axis.
 * @property {string} [field] - Rate layers only: the County field the fill reads.
 * @property {(v: number) => string} [format] - Rate layers only: the value as display text.
 * @property {string} [rateLabel] - Rate layers only: the legend heading in rate measure.
 * @property {number} [rankFloor] - Window layers, rate measure: counties with a smaller starting
 *   caseload are left out of "Top affected counties" (a county of 40 losing 20 reads −50%).
 */

export const LAYERS = [
  {
    key: 'loss',
    label: 'Benefits lost',
    formalName: 'Where Texans are losing SNAP',
    components: null,
    countField: null,
    basis: 'window',
    seriesField: 'snap_enrolled',
    countLabel: 'People no longer on SNAP',
    // Round, fixed breaks rather than quintiles, whose lowest classes were a few hundred people wide.
    countBins: [0, 500, 1000, 5000, 10000],
    rankFloor: 1000,
  },
  {
    key: 'child_loss',
    label: 'Children losing benefits',
    formalName: 'Children losing SNAP',
    components: null,
    countField: null,
    basis: 'window',
    seriesField: 'snap_children',
    countLabel: 'Children no longer on SNAP',
    // Half of everyone's breaks: children are about half the caseload, so on
    // the same breaks most counties would share the lightest class.
    countBins: [0, 250, 500, 2500, 5000],
    rankFloor: 100,
  },
  {
    // Marketplace enrollees with a premium tax credit per 1,000 residents, at the latest
    // open enrollment (rscripts/analyze_marketplace_aptc.R). Exposure: there is no county loss series.
    key: 'aca_aptc',
    label: 'Marketplace subsidies',
    formalName: 'Who depends on the Marketplace tax credit',
    components: null,
    basis: 'rate',
    field: 'aptc_per_1k',
    format: (v) => v.toFixed(0),
    rateLabel: 'Subsidised enrollees per 1,000 residents',
    countField: 'aptc_consumers',
    countLabel: 'Subsidised Marketplace enrollees',
  },
  {
    ...domainLayer('d1'),
    countField: 'newly_subject_persons',
    // 0–500, 500–1,000, 1,000–10,000, 10,000+.
    countBins: [0, 500, 1000, 10000],
  },
  {
    ...domainLayer('d4'),
    copy:
      'Baseline need: the share of residents below 165% of the federal poverty level and the ' +
      'share of adults without a high-school credential. Only two components, so this layer ' +
      'moves less than the others and should be read as context rather than exposure.',
    countField: null,
    noCountReason:
      'D4 is built from two population shares. There is no count of people “in socioeconomic need” ' +
      'to map — inventing a denominator would invent a finding.',
  },
  {
    ...domainLayer('d3'),
    copy:
      'Whether meeting a work requirement is practical where someone lives: in-county employment ' +
      'share, jobs per worker, vehicle and internet access, unemployment, the low-wage mix, and ' +
      'average weekly wage. Seven components, the widest of the four domains.',
    countField: null,
    noCountReason:
      'D3 combines seven rates describing local labour-market conditions. No count basis exists.',
  },
  {
    key: 'work_both',
    label: 'Both at once',
    formalName: 'Work-requirement exposure against reachable work',
    copy:
      'Two measures on one map. Red is the share of a county’s SNAP caseload newly subject to the ' +
      'work requirement. Blue is how hard work is to reach there — D3’s seven labour-market ' +
      'components, from jobs per worker to vehicle and internet access. Counties in the darkest ' +
      'corner have both at once: a large exposed caseload and the least practical conditions for ' +
      'meeting the requirement. The newly-subject estimate is PUMS-modelled, not a lookup.',
    components: 8,
    countField: null,
    basis: 'bivariate',
    // Both axes point toward difficulty, so the darkest corner is trouble on both counts.
    axes: [
      { label: 'Share of caseload newly subject', highLabel: 'More exposed' },
      { label: 'Work is harder to reach (D3)', highLabel: 'Harder' },
    ],
    noCountReason:
      'This layer draws two measures at once. A proportional symbol has one size, so there is ' +
      'nothing for it to encode here — switch to a single metric for a count.',
  },
  {
    ...domainLayer('d2'),
    copy:
      'Households affected by H.R. 1’s eligibility restrictions tied to immigration status, ' +
      'including mixed-status households and households with limited English proficiency. This ' +
      'layer runs opposite D1 (r = −0.30) — the counties most exposed here are not the ones most ' +
      'exposed to work requirements.',
    countField: 'noncit_snap_persons',
  },
  {
    key: 'composite',
    label: 'Vulnerability Index',
    formalName: 'Composite vulnerability index',
    components: 4,
    countField: null,
    noCountReason:
      'The composite sums four percentiles. A count of a percentile sum is not a quantity of anything.',
  },
];

/** The percentile layers: the ones the index tooltip lists. */
export const SCORE_LAYERS = LAYERS.filter((l) => basisOf(l) === 'score');

/** The layers computed from the brush window. */
export const LOSS_LAYERS = LAYERS.filter((l) => basisOf(l) === 'window').map((l) => l.key);

export const layerByKey = (key) =>
  LAYERS.find((l) => l.key === key) ?? LAYERS[0];

function basisOf(l) {
  return l.basis ?? 'score';
}

export const layerBasis = (key) => basisOf(layerByKey(key));

/** The field a layer's fill reads, or null for a window layer (computed, not stored). */
export function scoreFieldOrNull(key) {
  const def = layerByKey(key);
  if (basisOf(def) === 'window') return null;
  if (def.field) return def.field;
  return key === 'composite' ? 'vulnerability_score' : `${key}_score`;
}

/** The score field a layer reads for its fill. Score layers only. */
export function scoreField(key) {
  const field = scoreFieldOrNull(key);
  if (!field) throw new Error(`${key} is a window layer and has no score field`);
  return field;
}

/** Whether the layer has a real count for the count measure. */
export function hasCountBasis(key) {
  const l = layerByKey(key);
  return basisOf(l) === 'window' || l.countField != null;
}

/** Legend heading in count measure. */
export function countLabelFor(key) {
  const l = layerByKey(key);
  return l.countLabel ?? l.label;
}

// ----------------------------------------------------------------------- views

/**
 * What the county tooltip shows on a view.
 *
 * @typedef {Object} TooltipSpec
 * @property {boolean} domains - All five index scales (the index view only).
 * @property {boolean} capacity - The assistance registries as columns (the index view only).
 * @property {'enrollment' | 'exposure' | 'none'} chart - The caseload sparkline, the work-rule bars, or none.
 * @property {'enrollment' | 'index'} stats - Enrollment facts in the reader's measure, or the index view's headcounts.
 */

/**
 * @typedef {Object} ViewDef
 * @property {ViewKey} key
 * @property {string} label - Chapter card title.
 * @property {string} blurb - One line under the card title.
 * @property {LayerKey[]} metrics - The layers this view can map; the first is the default, and more than one
 *   adds a Metric toggle.
 * @property {boolean} showCapacity - Whether the assistance marks, their key and the gap overlay draw (the index only).
 * @property {TooltipSpec} tooltip - What the county tooltip shows here.
 */

export const VIEWS = [
  {
    key: 'loss',
    label: 'SNAP benefits lost',
    blurb: 'Where people are leaving SNAP',
    metrics: ['loss'],
    showCapacity: false,
    tooltip: { domains: false, capacity: false, chart: 'enrollment', stats: 'enrollment' },
  },
  {
    key: 'work',
    label: 'H.R. 1 work requirements',
    blurb: 'Who is newly subject, and whether work is reachable',
    // One metric, so no Metric toggle. The d3 and work_both layers stay defined but unshown.
    metrics: ['d1'],
    showCapacity: false,
    tooltip: { domains: false, capacity: false, chart: 'exposure', stats: 'enrollment' },
  },
  {
    key: 'vulnerability',
    label: 'Vulnerability index',
    blurb: 'The composite, with the assistance capacity on top',
    metrics: ['composite'],
    showCapacity: true,
    tooltip: { domains: true, capacity: true, chart: 'none', stats: 'index' },
  },
  {
    key: 'aca',
    label: 'ACA Marketplace',
    blurb: 'Where Marketplace coverage leans on the premium tax credit',
    metrics: ['aca_aptc'],
    showCapacity: false,
    tooltip: { domains: false, capacity: false, chart: 'none', stats: 'enrollment' },
  },
  {
    key: 'children',
    label: 'Children losing benefits',
    blurb: 'SNAP benefits lost, children under 18',
    // 'loss' second: the map's "Show children only" switch turned off.
    metrics: ['child_loss', 'loss'],
    showCapacity: false,
    tooltip: { domains: false, capacity: false, chart: 'enrollment', stats: 'enrollment' },
  },
];

export const viewByKey = (key) =>
  VIEWS.find((v) => v.key === key) ?? VIEWS[0];

/** The view a layer belongs to; a layer no view shows falls back to the first. */
export function viewForLayer(layer) {
  return VIEWS.find((v) => v.metrics.includes(layer)) ?? VIEWS[0];
}

/** The layer a view opens on. */
export const defaultLayerFor = (key) => viewByKey(key).metrics[0];

/**
 * The assistance registries, from capacity_county.
 *
 *   available: false  not sourced yet: every county is null, nothing draws, and
 *                     it is named "not yet sourced" so no mark reads as zero
 *   partial: true     only some sources report (food banks: 4 of 21); an
 *                     uncovered county is null and draws grey, never zero
 *   banded: true      a position in meta.chw_bands, since DSHS publishes ranges
 *   scaleMax          a fixed top for the bar scale (the busiest county still wins)
 *
 * Partial and banded registries stay out of the per-10k capacity metric.
 */
export const INFRA_TYPES = [
  {
    key: 'food_bank',
    shortLabel: 'Food banks serving county',
    longLabel: 'Number of food banks serving county residents',
    label: 'Food bank',
    plural: 'Food banks',
    glyph: 'square',
    source: 'Feeding Texas member food banks that served at least one household in the county',
    available: true,
    partial: true,
    // With 4 of 21 banks reporting, today's maximum is not "full".
    scaleMax: 5,
  },
  {
    key: 'cms_navigator',
    shortLabel: 'CMS navigators',
    label: 'CMS-funded navigator',
    plural: 'CMS-funded navigators',
    glyph: 'circle',
    source: 'CMS 2025–26 awardees, counties served',
    available: true,
  },
  {
    key: 'chw',
    shortLabel: 'Certified Community Health Workers',
    label: 'Certified community health workers',
    plural: 'Certified Community Health Workers',
    glyph: 'diamond',
    source:
      'DSHS annual report, certified community health workers by county — a range read from its map, exact for the top five',
    available: true,
    banded: true,
  },
  {
    key: 'cpp',
    shortLabel: 'Community Partner Program sites',
    label: 'Community partner site',
    plural: 'Community Partner Program sites',
    glyph: 'plus',
    source: 'HHSC Community Partner Program sites offering application help and case management (levels 3–4)',
    available: true,
  },
];

/** The sourced registries: what the bars draw, each on its own scale. */
export const COUNT_INFRA = INFRA_TYPES.filter((t) => t.available).map((t) => t.key);

/** Complete counts of organisations or sites: what the capacity metric sums. */
export const SCORED_INFRA = INFRA_TYPES.filter((t) => t.available && !t.partial && !t.banded).map(
  (t) => t.key,
);

/**
 * Food-bank coverage as the copy quotes it, read from statewide.meta.foodbank
 * so it updates with the data.
 *
 * @param {{ period: [string, string]; banks_reporting: string[]; banks_total: number | null; counties_with_data: number } | undefined} fb
 * @returns {{ period: string; banks: string; counties: number | null }}
 */
export function foodbankCoverage(fb) {
  if (!fb) return { period: '', banks: '', counties: null };
  const n = fb.banks_reporting.length;
  return {
    period: `${fmtMonthBody(fb.period[0])} – ${fmtMonthBody(fb.period[1])}`,
    banks: `${n}${fb.banks_total ? ` of ${fb.banks_total}` : ''} food bank${n === 1 && !fb.banks_total ? '' : 's'} reporting`,
    counties: fb.counties_with_data,
  };
}
