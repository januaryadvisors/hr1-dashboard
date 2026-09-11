/**
 * Measure an element's content box and keep it current.
 *
 * WHY A CHART WOULD WANT THIS
 * Every other chart on this page is authored at a fixed viewBox and scaled to
 * whatever width it lands in — which is right for a chart in a column, because
 * the aspect ratio is a design decision and it should survive the resize.
 *
 * The scatter in "Where need meets capacity" is the exception. It sits in a slot
 * whose height is fixed by the panel beside it and whose width is fluid, so a
 * fixed viewBox is letterboxed: the plot draws as a square with dead space above
 * and below it, and the taller the card gets the worse it looks. Measuring the
 * slot and authoring the viewBox at its real pixel size makes the SVG's
 * coordinate system 1:1 with the screen — the plot fills the slot exactly, and
 * axis type renders at the size it was written at instead of being scaled up
 * with the chart.
 *
 * The element MUST get its height from something other than this SVG (a grid row
 * or an explicit height), or the observer and the layout chase each other.
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
