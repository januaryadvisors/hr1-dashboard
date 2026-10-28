/**
 * Each county's own pre-policy linear trend, and how far enrollment has fallen
 * below it: the analysis notebook's "sharper cut" (snap-enrollment-trends.qmd).
 * build-county-data prints the figure as a check against the notebook.
 */

/**
 * @typedef {Object} CountyTrend
 * @property {number[]} enrolled - The county's monthly series.
 * @property {number} mx - Mean month index over the trend window.
 * @property {number} my - Mean enrolled over the trend window.
 * @property {number} slope - Enrolled per month, least squares over the trend window.
 */

/**
 * Fitted once; excessDecline() then projects each trend to any month without
 * refitting.
 *
 * @param {{ snap_enrolled: number[] }[]} counties
 * @param {[number, number]} trend - First and last month index of the fit.
 * @returns {CountyTrend[]}
 */
export function countyTrends(counties, [t0, t1]) {
  return counties.map((c) => {
    const n = t1 - t0 + 1;
    let mx = 0;
    let my = 0;
    for (let i = t0; i <= t1; i++) {
      mx += i;
      my += c.snap_enrolled[i];
    }
    mx /= n;
    my /= n;
    let sxy = 0;
    let sxx = 0;
    for (let i = t0; i <= t1; i++) {
      sxy += (i - mx) * (c.snap_enrolled[i] - my);
      sxx += (i - mx) ** 2;
    }
    return { enrolled: c.snap_enrolled, mx, my, slope: sxx > 0 ? sxy / sxx : 0 };
  });
}

/**
 * Statewide enrollment at month `i` against the sum of every county's own
 * trend projected to `i`: −0.284 means 28.4% below where the counties were
 * heading. Summed before dividing, so the metros weigh what they weigh.
 *
 * @param {CountyTrend[]} trends
 * @param {number} i - Month index.
 * @returns {number | null}
 */
export function excessDecline(trends, i) {
  let actual = 0;
  let projected = 0;
  for (const t of trends) {
    actual += t.enrolled[i];
    projected += t.my + t.slope * (i - t.mx);
  }
  return projected > 0 ? actual / projected - 1 : null;
}
