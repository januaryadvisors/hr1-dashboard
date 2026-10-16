/**
 * An href built from data, or undefined when it is not plain https.
 *
 * Bulletin links and source URLs come from scraped pages and JSON files, and
 * React does not block `javascript:` hrefs. Anything that is not an absolute
 * https URL renders as text instead of a link.
 *
 * @param {string | null | undefined} url
 * @returns {string | undefined}
 */
export const safeHref = (url) => (typeof url === 'string' && /^https:\/\//i.test(url) ? url : undefined);
