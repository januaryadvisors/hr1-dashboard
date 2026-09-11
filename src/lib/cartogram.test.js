import { describe, expect, it } from 'vitest';
import { dougenikCartogram, ringsToPath } from './cartogram';
/**
 * @typedef {import('./cartogram').CartogramRegion} CartogramRegion
 * @typedef {import('./cartogram').Ring} Ring
 */

/** A grid of unit squares, so areas and adjacency are trivial to reason about. */
function grid(cols, rows, size = 10) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * size;
      const y = r * size;
      const ring = [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
      ];
      out.push({ id: `${r}-${c}`, rings: [ring] });
    }
  }
  return out;
}

const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum / 2);
};
const areaOf = (r) => r.rings.reduce((s, ring) => s + ringArea(ring), 0);

describe('dougenikCartogram', () => {
  it('leaves geometry alone when areas already match the values', () => {
    const regions = grid(3, 3);
    const values = new Map(regions.map((r) => [r.id, 1]));
    const { regions: out } = dougenikCartogram(regions, values, { iterations: 4 });

    out.forEach((r, i) => {
      expect(areaOf(r)).toBeCloseTo(areaOf(regions[i]), 4);
    });
  });

  it('grows the high-value region and shrinks the others', () => {
    const regions = grid(3, 3);
    const values = new Map(regions.map((r) => [r.id, r.id === '1-1' ? 20 : 1]));
    const before = areaOf(regions.find((r) => r.id === '1-1'));

    const { regions: out } = dougenikCartogram(regions, values, { iterations: 12 });
    const centre = out.find((r) => r.id === '1-1');
    const corner = out.find((r) => r.id === '0-0');

    expect(areaOf(centre)).toBeGreaterThan(before);
    expect(areaOf(corner)).toBeLessThan(areaOf(regions[0]));
  });

  it('reduces area error over iterations', () => {
    const regions = grid(4, 4);
    const values = new Map(regions.map((r, i) => [r.id, i + 1]));

    const one = dougenikCartogram(regions, values, { iterations: 1 });
    const many = dougenikCartogram(regions, values, { iterations: 16 });
    expect(many.error).toBeLessThan(one.error);
  });

  it('keeps shared borders welded together', () => {
    // Two squares sharing an edge. The shared vertices must stay coincident,
    // otherwise the cartogram tears along county lines.
    const shared = [
      { id: 'a', rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] },
      { id: 'b', rings: [[[10, 0], [20, 0], [20, 10], [10, 10]]] },
    ];
    const values = new Map([
      ['a', 9],
      ['b', 1],
    ]);
    const { regions: out } = dougenikCartogram(shared, values, { iterations: 10 });

    const a = out[0].rings[0];
    const b = out[1].rings[0];
    // a's [10,0] and [10,10] are b's [10,0] and [10,10].
    expect(a[1]).toEqual(b[0]);
    expect(a[2]).toEqual(b[3]);
  });

  it('does not produce NaN when a vertex sits exactly on a centroid', () => {
    const regions = [
      { id: 'a', rings: [[[-5, -5], [5, -5], [5, 5], [-5, 5], [0, 0]]] },
      { id: 'b', rings: [[[5, -5], [15, -5], [15, 5], [5, 5]]] },
    ];
    const { regions: out } = dougenikCartogram(regions, new Map([['a', 5], ['b', 1]]), {
      iterations: 6,
    });
    const finite = out.every((r) =>
      r.rings.every((ring) => ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))),
    );
    expect(finite).toBe(true);
  });

  it('survives a zero-value region rather than collapsing it to nothing', () => {
    const regions = grid(2, 2);
    const values = new Map(regions.map((r, i) => [r.id, i === 0 ? 0 : 5]));
    const { regions: out } = dougenikCartogram(regions, values, { iterations: 8 });
    expect(areaOf(out[0])).toBeGreaterThan(0);
  });

  it('returns the input untouched when every value is zero', () => {
    const regions = grid(2, 2);
    const result = dougenikCartogram(regions, new Map(regions.map((r) => [r.id, 0])));
    expect(result.iterations).toBe(0);
    expect(result.regions.map(areaOf)).toEqual(regions.map(areaOf));
  });

  it('is deterministic', () => {
    const regions = grid(3, 3);
    const values = new Map(regions.map((r, i) => [r.id, i + 1]));
    const a = dougenikCartogram(regions, values, { iterations: 6 });
    const b = dougenikCartogram(regions, values, { iterations: 6 });
    expect(a.regions).toEqual(b.regions);
  });

  it('does not mutate the input geometry', () => {
    const regions = grid(2, 2);
    const snapshot = JSON.stringify(regions);
    dougenikCartogram(regions, new Map(regions.map((r, i) => [r.id, i + 1])), { iterations: 5 });
    expect(JSON.stringify(regions)).toBe(snapshot);
  });
});

describe('ringsToPath', () => {
  it('closes each ring', () => {
    expect(ringsToPath([[[0, 0], [1, 0], [1, 1]]])).toBe('M0.00 0.00L1.00 0.00L1.00 1.00Z');
  });

  it('handles multiple rings and empty input', () => {
    expect(ringsToPath([]).length).toBe(0);
    expect(ringsToPath([[], [[0, 0], [1, 1]]])).toBe('M0.00 0.00L1.00 1.00Z');
  });
});

describe('blend', () => {
  const regions = grid(3, 3);
  const values = new Map(regions.map((r) => [r.id, r.id === '1-1' ? 20 : 1]));

  it('blend 0 returns the original geometry', () => {
    const { regions: out } = dougenikCartogram(regions, values, { iterations: 8, blend: 0 });
    out.forEach((r, i) => expect(areaOf(r)).toBeCloseTo(areaOf(regions[i]), 6));
  });

  it('blend sits monotonically between the true map and the full cartogram', () => {
    const centre = (blend) =>
      areaOf(
        dougenikCartogram(regions, values, { iterations: 8, blend }).regions.find(
          (r) => r.id === '1-1',
        ),
      );
    const base = areaOf(regions.find((r) => r.id === '1-1'));
    expect(centre(0.5)).toBeGreaterThan(base);
    expect(centre(1)).toBeGreaterThan(centre(0.5));
  });

  it('preserves welded borders at partial blend', () => {
    const shared = [
      { id: 'a', rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] },
      { id: 'b', rings: [[[10, 0], [20, 0], [20, 10], [10, 10]]] },
    ];
    const { regions: out } = dougenikCartogram(shared, new Map([['a', 9], ['b', 1]]), {
      iterations: 8,
      blend: 0.6,
    });
    expect(out[0].rings[0][1]).toEqual(out[1].rings[0][0]);
    expect(out[0].rings[0][2]).toEqual(out[1].rings[0][3]);
  });
});
