/**
 * The dated Texas Works policy feed, in the page's sticky rail.
 *
 * §6.3's three topline stats used to sit above it; they moved into the green
 * hero band on 2026-09-11 (see <HeadlineStats>). This component is now only the
 * feed.
 *
 * The feed is Texas HHS "Texas Works" policy bulletins and quarterly revisions,
 * refreshed on a schedule (see src/data/timeline.ts). Each entry links to the
 * source PDF or page, because a policy claim on a dashboard should be one click
 * from the document it came from.
 *
 * The feed covers every Texas Works programme — CHIP, Medicaid and TANF as well
 * as SNAP — so it carries a filter, including one for the coverage side. The filter is a TEXT MATCH (see classify()
 * in src/data/timeline.ts) and the footnote says so: a bulletin that changes
 * SNAP without naming it will not appear under the SNAP filter, and pretending
 * otherwise would be the dishonest version of this control.
 */

import { useMemo, useState } from 'react';
/**
 * @typedef {import('../../data/timeline').BulletinTag} BulletinTag
 * @typedef {import('../../data/timeline').TimelineContent} TimelineContent
 */
import { fmtMonth } from '../../lib/format';
import styles from './TimelineFeed.module.css';

/**
 * @typedef {Object} TimelineFeedProps
 * @property {TimelineContent} content
 * @property {[string, string]} window - Entries inside the active brush window are marked.
 */

const SOURCE_URL = 'https://fhb.hhs.texas.gov/handbooks/texas-works-handbook/twh-policy-bulletins';

const FILTERS = [
  { key: 'all', label: 'All', title: 'Every Texas Works bulletin and revision' },
  { key: 'snap', label: 'SNAP', title: 'Bulletins naming SNAP, ABAWD, allotments or work rules' },
  { key: 'hr1', label: 'H.R. 1', title: 'Bulletins naming H.R. 1 or the provisions it changed' },
  {
    key: 'health',
    label: 'Medicaid',
    title: 'Bulletins naming Medicaid, Medicare, CHIP or the Marketplace',
  },
];

/** "2026-08-14" → "14 AUG 2026"; falls back to the month when no day is known. */
function stamp(item) {
  if (!item.date) return fmtMonth(item.month);
  const [, , day] = item.date.split('-');
  return `${Number(day)} ${fmtMonth(item.month)}`;
}

export function TimelineFeed({ content, window: win }) {
  /**
   * Local, and not in the URL. Every other control on this page is mirrored to a
   * query param because it changes what the map claims; this one only changes
   * which press releases are listed beside it.
   */
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const out = { all: content.feed.length, snap: 0, hr1: 0, health: 0 };
    for (const item of content.feed) {
      for (const tag of item.tags ?? []) out[tag] += 1;
    }
    return out;
  }, [content.feed]);

  const shown = useMemo(
    () =>
      filter === 'all'
        ? content.feed
        : content.feed.filter((item) => item.tags?.includes(filter)),
    [content.feed, filter],
  );

  return (
    <div className={styles.root}>
      <div className={styles.feedWrap}>
        <div className={styles.feedHead}>
          <span className="eyebrow">Texas Works policy updates</span>
          <a
            className={styles.sourceLink}
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            HHS source ↗
          </a>
        </div>

        {content.feed.length > 0 && (
          <div className={styles.filters} role="group" aria-label="Filter policy updates">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`${styles.filter} ${filter === f.key ? styles.filterOn : ''}`}
                aria-pressed={filter === f.key}
                title={f.title}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className={styles.filterCount}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        )}

        {content.feed.length === 0 ? (
          <p className={styles.empty}>
            No bulletins loaded. Run <code>npm run fetch:bulletins</code>.
          </p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>No bulletins match that filter.</p>
        ) : (
          <ol className={styles.feed}>
            {shown.map((item) => {
              const inWindow = item.month >= win[0] && item.month <= win[1];
              const isRevision = item.source?.includes('quarterly');
              return (
                <li
                  key={`${item.number ?? item.month}-${item.url ?? item.title}`}
                  className={`${styles.item} ${inWindow ? styles.inWindow : ''}`}
                >
                  <span className={styles.stamp}>{stamp(item)}</span>
                  <div className={styles.marker}>
                    {item.url ? (
                      <a
                        className={styles.itemLink}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        // The visible title is short; spell it out for screen readers.
                        title={item.body}
                      >
                        <span className={styles.itemTitle}>
                          {item.title}
                          {isRevision && <span className={styles.tag}>revision</span>}
                          <span className={styles.arrow} aria-hidden="true">
                            ↗
                          </span>
                        </span>
                        <span className={styles.itemBody}>{item.body}</span>
                      </a>
                    ) : (
                      <>
                        <span className={styles.itemTitle}>{item.title}</span>
                        <span className={styles.itemBody}>{item.body}</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {filter !== 'all' && (
          <p className={styles.filterNote}>
            Matched on the bulletin title. Cross-programme bulletins that change{' '}
            {filter === 'snap' ? 'SNAP' : filter === 'hr1' ? 'H.R. 1 rules' : 'coverage'} without
            naming it are not listed.
          </p>
        )}
      </div>
    </div>
  );
}
