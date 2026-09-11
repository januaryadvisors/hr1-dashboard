/**
 * Shared, render-ready map geometry.
 *
 * Every panel on the Map page draws the same 254 shapes — the hero map plus five
 * thumbnails. Building the path strings inside <CountyMap> meant doing that work
 * six times per render. They are built once here instead and shared.
 *
 * Until 2026-09-11 this also interpolated between the true map and an area
 * cartogram, which is why it took a target ring set and a transition position.
 * The cartogram option was removed, so it now just projects.
 *
 * @typedef {import('geojson').Feature} Feature
 * @typedef {import('geojson').Geometry} Geometry
 */
/**
 * @typedef {import('./projection').Projection} Projection
 */
import { ringsCentroid, ringsToPath } from './cartogram';
/**
 * @typedef {import('./cartogram').Ring} Ring
 */

/**
 * @typedef {Object} MapGeometry
 * @property {Map<string, string>} paths - Path string per geoid, in the current (possibly mid-transition) shape.
 * @property {Map<string, [number, number]>} centroids - Centroid per geoid, in the same shape — so marks follow the geometry.
 * @property {string} statePath - State outline, in the current shape.
 */

/**
 * Projected outer rings per county. Outer rings only: treating a hole as another
 * ring would inflate the measured area, and Texas counties have none at this
 * simplification.
 */
export function projectRings(
  features,
  projection,
) {
  const out = new Map();

  for (const f of features) {
    const g = f.geometry;
    const polys =
      g.type === 'Polygon'
        ? [(g.coordinates)[0]]
        : g.type === 'MultiPolygon'
          ? (g.coordinates).map((poly) => poly[0])
          : [];

    const rings = [];
    for (const ring of polys) {
      const projected = [];
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

/** Build the render set: one path string and one centroid per county. */
export function buildGeometry(base, baseStatePath) {
  const paths = new Map();
  const centroids = new Map();

  for (const [geoid, rings] of base) {
    paths.set(geoid, ringsToPath(rings));
    // Measured off the rings rather than taken from counties.json, so a mark
    // sits on the shape actually drawn.
    centroids.set(geoid, ringsCentroid(rings));
  }

  return { paths, centroids, statePath: baseStatePath };
}
