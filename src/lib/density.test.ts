import { describe, expect, it } from 'vitest';
import {
  radiusScale,
  relax,
  relaxSquares,
  squareScale,
  type Bubble,
  type Square,
} from './density';

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

describe('relaxSquares — population-weighted cartogram', () => {
  const overlapping = (): Square[] => [
    { geoid: 'big', x: 100, y: 100, h: 20 },
    { geoid: 'small', x: 110, y: 100, h: 6 },
  ];

  it('separates overlapping squares on both axes', () => {
    const out = relaxSquares(overlapping());
    const [a, b] = out;
    const gapX = Math.abs(b.x - a.x) - (a.h + b.h);
    const gapY = Math.abs(b.y - a.y) - (a.h + b.h);
    expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(-1e-6);
  });

  it('leaves non-overlapping squares alone', () => {
    const input: Square[] = [
      { geoid: 'a', x: 0, y: 0, h: 5 },
      { geoid: 'b', x: 200, y: 0, h: 5 },
    ];
    expect(relaxSquares(input).map((s) => [s.x, s.y])).toEqual([
      [0, 0],
      [200, 0],
    ]);
  });

  it('moves the smaller square much further than the larger', () => {
    const [big, small] = relaxSquares(overlapping());
    expect(Math.abs(small.x - 110)).toBeGreaterThan(Math.abs(big.x - 100));
  });

  it('separates exactly co-located squares deterministically', () => {
    const out = relaxSquares([
      { geoid: 'a', x: 50, y: 50, h: 8 },
      { geoid: 'b', x: 50, y: 50, h: 8 },
    ]);
    expect(out.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y))).toBe(true);
    expect(relaxSquares([
      { geoid: 'a', x: 50, y: 50, h: 8 },
      { geoid: 'b', x: 50, y: 50, h: 8 },
    ])).toEqual(out);
  });

  it('resolves a dense cluster with no residual overlap', () => {
    const cluster: Square[] = Array.from({ length: 24 }, (_, i) => ({
      geoid: `c${i}`,
      x: 100 + (i % 5),
      y: 100 + Math.floor(i / 5),
      h: 4 + (i % 3),
    }));
    const out = relaxSquares(cluster, 40);
    let worst = 0;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const ox = a.h + b.h - Math.abs(b.x - a.x);
        const oy = a.h + b.h - Math.abs(b.y - a.y);
        if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
      }
    }
    expect(worst).toBeLessThan(1);
  });
});

describe('squareScale', () => {
  it('gives the largest value the full cell size', () => {
    expect(squareScale(100, 20)(100)).toBeCloseTo(20);
  });

  it('is monotonic in value', () => {
    const s = squareScale(5_000_000, 30);
    const sizes = [1_000, 10_000, 100_000, 1_000_000, 5_000_000].map(s);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it('compresses the range so small counties stay legible', () => {
    // At a strict area-proportional exponent of 0.5 this would be ~0.1px.
    const s = squareScale(5_130_000, 54, 0);
    expect(s(20_000)).toBeGreaterThan(5);
    // Harris still dwarfs a 20k county by a wide margin.
    expect(s(5_130_000) / s(20_000)).toBeGreaterThan(4);
  });

  it('floors the smallest counties so they stay visible and clickable', () => {
    const s = squareScale(5_000_000, 20, 2.2);
    expect(s(64)).toBe(2.2);
    expect(s(0)).toBe(2.2);
  });

  it('honours an explicit exponent', () => {
    const strict = squareScale(100, 20, 0, 0.5);
    expect(strict(25)).toBeCloseTo(10);
  });
});
