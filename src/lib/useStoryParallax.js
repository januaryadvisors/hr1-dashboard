/**
 * The hero band scrolls away at full speed while the story under it lags
 * behind, so the band reads as lifting off the map. The story starts tucked
 * SHIFT_PX up under the band and arrives at zero as its stage pins.
 *
 * Written to CSS variables on the story element (--under-shift, --under-dim),
 * so scrolling never re-renders React. The dim runs everywhere; the shift only
 * on desktop without reduced motion.
 */
import { useEffect } from 'react';
import { DESKTOP, REDUCED_MOTION } from './breakpoints';
import { headerHeight } from './layout';

const SHIFT_PX = 100;
/** Opacity of the green over the story at the top of the page. */
const DIM_MAX = 0.75;
/** Fraction of the way to the pin at which the dim has fully lifted. */
const DIM_CLEAR = 0.6;

export function useStoryParallax(storyRef) {
  useEffect(() => {
    const story = storyRef.current;
    if (!story) return undefined;
    const wide = window.matchMedia(DESKTOP);
    const still = window.matchMedia(REDUCED_MOTION);
    let frame = 0;

    const update = () => {
      frame = 0;
      const pinAt = story.getBoundingClientRect().top + window.scrollY - headerHeight();
      const t = Math.min(1, Math.max(0, window.scrollY / Math.max(1, pinAt)));
      const dim = DIM_MAX * Math.max(0, 1 - t / DIM_CLEAR);
      const shift = wide.matches && !still.matches ? -SHIFT_PX * (1 - t) : 0;
      story.style.setProperty('--under-dim', dim.toFixed(3));
      story.style.setProperty('--under-shift', `${shift.toFixed(1)}px`);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [storyRef]);
}
