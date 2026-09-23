/**
 * Observed SNAP enrollment, published monthly by Texas HHSC.
 *
 * Written by scripts/build-county-data.mjs from the SAME county rows as
 * counties.json and statewide.json, so the rail's line and the hero number agree
 * to the person: both are the sum of the 254 counties, with HHSC's call-center
 * and state-office rows excluded. (The older fetch-snap-stats.mjs scrape summed
 * those rows in, which put the rail ~3,300 above the hero for the same month.)
 *
 * Optional by design: a missing file renders the panel's empty state rather than
 * failing the page, exactly like the bulletins feed.
 */

/**
 * @typedef {Object} SnapSeries
 * @property {number[]} cases - Month-end SNAP cases (households).
 * @property {number[]} individuals - Month-end eligible individuals.
 * @property {number[]} children - Eligible individuals under 18.
 * @property {number[]} adults - Eligible individuals 18–59.
 * @property {number[]} seniors - Eligible individuals 65+.
 * @property {number[]} payments - Total benefit dollars issued for the month.
 * @property {(number|null)[]} change - Month-over-month change in individuals; null in the first month.
 */

/**
 * @typedef {Object} SnapObserved
 * @property {string[]} months - "YYYY-MM", ascending, parallel to every series.
 * @property {string} first
 * @property {string} latest
 * @property {string} source
 * @property {string} source_url
 * @property {string} generated
 * @property {SnapSeries} statewide
 * @property {{month: string, published_total: number, sum_of_rows: number, difference: number}[]} reconciliation
 *   Months where HHSC's own total row disagrees with the county rows above it.
 */

export async function loadSnapObserved() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/snap-observed.json`);
    if (!res.ok) return null;
    const data = await res.json();
    // A file that parsed but carries no months would draw an empty axis and
    // read as "enrollment is zero" rather than as "no data".
    if (!Array.isArray(data?.months) || data.months.length < 2) return null;
    return data;
  } catch {
    return null;
  }
}
