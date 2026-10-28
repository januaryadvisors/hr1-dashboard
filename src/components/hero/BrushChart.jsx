/**
 * <BrushChart> — §7, spec'd in §6.2.
 *
 * "This is the only time control in the app. There is no separate month slider
 * on the map." Drag either handle; everything below follows this window.
 * Debounced at 120ms; 24px hit areas; arrow keys move one month per press.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { linePath } from '../../lib/chart';
import { cx } from '../../lib/cx';
import { fmtMillions, fmtMonth, fmtMonthBody } from '../../lib/format';
import { useElementSize } from '../../lib/useElementSize';
import { YGrid } from '../charts/YGrid';
import styles from './BrushChart.module.css';

const DEBOUNCE_MS = 120;
const HIT = 24;
/** A month label's width at 12px, plus air. */
const LABEL_W = 64;

/**
 * @typedef {Object} Preset
 * @property {string} label
 * @property {(months: string[]) => [number, number]} resolve - Resolve to a [startIndex, endIndex] pair given the series length.
 */

/**
 * @typedef {Object} BrushChartProps
 * @property {string[]} months
 * @property {number[]} series
 * @property {[string, string]} window
 * @property {Preset[]} presets
 * @property {(window: [string, string]) => void} onChange
 * @property {(window: [string, string] | null) => void} [onPreview] - Fires on every drag frame, undebounced. §6.2 debounces `onChange` at 120ms
 *   so the map and the summary charts do not recompute mid-drag; cheap readouts
 *   (the eyebrow, the hero number, the feed highlight) follow this instead so
 *   they do not freeze until the handle is released.
 *   Null on release, meaning "no preview, use the committed window".
 * @property {number} [viewWidth] - viewBox width — keep near the rendered width so the axis type stays legible.
 * @property {number} [height]
 */

export function BrushChart({
  months,
  series,
  window: win,
  presets,
  onChange,
  onPreview,
  viewWidth = 1000,
  height: H = 150,
}) {
  /*
     Authored at the slot's real width, so axis type renders at the size it is
     written at rather than scaled with the card. `viewWidth` covers the first
     paint, before the slot is measured.
  */
  const [slotRef, slot] = useElementSize();
  const W = Math.round(slot.width) || viewWidth;
  const M = { top: 22, right: 10, bottom: 22, left: 36 };
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);

  // Local indices so dragging feels immediate; the debounced value is what
  // propagates to the rest of the page.
  const [range, setRange] = useState(() => [
    Math.max(0, months.indexOf(win[0])),
    Math.max(0, months.indexOf(win[1])),
  ]);

  // Follow external changes (presets, a shared URL) without fighting the drag.
  useEffect(() => {
    if (drag) return;
    const i = months.indexOf(win[0]);
    const j = months.indexOf(win[1]);
    if (i !== -1 && j !== -1) setRange([i, j]);
  }, [win, months, drag]);

  // §6.2: debounce the drag at 120ms before recomputing dependents.
  const timer = useRef();
  const commit = useCallback(
    (next) => {
      // Immediate: the readouts that are just an array lookup.
      onPreview?.([months[next[0]], months[next[1]]]);
      // Debounced: everything that recomputes.
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onChange([months[next[0]], months[next[1]]]);
      }, DEBOUNCE_MS);
    },
    [months, onChange, onPreview],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  /**
   * Fixed 2.8M–4.0M band rather than fitted to the data, so the slope means the
   * same thing across exports; widened only if an export falls outside it.
   */
  const [yMin, yMax] = useMemo(() => {
    const lo = Math.min(2.8e6, Math.min(...series));
    const hi = Math.max(4.0e6, Math.max(...series));
    return [lo, hi];
  }, [series]);

  const yTicks = useMemo(() => {
    const ticks = [];
    for (let v = Math.ceil(yMin / 2e5) * 2e5; v <= yMax; v += 2e5) ticks.push(v);
    return ticks;
  }, [yMin, yMax]);

  const x = scaleLinear().domain([0, months.length - 1]).range([M.left, W - M.right]);
  const y = scaleLinear().domain([yMin, yMax]).range([H - M.bottom, M.top]);

  const indexFromClientX = (clientX) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(months.length - 1, Math.round(x.invert(px))));
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e) => {
      const i = indexFromClientX(e.clientX);
      setRange((prev) => {
        // Never let the handles cross; keep at least one month selected.
        const next =
          drag === 'start' ? [Math.min(i, prev[1]), prev[1]] : [prev[0], Math.max(i, prev[0])];
        commit(next);
        return next;
      });
    };
    const onUp = () => {
      setDrag(null);
      onPreview?.(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, commit, onPreview]);

  const nudge = (which, delta) => {
    setRange((prev) => {
      const next =
        which === 'start'
          ? [Math.max(0, Math.min(prev[0] + delta, prev[1])), prev[1]]
          : [prev[0], Math.min(months.length - 1, Math.max(prev[1] + delta, prev[0]))];
      commit(next);
      return next;
    });
  };

  const [i0, i1] = range;

  /*
     Where the two handle labels sit: over their handles, but pushed apart
     around their midpoint when the handles are close enough to collide, and
     kept inside the plot.
  */
  const labelX = (() => {
    const lo = M.left + LABEL_W / 2;
    const hi = W - M.right - LABEL_W / 2;
    let a = x(i0);
    let b = x(i1);
    if (b - a < LABEL_W) {
      const mid = (a + b) / 2;
      a = mid - LABEL_W / 2;
      b = mid + LABEL_W / 2;
    }
    b = Math.min(hi, Math.max(lo + LABEL_W, b));
    a = Math.max(lo, Math.min(a, b - LABEL_W));
    return { start: a, end: b };
  })();
  const yearTicks = months
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.endsWith('-01'));

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>
            Map period: {fmtMonthBody(months[i0])} – {fmtMonthBody(months[i1])}
          </div>
          {/* §6.2: instruction text, always visible. */}
          <div className={styles.instruction}>
            Drag either handle. The map and charts below follow this window.
          </div>
        </div>
        <div className={styles.presets} role="group" aria-label="Preset periods">
          {presets.map((p) => {
            const [a, b] = p.resolve(months);
            const active = a === i0 && b === i1;
            return (
              <button
                key={p.label}
                type="button"
                className={cx(styles.preset, active && styles.presetOn)}
                aria-pressed={active}
                onClick={() => {
                  setRange([a, b]);
                  onPreview?.(null);
                  onChange([months[a], months[b]]);
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={slotRef} className={styles.slot}>
        <svg ref={svgRef} className={styles.svg} viewBox={`0 0 ${W} ${H}`} style={{ height: H }}>
          {/* Only the whole and half millions are labelled; the 200k gridlines
              stay bare so a short chart does not turn into a wall of numbers. */}
          <YGrid
            ticks={yTicks}
            y={y}
            x1={M.left}
            x2={W - M.right}
            format={(v) => (v % 1e6 === 0 || v % 1e6 === 5e5 ? fmtMillions(v) : null)}
            gap={4}
            lineClassName={styles.gridline}
            labelClassName={styles.axis}
          />

          {yearTicks.map(({ m, i }) => (
            <text key={m} x={x(i)} y={H - 5} textAnchor="middle" className={styles.axis}>
              {m.slice(0, 4)}
            </text>
          ))}

          {/* Selected window: lifted band, gold line inside, faded cream outside. */}
          <rect
            x={x(i0)}
            y={M.top}
            width={Math.max(1, x(i1) - x(i0))}
            height={H - M.top - M.bottom}
            className={styles.band}
          />
          <path d={linePath(series, x, y)} className={styles.line} />
          <path d={linePath(series, x, y, i0, i1)} className={styles.lineIn} />

          {([['start', i0], ['end', i1]]).map(([which, i]) => (
            <g key={which}>
              <line x1={x(i)} x2={x(i)} y1={M.top} y2={H - M.bottom} className={styles.handle} />
              {/* The grip: a pill on the line, so it reads as something to drag. */}
              <rect
                x={x(i) - 4}
                y={(M.top + H - M.bottom) / 2 - 11}
                width={8}
                height={22}
                rx={3}
                className={styles.grip}
              />
              {/* 24px hit area (§6.2), keyboard-reachable, one month per arrow press. */}
              <rect
                x={x(i) - HIT / 2}
                y={M.top}
                width={HIT}
                height={H - M.top - M.bottom}
                className={styles.handleHit}
                tabIndex={0}
                role="slider"
                aria-label={`${which === 'start' ? 'Window start' : 'Window end'}: ${fmtMonth(months[i])}`}
                aria-valuemin={0}
                aria-valuemax={months.length - 1}
                aria-valuenow={i}
                aria-valuetext={fmtMonth(months[i])}
                onPointerDown={() => setDrag(which)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    nudge(which, -1);
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    nudge(which, 1);
                  }
                }}
              />
              <text
                x={labelX[which]}
                y={M.top - 7}
                textAnchor="middle"
                className={styles.endpointLabel}
              >
                {fmtMonthBody(months[i])}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** §6.2 presets. "Since H.R. 1" is the default. */
export function buildPresets(policyStart) {
  return [
    {
      label: 'Since H.R. 1',
      resolve: (months) => [months.indexOf(policyStart), months.length - 1],
    },
    { label: '6 months', resolve: (months) => [months.length - 7, months.length - 1] },
    { label: '12 months', resolve: (months) => [months.length - 13, months.length - 1] },
    { label: 'All', resolve: (months) => [0, months.length - 1] },
  ];
}
