/**
 * <StepCaption> — the open step on a phone, as a caption under the map.
 *
 * On a phone the map is the main view and there is no rail beside it, so the
 * step that is on screen is summarised here: its letter, its title and the
 * first lines of its text. The chart and the county shortlist stay out of the
 * way until asked for — each opens in a sheet over the lower part of the stage
 * — because the page scrolls step by step and anything that expanded in place
 * would push the map around mid-scroll.
 *
 * FIXED HEIGHT, so the map above never moves between steps whatever the text.
 *
 * The parent keys this component by step, so moving to another step closes any
 * open sheet: the sheet always belongs to the step on screen.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../lib/cx';
import { StepSources, stepLetter } from './StoryRail';
import styles from './StepCaption.module.css';

/**
 * @param {{
 *   index: number,
 *   step: { title: string, body: string, subhead?: string | null, sources?: { label: string, href?: string }[], sourceNote?: string },
 *   chart: ReactNode | null,
 *   counties: ReactNode,
 *   onPrev?: (() => void) | null,
 *   onNext?: (() => void) | null,
 * }} props - onPrev / onNext step back and forward through the whole story;
 *   null at either end, which disables that arrow.
 */
export function StepCaption({ index, step, chart, counties, onPrev = null, onNext = null }) {
  const { title, body } = step;
  /** Which sheet is open, if any. */
  const [sheet, setSheet] = useState(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (e) => e.key === 'Escape' && setSheet(null);
    document.addEventListener('keydown', onKey);
    sheetRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);

  const toggle = (key) => setSheet((s) => (s === key ? null : key));

  return (
    <>
      <div className={styles.caption}>
        <div className={styles.head}>
          <span className={styles.node} aria-hidden="true">
            {stepLetter(index)}
          </span>
          <h3 className={styles.title}>{title}</h3>
        </div>
        {body && <p className={styles.body}>{body}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={cx('pill pill-navy', sheet === 'more' && 'pill-on')}
            aria-expanded={sheet === 'more'}
            onClick={() => toggle('more')}
          >
            {chart ? 'Show chart' : 'Read more'}
          </button>
          <button
            type="button"
            className={cx('pill pill-navy', sheet === 'counties' && 'pill-on')}
            aria-expanded={sheet === 'counties'}
            onClick={() => toggle('counties')}
          >
            Top 10 counties
          </button>
          {/* Previous / next step, for tapping through without scrolling. */}
          <div className={styles.arrows}>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Previous step"
              disabled={!onPrev}
              onClick={() => onPrev?.()}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Next step"
              disabled={!onNext}
              onClick={() => onNext?.()}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {sheet && (
        <div
          ref={sheetRef}
          className={styles.sheet}
          role="dialog"
          aria-label={sheet === 'more' ? title : 'Top 10 counties'}
          tabIndex={-1}
        >
          <div className={styles.sheetHead}>
            <span className={styles.sheetTitle}>
              {sheet === 'more' ? title : 'Top 10 counties'}
            </span>
            <button
              type="button"
              className={styles.close}
              aria-label="Close"
              onClick={() => setSheet(null)}
            >
              ×
            </button>
          </div>
          <div className={styles.sheetBody}>
            {sheet === 'more' ? (
              <>
                <p className={styles.sheetText}>{body}</p>
                {/* Static, as in the desktop rail: a figure to read. */}
                {chart && (
                  <>
                    {step.subhead && <p className={styles.sheetSubhead}>{step.subhead}</p>}
                    <div className={styles.sheetChart}>{chart}</div>
                  </>
                )}
                <StepSources
                  sources={step.sources}
                  note={step.sourceNote}
                  className={styles.sheetSource}
                />
              </>
            ) : (
              counties
            )}
          </div>
        </div>
      )}
    </>
  );
}
