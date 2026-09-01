/**
 * <BrushChart> — §7, spec'd in §6.2.
 *
 * "This is the only time control in the app. There is no separate month slider
 * on the map." Drag either handle; everything below follows this window.
 * Debounced at 120ms; 24px hit areas; arrow keys move one month per press.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtMillions, fmtMonth } from '../lib/format';
import styles from './BrushChart.module.css';

const W = 1000;
const H = 150;
const M = { top: 14, right: 12, bottom: 18, left: 34 };
const DEBOUNCE_MS = 120;
const HIT = 24;

export interface Preset {
  label: string;
  /** Resolve to a [startIndex, endIndex] pair given the series length. */
  resolve: (months: string[]) => [number, number];
}

export interface BrushChartProps {
  months: string[];
  series: number[];
  window: [string, string];
  presets: Preset[];
  onChange: (window: [string, string]) => void;
}

export function BrushChart({ months, series, window: win, presets, onChange }: BrushChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<null | 'start' | 'end'>(null);

  // Local indices so dragging feels immediate; the debounced value is what
  // propagates to the rest of the page.
  const [range, setRange] = useState<[number, number]>(() => [
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
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const commit = useCallback(
    (next: [number, number]) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onChange([months[next[0]], months[next[1]]]);
      }, DEBOUNCE_MS);
    },
    [months, onChange],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  // y-axis 2.9M–3.7M per §6.2, but clamp to the data so a different export
  // cannot silently draw off-panel.
  const [yMin, yMax] = useMemo(() => {
    const lo = Math.min(2.9e6, Math.min(...series));
    const hi = Math.max(3.7e6, Math.max(...series));
    return [lo, hi];
  }, [series]);

  const x = (i: number) => M.left + (i / (months.length - 1)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);

  const pathFor = (from: number, to: number) =>
    series
      .slice(from, to + 1)
      .map((v, k) => `${k === 0 ? 'M' : 'L'}${x(from + k).toFixed(2)} ${y(v).toFixed(2)}`)
      .join('');

  const indexFromClientX = (clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const frac = (px - M.left) / (W - M.left - M.right);
    return Math.max(0, Math.min(months.length - 1, Math.round(frac * (months.length - 1))));
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const i = indexFromClientX(e.clientX);
      setRange((prev) => {
        // Never let the handles cross; keep at least one month selected.
        const next: [number, number] =
          drag === 'start' ? [Math.min(i, prev[1]), prev[1]] : [prev[0], Math.max(i, prev[0])];
        commit(next);
        return next;
      });
    };
    const onUp = () => setDrag(null);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, commit]);

  const nudge = (which: 'start' | 'end', delta: number) => {
    setRange((prev) => {
      const next: [number, number] =
        which === 'start'
          ? [Math.max(0, Math.min(prev[0] + delta, prev[1])), prev[1]]
          : [prev[0], Math.min(months.length - 1, Math.max(prev[1] + delta, prev[0]))];
      commit(next);
      return next;
    });
  };

  const [i0, i1] = range;
  const yearTicks = months
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.endsWith('-01'));

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className="eyebrow">Period on the map</div>
          {/* §6.2: instruction text, always visible. */}
          <div className={styles.instruction}>
            Drag either handle. Everything below follows this window.
          </div>
        </div>
        <div className={styles.presets}>
          {presets.map((p) => {
            const [a, b] = p.resolve(months);
            const active = a === i0 && b === i1;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setRange([a, b]);
                  onChange([months[a], months[b]]);
                }}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  color: active ? '#fff' : 'var(--text-muted)',
                  background: active ? 'var(--ja-navy)' : 'var(--surface)',
                  border: '1px solid var(--hairline-strong)',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <svg ref={svgRef} className={styles.svg} viewBox={`0 0 ${W} ${H}`}>
        {[2.9e6, 3.1e6, 3.3e6, 3.5e6, 3.7e6].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className={styles.gridline} />
            <text x={M.left - 5} y={y(v) + 3} textAnchor="end" className={styles.axis}>
              {fmtMillions(v)}
            </text>
          </g>
        ))}

        {yearTicks.map(({ m, i }) => (
          <text key={m} x={x(i)} y={H - 4} textAnchor="middle" className={styles.axis}>
            {m.slice(0, 4)}
          </text>
        ))}

        {/* Selected window: tinted band, burgundy line inside, muted navy outside. */}
        <rect
          x={x(i0)}
          y={M.top}
          width={Math.max(1, x(i1) - x(i0))}
          height={H - M.top - M.bottom}
          className={styles.band}
        />
        <path d={pathFor(0, months.length - 1)} className={styles.line} />
        <path d={pathFor(i0, i1)} className={styles.lineIn} />

        {([['start', i0], ['end', i1]] as const).map(([which, i]) => (
          <g key={which}>
            <line x1={x(i)} x2={x(i)} y1={M.top} y2={H - M.bottom} className={styles.handle} />
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
              x={Math.min(W - M.right - 40, Math.max(M.left, x(i)))}
              y={M.top - 4}
              textAnchor={which === 'start' ? 'start' : 'end'}
              className={styles.endpointLabel}
            >
              {fmtMonth(months[i])}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** §6.2 presets. "Since H.R. 1" is the default. */
export function buildPresets(policyStart: string): Preset[] {
  return [
    {
      label: 'Since H.R. 1',
      resolve: (months) => [months.indexOf(policyStart), months.length - 1],
    },
    { label: 'Last 6 months', resolve: (months) => [months.length - 7, months.length - 1] },
    { label: 'Last 12 months', resolve: (months) => [months.length - 13, months.length - 1] },
    { label: 'Full history', resolve: (months) => [0, months.length - 1] },
  ];
}
