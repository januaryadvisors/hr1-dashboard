/**
 * useScrollSteps — which scroll stop the page is on.
 *
 * The container holds one absolutely positioned marker per step
 * (`[data-step-marker]`), spaced a fixed distance apart, behind a sticky stage.
 * The active step is the marker nearest the top of the viewport (under the
 * sticky header), so it changes at the halfway point between two stops.
 *
 * The markers are also the page's scroll-snap points. Snapping is PROXIMITY, not
 * mandatory: a small scroll settles back to the step the reader is on, a firmer
 * one carries on to the next, and the page outside the story scrolls freely.
 * `html.story-snap` switches it on only while the story is enabled (global.css).
 *
 * While disabled (narrow screens) nothing listens to scroll: `goTo` just sets
 * the step, so the same rail works as a plain accordion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const headerHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;

const prefersReducedMotion = () =>
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Keys that step instead of scrolling by a line, while the stage is pinned. */
const NEXT_KEYS = new Set(['ArrowDown', 'PageDown']);
const PREV_KEYS = new Set(['ArrowUp', 'PageUp']);

const isTypingTarget = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * @param {import('react').RefObject<HTMLElement>} containerRef
 * @param {number} count
 * @param {{ enabled: boolean, initial?: number }} options
 */
export function useScrollSteps(containerRef, count, { enabled, initial = 0 }) {
  const [active, setActive] = useState(initial);
  /**
   * Where the viewport is relative to the story: 'before' while any of the page
   * above it is showing, 'in' while the stage fills the viewport, 'after' once
   * it has scrolled off the top. Tracked in both modes, for the page's jump menu.
   */
  const [region, setRegion] = useState('before');

  /*
     Set while a programmatic scroll is travelling to a step. A jump from the
     first chapter to the last passes every marker in between, and without the
     lock each one would briefly become active and redraw the map on the way.
  */
  const lockRef = useRef(null);
  const arrivedRef = useRef(false);

  const markers = () =>
    containerRef.current ? [...containerRef.current.querySelectorAll('[data-step-marker]')] : [];

  /** Page scroll offset that puts marker `i` at the top of the viewport. */
  const targetFor = useCallback(
    (i) => {
      const el = containerRef.current;
      const m = markers()[i];
      if (!el || !m) return null;
      return window.scrollY + el.getBoundingClientRect().top + m.offsetTop - headerHeight();
    },
    [containerRef],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    document.documentElement.classList.add('story-snap');

    let frame = 0;
    const read = () => {
      frame = 0;
      const el = containerRef.current;
      const ms = markers();
      if (!el || !ms.length) return;

      const lock = lockRef.current;
      if (lock) {
        const reached = Math.abs(window.scrollY - lock.top) < 2;
        if (!reached && performance.now() < lock.until) return;
        lockRef.current = null;
      }

      const offset = headerHeight() - el.getBoundingClientRect().top;
      let best = 0;
      for (let i = 1; i < ms.length; i++) {
        if (Math.abs(ms[i].offsetTop - offset) < Math.abs(ms[best].offsetTop - offset)) best = i;
      }
      setActive((prev) => (prev === best ? prev : best));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    // Any input from the reader cancels a programmatic jump in flight.
    const release = () => {
      lockRef.current = null;
    };

    /*
       Arriving on a later step (a shared link) jumps straight to it, before the
       first read — otherwise the first read would see the top of the page,
       report step 0, and the page would briefly apply it over the link's state.
       Only from the very top, so a restored scroll position is left alone.
    */
    if (!arrivedRef.current) {
      arrivedRef.current = true;
      const top = initial > 0 && window.scrollY < 1 ? targetFor(initial) : null;
      if (top != null) window.scrollTo({ top, behavior: 'instant' });
    }

    read();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchstart', release, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove('story-snap');
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchstart', release);
    };
  }, [enabled, count, containerRef]);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next =
        r.top > headerHeight() + 1 ? 'before' : r.bottom < window.innerHeight - 1 ? 'after' : 'in';
      setRegion((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [containerRef]);

  const goTo = useCallback(
    (i, { instant = false } = {}) => {
      const next = Math.max(0, Math.min(count - 1, i));
      if (!enabled) {
        setActive(next);
        return;
      }
      const top = targetFor(next);
      if (top == null) return;
      const smooth = !instant && !prefersReducedMotion();
      lockRef.current = smooth ? { top, until: performance.now() + 1500 } : null;
      setActive(next);
      window.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
    },
    [count, enabled, targetFor],
  );

  /**
   * Scroll the page to `top` — somewhere outside the story, usually — without
   * walking the map through every step on the way.
   *
   * The step is settled up front to whichever end of the story the page will be
   * nearest on arrival, and held there for the trip: leaving from chapter four to
   * the top of the page should not redraw chapters three, two and one en route.
   */
  const scrollToY = useCallback(
    (top) => {
      const smooth = !prefersReducedMotion();
      if (enabled) {
        const first = targetFor(0);
        const last = targetFor(count - 1);
        if (first != null && last != null) {
          const step = top <= first ? 0 : top >= last ? count - 1 : null;
          if (step != null) {
            setActive(step);
            if (smooth) lockRef.current = { top, until: performance.now() + 1500 };
          }
        }
      }
      window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'instant' });
    },
    [count, enabled, targetFor],
  );

  /*
     Arrow and page keys move one step while the stage is pinned.

     Under proximity snapping a 40px arrow-key scroll snaps straight back to the
     step it left, so without this the keyboard could not move through the story
     at all. At either end the key falls through to the browser, so the reader
     can still arrow out of the story into the page around it.
  */
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      const dir = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0;
      if (!dir) return;
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pinned = r.top <= headerHeight() + 1 && r.bottom >= window.innerHeight - 1;
      if (!pinned) return;
      const next = active + dir;
      if (next < 0 || next >= count) return;
      e.preventDefault();
      goTo(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, active, count, goTo, containerRef]);

  return { active, goTo, region, scrollToY };
}
