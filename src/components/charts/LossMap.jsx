/**
 * <LossMap> — a choropleth of the share of each unit's caseload no longer on
 * SNAP over a window, with one unit outlined.
 *
 * The Insights page draws it for the scope's peers: every county for Texas or a
 * county, every district of the chamber for a district. A share rather than a
 * headcount, because a count map is Harris and nothing else. The classes are
 * fixed (BINS_INSIGHTS_LOSS), the same on every map, so a colour means the same
 * percent for a county as for a district.
 *
 * Hovering (or tapping) a unit outlines it and shows its name, share and
 * headcount beside the pointer.
 */
import { useRef, useState } from 'react';
import { BINS_INSIGHTS_LOSS as BINS, colorFor } from '../../lib/scales';
import { fmtInt, fmtPct } from '../../lib/format';
import { RampLegend } from '../map/RampLegend';
import styles from './LossMap.module.css';

/**
 * @typedef {Object} LossShape
 * @property {string} key - The unit's geoid, matching `fill`.
 * @property {string} name - For the hover tooltip.
 * @property {string} d - Projected SVG path.
 */

/**
 * @typedef {Object} LossMapProps
 * @property {LossShape[]} shapes
 * @property {Map<string, number | null>} fill - Share of the window-start caseload lost, per unit.
 * @property {Map<string, number> | null} lost - People no longer on SNAP, per unit.
 * @property {string | null} highlight - Key of the unit to outline.
 * @property {{ width: number, height: number }} canvas - The shared Texas projection's.
 * @property {string} title
 */

/** Half the tooltip's width, roughly: how far from the edges its centre stays. */
const TIP_HALF = 100;

/** Each class's range for the key's hover text; both ends are open. */
const LAST = BINS.length - 2;
const RANGES = BINS.slice(0, -1).map((lo, i) =>
  i === 0
    ? `Under ${fmtPct(BINS[1], 0)}`
    : i === LAST
      ? `${fmtPct(lo, 0)} or more`
      : `${fmtPct(lo, 0)} – ${fmtPct(BINS[i + 1], 0)}`,
);

/** @param {LossMapProps} props */
export function LossMap({ shapes, fill, lost, highlight, canvas, title }) {
  const picked = shapes.find((s) => s.key === highlight);

  /** The unit under the pointer, and where to put its tooltip within the root. */
  const rootRef = useRef(null);
  const [hover, setHover] = useState(null);
  const hovered = hover && shapes.find((s) => s.key === hover.key);
  const track = (key) => (e) => {
    const box = rootRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - box.left, TIP_HALF), box.width - TIP_HALF);
    setHover({ key, x, y: e.clientY - box.top });
  };

  const map = (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      role="img"
      aria-label={title}
      onPointerLeave={() => setHover(null)}
    >
      {shapes.map((s) => (
        <path
          key={s.key}
          d={s.d}
          fill={colorFor(fill.get(s.key), 'loss', BINS)}
          className={styles.shape}
          onPointerMove={track(s.key)}
          onPointerDown={track(s.key)}
        />
      ))}
      {hovered && <path d={hovered.d} className={styles.hovered} pointerEvents="none" />}
      {/* Drawn last and twice, a light halo under a dark line, so the outline
          reads against any fill and over its neighbours' borders. */}
      {picked && (
        <g pointerEvents="none">
          <path d={picked.d} className={styles.halo} />
          <path d={picked.d} className={styles.outline} />
        </g>
      )}
    </svg>
  );

  const share = hovered ? fill.get(hovered.key) : null;
  const people = hovered ? lost?.get(hovered.key) : null;

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.legend}>
        <RampLegend
          layer="loss"
          mode="rate"
          label="Share of caseload no longer on SNAP"
          loLabel={`<${fmtPct(BINS[1], 0)}`}
          hiLabel={`${fmtPct(BINS[LAST], 0)}+`}
          ranges={RANGES}
        />
      </div>
      <div className={styles.single}>{map}</div>
      {hovered && (
        <div className={styles.tip} style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <div className={styles.tipName}>{hovered.name}</div>
          {share == null ? (
            <div>No data</div>
          ) : share === 0 ? (
            <div>No net loss</div>
          ) : (
            <>
              <div>
                <strong>{fmtPct(share, 1)}</strong> no longer on SNAP
              </div>
              {people != null && <div className={styles.tipSub}>−{fmtInt(people)} people</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
