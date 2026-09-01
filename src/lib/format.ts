/** Formatters. Tabular figures everywhere a number sits in a column (§6.1). */

const int = new Intl.NumberFormat('en-US');
const signed = new Intl.NumberFormat('en-US', { signDisplay: 'always' });

export const fmtInt = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : int.format(Math.round(v));

/** Signed count, e.g. −547,051. Uses a true minus sign, not a hyphen. */
export const fmtDelta = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : signed.format(Math.round(v)).replace('-', '−');

/** Percent from a fraction: 0.093 → "9.3%". */
export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`;

/** Signed percent from a fraction: −0.191 → "−19.1%". */
export const fmtPctDelta = (v: number | null | undefined, digits = 1): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = `${(Math.abs(v) * 100).toFixed(digits)}%`;
  return v < 0 ? `−${s}` : `+${s}`;
};

/** A 0–1 percentile as a p-label: 0.98 → "p98". */
export const fmtPercentile = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : `p${Math.round(v * 100)}`;

/** Millions, for axis labels: 3518649 → "3.5M". */
export const fmtMillions = (v: number): string => `${(v / 1e6).toFixed(1)}M`;

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "2025-07" → "JUL 2025", for the eyebrow and brush handles (§6.1, §6.2). */
export function fmtMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "2025-07" → "Jul 2025", sentence case for body copy. */
export function fmtMonthBody(month: string): string {
  const label = fmtMonth(month);
  return label.charAt(0) + label.slice(1, 3).toLowerCase() + label.slice(3);
}
