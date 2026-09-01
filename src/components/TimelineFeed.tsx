/**
 * Right column of the hero band: topline stats over a dated policy feed.
 *
 * The three stats are §6.3's statement rail — statewide narrative points that
 * "never become county metrics".
 *
 * The feed is Texas HHS "Texas Works" policy bulletins and quarterly revisions,
 * refreshed on a schedule (see src/data/timeline.ts). Each entry links to the
 * source PDF or page, because a policy claim on a dashboard should be one click
 * from the document it came from.
 */
import type { TimelineContent } from '../data/timeline';
import { fmtMonth } from '../lib/format';
import styles from './TimelineFeed.module.css';

export interface TimelineFeedProps {
  content: TimelineContent;
  /** Entries inside the active brush window are marked. */
  window: [string, string];
}

const SOURCE_URL = 'https://fhb.hhs.texas.gov/handbooks/texas-works-handbook/twh-policy-bulletins';

/** "2026-08-14" → "14 AUG 2026"; falls back to the month when no day is known. */
function stamp(item: { date?: string; month: string }): string {
  if (!item.date) return fmtMonth(item.month);
  const [, , day] = item.date.split('-');
  return `${Number(day)} ${fmtMonth(item.month)}`;
}

export function TimelineFeed({ content, window: win }: TimelineFeedProps) {
  return (
    <div className={styles.root}>
      <div className={styles.stats}>
        {content.stats.map((s) => (
          <div key={s.value} className={styles.stat}>
            <span
              className={`${styles.statValue} ${s.tone === 'negative' ? styles.negative : ''} tabular`}
            >
              {s.value}
            </span>
            <span className={styles.statBody}>{s.body}</span>
          </div>
        ))}
      </div>

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

        {content.feed.length === 0 ? (
          <p className={styles.empty}>
            No bulletins loaded. Run <code>npm run fetch:bulletins</code>.
          </p>
        ) : (
          <ol className={styles.feed}>
            {content.feed.map((item) => {
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
      </div>
    </div>
  );
}
