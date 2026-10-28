/**
 * <MapOptions> — the map's secondary controls behind one button, at the top
 * right of the stage beside the map's title.
 *
 * Rate/Count, the render style, and (on views with more than one) the metric
 * are the controls a reader reaches for least, and as a row in the map header
 * they would crowd the shortlist out of the pinned story. So they collapse to
 * one plainly labelled button and open as a popover. What is set is still
 * visible without opening it: the key under the title names the measure, and
 * the map itself shows the style.
 *
 * A POPOVER, not an inline disclosure: opening it must not push the map down,
 * or the map would move every time a reader looked at the options.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import { useCallback, useId, useRef, useState } from 'react';
import { cx } from '../../lib/cx';
import { useDismiss } from '../../lib/useDismiss';
import styles from './MapOptions.module.css';

/**
 * @param {{ children: ReactNode }} props
 */
export function MapOptions({ children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={cx('pill pill-quiet', styles.trigger, open && styles.open)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        Map options
        <span className={styles.caret} aria-hidden="true" />
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** One labelled row inside the popover. */
export function MapOption({ label, children }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  );
}
