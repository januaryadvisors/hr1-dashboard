/**
 * <Official> — a district's elected member, under its outline in the Insights
 * report: the seat the page is about, in the chamber picked. Name and party only.
 *
 * A winner not yet sworn in reads "takes office Jan 2027"; a seat whose 2026
 * result has not been entered reads "to be confirmed" (see fetch-officials.mjs).
 */
import { cx } from '../../lib/cx';
import { fmtMonthBody } from '../../lib/format';
import styles from './Officials.module.css';

/** @param {{ official: import('../../lib/officials').Official, className?: string }} props */
export function Official({ official, className }) {
  const { role, name, party, status, takesOffice } = official;
  return (
    <dl className={cx(styles.root, className)}>
      <dt className={styles.role}>{role}</dt>
      {status === 'pending' ? (
        <dd className={styles.pending} title="Awaiting the certified results of the November 2026 election">
          To be confirmed
        </dd>
      ) : (
        <dd className={styles.name}>
          {name} ({party})
        </dd>
      )}
      {status === 'elect' && (
        <dd className={styles.elect}>takes office {fmtMonthBody(takesOffice.slice(0, 7))}</dd>
      )}
    </dl>
  );
}
