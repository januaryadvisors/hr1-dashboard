/**
 * Media queries used from JavaScript. CSS cannot read these (custom properties
 * do not work in @media), so the CSS breakpoints in tokens.css must match.
 */

/** Desktop layout. Narrow CSS rules use max-width: 899px, so no width is both. */
export const DESKTOP = '(min-width: 900px)';

/** Phone layout. Pairs with min-width: 700px. */
export const PHONE = '(max-width: 699px)';

/** Tall enough to pin the Map page's story: map, key and story chrome in one viewport. */
export const STORY_PINNED =
  '(min-width: 700px) and (min-height: 640px), (max-width: 699px) and (min-height: 560px)';

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
