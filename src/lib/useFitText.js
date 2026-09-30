/**
 * useFitText — shrink a one-line heading until it fits its box.
 *
 * For the pinned story's map title: it sits in a slot of fixed height beside
 * the Map options button — one line on desktop, two on a portrait tablet — so
 * it cannot grow (that would push the map down), and an ellipsis would cut the
 * longest titles in half. Instead the text starts at its stylesheet size and
 * steps down a pixel at a time until it fits the slot's width and height, never
 * below `minRatio` of where it started. Short titles are untouched.
 *
 * The box's size never depends on the font size (its height is fixed and its
 * width comes from the layout), so observing it cannot loop.
 */
import { useLayoutEffect } from 'react';

export function useFitText(ref, enabled, deps, { minRatio = 0.6 } = {}) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.style.fontSize = '';
    if (!enabled) return undefined;

    const fit = () => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      const min = size * minRatio;
      // Width for a one-line slot; height for a slot of fixed lines.
      const overflows = () =>
        el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      while (overflows() && size > min) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };

    fit();
    // Web fonts can land after first paint and change the measure.
    document.fonts?.ready.then(fit);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      el.style.fontSize = '';
    };
  }, [enabled, ...deps]);
}
