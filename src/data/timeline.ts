/**
 * Timeline-feed content.
 *
 * Currently a static JSON file committed alongside the other payloads, which
 * keeps the site self-contained and offline-safe. The shape is deliberately flat
 * so the source can move without touching the component.
 *
 * TO READ FROM A GOOGLE SHEET INSTEAD: replace the body of loadTimeline() with a
 * fetch of the sheet's published CSV endpoint and map rows to TimelineItem.
 * Worth knowing before you do:
 *   - it adds a runtime dependency on an external host, so the page needs a
 *     fallback for when the fetch fails (return FALLBACK below);
 *   - the sheet must be "published to the web" — a private sheet needs an API
 *     key, which cannot be hidden in a static build;
 *   - the JA template's longevity rule (no phone-home) argues for baking it at
 *     build time instead: a GitHub Action can pull the sheet and commit the JSON,
 *     which keeps the runtime static and still lets non-developers edit content.
 */

export interface TimelineStat {
  value: string;
  body: string;
  tone?: 'negative';
}

export interface TimelineItem {
  /** "YYYY-MM" — used to mark entries inside the active window. */
  month: string;
  title: string;
  body: string;
}

export interface TimelineContent {
  stats: TimelineStat[];
  feed: TimelineItem[];
}

/** Shown if the content cannot be loaded, so the column is never blank. */
const FALLBACK: TimelineContent = { stats: [], feed: [] };

export async function loadTimeline(): Promise<TimelineContent> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/timeline.json`);
    if (!res.ok) return FALLBACK;
    const json = (await res.json()) as TimelineContent;
    // Sort newest first so the feed reads downward through time regardless of
    // how the source happens to be ordered.
    return {
      stats: json.stats ?? [],
      feed: (json.feed ?? []).slice().sort((a, b) => b.month.localeCompare(a.month)),
    };
  } catch {
    return FALLBACK;
  }
}
