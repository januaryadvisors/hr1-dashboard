/**
 * Shared, render-ready map geometry.
 *
 * Every panel on the Map page draws the same 254 shapes — the hero map plus five
 * thumbnails. The path strings are built once here and shared rather than inside
 * each <CountyMap>.
 *
 * @typedef {import('geojson').Feature} Feature
 * @typedef {import('geojson').Geometry} Geometry
 */
/**
 * @typedef {import('./projection').Projection} Projection
 */
/**
 * @typedef {[number, number][]} Ring
 */

/**
 * @typedef {Object} MapGeometry
 * @property {Map<string, string>} paths - Path string per geoid.
 * @property {Map<string, [number, number]>} centroids - Centroid per geoid, measured off the same rings.
 * @property {string} statePath - State outline.
 */

/** Area-weighted centroid of a ring set, for mark placement. */
export function ringsCentroid(rings) {
  let cx = 0;
  let cy = 0;
  let total = 0;
  for (const ring of rings) {
    let sum = 0;
    let x = 0;
    let y = 0;
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      sum += cross;
      x += (ring[j][0] + ring[i][0]) * cross;
      y += (ring[j][1] + ring[i][1]) * cross;
    }
    const a = sum / 2;
    if (a !== 0) {
      cx += x / (6 * a) * Math.abs(a);
      cy += y / (6 * a) * Math.abs(a);
      total += Math.abs(a);
    }
  }
  if (total === 0) {
    // Degenerate ring (fully collapsed by simplification): fall back to the
    // mean vertex so it still has a position.
    const pts = rings.flat();
    return [
      pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1),
      pts.reduce((s, p) => s + p[1], 0) / (pts.length || 1),
    ];
  }
  return [cx / total, cy / total];
}

/** SVG path string for a ring set. */
export function ringsToPath(rings) {
  return rings
    .map((ring) =>
      ring.length
        ? `M${ring.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`
        : '',
    )
    .join('');
}

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
