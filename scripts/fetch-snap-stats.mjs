/**
 * Build public/data/snap-observed.json (+ snap-by-county.json) from Texas HHS's
 * published monthly SNAP workbooks.
 *
 *   Index page  https://www.hhs.texas.gov/about/records-statistics/data-statistics/supplemental-nutritional-assistance-program-snap-statistics
 *   Workbooks   .../documents/snap-cases-eligible-ind-by-county-aug-2025.xls
 *
 * SUPERSEDED FOR THE PAGE, 2026-09-23. HHSC stopped posting these workbooks
 * after Aug 2025 (later months are Tableau-only and bot-blocked), and this
 * script's statewide sum includes the "Call Centers" / "State Office" rows, so
 * its Jul 2025 figure is ~3,300 above the county sum the hero and map use.
 * public/data/snap-observed.json is now written by build-county-data.mjs from the
 * same county rows as everything else, through the latest month. Running this
 * OVERWRITES that file with the shorter, differently-summed series — it is no
 * longer part of `fetch:data`. Kept as an independent scrape of the source.
 *
 * WHY THIS IS A BUILD STEP, NOT A RUNTIME FETCH
 * Same reasoning as fetch-texas-works.mjs: the page is static on GitHub Pages,
 * hhs.texas.gov sends no CORS headers, and a reader should not depend on a
 * government host being up. A GitHub Action runs this monthly and commits the
 * result.
 *
 * WHY THE LINKS ARE SCRAPED RATHER THAN CONSTRUCTED
 * The filenames are not a pattern. Across the four published years they include
 * `snap-case-eligible-county-jan-2022.xls`, `...-eligable-ind-county-jan-2024.xls`
 * (sic), `...-ind-by%3Dcounty-june-2025.xls` (sic), Drupal's `_0`/`_1` collision
 * suffixes, and both .xls and .xlsx. Guessing URLs would silently lose months;
 * the index page is the only reliable list.
 *
 * Run locally:  npm run fetch:snap
 *               npm run fetch:snap -- --refresh     (ignore the on-disk cache)
 *
 * SAFETY: exits non-zero WITHOUT writing if the index yields no workbooks, or if
 * a month parses to something that is not 254 counties. A silently short series
 * would redraw the chart with a gap and nobody would notice.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const XLSX = createRequire(import.meta.url)('xlsx');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_STATEWIDE = resolve(ROOT, 'public/data/snap-observed.json');
const OUT_COUNTIES = resolve(ROOT, 'public/data/snap-by-county.json');
const COUNTIES_JSON = resolve(ROOT, 'public/data/counties.json');
/** Workbooks are immutable once published, so re-runs only fetch new months. */
const CACHE = resolve(ROOT, 'node_modules/.cache/snap-workbooks');

const ORIGIN = 'https://www.hhs.texas.gov';
const INDEX =
  `${ORIGIN}/about/records-statistics/data-statistics/supplemental-nutritional-assistance-program-snap-statistics`;
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

/**
 * Pull the month out of the filename rather than the link text.
 *
 * The link text is only ever the month name ("August") — the year comes from the
 * heading it sits under, which is a much more fragile thing to parse than the
 * filename, and every filename carries both.
 */
function monthFromHref(href) {
  const file = decodeURIComponent(href).split('/').pop().toLowerCase();
  const m = file.match(/-([a-z]+)-(\d{4})(?:_\d+)?\.xlsx?$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (!month) return null;
  return `${m[2]}-${String(month).padStart(2, '0')}`;
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/**
 * Every county-level workbook linked from the index, newest first, one per month.
 *
 * Filtered on the filename: the same page also links "timeliness" workbooks and
 * several statewide-only series, which have different columns entirely.
 */
async function listWorkbooks() {
  const html = await getText(INDEX);
  const byMonth = new Map();

  for (const m of html.matchAll(/href="([^"]+\.xlsx?)"/gi)) {
    const href = m[1];
    const file = decodeURIComponent(href).split('/').pop().toLowerCase();
    if (!/^snap-cases?-elig/.test(file)) continue;
    if (!/county/.test(file)) continue;
    if (/timeliness/.test(file)) continue;

    const month = monthFromHref(href);
    if (!month) continue;
    // A month listed twice (Drupal `_0` re-uploads) keeps the first link, which
    // is the one the page presents.
    if (!byMonth.has(month)) {
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
 * Column order has been stable across all four published years; the header text
 * has not ("Ages 5-17" vs "Ages  5 - 17", and "eligable" in two months). So the
 * header row is located by its first cell and the columns are taken positionally
 * — but the header is still checked, so a genuine reshuffle fails loudly rather
 * than silently reading payments as caseload.
 */
const COLUMNS = [
  ['county', /county\s*name/i],
  ['cases', /number\s*of\s*cases/i],
  ['individuals', /number\s*of\s*eligible\s*individuals/i],
  ['age_under_5', /ages?\s*<\s*5/i],
  ['age_5_17', /ages?\s*5\s*-\s*17/i],
  ['age_18_59', /ages?\s*18\s*-\s*59/i],
  ['age_60_64', /ages?\s*60\s*-\s*64/i],
  ['age_65_plus', /ages?\s*65\s*\+/i],
  ['payments', /total\s*snap\s*payments/i],
];

function parseWorkbook(bytes, month) {
  const wb = XLSX.read(bytes, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const headerIndex = rows.findIndex((r) => /county\s*name/i.test(String(r?.[0] ?? '')));
  if (headerIndex < 0) throw new Error(`${month}: no header row`);

  const header = rows[headerIndex].map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
  COLUMNS.forEach(([name, pattern], i) => {
    if (!pattern.test(header[i] ?? '')) {
      throw new Error(`${month}: column ${i} is "${header[i]}", expected ${name}`);
    }
  });

  /*
     Three age bands that SUM TO THE TOTAL, from the sheet's five.

     The sheet splits under-5 from 5-17, and 18-59 from 60-64. Collapsing to
     children / working-age / seniors is what the rail chart stacks, and the
     collapse has to be exhaustive: an earlier version folded 18-59 into
     `adults` and silently dropped 60-64, which left the three bands 139,270
     people short of the published total. A stacked area whose bands do not add
     up to the line above them is a chart that lies quietly.
  */
  const read = (row) => ({
    name: String(row[0]).trim(),
    cases: row[1],
    individuals: row[2],
    children: (row[3] ?? 0) + (row[4] ?? 0),
    adults: (row[5] ?? 0) + (row[6] ?? 0),
    seniors: row[7] ?? 0,
    payments: row[8] ?? 0,
  });

  /*
     The sheet is 254 counties, then two pseudo-counties, then a total, then
     footnote prose:

       Zavala          1,657 …
       Call Centers    1,217 …   ← cases not attributed to a physical county
       State Office        0 …
       State Total1  1,587,249 … ← the published statewide figure

     Both pseudo-rows are inside the state total, so summing the 254 counties
     does NOT reproduce it — in Jan 2022 it falls ~2,800 individuals short. The
     statewide series therefore uses the published total row and the map data
     uses the counties, which is how HHSC intends them to be read.
  */
  const counties = [];
  const unattributed = [];
  let total = null;

  for (const row of rows.slice(headerIndex + 1)) {
    const name = String(row?.[0] ?? '').trim();
    if (!name || typeof row[1] !== 'number') {
      if (counties.length) break; // into the footnotes
      continue;
    }
    if (/^state\s*total/i.test(name)) {
      total = read(row);
      break;
    }
    if (/^(call centers?|state office)$/i.test(name)) {
      unattributed.push(read(row));
      continue;
    }
    counties.push(read(row));
  }

  if (!total) throw new Error(`${month}: no "State Total" row`);
  return { counties, unattributed, total };
}

/**
 * Join key for a county name.
 *
 * The sheets carry footnote markers in the name cell ("Matagorda1", where the
 * note records a revision), and HHSC and TIGER disagree on whether De Witt has a
 * space in it. Both sides go through this, so the fixes only have to make the
 * two spellings meet somewhere, not match either source exactly.
 */
const NAME_FIXES = {
  dewitt: 'de witt',
};
const normalise = (n) => {
  const k = n
    .toLowerCase()
    .replace(/\d+$/, '')
    .replace(/\s+county$/, '')
    .replace(/[.']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return NAME_FIXES[k] ?? k;
};

async function main() {
  const workbooks = await listWorkbooks();
  if (workbooks.length === 0) {
    throw new Error('no county workbooks found on the index page — markup probably changed');
  }
  console.log(`${workbooks.length} monthly workbooks, ${workbooks[0][0]} → ${workbooks.at(-1)[0]}`);

  const geoidByName = new Map();
  if (existsSync(COUNTIES_JSON)) {
    for (const c of JSON.parse(readFileSync(COUNTIES_JSON, 'utf8'))) {
      geoidByName.set(normalise(c.name), c.geoid);
    }
  }

  const months = [];
  const statewide = {
    cases: [], individuals: [], children: [], adults: [], seniors: [], payments: [],
  };
  /** geoid -> { cases: [], individuals: [], children: [] }, parallel to `months`. */
  const counties = new Map();
  const unmatched = new Set();
  /** Months where the sheet's own total row disagrees with its own rows. */
  const reconciliation = [];
  /** Months where the age columns do not quite add up to the individuals column. */
  const unbanded = [];

  for (const [month, url] of workbooks) {
    const { counties: rows, unattributed, total } = parseWorkbook(
      await workbookBytes(month, url),
      month,
    );
    if (rows.length !== 254) {
      throw new Error(`${month}: parsed ${rows.length} counties, expected 254 (${url})`);
    }
    const i = months.length;
    months.push(month);

    /*
       The statewide series is the SUM of the sheet's own rows, not its
       "State Total" row.

       Usually they agree to the person. They do not in August 2022, where the
       total row still holds July's 3,349,516 while the county rows below it are
       plainly August's and add to 3,476,638 — an upstream copy-paste that has
       never been corrected. Summing keeps the headline reproducible from the
       same county table the map is drawn from, so a reader who adds up the
       counties gets the number on the page. Every disagreement is recorded in
       `reconciliation` below rather than quietly smoothed over.
    */
    const sum = (k) =>
      rows.reduce((s, r) => s + r[k], 0) + unattributed.reduce((s, r) => s + r[k], 0);

    /*
       The bands are what the rail chart stacks, so they have to add up.

       They do not add up EXACTLY, and that is upstream: in the 2022 sheets the
       five age columns fall a few dozen people short of the eligible-individuals
       column (worst case 76 of 3,518,186, or 0.002%) — presumably records with
       no age on them. From 2023 on they reconcile to the person.
       0.05% is loose enough to absorb that and tight enough that a dropped
       column — the 60-64 band went missing once, worth 139,270 people — still
       fails the build.
    */
    const banded = sum('children') + sum('adults') + sum('seniors');
    const bandGap = sum('individuals') - banded;
    if (Math.abs(bandGap) > sum('individuals') * 0.0005) {
      throw new Error(
        `${month}: age bands total ${banded} but eligible individuals is ${sum('individuals')} ` +
          `(${bandGap} unaccounted — a column has probably moved)`,
      );
    }
    if (bandGap !== 0) unbanded.push({ month, people: bandGap });

    if (Math.abs(sum('individuals') - total.individuals) > 1) {
      reconciliation.push({
        month,
        published_total: total.individuals,
        sum_of_rows: sum('individuals'),
        difference: sum('individuals') - total.individuals,
      });
    }

    statewide.cases.push(sum('cases'));
    statewide.individuals.push(sum('individuals'));
    statewide.children.push(sum('children'));
    statewide.adults.push(sum('adults'));
    statewide.seniors.push(sum('seniors'));
    statewide.payments.push(Math.round(sum('payments')));

    for (const row of rows) {
      const geoid = geoidByName.get(normalise(row.name));
      if (!geoid) {
        unmatched.add(row.name);
        continue;
      }
      if (!counties.has(geoid)) {
        counties.set(geoid, { name: row.name, cases: [], individuals: [], children: [] });
      }
      const series = counties.get(geoid);
      // Keep every series dense: a month a county is missing from would
      // otherwise shift every later value one position to the left.
      while (series.cases.length < i) {
        series.cases.push(null);
        series.individuals.push(null);
        series.children.push(null);
      }
      series.cases.push(row.cases);
      series.individuals.push(row.individuals);
      series.children.push(row.children);
    }
    process.stdout.write(`  ${month}  ${sum('individuals').toLocaleString()} individuals\n`);
  }

  for (const series of counties.values()) {
    while (series.cases.length < months.length) {
      series.cases.push(null);
      series.individuals.push(null);
      series.children.push(null);
    }
  }

  /*
     One bad total row is an upstream typo; a dozen is a column that has moved
     under us, and then every number here is wrong. Fail on the second case.
  */
  if (reconciliation.length > Math.max(2, months.length * 0.1)) {
    throw new Error(
      `${reconciliation.length} of ${months.length} months disagree with their own ` +
        'State Total row — the sheet layout has probably changed',
    );
  }
  for (const r of reconciliation) {
    console.warn(
      `NOTE: ${r.month} sheet total says ${r.published_total.toLocaleString()}, its own rows ` +
        `add to ${r.sum_of_rows.toLocaleString()} (${r.difference > 0 ? '+' : ''}${r.difference.toLocaleString()}). Using the rows.`,
    );
  }

  if (unbanded.length) {
    const worst = unbanded.reduce((a, b) => (Math.abs(b.people) > Math.abs(a.people) ? b : a));
    console.warn(
      `NOTE: ${unbanded.length} month(s) have people with no age band — worst ` +
        `${worst.month}, ${worst.people}. Recorded in meta.unbanded.`,
    );
  }

  if (unmatched.size) {
    console.warn(`WARNING: ${unmatched.size} county name(s) did not join counties.json:`);
    console.warn(`  ${[...unmatched].join(', ')}`);
  }

  /**
   * Month-over-month change, aligned to `months` — the first entry has no prior
   * month, so it is null rather than 0. The chart draws that difference.
   */
  const change = statewide.individuals.map((v, i) =>
    i === 0 ? null : v - statewide.individuals[i - 1],
  );

  const meta = {
    observed: true,
    source: 'Texas Health and Human Services Commission',
    source_url: INDEX,
    note:
      'Month-end SNAP cases and eligible individuals by county, as published by Texas HHSC. ' +
      'Observed counts, not a model, and not adjusted for the H.R. 1 provisions.',
    generated: new Date().toISOString().slice(0, 10),
    months,
    first: months[0],
    latest: months.at(-1),
    reconciliation,
    unbanded,
  };

  writeFileSync(
    OUT_STATEWIDE,
    `${JSON.stringify({ ...meta, statewide: { ...statewide, change } })}\n`,
  );
  writeFileSync(
    OUT_COUNTIES,
    `${JSON.stringify({
      ...meta,
      counties: Object.fromEntries([...counties].sort((a, b) => a[0].localeCompare(b[0]))),
    })}\n`,
  );

  const kb = (p) => `${Math.round(readFileSync(p).length / 1024)}KB`;
  console.log(`\nwrote ${OUT_STATEWIDE.replace(`${ROOT}/`, '')} (${kb(OUT_STATEWIDE)})`);
  console.log(`wrote ${OUT_COUNTIES.replace(`${ROOT}/`, '')} (${kb(OUT_COUNTIES)}) — not fetched by the app`);
}

main().catch((err) => {
  console.error(`fetch-snap-stats failed: ${err.message}`);
  console.error('Nothing was written; the previous snap-observed.json is untouched.');
  process.exit(1);
});
