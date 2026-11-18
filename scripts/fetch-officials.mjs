/**
 * Build public/data/officials.json — who holds each TX House, TX Senate and US
 * House seat, for the Insights report's district pages. Names and parties only.
 *
 *   npm run fetch:officials           fetch, merge, write, and print a report
 *   npm run fetch:officials -- --check   the same report, nothing written
 *   ... -- --today=2027-01-15         run as of another date (to test the January hand-over)
 *
 * TWO INPUTS PER SEAT
 *   results  data/officials-2027.csv (district,name,party,source), entered by
 *            hand from the Texas Secretary of State's certified November 2026
 *            results: who holds each seat in the 2027 session. One row per seat:
 *            the winner where it was on the ballot, or — for a TX Senate seat not
 *            up in 2026 — the senator continuing in it (source "not up in 2026").
 *   roster   Who sits now, from the public rosters:
 *              TX House, TX Senate  Open States  https://data.openstates.org/people/current/tx.csv
 *              US House             congress-legislators  https://unitedstates.github.io/congress-legislators/
 *
 * NOTHING IS NAMED UNTIL IT IS CONFIRMED
 * Before the 2027 members take office, a seat names someone only once it has a
 * row in officials-2027.csv; until then it reads "to be confirmed". The sitting
 * roster alone is not enough: it still lists members who lost or retired in
 * November, and the US House roster sits on the 2021 map while the dashboard
 * draws the 2026 one (PlanC2333), so its district numbers name other places.
 *
 * THE JANUARY HAND-OVER
 * Winners take office when the 90th Legislature convenes (12 Jan 2027) and the
 * 120th Congress begins (3 Jan 2027). Until then a newcomer reads "takes office
 * Jan 2027", and a re-elected or continuing member reads as the member. From
 * that date the rosters describe the new session and are used again; re-run
 * this then, and a winner the roster now lists folds into it.
 *
 * SAFETY: a roster that comes back short (a failed fetch, a changed format)
 * stops the run before anything is written, leaving the last good file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseCsv } from './lib/csv.mjs';
import { runMain, writeJson } from './lib/io.mjs';
import { ROOT } from './lib/paths.mjs';
import { FETCH_TIMEOUT_MS } from './lib/urls.mjs';

const OUT = resolve(ROOT, 'public/data/officials.json');
const ELECT = resolve(ROOT, 'data/officials-2027.csv');

const SOURCES = {
  openstates: 'https://data.openstates.org/people/current/tx.csv',
  congress: 'https://unitedstates.github.io/congress-legislators/legislators-current.json',
  results: 'https://results.texas-election.com/',
};

/**
 * expected: seats. takes_office: when November 2026's winners are sworn in —
 * from then on the chamber's roster describes the new session and is trusted.
 */
const CHAMBERS = {
  txhouse: { expected: 150, takes_office: '2027-01-12' },
  txsenate: { expected: 31, takes_office: '2027-01-12' },
  ushouse: { expected: 38, takes_office: '2027-01-03' },
};

const PARTIES = { Republican: 'R', Democratic: 'D', Democrat: 'D', Independent: 'I', Libertarian: 'L', Green: 'G' };
const party = (p) => PARTIES[p] ?? (p ? p[0].toUpperCase() : null);

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const TODAY = args.find((a) => a.startsWith('--today='))?.slice(8) ?? new Date().toISOString().slice(0, 10);

/** Lower-case, accents and punctuation gone, so "José A. Menéndez" matches "Jose Menendez". */
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['jr', 'sr', 'ii', 'iii'].includes(w));

/** Same person: the same last name and one other name in common, or identical. */
function samePerson(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x.join(' ') === y.join(' ')) return true;
  return x.at(-1) === y.at(-1) && x.slice(0, -1).some((w) => y.includes(w));
}

async function get(url, as) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}

/** seat id -> { name, party } for the members sitting today. */
async function fetchRosters() {
  const seats = new Map();

  const tx = parseCsv(await get(SOURCES.openstates));
  const chamberOf = { lower: 'txhouse', upper: 'txsenate' };
  for (const r of tx) {
    const chamber = chamberOf[r.current_chamber];
    if (!chamber || !r.current_district) continue;
    seats.set(`${chamber}-${Number(r.current_district)}`, { name: r.name, party: party(r.current_party) });
  }
  for (const chamber of ['txhouse', 'txsenate']) {
    const n = [...seats.keys()].filter((k) => k.startsWith(`${chamber}-`)).length;
    // A few vacancies are normal; a short roster is a failed fetch.
    if (n < CHAMBERS[chamber].expected - 8) throw new Error(`Open States lists ${n} ${chamber} members — too few`);
  }

  // Before the hand-over the congressional roster is on the old map: of no use.
  if (TODAY >= CHAMBERS.ushouse.takes_office) {
    const congress = await get(SOURCES.congress, 'json');
    for (const p of congress) {
      const t = p.terms.at(-1);
      if (t.type !== 'rep' || t.state !== 'TX') continue;
      seats.set(`ushouse-${t.district}`, { name: p.name.official_full, party: party(t.party) });
    }
  }
  return seats;
}

/** seat id -> { name, party, source } from the hand-entered 2026 results. */
function readElect() {
  if (!existsSync(ELECT)) return new Map();
  const out = new Map();
  for (const [i, r] of parseCsv(readFileSync(ELECT, 'utf8')).entries()) {
    const where = `${relative(ROOT, ELECT)} row ${i + 2}`;
    const [chamber, n] = r.district.split('-');
    if (!CHAMBERS[chamber] || !(Number(n) >= 1 && Number(n) <= CHAMBERS[chamber].expected)) {
      throw new Error(`${where}: "${r.district}" is not a district (txhouse-1…150, txsenate-1…31, ushouse-1…38)`);
    }
    if (!r.name) throw new Error(`${where}: no name`);
    if (!/^[RDILG]$/.test(r.party)) throw new Error(`${where}: party "${r.party}" — use R, D, I, L or G`);
    if (out.has(r.district)) throw new Error(`${where}: ${r.district} is listed twice`);
    out.set(r.district, { name: r.name, party: r.party, source: r.source || null });
  }
  return out;
}

async function main() {
  const [roster, elect] = [await fetchRosters(), readElect()];
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;

  const seats = {};
  const report = { pending: [], elect: [], changed: [] };
  for (const [chamber, { expected, takes_office }] of Object.entries(CHAMBERS)) {
    for (let n = 1; n <= expected; n++) {
      const id = `${chamber}-${n}`;
      const handedOver = TODAY >= takes_office;
      let next = elect.get(id) ?? null;
      // Before the hand-over a sitting member is named only if the results confirm them.
      const sitting = roster.get(id) ?? null;
      const current = handedOver || next ? sitting : null;
      // Re-elected, or seated and now on the roster: nothing to hand over.
      if (next && current && samePerson(next.name, current.name)) next = null;
      // Sworn in but the roster has not caught up: the winner holds the seat.
      const seated = next && handedOver;
      seats[id] = {
        current: seated ? { name: next.name, party: next.party } : current,
        elect: seated ? null : next && { name: next.name, party: next.party },
      };
      if (!seats[id].current && !seats[id].elect) report.pending.push(id);
      if (seats[id].elect) {
        report.elect.push(`${id}: ${next.name} (${next.party})${current ? `, replacing ${current.name}` : ''}`);
      }
      const was = previous?.seats?.[id]?.current?.name;
      if (was && seats[id].current && was !== seats[id].current.name) {
        report.changed.push(`${id}: ${was} → ${seats[id].current.name}`);
      }
    }
  }

  const data = {
    meta: {
      updated: TODAY,
      takes_office: Object.fromEntries(Object.entries(CHAMBERS).map(([k, c]) => [k, c.takes_office])),
      sources: SOURCES,
      results_entered: elect.size,
    },
    seats,
  };

  const counts = Object.keys(CHAMBERS).map((chamber) => {
    const list = Object.entries(seats).filter(([id]) => id.startsWith(`${chamber}-`));
    const c = (f) => list.filter(([, s]) => f(s)).length;
    return `${chamber.padEnd(8)} ${c((s) => s.current && !s.elect)} sitting · ${c((s) => s.elect)} elect · ${c((s) => !s.current && !s.elect)} to be confirmed`;
  });
  console.log(`as of ${TODAY} · ${elect.size} 2026 results entered in ${relative(ROOT, ELECT)}\n  ${counts.join('\n  ')}`);
  if (!elect.size) {
    console.log('\n! No 2026 results entered yet: every seat reads "to be confirmed" until it has a row.');
  }
  for (const [title, list] of [
    ['Taking office in January', report.elect],
    ['Changed since the last run', report.changed],
    ['To be confirmed', report.pending],
  ]) {
    if (list.length) console.log(`\n${title} (${list.length}):\n  ${list.join('\n  ')}`);
  }

  if (CHECK) {
    console.log('\n--check: nothing written.');
    return;
  }
  const { kb } = writeJson(OUT, data);
  console.log(`\n✓ ${relative(ROOT, OUT)} (${kb.toFixed(1)} KB)`);
}

runMain('fetch-officials', main, `${relative(ROOT, OUT)} was left as it was.`);
