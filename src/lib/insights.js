/**
 * Scope resolution for the Insights page.
 *
 * Every chart on that page reads from a `Scope` — Texas as a whole, one county,
 * several counties added together, or one TX House, TX Senate or US House
 * district — so switching scope is a data swap rather
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
import { fmtDelta, fmtDollars, fmtInt, fmtMonthBody, fmtPct, fmtPctDelta } from './format.js';
import { changeShare, windowEnds } from './series.js';

/**
 * @typedef {Object} Scope
 * @property {string} key - 'state', a county geoid, or a district key ("txhouse-133").
 * @property {'state' | 'county' | 'counties' | 'district'} kind - 'counties' is several counties, summed.
 * @property {string} label - "Texas", "Harris County", "Harris and Fort Bend counties" or "House District 133".
 * @property {number} population - Resident population — the participation-rate denominator.
 * @property {number[]} enrolled - Monthly enrolled individuals, parallel to meta.months.
 * @property {number[] | null} children - Monthly enrolled children, or null where the series is missing.
 * @property {number[] | null} payments - Monthly SNAP benefits paid, whole dollars, or null where missing.
 * @property {Record<string, number[]>} ageSeries - Monthly enrolled per age band, keyed "Under 5" … "65+".
 * @property {County | null} county - The county record when kind is 'county', else null.
 * @property {County[]} counties - The counties summed when kind is 'counties', in the order picked; else empty.
 * @property {import('../data/load').DistrictUnit | null} district - The district when kind is 'district', else null.
 */

/**
 * One monthly series summed over some counties, or null where none carries it.
 * A county missing a month counts as zero for that month, as in the data build.
 */
function sumSeries(list, field) {
  const n = list.find((c) => c[field])?.[field].length ?? 0;
  return n
    ? Array.from({ length: n }, (_, i) => list.reduce((sum, c) => sum + (c[field]?.[i] ?? 0), 0))
    : null;
}

/** "Harris and Fort Bend counties", "Harris, Fort Bend and Galveston counties", "Harris, Fort Bend and 3 other counties". */
export function countiesLabel(names) {
  if (names.length <= 2) return `${names.join(' and ')} counties`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} counties`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other counties`;
}

export function buildScope(
  counties,
  byGeoid,
  statewide,
  geoid,
  districtCounts = null,
) {
  /*
     Several counties: every series is the counties' sum, so each chart reads
     the group as one place. Unknown geoids drop out; one left is a plain county.
  */
  const picked = geoid?.includes(',')
    ? geoid.split(',').map((g) => byGeoid.get(g)).filter(Boolean)
    : [];
  if (picked.length === 1) geoid = picked[0].geoid;
  if (picked.length > 1) {
    const bands = Object.keys(picked[0].snap_age ?? {});
    return {
      key: picked.map((c) => c.geoid).join(','),
      kind: 'counties',
      label: countiesLabel(picked.map((c) => c.name)),
      population: picked.reduce((sum, c) => sum + c.pop, 0),
      enrolled: sumSeries(picked, 'snap_enrolled'),
      children: sumSeries(picked, 'snap_children'),
      payments: sumSeries(picked, 'snap_payments'),
      ageSeries: Object.fromEntries(
        bands.map((b) => [
          b,
          picked[0].snap_age[b].map((_, i) => picked.reduce((sum, c) => sum + (c.snap_age?.[b]?.[i] ?? 0), 0)),
        ]),
      ),
      county: null,
      counties: picked,
      district: null,
    };
  }

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
      counties: [],
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
        counties: [],
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
  return {
    key: 'state',
    kind: 'state',
    label: 'Texas',
    population: statewide.meta.texas_population,
    enrolled: statewide.enrolled,
    children: sumSeries(counties, 'snap_children'),
    payments: sumSeries(counties, 'snap_payments'),
    ageSeries: statewide.age_series,
    county: null,
    counties: [],
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
 * The shortfall's label and value, for the hero and the Insights report. The
 * label names what changed and the sign says which way: "−$964M" for less
 * spent, "+$19.7K" for a place above its yardstick.
 *
 * @param {number} total - benefitShortfall's total, positive for less.
 */
export const SPENDING_LABEL = 'Change in SNAP spending at authorized stores';

export function shortfallLabels(total) {
  return {
    label: SPENDING_LABEL,
    value: total > 0 ? fmtDollars(-total) : total < 0 ? `+${fmtDollars(-total)}` : '$0',
  };
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

/** The three age groups the Insights pie splits a loss into, from HHSC's five bands. */
export const AGE_GROUPS = [
  { label: '0–17', bands: ['Under 5', '5–17'], noun: 'Children under 18' },
  { label: '18–64', bands: ['18–59', '60–64'], noun: 'Adults 18–64' },
  { label: '65+', bands: ['65+'], noun: 'Adults 65 and older' },
];

/**
 * @typedef {Object} AgeGroupLoss
 * @property {string} label - "0–17", "18–64" or "65+".
 * @property {number} from - Enrolled at the window start.
 * @property {number} to - Enrolled at the window end.
 * @property {number} lost - from − to; negative where the group grew.
 * @property {number} pctChange - Signed change as a fraction of `from` (−0.2 is a 20% loss).
 * @property {number} share - Of everyone lost in the groups that lost, 0 where the group did not.
 */

/**
 * Who left SNAP over the window, in three age groups — the Insights pie, and
 * the arrow chart's rows (they carry `from`, `to` and `pctChange`). A share is of the people
 * lost in the groups that lost: a group that grew has no slice of a loss, so
 * its gain is not netted against the others (the shares add to 100%).
 *
 * @param {Record<string, number[]>} ageSeries - A Scope's ageSeries.
 * @returns {AgeGroupLoss[] | null} null where a band is missing.
 */
export function ageGroupLoss(ageSeries, i0, i1) {
  if (AGE_GROUPS.some((g) => g.bands.some((b) => !ageSeries?.[b]))) return null;
  const rows = AGE_GROUPS.map((g) => {
    const from = g.bands.reduce((sum, b) => sum + (ageSeries[b][i0] ?? 0), 0);
    const to = g.bands.reduce((sum, b) => sum + (ageSeries[b][i1] ?? 0), 0);
    return { label: g.label, from, to, lost: from - to, pctChange: changeShare({ start: from, end: to }) ?? 0 };
  });
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.lost), 0);
  return rows.map((r) => ({ ...r, share: total > 0 && r.lost > 0 ? r.lost / total : 0 }));
}

/**
 * The age pie's title: the group with the most people lost, and its share.
 * "Children under 18 were the largest group to lose SNAP, at 52.6% of everyone who left".
 * null when no group lost.
 *
 * @param {AgeGroupLoss[] | null} rows
 */
export function ageLeadTitle(rows) {
  const lead = rows?.reduce((a, b) => (b.lost > a.lost ? b : a));
  if (!lead || lead.lost <= 0) return null;
  const noun = AGE_GROUPS.find((g) => g.label === lead.label).noun;
  return `${noun} were the largest group to lose SNAP, at ${fmtPct(lead.share)} of everyone who left`;
}

/** "a", "a and b", "a, b and c". */
const andList = (items) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** A group's name mid-sentence: "children under 18". */
const groupNoun = (label) => {
  const noun = AGE_GROUPS.find((g) => g.label === label).noun;
  return noun.charAt(0).toLowerCase() + noun.slice(1);
};

/**
 * The "Who is falling off" section's sentence: how many of each age group
 * left. The total is only stated when every group lost, so it matches the
 * Enrollment section's number; a group that grew is named as growing instead.
 *
 * @param {AgeGroupLoss[] | null} rows
 * @param {string} where - " in Harris County", or '' for Texas.
 * @param {string} since - "July 2025".
 */
export function whoHeadline(rows, where, since) {
  if (!rows) return null;
  const lost = rows.filter((r) => r.lost > 0);
  const grew = rows.filter((r) => r.lost < 0);
  if (!lost.length) return `No age group${where} has fewer people on SNAP than in ${since}.`;
  if (!grew.length) {
    const total = lost.reduce((sum, r) => sum + r.lost, 0);
    return (
      `Of the ${fmtInt(total)} individuals who left SNAP${where} since ${since}, ` +
      `${andList(lost.map((r) => `${fmtInt(r.lost)} are ${groupNoun(r.label)}`))}.`
    );
  }
  return (
    `Since ${since}, ${andList(lost.map((r) => `${fmtInt(r.lost)} ${groupNoun(r.label)}`))} left SNAP${where}, ` +
    `while ${andList(grew.map((r) => `${groupNoun(r.label)} on SNAP grew by ${fmtInt(-r.lost)}`))}.`
  );
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
  // A no-break space, so a wrapped line never ends on "H.R.".
  const since = months[i0] === statewide.meta.policy_start ? 'H.R.\u00a01' : from;
  const out = [];

  // 1. The whole caseload's change: the hero number above, as a share.
  const all = windowEnds(statewide.enrolled, i0, i1);
  const allShare = changeShare(all);
  if (allShare != null) {
    out.push({
      label: 'Change in Texans on SNAP',
      value: fmtPctDelta(allShare),
      body: `As a share of enrollment, since ${since}.`,
      tone: allShare < 0 ? 'negative' : undefined,
    });
  }

  /*
     2. Children under 18 (the two youngest age bands), and their share of
     everyone who left. The share is only stated while it is a share: both fell,
     and the children's loss is not bigger than the whole (adults gaining).
  */
  const under5 = windowEnds(statewide.age_series?.['Under 5'], i0, i1);
  const school = windowEnds(statewide.age_series?.['5–17'], i0, i1);
  if (under5 && school && all) {
    const childLost = under5.start + school.start - (under5.end + school.end);
    const allLost = all.start - all.end;
    out.push({
      label: 'Change in children on SNAP',
      value: childLost === 0 ? '0' : fmtDelta(-childLost),
      body:
        childLost > 0 && allLost >= childLost
          ? `${fmtPct(childLost / allLost)} of all Texans who left SNAP since ${since}.`
          : `Children under 18, since ${since}.`,
      tone: childLost > 0 ? 'negative' : undefined,
    });
  }

  /*
     3. SNAP money that did not reach SNAP-authorized stores over the window —
     the same arithmetic as the Insights report and the Map story's figure.
  */
  const short = benefitShortfall(payments, i0, i1);
  if (short) {
    out.push({
      ...shortfallLabels(short.total),
      body:
        short.total >= 0
          ? `Estimated SNAP benefits not going to Texans since ${since}, against a typical month in the year before.`
          : `Estimated extra SNAP benefits going to Texans since ${since}, against a typical month in the year before.`,
      tone: short.total > 0 ? 'negative' : undefined,
    });
  }

  return out;
}
