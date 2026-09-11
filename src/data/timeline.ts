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

export interface TimelineStat {
  value: string;
  body: string;
  tone?: 'negative';
}

/**
 * Which programme a bulletin touches, for the feed's filter.
 *
 *   'snap'  names SNAP, or one of its work-requirement terms
 *   'hr1'   names H.R. 1 itself, or the ABAWD / work-rules provisions it changed
 *
 * A bulletin can carry both, and most `hr1` ones do.
 */
export type BulletinTag = 'snap' | 'hr1';

export interface TimelineItem {
  /** "YYYY-MM", used to mark entries inside the active window. */
  month: string;
  /** "YYYY-MM-DD" where known. */
  date?: string;
  title: string;
  body: string;
  /** Bulletin or revision number, e.g. "26-14". */
  number?: string;
  /** Link to the source PDF or page. Absent for hand-written entries. */
  url?: string;
  source?: string;
  /** Derived at load time by classify(), never present in the scraped file. */
  tags?: BulletinTag[];
}

export interface TimelineContent {
  stats: TimelineStat[];
  feed: TimelineItem[];
}

const EMPTY: TimelineContent = { stats: [], feed: [] };

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

export function classify(item: TimelineItem): BulletinTag[] {
  const text = `${item.title} ${item.body}`;
  const tags: BulletinTag[] = [];
  if (SNAP_RE.test(text)) tags.push('snap');
  if (HR1_RE.test(text)) tags.push('hr1');
  return tags;
}

async function getJson<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadTimeline(): Promise<TimelineContent> {
  const [editorial, bulletins] = await Promise.all([
    getJson<{ stats?: TimelineStat[] }>('timeline.json'),
    getJson<{ feed?: TimelineItem[] }>('bulletins.json'),
  ]);

  // Either source missing degrades to an empty half rather than a blank column.
  return {
    stats: editorial?.stats ?? EMPTY.stats,
    feed: (bulletins?.feed ?? EMPTY.feed)
      .map((item) => ({ ...item, tags: classify(item) }))
      .sort((a, b) => (b.date ?? b.month).localeCompare(a.date ?? a.month)),
  };
}
