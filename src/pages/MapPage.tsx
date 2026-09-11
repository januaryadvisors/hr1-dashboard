/**
 * Map page — spec §6. Composition only: every piece is a component from §7 and
 * every number recomputes from the brush window (§6.2).
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { activeGeoid, ALL_INFRA } from '../state/appState';
import {
  countLabelFor,
  defaultLayerFor,
  hasCountBasis,
  INFRA_TYPES,
  layerBasis,
  layerByKey,
  VIEWS,
  viewForLayer,
} from '../config/layers';
import { CountyMap } from '../components/CountyMap';
import { buildLayerStats, CountyTooltip } from '../components/CountyTooltip';
import { CountySearch } from '../components/CountySearch';
import { SegmentedControl } from '../components/SegmentedControl';
import { Section } from '../components/Section';
import { RampLegend } from '../components/RampLegend';
import { BivariateLegend } from '../components/BivariateLegend';
import { RankList, type RankRow } from '../components/RankList';
import { Callout } from '../components/Callout';
import { BrushChart, buildPresets } from '../components/BrushChart';
import { TimelineFeed } from '../components/TimelineFeed';
import { HeadlineStats } from '../components/HeadlineStats';
import { ColumnChart } from '../components/ColumnChart';
import { DumbbellChart } from '../components/DumbbellChart';
import { ScatterChart, type ScatterPoint } from '../components/ScatterChart';
import { ScatterPanel } from '../components/ScatterPanel';
import {
  DEFAULT_AXES,
  gapQuadrantApplies,
  metricById,
  metricsForView,
} from '../config/metrics';
import { InfraGlyph } from '../components/InfraGlyph';
import { downloadSelection } from '../lib/download';
import { loadTimeline, type TimelineContent } from '../data/timeline';
import { buildGeometry } from '../lib/mapGeometry';
import { useCartogramRings, useTransition } from '../lib/useCartogram';
import { buildLayerValues, formatLayerValue, fractionOf } from '../lib/layerValues';
import { fmtDelta, fmtInt, fmtMonthBody, fmtPct, fmtPctDelta } from '../lib/format';
import type { InfraKey, LayerKey, MapStyle, Measure, ViewKey } from '../types';
import chartStyles from '../components/charts.module.css';
import styles from './MapPage.module.css';

/**
 * The three summary cards sit in a 3-up grid, so each renders around 430px wide.
 * Authoring their viewBox near that width keeps the axis type at its intended
 * size instead of shrinking it with the chart.
 */
const SUMMARY_VIEW_WIDTH = 460;

/** The brush now sits in the hero's left column, not across the page. */
const BRUSH_VIEW_WIDTH = 620;

export default function MapPage() {
  const { data, projection, baseRings, statePath, state, dispatch } = useApp();
  const { counties, byGeoid, statewide } = data;
  const months = statewide.meta.months;

  /**
   * Set while a brush handle is being dragged. Only the cheap readouts follow it
   * (eyebrow, hero number, feed highlight) — the map and summary charts stay on
   * the debounced committed window so they do not recompute mid-drag.
   */
  const [preview, setPreview] = useState<[string, string] | null>(null);

  const [timeline, setTimeline] = useState<TimelineContent>({ stats: [], feed: [] });
  useEffect(() => {
    loadTimeline().then(setTimeline);
  }, []);

  const layerDef = layerByKey(state.layer);
  /** Derived, not stored — see the note at the top of state/appState.ts. */
  const view = viewForLayer(state.layer);
  const activeId = activeGeoid(state);
  const activeCounty = activeId ? byGeoid.get(activeId) ?? null : null;

  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);

  /**
   * Switching view resets to that view's first metric. Work is the only view
   * with two, so this is a no-op everywhere else — but it is what keeps `layer`
   * and the derived view from ever disagreeing.
   */
  const setView = (key: ViewKey) =>
    dispatch({ type: 'setLayer', layer: defaultLayerFor(key) });

  // ------------------------------------------------------- window arithmetic
  const windowChange = useMemo(
    () => statewide.enrolled[i1] - statewide.enrolled[i0],
    [statewide.enrolled, i0, i1],
  );

  // What the headline shows: the live drag if there is one, else the committed window.
  const shownWindow = preview ?? state.window;
  const shownChange = useMemo(() => {
    const a = months.indexOf(shownWindow[0]);
    const b = months.indexOf(shownWindow[1]);
    return a >= 0 && b >= 0 ? statewide.enrolled[b] - statewide.enrolled[a] : windowChange;
  }, [months, shownWindow, statewide.enrolled, windowChange]);

  // §6.8 "The decline has not stopped" — month-over-month across the window.
  const changeSlice = useMemo(
    () => ({
      months: months.slice(i0, i1 + 1),
      values: statewide.monthly_change.slice(i0, i1 + 1),
    }),
    [months, statewide.monthly_change, i0, i1],
  );

  // §6.8 "Who is falling off" — age bands, recomputed against the window by
  // scaling the published policy-window change to the window's share of it.
  const ageRows = useMemo(() => {
    const fullSpan = statewide.enrolled[months.length - 1] -
      statewide.enrolled[months.indexOf(statewide.meta.policy_start)];
    const share = fullSpan === 0 ? 0 : windowChange / fullSpan;
    return statewide.age_bands.map((b) => {
      const change = b.july_enrolled * b.pct_change * share;
      return {
        label: b.band,
        from: b.july_enrolled,
        to: b.july_enrolled + change,
        pctChange: b.pct_change * share,
      };
    });
  }, [statewide, months, windowChange]);

  // §6.8 "Where need meets capacity".
  // ------------------------------------------------- scatter axes and focus
  /**
   * The scatter's own focus, deliberately NOT the global `hovered`.
   *
   * Its readout is the panel beside the chart rather than the floating tooltip,
   * so sharing state with the map would pop a tooltip over a chart that is
   * already explaining itself.
   */
  const [scatterFocus, setScatterFocus] = useState<string | null>(null);

  const metricOptions = useMemo(() => metricsForView(view.key), [view.key]);

  /**
   * Axis choices. Reset to the view's defaults when the view changes, and
   * coerced back into range if the new view does not offer the current pick —
   * the Children view has metrics the Vulnerability view does not.
   */
  const [axes, setAxes] = useState(() => DEFAULT_AXES[view.key]);
  useEffect(() => {
    setAxes(DEFAULT_AXES[view.key]);
    setScatterFocus(null);
  }, [view.key]);

  const inOptions = (id: string, fallback: string) =>
    metricOptions.some((m) => m.id === id) ? id : fallback;
  const xMetric = metricById(inOptions(axes.x, DEFAULT_AXES[view.key].x));
  const yMetric = metricById(inOptions(axes.y, DEFAULT_AXES[view.key].y));
  const setXMetricId = (id: string) => setAxes((a) => ({ ...a, x: id }));
  const setYMetricId = (id: string) => setAxes((a) => ({ ...a, y: id }));

  const metricCtx = useMemo(() => ({ i0, i1 }), [i0, i1]);

  const scatterPoints = useMemo<ScatterPoint[]>(
    () =>
      counties
        .map((c) => {
          const x = xMetric.value(c, metricCtx);
          const y = yMetric.value(c, metricCtx);
          return x == null || y == null
            ? null
            : { geoid: c.geoid, name: c.name, x, y, weight: c.pop };
        })
        .filter((p): p is ScatterPoint => p !== null),
    [counties, xMetric, yMetric, metricCtx],
  );

  /**
   * Counties in the tinted corner: above the median on x, below it on y.
   *
   * null when the axis pair cannot support that reading — see
   * gapQuadrantApplies(). The caller then hides the tint too, rather than
   * colouring a corner that asserts something the axes do not say.
   */
  const gapQuadrantCount = useMemo(() => {
    if (!gapQuadrantApplies(xMetric, yMetric) || !scatterPoints.length) return null;
    const med = (vals: number[]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const mx = med(scatterPoints.map((p) => p.x));
    const my = med(scatterPoints.map((p) => p.y));
    return scatterPoints.filter((p) => p.x >= mx && p.y <= my).length;
  }, [scatterPoints, xMetric, yMetric]);

  /**
   * The numbers behind the hero map. Rebuilt when the layer or the window moves,
   * because the two loss layers are windowed — see src/lib/layerValues.ts.
   */
  const layerValues = useMemo(
    () => buildLayerValues(counties, state.layer, i0, i1),
    [counties, state.layer, i0, i1],
  );

  /**
   * One value set per view thumbnail, keyed by the layer the card previews.
   * Built here rather than inside each card so the strip and the hero map share
   * a computation when they are showing the same layer.
   */
  const thumbValues = useMemo(() => {
    const out = new Map<LayerKey, ReturnType<typeof buildLayerValues>>();
    for (const v of VIEWS) {
      const key = v.metrics[0];
      out.set(key, key === state.layer ? layerValues : buildLayerValues(counties, key, i0, i1));
    }
    return out;
  }, [counties, i0, i1, state.layer, layerValues]);

  /**
   * M-09 "Highest on this view" — ten rows, within-metric only.
   *
   * Was six per §7. Raised on client direction 2026-09-11; the F9 concern the
   * six was protecting (no 1-to-254 ranking) still holds, and <RankList> keeps
   * the ceiling.
   */
  const rankRows = useMemo<RankRow[]>(
    () =>
      counties
        .map((c) => ({ c, v: layerValues.fill.get(c.geoid) ?? null }))
        .filter((r): r is { c: typeof counties[number]; v: number } => r.v != null)
        .sort((a, b) => b.v - a.v)
        .slice(0, 10)
        .map(({ c, v }) => ({
          geoid: c.geoid,
          name: c.name,
          fraction: fractionOf(state.layer, v, layerValues),
          value: formatLayerValue(state.layer, v),
        })),
    [counties, layerValues, state.layer],
  );

  /**
   * Cartogram weighting: people who left SNAP over the active window.
   *
   * Area on a cartogram encodes a quantity, so this is a count, not a
   * percentile — it answers "where did the losses land" rather than restating
   * where Texans live. Swap the expression to change the basis: `c.snap_enrolled[i1]`
   * for current caseload, or the drop as a share of caseload for a rate reading.
   */
  const cartogramWeights = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of counties) {
      const drop = c.snap_enrolled[i0] - c.snap_enrolled[i1];
      // A county that grew contributes nothing to a map of losses, but still has
      // to be drawn, so it floors at a sliver rather than zero.
      out.set(c.geoid, Math.max(drop, 1));
    }
    return out;
  }, [counties, i0, i1]);

  const isCartogram = state.style === 'grid';
  // Skipped entirely unless the cartogram is on screen — it is the one
  // genuinely expensive computation on the page.
  const cartRings = useCartogramRings(baseRings, cartogramWeights, isCartogram);
  const t = useTransition(isCartogram);

  /**
   * One geometry for all six panels. Rebuilt per animation frame while the
   * transition runs, which is affordable because the interpolation is a
   * vertex-wise lerp over a simplified topology.
   */
  const geometry = useMemo(
    () => buildGeometry(baseRings, cartRings, t, statePath),
    [baseRings, cartRings, t, statePath],
  );

  // Medians and within-layer ranks for the tooltip's domain rows.
  const layerStats = useMemo(() => buildLayerStats(counties), [counties]);

  const infraCounts = useMemo(
    () =>
      Object.fromEntries(
        ALL_INFRA.map((k) => [k, counties.filter((c) => c.infra[k] > 0).length]),
      ) as Record<InfraKey, number>,
    [counties],
  );

  // C-03: count measure with no count basis replaces the map, and the toggle is
  // NOT greyed out.
  const hasCount = hasCountBasis(state.layer);
  const noCount = state.measure === 'count' && !hasCount;

  /** Capacity is a reading of the index, so its marks draw on one view only. */
  const showCapacity = view.showCapacity;

  /**
   * One headline figure per view card, from the 2026-09-11 comps.
   *
   * Each is the honest summary of its own view rather than a single shared
   * metric: the index has no count so it reports an average and a tail, the two
   * loss views report a median county and a statewide rate, and the work view
   * reports people. A card that says "−9.4%" next to a card that says "312k" is
   * not inconsistent — they are different measures, which is the point of
   * having four views.
   */
  const viewStats = useMemo(() => {
    const out = new Map<ViewKey, { value: string; note: string }>();

    const composites = counties.map((c) => c.vulnerability_score).filter(Number.isFinite);
    const avg = composites.reduce((a, b) => a + b, 0) / (composites.length || 1);
    const q5Cut = [...composites].sort((a, b) => a - b)[Math.floor(composites.length * 0.8)] ?? 0;
    out.set('vulnerability', {
      value: avg.toFixed(1),
      note: `avg · ${composites.filter((v) => v >= q5Cut).length} in top quintile`,
    });

    /** Median COUNTY loss, not the statewide rate — the typical county. */
    const medianLoss = (series: (c: typeof counties[number]) => number[] | undefined) => {
      const pcts = counties
        .map((c) => {
          const m = series(c);
          const start = m?.[i0];
          const end = m?.[i1];
          return typeof start === 'number' && typeof end === 'number' && start > 0
            ? (end - start) / start
            : null;
        })
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      return pcts.length ? pcts[Math.floor(pcts.length / 2)] : null;
    };

    out.set('loss', {
      value: fmtPctDelta(medianLoss((c) => c.snap_enrolled), 1),
      note: 'median county',
    });

    const childStart = counties.reduce((sum, c) => sum + (c.snap_children?.[i0] ?? 0), 0);
    const childEnd = counties.reduce((sum, c) => sum + (c.snap_children?.[i1] ?? 0), 0);
    out.set('children', {
      value: childStart > 0 ? fmtPctDelta((childEnd - childStart) / childStart, 1) : '—',
      note: 'statewide',
    });

    const subject = counties.reduce((sum, c) => sum + (c.newly_subject_persons ?? 0), 0);
    out.set('work', {
      value: subject >= 1000 ? `${Math.round(subject / 1000)}k` : fmtInt(subject),
      note: 'newly subject',
    });

    return out;
  }, [counties, i0, i1]);

  /**
   * Three layers, three units, so the ramp legend cannot keep saying p0→p100.
   *
   * On a loss layer the ends are read off the bands the values actually carry,
   * which move with the window — so the reader always sees the real percentages
   * behind the shading rather than a fixed scale the data has outgrown.
   */
  const isWindowLayer = layerBasis(state.layer) === 'window';
  /** The bivariate layer needs the matrix key, not a ramp bar. */
  const bivariateAxes = layerBasis(state.layer) === 'bivariate' ? layerDef.axes : undefined;

  const rampEnds: [string, string] = isWindowLayer
    ? ['0%', `${fmtPct(layerValues.bins[layerValues.bins.length - 2], 0)}+`]
    : state.layer === 'composite'
      ? ['0.8', '3.4']
      : ['p0', 'p100'];

  const rateLegendLabel = isWindowLayer
    ? 'Share of caseload lost'
    : state.layer === 'composite'
      ? 'Vulnerability index, 0–4'
      : undefined;

  const mapProps = {
    counties,
    byGeoid,
    geometry,
    grid: statewide.meta.grid,
    viewBox: projection.viewBox,
    measure: state.measure,
  };

  return (
    <div className={styles.root}>
      {/*
        ---------------------------------------------------------------- M-01
        The green band, full-bleed to the viewport edges — 2026-09-11 comps.
        It holds the headline number, the copy, the brush, and §6.3's three
        statewide facts. Everything below it sits on the Feeding Texas tan.

        It is a sibling of .page rather than a child, because a child could not
        bleed past .page's max-width and gutters without negative-margin tricks
        that break inside its grid.
      */}
      <section className={styles.heroBand}>
        <div className={styles.heroInner}>
        <div className={styles.heroMain}>
        {/* The window used to be restated in an eyebrow above the number.
            Removed 2026-09-11: the hero phrase already names the start month and
            the brush labels both handles, so it was the third copy of the same
            fact. */}
        <div className={styles.heroNumberRow}>
          <span className={`${styles.heroNumber} tabular`}>{fmtDelta(shownChange)}</span>
          <span className={styles.heroPhrase}>
            fewer Texans on SNAP than {fmtMonthBody(shownWindow[0])}
          </span>
        </div>

        {/* §6.1 requires real copy, not lorem. Kept short on client direction —
            the audience already knows the situation.

            Download sits alongside it rather than under the brush: it is the one
            thing on this page a reader might come for and leave with, and it was
            previously the last element before the fold. */}
        <div className={styles.heroBodyRow}>
          <p className={styles.heroBody}>
            Losses began three months after signing, broke sharply in November, and have run
            50,000–80,000 a month since. This is observed enrollment change, not a modelled
            estimate of who H.R. 1 affected.
          </p>
          <button
            type="button"
            className={styles.download}
            onClick={() => downloadSelection(data, state)}
          >
            Download data
          </button>
        </div>

        {/* ---------------------------------------------------------- M-02 */}
        <BrushChart
          months={months}
          series={statewide.enrolled}
          window={state.window}
          presets={buildPresets(statewide.meta.policy_start)}
          onChange={(w) => dispatch({ type: 'setWindow', window: w })}
          onPreview={setPreview}
          viewWidth={BRUSH_VIEW_WIDTH}
          height={116}
        />
        </div>

        {/*
          §6.3's three statewide facts, back in the green band.

          They went to the sticky rail for one round to keep them fixed; the
          client's call is that being in the band matters more. A sticky element
          is bounded by its containing block, so inside a band that scrolls away
          they scroll away with it — that is the trade.
        */}
        <div className={styles.heroStats}>
          <HeadlineStats stats={timeline.stats} />
        </div>
        </div>
      </section>

      <div className={styles.page}>
      {/*
        Left column: everything the reader acts on. The page-level rail beside
        it is the only thing outside it.
      */}
      <div className={styles.mainCol}>

      {/* ------------------------------------------------- M-04 + M-05 */}
      <Section title="Where the need is">
      <div className={styles.mapColumn}>
        {/* M-04, reworked 2026-09-10: four views, not six layer cards. */}
        <section className={styles.layerStrip} aria-label="Map views">
        {VIEWS.map((v) => {
          const previewLayer = v.metrics[0];
          const active = v.key === view.key;
          const values = thumbValues.get(previewLayer);
          return (
            <button
              key={v.key}
              type="button"
              className={`${styles.layerCard} ${active ? styles.layerCardActive : ''}`}
              title={layerByKey(previewLayer).formalName}
              aria-pressed={active}
              onClick={() => setView(v.key)}
            >
              <span className={styles.layerCardText}>
                <span className={styles.layerCardTitle}>{v.label}</span>
                <span className={styles.layerCardBlurb}>{v.blurb}</span>
                {/* Headline figure, per the comps. */}
                {(() => {
                  const stat = viewStats.get(v.key);
                  if (!stat) return null;
                  return (
                    <span className={styles.layerCardStat}>
                      <span className={`${styles.layerCardStatValue} tabular`}>{stat.value}</span>
                      <span className={styles.layerCardStatNote}>{stat.note}</span>
                    </span>
                  );
                })()}
              </span>
              {/* Live thumbnail, same projection and measure as the hero map, so
                  the strip is a legend for the whole page (§6.4).

                  In count measure a layer with no count basis has nothing to
                  size symbols by, and rendering it would produce a blank card
                  that reads as "no exposure" rather than "no denominator". Per
                  C-03 we name the reason instead of inventing one. */}
              {state.measure === 'count' && !hasCountBasis(previewLayer) ? (
                <span className={styles.layerCardNote}>No count basis</span>
              ) : values ? (
                <CountyMap
                  {...mapProps}
                  layer={previewLayer}
                  values={values}
                  style={state.style}
                  size="thumb"
                  hovered={state.hovered}
                  title={`${v.label} thumbnail`}
                />
              ) : null}
            </button>
          );
        })}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{layerDef.formalName}</h2>
              {/* Most views have no copy any more — see LayerDef.copy. */}
              {layerDef.copy && <p className={styles.panelCopy}>{layerDef.copy}</p>}
              {/* The key sits under the title rather than off on the right:
                  it is the first thing needed to read the map, and in the
                  controls cluster it was competing with two toggles. */}
              <div className={styles.panelLegend}>
                {bivariateAxes ? (
                  <BivariateLegend axes={bivariateAxes} />
                ) : (
                  <RampLegend
                    layer={state.layer}
                    mode={state.measure === 'count' && hasCount ? 'count' : 'rate'}
                    maxCount={layerValues.maxCount}
                    label={
                      state.measure === 'count' && hasCount
                        ? countLabelFor(state.layer)
                        : rateLegendLabel
                    }
                    loLabel={rampEnds[0]}
                    hiLabel={rampEnds[1]}
                  />
                )}
              </div>
            </div>
            <div className={styles.panelControls}>
              <div className={styles.controlRow}>
                {/*
                  Views with two metrics get a toggle here rather than two strip
                  cards. Only Work has one today; the control is absent, not
                  greyed out, on the single-metric views — an inert toggle would
                  read as something the reader had failed to find a use for.
                */}
                {view.metrics.length > 1 && (
                  <SegmentedControl
                    label="Metric"
                    size="sm"
                    options={view.metrics.map((key) => {
                      const l = layerByKey(key);
                      return { value: key, label: l.label, title: l.formalName };
                    })}
                    value={state.layer}
                    onChange={(v) => dispatch({ type: 'setLayer', layer: v as LayerKey })}
                  />
                )}
                <SegmentedControl
                  label="Render style"
                  size="sm"
                  options={[
                    { value: 'geo', label: 'Geo', title: 'True county polygons' },
                    {
                      value: 'grid',
                      label: 'Cartogram',
                      title:
                        'Area encodes people who left SNAP over the selected window, not population',
                    },
                    { value: 'density', label: 'Density', title: 'Centroid bubbles' },
                  ]}
                  value={state.style}
                  onChange={(v) => dispatch({ type: 'setStyle', style: v as MapStyle })}
                />
              </div>
            </div>
          </div>

          <div className={styles.mapBody}>
          <div className={styles.mapHolder}>
            {noCount ? (
              <Callout tone="caution" title="No count basis for this metric">
                {layerDef.noCountReason}
                <br />
                Switch back to <strong>Rate</strong> in the advanced controls, or pick a metric with
                a count: Benefits lost, Children, or Work requirements.
              </Callout>
            ) : (
              <CountyMap
                {...mapProps}
                layer={state.layer}
                values={layerValues}
                style={state.style}
                size="hero"
                interactive
                /* Capacity marks and the gap overlay belong to the index, not to
                   every choropleth — see ViewDef.showCapacity. */
                marks={showCapacity ? state.infra : []}
                overlays={{ q5: state.overlayQ5, gap: showCapacity && state.overlayGap }}
                hovered={state.hovered}
                onHover={(geoid) => dispatch({ type: 'hover', geoid })}
                title={`${layerDef.formalName}, ${state.style} view`}
              />
            )}
          </div>

            {/*
              ONE SIDE PANEL, not a stack of floating cards — 2026-09-11 comps.
              Search, the shortlist with its two overlays, and the advanced
              controls, divided by hairlines inside the map's own card. The
              previous version put three bordered boxes in a column beside the
              map, which read as three unrelated widgets rather than as the
              map's controls.
            */}
            <aside className={styles.sidePanel}>
              <div className={styles.panelBlock}>
                <CountySearch
                  counties={counties}
                  renderValue={(c) =>
                    formatLayerValue(state.layer, layerValues.fill.get(c.geoid) ?? null)
                  }
                  onSelect={(geoid) => dispatch({ type: 'hover', geoid, origin: 'external' })}
                />
              </div>

              {/* --------------------------------------------------------- M-09 */}
              <div className={styles.panelBlock}>
                <div className={styles.blockTitle}>Highest on this view</div>
                <p className={styles.blockNote}>
                  A within-metric shortlist, not a statewide ranking. Switch views and the list
                  changes completely.
                  {bivariateAxes && ' Ranked on the red axis only — a list cannot order two measures at once.'}
                </p>
                <RankList
                  rows={rankRows}
                  activeGeoid={activeId}
                  onHover={(geoid) => dispatch({ type: 'hover', geoid, origin: 'external' })}
                />

                {/*
                  M-08's overlays live with the shortlist rather than in the
                  advanced drawer, on client direction: both of them mark a
                  subset of counties on the map, which is the same job the list
                  is doing in text.
                */}
                <div className={styles.overlayRows}>
                  <div className={styles.switchRow}>
                    <span className={styles.switchLabel}>Highlight top quintile</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={state.overlayQ5}
                      aria-label="Highlight top quintile"
                      className={`${styles.switch} ${state.overlayQ5 ? styles.switchOn : ''}`}
                      onClick={() => dispatch({ type: 'toggleOverlayQ5' })}
                    >
                      <span className={styles.switchKnob} />
                    </button>
                    <span className={styles.switchDef}>
                      Outlines the worst fifth on the metric showing.
                    </span>
                  </div>

                  {/* Hidden, not disabled, off the Vulnerability index:
                      its definition is a vulnerability quintile, so on the
                      other views it is a control for something not on screen. */}
                  {showCapacity && (
                    <div className={styles.switchRow}>
                      <span className={styles.switchLabel}>Gap counties</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={state.overlayGap}
                        aria-label="Gap counties"
                        className={`${styles.switch} ${state.overlayGap ? styles.switchOn : ''}`}
                        onClick={() => dispatch({ type: 'toggleOverlayGap' })}
                      >
                        <span className={styles.switchKnob} />
                      </button>
                      <span className={styles.switchDef}>
                        Top-quintile need with no site and no navigator.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ---------------------------------------------------- advanced */}
              <div className={styles.panelBlock}>
                <div className={styles.blockHeadRow}>
                  <span className={styles.blockTitle}>Advanced</span>
                  <button
                    type="button"
                    className={styles.advancedToggle}
                    aria-expanded={state.advanced}
                    aria-controls="advanced-controls"
                    onClick={() => dispatch({ type: 'toggleAdvanced' })}
                  >
                    {state.advanced ? '\u2212 Hide' : '+ Show'}
                  </button>
                </div>

                {/* Unmounted rather than hidden: the infrastructure list is 254
                    counties of counting per type, and none of it is worth doing
                    for a panel nobody has opened. */}
                {state.advanced && (
                  <div className={styles.advancedBody} id="advanced-controls">
                    {/* ---------------------------------------------- C-02 */}
                    <div className={styles.advancedGroup}>
                      <SegmentedControl
                        label="Measure"
                        size="sm"
                        options={[
                          {
                            value: 'rate',
                            label: 'Rate',
                            title: 'A share or a percentile, coloured as a choropleth',
                          },
                          {
                            value: 'count',
                            label: 'Count',
                            title: 'People, as proportional symbols',
                          },
                        ]}
                        value={state.measure}
                        onChange={(v) => dispatch({ type: 'setMeasure', measure: v as Measure })}
                      />
                    </div>

                    {/*
                      M-07, and ONLY on the view that draws the marks.
                      It used to render on every view with a note explaining it
                      did nothing here; a control that does nothing is worse
                      than a control that is absent.
                    */}
                    {showCapacity && (
                      <div className={styles.advancedGroup}>
                        <div className={styles.blockTitle}>Assistance infrastructure</div>
                        <div className={styles.chips}>
                          {state.infra.length === 0 && (
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)' }}>
                              No types selected
                            </span>
                          )}
                          {state.infra.length === ALL_INFRA.length ? (
                            <span className={styles.chip}>
                              <span style={{ width: 8, height: 8, background: 'var(--ja-navy)' }} />
                              All infrastructure
                              <button
                                type="button"
                                className={styles.chipRemove}
                                aria-label="Clear all infrastructure types"
                                onClick={() => dispatch({ type: 'setInfra', keys: [] })}
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            state.infra.map((k) => (
                              <span key={k} className={styles.chip}>
                                {INFRA_TYPES.find((t) => t.key === k)?.label}
                                <button
                                  type="button"
                                  className={styles.chipRemove}
                                  aria-label={`Remove ${k}`}
                                  onClick={() => dispatch({ type: 'toggleInfra', key: k })}
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          )}
                        </div>

                        <div className={styles.railHeadRow}>
                          <span className={styles.countyCount}>{ALL_INFRA.length} types</span>
                          <button
                            type="button"
                            className={styles.selectAll}
                            onClick={() => dispatch({ type: 'setInfra', keys: [...ALL_INFRA] })}
                          >
                            Select all
                          </button>
                        </div>

                        {INFRA_TYPES.map((t) => (
                          <label key={t.key} className={styles.checkRow}>
                            <input
                              type="checkbox"
                              checked={state.infra.includes(t.key)}
                              onChange={() => dispatch({ type: 'toggleInfra', key: t.key })}
                            />
                            <span>{t.label}</span>
                            <span className={`${styles.countyCount} tabular`}>
                              {infraCounts[t.key]}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className={styles.panelFooter}>
            {/* The band-anchoring and small-denominator notes were removed on
                2026-09-11 — they are going into a methodology page instead.
                The mark key stays, and only where the marks draw. */}
            {showCapacity && (
              <>
                <span className="eyebrow">Marks</span>
                {INFRA_TYPES.map((t) => (
                  <span key={t.key} className={styles.markKey}>
                    <svg width="12" height="12" aria-hidden="true">
                      <InfraGlyph type={t.key} x={6} y={6} size={3.5} legend />
                    </svg>
                    {t.label}
                  </span>
                ))}
              </>
            )}
          </div>
        </section>
      </div>
      </Section>

      {/* --------------------------------------- M-10, split per the comps.
          The scatter is its own full-width section with a side note; the two
          time-series charts pair up underneath it. They were three equal cards
          in a row, which gave the scatter a third of the width it needs and put
          a distribution, a time series and a ranking in one visual sentence. */}
      <Section title="Where need meets capacity" tone="alt">
        <div className={styles.capacityRow}>
          <div className={styles.capacityChart}>
            <ScatterChart
              points={scatterPoints}
              viewWidth={SUMMARY_VIEW_WIDTH}
              height={320}
              hovered={scatterFocus}
              /* Local state, not the global hover: this chart's readout is the
                 panel beside it, and driving global hover would also pop the
                 map's floating tooltip. */
              onHover={setScatterFocus}
              xLabel={`${xMetric.axis} →`}
              yLabel={yMetric.axis}
              quadrantNote={gapQuadrantCount == null ? undefined : `${gapQuadrantCount} counties`}
              showQuadrant={gapQuadrantCount != null}
            />
          </div>

          <div className={styles.capacityPanel}>
            <ScatterPanel
              counties={counties}
              options={metricOptions}
              x={xMetric}
              y={yMetric}
              onChangeX={setXMetricId}
              onChangeY={setYMetricId}
              ctx={metricCtx}
              focus={scatterFocus ? byGeoid.get(scatterFocus) ?? null : null}
              onFocus={setScatterFocus}
              window={state.window}
              childSeries={layerDef.seriesField === 'snap_children'}
            />
          </div>
        </div>
      </Section>

      <Section title="How the decline is moving">
        <div className={styles.movementRow}>
          <div className={chartStyles.card}>
            <h3 className={chartStyles.title}>The decline has not stopped</h3>
            <p className={chartStyles.subhead}>
              Month-over-month change in enrolled individuals across the selected window. Steady
              losses of 50k to 80k every month since November.
            </p>
            <ColumnChart
              months={changeSlice.months}
              values={changeSlice.values}
              annotations={[{ month: '2025-11', label: 'NOV −110k' }]}
              viewWidth={SUMMARY_VIEW_WIDTH}
              height={240}
            />
          </div>

          <div className={chartStyles.card}>
            <h3 className={chartStyles.title}>Who is falling off</h3>
            <p className={chartStyles.subhead}>
              Enrolled individuals by age, {fmtMonthBody(state.window[0])} →{' '}
              {fmtMonthBody(state.window[1])}. Dot at the window start, arrowhead at the window end.
            </p>
            <DumbbellChart rows={ageRows} viewWidth={SUMMARY_VIEW_WIDTH} />
            <p className={chartStyles.footnote}>
              Age-band shares are statewide, not county-level.
            </p>
          </div>
        </div>
      </Section>
      </div>

      {/*
        Page-level rail: the three statewide facts and the policy feed, and
        nothing else. Sticky, so the bulletins stay beside whichever view the
        reader has scrolled to — see .rail in the stylesheet.
      */}
      <aside className={styles.rail}>
        <TimelineFeed content={timeline} window={shownWindow} />
      </aside>
      </div>

      <CountyTooltip
        county={activeCounty}
        layer={state.layer}
        stats={layerStats}
        values={layerValues}
        months={months}
        window={state.window}
        origin={state.hoverOrigin}
      />
    </div>
  );
}
