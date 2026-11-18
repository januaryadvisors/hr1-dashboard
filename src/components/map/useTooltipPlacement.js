/**
 * Where the county tooltip sits on screen.
 *
 *   'pointer'   beside the cursor (a map hover)
 *   'external'  beside the county's shape on the hero map (a search pick)
 *   'list'      beside the hovered shortlist row: on its left, over the map, or
 *               on its right on the index view, where the larger panel has room
 *
 * It flips at the window's edges, and hides while an anchored county is
 * scrolled off screen.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Gap between the anchor and the panel's near corner. */
const OFFSET = 6;
const EDGE = 8;

/** The anchor element's position, re-read on scroll and resize. */
function useAnchor(origin, geoid) {
  const [anchor, setAnchor] = useState(null);

  // A layout effect, so the first frame is already in place rather than at the cursor.
  useLayoutEffect(() => {
    if ((origin !== 'external' && origin !== 'list') || !geoid) {
      setAnchor(null);
      return undefined;
    }
    const place = () => {
      const el =
        origin === 'list'
          ? document.querySelector(`[data-rank-geoid="${geoid}"]`)
          : document.querySelector(`[data-hero-map] [data-geoid="${geoid}"]`);
      if (!el) {
        setAnchor(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const offscreen = r.bottom < 0 || r.top > window.innerHeight;
      setAnchor(
        origin === 'list'
          ? { x: r.right, xFlip: r.left, y: r.top, row: true, offscreen }
          : { x: r.right, y: r.top + r.height / 2, offscreen },
      );
    };
    place();
    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [origin, geoid]);

  return anchor;
}

function usePointer() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return pos;
}

/**
 * @param {{ origin: string, geoid?: string, width: number, rowRight: boolean }} args
 *   `rowRight`: beside a shortlist row, open on its right rather than its left.
 * @returns {{ ref: object, style: { left: number, top: number }, hidden: boolean }}
 */
export function useTooltipPlacement({ origin, geoid, width, rowRight }) {
  const pointer = usePointer();
  const countyAnchor = useAnchor(origin, geoid);

  // The panel's real height, re-measured after every render, for the overflow test.
  const ref = useRef(null);
  const [height, setHeight] = useState(240);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight;
    if (h && Math.abs(h - height) > 1) setHeight(h);
  });

  const anchor = countyAnchor ?? pointer;
  const rowLeft = anchor.row && !rowRight;
  const flip = rowLeft
    ? anchor.xFlip - OFFSET - width >= EDGE
    : anchor.x + OFFSET + width > window.innerWidth;
  const left = Math.max(EDGE, flip ? (anchor.xFlip ?? anchor.x) - OFFSET - width : anchor.x + OFFSET);

  const maxTop = window.innerHeight - height - EDGE;
  const top = anchor.row
    ? // Level with the row, nudged up only as far as the window needs.
      Math.max(EDGE, Math.min(anchor.y - 4, maxTop))
    : Math.max(
        EDGE,
        anchor.y + OFFSET + height > window.innerHeight
          ? Math.min(anchor.y - OFFSET - height, maxTop)
          : anchor.y + OFFSET,
      );

  return { ref, style: { left, top }, hidden: !!countyAnchor?.offscreen };
}
