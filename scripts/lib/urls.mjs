/**
 * Link hygiene for the scrapers.
 *
 * Every link these scripts follow or publish comes from an HTML page they do
 * not control. A link is kept only if it resolves to https on the one host the
 * script expects, so a changed or compromised page cannot point the dashboard
 * (or the workbook downloads) somewhere else. Resolution uses the URL parser,
 * not string concatenation: `ORIGIN + "evil.example/x"` names a different host.
 */

/**
 * @param {string} href - As found in the page; relative or absolute.
 * @param {string} base - The page it was found on.
 * @param {string} host - The only hostname accepted.
 * @returns {string | null} The absolute URL, or null when it is not https on `host`.
 */
export function onHost(href, base, host) {
  let u;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  return u.protocol === 'https:' && u.hostname === host ? u.href : null;
}

/** Abort a request that has not finished in this long. */
export const FETCH_TIMEOUT_MS = 30_000;
