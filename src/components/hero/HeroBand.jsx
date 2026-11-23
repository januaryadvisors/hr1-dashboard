/**
 * The green band at the top of the Map page: the headline change in SNAP
 * enrollment, the download button, the period brush, three statewide facts
 * and, under them, the partner logo.
 *
 * While the brush is scrolled out of view, a copy of it sits in the header
 * (#header-period), so the period every figure follows can always be changed.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx';
import { fmtDelta, fmtMonthBody, fmtMonthFull, fmtMonthTick } from '../../lib/format';
import { headerHeight } from '../../lib/layout';
import { FunderLogo } from '../shell/FunderLogo';
import { BrushChart } from './BrushChart';
import { HeadlineStats } from './HeadlineStats';
import { PeriodControl } from './PeriodControl';
import styles from './HeroBand.module.css';

/** Whether the element is below the sticky header, and the header's period slot. */
function useHeaderPeriodSlot(ref) {
  const [inView, setInView] = useState(true);
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    setSlot(document.getElementById('header-period'));
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: `-${headerHeight()}px 0px 0px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView ? null : slot;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M3 13.5h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * @param {{
 *   change: number,
 *   window: [string, string],
 *   policyStart: string,
 *   brushProps: object,
 *   stats: object[],
 *   onDownload: () => void,
 * }} props
 *   `change`: statewide enrollment change over `window`, the window on screen (live while dragging).
 */
export function HeroBand({ change, window: [from, to], policyStart, brushProps, stats, onDownload }) {
  const brushRef = useRef(null);
  const headerSlot = useHeaderPeriodSlot(brushRef);

  return (
    <section className={styles.band}>
      <div className={styles.inner}>
        <div className={styles.main}>
          <div className={styles.numberRow}>
            <span className={cx(styles.number, 'tabular')}>{fmtDelta(change)}</span>
            <span className={styles.phrase}>
              fewer Texans on SNAP than in {fmtMonthFull(from)}
              {from === policyStart && ', when H.R. 1 was signed'}
            </span>
          </div>

          <p className={styles.body}>
            Losses began three months after signing and broke sharply in November 2025.
          </p>
          <div className={styles.bodyRow}>
            <button
              type="button"
              className={cx(styles.download, 'pill pill-lg pill-on-green')}
              onClick={onDownload}
            >
              <DownloadIcon />
              Download data
            </button>
          </div>

          <div ref={brushRef}>
            <BrushChart {...brushProps} height={150} />
          </div>
          {headerSlot &&
            createPortal(
              <PeriodControl
                label={`${fmtMonthBody(from)} – ${fmtMonthBody(to)}`}
                shortLabel={`${fmtMonthTick(from)} – ${fmtMonthTick(to)}`}
              >
                <BrushChart {...brushProps} height={120} />
              </PeriodControl>,
              headerSlot,
            )}
        </div>

        <div className={styles.stats}>
          <HeadlineStats stats={stats} />
          <FunderLogo onGreen className={styles.partner} />
        </div>
      </div>
    </section>
  );
}
