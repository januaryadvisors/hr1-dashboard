/**
 * Shared, render-ready map geometry.
 *
 * Every panel on the Map page draws the same 254 shapes — the hero map plus five
 * thumbnails. Building the path strings inside <CountyMap> meant doing that work
 * six times per render. They are built once here instead, and the animated
 * transition between the true map and the cartogram interpolates one set of
 * rings that all six panels then share.
 */
import type { Feature, Geometry } from 'geojson';
import type { Projection } from './projection';
import { interpolateRings, ringsCentroid, ringsToPath, type Ring } from './cartogram';

export interface MapGeometry {
  /** Path string per geoid, in the current (possibly mid-transition) shape. */
  paths: Map<string, string>;
  /** Centroid per geoid, in the same shape — so marks follow the geometry. */
  centroids: Map<string, [number, number]>;
  /** State outline, in the current shape. */
  statePath: string;
}

/**
 * Projected outer rings per county. Outer rings only: treating a hole as another
 * ring would inflate the measured area, and Texas counties have none at this
 * simplification.
 */
export function projectRings(
  features: Feature<Geometry, { geoid: string; name: string }>[],
  projection: Projection,
): Map<string, Ring[]> {
  const out = new Map<string, Ring[]>();

  for (const f of features) {
    const g = f.geometry;
    const polys: number[][][] =
      g.type === 'Polygon'
        ? [(g.coordinates as unknown as number[][][])[0]]
        : g.type === 'MultiPolygon'
          ? (g.coordinates as unknown as number[][][][]).map((poly) => poly[0])
          : [];

    const rings: Ring[] = [];
    for (const ring of polys) {
      const projected: Ring = [];
      for (const coord of ring) {
        const xy = projection.project([coord[0], coord[1]]);
        if (xy) projected.push([xy[0], xy[1]]);
      }
      if (projected.length >= 3) rings.push(projected);
    }
    if (rings.length) out.set(f.properties.geoid, rings);
  }

  return out;
}

/** Build the render set at transition position `t` (0 = true map, 1 = cartogram). */
export function buildGeometry(
  base: Map<string, Ring[]>,
  target: Map<string, Ring[]> | null,
  t: number,
  baseStatePath: string,
): MapGeometry {
  const paths = new Map<string, string>();
  const centroids = new Map<string, [number, number]>();

  for (const [geoid, baseRings] of base) {
    const cartRings = target?.get(geoid);
    const rings = cartRings && t > 0 ? interpolateRings(baseRings, cartRings, t) : baseRings;
    paths.set(geoid, ringsToPath(rings));
    centroids.set(geoid, ringsCentroid(rings));
  }

  return {
    paths,
    centroids,
    // The state outline is not part of the cartogram — the distorted counties no
    // longer fill it, and keeping the true border visible is what lets a reader
    // see how far the map has been stretched.
    statePath: baseStatePath,
  };
}
