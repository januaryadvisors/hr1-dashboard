/**
 * <JumpMenu> — "Jump to" in the sticky header, for leaving the story quickly.
 *
 * The story is a long run of scroll stops, and proximity snapping makes it slow
 * to scroll out of on purpose. This is the fast way: every place on the page,
 * one click away, from anywhere on it. The button names where the reader is, so
 * it doubles as a "you are here". On the Map page it also holds the Map /
 * Insights switch, so the header carries one navigation control, not two.
 *
 * A plain disclosure (button + list), not an ARIA menu: the items are
 * navigation, and a disclosure keeps normal Tab order without roving focus.
 * Escape and a click outside both close it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import styles from './JumpMenu.module.css';

/**
 * @typedef {Object} JumpItem
 * @property {string} key
 * @property {string} label
 * @property {string} [prefix] - Small leading marker, e.g. a chapter number.
 * @property {boolean} [current]
 * @property {boolean} [indent] - Set under a group heading.
 * @property {() => void} onSelect
 */

/**
 * @typedef {Object} JumpGroup
 * @property {string} [heading]
 * @property {'list' | 'row'} [layout] - 'row' sets the items side by side as pills, for a switch.
 * @property {JumpItem[]} items
 */

/**
 * @param {{ groups: JumpGroup[], currentLabel: string }} props
 */
export function JumpMenu({ groups, currentLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

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
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.triggerLabel}>Jump to</span>
        <span className={styles.triggerCurrent}>{currentLabel}</span>
        <span className={styles.caret} aria-hidden="true" />
      </button>

      <div id={listId} className={styles.panel} hidden={!open}>
        {groups.map((g, gi) => (
          <div key={g.heading ?? gi} className={styles.group}>
            {g.heading && <div className={styles.heading}>{g.heading}</div>}
            <ul className={`${styles.list} ${g.layout === 'row' ? styles.row : ''}`}>
              {g.items.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`${styles.item} ${item.current ? styles.itemCurrent : ''} ${
                      item.indent ? styles.indent : ''
                    }`}
                    aria-current={item.current ? 'location' : undefined}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                  >
                    {item.prefix && (
                      <span className={`${styles.prefix} tabular`}>{item.prefix}</span>
                    )}
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
