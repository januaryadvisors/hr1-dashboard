/**
 * An element's content-box size, kept current. For charts drawn at their
 * slot's real pixels (like the scatter) instead of a fixed, letterboxed viewBox.
 *
 * The element must get its height from elsewhere (a grid row or an explicit
 * height), or the observer and the layout chase each other.
 */
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * @returns {[import('react').MutableRefObject<HTMLElement | null>, {width: number, height: number}]}
 *   The ref to attach, and the current content-box size. Zero until first
 *   measurement, so callers need a sensible fallback for the first paint.
 */
export function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Bail on an unchanged size: ResizeObserver fires on every layout, and a
      // fresh object each time would re-render the chart on unrelated changes.
      setSize((prev) =>
        Math.round(prev.width) === Math.round(width) &&
        Math.round(prev.height) === Math.round(height)
          ? prev
          : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}
