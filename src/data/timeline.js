/**
 * Content for the hero band's right column.
 *
 * Two sources, deliberately separate:
 *
 *   timeline.json   the three topline figures. Editorial, hand-edited.
 *   bulletins.json  the dated feed. GENERATED from Texas HHS "Texas Works"
 *                   policy bulletins and quarterly revisions by
 *                   scripts/fetch-texas-works.mjs, refreshed on a schedule by
 *                   .github/workflows/refresh-bulletins.yml.
 *
 * Keeping them apart means the scheduled job never touches hand-written copy,
 * and a human edit never gets clobbered by a scrape.
 *
 * The SNAP / H.R. 1 tags are classified HERE rather than in the scraper, for two
 * reasons: the taxonomy is a display decision and should not need a re-scrape to
 * change, and the scraper runs on a schedule against a live government host, so
 * the fewer reasons to re-run it the better. It also means bulletins published
 * after this code shipped get tagged the same way, with no backfill.
 *
 * The fetch happens at BUILD time, not here: fhb.hhs.texas.gov sends no CORS
 * headers, and a static page should not depend on a government host being up for
 * every reader.
 */

/**
 * @typedef {Object} TimelineStat
 * @property {string} value
 * @property {string} body
 * @property {'negative'} [tone]
 */

/**
 * Which programme a bulletin touches, for the feed's filter.
 *
 * 'snap'  names SNAP, or one of its work-requirement terms
 * 'hr1'   names H.R. 1 itself, or the ABAWD / work-rules provisions it changed
 *
 * A bulletin can carry both, and most `hr1` ones do.
 *
 * @typedef {'snap' | 'hr1' | 'health'} BulletinTag
 */

/**
 * @typedef {Object} TimelineItem
 * @property {string} month - "YYYY-MM", used to mark entries inside the active window.
 * @property {string} [date] - "YYYY-MM-DD" where known.
 * @property {string} title
 * @property {string} body
 * @property {string} [number] - Bulletin or revision number, e.g. "26-14".
 * @property {string} [url] - Link to the source PDF or page. Absent for hand-written entries.
 * @property {string} [source]
 * @property {BulletinTag[]} [tags] - Derived at load time by classify(), never present in the scraped file.
 */

/**
 * @typedef {Object} TimelineContent
 * @property {TimelineStat[]} stats
 * @property {TimelineItem[]} feed
 */

const EMPTY = { stats: [], feed: [] };

/**
 * A TEXT MATCH on the bulletin's title and body — not an editorial judgment
 * about which programmes it really affects.
 *
 * This matters and the UI says so: several bulletins apply across every Texas
 * Works programme without naming one. "Mandatory Shelter Costs Verification"
 * changes the SNAP shelter deduction and does not contain the word SNAP, so the
 * SNAP filter will not show it. The filter narrows the feed; it is not an
 * authority on scope.
 *
 * ABAWD and "work rules" count as both: they are SNAP terms, and they are the
 * specific provisions H.R. 1 changed, which is this dashboard's whole subject.
 */
const SNAP_RE = /\bSNAP\b|\bABAWD\b|allotment|work rules|food stamp/i;
const HR1_RE = /H\.?\s?R\.?\s?1\b|House Resolution 1\b|\bABAWD\b|work rules/i;
/*
 * Health coverage. Texas Works runs SNAP, TANF, Medicaid and CHIP off one
 * handbook, so a sizeable share of the feed is coverage policy — and H.R. 1
 * changed both sides. CHIP and the Marketplace are in here with Medicaid and
 * Medicare because a reader filtering for "coverage" means all of it; the pill
 * is labelled Medicaid because that is what most of these bulletins say.
 */
const HEALTH_RE =
  /\bMedicaid\b|\bMedicare\b|\bCHIP\b|Children's Health Insurance|Marketplace|Perinatal/i;

export function classify(item) {
  const text = `${item.title} ${item.body}`;
  const tags = [];
  if (SNAP_RE.test(text)) tags.push('snap');
  if (HR1_RE.test(text)) tags.push('hr1');
  if (HEALTH_RE.test(text)) tags.push('health');
  return tags;
}

async function getJson(file) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
    if (!res.ok) return null;
    return (await res.json());
  } catch {
    return null;
  }
}

export async function loadTimeline() {
  const [editorial, bulletins] = await Promise.all([
    getJson('timeline.json'),
    getJson('bulletins.json'),
  ]);

  // Either source missing degrades to an empty half rather than a blank column.
  return {
    stats: editorial?.stats ?? EMPTY.stats,
    feed: (bulletins?.feed ?? EMPTY.feed)
      .map((item) => ({ ...item, tags: classify(item) }))
      .sort((a, b) => (b.date ?? b.month).localeCompare(a.date ?? a.month)),
  };
}
