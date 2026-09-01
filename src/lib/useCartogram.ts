/**
 * The cartogram, and the animated transition into and out of it.
 *
 * WEIGHTING. Area encodes the number of people who left SNAP over the active
 * window — not population. That makes the cartogram answer the question the
 * dashboard is actually about ("where did the losses land?") rather than
 * restating where Texans live. Because it follows the brush, it recomputes when
 * the window commits, which is why it is skipped entirely unless the cartogram
 * is on screen.
 *
 * To weight by something else, change `weightFor` in MapPage — the enrollment
 * drop, the drop as a share of caseload, and current caseload are all one line.
 * A percentile is deliberately not offered: area encodes a quantity, and a
 * percentile is not one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { dougenikCartogram, type Ring } from './cartogram';

/** Iterations and damping. See docs/SPEC-DEVIATIONS.md §J3. */
const ITERATIONS = 9;
const BLEND = 1;

/**
 * Exaggeration applied to the weights before solving, so the range between the
 * smallest and largest county reads more dramatically.
 *
 * NOTE: this deliberately breaks strict area-proportionality — at 1.0 area is
 * exactly proportional to the weight, and above that large counties are pushed
 * further and small ones squeezed harder than the data warrants. It is an
 * emphasis control, requested as such. Set to 1 for an honest area encoding.
 */
const WEIGHT_EXPONENT = 1.6;

const TRANSITION_MS = 620;

/** Cubic ease-in-out. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function useCartogramRings(
  base: Map<string, Ring[]>,
  weights: Map<string, number>,
  enabled: boolean,
): Map<string, Ring[]> | null {
  const solved = useMemo(() => {
    if (!enabled || base.size === 0) return null;

    const exaggerated = new Map<string, number>();
    for (const [geoid, value] of weights) {
      exaggerated.set(geoid, Math.pow(Math.max(0, value), WEIGHT_EXPONENT));
    }

    const regions = [...base].map(([id, rings]) => ({ id, rings }));
    const { regions: out } = dougenikCartogram(regions, exaggerated, {
      iterations: ITERATIONS,
      blend: BLEND,
    });
    return new Map(out.map((r) => [r.id, r.rings]));
  }, [base, weights, enabled]);

  /**
   * Retain the last solution after `enabled` goes false.
   *
   * Without this the transition OUT of the cartogram snapped: the rings vanished
   * on the same render that started the animation, leaving nothing to interpolate
   * towards, so the shapes jumped straight back to the true map. Retaining costs
   * nothing — it is not recomputed, just kept — and the "don't solve unless it is
   * on screen" property is unaffected.
   */
  const retained = useRef<Map<string, Ring[]> | null>(null);
  if (solved) retained.current = solved;
  return solved ?? retained.current;
}

/**
 * Animates 0 → 1 when the cartogram is switched on and back when it is switched
 * off, so the counties visibly stretch rather than snapping.
 *
 * Honours prefers-reduced-motion by jumping straight to the endpoint.
 */
export function useTransition(active: boolean): number {
  const [t, setT] = useState(active ? 1 : 0);
  const frame = useRef<number>();
  const startedAt = useRef<number>(0);
  const from = useRef(active ? 1 : 0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const to = active ? 1 : 0;
    if (reduced) {
      setT(to);
      return;
    }

    from.current = t;
    startedAt.current = performance.now();

    const step = (now: number) => {
      const raw = Math.min(1, (now - startedAt.current) / TRANSITION_MS);
      const eased = ease(raw);
      setT(from.current + (to - from.current) * eased);
      if (raw < 1) frame.current = requestAnimationFrame(step);
    };

    // Cancel any in-flight run so a fast double-toggle does not fight itself.
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // `t` is read once as the starting point, deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return t;
}
