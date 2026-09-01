/**
 * Not an assertion of behaviour — a guard on cost. The cartogram runs on the
 * committed brush window, so if it ever drifts into hundreds of milliseconds the
 * window drag will start to feel heavy and this test says so.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { feature } from 'topojson-client';
import { geoAlbers, geoPath } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { dougenikCartogram, interpolateRings, ringsToPath, type Ring } from './cartogram';

const topo = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/data/geometry.json'), 'utf8'),
);
const counties = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/data/counties.json'), 'utf8'),
);

const fc = feature(topo, topo.objects.counties) as never as {
  features: { properties: { geoid: string }; geometry: { type: string; coordinates: unknown } }[];
};
const state = feature(topo, topo.objects.state) as never;

const projection = geoAlbers().parallels([27.5, 35]).rotate([100, 0]);
projection.fitExtent(
  [
    [8, 8],
    [992, 932],
  ],
  state,
);
void geoPath(projection);

const regions = fc.features.map((f) => {
  const g = f.geometry;
  const polys: number[][][] =
    g.type === 'Polygon'
      ? [(g.coordinates as number[][][])[0]]
      : (g.coordinates as number[][][][]).map((p) => p[0]);
  const rings: Ring[] = polys.map(
    (ring) =>
      ring
        .map((c) => projection([c[0], c[1]]))
        .filter((p): p is [number, number] => Boolean(p)) as Ring,
  );
  return { id: f.properties.geoid, rings };
});

const vertexCount = regions.reduce(
  (s, r) => s + r.rings.reduce((t, ring) => t + ring.length, 0),
  0,
);

describe('cartogram cost on the real Texas geometry', () => {
  it('reports its shape', () => {
    expect(regions.length).toBe(254);
    console.log(`    regions ${regions.length}, vertices ${vertexCount}`);
  });

  it('solves in a time that will not stall a brush drag', () => {
    const weights = new Map<string, number>(
      counties.map((c: { geoid: string; snap_enrolled: number[] }) => [
        c.geoid,
        Math.max(c.snap_enrolled[44] - c.snap_enrolled[54], 1) ** 1.35,
      ]),
    );

    const t0 = performance.now();
    const { regions: out } = dougenikCartogram(regions, weights, { iterations: 6, blend: 0.92 });
    const solveMs = performance.now() - t0;
    console.log(`    solve: ${solveMs.toFixed(0)}ms`);

    // One animation frame's worth of work: interpolate + stringify everything.
    const t1 = performance.now();
    for (let i = 0; i < 254; i++) {
      const rings = interpolateRings(regions[i].rings, out[i].rings, 0.4);
      ringsToPath(rings);
    }
    const frameMs = performance.now() - t1;
    console.log(`    one morph frame: ${frameMs.toFixed(1)}ms`);

    expect(solveMs).toBeLessThan(1500);
    expect(frameMs).toBeLessThan(50);
  }, 30_000);
});
