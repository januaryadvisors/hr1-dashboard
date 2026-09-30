/**
 * <StoryProgress> — the story's timeline on a phone, pinned at the top of the
 * stage.
 *
 * On a phone the map is the main view, so the vertical timeline the desktop
 * rail carries does not fit beside it. This is the same timeline laid flat:
 * one segment per step, grouped by chapter, filled up to the step on screen,
 * with the chapter and step named above it. Every segment is a button, so it
 * doubles as the chapter bar's jump targets.
 */
import { stepLetter } from './StoryRail';
import styles from './StoryProgress.module.css';

/**
 * @param {{
 *   chapters: { key: string, label: string, steps: string[] }[],
 *   activeChapter: number,
 *   activeStep: number,
 *   onSelect: (chapter: number, step: number) => void,
 * }} props
 */
export function StoryProgress({ chapters, activeChapter, activeStep, onSelect }) {
  const chapter = chapters[activeChapter];
  return (
    <nav className={styles.root} aria-label="Story progress">
      <div className={styles.labelRow}>
        <span className={`${styles.num} tabular`}>
          {String(activeChapter + 1).padStart(2, '0')}
        </span>
        <span className={styles.label}>{chapter.label}</span>
        <span className={styles.where}>
          Step {stepLetter(activeStep)} of {stepLetter(chapter.steps.length - 1)} ·{' '}
          <span className="tabular">
            {activeChapter + 1}/{chapters.length}
          </span>
        </span>
      </div>
      <div className={styles.bar}>
        {chapters.map((c, ci) => (
          <span
            key={c.key}
            className={`${styles.group} ${ci === activeChapter ? styles.groupCurrent : ''}`}
            style={{ flexGrow: c.steps.length }}
          >
            {c.steps.map((title, si) => {
              const on = ci < activeChapter || (ci === activeChapter && si <= activeStep);
              return (
                <button
                  key={title}
                  type="button"
                  className={`${styles.seg} ${on ? styles.segOn : ''}`}
                  aria-label={`${c.label}, step ${stepLetter(si)}: ${title}`}
                  aria-current={ci === activeChapter && si === activeStep ? 'step' : undefined}
                  onClick={() => onSelect(ci, si)}
                />
              );
            })}
          </span>
        ))}
      </div>
    </nav>
  );
}
