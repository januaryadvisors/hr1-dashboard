import { describe, expect, it } from 'vitest';
import { radiusScale, relax, type Bubble } from './density';

const overlapping = (): Bubble[] => [
  { geoid: 'a', x: 100, y: 100, r: 30 },
  { geoid: 'b', x: 110, y: 100, r: 20 },
];

describe('relax', () => {
  it('separates overlapping circles', () => {
    const [a, b] = relax(overlapping());
    const gap = Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r;
    expect(gap).toBeGreaterThanOrEqual(-1e-6);
  });

  it('leaves non-overlapping circles alone', () => {
    const input: Bubble[] = [
      { geoid: 'a', x: 0, y: 0, r: 5 },
      { geoid: 'b', x: 100, y: 0, r: 5 },
    ];
    const out = relax(input);
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it('moves the smaller circle further than the larger one', () => {
    const [big, small] = relax(overlapping());
    const bigMoved = Math.abs(big.x - 100);
    const smallMoved = Math.abs(small.x - 110);
    expect(smallMoved).toBeGreaterThan(bigMoved);
  });

  it('separates exactly co-located circles instead of dividing by zero', () => {
    const out = relax([
      { geoid: 'a', x: 50, y: 50, r: 10 },
      { geoid: 'b', x: 50, y: 50, r: 10 },
    ]);
    expect(out.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y))).toBe(true);
    expect(Math.hypot(out[1].x - out[0].x, out[1].y - out[0].y)).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(relax(overlapping())).toEqual(relax(overlapping()));
  });

  it('paints largest first so small circles land on top', () => {
    const out = relax(overlapping());
    expect(out[0].r).toBeGreaterThan(out[1].r);
  });
});

describe('radiusScale', () => {
  it('scales by area, not radius', () => {
    const r = radiusScale(100, 20);
    expect(r(100)).toBeCloseTo(20);
    // A quarter of the value is half the radius.
    expect(r(25)).toBeCloseTo(10);
  });

  it('gives zero for non-positive values', () => {
    const r = radiusScale(100, 20);
    expect(r(0)).toBe(0);
    expect(r(-5)).toBe(0);
  });

  it('survives an all-zero dataset', () => {
    expect(radiusScale(0, 20)(0)).toBe(0);
  });
});
