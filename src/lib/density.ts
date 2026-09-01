/**
 * Bubble placement for the Density style (§6.5).
 *
 * "Sort descending by radius when painting so small circles land on top; nudge
 * overlapping metros apart with two passes of simple collision relaxation, no
 * force simulation."
 */
export interface Bubble {
  geoid: string;
  x: number;
  y: number;
  r: number;
}

/**
 * Two relaxation passes. Deterministic: circles are processed largest-first and
 * displacement is split evenly, so the same input always yields the same layout.
 */
export function relax(bubbles: Bubble[], passes = 2, padding = 0.5): Bubble[] {
  const out = bubbles.map((b) => ({ ...b }));
  // Largest first, so metros hold position and small counties absorb the shove.
  out.sort((a, b) => b.r - a.r);

  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r + padding;
        let dist = Math.hypot(dx, dy);

        if (dist >= minDist || minDist === 0) continue;

        // Exactly co-located centroids have no direction to separate along;
        // push along x so the result stays deterministic.
        let ux: number;
        let uy: number;
        if (dist === 0) {
          ux = 1;
          uy = 0;
          dist = 1e-6;
        } else {
          ux = dx / dist;
          uy = dy / dist;
        }

        const shove = (minDist - dist) / 2;
        // Weight by area so a large circle moves less than a small one.
        const wa = (b.r * b.r) / (a.r * a.r + b.r * b.r);
        const wb = 1 - wa;

        a.x -= ux * shove * 2 * wa;
        a.y -= uy * shove * 2 * wa;
        b.x += ux * shove * 2 * wb;
        b.y += uy * shove * 2 * wb;
      }
    }
  }
  return out;
}

/** Square-root radius scale — area, not radius, carries the magnitude. */
export function radiusScale(maxValue: number, maxRadius: number) {
  const safeMax = maxValue > 0 ? maxValue : 1;
  return (value: number) => (value <= 0 ? 0 : Math.sqrt(value / safeMax) * maxRadius);
}

/** A population-weighted cartogram cell. */
export interface Square {
  geoid: string;
  x: number;
  y: number;
  /** Half the side length. */
  h: number;
}

/**
 * Demers-style cartogram relaxation: squares sized by value, placed at their true
 * projected centroids, then pushed apart until they no longer overlap.
 *
 * Overlap is resolved along the axis of least penetration, which is what keeps
 * the result reading as a grid of blocks rather than a radial spray. Largest
 * first and evenly weighted by area, so it is deterministic and metros hold
 * position while small counties absorb the displacement.
 */
export function relaxSquares(squares: Square[], passes = 6, padding = 0.6): Square[] {
  const out = squares.map((s) => ({ ...s }));
  out.sort((a, b) => b.h - a.h);

  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const minX = a.h + b.h + padding;
        const minY = a.h + b.h + padding;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minX - Math.abs(dx);
        const overlapY = minY - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;
        // Weight by area so a big block barely moves.
        const areaA = a.h * a.h;
        const areaB = b.h * b.h;
        const wa = areaB / (areaA + areaB);
        const wb = 1 - wa;

        if (overlapX < overlapY) {
          // Co-located centroids have no direction; break the tie on x so the
          // layout stays deterministic.
          const dir = dx === 0 ? 1 : Math.sign(dx);
          a.x -= dir * overlapX * wa;
          b.x += dir * overlapX * wb;
        } else {
          const dir = dy === 0 ? 1 : Math.sign(dy);
          a.y -= dir * overlapY * wa;
          b.y += dir * overlapY * wb;
        }
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Side length for a cartogram cell.
 *
 * Strict area-proportionality means side ∝ value^0.5, but Texas county
 * population spans five orders of magnitude (Harris 5.13M, Loving ~64). At
 * exponent 0.5 everything below about 200k collapses into an indistinguishable
 * speck, which defeats the choropleth the blocks are carrying.
 *
 * EXPONENT compresses that range while keeping the ordering and the "Harris is
 * enormous" reading intact. It is a legibility compromise, not a neutral
 * choice — lower it toward 0.5 for stricter proportionality, raise it toward 0
 * for more even weight. minHalfSide keeps the smallest counties visible and
 * clickable.
 */
export const CARTOGRAM_EXPONENT = 0.34;

export function squareScale(
  maxValue: number,
  maxHalfSide: number,
  minHalfSide = 2.2,
  exponent = CARTOGRAM_EXPONENT,
) {
  const safeMax = maxValue > 0 ? maxValue : 1;
  return (value: number) =>
    Math.max(minHalfSide, Math.pow(Math.max(0, value) / safeMax, exponent) * maxHalfSide);
}
