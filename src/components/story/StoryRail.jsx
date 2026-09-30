/**
 * <StoryRail> — the right-hand column of the story, as ONE TIMELINE.
 *
 * Every chapter is always on it, so the reader can see the whole story and
 * where they are in it. Only the chapter they are in opens: its name becomes
 * the section title, over its steps as smaller nodes on the same rule, with
 * the active step's collapsible open. The other chapters stay one line each —
 * a list of five questions is easy to take in; five chapters of expanded steps
 * is not.
 *
 * The open step is ALWAYS the active scroll step. Clicking anything does not
 * toggle it locally, it scrolls there (via `onSelect`), and the scroll position
 * opens it — so the rail, the map and the scrollbar can never describe three
 * different states. On narrow screens the parent's `onSelect` sets the step
 * directly and the same markup reads as an accordion.
 *
 * THE RULE. Each block on the timeline — a chapter's head, each step — draws its own stretch of the vertical rule, coloured by
 * whether the reader has passed it: navy up to the active step's node, hairline
 * after. Drawn per block because CSS cannot know where the active node is, but
 * each block knows which side of it it is on.
 *
 * @typedef {import('react').ReactNode} ReactNode
 * @typedef {import('../../config/story').StoryStep} StoryStep
 */
import { useEffect, useRef } from 'react';
import styles from './StoryRail.module.css';

/**
 * @typedef {Object} RailChapter
 * @property {string} key
 * @property {string} label - Short chapter name, the one-line row.
 * @property {StoryStep[]} steps
 */

/**
 * "Source: A ↗ · B ↗ · note". Outside the chart's box, so the links stay
 * clickable while the chart itself takes no pointer at all.
 */
export function StepSources({ sources = [], note, className = '' }) {
  if (!sources.length && !note) return null;
  return (
    <p className={`${styles.stepSource} ${className}`}>
      Source:{' '}
      {sources.map((src, i) => (
        <span key={src.label}>
          {i > 0 && ' · '}
          {src.href ? (
            <a href={src.href} target="_blank" rel="noreferrer">
              {src.label} <span aria-hidden="true">↗</span>
            </a>
          ) : (
            src.label
          )}
        </span>
      ))}
      {note && ` ${note}`}
    </p>
  );
}

/** Steps are lettered (a, b, c) so they never read as chapter numbers. */
export const stepLetter = (i) => String.fromCharCode(97 + i);

/** Rule state for one block: passed, reached at its node, or not yet. */
const rule = (state) =>
  state === 'done' ? styles.ruleDone : state === 'here' ? styles.ruleHere : styles.ruleTodo;

/**
 * @param {{
 *   chapters: RailChapter[],
 *   activeChapter: number,
 *   activeStep: number,
 *   renderChart: (step: StoryStep) => ReactNode,
 *   onSelect: (chapter: number, step: number) => void,
 * }} props
 */
export function StoryRail({ chapters, activeChapter, activeStep, renderChart, onSelect }) {
  const last = chapters.length - 1;
  const rootRef = useRef(null);

  /*
     On a short screen the open chapter can run past the bottom of the rail,
     which then scrolls. Each time the step changes, the rail brings the open
     chapter into view — after the open/close animation, so it measures the
     settled layout. Where everything fits there is nothing to scroll and this
     does nothing. The rail's own scrollTop only: scrollIntoView would also move
     the page, and the page's scroll position is the story's state.
  */
  useEffect(() => {
    const t = setTimeout(() => {
      const rail = rootRef.current?.parentElement;
      const open = rootRef.current?.querySelector(`.${styles.current}`);
      if (!rail || !open) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const behavior = reduce ? 'auto' : 'smooth';
      if (rail.scrollHeight <= rail.clientHeight + 1) {
        if (rail.scrollTop) rail.scrollTo({ top: 0, behavior });
        return;
      }
      const top = open.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop;
      rail.scrollTo({ top: Math.max(0, top - 8), behavior });
    }, 420);
    return () => clearTimeout(t);
  }, [activeChapter, activeStep]);

  return (
    <ol className={styles.root} aria-label="Story timeline" ref={rootRef}>
      {chapters.map((chapter, ci) => {
        const current = ci === activeChapter;
        const done = ci < activeChapter;
        return (
          <li
            key={chapter.key}
            className={`${styles.chapter} ${current ? styles.current : ''} ${done ? styles.done : ''}`}
          >
            {/* One line per chapter; the open chapter's is its section title. */}
            <button
              type="button"
              className={`${styles.chapterHead} ${rule(ci <= activeChapter ? 'done' : 'todo')} ${
                ci === 0 ? styles.ruleStart : ''
              } ${ci === last && !current ? styles.ruleEnd : ''}`}
              aria-current={current ? 'step' : undefined}
              onClick={() => onSelect(ci, 0)}
            >
              <span className={`${styles.chapterNode} tabular`} aria-hidden="true">
                {ci + 1}
              </span>
              <span className={styles.chapterLabel}>{chapter.label}</span>
              {!current && (
                <span className={styles.chapterMeta}>
                  {chapter.steps.length} {chapter.steps.length === 1 ? 'step' : 'steps'}
                </span>
              )}
            </button>

            {/* Always rendered so it can animate open and shut; inert while
                shut so its controls leave the tab order. Charts render in the
                open chapter only. */}
            <div
              className={styles.chapterBody}
              {...(current ? {} : { inert: '', 'aria-hidden': true })}
            >
              <div className={styles.chapterBodyInner}>
                <ol className={styles.steps}>
                  {chapter.steps.map((step, si) => {
                    const open = current && si === activeStep;
                    const state = !current
                      ? 'todo'
                      : si < activeStep
                        ? 'done'
                        : si === activeStep
                          ? 'here'
                          : 'todo';
                    const isEnd = ci === last && si === chapter.steps.length - 1;
                    const bodyId = `story-step-${step.id}`;
                    const chart = current ? renderChart(step) : null;
                    return (
                      <li
                        key={step.id}
                        className={`${styles.step} ${open ? styles.open : ''} ${
                          state === 'done' ? styles.stepDone : ''
                        } ${rule(state)} ${isEnd ? styles.ruleEnd : ''}`}
                      >
                        <button
                          type="button"
                          className={styles.stepHead}
                          aria-expanded={open}
                          aria-controls={bodyId}
                          onClick={() => onSelect(ci, si)}
                        >
                          <span className={styles.stepNodeCol} aria-hidden="true">
                            <span className={styles.stepNode}>{stepLetter(si)}</span>
                          </span>
                          <span className={styles.stepTitle}>{step.title}</span>
                          <span className={styles.stepIcon} aria-hidden="true" />
                        </button>
                        <div
                          id={bodyId}
                          className={styles.stepBody}
                          {...(open ? {} : { inert: '', 'aria-hidden': true })}
                        >
                          <div className={styles.stepBodyInner}>
                            <p className={styles.stepText}>{step.body}</p>
                            {chart && (
                              <>
                                {step.subhead && <p className={styles.stepSubhead}>{step.subhead}</p>}
                                <div className={styles.stepChart}>{chart}</div>
                              </>
                            )}
                            <StepSources sources={step.sources} note={step.sourceNote} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
