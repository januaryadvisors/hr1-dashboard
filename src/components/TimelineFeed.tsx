/**
 * Right column of the hero band: topline stats over a dated timeline feed.
 *
 * The three stats are §6.3's statement rail — statewide narrative points that
 * "never become county metrics". The feed below them is editorial context.
 *
 * Content comes from public/data/timeline.json rather than from JSX, so it can be
 * edited without a deploy-time code change. See src/data/timeline.ts for the
 * (single) place to swap in a published Google Sheet.
 */
import type { TimelineContent } from '../data/timeline';
import { fmtMonth } from '../lib/format';
import styles from './TimelineFeed.module.css';

export interface TimelineFeedProps {
  content: TimelineContent;
  /** Entries inside the active brush window are marked. */
  window: [string, string];
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

      <div>
        <div className={styles.feedHead}>
          <span className="eyebrow">What happened</span>
          <span style={{ fontSize: '0.625rem', color: 'var(--text-faint)' }}>
            {fmtMonth(win[0])} → {fmtMonth(win[1])} highlighted
          </span>
        </div>

        <div className={styles.feed}>
          {content.feed.map((item) => {
            const inWindow = item.month >= win[0] && item.month <= win[1];
            return (
              <div
                key={`${item.month}-${item.title}`}
                className={`${styles.item} ${inWindow ? styles.inWindow : ''}`}
              >
                <span className={styles.stamp}>{fmtMonth(item.month)}</span>
                <div className={styles.marker}>
                  <div className={styles.itemTitle}>{item.title}</div>
                  <div className={styles.itemBody}>{item.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
