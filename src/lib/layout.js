/** Page-level measurements and preferences read from the DOM. */

/** The sticky header's current height in px, from --header-height (set by AppHeader). */
export const headerHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;

/** Smooth-scrolls so `el` sits `gap` px below the sticky header. */
export function scrollBelowHeader(el, gap = 16) {
  window.scrollTo({
    top: el.getBoundingClientRect().top + window.scrollY - headerHeight() - gap,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

export const prefersReducedMotion = () =>
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
