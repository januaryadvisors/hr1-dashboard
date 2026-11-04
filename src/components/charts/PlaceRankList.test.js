import { describe, expect, it } from 'vitest';
import { rankRows, rankUnits } from './PlaceRankList';

const units = Array.from({ length: 30 }, (_, i) => ({
  key: `k${i + 1}`,
  name: `Place ${i + 1}`,
  lost: 3000 - i * 100,
  share: 0.2,
}));

describe('rankUnits', () => {
  it('ranks by people lost, unknowns last, ties by share then name', () => {
    const ranked = rankUnits([
      { key: 'a', name: 'B', lost: 5, share: 0.1 },
      { key: 'b', name: 'A', lost: null, share: 0.9 },
      { key: 'c', name: 'C', lost: 5, share: 0.3 },
      { key: 'd', name: 'D', lost: 9, share: 0.1 },
    ]);
    expect(ranked.map((u) => u.key)).toEqual(['d', 'c', 'a', 'b']);
  });
});

describe('rankRows', () => {
  const ranked = rankUnits(units);

  it('is the top ten alone with nothing picked', () => {
    const rows = rankRows(ranked, []);
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.type === 'row' && !r.on)).toBe(true);
  });

  it('marks a picked place inside the ten without a break', () => {
    const rows = rankRows(ranked, ['k4']);
    expect(rows).toHaveLength(10);
    expect(rows[3]).toMatchObject({ rank: 4, on: true });
  });

  it('shows a lower place after a break that counts what it skips', () => {
    const rows = rankRows(ranked, ['k25']);
    expect(rows.at(-2)).toEqual({ type: 'gap', skipped: 14 });
    expect(rows.at(-1)).toMatchObject({ type: 'row', rank: 25, on: true });
  });

  it('lists several picked places in rank order, a break between non-neighbours', () => {
    const rows = rankRows(ranked, ['k20', 'k12', 'k13']);
    expect(rows.slice(10).map((r) => (r.type === 'gap' ? `gap${r.skipped}` : r.rank))).toEqual([
      'gap1', 12, 13, 'gap6', 20,
    ]);
  });

  it('sums up picked places past the first five below the ten', () => {
    const rows = rankRows(ranked, ['k12', 'k14', 'k16', 'k18', 'k20', 'k22', 'k24']);
    expect(rows.at(-1)).toEqual({ type: 'more', count: 2 });
  });
});
