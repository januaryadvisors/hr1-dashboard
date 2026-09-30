/**
 * <MapOptions> — the map's secondary controls behind one button, at the top
 * right of the stage beside the map's title.
 *
 * Rate/Count, the render style, and (on views with more than one) the metric
 * used to sit as a row of segmented controls in the map header. They are the
 * controls a reader reaches for least, and in the pinned story they were also
 * what took the header's right-hand side away from the shortlist. So they
 * collapse to one plainly labelled button and open as a popover. What is set
 * is still visible without opening it: the key under the title names the
 * measure, and the map itself shows the style.
 *
 * A POPOVER, not an inline disclosure: opening it must not push the map down,
 * or the map would move every time a reader looked at the options.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import { useEffect, useId, useRef, useState } from 'react';
import styles from './MapOptions.module.css';

/**
 * @param {{ children: ReactNode }} props
 */
export function MapOptions({ children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.open : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.label}>Map options</span>
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
