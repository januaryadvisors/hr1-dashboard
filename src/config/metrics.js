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
import { fmtInt, fmtPct, fmtPctDelta } from '../lib/format';

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
const ALL = ['loss', 'work', 'vulnerability', 'children'];

const seriesAt = (m, i) => {
  const v = m?.[i];
  return typeof v === 'number' ? v : null;
};

/** Signed change as a share of the start value. Negative is a loss. */
const pctChange = (m, ctx) => {
  const start = seriesAt(m, ctx.i0);
  const end = seriesAt(m, ctx.i1);
  if (start == null || end == null || start <= 0) return null;
  return (end - start) / start;
};

const sites = (c) =>
  c.infra.food_bank + c.infra.cms_navigator + c.infra.chw + c.infra.counselor;

const num = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const METRICS = [
  // ------------------------------------------------------------- caseload
  {
    id: 'loss_pct',
    label: 'Caseload change over the window',
    axis: 'Caseload change',
    group: 'Enrollment',
    format: (v) => fmtPctDelta(v, 1),
    value: (c, ctx) => pctChange(c.snap_enrolled, ctx),
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
    value: (c, ctx) => {
      const start = seriesAt(c.snap_enrolled, ctx.i0);
      const end = seriesAt(c.snap_enrolled, ctx.i1);
      if (start == null || end == null || start <= 0) return null;
      return Math.max(0, start - end) / start;
    },
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'loss_people',
    label: 'People who left SNAP',
    axis: 'People who left',
    group: 'Enrollment',
    format: fmtInt,
    value: (c, ctx) => {
      const start = seriesAt(c.snap_enrolled, ctx.i0);
      const end = seriesAt(c.snap_enrolled, ctx.i1);
      return start == null || end == null ? null : Math.max(0, start - end);
    },
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'caseload_now',
    label: 'Caseload at the window end',
    axis: 'Caseload now',
    group: 'Enrollment',
    format: fmtInt,
    value: (c, ctx) => seriesAt(c.snap_enrolled, ctx.i1),
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
      const end = seriesAt(c.snap_enrolled, ctx.i1);
      return end == null || c.pop <= 0 ? null : end / c.pop;
    },
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
      const start = seriesAt(c.snap_enrolled, ctx.i0);
      return start == null || start <= 0 ? null : (c.newly_subject_persons ?? 0) / start;
    },
    direction: 'worse-high',
    views: ['work', 'vulnerability', 'loss'],
  },
  {
    id: 'd1',
    label: 'D1 — work-requirement exposure',
    axis: 'D1 exposure',
    group: 'Domain percentiles',
    format: (v) => `p${Math.round(v * 100)}`,
    value: (c) => num(c.d1_score),
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'd3',
    label: 'D3 — work is harder to reach',
    axis: 'D3 access to work',
    group: 'Domain percentiles',
    format: (v) => `p${Math.round(v * 100)}`,
    value: (c) => num(c.d3_score),
    direction: 'worse-high',
    views: ALL,
  },

  // ----------------------------------------------------------------- children
  {
    id: 'child_loss_pct',
    label: 'Child caseload change over the window',
    axis: 'Child caseload change',
    group: 'Children',
    format: (v) => fmtPctDelta(v, 1),
    value: (c, ctx) => pctChange(c.snap_children, ctx),
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
    value: (c, ctx) => {
      const start = seriesAt(c.snap_children, ctx.i0);
      const end = seriesAt(c.snap_children, ctx.i1);
      if (start == null || end == null || start <= 0) return null;
      return Math.max(0, start - end) / start;
    },
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'child_loss_people',
    label: 'Children who left SNAP',
    axis: 'Children who left',
    group: 'Children',
    format: fmtInt,
    value: (c, ctx) => {
      const start = seriesAt(c.snap_children, ctx.i0);
      const end = seriesAt(c.snap_children, ctx.i1);
      return start == null || end == null ? null : Math.max(0, start - end);
    },
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'child_now',
    label: 'Children enrolled at the window end',
    axis: 'Children enrolled',
    group: 'Children',
    format: fmtInt,
    value: (c, ctx) => seriesAt(c.snap_children, ctx.i1),
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
      const kids = seriesAt(c.snap_children, ctx.i1);
      const all = seriesAt(c.snap_enrolled, ctx.i1);
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
  {
    id: 'd2',
    label: 'D2 — citizenship and status',
    axis: 'D2 citizenship',
    group: 'Domain percentiles',
    format: (v) => `p${Math.round(v * 100)}`,
    value: (c) => num(c.d2_score),
    direction: 'worse-high',
    views: ['vulnerability'],
  },
  {
    id: 'd4',
    label: 'D4 — socioeconomic need',
    axis: 'D4 socioeconomic need',
    group: 'Domain percentiles',
    format: (v) => `p${Math.round(v * 100)}`,
    value: (c) => num(c.d4_score),
    direction: 'worse-high',
    views: ['vulnerability', 'children'],
  },

  // ---------------------------------------------------------------- capacity
  {
    id: 'sites_per_10k',
    label: 'Listed assistance sites per 10,000 residents',
    axis: 'Sites per 10k',
    group: 'Capacity',
    format: (v) => v.toFixed(1),
    value: (c) => (c.pop <= 0 ? null : (sites(c) / c.pop) * 10000),
    direction: 'better-high',
    views: ALL,
  },
  {
    id: 'sites_total',
    label: 'Listed assistance sites, total',
    axis: 'Listed sites',
    group: 'Capacity',
    format: fmtInt,
    value: (c) => sites(c),
    direction: 'better-high',
    views: ALL,
  },
  {
    id: 'navigators',
    label: 'CMS-funded navigators',
    axis: 'Navigators',
    group: 'Capacity',
    format: fmtInt,
    value: (c) => num(c.infra.cms_navigator),
    direction: 'better-high',
    views: ALL,
  },
  {
    id: 'food_banks',
    label: 'Food bank enrollment sites',
    axis: 'Food bank sites',
    group: 'Capacity',
    format: fmtInt,
    value: (c) => num(c.infra.food_bank),
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

/** Metrics offered on a view, in registry order. */
export const metricsForView = (view) =>
  METRICS.filter((m) => m.views.includes(view));

/**
 * THE CURATED AXIS PAIRS — 2026-09-11 direction.
 *
 * The scatter used to offer two dropdowns over the whole registry, which is
 * ~500 orderings, most of them meaningless (population against population;
 * navigators against food banks) and a few actively misleading. A reader is not
 * served by being handed the raw registry and asked to find the story in it.
 *
 * So the section now asks a QUESTION and draws the pair that answers it. Each
 * preset names its four quadrants, because a quadrant chart is only readable if
 * the corners are labelled — and marks the corner (or corners) that are the
 * finding, which the chart tints.
 *
 * The metric registry above is unchanged and still complete: adding a preset is
 * two ids and four labels, and nothing here invents a number.
 *
 * QUADRANT KEYS are `<x>-<y>`, each `lo` or `hi` relative to the median of the
 * counties actually plotted. `hi` on y is the TOP of the chart whatever the
 * metric means — "high vulnerability" and "high capacity" both read upward, and
 * which of those is bad is what `concern` records.
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
 * @property {Quadrant[]} quadrants - All four, always.
 */
export const SCATTER_PRESETS = [
  {
    id: 'loss-capacity',
    label: 'Loss against capacity',
    question: 'Where is the caseload falling fastest with the least help nearby?',
    x: 'loss_share',
    y: 'sites_per_10k',
    quadrants: [
      { corner: 'hi-lo', label: 'Losing most, helped least', concern: true },
      { corner: 'hi-hi', label: 'Losing most, help nearby' },
      { corner: 'lo-lo', label: 'Holding, thinly served' },
      { corner: 'lo-hi', label: 'Holding, well served' },
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
         not the bottom-right one. This is the pairing the old
         gapQuadrantApplies() refused to tint at all — it only understood
         need-against-capacity — which left the most pointed chart in the
         section with no finding marked on it.
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
         WHY THIS PAIR AND NOT THE OBVIOUS ONE.

         The question is "which counties have a disproportionate number of
         children losing benefits", and the obvious pairing is child loss share
         against overall loss share — counties above the diagonal lose children
         faster than they lose everyone. That pairing is UNUSABLE on the current
         fixtures: build-fixtures.mjs derives snap_children from snap_enrolled by
         a near-constant factor, so the two shares correlate at r = 0.9998 and
         both off-diagonal quadrants are exactly empty. A chart whose finding is
         always "0 counties" is worse than no chart.

         So this asks the answerable version of the same question: where is the
         caseload that is MOST made of children also falling fastest? Child share
         is a real county-level quantity (0.34 to 0.49 across Texas) and it is
         nearly independent of the loss share (r = 0.17), so the quadrants
         actually divide the state.

         Swap y to 'child_loss_share' the day the export ships a genuine
         county-by-month child series — see docs/SPEC-DEVIATIONS.md §A4 and the
         note on County.snap_children.
      */
      { corner: 'hi-hi', label: 'Child-heavy caseload, losing fastest', concern: true },
      { corner: 'hi-lo', label: 'Losing fastest, fewer children on it' },
      { corner: 'lo-hi', label: 'Child-heavy caseload, holding' },
      { corner: 'lo-lo', label: 'Fewer children, holding' },
    ],
  },
  {
    id: 'vulnerability-capacity',
    label: 'Vulnerability against capacity',
    question: 'Where does the highest modelled need meet the least assistance?',
    x: 'vulnerability',
    y: 'sites_per_10k',
    quadrants: [
      { corner: 'hi-lo', label: 'Highest need, least capacity', concern: true },
      { corner: 'hi-hi', label: 'Highest need, capacity present' },
      { corner: 'lo-lo', label: 'Lower need, little capacity' },
      { corner: 'lo-hi', label: 'Lower need, capacity present' },
    ],
  },
];

export const presetById = (id) =>
  SCATTER_PRESETS.find((p) => p.id === id) ?? SCATTER_PRESETS[0];

/**
 * The preset a map view opens the section on, so switching the map above also
 * moves the question below it to the matching one. The reader can still pick any
 * of the four.
 */
export const PRESET_FOR_VIEW = {
  loss: 'loss-capacity',
  work: 'work-access',
  children: 'children-share',
  vulnerability: 'vulnerability-capacity',
};
