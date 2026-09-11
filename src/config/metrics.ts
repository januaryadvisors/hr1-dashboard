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
 */
import type { County, ViewKey } from '../types';
import { fmtInt, fmtPct, fmtPctDelta } from '../lib/format';

export interface MetricContext {
  /** Window start and end indices into meta.months. */
  i0: number;
  i1: number;
}

export interface MetricDef {
  id: string;
  /** Full name, for the dropdown. */
  label: string;
  /** Short form, for an axis. */
  axis: string;
  /** Dropdown grouping. */
  group: string;
  format: (v: number) => string;
  value: (c: County, ctx: MetricContext) => number | null;
  /**
   * Which end of the scale is bad.
   *
   * This is not decoration: the gap quadrant on the scatter only means
   * something when the x metric is `worse-high` and the y metric is
   * `better-high` — high need, low capacity. Any other pairing and the tinted
   * corner would be asserting a reading the axes do not support, so it is
   * hidden. See ScatterPanel / MapPage.
   */
  direction: 'worse-high' | 'better-high' | 'neutral';
  views: ViewKey[];
}

/** Offered on every view. */
const ALL: ViewKey[] = ['loss', 'work', 'vulnerability', 'children'];

const seriesAt = (m: number[] | undefined, i: number): number | null => {
  const v = m?.[i];
  return typeof v === 'number' ? v : null;
};

/** Signed change as a share of the start value. Negative is a loss. */
const pctChange = (m: number[] | undefined, ctx: MetricContext): number | null => {
  const start = seriesAt(m, ctx.i0);
  const end = seriesAt(m, ctx.i1);
  if (start == null || end == null || start <= 0) return null;
  return (end - start) / start;
};

const sites = (c: County): number =>
  c.infra.food_bank + c.infra.cms_navigator + c.infra.chw + c.infra.counselor;

const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const METRICS: MetricDef[] = [
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

export const metricById = (id: string): MetricDef =>
  METRICS.find((m) => m.id === id) ?? METRICS[0];

/** Metrics offered on a view, in registry order. */
export const metricsForView = (view: ViewKey): MetricDef[] =>
  METRICS.filter((m) => m.views.includes(view));

/**
 * The axis pair a view opens on.
 *
 * Y is capacity on every view, because the section's question is "where does
 * need meet capacity" — what changes per view is how need is defined. Picking
 * any other pair is what the dropdowns are for.
 */
export const DEFAULT_AXES: Record<ViewKey, { x: string; y: string }> = {
  vulnerability: { x: 'vulnerability', y: 'sites_per_10k' },
  loss: { x: 'loss_share', y: 'sites_per_10k' },
  work: { x: 'subject_share', y: 'sites_per_10k' },
  children: { x: 'child_loss_share', y: 'sites_per_10k' },
};

/**
 * Whether the tinted "gap" corner is a legitimate reading of this pair.
 *
 * It means "much of the bad thing, little of the good thing", which only holds
 * when x rises with need and y rises with capacity. On any other pair the tint
 * would assert something the axes do not say, so the caller hides it.
 */
export const gapQuadrantApplies = (x: MetricDef, y: MetricDef): boolean =>
  x.direction === 'worse-high' && y.direction === 'better-high';
