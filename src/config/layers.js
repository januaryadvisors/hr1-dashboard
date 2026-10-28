/**
 * Domain, layer and view definitions.
 *
 * The strip shows VIEWS, each answering one question; the domain layers are
 * what a view reads rather than what the reader picks. See
 * docs/SPEC-DEVIATIONS.md §D3.
 *
 * DOMAINS the four scored domains of the index, named once
 * VIEWS   what the strip shows and the panel headers say
 * LAYERS  the value each view maps, in the framework's own vocabulary; the
 * tooltip lists all four domains
 *
 * Ramps live in src/lib/scales.js, traceable to build_scores.R. Do not put
 * colours here.
 *
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').ViewKey} ViewKey
 */
import { fmtMonthBody } from '../lib/format';

/**
 * How a layer gets its value.
 *
 * 'score'      a stored percentile column (d1_score … composite)
 * 'window'     recomputed from the brush window against a monthly series, so
 * there is no column to read — see src/lib/layerValues.js
 * 'bivariate'  TWO values per county, drawn as one red-blue scheme. Has no
 * single ramp, so it never goes through colorFor().
 * 'rate'       a stored value on its own fixed scale — not a percentile, so
 * it carries its own `field`, `format` and legend label
 *
 * @typedef {'score' | 'window' | 'bivariate' | 'rate'} LayerBasis
 */

/**
 * @typedef {Object} DomainDef
 * @property {'d1' | 'd2' | 'd3' | 'd4'} key
 * @property {string} label - Metric-toggle / card title.
 * @property {string} formalName - Map panel header (§6.5) and the story's index recipe.
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
 * @property {string} label - Metric-toggle / card title, matching the wireframe.
 * @property {string} formalName - Formal name for the map panel header (§6.5).
 * @property {string} [copy] - Layer-specific copy for the panel, only where it does work the map
 *   cannot do on its own: D3's component list, and the bivariate scheme's reading
 *   instructions. A paragraph on every view would sit between the reader and the
 *   map each time they switched. See docs/SPEC-DEVIATIONS.md §P1.
 * @property {number | null} components - Component count, rendered on every panel (§6.5). null where unsourced.
 * @property {'newly_subject_persons' | 'noncit_snap_persons' | 'aptc_consumers' | null} countField - The count-measure field, or null where the layer has no count basis (C-03).
 * @property {string} [noCountReason] - Why there is no count, shown in the C-03 panel.
 * @property {LayerBasis} [basis] - Defaults to 'score'.
 * @property {'snap_enrolled' | 'snap_children'} [seriesField] - Window layers only: the monthly County series the loss is measured on.
 * @property {string} [countLabel] - Legend heading in count measure, where `countField` does not name it.
 * @property {number[]} [countBins] - Fixed count-measure class edges, lowest first (the top class is open).
 *   Overrides the rounded quintiles countBinsFor otherwise computes.
 * @property {[BivariateAxis, BivariateAxis]} [axes] - Bivariate layers only: the red axis then the blue axis.
 * @property {string} [field] - Rate layers only: the County field the fill reads.
 * @property {(v: number) => string} [format] - Rate layers only: the value as display text.
 * @property {string} [rateLabel] - Rate layers only: the legend heading in rate measure.
 * @property {number} [rankFloor] - Window layers: in rate measure, counties whose caseload at the
 *   window start is under this are left out of the "Top affected counties" list. A county of 40
 *   that loses 20 reads −50% and would top every list on its denominator alone.
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
    rankFloor: 100,
  },
  {
    /*
     * ACA Marketplace consumers with an advance premium tax credit, per 1,000
     * residents, at the latest open enrollment — feeding-texas-hr1's own county
     * Marketplace measure (rscripts/analyze_marketplace_aptc.R), with its bins.
     * Exposure, not loss: the subsidised are the people whose coverage depends
     * on the tax credit. There is no county Marketplace loss series to map.
     */
    key: 'aca_aptc',
    label: 'Marketplace subsidies',
    formalName: 'Marketplace enrollees with a premium tax credit',
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
    /**
     * BOTH AXES POINT THE SAME WAY, toward difficulty.
     *
     * The ask was "red for people newly subject, blue for how reachable work
     * is". Drawn literally — blue rising with reachability — the darkest corner
     * of the scheme would be "many people exposed, and work is easy to reach",
     * which is not the corner anyone needs to find. D3 is published as a
     * vulnerability percentile (high = worse) and it stays in that direction, so
     * dark means trouble on both counts. The axis labels say so explicitly
     * rather than leaving the reader to infer a sign.
     */
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

/**
 * The scored layers — the ones the tooltip lists.
 *
 * The loss layers are excluded on purpose: they are not domain percentiles, so
 * "p61, 40th of 254" is not a sentence about them, and putting them in the
 * tooltip's domain grid would imply they belong to the index.
 */
export const SCORE_LAYERS = LAYERS.filter((l) => basisOf(l) === 'score');

/**
 * The windowed-loss layers (the `LossKey`s). They read a fraction of the
 * window-start caseload, not a percentile, so they get their own bins.
 */
export const LOSS_LAYERS = LAYERS.filter((l) => basisOf(l) === 'window').map((l) => l.key);

export const layerByKey = (key) =>
  LAYERS.find((l) => l.key === key) ?? LAYERS[0];

function basisOf(l) {
  return l.basis ?? 'score';
}

export const layerBasis = (key) => basisOf(layerByKey(key));

/**
 * The score field a layer reads for its fill, or null for a window layer — which
 * has no column at all; its values come from src/lib/layerValues.js.
 */
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

/** True where count measure has something real to size symbols by (C-03). */
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
 * What the county tooltip shows on a given view: only what answers that view's
 * own question.
 *
 * @typedef {Object} TooltipSpec
 * @property {boolean} domains - The other domains' bands, two-up under the focused one.
 *   True on the Vulnerability index only. That view's whole argument is that
 *   the four domains disagree, so the spread IS the content there; on the other
 *   three it is four extra percentiles nobody asked for.
 * @property {boolean} capacity - The four listed-assistance registries, as a column chart that matches the
 *   bars on the grid map. Capacity is the index view's story.
 * @property {'enrollment' | 'exposure' | 'none'} chart - The chart at the foot of the panel.
 *   'enrollment'  the caseload sparkline across the window
 *   'exposure'    caseload against newly-subject against who actually left
 *   'none'        no chart
 * @property {'enrollment' | 'index'} stats - Which facts head the tooltip.
 *   'enrollment'  residents, on SNAP, lost since the window start — counts, or
 *                 percentages under Rate. Every view but the index.
 *   'index'       on SNAP, change, population, food-bank households — all
 *                 headcounts, whatever the Rate/Count toggle says
 */

/**
 * @typedef {Object} ViewDef
 * @property {ViewKey} key
 * @property {string} label - Strip card title. Plain language — the strip is read before the panel.
 * @property {string} blurb - One line under the card title, so the strip explains itself.
 * @property {LayerKey[]} metrics - The layers this view can map. First is the default; a second entry raises a
 *   metric toggle in the panel head. Keep this short — the strip stops being
 *   four questions and becomes a layer picker again if a view grows a menu.
 * @property {boolean} showCapacity - Whether assistance-capacity marks, the mark key and the gap overlay draw.
 *   True on exactly one view: capacity is a reading of the vulnerability index,
 *   and on every view it would put four glyph types over every choropleth.
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
    metrics: ['d1', 'd3', 'work_both'],
    showCapacity: false,
    // The caseload line belongs to the loss views; here the question is how many
    // people the requirement reaches, so the panel ends on the exposure bars.
    tooltip: { domains: false, capacity: false, chart: 'exposure', stats: 'enrollment' },
  },
  {
    key: 'vulnerability',
    label: 'Vulnerability index',
    blurb: 'The composite, with the assistance capacity on top',
    metrics: ['composite'],
    showCapacity: true,
    // No chart: this panel already carries five index rows and the capacity
    // bars, and a caseload line would say nothing about the index.
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

/**
 * The view a layer belongs to.
 *
 * The mapping is a function, so the view does not need its own state field or
 * its own query param: `?layer=d3` opens the Work view on Access to work. d2
 * and d4 have no view of their own — they live in the tooltip — so they fall
 * back to the default.
 */
export function viewForLayer(layer) {
  return VIEWS.find((v) => v.metrics.includes(layer)) ?? VIEWS[0];
}

/** The layer a view opens on. */
export const defaultLayerFor = (key) => viewByKey(key).metrics[0];

/**
 * The four assistance registries, all sourced from capacity_county. In place of
 * §6.6's certified application counselors, HHSC's Community Partner Program —
 * sites that help people apply for SNAP and Medicaid — is the closer fit for
 * this dashboard.
 *
 * `available: false` means the registry has not been acquired and every county
 * carries null for it — not zero. Those types draw no marks, have no checkbox and
 * are named as "not yet sourced" wherever capacity is shown, so an absent mark
 * never reads as a confirmed absence. Flip the flag when the export fills the
 * column.
 *
 * `partial: true` (food bank) means only some of the registry's
 * sources report — 4 of Texas's 21 member food banks so far. The value is
 * still an organisation count (reporting banks serving the county), so it
 * draws as a bar like the others, but a county none of them covers is null
 * and draws GREY, never as zero. It stays out of the organisations-per-10k
 * metric until coverage is complete, as the R pipeline asks.
 *
 * `banded: true` (CHW) means the value is a POSITION in statewide
 * meta.chw_bands (1 = lowest range), not a count: DSHS publishes ranges.
 * Readers see the range label (county.chw_band); the bar height is the band.
 * It stays out of the per-10k metric, because a band cannot be summed.
 *
 * `plural` names the registry in keys ("CMS-funded navigators, 0–3").
 * `scaleMax`, where present, fixes the top of that registry's bar scale; the
 * busiest county still wins if it is higher, so no bar is ever clipped.
 * `longLabel`, where present, is the full name a column's hover text gives
 * when `shortLabel` has to fit a narrow bar-chart column.
 *
 * Sources carry no counts or dates that the data already knows: those come
 * from statewide.meta at render time (see foodbankCoverage below).
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
    // Fixed top rather than the busiest county's: with 4 of 21 banks reporting,
    // today's maximum would read as "full" when more banks are still to come.
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
    shortLabel: 'Certified CHWs',
    label: 'Certified community health workers',
    plural: 'Certified CHWs',
    glyph: 'diamond',
    source: 'DSHS annual report, certified CHWs by county — a range read from its map, exact for the top five',
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
 * Food-bank coverage as the titles quote it, from statewide.meta.foodbank —
 * so a new reporting period or another bank reporting changes the copy with
 * the data, not by hand.
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
