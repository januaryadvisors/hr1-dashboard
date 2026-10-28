/** Small statistics shared by the charts, the tooltip and the derived metrics. */

/** Middle value of the finite numbers in `values`; the mean of the two middle ones when the count is even. null when there are none. */
export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return null;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

/** The value at fraction `p` (0–1) of an already ascending array, by index. undefined when empty. */
export function quantileSorted(sorted, p) {
  if (!sorted.length) return undefined;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}
