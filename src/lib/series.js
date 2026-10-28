/**
 * Window arithmetic on a monthly series parallel to statewide meta.months: the
 * one definition of a window's endpoints, the share lost and the people lost,
 * for the map layers, the scatter metrics and the Insights page alike.
 *
 * No extensionless imports: scripts/build-county-data.mjs loads insights.js,
 * and through it this file, under plain Node.
 */

/** The value at month `i`, or null where the series is missing or has no number there. */
export function valueAt(series, i) {
  const v = series?.[i];
  return typeof v === 'number' ? v : null;
}

/** Index of the first month in [from, to] with a published number, or -1. */
export function firstPublished(series, from, to) {
  for (let i = from; i <= to; i++) if (typeof series?.[i] === 'number') return i;
  return -1;
}

/**
 * @typedef {Object} WindowEnds
 * @property {number} start
 * @property {number} end
 */

/**
 * The series' values at months i0 and i1, or null where either is missing.
 *
 * @param {(number | null)[] | null | undefined} series
 * @param {number} i0
 * @param {number} i1
 * @returns {WindowEnds | null}
 */
export function windowEnds(series, i0, i1) {
  const start = valueAt(series, i0);
  const end = valueAt(series, i1);
  return start == null || end == null ? null : { start, end };
}

/** Signed change as a fraction of the start: −0.2 is a 20% loss. null without a positive start. */
export const changeShare = (ends) =>
  ends && ends.start > 0 ? (ends.end - ends.start) / ends.start : null;

/**
 * Loss as a fraction of the start, floored at zero: a series that grew lost
 * none of itself. null without a positive start — no caseload to lose is not
 * the same as losing none of it.
 */
export const lossShare = (ends) =>
  ends && ends.start > 0 ? Math.max(0, ends.start - ends.end) / ends.start : null;

/** People lost over the window, floored at zero. null without both endpoints. */
export const lostCount = (ends) => (ends ? Math.max(0, ends.start - ends.end) : null);
