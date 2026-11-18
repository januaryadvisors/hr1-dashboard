/**
 * The figures the story's copy quotes (config/story.js), computed from the data
 * and the brush window so no number is ever typed into the copy.
 */
import { COUNTY_TYPES, RULES_MONTH } from '../config/story';
import { benefitShortfall } from './insights';
import { fmtDollarsLong, fmtInt, fmtMonthBody, fmtMonthFull, fmtPct, fmtThousands } from './format';
import { median } from './stats';

/** The counties of each type: { Metro: [...], Micro: [...], Rural: [...] }. */
export function groupByCountyType(counties) {
  return Object.fromEntries(
    COUNTY_TYPES.map((t) => [t, counties.filter((c) => c.county_type === t)]),
  );
}

/** People newly subject to work rules per 100 enrollees at month i0, or null. */
export function subjectPer100(county, i0) {
  const enrolled = county.snap_enrolled?.[i0];
  return enrolled > 0 ? ((county.newly_subject_persons ?? 0) / enrolled) * 100 : null;
}

/** Median of read(county) for each county type. */
function medianByType(counties, read) {
  const groups = groupByCountyType(counties);
  return Object.fromEntries(
    COUNTY_TYPES.map((t) => [t, median(groups[t].map(read))]),
  );
}

/** 56,789 → "57,000". */
const roundThousands = (v) => (Number.isFinite(v) ? fmtInt(Math.round(v / 1000) * 1000) : null);
const pctOf = (v) => fmtPct(Math.abs(v), 1);
const yes = (claim) => (claim ? 'yes' : null);

/** Who lost SNAP over the window, by age, and the work-rule figures. */
function enrollmentFacts({ counties, statewide, i0, i1, windowChange }) {
  const f = {};
  const lost = Math.max(0, -windowChange);
  const band = (name) => statewide.age_series?.[name];
  const drop = (series) => (series ? series[i0] - series[i1] : 0);

  const childLost = drop(band('Under 5')) + drop(band('5–17'));
  const adultLost = drop(band('18–59'));
  const childStart = (band('Under 5')?.[i0] ?? 0) + (band('5–17')?.[i0] ?? 0);

  f.childrenK = roundThousands(childLost);
  f.childrenShortK = childLost >= 1000 ? `${fmtThousands(childLost)}k` : null;
  f.adultsK = roundThousands(adultLost);
  f.youngShare = lost > 0 ? `${Math.round(((childLost + adultLost) / lost) * 100)}%` : null;
  f.childShare = lost > 0 && childLost > 0 && childLost <= lost ? fmtPct(childLost / lost) : null;
  f.childDropPct = childStart > 0 && childLost > 0 ? fmtPct(childLost / childStart) : null;

  const subject = counties.reduce((sum, c) => sum + (c.newly_subject_persons ?? 0), 0);
  const enrolledAtStart = statewide.enrolled[i0];
  f.newlySubjectK = roundThousands(subject);
  f.oneIn = enrolledAtStart > 0 && subject > 0 ? String(Math.round(enrolledAtStart / subject)) : null;

  // "Similar in every kind of county" is only claimed while the medians sit within 3 per 100.
  const workMedians = Object.values(medianByType(counties, (c) => subjectPer100(c, i0)))
    .filter(Number.isFinite)
    .map(Math.round);
  const lo = Math.min(...workMedians);
  const hi = Math.max(...workMedians);
  if (workMedians.length === COUNTY_TYPES.length && hi - lo <= 3) {
    f.workRange = lo === hi ? `about ${lo}` : `${lo} to ${hi}`;
  }

  f.compRural = medianByType(counties, (c) => c.vulnerability_score).Rural?.toFixed(2) ?? null;
  return f;
}

/** The published SNAP series: pace since the rules, and payments since H.R. 1. Not windowed. */
function snapFacts(snap, policyStart) {
  const f = {};
  const months = snap.months;
  const people = snap.statewide.individuals;
  const last = months.length - 1;
  const rules = months.indexOf(RULES_MONTH);
  const signed = months.indexOf(policyStart);

  f.snapSourceUrl = snap.source_url;
  f.snapRange = `${fmtMonthBody(months[0])} – ${fmtMonthBody(months[last])}`;

  if (rules > 0 && last > rules) {
    const avg = (people[rules] - people[last]) / (last - rules);
    f.avgMonthlyK = avg > 0 ? roundThousands(avg) : null;
    f.fellEveryMonth = yes(people.slice(rules, last + 1).every((v, i, a) => i === 0 || v < a[i - 1]));
    f.stillFalling = yes(people[last] < people[last - 1]);
    f.rulesMonth = fmtMonthFull(RULES_MONTH);
  }

  // Same arithmetic as the hero's spending figure, so the two agree.
  const short = signed >= 0 && last > signed ? benefitShortfall(snap.statewide.payments, signed, last) : null;
  if (short) {
    f.shortfallAmount = fmtDollarsLong(short.total);
    f.shortfallMore = yes(short.total < 0);
    f.shortfallFrom = fmtMonthFull(months[signed + 1]);
    f.shortfallTo = fmtMonthFull(months[last]);
    f.baseRange = `${fmtMonthBody(months[short.baseFrom])} – ${fmtMonthBody(months[signed])}`;
  }
  return f;
}

/** ACA Marketplace: the drop since last December, and sign-ups that never paid. */
function marketplaceFacts(marketplace) {
  const f = {};
  const { months, values } = marketplace.effectuated;
  const last = months.length - 1;
  const from = months.indexOf(`${Number(months[last].slice(0, 4)) - 1}-12`);

  f.mktSourceUrl = marketplace.source_url;
  f.oepSourceUrl = marketplace.oep_source_url;
  f.mktRange = `${fmtMonthBody(months[0])} – ${fmtMonthBody(months[last])}`;

  const drop = from >= 0 && from < last ? values[from] - values[last] : 0;
  if (drop > 0) {
    f.mktDrop = fmtInt(drop);
    f.mktDropPct = pctOf(drop / values[from]);
    f.mktFrom = fmtMonthFull(months[from]);
    f.mktTo = fmtMonthFull(months[last]);
  }

  const latest = marketplace.oep.filter((o) => o.not_effectuated_share != null).at(-1);
  if (latest) {
    f.neverLatest = pctOf(latest.not_effectuated_share);
    f.neverOneIn = String(Math.round(1 / latest.not_effectuated_share));
    f.selLatestM = (latest.plan_selections / 1e6).toFixed(2);
    f.oepLatest = String(latest.year);
  }
  return f;
}

/**
 * Every fact the story copy can quote. The SNAP and Marketplace files are
 * optional; their facts are simply absent when a file did not load.
 */
export function buildStoryFacts({ counties, statewide, window, i0, i1, windowChange, snap, marketplace }) {
  return {
    windowStartLong: fmtMonthFull(window[0]),
    windowEndLong: fmtMonthFull(window[1]),
    ...enrollmentFacts({ counties, statewide, i0, i1, windowChange }),
    ...(snap ? snapFacts(snap, statewide.meta.policy_start) : {}),
    ...(marketplace ? marketplaceFacts(marketplace) : {}),
  };
}
