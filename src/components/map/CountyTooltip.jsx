/**
 * <CountyTooltip> — §7, spec'd in §6.5, redesigned 2026-09-01 to the client's
 * tooltip reference.
 *
 * WHAT SHOWS DEPENDS ON THE VIEW (client direction 2026-09-10). This panel used
 * to render everything on every view — five domain bands, four assistance
 * registries and an enrollment sparkline — regardless of what the reader was
 * looking at. `ViewDef.tooltip` now decides, and the sections are:
 *
 *   head      county, FIPS, population        always
 *   focus     the active layer's own band      score layers only
 *   domains   the other domains, two-up        Vulnerability index only
 *   stats     newly subject / of caseload / change   always
 *   capacity  the four listed registries       Vulnerability index only
 *   chart     caseload line, or exposure bars  per view
 *
 * The domain spread is the Vulnerability index's whole argument — that the four
 * domains disagree (§8 tab 3) — so it stays there and only there.
 *
 * Follows the cursor on hover.
 *
 * Click-to-pin (which froze the panel and added Expand / close controls) was
 * removed on 2026-09-01 to be reworked. The expanded detail block it revealed
 * lives on in git history — restoring it means reinstating `pinned` in the state
 * model and the two controls in this header.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  INFRA_TYPES,
  layerBasis,
  layerByKey,
  SCORE_LAYERS,
  scoreField,
  viewForLayer,
} from '../../config/layers';
import { fmtInt, fmtMonth, fmtPct, fmtPctDelta, fmtPercentile } from '../../lib/format';
import { binIndex, bivariatePalette, BIVARIATE_STEPS } from '../../lib/scales';
import { formatLayerValue } from '../../lib/layerValues';
/**
 * @typedef {import('../../lib/layerValues').LayerValues} LayerValues
 */
import { DomainScale } from '../charts/DomainScale';
import { ExposureBars } from '../charts/ExposureBars';
import { InfraGlyph } from './InfraGlyph';
import { Sparkline } from '../charts/Sparkline';
/**
 * @typedef {import('../../types').County} County
 * @typedef {import('../../types').LayerKey} LayerKey
 */
import styles from './CountyTooltip.module.css';

/**
 * Gap between the cursor and the panel's near corner.
 *
 * 6px, down from 12 on client direction 2026-09-11. Small enough that the panel
 * reads as attached to the pointer rather than floating near it, and still clear
 * of the arrow cursor's own hotspot so it does not sit under the tip.
 */
const OFFSET = 6;
const WIDTH = 340;

/**
 * Median and descending rank per SCORED layer — computed once for the dataset.
 *
 * The two loss layers are absent on purpose: their value moves with the brush,
 * and "40th of 254 on benefits lost" would be a different sentence every time
 * the window changed.
 *
 * @typedef {Object} LayerStats
 * @property {Record<string, number>} median
 * @property {Record<string, Map<string, number>>} rank
 * @property {number} total
 */

export function buildLayerStats(counties) {
  const median = {};
  const rank = {};

  for (const layer of SCORE_LAYERS) {
    const field = scoreField(layer.key);
    const rows = counties
      .map((c) => ({ geoid: c.geoid, v: c[field] }))
      .filter((r) => typeof r.v === 'number');

    const sorted = [...rows].sort((a, b) => a.v - b.v);
    median[layer.key] = sorted.length ? sorted[Math.floor(sorted.length / 2)].v : 0;

    // Rank 1 = highest score = most exposed.
    const byDesc = [...rows].sort((a, b) => b.v - a.v);
    rank[layer.key] = new Map(byDesc.map((r, i) => [r.geoid, i + 1]));
  }

  return { median, rank, total: counties.length };
}

/**
 * @typedef {Object} CountyTooltipProps
 * @property {County | null} county
 * @property {LayerKey} layer
 * @property {LayerStats} stats
 * @property {LayerValues} [values] - The values the map is currently drawing. Passed in so the panel quotes the
 *   same numbers and the same classes as the shapes under the cursor — the
 *   bivariate readout below is meaningless if it re-derives them.
 * @property {string[]} months
 * @property {[string, string]} window
 * @property {'pointer' | 'external'} origin - 'pointer' anchors the panel to the cursor. 'external' (search, rank list)
 *   anchors it beside the county's own shape on the hero map.
 */

export function CountyTooltip({
  county,
  layer,
  stats,
  values,
  months,
  window: win,
  origin,
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [countyAnchor, setCountyAnchor] = useState(null);

  useEffect(() => {
    const onMove = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /**
   * For an external selection, find the county's shape on the hero map and
   * anchor to its right edge. Read from the DOM rather than re-deriving screen
   * coordinates from the projection, because the map is scaled to fit its column
   * and the rendered geometry is the only thing that knows the true scale.
   */
  const geoid = county?.geoid;
  useEffect(() => {
    if (origin !== 'external' || !geoid) {
      setCountyAnchor(null);
      return;
    }
    const el = document.querySelector(`[data-hero-map] [data-geoid="${geoid}"]`);
    if (!el) {
      setCountyAnchor(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setCountyAnchor({ x: r.right, y: r.top + r.height / 2 });
  }, [origin, geoid]);

  const spec = viewForLayer(layer).tooltip;

  const i0 = months.indexOf(win[0]);
  const i1 = months.indexOf(win[1]);

  /**
   * The sparkline follows the layer's own series, so the Children view reads
   * child enrollment rather than showing a total caseload the map is not about.
   */
  const isChildLayer = layerByKey(layer).seriesField === 'snap_children';

  const enrollment = useMemo(() => {
    if (!county || i0 < 0 || i1 < 0) return [];
    const series = isChildLayer ? county.snap_children : county.snap_enrolled;
    return series?.slice(i0, i1 + 1) ?? [];
  }, [county, i0, i1, isChildLayer]);

  if (!county) return null;

  const anchor = countyAnchor ?? pos;

  // Flip at the viewport edge rather than letting the panel clip.
  const flipX = anchor.x + OFFSET + WIDTH > window.innerWidth;
  const left = Math.max(8, flipX ? anchor.x - OFFSET - WIDTH : anchor.x + OFFSET);
  const estHeight = 430;
  const top = Math.max(
    8,
    anchor.y + OFFSET + estHeight > window.innerHeight
      ? Math.min(anchor.y - OFFSET - estHeight, window.innerHeight - estHeight - 8)
      : anchor.y + OFFSET,
  );

  const start = enrollment[0] ?? 0;
  const end = enrollment[enrollment.length - 1] ?? 0;
  const pctChange = start > 0 ? (end - start) / start : null;
  // Share of the county's own caseload that is newly subject to the work
  // requirement. Independent of the active layer.
  const shareOfCaseload = start > 0 ? county.newly_subject_persons / start : null;

  return (
    <div
      className={styles.root}
      style={{ left, top }}
      role="tooltip"
      aria-label={`${county.name} County details`}
    >
      <div className={styles.head}>
        <span>
          <span className={styles.countyName}>{county.name} County</span>
          <span className={styles.fips}>
            FIPS {county.geoid} · {fmtInt(county.pop)} residents
          </span>
        </span>
      </div>

      {/*
        Focused layer in full: every band coloured, caret, median tick.

        Skipped on the loss layers, which have no percentile and no median to
        tick — the window change in the stat row below is their readout, and the
        four domains still show in the grid so the framework is not hidden.
      */}
      {layerBasis(layer) === 'score' &&
        (() => {
        const l = layerByKey(layer);
        const value = county[scoreField(l.key)];
        const num = typeof value === 'number' ? value : null;
        const rank = stats.rank[l.key]?.get(county.geoid);
        const isComposite = l.key === 'composite';
        return (
          <div className={`${styles.domain} ${styles.active}`}>
            <div className={styles.domainHead}>
              <span className={styles.domainLabel}>
                {l.key.toUpperCase()} · {l.label}
              </span>
              {num == null ? (
                <span className={styles.domainUnavailable}>no data</span>
              ) : (
                <span className={`${styles.domainValue} tabular`}>
                  {isComposite ? num.toFixed(2) : fmtPercentile(num)}
                  {rank ? ` · ${ordinal(rank)} of ${stats.total}` : ''}
                </span>
              )}
            </div>
            <DomainScale
              layer={l.key}
              value={num}
              median={stats.median[l.key] ?? 0}
              domain={isComposite ? [0, 4] : [0, 1]}
            />
          </div>
        );
      })()}

      {/* The rest, two-up: only the band each county falls in is coloured.
          Vulnerability index only — see ViewDef.tooltip.domains. */}
      {spec.domains && (
      <div className={styles.otherGrid}>
        {SCORE_LAYERS.filter((l) => l.key !== layer).map((l) => {
          const value = county[scoreField(l.key)];
          const num = typeof value === 'number' ? value : null;
          const rank = stats.rank[l.key]?.get(county.geoid);
          const isComposite = l.key === 'composite';
          return (
            <div key={l.key} className={styles.other}>
              <div className={styles.otherLabel}>{l.label}</div>
              <div className={`${styles.otherValue} tabular`}>
                {num == null
                  ? '—'
                  : `${isComposite ? num.toFixed(2) : fmtPercentile(num)}${
                      rank ? ` · ${ordinal(rank)}` : ''
                    }`}
              </div>
              <DomainScale
                layer={l.key}
                value={num}
                median={stats.median[l.key] ?? 0}
                domain={isComposite ? [0, 4] : [0, 1]}
                variant="compact"
              />
            </div>
          );
        })}
      </div>
      )}

      {/*
        Which cell of the 3x3 this county is in.
        On a two-axis map the reader's first question is "where am I in the
        key", and a single highlighted band per axis answers it in the same
        colours the legend uses.
      */}
      {values?.secondary && layerByKey(layer).axes && (
        <div className={styles.bivariate}>
          <div className={styles.bivariateHead}>On this map</div>
          {(() => {
            const grid = bivariatePalette(BIVARIATE_STEPS);
            const axes = layerByKey(layer).axes;
            const a = values.fill.get(county.geoid) ?? null;
            const b = values.secondary.fill.get(county.geoid) ?? null;
            const rows = [
              {
                axis: axes[0],
                text: formatLayerValue(layer, a),
                bin: binIndex(a, values.bins),
                // Red edge of the matrix: blue held at its low end.
                swatches: grid[0],
              },
              {
                axis: axes[1],
                text: fmtPercentile(b),
                bin: binIndex(b, values.secondary.bins),
                // Blue edge: red held at its low end.
                swatches: grid.map((row) => row[0]),
              },
            ];
            return rows.map((r) => (
              <div key={r.axis.label} className={styles.bivariateRow}>
                <span className={styles.bivariateLabel}>{r.axis.label}</span>
                <span className={`${styles.bivariateValue} tabular`}>{r.text}</span>
                <span className={styles.bivariateBands} aria-hidden="true">
                  {r.swatches.map((c, i) => (
                    <span
                      key={c + i}
                      className={`${styles.bivariateBand} ${
                        i === r.bin ? styles.bivariateBandActive : ''
                      }`}
                      style={{ background: i === r.bin ? c : '#efeded' }}
                    />
                  ))}
                </span>
              </div>
            ));
          })()}
        </div>
      )}

      <div className={styles.stats}>
        <div>
          {/* Always the D1 count basis. It is a fact about the county, not about
              the layer being viewed — reading it off `layer` meant every column
              here showed an em dash on D3, D4 and the composite. */}
          <div className={styles.statLabel}>Newly subject</div>
          <div className={`${styles.statValue} tabular`}>{fmtInt(county.newly_subject_persons)}</div>
        </div>
        <div>
          <div className={styles.statLabel}>Of caseload</div>
          <div className={`${styles.statValue} tabular`}>
            {shareOfCaseload == null ? '—' : fmtPct(shareOfCaseload, 0)}
          </div>
        </div>
        <div>
          <div className={styles.statLabel}>
            {isChildLayer ? 'Children since' : 'Since'} {fmtMonth(win[0])}
          </div>
          <div className={`${styles.statValue} ${styles.negative} tabular`}>
            {pctChange == null ? '—' : fmtPctDelta(pctChange)}
          </div>
        </div>
      </div>

      {/* Capacity is the index view's story — see ViewDef.tooltip.capacity.
          §L7 still applies where it does show: absent registries are stated,
          not omitted. */}
      {spec.capacity && (
        <>
          <div className={styles.resourcesHead}>Listed assistance sites</div>
          <div className={styles.resources}>
            {INFRA_TYPES.map((t) => {
              const count = county.infra[t.key];
              const present = count > 0;
              return (
                <div
                  key={t.key}
                  className={`${styles.resource} ${present ? '' : styles.resourceAbsent}`}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                    <g className={present ? undefined : styles.glyphAbsent}>
                      <InfraGlyph type={t.key} x={6.5} y={6.5} size={3.6} legend />
                    </g>
                  </svg>
                  <span className={styles.resourceLabel}>{t.label}</span>
                  <span className={`${styles.resourceCount} tabular`}>
                    {present ? count : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {spec.chart === 'enrollment' && (
        <>
          <div className={styles.sparkHead}>
            {isChildLayer ? 'Children enrolled' : 'SNAP enrolled'}, {fmtMonth(win[0])} →{' '}
            {fmtMonth(win[1])}
          </div>
          <Sparkline values={enrollment} />
          <div className={styles.foot}>
            <span>{fmtInt(start)}</span>
            <span>{fmtInt(end)}</span>
          </div>
        </>
      )}

      {spec.chart === 'exposure' && (
        <>
          <div className={styles.sparkHead}>
            Who the requirement reaches, {fmtMonth(win[0])} → {fmtMonth(win[1])}
          </div>
          <ExposureBars
            rows={[
              { label: `Caseload, ${fmtMonth(win[0])}`, value: start, tone: 'base' },
              {
                label: 'Newly subject',
                value: county.newly_subject_persons,
                share: shareOfCaseload,
                tone: 'subject',
                modelled: true,
              },
              {
                label: 'Left SNAP since',
                value: Math.max(0, start - end),
                share: start > 0 ? Math.max(0, start - end) / start : null,
                tone: 'left',
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
