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

/**
 * Listed assistance across the registries that exist. An unsourced registry is
 * null on every county (see INFRA_TYPES.available) and adds nothing — it is not
 * read as a zero, because it was never counted.
 */
export const sites = (c) =>
  Object.values(c.infra ?? {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

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

  // ---------------------------------------------------------------- medicaid
  {
    /*
     * Observed, on its OWN month axis. `medicaid_enrolled` is attached
     * at load time from HHSC's published county workbooks and is null in the
     * months they did not publish — including everything after Jan 2026, which
     * is inside the default brush window. buildLayerValues resolves the window
     * to the published months it contains; this does the same.
     */
    id: 'medicaid_loss_share',
    label: 'Share of the Medicaid caseload lost',
    axis: 'Share of Medicaid lost',
    group: 'Medicaid',
    format: (v) => fmtPct(v, 1),
    value: (c, ctx) => {
      const m = c.medicaid_enrolled;
      if (!m) return null;
      let a = -1;
      let b = -1;
      for (let i = ctx.i0; i <= ctx.i1; i++) if (typeof m[i] === 'number') { a = i; break; }
      for (let i = ctx.i1; i >= ctx.i0; i--) if (typeof m[i] === 'number') { b = i; break; }
      if (a < 0 || b <= a || m[a] <= 0) return null;
      return Math.max(0, m[a] - m[b]) / m[a];
    },
    direction: 'worse-high',
    views: ALL,
  },
  {
    id: 'medicaid_now',
    label: 'Medicaid enrollment, latest published month',
    axis: 'On Medicaid',
    group: 'Medicaid',
    format: fmtInt,
    value: (c, ctx) => {
      const m = c.medicaid_enrolled;
      if (!m) return null;
      for (let i = ctx.i1; i >= 0; i--) if (typeof m[i] === 'number') return m[i];
      return null;
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
  /*
     Capacity is the thin half of the data: CMS navigator organisations serving
     the county and DSHS CHW networks naming it. These are ORGANISATIONS, not
     sites, and 149 counties have no navigator at all. The food-bank and
     application-counselor registries are not sourced, so there is no metric for
     them rather than a column of zeros.
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
         WHY THIS PAIR AND NOT CHILD LOSS AGAINST OVERALL LOSS.

         That pairing was degenerate on the old fixtures (r = 0.9998, both
         off-diagonal corners empty). On the real HHSC child series it is usable
         but still says little: r = 0.89, so its median quadrants mostly restate
         "this county is losing fast".

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
    id: 'medicaid-snap',
    label: 'Medicaid against SNAP',
    question: 'Which counties are losing both SNAP and Medicaid coverage fastest?',
    x: 'loss_share',
    y: 'medicaid_loss_share',
    quadrants: [
      /*
         Both axes are observed HHSC series, from independent programmes.
         Note the windows differ: Medicaid is read over the published months
         inside the brush, which currently end in Jan 2026.
      */
      { corner: 'hi-hi', label: 'Losing both fastest', concern: true },
      { corner: 'hi-lo', label: 'SNAP faster, Medicaid slower' },
      { corner: 'lo-hi', label: 'Medicaid faster, SNAP slower' },
      { corner: 'lo-lo', label: 'Slower on both' },
    ],
  },
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
  const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] ?? 0;
  const mx = median(points.map((p) => p.x));
  const isHiX = (p) => p.x >= mx;
  if (ySplit === 'any') {
    return { mx, my: 0, isHiX, isHiY: (p) => p.y > 0 };
  }
  const my = median(points.map((p) => p.y));
  return { mx, my, isHiX, isHiY: (p) => p.y >= my };
}

export const presetById = (id) =>
  SCATTER_PRESETS.find((p) => p.id === id) ?? SCATTER_PRESETS[0];

/**
 * The preset a map view opens the section on, so switching the map above also
 * moves the question below it to the matching one. The reader can still pick any
 * of the four.
 */
export const PRESET_FOR_VIEW = {
  loss: 'loss-capacity',
  medicaid: 'medicaid-snap',
  work: 'work-access',
  children: 'children-share',
  vulnerability: 'vulnerability-capacity',
};
