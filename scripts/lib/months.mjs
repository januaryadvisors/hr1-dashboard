const MONTH_NUMBERS = new Map(
  [
    ['jan', 'january'],
    ['feb', 'february'],
    ['mar', 'march'],
    ['apr', 'april'],
    ['may'],
    ['jun', 'june'],
    ['jul', 'july'],
    ['aug', 'august'],
    ['sep', 'sept', 'september'],
    ['oct', 'october'],
    ['nov', 'november'],
    ['dec', 'december'],
  ].flatMap((names, i) => names.map((n) => [n, i + 1])),
);

/** 1–12 for a month name or abbreviation ("Jan", "sept", "October"); undefined otherwise. */
export const monthNumber = (name) => MONTH_NUMBERS.get(String(name).toLowerCase());

/** "YYYY-MM" from a year and a 1-based month. */
export const yearMonth = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

/** Every month between two "YYYY-MM", inclusive. */
export function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ey, em] = last.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(yearMonth(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
