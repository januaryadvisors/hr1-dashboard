/** <StatBlock> — §7. Statement rail (§6.3) and Insights chapter openers. */
import type { ReactNode } from 'react';
import styles from './StatBlock.module.css';

export interface StatBlockProps {
  value: string;
  body: ReactNode;
  tone?: 'negative' | 'neutral';
}

export function StatBlock({ value, body, tone = 'neutral' }: StatBlockProps) {
  return (
    <div className={styles.root}>
      <div className={`${styles.value} ${styles[tone]} tabular`}>{value}</div>
      <p className={styles.body}>{body}</p>
    </div>
  );
}
