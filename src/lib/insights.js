/**
 * Scope resolution for the Insights page.
 *
 * Every chart on that page reads from a `Scope` — Texas as a whole, or one
 * county — so switching scope is a data swap rather than a different code path
 * per chart. That is what makes `/insights/decline?county=48201` a county stat
 * page: the same charts, the same claims, a different series underneath.
 *
 * WHAT CAN AND CANNOT BE SCOPED
 * County monthly enrollment and child enrollment exist per county and reconcile
 * to the statewide totals exactly (see scripts/build-fixtures.mjs), so anything
 * built on them scopes cleanly. The age bands and the people-vs-households split
 * are STATEWIDE ONLY — spec §3.3 publishes them at state level and §3 forbids
 * synthesising county versions. `ScopedMetric.countyCapable` carries that
 * distinction to the UI so a statewide chart is labelled as one instead of
 * quietly implying it describes the county on screen.
 *
 * @typedef {import('../types').County} County
 * @typedef {import('../types').Statewide} Statewide
 */

/**
 * @typedef {Object} Scope
 * @property {string} key - 'state', or a county geoid.
 * @property {string} label - "Texas" or "Harris County".
 * @property {number} population - Resident population — the participation-rate denominator.
 * @property {number[]} enrolled - Monthly enrolled individuals, parallel to meta.months.
 * @property {number[] | null} children - Monthly enrolled children, or null where the series is missing.
 * @property {County | null} county - null when scoped to the state.
 */

export function buildScope(
  counties,
  byGeoid,
  statewide,
  geoid,
) {
  if (geoid) {
    const county = byGeoid.get(geoid);
    if (county) {
      return {
        key: county.geoid,
        label: `${county.name} County`,
        population: county.pop,
        enrolled: county.snap_enrolled,
        children: county.snap_children ?? null,
        county,
      };
    }
    // Unknown geoid falls through to statewide rather than rendering empty
    // charts; fromSearchParams also rejects it, so this is belt and braces.
  }

  /**
   * The statewide child series is summed from the counties rather than read from
   * a published total, because statewide.json has no child series — only the two
   * under-18 age bands, which are a policy-window snapshot rather than a monthly
   * trajectory. The county sums reconcile to the statewide caseload exactly, so
   * this is the same arithmetic the fixture builder asserts.
   */
  const childMonths = counties[0]?.snap_children?.length ?? 0;
  const children = childMonths
    ? Array.from({ length: childMonths }, (_, i) =>
        counties.reduce((sum, c) => sum + (c.snap_children?.[i] ?? 0), 0),
      )
    : null;

  return {
    key: 'state',
    label: 'Texas',
    population: statewide.meta.texas_population,
    enrolled: statewide.enrolled,
    children,
    county: null,
  };
}

// ------------------------------------------------------------------- series

/** Month-over-month change, null at the first month where there is no prior. */
export function monthlyChange(series) {
  return series.map((v, i) => (i === 0 ? null : v - series[i - 1]));
}

/**
 * Rebase to 100 at `refIndex`.
 *
 * This is the chart that answers "is my county worse than Texas", which is the
 * question a legislator actually asks. Levels cannot answer it — Harris has 60x
 * the caseload of a rural county, so on a level axis every rural line is flat
 * against the bottom. Indexing removes the size difference and leaves only the
 * shape.
 */
export function indexTo(series, refIndex) {
  const base = series[refIndex];
  if (!base) return series.map(() => null);
  return series.map((v) => (v / base) * 100);
}

/** Enrolled as a share of residents, per month. */
export function participationShare(series, population) {
  return population > 0 ? series.map((v) => v / population) : series.map(() => 0);
}

/**
 * @typedef {Object} WindowChange
 * @property {number} start
 * @property {number} end
 * @property {number} absolute
 * @property {number | null} pct - Signed fraction of the start value. Negative is a loss.
 */

export function windowChange(series, i0, i1) {
  const start = series[i0] ?? 0;
  const end = series[i1] ?? 0;
  return {
    start,
    end,
    absolute: end - start,
    pct: start > 0 ? (end - start) / start : null,
  };
}

// -------------------------------------------------------------------- ranks

/**
 * @typedef {Object} LossRank
 * @property {number} rank - 1 = steepest percentage loss in Texas.
 * @property {number} total
 * @property {number} pct - The county's own signed percentage change.
 * @property {number} statePct - The statewide figure, for the comparison sentence.
 * @property {number} medianPct - Median county percentage change — the typical county, not the total.
 */

/**
 * Where a county sits among all 254 on percentage loss over the window.
 *
 * Both a statewide figure and a county median are returned because they answer
 * different questions and routinely disagree: the statewide number is dominated
 * by the metros, the median describes the typical county. Quoting only one of
 * them is how a stat page ends up misleading.
 */
export function lossRank(
  counties,
  geoid,
  stateSeries,
  i0,
  i1,
) {
  const rows = counties
    .map((c) => ({
      geoid: c.geoid,
      pct: windowChange(c.snap_enrolled, i0, i1).pct,
    }))
    .filter((r) => r.pct != null)
    // Steepest loss (most negative) first.
    .sort((a, b) => a.pct - b.pct);

  const i = rows.findIndex((r) => r.geoid === geoid);
  if (i === -1) return null;

  const sorted = [...rows].sort((a, b) => a.pct - b.pct);
  return {
    rank: i + 1,
    total: rows.length,
    pct: rows[i].pct,
    statePct: windowChange(stateSeries, i0, i1).pct ?? 0,
    medianPct: sorted[Math.floor(sorted.length / 2)].pct,
  };
}

// ------------------------------------------------------------------- funnel

/**
 * @typedef {Object} FunnelPoint
 * @property {string} geoid
 * @property {string} name
 * @property {number} caseload - Caseload at the window start — the precision axis.
 * @property {number} pct - Signed percentage change over the window.
 * @property {boolean} outside
 */

/**
 * @typedef {Object} FunnelData
 * @property {FunnelPoint[]} points
 * @property {number} center - Statewide percentage change — the funnel's centre line.
 * @property {{ caseload: number; sd: number }[]} limits - Control limits, widening as caseload shrinks.
 */

/**
 * A funnel plot: percentage change against the caseload it was measured on.
 *
 * The point of this chart is to stop a reader over-reading small counties. A
 * 300-person caseload can swing 20% on sixty households, so the control limits
 * widen to the left; a county only counts as unusual if it sits outside the
 * limits FOR ITS OWN SIZE. On a plain bar chart of percentage change the top ten
 * would be ten tiny counties every time.
 *
 * The limits come from statewide.json's published funnel, not from a curve fitted
 * here, so the dashboard and the analysis agree on what "outside" means.
 */
export function buildFunnel(
  counties,
  statewide,
  i0,
  i1,
) {
  const center = statewide.funnel.center;
  const limits = [...statewide.funnel.limits].sort((a, b) => a.caseload - b.caseload);

  /** Interpolate the published sd curve at an arbitrary caseload. */
  const sdAt = (caseload) => {
    if (!limits.length) return 0;
    if (caseload <= limits[0].caseload) return limits[0].sd;
    const last = limits[limits.length - 1];
    if (caseload >= last.caseload) return last.sd;
    for (let k = 1; k < limits.length; k++) {
      const a = limits[k - 1];
      const b = limits[k];
      if (caseload <= b.caseload) {
        const t = (caseload - a.caseload) / (b.caseload - a.caseload);
        return a.sd + (b.sd - a.sd) * t;
      }
    }
    return last.sd;
  };

  const points = [];
  for (const c of counties) {
    const { start, pct } = windowChange(c.snap_enrolled, i0, i1);
    if (pct == null || start <= 0) continue;
    points.push({
      geoid: c.geoid,
      name: c.name,
      caseload: start,
      pct,
      outside: Math.abs(pct - center) > 2 * sdAt(start),
    });
  }

  return { points, center, limits };
}

/** The sd curve as {caseload, sd} pairs dense enough to draw a smooth band. */
export function funnelBand(
  data,
  minCaseload,
  maxCaseload,
  steps = 60,
) {
  const limits = data.limits;
  if (!limits.length) return [];

  const sdAt = (caseload) => {
    if (caseload <= limits[0].caseload) return limits[0].sd;
    const last = limits[limits.length - 1];
    if (caseload >= last.caseload) return last.sd;
    for (let k = 1; k < limits.length; k++) {
      const a = limits[k - 1];
      const b = limits[k];
      if (caseload <= b.caseload) {
        const t = (caseload - a.caseload) / (b.caseload - a.caseload);
        return a.sd + (b.sd - a.sd) * t;
      }
    }
    return last.sd;
  };

  // Even steps in log space, because caseload spans three orders of magnitude.
  const lo = Math.log10(Math.max(1, minCaseload));
  const hi = Math.log10(Math.max(10, maxCaseload));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const caseload = 10 ** (lo + ((hi - lo) * i) / steps);
    const sd = sdAt(caseload);
    return { caseload, lo: data.center - 2 * sd, hi: data.center + 2 * sd };
  });
}
