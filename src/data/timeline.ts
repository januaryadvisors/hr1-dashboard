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
 * The fetch happens at BUILD time, not here: fhb.hhs.texas.gov sends no CORS
 * headers, and a static page should not depend on a government host being up for
 * every reader.
 */

export interface TimelineStat {
  value: string;
  body: string;
  tone?: 'negative';
}

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
}

export interface TimelineContent {
  stats: TimelineStat[];
  feed: TimelineItem[];
}

const EMPTY: TimelineContent = { stats: [], feed: [] };

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
      .slice()
      .sort((a, b) => (b.date ?? b.month).localeCompare(a.date ?? a.month)),
  };
}
