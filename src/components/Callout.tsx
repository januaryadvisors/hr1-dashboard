/** <Callout> — §7. No-count state, provisional banners, method notes. */
import type { ReactNode } from 'react';
import styles from './Callout.module.css';

export interface CalloutProps {
  tone: 'info' | 'caution' | 'blocked';
  title?: string;
  children: ReactNode;
}

export function Callout({ tone, title, children }: CalloutProps) {
  return (
    <div className={`${styles.root} ${styles[tone]}`} role="note">
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
