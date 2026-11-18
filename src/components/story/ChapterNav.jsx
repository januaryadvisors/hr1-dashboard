/**
 * The chapter bar above the story map: every chapter as a card with a live
 * thumbnail map and a progress bar, one segment per step.
 *
 * The card jumps to the chapter's first step and each segment to its own step
 * (separate buttons beside the card, since a button cannot hold a button).
 * Every jump is a scroll, so the rail and the map stay in step.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import { cx } from '../../lib/cx';
import { stepLetter } from './StoryRail';
import styles from './ChapterNav.module.css';

/**
 * @typedef {Object} ChapterNavItem
 * @property {string} key
 * @property {string} label
 * @property {string[]} steps - Step titles, one progress segment each.
 * @property {ReactNode} thumb
 */

/**
 * @param {{
 *   items: ChapterNavItem[],
 *   activeChapter: number,
 *   activeStep: number,
 *   onSelect: (chapter: number, step: number) => void,
 * }} props
 */
export function ChapterNav({ items, activeChapter, activeStep, onSelect }) {
  return (
    <nav className={styles.root} aria-label="Story chapters">
      <ol className={styles.list} style={{ '--chapters': items.length }}>
        {items.map((item, i) => {
          const current = i === activeChapter;
          const done = i < activeChapter;
          return (
            <li key={item.key} className={cx(styles.card, current && styles.current)}>
              <button
                type="button"
                className={styles.main}
                /* The label hides on narrow cards (see .label), so the name
                   is also the button's own. */
                aria-label={item.label}
                title={item.label}
                aria-current={current ? 'step' : undefined}
                onClick={() => onSelect(i, 0)}
              >
                <span className={styles.thumb} aria-hidden="true">
                  {item.thumb}
                </span>
                <span className={styles.label}>{item.label}</span>
              </button>
              <span className={styles.progress}>
                {item.steps.map((title, s) => {
                  const on = done || (current && s <= activeStep);
                  const here = current && s === activeStep;
                  return (
                    <button
                      key={title}
                      type="button"
                      className={cx(styles.seg, on && styles.segOn, here && styles.segHere)}
                      aria-label={`${item.label}, step ${stepLetter(s)}: ${title}`}
                      aria-current={here ? 'step' : undefined}
                      title={`${stepLetter(s)}. ${title}`}
                      onClick={() => onSelect(i, s)}
                    />
                  );
                })}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
