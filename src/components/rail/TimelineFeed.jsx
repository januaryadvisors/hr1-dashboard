/**
 * The dated Texas Works policy feed, in the page's sticky rail.
 *
 * The feed is Texas HHS "Texas Works" policy bulletins and quarterly revisions,
 * refreshed on a schedule (see src/data/timeline.js). Each entry links to the
 * source PDF or page, because a policy claim on a dashboard should be one click
 * from the document it came from.
 *
 * The feed covers every Texas Works programme — CHIP, Medicaid and TANF as well
 * as SNAP — so it carries a filter, including one for the coverage side. The
 * filter is a TEXT MATCH (see classify() in src/data/timeline.js) and the
 * footnote says so: a bulletin that changes
 * SNAP without naming it will not appear under the SNAP filter, and pretending
 * otherwise would be the dishonest version of this control.
 */

import { useMemo, useState } from 'react';
import { cx } from '../../lib/cx';
import { fmtMonthFull } from '../../lib/format';
import { safeHref } from '../../lib/safeHref';
import styles from './TimelineFeed.module.css';

/**
 * @typedef {import('../../data/timeline').TimelineContent} TimelineContent
 */

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

/** "2026-08-14" → "14"; a dash when only the month is known. */
function day(item) {
  return item.date ? String(Number(item.date.split('-')[2])) : '–';
}

/** Consecutive items grouped by month. The feed is already newest first. */
function byMonth(items) {
  const groups = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last?.month === item.month) last.items.push(item);
    else groups.push({ month: item.month, items: [item] });
  }
  return groups;
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
        <h3 className={styles.feedTitle}>Policy updates</h3>
        <a
          className={styles.sourceLink}
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          HHSC source ↗
        </a>

        {content.feed.length > 0 && (
          <div className={styles.filters} role="group" aria-label="Filter policy updates">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={cx('pill pill-xs pill-faint', filter === f.key && 'pill-on')}
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
            {byMonth(shown).map((group) => (
              <li key={group.month} className={styles.group}>
                <h4 className={styles.groupHead}>{fmtMonthFull(group.month)}</h4>
                <ol className={styles.groupList}>
                  {group.items.map((item) => {
                    const inWindow = item.month >= win[0] && item.month <= win[1];
                    const isRevision = item.source?.includes('quarterly');
                    const href = safeHref(item.url);
                    return (
                      <li
                        key={`${item.number ?? item.month}-${item.url ?? item.title}`}
                        className={cx(styles.item, inWindow && styles.inWindow)}
                      >
                        <span className={cx(styles.day, 'tabular')}>{day(item)}</span>
                        <div className={styles.itemMain}>
                          {href ? (
                            <a
                              className={styles.itemLink}
                              href={href}
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
                            <div title={item.body}>
                              <span className={styles.itemTitle}>{item.title}</span>
                              <span className={styles.itemBody}>{item.body}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
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
