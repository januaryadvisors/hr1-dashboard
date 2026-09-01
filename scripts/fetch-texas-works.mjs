/**
 * Build public/data/bulletins.json from Texas HHS "Texas Works" sources.
 *
 *   Policy bulletins    https://fhb.hhs.texas.gov/handbooks/texas-works-handbook/twh-policy-bulletins
 *   Quarterly revisions https://fhb.hhs.texas.gov/handbooks/texas-works-handbook/twh-revisions
 *
 * WHY THIS IS A BUILD STEP, NOT A RUNTIME FETCH
 * The dashboard is a static page on GitHub Pages. Fetching fhb.hhs.texas.gov
 * from the browser would need CORS headers we do not control (they are not
 * sent), and would put a live dependency on a government host in front of every
 * reader. So a GitHub Action runs this on a schedule and commits the result:
 * the runtime stays static, the content stays current, and if HHS is down the
 * last good copy is still on the page.
 *
 * Run locally:  node scripts/fetch-texas-works.mjs
 *
 * SAFETY: if either source fails, or parses to zero entries, this exits non-zero
 * WITHOUT writing. A scrape that silently produces an empty feed is worse than a
 * stale one.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/bulletins.json');

const ORIGIN = 'https://fhb.hhs.texas.gov';
const SOURCES = {
  bulletins: `${ORIGIN}/handbooks/texas-works-handbook/twh-policy-bulletins`,
  revisions: `${ORIGIN}/handbooks/texas-works-handbook/twh-revisions`,
};

const MAX_ENTRIES = 40;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&#160;': ' ',
};
const decode = (s) => s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
const text = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const absolute = (href) => (href.startsWith('http') ? href : `${ORIGIN}${href}`);

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/**
 * "08-14-2026" and "08-07-26" both appear on the page. Two-digit years are
 * assumed to be 2000s — these bulletins do not predate that.
 */
function isoDate(raw) {
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const month = String(Number(mm)).padStart(2, '0');
  const day = String(Number(dd)).padStart(2, '0');
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${year}-${month}-${day}`;
}

/** Policy bulletins live in a three-column table: date | number | linked titles. */
function parseBulletins(html) {
  const out = [];
  const table = html.match(/<table[^>]*>[\s\S]*?<\/table>/);
  if (!table) return out;

  for (const row of table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    if (cells.length < 3) continue; // header row

    const date = isoDate(text(cells[0]));
    const number = text(cells[1]);
    if (!date || !number) continue;

    // A cell can hold several titles, sometimes all pointing at one PDF.
    // Group by href so one bulletin is one entry.
    const byHref = new Map();
    for (const a of cells[2].matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const href = absolute(a[1]);
      const title = text(a[2]).replace(/\s*\(PDF\)\s*$/i, '').replace(/^\d+\.\s*/, '');
      if (!title) continue;
      if (!byHref.has(href)) byHref.set(href, []);
      const titles = byHref.get(href);
      if (!titles.includes(title)) titles.push(title);
    }
    if (!byHref.size) continue;

    for (const [url, titles] of byHref) {
      out.push({
        date,
        month: date.slice(0, 7),
        number,
        title: `Bulletin ${number}`,
        body: titles.join(' · '),
        url,
        source: 'Texas Works policy bulletin',
      });
    }
  }
  return out;
}

/** Quarterly revisions are a plain list of links, with the period in the label. */
function parseRevisions(html) {
  const out = [];
  const MONTHS = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };

  for (const a of html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = a[1];
    const label = text(a[2]);
    // e.g. "26-3, July Quarterly Revision"
    const m = label.match(/^(\d{2})-(\d),\s*([A-Za-z]+)\s+Quarterly Revision$/);
    if (!m || !href.includes('quarterly-revision')) continue;

    const [, fy, , monthName] = m;
    const mm = MONTHS[monthName.toLowerCase()];
    if (!mm) continue;

    // The label carries a state FISCAL year, which starts in September — so a
    // July revision in FY26 falls in calendar 2026, an October one in 2025.
    const fiscalYear = 2000 + Number(fy);
    const year = Number(mm) >= 9 ? fiscalYear - 1 : fiscalYear;
    const date = `${year}-${mm}-01`;

    out.push({
      date,
      month: `${year}-${mm}`,
      number: m[1] + '-' + m[2],
      title: `${monthName} quarterly revision`,
      body: 'Handbook revisions folded into the Texas Works Handbook.',
      url: absolute(href),
      source: 'Texas Works quarterly revision',
    });
  }
  return out;
}

// ------------------------------------------------------------------------- run
const errors = [];
let bulletins = [];
let revisions = [];

try {
  bulletins = parseBulletins(await get(SOURCES.bulletins));
  console.log(`policy bulletins:    ${bulletins.length}`);
} catch (err) {
  errors.push(`bulletins: ${err.message}`);
}

try {
  revisions = parseRevisions(await get(SOURCES.revisions));
  console.log(`quarterly revisions: ${revisions.length}`);
} catch (err) {
  errors.push(`revisions: ${err.message}`);
}

if (errors.length) {
  console.error(`\nfetch failed:\n  ${errors.join('\n  ')}`);
}

// Both pages list some links twice (once in the body, once in a sidebar), so
// dedupe on the pair that identifies a document.
const deduped = [];
const keys = new Set();
for (const entry of [...bulletins, ...revisions]) {
  const key = `${entry.number}|${entry.url}`;
  if (keys.has(key)) continue;
  keys.add(key);
  deduped.push(entry);
}

const feed = deduped
  // Newest first; ties broken by bulletin number so the order is stable.
  .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  .slice(0, MAX_ENTRIES);

if (!feed.length) {
  console.error('\nRefusing to write: parsed zero entries. Leaving the existing file in place.');
  console.error('The page markup has probably changed — check parseBulletins/parseRevisions.');
  process.exit(1);
}

// Report what changed, so the Action's log says something useful.
let previous = [];
try {
  previous = JSON.parse(readFileSync(OUT, 'utf8')).feed ?? [];
} catch {
  /* first run */
}
const seen = new Set(previous.map((e) => `${e.number}|${e.url}`));
const added = feed.filter((e) => !seen.has(`${e.number}|${e.url}`));

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      // No generated-at timestamp: it would make every run a diff even when
      // nothing changed, and the Action commits on diff.
      sources: SOURCES,
      note: 'Generated by scripts/fetch-texas-works.mjs. Do not edit by hand.',
      feed,
    },
    null,
    2,
  )}\n`,
);

console.log(`\nwrote ${feed.length} entries to public/data/bulletins.json`);
if (added.length) {
  console.log(`new since last run: ${added.length}`);
  for (const e of added.slice(0, 6)) console.log(`  ${e.date}  ${e.number}  ${e.body.slice(0, 60)}`);
}
if (errors.length) process.exit(2); // wrote a partial feed
