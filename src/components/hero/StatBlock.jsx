/**
 * <StatBlock> — §7. Statement rail (§6.3) and Insights chapter openers.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import styles from './StatBlock.module.css';

/**
 * @typedef {Object} StatBlockProps
 * @property {string} value
 * @property {ReactNode} body
 * @property {'negative' | 'neutral'} [tone]
 */

export function StatBlock({ value, body, tone = 'neutral' }) {
  return (
    <div className={styles.root}>
      <div className={`${styles.value} ${styles[tone]} tabular`}>{value}</div>
      <p className={styles.body}>{body}</p>
    </div>
  );
}
