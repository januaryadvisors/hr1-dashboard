/**
 * Static figures for the story rail.
 *
 * Every chart here is a picture to read, not a control: no hover, no tabs, no
 * tooltips — the rail sets `pointer-events: none` on them as well. Each one is
 * authored at the rail's content width (W) so its type renders at the size it
 * was written at, and takes its numbers as props: nothing is computed or typed
 * in here, so the copy beside a chart and the chart itself read from the same
 * figures in MapPage.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import { useId } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import styles from './StoryCharts.module.css';

const W = 380;

// ------------------------------------------------------------------- lines

/**
 * @typedef {Object} LineSeries
 * @property {string} key
 * @property {string} label
 * @property {(number | null)[]} values - Parallel to `months`.
 * @property {string} color
 * @property {number} [width]
 * @property {string} [splitColor] - Colour from `splitAt` on, e.g. after the policy began.
 */

/**
 * A line chart with the story's annotations: a shaded period, numbered markers
 * on the line, labelled vertical rules, and an optional note at the line's end.
 *
 * @param {{
 *   months: string[],
 *   series: LineSeries[],
 *   yDomain: [number, number],
 *   yTicks: number[],
 *   yFormat: (v: number) => string,
 *   xTicks: { month: string, label: string }[],
 *   shadeFrom?: string,
 *   splitAt?: string,
 *   markers?: { month: string, n: number }[],
 *   rules?: { month: string, label: string, color?: string, anchor?: 'start' | 'end', ly?: number }[],
 *   endNote?: { text: string, color: string },
 *   endLabels?: boolean,
 *   endDot?: string,
 *   height?: number,
 *   title: string,
 * }} props
 */
export function LineFigure({
  months,
  series,
  yDomain,
  yTicks,
  yFormat,
  xTicks,
  shadeFrom,
  splitAt,
  markers = [],
  rules = [],
  endNote,
  endLabels = false,
  endDot,
  height = 150,
  title,
}) {
  const pad = { top: 16, right: endLabels ? 74 : 14, bottom: 22, left: 36 };
  const x = scaleLinear()
    .domain([0, months.length - 1])
    .range([pad.left, W - pad.right]);
  const y = scaleLinear().domain(yDomain).range([height - pad.bottom, pad.top]);
  const at = (m) => months.indexOf(m);
  const path = (values, from = 0, to = values.length - 1) =>
    line()
      .defined((d) => d[1] != null)
      .x((d) => x(d[0]))
      .y((d) => y(d[1]))(values.map((v, i) => [i, v]).slice(from, to + 1));

  const split = splitAt ? at(splitAt) : -1;
  const last = months.length - 1;

  /*
     End labels, nudged apart. Lines that finish close together (the 18–59 and
     children series end two points apart) would print their labels on top of
     each other; each one is pushed down to clear the one above it.
  */
  const ends = endLabels
    ? series
        .map((s) => ({ s, v: s.values[last], y: y(s.values[last] ?? 0) }))
        .sort((a, b) => a.y - b.y)
        .reduce((acc, e) => {
          const prev = acc[acc.length - 1];
          acc.push({ ...e, ly: prev ? Math.max(e.y, prev.ly + 10) : e.y });
          return acc;
        }, [])
    : [];

  const first = series[0];
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {shadeFrom && at(shadeFrom) >= 0 && (
        <rect
          className={styles.shade}
          x={x(at(shadeFrom))}
          y={pad.top - 6}
          width={W - pad.right - x(at(shadeFrom)) + 4}
          height={height - pad.bottom - pad.top + 6}
        />
      )}

      {yTicks.map((t) => (
        <g key={t}>
          <line className={styles.grid} x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
          <text className={styles.tick} x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
            {yFormat(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) =>
        at(t.month) >= 0 ? (
          <text
            key={t.month}
            className={styles.tick}
            x={x(at(t.month))}
            y={height - 6}
            textAnchor="middle"
          >
            {t.label}
          </text>
        ) : null,
      )}

      {rules.map((r) =>
        at(r.month) >= 0 ? (
          <g key={r.month}>
            <line
              className={styles.rule}
              style={r.color ? { stroke: r.color } : undefined}
              x1={x(at(r.month))}
              x2={x(at(r.month))}
              y1={pad.top - 4}
              y2={height - pad.bottom}
            />
            <text
              className={styles.ruleLabel}
              style={r.color ? { fill: r.color } : undefined}
              x={x(at(r.month)) + (r.anchor === 'end' ? -4 : 4)}
              y={r.ly ?? pad.top + 4}
              textAnchor={r.anchor ?? 'start'}
            >
              {r.label}
            </text>
          </g>
        ) : null,
      )}

      {series.map((s) =>
        split > 0 && s.splitColor ? (
          <g key={s.key}>
            <path d={path(s.values, 0, split)} className={styles.line} style={{ stroke: s.color, strokeWidth: s.width ?? 2 }} />
            <path d={path(s.values, split)} className={styles.line} style={{ stroke: s.splitColor, strokeWidth: s.width ?? 2 }} />
          </g>
        ) : (
          <path key={s.key} d={path(s.values)} className={styles.line} style={{ stroke: s.color, strokeWidth: s.width ?? 2 }} />
        ),
      )}

      {markers.map((m) => {
        const i = at(m.month);
        const v = first.values[i];
        if (i < 0 || v == null) return null;
        return (
          <g key={m.month} transform={`translate(${x(i)},${y(v)})`}>
            <circle className={styles.markerRing} r={7.5} />
            <text className={styles.markerNum} dy="0.34em" textAnchor="middle">
              {m.n}
            </text>
          </g>
        );
      })}

      {endDot && first.values[last] != null && (
        <circle cx={x(last)} cy={y(first.values[last])} r={3} style={{ fill: endDot }} />
      )}

      {endNote && first.values[last] != null && (
        <text
          className={styles.endNote}
          style={{ fill: endNote.color }}
          x={x(last)}
          y={Math.min(height - pad.bottom - 2, y(first.values[last]) + 14)}
          textAnchor="end"
        >
          {endNote.text}
        </text>
      )}

      {ends.map((e) => (
        <text key={e.s.key} className={styles.endLabel} x={W - pad.right + 6} y={e.ly} dy="0.32em">
          <tspan style={{ fill: e.s.color }} className={styles.endLabelName}>
            {e.s.label}
          </tspan>{' '}
          {e.v == null ? '' : Math.round(e.v)}
        </text>
      ))}
    </svg>
  );
}

/** A row of swatches naming each line, for charts with more than one. */
export function LineLegend({ items }) {
  return (
    <div className={styles.legend}>
      {items.map((it) => (
        <span key={it.label} className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- shortfall

/**
 * Monthly totals as columns against a reference level, with the gap below the
 * level hatched: the money that did not arrive.
 *
 * @param {{
 *   labels: string[],
 *   values: number[],
 *   base: number,
 *   baseLabel: string,
 *   tickEvery?: number,
 *   yTicks: number[],
 *   yFormat: (v: number) => string,
 *   height?: number,
 *   title: string,
 * }} props
 */
export function ShortfallFigure({
  labels,
  values,
  base,
  baseLabel,
  tickEvery = 2,
  yTicks,
  yFormat,
  height = 145,
  title,
}) {
  const hatch = useId();
  const pad = { top: 18, right: 8, bottom: 20, left: 40 };
  const x = scaleBand()
    .domain(labels.map((_, i) => i))
    .range([pad.left, W - pad.right])
    .padding(0.18);
  const top = Math.max(base, ...values) * 1.04;
  const y = scaleLinear().domain([0, top]).range([height - pad.bottom, pad.top]);

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      <defs>
        <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" className={styles.hatchGround} />
          <line x1="0" y1="0" x2="0" y2="5" className={styles.hatchLine} />
        </pattern>
      </defs>

      {yTicks.map((t) => (
        <g key={t}>
          <line className={styles.grid} x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
          <text className={styles.tick} x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
            {yFormat(t)}
          </text>
        </g>
      ))}

      {values.map((v, i) => (
        <g key={labels[i]}>
          <rect
            className={styles.bar}
            x={x(i)}
            width={x.bandwidth()}
            y={y(v)}
            height={y(0) - y(v)}
          />
          {v < base && (
            <rect
              fill={`url(#${hatch})`}
              className={styles.gap}
              x={x(i)}
              width={x.bandwidth()}
              y={y(base)}
              height={y(v) - y(base)}
            />
          )}
          {i % tickEvery === 0 && (
            <text className={styles.tick} x={x(i) + x.bandwidth() / 2} y={height - 6} textAnchor="middle">
              {labels[i]}
            </text>
          )}
        </g>
      ))}

      <line className={styles.baseLine} x1={pad.left} x2={W - pad.right} y1={y(base)} y2={y(base)} />
      <text className={styles.baseLabel} x={W - pad.right} y={y(base) - 5} textAnchor="end">
        {baseLabel}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ strips

/**
 * @typedef {Object} StripGroup
 * @property {string} label
 * @property {string} sub - e.g. "47 counties".
 * @property {{ key: string, v: number }[]} points
 * @property {string} color
 */

/**
 * One dot per county along a single axis, a row per county type, with each
 * row's median marked. Dots in a row are spread vertically by a fixed hash of
 * the county, so they do not stack into a line and the spread is the same on
 * every render.
 *
 * @param {{
 *   groups: StripGroup[],
 *   domain: [number, number],
 *   ticks: number[],
 *   format?: (v: number) => string,
 *   medianFormat: (v: number) => string,
 *   axisLabel: string,
 *   height?: number,
 *   title: string,
 * }} props
 */
export function StripFigure({
  groups,
  domain,
  ticks,
  format = (v) => String(v),
  medianFormat,
  axisLabel,
  height = 165,
  title,
}) {
  const pad = { top: 14, right: 10, bottom: 34, left: 76 };
  const x = scaleLinear().domain(domain).range([pad.left, W - pad.right]).clamp(true);
  const rowH = (height - pad.top - pad.bottom) / groups.length;
  const jitter = (key) => {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * rowH * 0.62;
  };
  const median = (pts) => {
    const s = pts.map((p) => p.v).sort((a, b) => a - b);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };

  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {ticks.map((t) => (
        <g key={t}>
          <line className={styles.grid} x1={x(t)} x2={x(t)} y1={pad.top} y2={height - pad.bottom} />
          <text className={styles.tick} x={x(t)} y={height - pad.bottom + 12} textAnchor="middle">
            {format(t)}
          </text>
        </g>
      ))}
      <text className={styles.axisLabel} x={W - pad.right} y={height - 4} textAnchor="end">
        {axisLabel}
      </text>

      {groups.map((g, gi) => {
        const cy = pad.top + rowH * (gi + 0.5);
        const m = median(g.points);
        return (
          <g key={g.label}>
            <text className={styles.rowLabel} x={0} y={cy - 2}>
              {g.label}
            </text>
            <text className={styles.rowSub} x={0} y={cy + 10}>
              {g.sub}
            </text>
            {g.points.map((p) => (
              <circle
                key={p.key}
                className={styles.dot}
                style={{ fill: g.color }}
                cx={x(p.v)}
                cy={cy + jitter(p.key)}
                r={2.6}
              />
            ))}
            <line
              className={styles.medianTick}
              x1={x(m)}
              x2={x(m)}
              y1={cy - rowH * 0.36}
              y2={cy + rowH * 0.36}
            />
            <text className={styles.medianLabel} x={x(m) + 4} y={cy - rowH * 0.36 + 2}>
              median {medianFormat(m)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// --------------------------------------------------------------- bar lists

/**
 * Horizontal bars, one per group, lengths on a shared scale, with the one the
 * copy is about in the accent colour.
 *
 * @param {{ rows: { label: string, value: number, display: string, highlight?: boolean }[] }} props
 */
export function GroupBarsFigure({ rows }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  return (
    <div className={styles.groupBars}>
      {rows.map((r) => (
        <div key={r.label} className={styles.groupRow}>
          <span className={styles.groupLabel}>{r.label}</span>
          <span className={styles.groupTrack}>
            <span
              className={`${styles.groupBar} ${r.highlight ? styles.groupBarOn : ''}`}
              style={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
            />
          </span>
          <span className={`${styles.groupValue} tabular`}>{r.display}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Labelled figures, each with an optional share bar and a note on where and
 * when the number comes from — for figures from different sources and years
 * that should not be drawn on one axis.
 *
 * @param {{ rows: { label: string, display: string, share?: number, note: string }[] }} props
 */
export function StatBarsFigure({ rows }) {
  return (
    <div className={styles.statBars}>
      {rows.map((r) => (
        <div key={r.label} className={styles.statRow}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>{r.label}</span>
            <span className={`${styles.statValue} tabular`}>{r.display}</span>
          </div>
          {r.share != null && (
            <span className={styles.statTrack}>
              <span className={styles.statBar} style={{ width: `${r.share * 100}%` }} />
            </span>
          )}
          <span className={styles.statNote}>{r.note}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Columns by year with the value printed on each, the recent years toned so
 * the change reads before the numbers do.
 *
 * @param {{ rows: { label: string, value: number, display: string, tone?: 'base' | 'warn' | 'alert' }[], height?: number, title: string }} props
 */
export function YearBarsFigure({ rows, height = 130, title }) {
  const pad = { top: 18, right: 6, bottom: 18, left: 6 };
  const x = scaleBand()
    .domain(rows.map((r) => r.label))
    .range([pad.left, W - pad.right])
    .padding(0.22);
  const y = scaleLinear()
    .domain([0, Math.max(...rows.map((r) => r.value)) * 1.08])
    .range([height - pad.bottom, pad.top]);
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
      {rows.map((r) => (
        <g key={r.label}>
          <rect
            className={`${styles.yearBar} ${r.tone === 'warn' ? styles.yearWarn : ''} ${
              r.tone === 'alert' ? styles.yearAlert : ''
            }`}
            x={x(r.label)}
            width={x.bandwidth()}
            y={y(r.value)}
            height={y(0) - y(r.value)}
            rx={2}
          />
          <text className={styles.yearValue} x={x(r.label) + x.bandwidth() / 2} y={y(r.value) - 5} textAnchor="middle">
            {r.display}
          </text>
          <text className={styles.tick} x={x(r.label) + x.bandwidth() / 2} y={height - 5} textAnchor="middle">
            {r.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ recipe

/**
 * How the vulnerability index is put together: each domain and the measures
 * that go into it. Deliberately without figures — this step explains the logic,
 * and the map beside it carries the numbers.
 *
 * @param {{ domains: { name: string, measures: string[] }[], formula?: string }} props
 */
export function IndexRecipe({ domains, formula }) {
  return (
    <div className={styles.recipe}>
      {domains.map((d) => (
        <div key={d.name} className={styles.recipeDomain}>
          <div className={styles.recipeHead}>
            <span className={styles.recipeName}>{d.name}</span>
            <span className={styles.recipeCount}>
              {d.measures.length} {d.measures.length === 1 ? 'measure' : 'measures'}
            </span>
          </div>
          <p className={styles.recipeMeasures}>{d.measures.join(' · ')}</p>
        </div>
      ))}
      {formula && <p className={styles.recipeFormula}>{formula}</p>}
    </div>
  );
}
