/**
 * Build public/data/medicaid-observed.json from Texas HHSC's monthly
 * "Medicaid Enrollment by County" workbooks.
 *
 *   Index page  https://www.hhs.texas.gov/about/records-statistics/data-statistics/healthcare-statistics
 *   Workbooks   .../documents/medicaid-enrollment-by-county-final-jan-2026.xlsx
 *
 * Sister script to fetch-snap-stats.mjs and built the same way, for the same
 * reasons — see that file's header for why this is a build step rather than a
 * runtime fetch, and why the links are scraped rather than constructed.
 *
 * WHAT IS IN THE SHEET
 * One row per county: total Medicaid caseload, a split by risk group (aged and
 * Medicare-related, disability-related, parents, pregnant women, breast and
 * cervical cancer, children's Medicaid) and a split by age (under 21, 21 and
 * over). This script keeps the total, the children's caseload and the
 * aged/Medicare-related caseload, which are the three the dashboard maps.
 *
 * TWO THINGS TO KNOW ABOUT THE COVERAGE
 * 1. It runs FURTHER FORWARD than the SNAP series — through Jan 2026 against
 *    SNAP's Aug 2025 — because HHSC never stopped publishing this one.
 * 2. It has GAPS. Seven months between 2022 and 2024 were never posted. They
 *    come through as null rather than being interpolated: a straight line drawn
 *    through a month nobody published is a fabricated data point.
 *
 * Run locally:  npm run fetch:medicaid
 *               npm run fetch:medicaid -- --refresh
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const XLSX = createRequire(import.meta.url)('xlsx');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/medicaid-observed.json');
const COUNTIES_JSON = resolve(ROOT, 'public/data/counties.json');
const CACHE = resolve(ROOT, 'node_modules/.cache/medicaid-workbooks');

const ORIGIN = 'https://www.hhs.texas.gov';
const INDEX = `${ORIGIN}/about/records-statistics/data-statistics/healthcare-statistics`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const REFRESH = process.argv.includes('--refresh');

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function monthFromHref(href) {
  const file = decodeURIComponent(href).split('/').pop().toLowerCase();
  const m = file.match(/-([a-z]+)-(\d{4})(?:_\d+)?\.xlsx?$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  return month ? `${m[2]}-${String(month).padStart(2, '0')}` : null;
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function listWorkbooks() {
  const html = await getText(INDEX);
  const byMonth = new Map();
  for (const m of html.matchAll(/href="([^"]+\.xlsx?)"/gi)) {
    const href = m[1];
    const file = decodeURIComponent(href).split('/').pop().toLowerCase();
    // "final" only: the preliminary file for the same month is superseded, and
    // taking both would give one month two different values.
    if (!/^medicaid-enrollment-by-county-final/.test(file)) continue;
    const month = monthFromHref(href);
    if (month && !byMonth.has(month)) {
      byMonth.set(month, href.startsWith('http') ? href : `${ORIGIN}${href}`);
    }
  }
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

async function workbookBytes(month, url) {
  const cached = resolve(CACHE, `${month}${url.endsWith('.xlsx') ? '.xlsx' : '.xls'}`);
  if (!REFRESH && existsSync(cached)) return readFileSync(cached);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, buf);
  return buf;
}

/**
 * Columns are taken positionally but the header is still checked, so a
 * reshuffle fails loudly rather than silently mapping the disability caseload
 * onto the children's one.
 */
const COLUMNS = [
  [0, /county\s*code/i],
  [1, /^county$/i],
  [2, /medicaid\s*caseload/i],
  [8, /children'?s\s*medicaid/i],
];

function parseWorkbook(bytes, month) {
  const wb = XLSX.read(bytes, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const headerIndex = rows.findIndex((r) => /county\s*code/i.test(String(r?.[0] ?? '')));
  if (headerIndex < 0) throw new Error(`${month}: no header row`);
  const header = rows[headerIndex].map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
  for (const [i, pattern] of COLUMNS) {
    if (!pattern.test(header[i] ?? '')) {
      throw new Error(`${month}: column ${i} is "${header[i]}", not what was expected`);
    }
  }

  const out = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const name = String(row?.[1] ?? '').trim();
    // The sheet ends in footnote prose; the first non-county row stops the read.
    if (!name || typeof row[2] !== 'number') {
      if (out.length) break;
      continue;
    }
    if (/^(state|total)/i.test(name)) break;
    // "Unknown" is enrollees with no county on the record — the sheet's
    // equivalent of SNAP's Call Centers row. It belongs in the statewide total
    // and nowhere on the map, so it is kept and flagged rather than joined.
    if (/^unknown$/i.test(name)) {
      out.push({ name, caseload: row[2], children: row[8] ?? 0, aged: row[3] ?? 0, unplaced: true });
      continue;
    }
    out.push({
      name,
      caseload: row[2],
      children: row[8] ?? 0,
      aged: row[3] ?? 0,
    });
  }
  return out;
}

/** Same join key as the SNAP script — footnote markers and De Witt. */
const NAME_FIXES = { dewitt: 'de witt' };
const normalise = (n) => {
  const k = n
    .toLowerCase()
    .replace(/\*+$/, '')
    .replace(/\d+$/, '')
    .replace(/\s+county$/, '')
    .replace(/[.']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return NAME_FIXES[k] ?? k;
};

/** Every month between two "YYYY-MM", inclusive. */
function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ey, em] = last.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function main() {
  const workbooks = await listWorkbooks();
  if (workbooks.length === 0) {
    throw new Error('no Medicaid county workbooks on the index page — markup probably changed');
  }
  console.log(
    `${workbooks.length} monthly workbooks, ${workbooks[0][0]} → ${workbooks.at(-1)[0]}`,
  );

  const geoidByName = new Map();
  if (existsSync(COUNTIES_JSON)) {
    for (const c of JSON.parse(readFileSync(COUNTIES_JSON, 'utf8'))) {
      geoidByName.set(normalise(c.name), c.geoid);
    }
  }

  /*
     A DENSE month axis with holes, not a compact list of the months that exist.

     Seven months were never published. Emitting only the published ones would
     put Jun 2022 next to Oct 2022 on an evenly spaced axis and draw the gap as
     if it were a single month's change. The axis runs every month and the
     missing ones are null, so a chart can break its line there.
  */
  const months = monthRange(workbooks[0][0], workbooks.at(-1)[0]);
  const indexOf = new Map(months.map((m, i) => [m, i]));
  const blank = () => new Array(months.length).fill(null);

  const statewide = { caseload: blank(), children: blank(), aged: blank() };
  const counties = new Map();
  const unmatched = new Set();

  for (const [month, url] of workbooks) {
    const rows = parseWorkbook(await workbookBytes(month, url), month);
    if (rows.filter((r) => !r.unplaced).length !== 254) {
      throw new Error(
        `${month}: parsed ${rows.filter((r) => !r.unplaced).length} counties, expected 254 (${url})`,
      );
    }
    const i = indexOf.get(month);

    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    statewide.caseload[i] = sum('caseload');
    statewide.children[i] = sum('children');
    statewide.aged[i] = sum('aged');

    for (const row of rows) {
      if (row.unplaced) continue;
      const geoid = geoidByName.get(normalise(row.name));
      if (!geoid) {
        unmatched.add(row.name);
        continue;
      }
      if (!counties.has(geoid)) {
        counties.set(geoid, { name: row.name, caseload: blank(), children: blank() });
      }
      const series = counties.get(geoid);
      series.caseload[i] = row.caseload;
      series.children[i] = row.children;
    }
    process.stdout.write(`  ${month}  ${sum('caseload').toLocaleString()} enrolled\n`);
  }

  const missing = months.filter((m) => !indexOf.has(m) || statewide.caseload[indexOf.get(m)] == null);
  if (missing.length) {
    console.warn(`NOTE: ${missing.length} month(s) never published: ${missing.join(', ')}`);
  }
  if (unmatched.size) {
    console.warn(`WARNING: ${unmatched.size} name(s) did not join counties.json:`);
    console.warn(`  ${[...unmatched].join(', ')}`);
  }

  const payload = {
    observed: true,
    source: 'Texas Health and Human Services Commission',
    source_url: INDEX,
    note:
      'Final monthly Medicaid enrollment by county, as published by Texas HHSC. ' +
      'Months HHSC did not publish are null, never interpolated.',
    generated: new Date().toISOString().slice(0, 10),
    months,
    first: months[0],
    latest: months.at(-1),
    missing_months: missing,
    statewide,
    counties: Object.fromEntries([...counties].sort((a, b) => a[0].localeCompare(b[0]))),
  };

  writeFileSync(OUT, `${JSON.stringify(payload)}\n`);
  console.log(
    `\nwrote ${OUT.replace(`${ROOT}/`, '')} ` +
      `(${Math.round(readFileSync(OUT).length / 1024)}KB, ${counties.size} counties)`,
  );
}

main().catch((err) => {
  console.error(`fetch-medicaid-stats failed: ${err.message}`);
  console.error('Nothing was written; the previous medicaid-observed.json is untouched.');
  process.exit(1);
});
