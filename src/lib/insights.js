/**
 * Scope resolution for the Insights page.
 *
 * Every chart on that page reads from a `Scope` — Texas as a whole, one county,
 * or one TX House, TX Senate or US House district — so switching scope is a data swap rather
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
 * Every series on a Scope — enrollment, children, payments and the
 * five age bands — exists per county and per district and reconciles to the
 * statewide totals exactly (see scripts/build-county-data.mjs), so every chart
 * on the page describes the place picked.
 *
 * @typedef {import('../types').County} County
 * @typedef {import('../types').Statewide} Statewide
 */
import { fmtDollars, fmtMonthBody, fmtPct, fmtPctDelta } from './format.js';
import { changeShare, windowEnds } from './series.js';

/**
 * @typedef {Object} Scope
 * @property {string} key - 'state', a county geoid, or a district key ("txhouse-133").
 * @property {'state' | 'county' | 'district'} kind
 * @property {string} label - "Texas", "Harris County" or "House District 133".
 * @property {number} population - Resident population — the participation-rate denominator.
 * @property {number[]} enrolled - Monthly enrolled individuals, parallel to meta.months.
 * @property {number[] | null} children - Monthly enrolled children, or null where the series is missing.
 * @property {number[] | null} payments - Monthly SNAP benefits paid, whole dollars, or null where missing.
 * @property {Record<string, number[]>} ageSeries - Monthly enrolled per age band, keyed "Under 5" … "65+".
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
      payments: district.snap_payments ?? null,
      ageSeries: district.snap_age,
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
        payments: county.snap_payments ?? null,
        ageSeries: county.snap_age,
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
  const sumCounties = (field) => {
    const n = counties[0]?.[field]?.length ?? 0;
    return n
      ? Array.from({ length: n }, (_, i) => counties.reduce((sum, c) => sum + (c[field]?.[i] ?? 0), 0))
      : null;
  };

  return {
    key: 'state',
    kind: 'state',
    label: 'Texas',
    population: statewide.meta.texas_population,
    enrolled: statewide.enrolled,
    children: sumCounties('snap_children'),
    payments: sumCounties('snap_payments'),
    ageSeries: statewide.age_series,
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

// ------------------------------------------------------------------- series

/**
 * How many fewer people a series counts at the window's end than at its start —
 * positive for a loss. null when either end is missing.
 */
export function windowLoss(series, i0, i1) {
  const ends = windowEnds(series, i0, i1);
  return ends ? ends.start - ends.end : null;
}

/**
 * The shortfall's label and value, for the hero and the Insights report. A
 * place above its yardstick says so — "More spent", "+$19.7K" — rather than
 * reading as $0 less.
 *
 * @param {number} total - benefitShortfall's total, positive for less.
 */
export function shortfallLabels(total) {
  return total >= 0
    ? { label: 'Less spent at SNAP-authorized stores', value: fmtDollars(total) }
    : { label: 'More spent at SNAP-authorized stores', value: `+${fmtDollars(-total)}` };
}

/** Months averaged for the shortfall's yardstick: the year up to the window's start. */
export const SHORTFALL_BASE_MONTHS = 12;

/**
 * SNAP money that did not reach the scope's grocery stores over the window, as
 * an estimate. The yardstick is the average month over the year ending with the
 * window's start (fewer months where the series begins later): a single month
 * would let one high or low month set it, and a year spans one October benefit
 * increase. Each month after the start, the yardstick minus benefits paid,
 * summed. Net: a month above the yardstick counts against the total. One
 * definition for the hero, the Insights report and the Map story's chart.
 *
 * @returns {{ total: number, monthly: number, base: number, baseFrom: number } | null}
 *   `monthly` is the latest month's gap, positive for less; `baseFrom` is the
 *   index of the first month averaged. null without a payments series.
 */
export function benefitShortfall(payments, i0, i1) {
  if (!payments || payments[i0] == null || payments[i1] == null) return null;
  const baseFrom = Math.max(0, i0 - SHORTFALL_BASE_MONTHS + 1);
  const ref = payments.slice(baseFrom, i0 + 1).filter(Number.isFinite);
  const base = ref.reduce((t, v) => t + v, 0) / ref.length;
  let total = 0;
  for (let i = i0 + 1; i <= i1; i++) if (Number.isFinite(payments[i])) total += base - payments[i];
  return { total, monthly: base - payments[i1], base, baseFrom };
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
  return { start, end, absolute: end - start, pct: changeShare({ start, end }) };
}

/**
 * @typedef {Object} AgeRow
 * @property {string} label
 * @property {number} from - Enrolled at the window start.
 * @property {number} to - Enrolled at the window end.
 * @property {number} pctChange - Signed fraction.
 */

/**
 * Enrolled individuals per age band across a window, youngest band first.
 *
 * @param {Record<string, number[]>} ageSeries - A Scope's ageSeries, or statewide.age_series.
 * @returns {AgeRow[]}
 */
export function ageBandRows(ageSeries, i0, i1) {
  return Object.entries(ageSeries).map(([label, s]) => {
    const from = s[i0] ?? 0;
    const to = s[i1] ?? 0;
    return { label, from, to, pctChange: changeShare({ start: from, end: to }) ?? 0 };
  });
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
 * Percentage change against the caseload it was measured on, with control
 * limits that widen as caseload shrinks — statewide.json's `funnel`, written by
 * the data build.
 *
 * A 300-person caseload can swing 20% on sixty households, so a county only
 * counts as unusual if it sits outside the limits FOR ITS OWN SIZE.
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

  // The fitted curve sampled densely in log space, so straight lines between
  // samples are indistinguishable from the curve itself.
  const caseloads = raw.map((p) => p.caseload);
  const lo = Math.log10(Math.max(1, Math.min(...caseloads, 10)));
  const hi = Math.log10(Math.max(10, ...caseloads));
  const limits = Array.from({ length: 81 }, (_, k) => {
    const caseload = 10 ** (lo + ((hi - lo) * k) / 80);
    return { caseload, sd: fit.sdAt(caseload) };
  });

  return { points, center: fit.center, limits, fit: { a: fit.a, b: fit.b } };
}

// ------------------------------------------------------- headline figures

/** How a band reads in a sentence: "18–59" → "adults 18–59". */
function bandPhrase(band) {
  if (band === 'Under 5') return 'children under 5';
  if (band === '5–17') return 'children 5–17';
  return `adults ${band}`;
}

/**
 * The hero band's three statewide figures, for the brush window [i0, i1].
 * Computed, so dragging the window moves all three.
 *
 * @param {import('../types').Statewide} statewide
 * @param {number[] | null} payments - Statewide SNAP benefits paid each month (the counties' sum).
 * @returns {{ label?: string; value: string; body: string; tone?: 'negative' }[]}
 */
export function headlineStats(statewide, payments, i0, i1) {
  const months = statewide.meta.months;
  const from = fmtMonthBody(months[i0]);
  const to = fmtMonthBody(months[i1]);
  const out = [];

  /*
     1. The steepest age band, against everyone on SNAP: the whole caseload is
     the steadier comparison, and it is the hero number's own rate.
  */
  const rows = ageBandRows(statewide.age_series, i0, i1);
  if (rows.length) {
    const steep = rows.reduce((a, b) => (b.pctChange < a.pctChange ? b : a));
    const band = bandPhrase(steep.label);
    const all = changeShare(windowEnds(statewide.enrolled, i0, i1));
    const body =
      all == null
        ? 'The steepest drop of any age group.'
        : `The steepest drop of any age group, against ${fmtPctDelta(all)} for all Texans on SNAP.`;
    out.push({
      label: band.charAt(0).toUpperCase() + band.slice(1),
      value: fmtPctDelta(steep.pctChange),
      body,
      tone: steep.pctChange < 0 ? 'negative' : undefined,
    });
  }

  /*
     2. SNAP money that did not reach SNAP-authorized stores over the window —
     the same arithmetic as the Insights report and the Map story's figure.
  */
  const short = benefitShortfall(payments, i0, i1);
  if (short) {
    const since = months[i0] === statewide.meta.policy_start ? 'H.R. 1' : from;
    out.push({
      ...shortfallLabels(short.total),
      body:
        short.total >= 0
          ? `Estimated SNAP benefits not going to Texans since ${since}, against a typical month in the year before.`
          : `Estimated extra SNAP benefits going to Texans since ${since}, against a typical month in the year before.`,
      tone: short.total > 0 ? 'negative' : undefined,
    });
  }

  // 3. Participation at the window's end, against its start.
  const share = statewide.participation_share;
  if (share?.[i1] != null && share?.[i0] != null) {
    const dir = share[i1] < share[i0] ? 'down' : share[i1] > share[i0] ? 'up' : 'unchanged';
    out.push({
      label: 'Texans enrolled',
      value: fmtPct(share[i1]),
      body:
        dir === 'unchanged'
          ? `In ${to}, the same as in ${from}.`
          : `In ${to}, ${dir} from ${fmtPct(share[i0])} in ${from}.`,
    });
  }
  return out;
}
