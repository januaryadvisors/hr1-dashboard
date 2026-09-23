/**
 * Build data/acs-snap-households-tract.json — households that received SNAP, by
 * Texas census tract, from the ACS 2020–2024 5-year estimates (table B22001).
 *
 *   File  https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b22001.dat
 *
 * WHAT IT IS FOR
 * build-county-data.mjs apportions a county's HHSC SNAP caseload across the
 * districts it is split between. This is the split: a district gets the share of
 * the county's SNAP-receiving households (as the ACS finds them) that live in its
 * tracts. HHSC's count stays the total; the survey only says where inside the
 * county the caseload sits. See docs/SPEC-DEVIATIONS.md §V for why this and not
 * population or low-income population.
 *
 * WHY THE BULK FILE, NOT THE API
 * api.census.gov now refuses requests without a key, and a build step should not
 * need one. The table-based summary file is public, one file per table for every
 * geography in the country (~21MB); this keeps the Texas tract rows.
 *
 * WHY IT IS COMMITTED
 * The vintage is fixed (2020–24 is the ACS release the analysis uses), so the
 * output never changes on a re-run, and committing it keeps build-county-data
 * reproducible offline. It is a build input, not served to the browser, so it
 * lives in data/ rather than public/data/.
 *
 * This belongs in the R pipeline eventually — B22001 at tract level added to
 * data-raw/metadata/acs-variables.csv — at which point build-county-data can
 * read it from acs_tract.parquet instead.
 *
 * Run:  npm run fetch:acs-snap
 *
 * SAFETY: exits non-zero WITHOUT writing if the header is not the expected
 * B22001 layout or the Texas tract count is wrong.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/acs-snap-households-tract.json');
const CACHE = resolve(ROOT, 'node_modules/.cache/acs/acsdt5y2024-b22001.dat');
const URL_ =
  'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b22001.dat';

/** 2020 census tracts in Texas — the crosswalk has exactly this many. */
const TX_TRACTS = 6896;

async function bytes() {
  if (existsSync(CACHE) && !process.argv.includes('--refresh')) return readFileSync(CACHE, 'utf8');
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`${URL_} → HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, text);
  return text;
}

async function main() {
  const lines = (await bytes()).split('\n');
  const header = lines[0].trim().split('|');
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`column ${name} missing — the file layout changed`);
    return i;
  };
  // E001 all households; E002 households that received SNAP in the past 12 months.
  const [iGeo, iHH, iSnap, iSnapMoe] = ['GEO_ID', 'B22001_E001', 'B22001_E002', 'B22001_M002'].map(col);

  const tracts = {};
  for (const line of lines) {
    // Summary level 140 = tract; state FIPS 48.
    if (!line.startsWith('1400000US48')) continue;
    const f = line.split('|');
    const geoid = f[iGeo].slice(9);
    const vals = [f[iSnap], f[iSnapMoe], f[iHH]].map(Number);
    if (geoid.length !== 11 || vals.some((v) => !Number.isFinite(v) || v < 0)) {
      throw new Error(`unparseable tract row: ${line.slice(0, 80)}`);
    }
    tracts[geoid] = vals;
  }

  const n = Object.keys(tracts).length;
  if (n !== TX_TRACTS) throw new Error(`parsed ${n} Texas tracts, expected ${TX_TRACTS}`);

  const out = {
    source: 'U.S. Census Bureau, American Community Survey 2020–2024 5-year, table B22001',
    url: URL_,
    universe: 'Households',
    note:
      'Households that received Food Stamps/SNAP in the past 12 months, by 2020 census tract. ' +
      'MOEs are 90%. Survey self-report: undercounts SNAP receipt, used here for distribution only.',
    fields: ['snap_hh', 'snap_hh_moe', 'households'],
    tracts,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);

  const total = Object.values(tracts).reduce((s, t) => s + t[0], 0);
  console.log(`wrote data/acs-snap-households-tract.json — ${n} tracts, ${total.toLocaleString()} SNAP households`);
}

main().catch((err) => {
  console.error(`fetch-acs-snap-tracts failed: ${err.message}`);
  console.error('Nothing was written.');
  process.exit(1);
});
