import { describe, expect, it } from 'vitest';
import { monthlyRows, toCsv } from './download';

describe('toCsv', () => {
  it('writes a header row and one row per record', () => {
    expect(toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])).toBe('a,b\n1,x\n2,y');
  });

  it('quotes values containing commas, quotes or newlines', () => {
    expect(toCsv([{ name: 'De Witt, TX' }])).toBe('name\n"De Witt, TX"');
    expect(toCsv([{ name: 'say "hi"' }])).toBe('name\n"say ""hi"""');
    expect(toCsv([{ name: 'a\nb' }])).toBe('name\n"a\nb"');
  });

  it('renders null as empty rather than the string "null"', () => {
    expect(toCsv([{ moe: null }])).toBe('moe\n');
  });

  it('keeps false distinguishable from empty', () => {
    expect(toCsv([{ is_gap: false }])).toBe('is_gap\nfalse');
  });

  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('monthlyRows', () => {
  const months = ['2025-06', '2025-07', '2025-08'];
  const county = {
    geoid: '48001',
    name: 'Anderson',
    snap_enrolled: [100, 90, 80],
    snap_children: [40, 36, 30],
    snap_age: {
      'Under 5': [10, 9, 8],
      '5–17': [30, 27, 22],
      '18–59': [45, 40, 38],
      '60–64': [5, 5, 4],
      '65+': [10, 9, 8],
    },
    snap_payments: [1000, 900, 800],
  };

  it('writes one row per county per month, in month order', () => {
    const rows = monthlyRows([county, { ...county, geoid: '48003', name: 'Andrews' }], months, ['2025-07', '2025-08']);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => `${r.geoid} ${r.month}`)).toEqual([
      '48001 2025-06',
      '48001 2025-07',
      '48001 2025-08',
      '48003 2025-06',
      '48003 2025-07',
      '48003 2025-08',
    ]);
  });

  it('carries each month\'s figures from the parallel series', () => {
    const [, jul] = monthlyRows([county], months, ['2025-07', '2025-08']);
    expect(jul).toEqual({
      geoid: '48001',
      name: 'Anderson',
      month: '2025-07',
      in_selected_period: true,
      snap_enrolled: 90,
      snap_children: 36,
      snap_age_under_5: 9,
      snap_age_5_17: 27,
      snap_age_18_59: 40,
      snap_age_60_64: 5,
      snap_age_65_plus: 9,
      snap_benefits_paid: 900,
    });
  });

  it('flags only the months inside the selected period', () => {
    const rows = monthlyRows([county], months, ['2025-07', '2025-08']);
    expect(rows.map((r) => r.in_selected_period)).toEqual([false, true, true]);
  });

  it('writes empty cells, not zeros, for a series a county lacks', () => {
    const [row] = monthlyRows([{ geoid: '48005', name: 'Angelina', snap_enrolled: [5] }], ['2025-06'], ['2025-06', '2025-06']);
    expect(row.snap_children).toBeNull();
    expect(row.snap_age_65_plus).toBeNull();
    expect(row.snap_benefits_paid).toBeNull();
  });
});
