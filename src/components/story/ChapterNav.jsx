/**
 * <ChapterNav> — the chapter bar above the story map.
 *
 * Replaces the scrolling strip of view cards. The strip was a layer picker that
 * happened to sit above the map; this is the story's table of contents, so every
 * chapter is visible at once (no carousel), the one the reader is in is
 * unmistakable, and each card carries a progress bar with one segment per step.
 *
 * TWO TARGETS PER CARD. The card itself jumps to the chapter's first step; each
 * progress segment is its own button and jumps to that step, so the second step
 * of the third chapter is one click away. The segments are separate buttons
 * beside the card button rather than inside it — a button cannot contain a
 * button. Either way the jump is a scroll, so the rail and the map stay in step
 * with the scroll position.
 *
 * The thumbnails are live maps of each chapter's first layer, so the bar doubles
 * as a preview of every map in the story. MapPage draws them as choropleths
 * whatever the measure: proportional symbols are unreadable at thumbnail size.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
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
          const num = String(i + 1).padStart(2, '0');
          return (
            <li key={item.key} className={`${styles.card} ${current ? styles.current : ''}`}>
              <button
                type="button"
                className={styles.main}
                /* The label hides on narrow cards (see .label), so the name
                   is also the button's own. */
                aria-label={`${num} ${item.label}`}
                title={item.label}
                aria-current={current ? 'step' : undefined}
                onClick={() => onSelect(i, 0)}
              >
                <span className={styles.thumb} aria-hidden="true">
                  {item.thumb}
                </span>
                <span className={`${styles.num} tabular`}>{num}</span>
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
                      className={`${styles.seg} ${on ? styles.segOn : ''} ${here ? styles.segHere : ''}`}
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
