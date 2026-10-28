import { describe, expect, it } from 'vitest';
import { monthNumber, monthRange, yearMonth } from './months.mjs';

describe('months', () => {
  it('reads names and abbreviations in any case', () => {
    expect(monthNumber('Jan')).toBe(1);
    expect(monthNumber('sept')).toBe(9);
    expect(monthNumber('October')).toBe(10);
    expect(monthNumber('constructor')).toBeUndefined();
  });

  it('runs every month inclusive across a year end', () => {
    expect(monthRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
    expect(yearMonth(2025, 7)).toBe('2025-07');
  });
});
