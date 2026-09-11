// Build public/data/counties.json + statewide.json — spec §3.1 and §3.3.
//
// These are FIXTURES. export_tool_data.R is unwritten (§12), so per §13 step 1 the
// build runs against synthetic data shaped exactly like the contract. Swap the
// fetch in src/data/load.ts when the real export lands; nothing else changes.
//
// Synthetic values are deterministic (seeded) and calibrated to the published
// statewide findings in the spec, so the dashboard reads plausibly while it is
// unmistakably fixture data. Every record carries `fixture: true`.

import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoCentroid } from 'd3-geo';
import { correlatedPercentiles, pearson, quintile, rng } from './lib/fixture-math.mjs';
import { KNOWN_POPULATIONS, TEXAS_POPULATION } from './lib/populations.mjs';
import * as SW from './lib/statewide.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEOMETRY = resolve(ROOT, 'public/data/geometry.json');
const SEED = 20260831;

const next = rng(SEED);
const round = (v, p = 4) => Number(v.toFixed(p));

// ---------------------------------------------------------------- geometry read
const topo = JSON.parse(readFileSync(GEOMETRY, 'utf8'));
const fc = feature(topo, topo.objects.counties);
const counties = fc.features
  .map((f) => ({
    geoid: f.properties.geoid,
    name: f.properties.name,
    centroid: geoCentroid(f).map((v) => round(v, 5)),
  }))
  .sort((a, b) => a.geoid.localeCompare(b.geoid));

if (counties.length !== 254) throw new Error(`expected 254 counties, got ${counties.length}`);

// ------------------------------------------------------------------- population
// Known metros verbatim; the remaining counties get a power law whose exponent is
// searched so that ~92 counties land under 10,000 (§3.1 small_denominator).
function buildPopulations() {
  const known = counties.filter((c) => KNOWN_POPULATIONS[c.name] != null);
  const rest = counties.filter((c) => KNOWN_POPULATIONS[c.name] == null);
  const knownTotal = known.reduce((s, c) => s + KNOWN_POPULATIONS[c.name], 0);
  const remainder = TEXAS_POPULATION - knownTotal;

  // Fixed random order for the tail, so the power law isn't correlated with FIPS.
  const shuffled = [...rest].map((c) => ({ c, k: next() })).sort((a, b) => a.k - b.k).map((x) => x.c);

  let best = null;
  for (let alpha = 0.6; alpha <= 3.2; alpha += 0.005) {
    const raw = shuffled.map((_, i) => Math.pow(i + 1, -alpha));
    const sum = raw.reduce((s, v) => s + v, 0);
    const vals = raw.map((v) => Math.max(60, Math.round((v / sum) * remainder)));
    const under = vals.filter((v) => v < 10000).length;
    const score = Math.abs(under - (92 - 0)); // no known metro is under 10k
    if (!best || score < best.score) best = { score, alpha, vals, under };
    if (score === 0) break;
  }

  const pop = new Map();
  known.forEach((c) => pop.set(c.geoid, KNOWN_POPULATIONS[c.name]));
  shuffled.forEach((c, i) => pop.set(c.geoid, best.vals[i]));
  return { pop, alpha: best.alpha, under: best.under };
}

const { pop: POP, alpha, under: smallCount } = buildPopulations();

// --------------------------------------------------------------------- scores
// Target correlation structure from the spec: D1/D2 run opposite at r = −0.30
// (§6.4) and 0.43 is the maximum pairwise correlation (§8 tab 3).
// Order: d1, d2, d3, d4.
const TARGET_CORR = [
  [1.0, -0.3, 0.43, 0.2],
  [-0.3, 1.0, 0.1, 0.35],
  [0.43, 0.1, 1.0, 0.25],
  [0.2, 0.35, 0.25, 1.0],
];

const pcts = correlatedPercentiles(counties.length, TARGET_CORR, next);

// Component counts per §6.4. d5 has no source column (§3 warning) — null, not zero.
const COMPONENTS = { d1: 5, d2: 4, d3: 7, d4: 2, d5: null };

// ------------------------------------------------------- infrastructure targets
// County coverage counts from §6.6. Assigned by weighted draw so metros are more
// likely to be covered, then trimmed/topped up to hit the exact county counts.
const INFRA_COVERAGE = { food_bank: 181, cms_navigator: 105, chw: 134, counselor: 114 };

function assignInfra(key, target) {
  // Weight by log population: bigger counties more likely to have a listed site.
  const weighted = counties
    .map((c) => ({ geoid: c.geoid, w: Math.log10(POP.get(c.geoid)) + next() * 1.6 }))
    .sort((a, b) => b.w - a.w);
  const covered = new Set(weighted.slice(0, target).map((x) => x.geoid));
  const out = new Map();
  for (const c of counties) {
    if (!covered.has(c.geoid)) {
      out.set(c.geoid, 0);
      continue;
    }
    // Site count scales loosely with population; at least one where covered.
    const p = POP.get(c.geoid);
    const base = key === 'food_bank' ? 1.1 : 0.8;
    out.set(c.geoid, Math.max(1, Math.round(base * Math.log10(p) - 1.5 + next() * 2)));
  }
  return out;
}

const INFRA = Object.fromEntries(
  Object.entries(INFRA_COVERAGE).map(([k, v]) => [k, assignInfra(k, v)]),
);

// ----------------------------------------------------------- county enrollment
// Allocate the statewide monthly totals across counties so county sums reconcile
// to the statewide series EXACTLY. Shares come from population with a SNAP-rate
// tilt (poorer/high-D4 counties enroll at higher rates); per-county decline
// intensity varies around the statewide pace, then each month is rebalanced.
const STATEWIDE = SW.buildEnrollmentSeries();

function buildCountyEnrollment(records) {
  const tilt = records.map((r) => {
    const p = POP.get(r.geoid);
    // Higher socioeconomic need (d4) → higher participation rate.
    const rate = 0.07 + 0.10 * r.d4_score + next() * 0.02;
    return { geoid: r.geoid, weight: p * rate };
  });
  const wSum = tilt.reduce((s, t) => s + t.weight, 0);
  const share = new Map(tilt.map((t) => [t.geoid, t.weight / wSum]));

  // Per-county decline multiplier: D1 exposure drives a steeper fall.
  const intensity = new Map(
    records.map((r) => [r.geoid, 0.55 + 0.9 * r.d1_score + (next() - 0.5) * 0.25]),
  );

  const series = new Map(records.map((r) => [r.geoid, []]));
  const policyStartIdx = SW.MONTHS.indexOf(SW.POLICY_START.month);

  SW.MONTHS.forEach((_, mi) => {
    const total = STATEWIDE[mi];
    // Cumulative statewide decline fraction since the policy start.
    const declineFrac =
      mi <= policyStartIdx
        ? 0
        : (STATEWIDE[policyStartIdx] - total) / STATEWIDE[policyStartIdx];

    const raw = records.map((r) => {
      const s = share.get(r.geoid);
      const f = 1 - declineFrac * intensity.get(r.geoid);
      return Math.max(0, s * Math.max(0.05, f));
    });
    const rawSum = raw.reduce((s, v) => s + v, 0);

    // Largest-remainder apportionment so the integer county values sum to the
    // statewide total exactly, with no drift accumulating across 55 months.
    const exact = raw.map((v) => (v / rawSum) * total);
    const floors = exact.map(Math.floor);
    let deficit = total - floors.reduce((s, v) => s + v, 0);
    const order = exact
      .map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < deficit; k++) floors[order[k % order.length][1]] += 1;

    records.forEach((r, i) => series.get(r.geoid).push(floors[i]));
  });

  return series;
}

// ------------------------------------------------------------------- assemble
const records = counties.map((c, i) => {
  const [d1, d2, d3, d4] = pcts[i];
  const p = POP.get(c.geoid);

  const rec = {
    geoid: c.geoid,
    name: c.name,
    pop: p,
    fixture: true,
  };

  // d1–d4 scored; d5 null until the Children layer is defined (§3 warning, §12).
  const scores = { d1, d2, d3, d4, d5: null };
  for (const [k, v] of Object.entries(scores)) {
    rec[`${k}_score`] = v == null ? null : round(v);
    rec[`${k}_tier`] = v == null ? null : quintile(v);
    rec[`${k}_n`] = COMPONENTS[k];
    // MOE widens as the denominator shrinks — the honest shape for ACS estimates.
    rec[`${k}_moe`] = v == null ? null : round(0.02 + 1.4 / Math.sqrt(p), 4);
  }

  rec.vulnerability_score = round(d1 + d2 + d3 + d4);
  rec.cumulative_impact = [d1, d2, d3, d4].filter((v) => quintile(v) === 5).length;

  // Count bases. D1 is PUMS-modelled and flagged wherever shown (§10).
  rec.newly_subject_persons = Math.round(p * (0.012 + 0.030 * d1));
  rec.noncit_snap_persons = Math.round(p * (0.002 + 0.021 * d2));

  rec.infra = {
    food_bank: INFRA.food_bank.get(c.geoid),
    cms_navigator: INFRA.cms_navigator.get(c.geoid),
    chw: INFRA.chw.get(c.geoid),
    counselor: INFRA.counselor.get(c.geoid),
  };

  rec.small_denominator = p < 10000;
  rec.centroid = c.centroid;
  return rec;
});

// is_gap needs the vulnerability quintile across the whole set, so it runs after.
const vulnSorted = [...records].sort((a, b) => a.vulnerability_score - b.vulnerability_score);
const q5Cut = vulnSorted[Math.floor(vulnSorted.length * 0.8)].vulnerability_score;
for (const r of records) {
  r.is_gap =
    r.vulnerability_score >= q5Cut && r.infra.food_bank === 0 && r.infra.cms_navigator === 0;
}

// Tile-cartogram lattice (§3.1 grid, §6.5 Grid style). Precomputed and fixed —
// never solved at runtime. Counties map to their nearest free cell on a 22×24
// lattice derived from centroid position, so the cartogram keeps Texas's shape.
function assignGrid(cols = 22, rows = 24) {
  const lons = records.map((r) => r.centroid[0]);
  const lats = records.map((r) => r.centroid[1]);
  const [lo0, lo1] = [Math.min(...lons), Math.max(...lons)];
  const [la0, la1] = [Math.min(...lats), Math.max(...lats)];

  const taken = new Map();
  // Place biggest-population first so metros hold their true position and small
  // rural counties absorb the displacement.
  const order = [...records].sort((a, b) => b.pop - a.pop);

  for (const r of order) {
    const c0 = Math.round(((r.centroid[0] - lo0) / (lo1 - lo0)) * (cols - 1));
    const r0 = Math.round(((la1 - r.centroid[1]) / (la1 - la0)) * (rows - 1));

    let placed = null;
    for (let radius = 0; radius < Math.max(cols, rows) && !placed; radius++) {
      const candidates = [];
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          const rr = r0 + dr;
          const cc = c0 + dc;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
          const key = `${rr},${cc}`;
          if (taken.has(key)) continue;
          candidates.push({ rr, cc, d: Math.hypot(dr, dc) });
        }
      }
      candidates.sort((a, b) => a.d - b.d || a.rr - b.rr || a.cc - b.cc);
      if (candidates.length) placed = candidates[0];
    }
    if (!placed) throw new Error(`no free grid cell for ${r.name}`);
    taken.set(`${placed.rr},${placed.cc}`, r.geoid);
    r.grid = { r: placed.rr, c: placed.cc };
  }
  return { cols, rows };
}
const gridDims = assignGrid();

// Monthly enrollment last, since it reads d1/d4 scores.
const enrollment = buildCountyEnrollment(records);
for (const r of records) r.snap_enrolled = enrollment.get(r.geoid);

// ------------------------------------------------------------ child enrollment
// snap_children — enrolled under-18s per county per month, for the Children view
// added 2026-09-10.
//
// NOT in the spec's §3.1 contract and NOT produced by build_scores.R; see
// docs/SPEC-DEVIATIONS.md §A4. The spec's §3 warning forbids synthesising a D5
// SCORE from the statewide age bands, and this does not do that — there is no
// d5_score here and there still isn't one. What this builds is a fixture for a
// COUNT series the real export owes, calibrated so the statewide child total
// reconciles to the published age-band arithmetic exactly.
//
// The statewide child trajectory comes from the two under-18 bands; the county
// split is population-driven with a socioeconomic-need tilt, then apportioned by
// largest remainder so every month sums to the statewide child total.
function buildChildEnrollment(records, enrolled) {
  const childBands = SW.AGE_BANDS.filter((b) => b.band === 'Under 5' || b.band === '5–17');
  const julyAll = SW.AGE_BANDS.reduce((s, b) => s + b.julyEnrolled, 0);
  const julyChild = childBands.reduce((s, b) => s + b.julyEnrolled, 0);

  // Share of the caseload that is children at the policy start, and at the
  // latest month — children fall slightly faster than the caseload as a whole
  // (−16.7% against −15.5%), so the share drifts down rather than holding.
  const shareStart = julyChild / julyAll;
  const childPct =
    childBands.reduce((s, b) => s + b.julyEnrolled * b.pctChange, 0) / julyChild;
  const allPct = (SW.LATEST.value - SW.POLICY_START.value) / SW.POLICY_START.value;
  const shareLatest = shareStart * ((1 + childPct) / (1 + allPct));

  const policyStartIdx = SW.MONTHS.indexOf(SW.POLICY_START.month);
  const lastIdx = SW.MONTHS.length - 1;

  // Statewide child series: the share moves linearly from shareStart to
  // shareLatest across the policy window, and is flat before it.
  const childTotals = SW.MONTHS.map((_, mi) => {
    const t = mi <= policyStartIdx ? 0 : (mi - policyStartIdx) / (lastIdx - policyStartIdx);
    return Math.round(STATEWIDE[mi] * (shareStart + (shareLatest - shareStart) * t));
  });

  // Per-county child share of its own caseload: higher socioeconomic need means
  // a younger caseload. Kept inside a plausible band rather than left to the
  // draw — a county with 15% or 70% children would be a finding, not a fixture.
  const tilt = new Map(
    records.map((r) => [
      r.geoid,
      Math.min(1.28, Math.max(0.74, 0.86 + 0.28 * r.d4_score + (next() - 0.5) * 0.12)),
    ]),
  );

  const series = new Map(records.map((r) => [r.geoid, []]));

  SW.MONTHS.forEach((_, mi) => {
    const total = childTotals[mi];
    const raw = records.map((r) => enrolled.get(r.geoid)[mi] * tilt.get(r.geoid));
    const rawSum = raw.reduce((s, v) => s + v, 0);

    const exact = raw.map((v) => (v / rawSum) * total);
    const floors = exact.map(Math.floor);
    const deficit = total - floors.reduce((s, v) => s + v, 0);
    const order = exact
      .map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < deficit; k++) floors[order[k % order.length][1]] += 1;

    records.forEach((r, i) => {
      // Children cannot outnumber the caseload they are part of.
      series.get(r.geoid).push(Math.min(floors[i], enrolled.get(r.geoid)[mi]));
    });
  });

  return { series, childTotals };
}

const { series: childSeries, childTotals } = buildChildEnrollment(records, enrollment);
for (const r of records) r.snap_children = childSeries.get(r.geoid);

// ------------------------------------------------------------------- statewide
const monthlyChange = STATEWIDE.map((v, i) => (i === 0 ? null : v - STATEWIDE[i - 1]));
const policyIdx = SW.MONTHS.indexOf(SW.POLICY_START.month);

const statewide = {
  fixture: true,
  meta: {
    months: SW.MONTHS,
    history_months: SW.HISTORY_MONTHS,
    policy_start: SW.POLICY_START.month,
    latest: SW.LATEST.month,
    texas_population: TEXAS_POPULATION,
    grid: gridDims,
    generated_from: 'scripts/build-fixtures.mjs',
    seed: SEED,
  },
  enrolled: STATEWIDE,
  monthly_change: monthlyChange,
  participation_share: STATEWIDE.map((v) => round(v / TEXAS_POPULATION, 5)),
  age_bands: SW.AGE_BANDS.map((b) => ({
    band: b.band,
    july_enrolled: b.julyEnrolled,
    latest_enrolled: Math.round(b.julyEnrolled * (1 + b.pctChange)),
    pct_change: b.pctChange,
  })),
  people_vs_households: SW.PEOPLE_VS_HOUSEHOLDS,
  county_type_rollup: SW.COUNTY_TYPE_ROLLUP,
  // Funnel-plot control limits (§8 tab 5): binomial-ish spread around the
  // statewide percent change, widening as caseload shrinks.
  funnel: {
    center: round((SW.LATEST.value - SW.POLICY_START.value) / SW.POLICY_START.value, 4),
    limits: [200, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000].map((caseload) => ({
      caseload,
      sd: round(0.9 / Math.sqrt(caseload), 5),
    })),
  },
};

// ---------------------------------------------------------------------- verify
const corrOf = (a, b) => pearson(records.map((r) => r[a]), records.map((r) => r[b]));
const cumDist = [0, 1, 2, 3, 4].map(
  (n) => records.filter((r) => r.cumulative_impact === n).length,
);

const countySums = SW.MONTHS.map((_, mi) =>
  records.reduce((s, r) => s + r.snap_enrolled[mi], 0),
);
const mismatch = countySums.findIndex((v, i) => v !== STATEWIDE[i]);
if (mismatch !== -1) {
  throw new Error(
    `county enrollment does not reconcile at ${SW.MONTHS[mismatch]}: ` +
      `${countySums[mismatch]} vs ${STATEWIDE[mismatch]}`,
  );
}

const policyChildIdx = SW.MONTHS.indexOf(SW.POLICY_START.month);
const childWindowPct =
  (childTotals[childTotals.length - 1] - childTotals[policyChildIdx]) /
  childTotals[policyChildIdx];
const childShareLatest = childTotals[childTotals.length - 1] / STATEWIDE[STATEWIDE.length - 1];
const childOverCaseload = records.filter((r) =>
  r.snap_children.some((v, i) => v > r.snap_enrolled[i]),
).length;
if (childOverCaseload > 0) {
  throw new Error(`${childOverCaseload} counties report more children than enrolled individuals`);
}

const countyWindowChange = records.reduce(
  (s, r) => s + (r.snap_enrolled[r.snap_enrolled.length - 1] - r.snap_enrolled[policyIdx]),
  0,
);

// ----------------------------------------------------------------------- write
const write = (name, obj) => {
  const path = resolve(ROOT, 'public/data', name);
  const json = JSON.stringify(obj);
  writeFileSync(path, json);
  const gz = gzipSync(Buffer.from(json)).length;
  console.log(
    `  ${name.padEnd(16)} ${(json.length / 1024).toFixed(1).padStart(7)}KB raw  ` +
      `${(gz / 1024).toFixed(1).padStart(6)}KB gz`,
  );
};

console.log(`seed ${SEED} · power-law alpha ${alpha.toFixed(3)}\n`);
write('counties.json', records);
write('statewide.json', statewide);

console.log('\nfixture checks');
console.log(`  small_denominator counties   ${smallCount} (spec says 92)`);
console.log(`  infra coverage               ${Object.entries(INFRA_COVERAGE)
  .map(([k, v]) => `${k}=${records.filter((r) => r.infra[k] > 0).length}/${v}`)
  .join('  ')}`);
console.log(`  gap counties                 ${records.filter((r) => r.is_gap).length}`);
console.log(`  cumulative impact 0–4        ${cumDist.join(' / ')} (spec says 113 / 91 / 38 / 11 / 1)`);
console.log(`  corr d1/d2                   ${corrOf('d1_score', 'd2_score').toFixed(3)} (target -0.300)`);
console.log(`  corr d1/d3                   ${corrOf('d1_score', 'd3_score').toFixed(3)} (target  0.430)`);
console.log(`  county sums reconcile         all ${SW.MONTHS.length} months exact`);
console.log(`  county window change         ${countyWindowChange.toLocaleString()} (statewide -547,051)`);
console.log(`  child change since policy    ${(childWindowPct * 100).toFixed(1)}% (age bands say -16.7%)`);
console.log(`  child share of latest        ${(childShareLatest * 100).toFixed(1)}% (July share 42.5%)`);
console.log(`  population total             ${records.reduce((s, r) => s + r.pop, 0).toLocaleString()}`);
