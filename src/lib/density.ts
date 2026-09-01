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
