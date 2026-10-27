// Build public/data/counties.json, statewide.json, snap-observed.json and
// district-counts.json from the analysis repo's data-clean/ outputs — spec §3.1
// and §3.3, on REAL data.
//
// This replaces scripts/build-fixtures.mjs, which synthesised every county value
// (populations, domain scores, enrollment, children, infrastructure) and only
// pinned the statewide endpoints to the published figures. Nothing here is
// synthetic. Every value is read from a parquet the R pipeline wrote, and every
// number derived here is arithmetic on those reads.
//
// Inputs (feeding-texas-hr1/data-clean/):
//   snap_county_monthly.parquet   HHSC SNAP by county x month, Jan 2022 onward.
//                                 Excel history to Aug 2025, then David's manual
//                                 PMAS Tableau export — see data-raw/SOURCES.md.
//   vulnerability_county.parquet  build_scores.R output: d1–d4, tiers, counts,
//                                 composite, cumulative impact, 2026 projected pop.
//   snap_county.parquet           county_type (Metro / Micro / Rural).
//   foodbank_county.parquet       Feeding Texas member banks: unique households
//                                 served per county, per bank, over the period its
//                                 data_period names. Partial bank coverage. The
//                                 food-bank source of truth: capacity_county's
//                                 copy lags it (see the staleness check below).
//
// Plus, beside data-clean:
//   ../tool-data/capacity_county.parquet  build_capacity_county.R: every capacity
//                                 registry in one row per county. Read for CMS
//                                 navigator orgs, CPP sites by level and DSHS
//                                 certified-CHW ranges.
//   ../data-raw/capacity/tx_foodbanks.csv  the full roster of Texas member food
//                                 banks, the denominator of "N of M reporting".
//   crosswalk_districts.parquet   county and tract -> TX House / TX Senate / US House, block
//                                 population weights (helpers/crosswalk.R).
//   acs_tract.parquet             ACS 2020-24 by tract; low-income and total
//                                 population, for the weight check and fallbacks.
//
// Plus data/acs-snap-households-tract.json (npm run fetch:acs-snap): ACS SNAP
// households by tract, which weight the split-county allocation.
//
// Run:  npm run build:counties
//       FT_DATA=/path/to/data-clean npm run build:counties
//
// SAFETY: every check below throws BEFORE anything is written. A short month, a
// missing county or an age band that no longer adds up leaves the committed
// files untouched.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { feature } from 'topojson-client';
import { geoCentroid } from 'd3-geo';
import { buildFunnel, countyTrends, excessDecline } from '../src/lib/insights.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FT_DATA = resolve(ROOT, process.env.FT_DATA ?? '../feeding-texas-hr1/data-clean');
const GEOMETRY = resolve(ROOT, 'public/data/geometry.json');

/** HR1/OBBBA signed 4 Jul 2025; July is the pre-decline baseline (spec §6.1). */
const POLICY_START = '2025-07';
/** The notebook's pre-policy trend window for the excess-decline figure. */
const TREND_WINDOW = ['2024-01', '2025-08'];
/** Spec §3.1: counties under this many residents are dimmed in rate view. */
const SMALL_DENOMINATOR = 10_000;

const round = (v, p = 6) => Number(v.toFixed(p));
const pct = (a, b) => (a > 0 ? (b - a) / a : null);

function fail(msg) {
  throw new Error(msg);
}

// ------------------------------------------------------------------- read
async function readParquet(file) {
  const path = resolve(FT_DATA, file);
  if (!existsSync(path)) fail(`${file} not found in ${FT_DATA} — set FT_DATA`);
  const buf = readFileSync(path);
  // A Git LFS pointer is ~130 bytes of text; parsing it gives a baffling error.
  if (buf.length < 1024 && buf.toString('utf8', 0, 40).startsWith('version https://git-lfs')) {
    fail(`${file} is a Git LFS pointer — run \`git lfs pull\` in the analysis repo`);
  }
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const rows = await parquetReadObjects({ file: ab, compressors });
  // int64 columns arrive as BigInt; every count here fits a double exactly.
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]),
    ),
  );
}

const monthOf = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 7);

function monthRange(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const byGeoid = (rows, label) => {
  const map = new Map(rows.map((r) => [r.geoid, r]));
  if (map.size !== rows.length) fail(`${label}: duplicate geoids`);
  return map;
};

const [monthly, vuln, snapCounty, capacity, foodbank, crosswalk, acsTract] = await Promise.all([
  readParquet('snap_county_monthly.parquet'),
  readParquet('vulnerability_county.parquet'),
  readParquet('snap_county.parquet'),
  readParquet('../tool-data/capacity_county.parquet'),
  readParquet('foodbank_county.parquet'),
  readParquet('crosswalk_districts.parquet'),
  readParquet('acs_tract.parquet'),
]);

const topo = JSON.parse(readFileSync(GEOMETRY, 'utf8'));
const shapes = feature(topo, topo.objects.counties)
  .features.map((f) => ({
    geoid: f.properties.geoid,
    name: f.properties.name,
    centroid: geoCentroid(f).map((v) => round(v, 5)),
  }))
  .sort((a, b) => a.geoid.localeCompare(b.geoid));

// ----------------------------------------------------------------- joins
// The geometry is the spine: load.js refuses to render if a shape has no row.
const GEOIDS = shapes.map((s) => s.geoid);
if (GEOIDS.length !== 254) fail(`geometry has ${GEOIDS.length} counties, expected 254`);

const VULN = byGeoid(vuln, 'vulnerability_county');
const TYPE = byGeoid(snapCounty, 'snap_county');
const CAPACITY = byGeoid(capacity, 'capacity_county');
const FOODBANK = byGeoid(foodbank, 'foodbank_county');

/*
   Food-bank coverage, for every title that quotes it — derived here so no
   period or bank count is written into the app. The R pipeline names banks by
   slug in its unique_hh_<slug> columns; the roster gives their full names.
*/
const FOODBANK_NAMES = {
  CTFB: 'Central Texas Food Bank',
  NTFB: 'North Texas Food Bank',
  East: 'East Texas Food Bank',
  West: 'West Texas Food Bank',
};
const FOODBANK_SLUGS = Object.keys(foodbank[0])
  .filter((k) => k.startsWith('unique_hh_') && k !== 'unique_hh_total')
  .map((k) => k.slice('unique_hh_'.length));
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const foodbankCoverage = (() => {
  const periods = [...new Set(foodbank.map((r) => r.data_period))];
  if (periods.length !== 1) fail(`foodbank_county: expected one data_period, got ${periods.join(' | ')}`);
  const m = /([A-Z][a-z]{2})(\d{4})\s*-\s*([A-Z][a-z]{2})(\d{4})/.exec(periods[0]);
  if (!m || !MON[m[1]] || !MON[m[3]]) fail(`foodbank_county: cannot read data_period "${periods[0]}"`);
  const slugs = FOODBANK_SLUGS;
  const unknown = slugs.filter((sl) => !FOODBANK_NAMES[sl]);
  if (unknown.length) fail(`foodbank_county: no full name for bank slug(s) ${unknown.join(', ')} — add to FOODBANK_NAMES`);
  const rosterPath = resolve(FT_DATA, '../data-raw/capacity/tx_foodbanks.csv');
  const total = existsSync(rosterPath)
    ? readFileSync(rosterPath, 'utf8').trim().split('\n').length - 1
    : null;
  return {
    period: [`${m[2]}-${MON[m[1]]}`, `${m[4]}-${MON[m[3]]}`],
    banks_reporting: slugs.map((sl) => FOODBANK_NAMES[sl]),
    banks_total: total,
    counties_with_data: foodbank.filter((r) => r.coverage_note !== 'no_data').length,
  };
})();
const banksPhrase = `${foodbankCoverage.banks_reporting.length}${
  foodbankCoverage.banks_total ? ` of ${foodbankCoverage.banks_total}` : ''
} member banks`;
for (const [label, map] of [
  ['vulnerability_county', VULN],
  ['snap_county', TYPE],
  ['capacity_county', CAPACITY],
  ['foodbank_county', FOODBANK],
]) {
  const missing = GEOIDS.filter((g) => !map.has(g));
  if (missing.length) fail(`${label} is missing ${missing.length} counties (first ${missing[0]})`);
}

// capacity_county copies foodbank_county in a separate R step, so a bank that
// reports after that step ran leaves the copy behind (East and West, 2026-10).
// Food-bank values are read from foodbank_county itself; this only says when
// the copy needs a rerun, so the analysis repo's own users are not misled.
const staleFb = GEOIDS.filter(
  (g) => (CAPACITY.get(g).fb_hh_served ?? null) !== (FOODBANK.get(g).unique_hh_total ?? null),
).length;

/*
   DSHS 2024 certified-CHW ranges, ordered. chw_bin is a band read off the
   report's choropleth ("11-100"), not a count — exact only for the top five.
   The band's position is what the bar draws (1 = lowest band with any CHWs);
   its label is what every reader-facing number says. Labels come from the data,
   so a new report with new breaks relabels the app.
*/
const CHW_NONE = 'no_certified_chws';
const CHW_BANDS = [...new Set(capacity.map((r) => r.chw_bin))]
  .filter((b) => b != null && b !== CHW_NONE)
  .map((b) => {
    const m = /^(\d+)(?:-(\d+))?$/.exec(String(b));
    if (!m) fail(`capacity_county: cannot read chw_bin "${b}"`);
    return { bin: String(b), lo: Number(m[1]), label: String(b).replace('-', '–').replace(/\d{4,}/g, (d) => Number(d).toLocaleString('en-US')) };
  })
  .sort((a, b) => a.lo - b.lo);
const chwBand = (bin) => (bin === CHW_NONE ? 0 : CHW_BANDS.findIndex((b) => b.bin === String(bin)) + 1);

// -------------------------------------------------------- monthly series
const monthsSeen = [...new Set(monthly.map((r) => monthOf(r.snap_month)))].sort();
const MONTHS = monthRange(monthsSeen[0], monthsSeen.at(-1));
if (MONTHS.length !== monthsSeen.length) {
  const gaps = MONTHS.filter((m) => !monthsSeen.includes(m));
  fail(`SNAP series has ${gaps.length} missing month(s): ${gaps.join(', ')}`);
}
const MI = new Map(MONTHS.map((m, i) => [m, i]));
if (!MI.has(POLICY_START)) fail(`series does not contain the policy start ${POLICY_START}`);

const BANDS = [
  // [column, label]. Labels match the statewide age_bands the charts print.
  ['age_u5', 'Under 5'],
  ['age_5_17', '5–17'],
  ['age_18_59', '18–59'],
  ['age_60_64', '60–64'],
  ['age_65p', '65+'],
];

const empty = () => new Array(MONTHS.length).fill(null);
const series = new Map(
  GEOIDS.map((g) => [
    g,
    { enrolled: empty(), cases: empty(), payments: empty(), bands: BANDS.map(empty) },
  ]),
);

for (const r of monthly) {
  const s = series.get(r.geoid);
  if (!s) fail(`snap_county_monthly has a geoid not in the geometry: ${r.geoid}`);
  const i = MI.get(monthOf(r.snap_month));
  if (s.enrolled[i] != null) fail(`${r.geoid} ${MONTHS[i]} appears twice`);
  s.enrolled[i] = r.eligible_ind;
  s.cases[i] = r.cases;
  s.payments[i] = r.total_payments;
  BANDS.forEach(([col], b) => {
    s.bands[b][i] = r[col];
  });
}

for (const [g, s] of series) {
  const hole = s.enrolled.findIndex((v) => typeof v !== 'number');
  if (hole !== -1) fail(`${g} has no SNAP row for ${MONTHS[hole]}`);
}

/*
   The age bands must add up to the caseload, or the "who is falling off" chart
   quietly stops describing the line above it.

   They do not add up EXACTLY in 2022: HHSC's sheets fall a few dozen people
   short statewide (worst case 76 of ~3.5M, presumably records with no age). From
   2023 on they reconcile to the person. 0.05% statewide is loose enough for that
   and tight enough that a dropped band — 60–64 once went missing upstream, worth
   ~139,000 people — still fails the build.
*/
const unbanded = [];
MONTHS.forEach((m, i) => {
  let total = 0;
  let banded = 0;
  for (const s of series.values()) {
    total += s.enrolled[i];
    for (const band of s.bands) banded += band[i];
  }
  const gap = total - banded;
  if (Math.abs(gap) > total * 0.0005) {
    fail(`${m}: age bands total ${banded} against ${total} enrolled — a column has moved`);
  }
  if (gap !== 0) unbanded.push({ month: m, people: gap });
});

// -------------------------------------------------------------- counties
const quintileOf = (tier) => {
  // build_scores.R emits the factor labels "Q1"–"Q5"; spec §3.1 wants 1–5.
  const n = Number(String(tier ?? '').replace(/^Q/, ''));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const records = shapes.map((shape) => {
  const v = VULN.get(shape.geoid);
  const s = series.get(shape.geoid);
  const cap = CAPACITY.get(shape.geoid);
  const fbRow = FOODBANK.get(shape.geoid);
  const pop = v.projected_pop_2026;
  if (!(pop > 0)) fail(`${shape.name}: no projected 2026 population`);

  const rec = { geoid: shape.geoid, name: shape.name, pop };

  for (const d of ['d1', 'd2', 'd3', 'd4']) {
    const score = num(v[`${d}_score`]);
    rec[`${d}_score`] = score == null ? null : round(score);
    rec[`${d}_tier`] = quintileOf(v[`${d}_tier`]);
    rec[`${d}_n`] = num(v[`${d}_n`]);
    // build_scores.R does not propagate MOEs to the domain scores yet — see
    // docs/SPEC-DEVIATIONS.md §A1. null renders as "—", never as a zero MOE.
    rec[`${d}_moe`] = null;
  }
  // D5 (Children) has no source column — §3 warning, §A3.
  Object.assign(rec, { d5_score: null, d5_tier: null, d5_n: null, d5_moe: null });

  rec.vulnerability_score = round(v.vulnerability_score);
  rec.cumulative_impact = v.cumulative_impact;

  // PUMS-modelled headcounts; whole people.
  rec.newly_subject_persons = Math.round(v.newly_subject_persons);
  rec.noncit_snap_persons = Math.round(v.noncit_snap_persons);

  rec.snap_enrolled = s.enrolled;
  // Under-18s, straight from the county's own age columns — the genuine
  // county-by-month child series §A4 said the export owed.
  rec.snap_children = s.enrolled.map((_, i) => s.bands[0][i] + s.bands[1][i]);
  // 65+, the same band the statewide "seniors" series uses.
  rec.snap_seniors = s.bands[4].slice();
  // Total SNAP benefits paid to the county's households each month, whole dollars.
  rec.snap_payments = s.payments.map((v) => Math.round(v ?? 0));

  /*
     All four registries, from capacity_county. Each bar in the app has its
     own scale, because these are four different units:

     cms_navigator  CMS 2025–26 navigator awardees whose "Counties Served" names
                    the county — organisations, not sites.
     cpp            HHSC Community Partner Program sites at levels 3–4, the
                    ones that help with applications and cases (levels 1–2 are
                    self-service computers and basic help). cpp_sites_all keeps
                    every level.
     chw            DSHS 2024 certified-CHW range, as a BAND POSITION (0 = no
                    certified CHWs). chw_band is its label; chw_exact the true
                    count where the report printed one (top five counties).
     food_bank      Reporting Feeding Texas member banks that served at least
                    one household in the county. Only some banks report
                    (INFRA_TYPES.partial): a county none of them covers is null
                    ("no data yet"), never 0. Houston and San Antonio's banks
                    are among the missing, so those gaps sit in
                    high-vulnerability regions.
  */
  const fbServing = FOODBANK_SLUGS.filter((sl) => fbRow[`unique_hh_${sl}`] > 0);
  const fbNoData = fbRow.coverage_note === 'no_data';
  rec.infra = {
    food_bank: fbNoData ? null : fbServing.length,
    cms_navigator: num(cap.n_navigator_orgs),
    chw: chwBand(cap.chw_bin),
    cpp: num(cap.n_cpp_l3_l4),
  };
  rec.cpp_sites_all = num(cap.n_cpp_total);
  rec.chw_band = rec.infra.chw === 0 ? null : CHW_BANDS[rec.infra.chw - 1].label;
  rec.chw_exact = num(cap.chw_exact);
  // Unique households those banks served, summed across banks; null as above.
  rec.foodbank_households = fbNoData ? null : num(fbRow.unique_hh_total);
  // Which banks, by full name.
  rec.foodbank_banks = fbServing.length ? fbServing.map((sl) => FOODBANK_NAMES[sl]) : null;

  rec.small_denominator = pop < SMALL_DENOMINATOR;
  rec.centroid = shape.centroid;
  rec.county_type = TYPE.get(shape.geoid).county_type;
  return rec;
});

/*
   is_gap — spec §3.1 defines it as top-quintile vulnerability with zero
   food-bank sites AND zero navigators. There is no food-bank registry, so this
   uses the half that exists: top-quintile vulnerability and no CMS navigator.
   The overlay's label says exactly that; restore the food-bank clause when the
   registry lands.
*/
const composites = records.map((r) => r.vulnerability_score).sort((a, b) => a - b);
const q5Cut = composites[Math.floor(composites.length * 0.8)];
for (const r of records) {
  r.is_gap = r.vulnerability_score >= q5Cut && r.infra.cms_navigator === 0;
}

// Tile-cartogram lattice (§3.1 grid). The cartogram view is gone, but the
// lattice still drives keyboard navigation order. Biggest counties place first
// so metros hold their true position and rural counties absorb displacement.
function assignGrid(cols = 22, rows = 24) {
  const lons = records.map((r) => r.centroid[0]);
  const lats = records.map((r) => r.centroid[1]);
  const [lo0, lo1] = [Math.min(...lons), Math.max(...lons)];
  const [la0, la1] = [Math.min(...lats), Math.max(...lats)];
  const taken = new Set();
  for (const r of [...records].sort((a, b) => b.pop - a.pop || a.geoid.localeCompare(b.geoid))) {
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
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || taken.has(`${rr},${cc}`)) continue;
          candidates.push({ rr, cc, d: Math.hypot(dr, dc) });
        }
      }
      candidates.sort((a, b) => a.d - b.d || a.rr - b.rr || a.cc - b.cc);
      if (candidates.length) placed = candidates[0];
    }
    if (!placed) fail(`no free grid cell for ${r.name}`);
    taken.add(`${placed.rr},${placed.cc}`);
    r.grid = { r: placed.rr, c: placed.cc };
  }
  return { cols, rows };
}
const gridDims = assignGrid();

// ------------------------------------------------------------- statewide
/*
   Statewide = the sum of the 254 counties, everywhere on the page.

   HHSC's sheets also carry "Call Centers" and "State Office" rows — cases not
   attributed to any county, ~3,300 people in Jul 2025. The analysis drops them
   (collect_snap_history.R), so the hero number, the map, the rail chart and the
   Insights page all describe the same population: a reader who adds up the
   counties gets the number on the page.
*/
const sumAt = (pick) =>
  MONTHS.map((_, i) => records.reduce((t, r) => t + pick(series.get(r.geoid), i), 0));

const enrolled = sumAt((s, i) => s.enrolled[i]);
const cases = sumAt((s, i) => s.cases[i]);
const payments = sumAt((s, i) => s.payments[i] ?? 0).map((v) => Math.round(v));
const bandSeries = BANDS.map((_, b) => sumAt((s, i) => s.bands[b][i]));

const texasPopulation = records.reduce((t, r) => t + r.pop, 0);
const p0 = MI.get(POLICY_START);
const last = MONTHS.length - 1;

const ageBands = BANDS.map(([, band], b) => ({
  band,
  july_enrolled: bandSeries[b][p0],
  latest_enrolled: bandSeries[b][last],
  pct_change: round(pct(bandSeries[b][p0], bandSeries[b][last]), 4),
}))
  // Steepest first — the order the dumbbell reads top to bottom.
  .sort((a, b) => a.pct_change - b.pct_change);

const typeRollup = ['Metro', 'Micro', 'Rural'].map((type) => {
  const rs = records.filter((r) => r.county_type === type);
  if (!rs.length) fail(`no ${type} counties — county_type labels changed upstream`);
  const a = rs.reduce((t, r) => t + r.snap_enrolled[p0], 0);
  const z = rs.reduce((t, r) => t + r.snap_enrolled[last], 0);
  return { type, counties: rs.length, pctChange: round(pct(a, z), 4) };
});

/*
   Excess decline — the notebook's "sharper cut" (snap-enrollment-trends.qmd).
   Each county's own linear trend over TREND_WINDOW, projected forward. The hero
   computes it live for the brush window (src/lib/insights.js headlineStats);
   it is printed here as a check, and TREND_WINDOW ships in meta.
*/
const trends = countyTrends(records, TREND_WINDOW.map((m) => MI.get(m)));

const funnel = buildFunnel(records, p0, last);

const statewide = {
  meta: {
    months: MONTHS,
    history_months: MONTHS.slice(0, p0),
    policy_start: POLICY_START,
    latest: MONTHS[last],
    texas_population: texasPopulation,
    grid: gridDims,
    // Pre-policy months each county's own trend is fitted over (excess decline).
    trend_window: TREND_WINDOW,
    foodbank: foodbankCoverage,
    // Certified-CHW range labels, lowest first: infra.chw = i + 1 is CHW_BANDS[i].
    chw_bands: CHW_BANDS.map((b) => b.label),
    generated_from: 'scripts/build-county-data.mjs',
    sources: [
      'Texas HHSC SNAP cases and eligible individuals by county, monthly (Excel to Aug 2025; PMAS Tableau export from Sep 2025)',
      'feeding-texas-hr1 rscripts/build_scores.R — vulnerability_county (signed off 2026-07-30)',
      'Texas Demographic Center projected 2026 population (via HHSC ArcGIS) — the participation denominator',
      'feeding-texas-hr1 rscripts/capacity/build_capacity_county.R — capacity_county: CMS 2025–26 Navigator awardees (counties served); HHSC Community Partner Program sites; DSHS annual report certified-CHW ranges',
      `Feeding Texas member food banks, unique households served by county, ${foodbankCoverage.period.join(' to ')} (${foodbankCoverage.banks_reporting.join(', ')})`,
    ],
    notes: [
      'Statewide figures are the sum of the 254 counties; HHSC call-center and state-office rows are excluded.',
      'Participation holds the 2026 projected population fixed across all months.',
      'infra.chw is a band position in meta.chw_bands, not a count; ranges are read from the DSHS choropleth, exact only for the five counties in chw_exact.',
      'infra.cpp counts Community Partner Program sites at levels 3–4; cpp_sites_all counts every level.',
      `infra.food_bank counts the ${banksPhrase} reporting that served the county; foodbank_households is their unique households served. Both are null where no reporting bank serves the county, not zero.`,
      'Domain-score MOEs are not produced by build_scores.R yet; *_moe fields are null.',
    ],
  },
  enrolled,
  cases,
  monthly_change: enrolled.map((v, i) => (i === 0 ? null : v - enrolled[i - 1])),
  participation_share: enrolled.map((v) => round(v / texasPopulation, 5)),
  age_bands: ageBands,
  /** Monthly enrolled individuals per band, parallel to meta.months. */
  age_series: Object.fromEntries(BANDS.map(([, band], b) => [band, bandSeries[b]])),
  people_vs_households: {
    people: round(pct(enrolled[p0], enrolled[last]), 4),
    households: round(pct(cases[p0], cases[last]), 4),
  },
  county_type_rollup: typeRollup,
  // The policy-window funnel, for the download and for reference. The Insights
  // page refits it for whatever window the brush is on — see buildFunnel().
  funnel: {
    method: 'empirical: |deviation| ~ caseload^b fitted in logs (snap-enrollment-trends.qmd)',
    center: round(funnel.center, 5),
    limits: funnel.limits
      .filter((_, k) => k % 8 === 0)
      .map((l) => ({ caseload: Math.round(l.caseload), sd: round(l.sd, 5) })),
  },
};

// The rail chart's file, from the same rows, so the rail and the hero agree to
// the person. Bands collapse to the three the rail stacks, exhaustively.
const snapObserved = {
  observed: true,
  source: 'Texas Health and Human Services Commission',
  source_url:
    'https://www.hhs.texas.gov/about/records-statistics/data-statistics/supplemental-nutritional-assistance-program-snap-statistics',
  note:
    'Month-end SNAP cases and eligible individuals, summed over the 254 counties as published by ' +
    'Texas HHSC (call-center and state-office rows excluded). Observed counts, not a model.',
  generated: `${MONTHS[last]} data`,
  months: MONTHS,
  first: MONTHS[0],
  latest: MONTHS[last],
  reconciliation: [],
  unbanded,
  statewide: {
    cases,
    individuals: enrolled,
    children: enrolled.map((_, i) => bandSeries[0][i] + bandSeries[1][i]),
    adults: enrolled.map((_, i) => bandSeries[2][i] + bandSeries[3][i]),
    seniors: bandSeries[4],
    payments,
    change: statewide.monthly_change,
  },
};


// ------------------------------------------------------------- districts
/*
   TX House (PlanH2316), TX Senate (PlanS2168) and US House (PlanC2333, the 2026
   congressional map), COUNTS ONLY.

   SNAP is published by county. A county wholly inside one district contributes
   its whole caseload, so a district built from whole counties is an exact sum.
   A county split across districts (Harris spans 24 House districts) has to be
   apportioned, and that apportionment is an ESTIMATE:

     share(c -> d) = sum_t S(t) * x(t -> d)  /  sum_t S(t) * sum_d x(t -> d)

   over the census tracts t in county c, where x is the crosswalk's tract ->
   district block-population weight and S is the ACS 2020-24 count of households
   that received SNAP (table B22001, data/acs-snap-households-tract.json). HHSC's
   count stays the total; the survey only says where inside the county it sits.

   WHY THIS WEIGHT. Tested where the truth is known — splitting the statewide
   caseload across the 254 counties and comparing with HHSC — the share of
   enrollees put in the wrong county is 15.0% by population, 5.6% by residents
   under 200% of poverty, 4.2% by ACS SNAP households. SNAP households also answer
   the two objections to a low-income weight: college students count as poor but
   are mostly barred from SNAP (and do not report receiving it), and take-up is
   lower among seniors and immigrant families (a receipt count reflects that, a
   poverty count does not). The build prints this check every run.

   THE SURVEY HAS A MARGIN. Each share carries a 90% MOE, from the tract MOEs by
   the ACS handbook's formula for a proportion. It is shipped per county as
   `share_moe`; the page turns it into a ± on the district's counts. It moves a
   district's SIZE, not a single-county district's percent change — a fixed share
   of one county moves exactly as that county does.

   Fallbacks, for a split county with no ACS SNAP households in its tracts (none
   today): residents under 200% of poverty, then population. Both have no MOE.

   Scores are NOT allocated. Percentiles cannot be weighted into districts (§9);
   they have to be re-ranked from rates in build_scores.R, and districts.json is
   reserved for that. This file is enrollment, children, newly subject and
   population only.
*/
const CHAMBERS = {
  txhouse: { label: 'TX House', plan: 'PlanH2316', noun: 'House District', expected: 150 },
  txsenate: { label: 'TX Senate', plan: 'PlanS2168', noun: 'Senate District', expected: 31 },
  ushouse: { label: 'US House', plan: 'PlanC2333', noun: 'Congressional District', expected: 38 },
};

const ACS_SNAP = resolve(ROOT, 'data/acs-snap-households-tract.json');
if (!existsSync(ACS_SNAP)) fail('data/acs-snap-households-tract.json missing — run `npm run fetch:acs-snap`');
const snapTracts = JSON.parse(readFileSync(ACS_SNAP, 'utf8')).tracts;
if (Object.keys(snapTracts).length !== 6896) fail('ACS SNAP tract file does not have the 6,896 Texas tracts');

const tractVar = (name) => {
  const out = new Map();
  for (const r of acsTract) {
    if (r.target_var === name && (r.role === 'estimate' || r.role === 'base') && !out.has(r.geoid)) {
      out.set(r.geoid, r.estimate ?? 0);
    }
  }
  return out;
};
/** tract -> [estimate, 90% moe] for each candidate weight. Only SNAP households carry a usable MOE. */
const WEIGHTS = {
  snap_households: new Map(Object.entries(snapTracts).map(([g, [e, m]]) => [g, [e, m]])),
  low_income: new Map([...tractVar('pov_under_200')].map(([g, e]) => [g, [e, null]])),
  population: new Map([...tractVar('pop_total')].map(([g, e]) => [g, [e, null]])),
};

/*
   The weight check. Split the statewide caseload across counties by each
   weight's county totals and count how many enrollees land in the wrong county.
   A county-level test of a within-county assumption — evidence, not proof — but
   the only test the data allows, since SNAP is not published below the county.
*/
const weightCheck = Object.fromEntries(
  Object.entries(WEIGHTS).map(([name, w]) => {
    const byCounty = new Map();
    for (const [g, [e]] of w) byCounty.set(g.slice(0, 5), (byCounty.get(g.slice(0, 5)) ?? 0) + e);
    const tot = records.reduce((t, r) => t + (byCounty.get(r.geoid) ?? 0), 0);
    const misplaced =
      records.reduce(
        (t, r) => t + Math.abs((enrolled[p0] * (byCounty.get(r.geoid) ?? 0)) / tot - r.snap_enrolled[p0]),
        0,
      ) / 2;
    return [name, misplaced / enrolled[p0]];
  }),
);

/** Integers that sum to `total` exactly, from floats that already sum to it. */
function apportion(floats, total) {
  const floors = floats.map(Math.floor);
  let deficit = total - floors.reduce((a, b) => a + b, 0);
  const order = floats.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; deficit > 0; k++, deficit--) floors[order[k % order.length][1]] += 1;
  return floors;
}

/**
 * One split county's shares by one weight, with the 90% MOE on each share.
 *
 * MOE of a proportion p = A/T where A is part of T (ACS General Handbook, ch. 8):
 *   sqrt(MOE_A^2 - p^2 * MOE_T^2) / T, or with + when the radicand goes negative.
 */
function splitCounty(tracts, weight) {
  const A = new Map();
  const A2 = new Map();
  let T = 0;
  let T2 = 0;
  for (const { tract, targets } of tracts) {
    const [e, m] = weight.get(tract) ?? [0, null];
    const inPlan = targets.reduce((t, x) => t + x.w, 0);
    T += e * inPlan;
    T2 += ((m ?? 0) * inPlan) ** 2;
    for (const { d, w } of targets) {
      A.set(d, (A.get(d) ?? 0) + e * w);
      A2.set(d, (A2.get(d) ?? 0) + ((m ?? 0) * w) ** 2);
    }
  }
  if (!(T > 0)) return null;
  const out = new Map();
  for (const [d, a] of A) {
    if (a <= 0) continue;
    const p = a / T;
    let rad = A2.get(d) - p * p * T2;
    if (rad < 0) rad = A2.get(d) + p * p * T2;
    out.set(d, { share: p, moe: Math.sqrt(rad) / T });
  }
  return out;
}

const districtUnits = [];
const districtChecks = [];
const fallbacks = [];
for (const [plan, chamber] of Object.entries(CHAMBERS)) {
  const rows = crosswalk.filter((r) => r.plan === plan);
  const countyXw = new Map();
  const tractXw = new Map();
  for (const r of rows) {
    const target = r.level === 'county' ? countyXw : tractXw;
    if (!target.has(r.source_id)) target.set(r.source_id, []);
    target.get(r.source_id).push({ d: String(r.target_id), w: r.weight });
  }
  const ids = [...new Set(rows.filter((r) => r.level === 'county').map((r) => String(r.target_id)))]
    .sort((a, b) => Number(a) - Number(b));
  if (ids.length !== chamber.expected) fail(`${plan}: ${ids.length} districts, expected ${chamber.expected}`);

  const tractsOf = new Map();
  for (const [tract, targets] of tractXw) {
    const c = tract.slice(0, 5);
    if (!tractsOf.has(c)) tractsOf.set(c, []);
    tractsOf.get(c).push({ tract, targets });
  }

  const shares = new Map();
  for (const g of GEOIDS) {
    const byPop = countyXw.get(g);
    if (!byPop) fail(`${plan}: county ${g} missing from the crosswalk`);
    let share;
    if (byPop.length === 1) {
      share = new Map([[byPop[0].d, { share: 1, moe: 0 }]]);
    } else {
      const tracts = tractsOf.get(g) ?? [];
      const basis = ['snap_households', 'low_income'].find((k) => splitCounty(tracts, WEIGHTS[k]));
      if (basis) {
        share = splitCounty(tracts, WEIGHTS[basis]);
        // Only the SNAP-household weight has a survey MOE to carry.
        if (basis !== 'snap_households') {
          for (const v of share.values()) v.moe = null;
          fallbacks.push(`${plan} ${g}: ${basis}`);
        }
      } else {
        share = new Map(byPop.map(({ d, w }) => [d, { share: w, moe: null }]));
        fallbacks.push(`${plan} ${g}: population`);
      }
    }
    const sum = [...share.values()].reduce((a, b) => a + b.share, 0);
    if (Math.abs(sum - 1) > 1e-9) fail(`${plan}: county ${g} shares sum to ${sum}`);
    shares.set(g, { share, popWeights: new Map(byPop.map(({ d, w }) => [d, w])), whole: byPop.length === 1 });
  }

  const idx = new Map(ids.map((d, k) => [d, k]));
  const zeros = () => ids.map(() => 0);
  const enrolledF = MONTHS.map(zeros);
  const childrenF = MONTHS.map(zeros);
  const seniorsF = MONTHS.map(zeros);
  const paymentsF = MONTHS.map(zeros);
  const subjectF = zeros();
  const popF = zeros();
  const julyFromSplit = zeros();
  const members = ids.map(() => []);
  const julyPopWeighted = zeros();

  for (const r of records) {
    const { share, popWeights, whole } = shares.get(r.geoid);
    for (const [d, { share: sh, moe }] of share) {
      const k = idx.get(d);
      MONTHS.forEach((_, i) => {
        enrolledF[i][k] += sh * r.snap_enrolled[i];
        childrenF[i][k] += sh * r.snap_children[i];
        seniorsF[i][k] += sh * r.snap_seniors[i];
        paymentsF[i][k] += sh * r.snap_payments[i];
      });
      subjectF[k] += sh * r.newly_subject_persons;
      if (!whole) julyFromSplit[k] += sh * r.snap_enrolled[p0];
      members[k].push({
        geoid: r.geoid,
        name: r.name,
        share: round(sh, 4),
        share_moe: whole ? 0 : moe == null ? null : round(moe, 4),
        july: sh * r.snap_enrolled[p0],
      });
    }
    for (const [d, w] of popWeights) {
      popF[idx.get(d)] += w * r.pop;
      julyPopWeighted[idx.get(d)] += w * r.snap_enrolled[p0];
    }
  }

  const enrolledI = MONTHS.map((_, i) => apportion(enrolledF[i], enrolled[i]));
  const childTotal = MONTHS.map((_, i) => bandSeries[0][i] + bandSeries[1][i]);
  const childrenI = MONTHS.map((_, i) => apportion(childrenF[i], childTotal[i]));
  const seniorsI = MONTHS.map((_, i) => apportion(seniorsF[i], bandSeries[4][i]));
  const paymentsI = MONTHS.map((_, i) => apportion(paymentsF[i], payments[i]));

  ids.forEach((d, k) => {
    const julyTotal = enrolledF[p0][k];
    const unit = {
      geoid: `${plan}-${d}`,
      plan,
      number: Number(d),
      name: `${chamber.noun} ${d}`,
      pop: Math.round(popF[k]),
      snap_enrolled: MONTHS.map((_, i) => enrolledI[i][k]),
      snap_children: MONTHS.map((_, i) => childrenI[i][k]),
      snap_seniors: MONTHS.map((_, i) => seniorsI[i][k]),
      snap_payments: MONTHS.map((_, i) => paymentsI[i][k]),
      newly_subject_persons: Math.round(subjectF[k]),
      exact: julyFromSplit[k] === 0,
      allocated_share: julyTotal > 0 ? round(julyFromSplit[k] / julyTotal, 4) : 0,
      counties: members[k]
        .sort((a, b) => b.july - a.july)
        .map(({ july, ...m }) => m),
    };
    if (unit.snap_children.some((v, i) => v > unit.snap_enrolled[i])) {
      fail(`${unit.name}: more children than enrolled after rounding`);
    }
    districtUnits.push(unit);
  });

  // How far the SNAP-household split moves districts off a plain population split.
  const moved = ids.map((_, k) => Math.abs(enrolledF[p0][k] - julyPopWeighted[k]));
  const worst = moved.indexOf(Math.max(...moved));
  districtChecks.push({
    plan,
    exact: districtUnits.filter((u) => u.plan === plan && u.exact).length,
    total: ids.length,
    worst: `${chamber.noun} ${ids[worst]}: ${Math.round(julyPopWeighted[worst]).toLocaleString()} by population → ${Math.round(enrolledF[p0][worst]).toLocaleString()} by SNAP households`,
  });
}

const districtCounts = {
  meta: {
    months: MONTHS,
    policy_start: POLICY_START,
    chambers: Object.fromEntries(
      Object.entries(CHAMBERS).map(([plan, c]) => [
        plan,
        { label: c.label, plan: c.plan, noun: c.noun, count: c.expected },
      ]),
    ),
    method:
      'County SNAP series summed into districts. Counties wholly inside a district are exact; ' +
      'counties split across districts are apportioned by where the ACS 2020–24 finds households ' +
      'receiving SNAP (table B22001), tract by tract, through the block-population crosswalk. ' +
      'share_moe is the 90% margin on each split share.',
    weight_check: Object.fromEntries(
      // Full precision, so the page's rounding and the build log's agree (15.0%, not 14.9%).
      Object.entries(weightCheck).map(([k, v]) => [k, round(v, 6)]),
    ),
    notes: [
      'Counts only. Vulnerability scores are not allocated to districts — they must be re-ranked within the district set (spec §9).',
      'newly_subject_persons is a PUMS-modelled county estimate, apportioned the same way as enrollment.',
      'pop apportions the 2026 projected county population by block population.',
      'Each chamber reconciles to the statewide total exactly in every month.',
      'A district inside one split county has that county’s trend and percent change; the share only sets its size.',
    ],
  },
  districts: districtUnits,
};

// ---------------------------------------------------------------- verify
const countySum = (i) => records.reduce((t, r) => t + r.snap_enrolled[i], 0);
MONTHS.forEach((m, i) => {
  if (countySum(i) !== enrolled[i]) fail(`${m}: county sum does not reconcile`);
});
for (const plan of Object.keys(CHAMBERS)) {
  const units = districtUnits.filter((u) => u.plan === plan);
  MONTHS.forEach((m, i) => {
    const sum = units.reduce((t, u) => t + u.snap_enrolled[i], 0);
    if (sum !== enrolled[i]) fail(`${plan} ${m}: districts sum to ${sum}, statewide is ${enrolled[i]}`);
  });
}
const childOver = records.filter((r) => r.snap_children.some((v, i) => v > r.snap_enrolled[i]));
if (childOver.length) fail(`${childOver.length} counties report more children than enrolled`);

// The scored file and the monthly file must be the same vintage, or the
// tooltip's scores and its enrollment line describe different months.
const vintageDrift = records.filter((r) => {
  const change = r.snap_enrolled[last] - r.snap_enrolled[p0];
  return VULN.get(r.geoid).snap_abs_change_jul25 !== change;
});

/*
   The hero's three hand-written figures live in timeline.json. They are
   editorial, so they are checked rather than overwritten — a mismatch prints
   loudly and the build carries on.
*/
const fmtPctS = (v) => `${v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`;
const band1859 = ageBands.find((b) => b.band === '18–59').pct_change;
const bigCounties = records.filter((r) => r.snap_enrolled[p0] >= 1000);
const worstMonth = statewide.monthly_change.reduce(
  (w, v, i) => (i > p0 && v < statewide.monthly_change[w] ? i : w),
  p0 + 1,
);
const sinceBreak = statewide.monthly_change.slice(worstMonth + 1);
const checks = [
  // MapPage's hero body makes these two claims in prose.
  [
    'every 1,000+ county declined',
    `${bigCounties.every((r) => r.snap_enrolled[last] < r.snap_enrolled[p0]) ? 'yes' : 'NO'} (${bigCounties.length} counties)`,
  ],
  [
    `monthly change since ${MONTHS[worstMonth]}`,
    `${Math.max(...sinceBreak).toLocaleString()} to ${Math.min(...sinceBreak).toLocaleString()}`,
  ],
  ['18–59 change since Jul 2025', fmtPctS(band1859)],
  ['excess decline vs own trend', fmtPctS(excessDecline(trends, last))],
  ['participation, latest', `${(statewide.participation_share[last] * 100).toFixed(1)}%`],
  ['participation, Jul 2025', `${(statewide.participation_share[p0] * 100).toFixed(1)}%`],
];

// ----------------------------------------------------------------- write
const write = (name, obj) => {
  const path = resolve(ROOT, 'public/data', name);
  const json = JSON.stringify(obj);
  writeFileSync(path, `${json}\n`);
  const gz = gzipSync(Buffer.from(json)).length;
  console.log(
    `  ${name.padEnd(18)} ${(json.length / 1024).toFixed(1).padStart(7)}KB raw  ` +
      `${(gz / 1024).toFixed(1).padStart(6)}KB gz`,
  );
};

console.log(`source ${relative(ROOT, FT_DATA)} · ${MONTHS[0]} → ${MONTHS[last]} (${MONTHS.length} months)\n`);
write('counties.json', records);
write('statewide.json', statewide);
write('snap-observed.json', snapObserved);
write('district-counts.json', districtCounts);

const declined = records.filter((r) => r.snap_enrolled[last] < r.snap_enrolled[p0]);
const cum = [0, 1, 2, 3, 4].map((n) => records.filter((r) => r.cumulative_impact === n).length);
const withNav = records.filter((r) => r.infra.cms_navigator > 0).length;
const withChw = records.filter((r) => r.infra.chw > 0).length;
const withCpp = records.filter((r) => r.infra.cpp > 0).length;

console.log('\nchecks');
console.log(`  window change Jul 2025 → ${MONTHS[last]}  ${(enrolled[last] - enrolled[p0]).toLocaleString()}`);
console.log(`  counties that declined        ${declined.length} of 254`);
console.log(`  small_denominator counties    ${records.filter((r) => r.small_denominator).length}`);
console.log(`  cumulative impact 0–4         ${cum.join(' / ')}`);
console.log(`  navigator counties            ${withNav} (${254 - withNav} with none)`);
console.log(`  certified-CHW counties        ${withChw} · bands ${CHW_BANDS.map((b) => b.label).join(' / ')}`);
if (staleFb) {
  console.log(`  ! capacity_county's food-bank copy is stale in ${staleFb} counties — rerun rscripts/capacity/build_capacity_county.R (values here come from foodbank_county)`);
}
console.log(`  CPP L3–4 counties             ${withCpp} · max ${Math.max(...records.map((r) => r.infra.cpp))} sites`);
console.log(`  food-bank counties            ${foodbankCoverage.counties_with_data} with data · ${banksPhrase} · ${foodbankCoverage.period.join(' → ')}`);
console.log(`  gap counties (Q5, no nav)     ${records.filter((r) => r.is_gap).length}`);
console.log(`  funnel: outside 2sd           ${funnel.points.filter((p) => p.outside).length} of ${funnel.points.length}`);
console.log(`  unbanded months               ${unbanded.length}`);
console.log(
  `  split weight check            misplaced across counties: ${Object.entries(weightCheck)
    .map(([k, v]) => `${k.replace('_', ' ')} ${(v * 100).toFixed(1)}%`)
    .join(' · ')}`,
);
if (fallbacks.length) console.warn(`  split fallbacks               ${fallbacks.join('; ')}`);
for (const c of districtChecks) {
  console.log(`  ${c.plan.padEnd(9)} exact districts     ${c.exact} of ${c.total} (rest include a split county)`);
  console.log(`  ${''.padEnd(9)} largest split shift ${c.worst}`);
}
if (vintageDrift.length) {
  console.warn(
    `\nWARNING: ${vintageDrift.length} counties' snap_abs_change_jul25 in vulnerability_county ` +
      `disagrees with the monthly file — rerun build_scores.R against the latest month.`,
  );
}
console.log('\nhero figures at the default window (computed live on the page)');
for (const [label, value] of checks) console.log(`  ${label.padEnd(30)} ${value}`);
