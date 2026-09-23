/**
 * Layer and view definitions.
 *
 * Spec §6.4 put six layer cards in the strip — the four domains, the un-sourced
 * Children layer and the composite. Superseded on client direction 2026-09-10:
 * the strip is now FOUR VIEWS, each answering one question, and the domain
 * layers are what a view reads rather than what the reader picks. See
 * docs/SPEC-DEVIATIONS.md §D3.
 *
 * VIEWS   what the strip shows and the panel headers say
 * LAYERS  the value each view maps; still the framework's own vocabulary, and
 * still all four domains in the tooltip
 *
 * Ramps live in src/lib/scales.ts, traceable to build_scores.R. Do not put
 * colours here.
 *
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').ViewKey} ViewKey
 */

/**
 * How a layer gets its value.
 *
 * 'score'      a stored percentile column (d1_score … composite)
 * 'window'     recomputed from the brush window against a monthly series, so
 * there is no column to read — see src/lib/layerValues.ts
 * 'bivariate'  TWO values per county, drawn as one red-blue scheme. Has no
 * single ramp, so it never goes through colorFor().
 *
 * @typedef {'score' | 'window' | 'bivariate'} LayerBasis
 */

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
 * @property {string} [copy] - Layer-specific copy for the panel.
 *   §6.5 asks for "two to three sentences" on every layer. Dropped on client
 *   direction 2026-09-11 for the four primary views — the panel header was
 *   carrying a paragraph the reader had to scroll past to reach the map every
 *   time they switched view. Kept where the copy is doing work the map cannot do
 *   on its own: D3's component list, and the bivariate scheme's reading
 *   instructions. See docs/SPEC-DEVIATIONS.md §P1.
 * @property {number | null} components - Component count, rendered on every panel (§6.5). null where unsourced.
 * @property {'newly_subject_persons' | 'noncit_snap_persons' | null} countField - The count-measure field, or null where the layer has no count basis (C-03).
 * @property {string} [noCountReason] - Why there is no count, shown in the C-03 panel.
 * @property {boolean} available - False until a source column exists — see §3 warning and §12.
 * @property {string} [note] - Extra note for the strip card.
 * @property {LayerBasis} [basis] - Defaults to 'score'.
 * @property {'snap_enrolled' | 'snap_children'} [seriesField] - Window layers only: the monthly County series the loss is measured on.
 * @property {string} [countLabel] - Legend heading in count measure, where `countField` does not name it.
 * @property {[BivariateAxis, BivariateAxis]} [axes] - Bivariate layers only: the red axis then the blue axis.
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
    countLabel: 'People who left SNAP',
    available: true,
  },
  {
    key: 'child_loss',
    label: 'Children losing benefits',
    formalName: 'Children losing SNAP',
    components: null,
    countField: null,
    basis: 'window',
    seriesField: 'snap_children',
    countLabel: 'Children who left SNAP',
    available: true,
    note: 'County under-18 series from HHSC age bands; not in the §3 contract',
  },
  {
    /*
     * Observed HHSC Medicaid enrollment, on its own month axis.
     *
     * `medicaid_enrolled` is attached at load time from
     * public/data/medicaid-observed.json (see src/data/load.js) and aligned onto
     * the statewide month axis, so it indexes exactly like snap_enrolled. Months
     * HHSC never published are null, and a window that starts or ends on one
     * reads as no data rather than as no loss.
     */
    key: 'medicaid_loss',
    label: 'Medicaid coverage lost',
    formalName: 'Where Texans are losing Medicaid',
    components: null,
    countField: null,
    basis: 'window',
    seriesField: 'medicaid_enrolled',
    countLabel: 'People who left Medicaid',
    available: true,
  },
  {
    key: 'd1',
    label: 'Work requirements',
    formalName: 'D1 — Work-requirement exposure',
    components: 5,
    countField: 'newly_subject_persons',
    available: true,
  },
  {
    key: 'd4',
    label: 'Socioeconomic Need',
    formalName: 'D4 — Socioeconomic need',
    copy:
      'Baseline need: the share of residents below 165% of the federal poverty level and the ' +
      'share of adults without a high-school credential. Only two components, so this layer ' +
      'moves less than the others and should be read as context rather than exposure.',
    components: 2,
    countField: null,
    noCountReason:
      'D4 is built from two population shares. There is no count of people “in socioeconomic need” ' +
      'to map — inventing a denominator would invent a finding.',
    available: true,
  },
  {
    key: 'd3',
    label: 'Access to work',
    formalName: 'D3 — Access to work',
    copy:
      'Whether meeting a work requirement is practical where someone lives: in-county employment ' +
      'share, jobs per worker, vehicle and internet access, unemployment, the low-wage mix, and ' +
      'average weekly wage. Seven components, the widest of the four domains.',
    components: 7,
    countField: null,
    noCountReason:
      'D3 combines seven rates describing local labour-market conditions. No count basis exists.',
    available: true,
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
    available: true,
  },
  {
    key: 'd2',
    label: 'Citizenship',
    formalName: 'D2 — Citizenship and status',
    copy:
      'Households affected by H.R. 1’s eligibility restrictions tied to immigration status, ' +
      'including mixed-status households and households with limited English proficiency. This ' +
      'layer runs opposite D1 (r = −0.30) — the counties most exposed here are not the ones most ' +
      'exposed to work requirements.',
    components: 4,
    countField: 'noncit_snap_persons',
    available: true,
    note: 'Runs opposite D1 at r = −0.30',
  },
  {
    key: 'd5',
    label: 'Children',
    formalName: 'D5 — Children',
    copy: 'Not yet defined.',
    components: null,
    countField: null,
    // §3 warning: there is no d5_* column in vulnerability_county.csv, and the
    // spec forbids synthesising one from the statewide SNAP age bands.
    available: false,
    note: 'No source column yet — see build spec §3',
  },
  {
    key: 'composite',
    label: 'Vulnerability Index',
    formalName: 'Composite vulnerability index',
    components: 4,
    countField: null,
    noCountReason:
      'The composite sums four percentiles. A count of a percentile sum is not a quantity of anything.',
    available: true,
  },
];

/**
 * The scored layers, in framework order — the five the tooltip lists and
 * buildLayerStats ranks (§12: five entries until d5 exists).
 *
 * The loss layers are excluded on purpose: they are not domain percentiles, so
 * "p61, 40th of 254" is not a sentence about them, and putting them in the
 * tooltip's domain grid would imply they belong to the index.
 */
export const SCORE_LAYERS = LAYERS.filter((l) => l.available && basisOf(l) === 'score');

/** Kept for callers that only ever wanted "layers that can be drawn". */
export const VISIBLE_LAYERS = LAYERS.filter((l) => l.available);

export const layerByKey = (key) =>
  LAYERS.find((l) => l.key === key) ?? LAYERS[0];

function basisOf(l) {
  return l.basis ?? 'score';
}

export const layerBasis = (key) => basisOf(layerByKey(key));

/**
 * The score field a layer reads for its fill, or null for a window layer — which
 * has no column at all. Callers that used to index a County directly must go
 * through src/lib/layerValues.ts instead.
 */
export function scoreFieldOrNull(key) {
  if (layerBasis(key) === 'window') return null;
  return key === 'composite'
    ? 'vulnerability_score'
    : (`${key}_score`);
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
 * What the county tooltip shows on a given view — client direction 2026-09-10.
 *
 * The tooltip used to show everything on every view: five domain bands, four
 * assistance registries and an enrollment sparkline, whatever the reader was
 * actually looking at. Each view now gets only what answers its own question.
 *
 * @typedef {Object} TooltipSpec
 * @property {boolean} domains - The other domains' bands, two-up under the focused one.
 *   True on the Vulnerability index only. That view's whole argument is that
 *   the four domains disagree, so the spread IS the content there; on the other
 *   three it is four extra percentiles nobody asked for.
 * @property {boolean} capacity - The four listed-assistance registries. Capacity is the index view's story.
 * @property {'enrollment' | 'exposure' | 'none'} chart - The chart at the foot of the panel.
 *   'enrollment'  the caseload sparkline across the window
 *   'exposure'    caseload against newly-subject against who actually left
 *   'none'        no chart
 * @property {'enrollment' | 'work'} stats - Which three facts head the tooltip.
 *   'enrollment'  residents, on SNAP, lost since the window start
 *   'work'        newly subject, share of caseload, change over the window
 *   Both follow the Rate/Count toggle — see <CountyTooltip>.
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
 *   True on exactly one view. Capacity used to be on by default everywhere,
 *   which put four glyph types over every choropleth on the page; the client's
 *   2026-09-10 direction is that capacity is a reading of the vulnerability
 *   index, not decoration on the others.
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
    tooltip: { domains: false, capacity: false, chart: 'exposure', stats: 'work' },
  },
  {
    key: 'vulnerability',
    label: 'Vulnerability index',
    blurb: 'The composite, with the assistance capacity on top',
    metrics: ['composite'],
    showCapacity: true,
    // No chart: this panel already carries five domain bands and four capacity
    // rows, and the caseload line was the one thing on it that said nothing
    // about the index.
    tooltip: { domains: true, capacity: true, chart: 'none', stats: 'work' },
  },
  {
    key: 'medicaid',
    label: 'Medicaid coverage lost',
    blurb: 'Where people are leaving Medicaid',
    metrics: ['medicaid_loss'],
    showCapacity: false,
    tooltip: { domains: false, capacity: false, chart: 'enrollment', stats: 'enrollment' },
  },
  {
    key: 'children',
    label: 'Children losing benefits',
    blurb: 'SNAP benefits lost, children under 18',
    metrics: ['child_loss'],
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
 * its own query param: `?layer=d3` opens the Work view on Access to work, and
 * every link minted before this rework that named d1, d3 or composite still
 * lands somewhere sensible. d2 and d4 no longer have a view of their own — they
 * live in the tooltip — so they fall back to the default.
 */
export function viewForLayer(layer) {
  return VIEWS.find((v) => v.metrics.includes(layer)) ?? VIEWS[0];
}

/** The layer a view opens on. */
export const defaultLayerFor = (key) => viewByKey(key).metrics[0];

/**
 * The four assistance registries §6.6 names. Only two are sourced.
 *
 * `available: false` means the registry has not been acquired and every county
 * carries null for it — not zero. Those types draw no marks, have no checkbox and
 * are named as "not yet sourced" wherever capacity is shown, so an absent mark
 * never reads as a confirmed absence. Flip the flag when the export fills the
 * column.
 */
export const INFRA_TYPES = [
  {
    key: 'food_bank',
    label: 'Food bank enrollment site',
    glyph: 'square',
    source: 'Feeding Texas partner registry — not yet supplied',
    available: false,
  },
  {
    key: 'cms_navigator',
    label: 'CMS-funded navigator',
    glyph: 'circle',
    source: 'CMS 2025–26 awardees, counties served · 149 counties have none',
    available: true,
  },
  {
    key: 'chw',
    label: 'CHW / promotor network',
    glyph: 'diamond',
    source: 'DSHS networks directory, Dec 2021 · partial county coverage',
    available: true,
  },
  {
    key: 'counselor',
    label: 'Certified application counselor',
    glyph: 'plus',
    source: 'CMS assister locator — bot-blocked, not pulled',
    available: false,
  },
];
