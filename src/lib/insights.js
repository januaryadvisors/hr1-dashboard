/**
 * Scope resolution for the Insights page.
 *
 * Every chart on that page reads from a `Scope` — Texas as a whole, one county,
 * or one TX House / Senate district — so switching scope is a data swap rather
 * than a different code path per chart. That is what makes
 * `/insights/decline?county=48201` a county stat page and
 * `?district=txhouse-133` a district one: the same charts, the same claims, a
 * different series underneath.
 *
 * DISTRICTS ARE COUNTS ONLY. Their enrollment series are apportioned from
 * counties at build time (district-counts.json); a district that contains part
 * of a split county carries an estimate, and `district.exact` says which. There
 * are no district domain scores — §9 forbids weighting percentiles into
 * districts — so the domain chapter says so instead of drawing.
 *
 * WHAT CAN AND CANNOT BE SCOPED
 * County monthly enrollment and child enrollment exist per county and reconcile
 * to the statewide totals exactly (see scripts/build-county-data.mjs), so
 * anything built on them scopes cleanly. The age bands and the
 * people-vs-households split ship STATEWIDE ONLY — HHSC publishes them by county,
 * but §3.3 keeps them out of counties.json for payload size. `statewideOnly` on
 * a ChartCard carries that distinction to the UI so a statewide chart is
 * labelled as one instead of quietly implying it describes the county on screen.
 *
 * @typedef {import('../types').County} County
 * @typedef {import('../types').Statewide} Statewide
 */

/**
 * @typedef {Object} Scope
 * @property {string} key - 'state', a county geoid, or a district key ("txhouse-133").
 * @property {'state' | 'county' | 'district'} kind
 * @property {string} label - "Texas", "Harris County" or "House District 133".
 * @property {number} population - Resident population — the participation-rate denominator.
 * @property {number[]} enrolled - Monthly enrolled individuals, parallel to meta.months.
 * @property {number[] | null} children - Monthly enrolled children, or null where the series is missing.
 * @property {County | null} county - The county record when kind is 'county', else null.
 * @property {import('../data/load').DistrictUnit | null} district - The district when kind is 'district', else null.
 */

export function buildScope(
  counties,
  byGeoid,
  statewide,
  geoid,
  districtCounts = null,
) {
  const district = geoid ? districtCounts?.byId.get(geoid) : null;
  if (district) {
    return {
      key: district.geoid,
      kind: 'district',
      label: district.name,
      population: district.pop,
      enrolled: district.snap_enrolled,
      children: district.snap_children,
      county: null,
      district,
    };
  }

  if (geoid) {
    const county = byGeoid.get(geoid);
    if (county) {
      return {
        key: county.geoid,
        kind: 'county',
        label: `${county.name} County`,
        population: county.pop,
        enrolled: county.snap_enrolled,
        children: county.snap_children ?? null,
        county,
        district: null,
      };
    }
    // Unknown key falls through to statewide rather than rendering empty
    // charts; fromSearchParams also rejects it, so this is belt and braces.
  }

  /**
   * The statewide child series is summed from the counties, which reconcile to
   * the statewide caseload exactly — the same arithmetic the data build asserts.
   * It equals statewide.age_series 'Under 5' + '5–17' month by month.
   */
  const childMonths = counties[0]?.snap_children?.length ?? 0;
  const children = childMonths
    ? Array.from({ length: childMonths }, (_, i) =>
        counties.reduce((sum, c) => sum + (c.snap_children?.[i] ?? 0), 0),
      )
    : null;

  return {
    key: 'state',
    kind: 'state',
    label: 'Texas',
    population: statewide.meta.texas_population,
    enrolled: statewide.enrolled,
    children,
    county: null,
    district: null,
  };
}

/**
 * @typedef {Object} Peers
 * @property {{ geoid: string, name: string, snap_enrolled: number[] }[]} units
 * @property {string} noun - Plural, for sentences: "counties", "House districts".
 * @property {string} singular - "county", "House district".
 */

/**
 * What a scope is compared against: counties for Texas or a county, the other
 * districts of the same chamber for a district. A House district ranked among
 * 254 counties would be comparing a 200,000-person unit to Loving County.
 *
 * @returns {Peers}
 */
export function peersFor(scope, counties, districtCounts) {
  if (scope.kind === 'district' && districtCounts) {
    const plan = scope.district.plan;
    const chamber = districtCounts.meta.chambers[plan];
    const kind = chamber?.noun.replace(/ District$/, '') ?? 'district';
    return {
      units: districtCounts.districts.filter((d) => d.plan === plan),
      noun: `${kind} districts`,
      singular: `${kind} district`,
    };
  }
  return { units: counties, noun: 'counties', singular: 'county' };
}

/**
 * How the scope's children moved against its whole caseload over a window —
 * 'faster', 'slower' or 'same' (within half a point). The "Who is falling off"
 * heading used to assert "faster" for every county; on the real data child-heavy
 * caseloads are, if anything, falling more slowly, so the claim has to be read
 * off the numbers.
 */
export function childPace(scope, i0, i1) {
  if (!scope.children) return null;
  const kids = windowChange(scope.children, i0, i1).pct;
  const all = windowChange(scope.enrolled, i0, i1).pct;
  if (kids == null || all == null) return null;
  if (Math.abs(kids - all) < 0.005) return 'same';
  return kids < all ? 'faster' : 'slower';
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

/**
 * @typedef {Object} AgeRow
 * @property {string} label
 * @property {number} from - Enrolled at the window start.
 * @property {number} to - Enrolled at the window end.
 * @property {number} pctChange - Signed fraction.
 */

/**
 * Enrolled individuals per age band across a window, steepest loss first.
 *
 * Reads the monthly band series, so any brush window gets its real numbers.
 * Without `age_series` (an older statewide.json) it falls back to the published
 * policy-window change scaled by the window's share of the statewide loss —
 * an approximation, which is why the monthly series ships.
 *
 * @returns {AgeRow[]}
 */
export function ageBandRows(statewide, i0, i1) {
  const series = statewide.age_series;
  if (series) {
    return statewide.age_bands
      .map((b) => {
        const s = series[b.band];
        const from = s?.[i0] ?? 0;
        const to = s?.[i1] ?? 0;
        return { label: b.band, from, to, pctChange: from > 0 ? (to - from) / from : 0 };
      })
      .sort((a, b) => a.pctChange - b.pctChange);
  }

  const months = statewide.meta.months;
  const p0 = months.indexOf(statewide.meta.policy_start);
  const fullSpan = statewide.enrolled[months.length - 1] - statewide.enrolled[p0];
  const share = fullSpan === 0 ? 0 : (statewide.enrolled[i1] - statewide.enrolled[i0]) / fullSpan;
  return statewide.age_bands.map((b) => ({
    label: b.band,
    from: b.july_enrolled,
    to: b.july_enrolled * (1 + b.pct_change * share),
    pctChange: b.pct_change * share,
  }));
}

// -------------------------------------------------------------------- ranks

/**
 * @typedef {Object} LossRank
 * @property {number} rank - 1 = steepest percentage loss. Competition ranking: units that share a figure share a rank.
 * @property {number} tied - How many OTHER units share this unit's figure at the precision shown (0.1 points).
 * @property {number} total
 * @property {number} pct - The unit's own signed percentage change.
 * @property {number} statePct - The statewide figure, for the comparison sentence.
 * @property {number} medianPct - Median unit's percentage change — the typical county or district, not the total.
 */

/** The precision the page prints a percentage at — 0.1 points — as an integer key. */
const shownPct = (pct) => Math.round(pct * 1000);

/**
 * Where a county or district sits among its peers on percentage loss over the
 * window.
 *
 * Both a statewide figure and a median are returned because they answer
 * different questions and routinely disagree: the statewide number is dominated
 * by the metros, the median describes the typical unit. Quoting only one of
 * them is how a stat page ends up misleading.
 *
 * TIES ARE TIES. Units whose figures print the same share a rank, and `tied`
 * says how many others share it. This matters most for districts: all 24 House
 * districts inside Harris inherit Harris County's −17.1%, and ordering them by
 * apportionment rounding would hand a legislator "31st steepest" for a figure
 * that 23 other districts have too.
 */
export function lossRank(
  units,
  geoid,
  stateSeries,
  i0,
  i1,
) {
  const rows = units
    .map((c) => ({
      geoid: c.geoid,
      pct: windowChange(c.snap_enrolled, i0, i1).pct,
    }))
    .filter((r) => r.pct != null)
    // Steepest loss (most negative) first.
    .sort((a, b) => a.pct - b.pct);

  const self = rows.find((r) => r.geoid === geoid);
  if (!self) return null;

  const key = shownPct(self.pct);
  return {
    rank: 1 + rows.filter((r) => shownPct(r.pct) < key).length,
    tied: rows.filter((r) => shownPct(r.pct) === key).length - 1,
    total: rows.length,
    pct: self.pct,
    statePct: windowChange(stateSeries, i0, i1).pct ?? 0,
    medianPct: rows[Math.floor(rows.length / 2)].pct,
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
 * @typedef {Object} FunnelFit
 * @property {number} center - Caseload-weighted mean percentage change (a fraction).
 * @property {number} a - Intercept of log(|deviation, pp| + 0.5) on log(caseload).
 * @property {number} b - Slope of the same fit. Negative: the spread narrows with size.
 * @property {(caseload: number) => number} sdAt - Fitted sd, as a fraction, at a caseload.
 */

/**
 * The funnel's spread, fitted to the counties' own dispersion.
 *
 * Ported from feeding-texas-hr1's snap-enrollment-trends.qmd, so the dashboard
 * and the analysis agree on what "outside" means. Regress
 * log(|deviation from the weighted mean| + 0.5) on log(caseload), working in
 * percentage points exactly as the notebook does; the fitted value times
 * sqrt(pi/2) turns a mean absolute deviation into a standard deviation.
 *
 * Why not binomial limits: the county-to-county variation in enrollment change is
 * structural, not sampling noise, and sd = k/sqrt(caseload) put 43% of counties
 * "outside" a band meant to catch 5% (docs/SPEC-DEVIATIONS.md §Q2). The fitted
 * spread catches the ~7% the notebook reports on the policy window.
 *
 * @param {{ caseload: number, pct: number }[]} points
 * @returns {FunnelFit}
 */
export function fitFunnel(points) {
  const total = points.reduce((s, p) => s + p.caseload, 0);
  const center = total > 0 ? points.reduce((s, p) => s + p.caseload * p.pct, 0) / total : 0;

  const xs = points.map((p) => Math.log(p.caseload));
  const ys = points.map((p) => Math.log(Math.abs(100 * (p.pct - center)) + 0.5));
  const n = points.length || 1;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, k) => {
    sxy += (x - mx) * (ys[k] - my);
    sxx += (x - mx) ** 2;
  });
  // One caseload size, or one county, has no slope to fit: a flat band.
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;

  return {
    center,
    a,
    b,
    sdAt: (caseload) =>
      (Math.exp(a + b * Math.log(Math.max(1, caseload))) * Math.sqrt(Math.PI / 2)) / 100,
  };
}

/**
 * A funnel plot: percentage change against the caseload it was measured on.
 *
 * The point of this chart is to stop a reader over-reading small counties. A
 * 300-person caseload can swing 20% on sixty households, so the control limits
 * widen to the left; a county only counts as unusual if it sits outside the
 * limits FOR ITS OWN SIZE. On a plain bar chart of percentage change the top ten
 * would be ten tiny counties every time.
 *
 * The limits are refitted for the window being shown (see fitFunnel). A fixed
 * curve fitted to Jul 2025 → latest would be the wrong spread for a six-month
 * window, and the brush makes any window a first-class view.
 */
export function buildFunnel(counties, i0, i1) {
  const raw = [];
  for (const c of counties) {
    const { start, pct } = windowChange(c.snap_enrolled, i0, i1);
    if (pct == null || start <= 0) continue;
    raw.push({ geoid: c.geoid, name: c.name, caseload: start, pct });
  }

  const fit = fitFunnel(raw);
  const points = raw.map((p) => ({
    ...p,
    outside: Math.abs(p.pct - fit.center) > 2 * fit.sdAt(p.caseload),
  }));

  // The fitted curve sampled densely in log space, so funnelBand's linear
  // interpolation between samples is indistinguishable from the curve itself.
  const caseloads = raw.map((p) => p.caseload);
  const lo = Math.log10(Math.max(1, Math.min(...caseloads, 10)));
  const hi = Math.log10(Math.max(10, ...caseloads));
  const limits = Array.from({ length: 81 }, (_, k) => {
    const caseload = 10 ** (lo + ((hi - lo) * k) / 80);
    return { caseload, sd: fit.sdAt(caseload) };
  });

  return { points, center: fit.center, limits, fit: { a: fit.a, b: fit.b } };
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
