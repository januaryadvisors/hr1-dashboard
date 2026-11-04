/**
 * <PeriodControl> — the map period, kept in the header once the hero's brush
 * has scrolled away. Every figure on the Map page follows the period, so a
 * reader deep in the story should always see which one is on and be able to
 * change it without scrolling back up.
 *
 * A pill naming the period; pressed, it opens the same brush (presets and
 * handles) in a panel under the header. MapPage portals it into the header's
 * slot (AppHeader, #header-period) only while the hero's brush is out of view.
 */
import { useCallback, useRef, useState } from 'react';
import { cx } from '../../lib/cx';
import { useDismiss } from '../../lib/useDismiss';
import styles from './PeriodControl.module.css';

/**
 * @param {{ label: string, shortLabel: string, children: import('react').ReactNode }} props
 *   `label` is "Jul 2025 – Sep 2026"; `shortLabel` ("Jul '25 – Sep '26") is shown on a phone.
 *   `children` is the brush to open.
 */
export function PeriodControl({ label, shortLabel, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div className={styles.root} ref={ref}>
      <button
        type="button"
        className={cx(styles.pill, open && styles.pillOpen)}
        aria-expanded={open}
        aria-controls="header-period-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.kicker}>Map period</span>
        <span className={cx(styles.value, styles.long, 'tabular')}>{label}</span>
        <span className={cx(styles.value, styles.short, 'tabular')}>{shortLabel}</span>
        <svg className={styles.caret} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div className={styles.panel} id="header-period-panel">
          {children}
        </div>
      )}
    </div>
  );
}
