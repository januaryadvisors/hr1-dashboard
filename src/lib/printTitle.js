/**
 * The one-pager's title size, by how many counties are added together.
 * More counties mean a longer name, an "Added together" line and more rows in
 * the ranking, so the title steps down to leave them room on the page.
 */

/**
 * @param {number} countyCount - Counties picked; 0 for Texas or a district.
 * @returns {'lg' | 'md' | 'sm' | 'xs'} The band ScopeBar.module.css sizes the printed title by.
 */
export function titleSize(countyCount) {
  if (countyCount >= 7) return 'xs';
  if (countyCount >= 4) return 'sm';
  if (countyCount >= 2) return 'md';
  return 'lg';
}
