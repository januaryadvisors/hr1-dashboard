/**
 * NOTE, 2026-09-11: the Cartogram render style was removed from the Map page on
 * client direction, so `dougenikCartogram` and `interpolateRings` are NO LONGER
 * CALLED by the app. They are kept, with their tests, because the work is sound
 * and the decision was a design call rather than a technical one — putting the
 * style back is a two-line change in MapPage plus the option in the control.
 *
 * `ringsCentroid` and `ringsToPath` ARE still live: mapGeometry.js builds every
 * county path with them, on every view.
 *
 * If the cartogram is not coming back, delete this file down to those two
 * functions and drop cartogram.perf.test.js with it.
 *
 * ---
 *
 * Contiguous area cartogram — Dougenik, Chrisman & Niemeyer (1985) "rubber sheet"
 * algorithm, the same one d3-cartogram implements.
 *
 * County polygons keep their adjacency but are inflated or deflated until each
 * one's AREA is proportional to its population. Harris swells, West Texas
 * shrinks, and the state stays in one piece.
 *
 * Why adjacency survives: the displacement is a pure function of position — every
 * region contributes a radial force field, and a vertex is moved by their sum. A
 * vertex shared by two counties has one coordinate, so it receives one
 * displacement, and the shared border cannot split.
 *
 * Cost is O(vertices × regions) per iteration. With ~250 regions and a simplified
 * geometry this runs in well under a second, and the result depends only on
 * population — so it is computed once and cached, never per layer change.
 */

/**
 * @typedef {[number, number][]} Ring
 */
/**
 * One region: a list of rings in PROJECTED coordinates. Holes are not modelled.
 *
 * @typedef {Object} CartogramRegion
 * @property {string} id
 * @property {Ring[]} rings
 */

/**
 * @typedef {Object} RegionMeta
 * @property {number} cx
 * @property {number} cy
 * @property {number} area
 * @property {number} radius
 * @property {number} mass
 */

/** Shoelace area of a ring, absolute value. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum / 2);
}

/** Area-weighted centroid of a ring set. */
function centroidOf(rings) {
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
    // Degenerate ring (fully collapsed by simplification) — fall back to the
    // mean vertex so it still has a position to be pushed from.
    const pts = rings.flat();
    return [
      pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1),
      pts.reduce((s, p) => s + p[1], 0) / (pts.length || 1),
    ];
  }
  return [cx / total, cy / total];
}

const areaOf = (rings) => rings.reduce((s, r) => s + ringArea(r), 0);

/**
 * @typedef {Object} CartogramOptions
 * @property {number} [iterations] - More iterations converge closer at linear cost.
 * @property {number} [blend] - How far to move from the true map toward the fully converged cartogram,
 *   0–1. 1 is the raw algorithm.
 *   This knob exists because Texas is a hard case: Harris holds ~16% of the
 *   population on ~0.7% of the land, so a fully converged cartogram inflates the
 *   metros into overlapping near-circles and crushes the rural counties into
 *   slivers — accurate on area, unreadable as a map. Blending back toward the
 *   true geometry keeps the state recognisable while still showing where the
 *   people are.
 */

/**
 * @typedef {Object} CartogramResult
 * @property {CartogramRegion[]} regions
 * @property {number} error - Mean absolute area error after the final pass, as a fraction. 0 = perfect.
 * @property {number} iterations
 */

/**
 * @param regions  projected polygons
 * @param values   target value per region id (population). Non-positive or missing
 *                 values are floored, since a zero-area region cannot be drawn.
 */
export function dougenikCartogram(
  regions,
  values,
  { iterations = 4, blend = 0.75 } = {},
) {
  // Work on a copy; the input geometry is shared with the geographic views.
  let current = regions.map((r) => ({
    id: r.id,
    rings: r.rings.map((ring) => ring.map((p) => [p[0], p[1]])),
  }));

  const totalValue = regions.reduce((s, r) => s + Math.max(0, values.get(r.id) ?? 0), 0);
  if (totalValue <= 0) return { regions: current, error: 0, iterations: 0 };

  let error = 0;

  for (let pass = 0; pass < iterations; pass++) {
    const totalArea = current.reduce((s, r) => s + areaOf(r.rings), 0);
    if (totalArea <= 0) break;

    const metas = [];
    let sizeErrorSum = 0;
    let areaSum = 0;

    for (const region of current) {
      const area = Math.max(areaOf(region.rings), 1e-9);
      const value = Math.max(values.get(region.id) ?? 0, 0);
      // Floor tiny values so a region cannot be asked to vanish entirely.
      const desiredArea = Math.max((totalArea * value) / totalValue, totalArea * 1e-5);

      const [cx, cy] = centroidOf(region.rings);
      const radius = Math.sqrt(area / Math.PI);
      const desiredRadius = Math.sqrt(desiredArea / Math.PI);

      metas.push({ cx, cy, area, radius, mass: desiredRadius - radius });

      const sizeError = Math.max(area, desiredArea) / Math.min(area, desiredArea);
      sizeErrorSum += sizeError * area;
      areaSum += area;
    }

    const meanSizeError = areaSum > 0 ? sizeErrorSum / areaSum : 1;
    // Damping. Without it large mismatches overshoot and the sheet tears.
    const reduction = 1 / (1 + meanSizeError);
    error = meanSizeError - 1;

    current = current.map((region) => ({
      id: region.id,
      rings: region.rings.map((ring) =>
        ring.map(([x0, y0]) => {
          let x = x0;
          let y = y0;
          for (const m of metas) {
            const dx = x0 - m.cx;
            const dy = y0 - m.cy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance === 0) continue;

            // Force falls off as 1/d outside the region's equivalent circle and
            // tapers smoothly to zero at the centroid inside it. The two branches
            // agree at distance === radius.
            const force =
              distance > m.radius
                ? (m.mass * m.radius) / distance
                : m.mass *
                  ((distance * distance) / (m.radius * m.radius)) *
                  (4 - (3 * distance) / m.radius);

            x += (force * dx) / distance * reduction;
            y += (force * dy) / distance * reduction;
          }
          return [x, y];
        }),
      ),
    }));
  }

  if (blend < 1) {
    const t = Math.max(0, blend);
    current = current.map((region, ri) => ({
      id: region.id,
      rings: region.rings.map((ring, gi) =>
        ring.map(([x, y], vi) => {
          const [ox, oy] = regions[ri].rings[gi][vi];
          return [ox + (x - ox) * t, oy + (y - oy) * t];
        }),
      ),
    }));
  }

  return { regions: current, error, iterations };
}

/** Area-weighted centroid of a ring set, exported for mark placement. */
export function ringsCentroid(rings) {
  return centroidOf(rings);
}

/**
 * Vertex-wise blend between two ring sets, for animating between the true map
 * and the cartogram.
 *
 * This works — and is cheap — only because the cartogram is a per-vertex
 * DISPLACEMENT of the projected geometry: both sides have identical ring counts
 * and vertex counts, in the same order. There is no correspondence problem to
 * solve, so no path-morphing library is needed.
 */
export function interpolateRings(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return from.map((ring, gi) => {
    const target = to[gi];
    if (!target || target.length !== ring.length) return ring;
    return ring.map(([x, y], vi) => {
      const [tx, ty] = target[vi];
      return [x + (tx - x) * t, y + (ty - y) * t];
    });
  });
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
