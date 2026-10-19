/**
 * <JumpMenu> — "Jump to", floating over the story, for leaving it quickly.
 *
 * The story is a long run of scroll stops, and proximity snapping makes it slow
 * to scroll out of on purpose. This is the fast way: every place on the page,
 * one click away. The button names where the reader is, so it doubles as a
 * "you are here". It shows only while the story fills the viewport; above and
 * below it the page scrolls freely and the header's Map / Insights switch is
 * enough.
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
 * @property {JumpItem[]} items
 */

/**
 * `inline` (2026-10-16) is the phone version: it sits in the story's progress
 * bar instead of floating, always shown, as a compact "Jump to" whose list
 * drops down — the progress bar already names the chapter on screen.
 *
 * @param {{ groups: JumpGroup[], currentLabel: string, visible?: boolean, inline?: boolean }} props
 */
export function JumpMenu({ groups, currentLabel, visible = true, inline = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

  // Leaving the story hides the button; don't leave its list hanging open.
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

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
    <div
      className={`${styles.root} ${inline ? styles.inline : ''} ${visible ? styles.visible : ''}`}
      ref={rootRef}
      aria-hidden={visible ? undefined : true}
    >
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.triggerLabel}>Jump to</span>
        {!inline && <span className={styles.triggerCurrent}>{currentLabel}</span>}
        <span className={styles.caret} aria-hidden="true" />
      </button>

      <div id={listId} className={styles.panel} hidden={!open}>
        {groups.map((g, gi) => (
          <div key={g.heading ?? gi} className={styles.group}>
            {g.heading && <div className={styles.heading}>{g.heading}</div>}
            <ul className={styles.list}>
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

/**
 * <StoryExits> — the desktop's two ways out of the story (2026-10-19: they
 * replaced the floating Jump to there; phones keep the inline menu). Same pill,
 * same corner, same show-inside-the-story rule as <JumpMenu>.
 *
 * @param {{ onTop: () => void, onSkip: () => void, visible?: boolean }} props
 */
export function StoryExits({ onTop, onSkip, visible = true }) {
  return (
    <div
      className={`${styles.root} ${styles.exits} ${visible ? styles.visible : ''}`}
      aria-hidden={visible ? undefined : true}
    >
      <button type="button" className={styles.trigger} onClick={onTop}>
        <span className={styles.exitLabel}>Back to top</span>
      </button>
      <button type="button" className={styles.trigger} onClick={onSkip}>
        <span className={styles.exitLabel}>Skip the story</span>
      </button>
    </div>
  );
}
