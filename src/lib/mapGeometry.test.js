import { describe, expect, it } from 'vitest';
import { ringsCentroid, ringsToPath } from './mapGeometry';

describe('ringsToPath', () => {
  it('closes each ring', () => {
    expect(ringsToPath([[[0, 0], [1, 0], [1, 1]]])).toBe('M0.00 0.00L1.00 0.00L1.00 1.00Z');
  });

  it('handles multiple rings and empty input', () => {
    expect(ringsToPath([]).length).toBe(0);
    expect(ringsToPath([[], [[0, 0], [1, 1]]])).toBe('M0.00 0.00L1.00 1.00Z');
  });
});

describe('ringsCentroid', () => {
  it('weights rings by area', () => {
    const big = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const small = [[10, 0], [11, 0], [11, 1], [10, 1]];
    const [x, y] = ringsCentroid([big, small]);
    expect(x).toBeCloseTo((2 * 16 + 10.5) / 17, 6);
    expect(y).toBeCloseTo((2 * 16 + 0.5) / 17, 6);
  });

  it('falls back to the mean vertex for a collapsed ring', () => {
    expect(ringsCentroid([[[0, 0], [2, 0], [4, 0]]])).toEqual([2, 0]);
  });
});
