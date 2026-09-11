/**
 * <Callout> — §7. No-count state, provisional banners, method notes.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import styles from './Callout.module.css';

/**
 * @typedef {Object} CalloutProps
 * @property {'info' | 'caution' | 'blocked'} tone
 * @property {string} [title]
 * @property {ReactNode} children
 */

export function Callout({ tone, title, children }) {
  return (
    <div className={`${styles.root} ${styles[tone]}`} role="note">
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
