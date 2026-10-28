/**
 * <HeadlineStats> — §6.3's statement rail: three statewide narrative points
 * that "never become county metrics".
 *
 * The three figures sit in the green hero band, apart from the policy feed in
 * the sticky rail below.
 *
 * The figures are computed for the brush window (headlineStats() in
 * src/lib/insights.js), so they follow the slider. Keyed by position, not
 * value, because the values change as the window moves.
 *
 * `tone: 'negative'` renders gold on the green, which is what separates the two
 * decline figures from the participation rate. It is the only thing in the band
 * that is not cream, so it reads as "these two are the losses".
 *
 * @typedef {import('../../data/timeline').TimelineStat} TimelineStat
 */
import { cx } from '../../lib/cx';
import styles from './HeadlineStats.module.css';

export function HeadlineStats({ stats }) {
  if (!stats.length) return null;
  return (
    <dl className={styles.root}>
      {stats.map((s, i) => (
        <div key={i} className={styles.stat}>
          <dt>
            {s.label && <span className={styles.label}>{s.label}</span>}
            <span className={cx(styles.value, s.tone === 'negative' && styles.negative, 'tabular')}>
              {s.value}
            </span>
          </dt>
          <dd className={styles.body}>{s.body}</dd>
        </div>
      ))}
    </dl>
  );
}
