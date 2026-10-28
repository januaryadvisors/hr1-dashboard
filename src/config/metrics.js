/**
 * County metrics available to the scatter's axis pickers.
 *
 * WHAT THIS IS AND IS NOT
 * Every metric here is computed from data the export actually ships (§3.1) or
 * from the monthly series. The brief asked for things like "# of school lunch
 * programs" or "median teacher income" on the Children view — **those are not
 * in this dataset and are not faked here.** What the Children view offers
 * instead is the child caseload, the child loss, and the child share of the
 * caseload, which are the child-specific quantities that do exist. If the
 * school-nutrition or district-finance series can be sourced, each one is a
 * single entry in this file plus a column in the export.
 *
 * Metrics are grouped by view because the question changes with the view, but
 * anything in `SHARED_VIEWS` is offered everywhere — a reader comparing child
 * loss against navigator coverage needs both lists at once.
 *
 * @typedef {import('../types').County} County
 * @typedef {import('../types').ViewKey} ViewKey
 */
import { fmtInt, fmtPct, fmtPctDelta, fmtPercentile } from '../lib/format';
import { changeShare, lossShare, lostCount, valueAt, windowEnds } from '../lib/series';
import { median } from '../lib/stats';
import { domainByKey, SCORED_INFRA } from './layers';

/**
 * @typedef {Object} MetricContext
 * @property {number} i0 - Window start and end indices into meta.months.
 * @property {number} i1
 */

/**
 * @typedef {Object} MetricDef
 * @property {string} id
 * @property {string} label - Full name, for the dropdown.
 * @property {string} axis - Short form, for an axis.
 * @property {string} group - Dropdown grouping.
 * @property {(v: number) => string} format
 * @property {(c: County, ctx: MetricContext) => number | null} value
 * @property {'worse-high' | 'better-high' | 'neutral'} direction - Which end of the scale is bad.
 *   This is not decoration: the gap quadrant on the scatter only means
 *   something when the x metric is `worse-high` and the y metric is
 *   `better-high` — high need, low capacity. Any other pairing and the tinted
 *   corner would be asserting a reading the axes do not support, so it is
 *   hidden. See ScatterPanel / MapPage.
 * @property {ViewKey[]} views
 */

/** Offered on every view. */
const ALL = ['loss', 'work', 'vulnerability', 'children', 'aca'];

/** The series' endpoints over the context's window. */
const ends = (m, ctx) => windowEnds(m, ctx.i0, ctx.i1);

/**
 * Listed assistance ORGANISATIONS across the registries that exist. An
 * unsourced registry is null on every county (see INFRA_TYPES.available) and
 * adds nothing — it is not read as a zero, because it was never counted. Food
 * banks are left out until all of them report (INFRA_TYPES.partial): with 4
 * of 21 in, a county's total would mostly say which bank happened to report.
 * CHW is a range, not a count (INFRA_TYPES.banded), so it cannot be summed.
 * What is left is CMS navigator orgs plus Community Partner sites.
 */
export const sites = (c) =>
  SCORED_INFRA.reduce((s, k) => s + (typeof c.infra?.[k] === 'number' ? c.infra[k] : 0), 0);

const num = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** A domain's percentile, named as in config/layers.js DOMAINS. */
function domainMetric(key, views) {
  const d = domainByKey(key);
  return {
    id: key,
    label: d.metricLabel,
    axis: d.metricAxis,
    group: 'Domain percentiles',
    format: fmtPercentile,
    value: (c) => num(c[`${key}_score`]),
    direction: 'worse-high',
    views,
  };
}

export const METRICS = [
  // ------------------------------------------------------------- caseload
  {
    id: 'loss_pct',
    label: 'Caseload change over the window',
    axis: 'Caseload change',
    group: 'Enrollment',
    format: (v) => fmtPctDelta(v, 1),
    value: (c, ctx) => changeShare(ends(c.snap_enrolled, ctx)),
    // Signed, and a loss is negative — so LOW is worse here, not high.
    direction: 'better-high',
    views: ALL,
  },
  {
    /*
     * The DEFAULT need metric for the loss view, and deliberately a share
     * rather than the headcount below it.
     *
     * County caseloads span three orders of magnitude, so "people who left" on
     * a linear axis puts Harris at the right edge and stacks the other 250
     * counties against the left one. The share is the same fact on a scale the
     * chart can actually show. Positive = lost, so it pairs with a capacity
     * axis for the gap corner.
     */
    id: 'loss_share',
    label: 'Share of the caseload lost',
    axis: 'Share of caseload lost',
    group: 'Enrollment',
    format: (v) => fmtPct(v, 1),
    value: (c, ctx) => lossShare(ends(c.snap_enrolled, ctx)),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'loss_people',
    label: 'People no longer on SNAP',
    axis: 'People who left',
    group: 'Enrollment',
    format: fmtInt,
    value: (c, ctx) => lostCount(ends(c.snap_enrolled, ctx)),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'caseload_now',
    label: 'Caseload at the window end',
    axis: 'Caseload now',
    group: 'Enrollment',
    format: fmtInt,
    value: (c, ctx) => valueAt(c.snap_enrolled, ctx.i1),
    direction: 'neutral',
    views: ALL,
  },
  {
    id: 'participation',
    label: 'Share of residents enrolled',
    axis: 'Participation rate',
    group: 'Enrollment',
    format: (v) => fmtPct(v, 1),
    value: (c, ctx) => {
      const end = valueAt(c.snap_enrolled, ctx.i1);
      return end == null || c.pop <= 0 ? null : end / c.pop;
    },
    direction: 'neutral',
    views: ALL,
  },

  // ---------------------------------------------------------- ACA Marketplace
  {
    /*
     * feeding-texas-hr1's county Marketplace measure: consumers with an advance
     * premium tax credit at the latest open enrollment, per 1,000 residents.
     * Not a window measure — the brush does not move it.
     */
    id: 'aptc_per_1k',
    label: 'Who depends on the Marketplace tax credit, per 1,000 residents',
    axis: 'Subsidised Marketplace enrollees per 1,000',
    group: 'ACA Marketplace',
    format: (v) => v.toFixed(0),
    value: (c) => num(c.aptc_per_1k),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'aptc_consumers',
    label: 'Who depends on the Marketplace tax credit, people',
    axis: 'Subsidised Marketplace enrollees',
    group: 'ACA Marketplace',
    format: fmtInt,
    value: (c) => num(c.aptc_consumers),
    direction: 'neutral',
    views: ALL,
  },

  // ------------------------------------------------------- work requirements
  {
    id: 'subject_people',
    label: 'Residents newly subject to the work requirement',
    axis: 'Newly subject',
    group: 'Work requirements',
    format: fmtInt,
    value: (c) => num(c.newly_subject_persons),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'subject_share',
    label: 'Newly subject, as a share of the caseload',
    axis: 'Newly subject / caseload',
    group: 'Work requirements',
    format: (v) => fmtPct(v, 1),
    value: (c, ctx) => {
      const start = valueAt(c.snap_enrolled, ctx.i0);
      return start == null || start <= 0 ? null : (c.newly_subject_persons ?? 0) / start;
    },
    direction: 'worse-high',
    views: ['work', 'vulnerability', 'loss'],
  },
  domainMetric('d1', ALL),
  domainMetric('d3', ALL),

  // ----------------------------------------------------------------- children
  {
    id: 'child_loss_pct',
    label: 'Child caseload change over the window',
    axis: 'Child caseload change',
    group: 'Children',
    format: (v) => fmtPctDelta(v, 1),
    value: (c, ctx) => changeShare(ends(c.snap_children, ctx)),
    direction: 'better-high',
    views: ALL,
  },
  {
    /* Same reasoning as loss_share — a share, not a headcount. */
    id: 'child_loss_share',
    label: 'Share of the child caseload lost',
    axis: 'Share of child caseload lost',
    group: 'Children',
    format: (v) => fmtPct(v, 1),
    value: (c, ctx) => lossShare(ends(c.snap_children, ctx)),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'child_loss_people',
    label: 'Children no longer on SNAP',
    axis: 'Children who left',
    group: 'Children',
    format: fmtInt,
    value: (c, ctx) => lostCount(ends(c.snap_children, ctx)),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'child_now',
    label: 'Children enrolled at the window end',
    axis: 'Children enrolled',
    group: 'Children',
    format: fmtInt,
    value: (c, ctx) => valueAt(c.snap_children, ctx.i1),
    direction: 'neutral',
    views: ALL,
  },
  {
    id: 'child_share',
    label: 'Children as a share of the caseload',
    axis: 'Child share of caseload',
    group: 'Children',
    format: (v) => fmtPct(v, 1),
    value: (c, ctx) => {
      const kids = valueAt(c.snap_children, ctx.i1);
      const all = valueAt(c.snap_enrolled, ctx.i1);
      return kids == null || all == null || all <= 0 ? null : kids / all;
    },
    direction: 'neutral',
    views: ['children', 'vulnerability'],
  },

  // ------------------------------------------------------------ vulnerability
  {
    id: 'vulnerability',
    label: 'Composite vulnerability index',
    axis: 'Vulnerability index',
    group: 'Vulnerability',
    format: (v) => v.toFixed(2),
    value: (c) => num(c.vulnerability_score),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'cumulative',
    label: 'Domains in the worst fifth (0–4)',
    axis: 'Domains at Q5',
    group: 'Vulnerability',
    format: (v) => v.toFixed(0),
    value: (c) => num(c.cumulative_impact),
    direction: 'worse-high',
    views: ['vulnerability'],
  },
  domainMetric('d2', ['vulnerability']),
  domainMetric('d4', ['vulnerability', 'children']),

  // ---------------------------------------------------------------- capacity
  /*
     Capacity is the thin half of the data. The metric sums CMS navigator
     organisations and Community Partner Program sites (levels 3–4) — the two
     complete counts. Certified CHWs come as ranges and food banks as a partial
     roster, so neither is summed in.
  */
  {
    id: 'sites_per_10k',
    label: 'Listed assistance organizations per 10,000 residents',
    axis: 'Assistance orgs per 10k',
    group: 'Capacity',
    format: (v) => v.toFixed(2),
    value: (c) => (c.pop <= 0 ? null : (sites(c) / c.pop) * 10000),
    direction: 'better-high',
    views: ALL,
  },
  {
    id: 'sites_total',
    label: 'Listed assistance organizations, total',
    axis: 'Assistance orgs',
    group: 'Capacity',
    format: fmtInt,
    value: (c) => sites(c),
    direction: 'better-high',
    views: ALL,
  },
  {
    id: 'navigators',
    label: 'CMS-funded navigator organizations',
    axis: 'Navigator orgs',
    group: 'Capacity',
    format: fmtInt,
    value: (c) => num(c.infra.cms_navigator),
    direction: 'better-high',
    views: ALL,
  },

  // ------------------------------------------------------------------ context
  {
    id: 'pop',
    label: 'Residents',
    axis: 'Population',
    group: 'Context',
    format: fmtInt,
    value: (c) => num(c.pop),
    direction: 'neutral',
    views: ALL,
  },
];

export const metricById = (id) =>
  METRICS.find((m) => m.id === id) ?? METRICS[0];

/**
 * THE CURATED AXIS PAIRS.
 *
 * Two free dropdowns over the whole registry would be ~500 orderings, most of
 * them meaningless (population against population; navigators against food
 * banks) and a few actively misleading. So the section asks a QUESTION and
 * draws the pair that answers it. Each preset names its four quadrants, because
 * a quadrant chart is only readable if the corners are labelled — and marks the
 * corner (or corners) that are the finding, which the chart tints.
 *
 * Adding a preset is two metric ids and four labels; nothing here invents a
 * number.
 *
 * QUADRANT KEYS are `<x>-<y>`, each `lo` or `hi` relative to the median of the
 * counties actually plotted. `hi` on y is the TOP of the chart whatever the
 * metric means — "high vulnerability" and "high capacity" both read upward, and
 * which of those is bad is what `concern` records.
 *
 * `lo` on a loss axis is NOT "holding". 248 of 254 counties lost SNAP between
 * Jul 2025 and May 2026, and every county with 1,000+ enrollees did; below the
 * median means losing more slowly than most, and the labels say so.
 *
 * `ySplit: 'any'` replaces the median on a zero-inflated y axis. Capacity is
 * zero in 149 counties, so its median IS zero and a median split leaves both
 * lower quadrants empty — the concern corner would read "0 counties" on every
 * view. Split there at none-listed / some-listed instead, which is also the
 * honest reading of a presence registry. See splitQuadrants().
 *
 * @typedef {Object} Quadrant
 * @property {'lo-lo'|'hi-lo'|'lo-hi'|'hi-hi'} corner
 * @property {string} label - What a county in this corner is. Shown in the corner itself.
 * @property {boolean} [concern] - Tinted red and counted. The finding.
 *
 * @typedef {Object} ScatterPreset
 * @property {string} id
 * @property {string} label - Names the pairing, for the picker.
 * @property {string} question - What the pairing answers, in one line.
 * @property {string} x - Metric id.
 * @property {string} y - Metric id.
 * @property {'median' | 'any'} [ySplit] - Where y divides lo from hi. Defaults to the median.
 * @property {Quadrant[]} quadrants - All four, always.
 */
export const SCATTER_PRESETS = [
  {
    id: 'vulnerability-capacity',
    label: 'Vulnerability against capacity',
    question: 'Where does the highest modelled need meet no listed assistance?',
    x: 'vulnerability',
    y: 'sites_per_10k',
    ySplit: 'any',
    quadrants: [
      { corner: 'hi-lo', label: 'Highest need, none listed', concern: true },
      { corner: 'hi-hi', label: 'Highest need, help listed' },
      { corner: 'lo-lo', label: 'Lower need, none listed' },
      { corner: 'lo-hi', label: 'Lower need, help listed' },
    ],
  },
  {
    id: 'loss-capacity',
    label: 'Loss against capacity',
    question: 'Where is the caseload falling fastest with no listed help?',
    x: 'loss_share',
    y: 'sites_per_10k',
    ySplit: 'any',
    quadrants: [
      { corner: 'hi-lo', label: 'Losing fastest, none listed', concern: true },
      { corner: 'hi-hi', label: 'Losing fastest, help listed' },
      { corner: 'lo-lo', label: 'Losing slower, none listed' },
      { corner: 'lo-hi', label: 'Losing slower, help listed' },
    ],
  },
  {
    id: 'work-access',
    label: 'Work rules against access to work',
    question: 'Who has to document work where work is hardest to reach?',
    x: 'subject_share',
    y: 'd3',
    quadrants: [
      /*
         Both axes are worse-high here, so the worry is the TOP-RIGHT corner,
         not the bottom-right one as on need against capacity.
      */
      { corner: 'hi-hi', label: 'Most newly subject, work hardest to reach', concern: true },
      { corner: 'hi-lo', label: 'Most newly subject, work reachable' },
      { corner: 'lo-hi', label: 'Few newly subject, work hard to reach' },
      { corner: 'lo-lo', label: 'Few newly subject, work reachable' },
    ],
  },
  {
    id: 'children-share',
    label: 'Children against the whole caseload',
    question: 'Where are the caseloads with the most children on them falling fastest?',
    x: 'loss_share',
    y: 'child_share',
    quadrants: [
      /*
         WHY THIS PAIR AND NOT CHILD LOSS AGAINST OVERALL LOSS.

         On the real HHSC child series those two correlate at r = 0.89, so
         their median quadrants mostly restate "this county is losing fast".

         Child SHARE is the more informative axis: it runs 0.36–0.58 across the
         175 counties with 1,000+ enrollees and correlates NEGATIVELY with the
         loss share across all 254 (r = −0.35). Child-heavy caseloads are falling
         more slowly than adult-heavy ones — consistent with the age bands, where
         18–59 fell hardest.
      */
      { corner: 'hi-hi', label: 'Child-heavy caseload, losing fastest', concern: true },
      { corner: 'hi-lo', label: 'Losing fastest, fewer children on it' },
      { corner: 'lo-hi', label: 'Child-heavy caseload, losing slower' },
      { corner: 'lo-lo', label: 'Fewer children, losing slower' },
    ],
  },
  {
    id: 'aca-snap',
    label: 'Marketplace subsidies against SNAP loss',
    question: 'Where is SNAP falling fastest among counties that lean most on Marketplace subsidies?',
    x: 'loss_share',
    y: 'aptc_per_1k',
    quadrants: [
      /*
         Two programmes, two different readings: x is observed SNAP loss over
         the brush window; y is Marketplace exposure at the latest open
         enrollment, not a loss — there is no county Marketplace loss series.
      */
      { corner: 'hi-hi', label: 'Losing SNAP fastest, most subsidised', concern: true },
      { corner: 'hi-lo', label: 'Losing SNAP fastest, fewer subsidised' },
      { corner: 'lo-hi', label: 'Losing SNAP slower, most subsidised' },
      { corner: 'lo-lo', label: 'Slower on SNAP, fewer subsidised' },
    ],
  },
];

/**
 * Which side of each crosshair a point falls on — the one definition the chart
 * draws and the tests check, so the tinted corner and its count cannot disagree.
 *
 * x always splits at the median of the plotted counties. y does too, unless the
 * preset says `ySplit: 'any'`: then `hi` is any listed value and `lo` is exactly
 * none, for axes where most counties sit at zero.
 *
 * @param {{ x: number, y: number }[]} points
 * @param {'median' | 'any'} [ySplit]
 */
export function splitQuadrants(points, ySplit = 'median') {
  const mx = median(points.map((p) => p.x)) ?? 0;
  const isHiX = (p) => p.x >= mx;
  if (ySplit === 'any') {
    return { mx, my: 0, isHiX, isHiY: (p) => p.y > 0 };
  }
  const my = median(points.map((p) => p.y)) ?? 0;
  return { mx, my, isHiX, isHiY: (p) => p.y >= my };
}

export const presetById = (id) =>
  SCATTER_PRESETS.find((p) => p.id === id) ?? SCATTER_PRESETS[0];
