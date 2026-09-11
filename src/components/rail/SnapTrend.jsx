/**
 * <SnapTrend> — observed Texas SNAP enrollment, in the page's sticky rail.
 *
 * The rail used to be the policy feed alone. This panel sits above it because
 * the feed answers "what changed on paper" and this answers "what changed in the
 * caseload", and a reader comparing the two wants them on the same screen.
 *
 * ONE LINE AT A TIME — a stacked area was tried on 2026-09-11 and the client's
 * call is a line chart. Each tab is its own series on its own axis: picking
 * Seniors rescales the chart to the 300–400k the senior caseload actually moves
 * in, rather than flattening it against a 3.5M total.
 *
 * The line tweens between series rather than cutting, so it is legible that the
 * axis moved under it — the numbers either side of a hard swap look like a
 * change in the data rather than a change in the question.
 *
 * FORM: the y axis is NOT zero-based. A series that moves between 1.6M and 1.8M
 * is a flat line against zero, so both end labels are drawn and the truncation
 * is stated rather than implied.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtInt, fmtMonthBody } from '../../lib/format';
import styles from './SnapTrend.module.css';

/**
 * @typedef {import('../../data/snap').SnapObserved} SnapObserved
 */

/**
 * The three series on offer, one per tab.
 *
 * The workbooks publish five age bands (<5, 5–17, 18–59, 60–64, 65+). `children`
 * and `seniors` are the exhaustive collapse of the two ends; `individuals` is
 * HHSC's own total, not a sum of the bands — see scripts/fetch-snap-stats.mjs.
 */
const SERIES = [
  { key: 'individuals', tab: 'People', title: 'Texans enrolled in SNAP' },
  { key: 'children', tab: 'Children', title: 'Children enrolled in SNAP' },
  { key: 'seniors', tab: 'Seniors', title: 'Texans 65+ enrolled in SNAP' },
];

/* Authored at the rail's rendered width so the 8px axis type stays 8px. */
const W = 288;
const H = 104;
const PAD = { top: 14, right: 3, bottom: 16, left: 3 };
const TWEEN_MS = 380;

/** A compact axis label: 3.53M, 614K, 379. */
const axisTick = (v) => {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}K`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};

/** Cubic ease-in-out. */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Tween a whole series from whatever is on screen to `target`.
 *
 * Interpolating the VALUES rather than the path `d` means the two series never
 * have to have matching path commands, and the y scale is recomputed from the
 * tweened values every frame — so the axis labels travel with the line instead
 * of snapping to the new range before the line gets there.
 *
 * Degrades to an instant swap where requestAnimationFrame is unavailable.
 */
function useTweenedSeries(target) {
  const [values, setValues] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined' || !target) {
      fromRef.current = target;
      setValues(target);
      return undefined;
    }
    const from =
      fromRef.current && fromRef.current.length === target.length ? fromRef.current : target;
    const start = performance.now();

    const step = (now) => {
      const e = ease(Math.min(1, (now - start) / TWEEN_MS));
      const next = target.map((v, i) => from[i] + (v - from[i]) * e);
      fromRef.current = next;
      setValues(next);
      if (e < 1) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return values;
}

/**
 * @typedef {Object} SnapTrendProps
 * @property {SnapObserved | null} data - null while loading, or when the file has not been fetched yet.
 * @property {string} [policyStart] - "YYYY-MM" of H.R. 1's signing, marked on the axis when the
 *   observed record reaches it.
 */

export function SnapTrend({ data, policyStart }) {
  /** Which series is drawn. One at a time. */
  const [seriesKey, setSeriesKey] = useState(SERIES[0].key);
  /** Index under the pointer; null falls back to the latest month. */
  const [hover, setHover] = useState(null);

  const series = SERIES.find((x) => x.key === seriesKey) ?? SERIES[0];
  const target = data?.statewide?.[series.key] ?? null;
  const values = useTweenedSeries(target);

  const chart = useMemo(() => {
    if (!data || !values || values.length < 2) return null;
    const n = values.length;

    const max = Math.max(...values);
    const min = Math.min(...values);
    // 8% headroom either side, so the line never touches the frame. A flat
    // series would divide by zero, so it gets an arbitrary span and sits mid.
    const span = max - min || Math.abs(max) || 1;
    const lo = min - span * 0.08;
    const hi = max + span * 0.08;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (i / (n - 1)) * innerW;
    const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

    const path = values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(' ');

    // One tick per January, so the axis reads as years without a label per month.
    const years = [];
    data.months.forEach((m, i) => {
      if (i === 0 || m.endsWith('-01')) years.push({ i, label: m.slice(0, 4) });
    });

    return {
      max,
      min,
      x,
      y,
      path,
      years,
      policyIndex: policyStart ? data.months.indexOf(policyStart) : -1,
    };
  }, [data, values, policyStart]);

  if (!data || !chart) {
    return (
      <div className={styles.root}>
        <h3 className={styles.title}>Texans enrolled in SNAP</h3>
        <p className={styles.empty}>
          No observed data loaded. Run <code>npm run fetch:snap</code>.
        </p>
      </div>
    );
  }

  const last = data.months.length - 1;
  const at = hover == null ? last : hover;
  // Read off the published data, not the tween, so the figure is never a
  // half-way number that was never true of any month.
  const value = data.statewide[series.key][at];

  return (
    <div className={styles.root}>
      <div className={styles.tabs} role="group" aria-label="Series">
        {SERIES.map((sx) => (
          <button
            key={sx.key}
            type="button"
            className={`${styles.tab} ${sx.key === seriesKey ? styles.tabOn : ''}`}
            aria-pressed={sx.key === seriesKey}
            title={sx.title}
            onClick={() => setSeriesKey(sx.key)}
          >
            {sx.tab}
          </button>
        ))}
      </div>

      {/* The chart's title. Named for the series showing, so the plot below never
          has to be read together with a legend. */}
      <h3 className={styles.title}>{series.title}</h3>

      {/* The readout is the chart's label: it names the month under the pointer,
          so the line never needs a number printed on every point. */}
      <div className={styles.readout} aria-live="polite">
        <span className={`${styles.value} tabular`}>{fmtInt(value)}</span>
        <span className={styles.valueNote}>{fmtMonthBody(data.months[at])}</span>
      </div>

      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${series.title}, ${fmtMonthBody(data.first)} to ${fmtMonthBody(data.latest)}: ${fmtInt(data.statewide[series.key][0])} to ${fmtInt(data.statewide[series.key][last])}.`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          // The SVG scales to the rail's width, so the pointer has to come back
          // through the viewBox rather than being read in CSS pixels.
          const vx = ((e.clientX - box.left) / box.width) * W;
          const t = (vx - PAD.left) / (W - PAD.left - PAD.right);
          setHover(Math.max(0, Math.min(last, Math.round(t * last))));
        }}
      >
        {/* Scale, stated. Without these two labels the non-zero baseline would be
            an unmarked truncation — and the labels move with the tween, so a tab
            change reads as the axis rescaling rather than the data jumping. */}
        <line
          className={styles.grid}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={chart.y(chart.max)}
          y2={chart.y(chart.max)}
        />
        <line
          className={styles.grid}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={chart.y(chart.min)}
          y2={chart.y(chart.min)}
        />
        <text className={styles.gridLabel} x={PAD.left} y={chart.y(chart.max) - 3}>
          {axisTick(chart.max)}
        </text>
        <text className={styles.gridLabel} x={PAD.left} y={chart.y(chart.min) + 8}>
          {axisTick(chart.min)}
        </text>

        {/* H.R. 1's signing, where the observed record reaches it. */}
        {chart.policyIndex > 0 && (
          <>
            <line
              className={styles.policy}
              x1={chart.x(chart.policyIndex)}
              x2={chart.x(chart.policyIndex)}
              y1={PAD.top - 5}
              y2={H - PAD.bottom}
            />
            <text
              className={styles.policyLabel}
              x={chart.x(chart.policyIndex) - 3}
              y={PAD.top - 7}
              textAnchor="end"
            >
              H.R. 1
            </text>
          </>
        )}

        <path className={styles.line} d={chart.path} />

        {chart.years.map((t) => (
          <text
            key={t.label}
            className={styles.yearLabel}
            x={chart.x(t.i)}
            y={H - 4}
            /* The first tick sits on the plot's left edge, so centring it would
               cut the year in half against the frame. */
            textAnchor={
              chart.x(t.i) < 14 ? 'start' : chart.x(t.i) > W - PAD.right - 14 ? 'end' : 'middle'
            }
          >
            {t.label}
          </text>
        ))}

        {/* Crosshair. Drawn last so it sits over the line. */}
        <line
          className={styles.crosshair}
          x1={chart.x(at)}
          x2={chart.x(at)}
          y1={PAD.top - 5}
          y2={H - PAD.bottom}
        />
        <circle className={styles.dot} cx={chart.x(at)} cy={chart.y(values[at])} r={2.8} />
      </svg>

      <p className={styles.foot}>
        Source:{' '}
        <a href={data.source_url} target="_blank" rel="noreferrer noopener">
          {data.source}
        </a>
      </p>
    </div>
  );
}
