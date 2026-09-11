/**
 * Map page — spec §6. Composition only: every piece is a component from §7 and
 * every number recomputes from the brush window (§6.2).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { CountyMap } from '../components/map/CountyMap';
import { buildLayerStats, CountyTooltip } from '../components/map/CountyTooltip';
import { CountySearch } from '../components/map/CountySearch';
import { SegmentedControl } from '../components/shell/SegmentedControl';
import { Section } from '../components/shell/Section';
import { RampLegend } from '../components/map/RampLegend';
import { BivariateLegend } from '../components/map/BivariateLegend';
import { RankList } from '../components/map/RankList';
/**
 * @typedef {import('../components/map/RankList').RankRow} RankRow
 */
import { Callout } from '../components/shell/Callout';
import { BrushChart, buildPresets } from '../components/hero/BrushChart';
import { TimelineFeed } from '../components/rail/TimelineFeed';
import { SnapTrend } from '../components/rail/SnapTrend';
import { HeadlineStats } from '../components/hero/HeadlineStats';
import { ColumnChart } from '../components/charts/ColumnChart';
import { DumbbellChart } from '../components/charts/DumbbellChart';
import { ScatterChart } from '../components/charts/ScatterChart';
/**
 * @typedef {import('../components/charts/ScatterChart').ScatterPoint} ScatterPoint
 */
import { ScatterPanel } from '../components/charts/ScatterPanel';
import {
  metricById,
  presetById,
  PRESET_FOR_VIEW,
  SCATTER_PRESETS,
} from '../config/metrics';
import { InfraGlyph } from '../components/map/InfraGlyph';
import { downloadSelection } from '../lib/download';
import { loadTimeline } from '../data/timeline';
import { loadSnapObserved } from '../data/snap';
/**
 * @typedef {import('../data/timeline').TimelineContent} TimelineContent
 */
import { buildGeometry } from '../lib/mapGeometry';
import { useElementSize } from '../lib/useElementSize';
import { buildLayerValues, countBinsFor, formatLayerValue, fractionOf } from '../lib/layerValues';
import { binIndex, binsFor } from '../lib/scales';
import { fmtDelta, fmtInt, fmtMonthBody, fmtPct, fmtPctDelta } from '../lib/format';
/**
 * @typedef {import('../types').InfraKey} InfraKey
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').MapStyle} MapStyle
 * @typedef {import('../types').Measure} Measure
 * @typedef {import('../types').ViewKey} ViewKey
 */
import chartStyles from '../components/charts/charts.module.css';
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
  const [preview, setPreview] = useState(null);

  const [timeline, setTimeline] = useState({ stats: [], feed: [] });
  useEffect(() => {
    loadTimeline().then(setTimeline);
  }, []);

  /**
   * The one observed dataset on the page. Fetched separately from the §3
   * contract files because it is optional: the rail degrades to the policy feed
   * alone rather than the page failing (see src/data/snap.js).
   */
  const [snap, setSnap] = useState(null);
  useEffect(() => {
    loadSnapObserved().then(setSnap);
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
  const setView = (key) =>
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
  const [scatterFocus, setScatterFocus] = useState(null);

  /**
   * The scatter is sized to its slot rather than to a fixed viewBox: the slot's
   * height is set by the panel beside it and its width is fluid, so anything
   * else letterboxes. See src/lib/useElementSize.js.
   */
  const [capacityRef, capacityBox] = useElementSize();

  /**
   * The view strip scrolls, so it needs to know where it is.
   *
   * Buttons hide at each end rather than greying out — a control that cannot do
   * anything is noise beside a card. The 2px tolerance is for sub-pixel widths:
   * a strip scrolled fully right routinely lands a fraction short of its own
   * scrollWidth and would otherwise keep offering a "next" that does nothing.
   */
  const stripRef = useRef(null);
  const [stripNav, setStripNav] = useState({ canPrev: false, canNext: false });

  const updateStripNav = () => {
    const el = stripRef.current;
    if (!el) return;
    setStripNav({
      canPrev: el.scrollLeft > 2,
      canNext: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  };

  useEffect(updateStripNav, [data.hasMedicaid]);

  /** One card plus its gap, in the direction given. */
  const scrollStrip = (dir) => {
    const el = stripRef.current;
    if (!el) return;
    const card = el.querySelector('button');
    const step = card ? card.getBoundingClientRect().width + 8 : el.clientWidth * 0.25;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  /**
   * Which curated pairing the scatter is showing.
   *
   * Follows the map's view by default — switching the map to Children moves the
   * question below it to the children pairing — but the reader can pick any of
   * the four, and picking one sticks until the view changes again.
   */
  const [presetId, setPresetId] = useState(() => PRESET_FOR_VIEW[view.key]);
  useEffect(() => {
    setPresetId(PRESET_FOR_VIEW[view.key]);
    setScatterFocus(null);
  }, [view.key]);

  const preset = presetById(presetId);
  const xMetric = metricById(preset.x);
  const yMetric = metricById(preset.y);

  const metricCtx = useMemo(() => ({ i0, i1 }), [i0, i1]);

  const scatterPoints = useMemo(
    () =>
      counties
        .map((c) => {
          const x = xMetric.value(c, metricCtx);
          const y = yMetric.value(c, metricCtx);
          return x == null || y == null
            ? null
            : { geoid: c.geoid, name: c.name, x, y, weight: c.pop };
        })
        .filter((p) => p !== null),
    [counties, xMetric, yMetric, metricCtx],
  );

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
    const out = new Map();
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
  /**
   * The shortlist RANKS AND READS IN THE MEASURE THE READER PICKED.
   *
   * It ranked on the rate whatever the toggle said, which made the panel
   * disagree with the map beside it: a count map coloured Harris darkest and the
   * list beside it named ten counties of a few thousand people. Those small
   * counties are the honest answer to "largest share lost" and a terrible answer
   * to "most people lost".
   *
   * So in count measure this sorts on the headcount and prints it, which does
   * put the big metros at the top — that is the point of the measure, not a
   * defect in the list. The subhead's "within-metric shortlist" caveat holds
   * either way.
   */
  const rankCounting = state.measure === 'count' && !!layerValues.count;

  const rankRows = useMemo(() => {
    const read = (c) =>
      rankCounting
        ? layerValues.count.get(c.geoid) ?? null
        : layerValues.fill.get(c.geoid) ?? null;

    const bins = rankCounting
      ? countBinsFor(layerValues, state.layer)
      : layerValues.bins ?? binsFor(state.layer);

    return counties
      .map((c) => ({ c, v: read(c) }))
      .filter((r) => r.v != null)
      .sort((a, b) => b.v - a.v)
      .slice(0, 10)
      .map(({ c, v }) => ({
        geoid: c.geoid,
        name: c.name,
        fraction: rankCounting
          ? layerValues.maxCount > 0
            ? v / layerValues.maxCount
            : 0
          : fractionOf(state.layer, v, layerValues),
        value: rankCounting ? fmtInt(v) : formatLayerValue(state.layer, v),
        // For the 'line' glyph: this county's series for the group being
        // mapped, over the active window only. Unchanged by the measure — the
        // shape of a caseload is the same fact either way.
        series: (c[layerDef.seriesField ?? 'snap_enrolled'] ?? []).slice(i0, i1 + 1),
        // For the 'bucket' glyph: the class the county lands in, on the SAME
        // bins the map is using, so the caret and the fill agree.
        bin: bins ? binIndex(v, bins) : 0,
      }));
  }, [counties, layerValues, state.layer, layerDef.seriesField, i0, i1, rankCounting]);

  /**
   * What the shortlist draws beside each county.
   *
   * Enrollment views get a line, because the shortlist is ten counties that all
   * lost heavily and the shape is the thing the value column cannot say. The
   * index and work views get the class steps, because on a percentile all ten
   * are in the top class and a proportional bar would draw ten full bars.
   */
  const rankGlyph = layerBasis(state.layer) === 'score' ? 'bucket' : 'line';
  const rankBins =
    ((rankCounting ? countBinsFor(layerValues, state.layer) : layerValues.bins) ??
      binsFor(state.layer)).length - 1;

  /**
   * One geometry for all six panels — the hero map plus the view thumbnails.
   *
   * This used to be rebuilt per animation frame, because the cartogram morphed
   * into and out of the true map. The cartogram was removed on 2026-09-11, so it
   * is now built once per projection and nothing animates it.
   */
  const geometry = useMemo(
    () => buildGeometry(baseRings, statePath),
    [baseRings, statePath],
  );

  // Medians and within-layer ranks for the tooltip's domain rows.
  const layerStats = useMemo(() => buildLayerStats(counties), [counties]);

  const infraCounts = useMemo(
    () =>
      Object.fromEntries(
        ALL_INFRA.map((k) => [k, counties.filter((c) => c.infra[k] > 0).length]),
      ),
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
  /**
   * One headline figure per view card, in the MEASURE THE READER PICKED.
   *
   * The cards used to be fixed: a median percentage on Benefits lost, a headcount
   * on Work, whatever each view's most quotable number happened to be. That made
   * the Rate/Count toggle look like it only changed the map, when it changes the
   * question — so the strip now answers in the same unit as the map beneath it.
   *
   * Count is a statewide headcount; rate is the MEDIAN COUNTY, not the statewide
   * share. The typical county is the honest rate summary: a statewide percentage
   * is Harris plus Dallas plus Bexar with 250 counties rounding to nothing.
   */
  const viewStats = useMemo(() => {
    const out = new Map();
    const counting = state.measure === 'count';

    const composites = counties.map((c) => c.vulnerability_score).filter(Number.isFinite);
    const avg = composites.reduce((a, b) => a + b, 0) / (composites.length || 1);
    const q5Cut = [...composites].sort((a, b) => a - b)[Math.floor(composites.length * 0.8)] ?? 0;
    const inQ5 = composites.filter((v) => v >= q5Cut).length;
    // The index has no count basis, so it reports the same thing either way —
    // and says which of the two numbers is the countable one.
    out.set('vulnerability', {
      value: counting ? fmtInt(inQ5) : avg.toFixed(1),
      note: counting ? 'counties in the top quintile' : `avg score · ${inQ5} in top quintile`,
    });

    /*
       The window's published endpoints, not its exact ones.

       Mirrors windowLoss() in lib/layerValues.js, and for the same reason: the
       SNAP series is dense so this finds i0 and i1 and stops, but the observed
       Medicaid series ends before the brush does. Reading the exact months would
       make every Medicaid figure an em dash at the default window.
    */
    const endpoints = (m) => {
      if (!m) return null;
      let a = -1;
      let b = -1;
      for (let i = i0; i <= i1; i++) if (typeof m[i] === 'number') { a = i; break; }
      for (let i = i1; i >= i0; i--) if (typeof m[i] === 'number') { b = i; break; }
      return a < 0 || b <= a ? null : [m[a], m[b]];
    };

    /** Median COUNTY loss, not the statewide rate — the typical county. */
    const medianLoss = (series) => {
      const pcts = counties
        .map((c) => {
          const e = endpoints(series(c));
          return e && e[0] > 0 ? (e[1] - e[0]) / e[0] : null;
        })
        .filter((v) => v != null)
        .sort((a, b) => a - b);
      return pcts.length ? pcts[Math.floor(pcts.length / 2)] : null;
    };

    /** People who left across the whole state, on a series. */
    const totalLost = (series) =>
      counties.reduce((sum, c) => {
        const e = endpoints(series(c));
        return sum + (e ? Math.max(0, e[0] - e[1]) : 0);
      }, 0);

    out.set('loss', {
      value: counting
        ? fmtInt(totalLost((c) => c.snap_enrolled))
        : fmtPctDelta(medianLoss((c) => c.snap_enrolled), 1),
      note: counting ? 'people left since Jul 2025' : 'median county',
    });

    /*
       Observed, and on its own window: the Medicaid series ends before the brush
       does, so the figure is the change over the published months the brush
       contains. buildLayerValues resolves the same endpoints for the map.
    */
    out.set('medicaid', {
      value: counting
        ? fmtInt(totalLost((c) => c.medicaid_enrolled))
        : fmtPctDelta(medianLoss((c) => c.medicaid_enrolled), 1),
      note: counting ? 'left Medicaid, published months' : 'median county',
    });

    out.set('children', {
      value: counting
        ? fmtInt(totalLost((c) => c.snap_children))
        : fmtPctDelta(medianLoss((c) => c.snap_children), 1),
      note: counting ? 'children left since Jul 2025' : 'median county',
    });

    const subject = counties.reduce((sum, c) => sum + (c.newly_subject_persons ?? 0), 0);
    const subjectShare = counties
      .map((c) => {
        const start = c.snap_enrolled?.[i0];
        return start > 0 ? (c.newly_subject_persons ?? 0) / start : null;
      })
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    out.set('work', {
      value: counting
        ? fmtInt(subject)
        : fmtPct(subjectShare[Math.floor(subjectShare.length / 2)] ?? 0, 1),
      note: counting ? 'newly subject' : 'of caseload, median county',
    });

    return out;
  }, [counties, i0, i1, state.measure]);

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

  const rampEnds = isWindowLayer
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
        {/* M-04: the view cards, as a scrolling strip with the fifth peeking —
            see .layerStrip. The buttons are for mice without a horizontal wheel;
            each hides itself at the end of its travel. */}
        <div className={styles.layerStripWrap}>
        <button
          type="button"
          className={`${styles.stripNav} ${styles.stripNavPrev}`}
          aria-label="Scroll views left"
          hidden={!stripNav.canPrev}
          onClick={() => scrollStrip(-1)}
        >
          ‹
        </button>
        <section
          className={styles.layerStrip}
          aria-label="Map views"
          ref={stripRef}
          onScroll={updateStripNav}
        >
        {VIEWS.filter((v) => v.key !== 'medicaid' || data.hasMedicaid).map((v) => {
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
        <button
          type="button"
          className={`${styles.stripNav} ${styles.stripNavNext}`}
          aria-label="Scroll views right"
          hidden={!stripNav.canNext}
          onClick={() => scrollStrip(1)}
        >
          ›
        </button>
        </div>

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
                    /* The map's own class edges, so the key cannot drift from it. */
                    bins={countBinsFor(layerValues, state.layer) ?? undefined}
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
                    onChange={(v) => dispatch({ type: 'setLayer', layer: v })}
                  />
                )}
                {/*
                  C-02, moved here from the advanced drawer on 2026-09-11.

                  Rate/Count and the render style are the same kind of decision —
                  both change how the map draws rather than what it is about — so
                  they belong side by side above the map, not one on top of it
                  and one behind a disclosure in the panel beside it.
                */}
                <SegmentedControl
                  label="Measure"
                  size="sm"
                  options={[
                    {
                      value: 'rate',
                      label: 'Rate',
                      title: 'A share or a percentile, coloured as a choropleth',
                    },
                    { value: 'count', label: 'Count', title: 'People, as proportional symbols' },
                  ]}
                  value={state.measure}
                  onChange={(v) => dispatch({ type: 'setMeasure', measure: v })}
                />
                {/* Cartogram removed 2026-09-11 on client direction — two styles,
                    not three. See the note on MapStyle in src/types.js. */}
                <SegmentedControl
                  label="Render style"
                  size="sm"
                  options={[
                    { value: 'geo', label: 'Geo', title: 'True county polygons' },
                    { value: 'density', label: 'Density', title: 'Centroid bubbles' },
                  ]}
                  value={state.style}
                  onChange={(v) => dispatch({ type: 'setStyle', style: v })}
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
                Switch back to <strong>Rate</strong> above the map, or pick a metric with a count:
                Benefits lost, Children, or Work requirements.
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
              Search, the shortlist with its two overlays, and — on the
              Vulnerability index only — the infrastructure picker, divided by
              hairlines inside the map's own card. The previous version put three
              bordered boxes in a column beside the map, which read as three
              unrelated widgets rather than as the map's controls.
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
                  glyph={rankGlyph}
                  bins={rankBins}
                  activeGeoid={activeId}
                  onHover={(geoid) => dispatch({ type: 'hover', geoid, origin: 'external' })}
                />

                {/*
                  M-08's overlays live with the shortlist on client direction:
                  both of them mark a subset of counties on the map, which is the
                  same job the list is doing in text.
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

                    {/*
                      M-07, and ONLY on the view that draws the marks.

                      The "Advanced" disclosure that used to hold this was removed
                      on 2026-09-11: it contained exactly two things, Measure \u2014
                      which is now above the map with the render style \u2014 and this,
                      which already only renders on the Vulnerability index view.
                      A drawer that is empty on three views out of four is not
                      worth the click, and collapsing controls by default hides
                      them from the readers least likely to go looking.

                      So this is the one control still gated on a view, and it is
                      gated on the view rather than on a toggle.
                    */}
                    {showCapacity && (
                      <div className={styles.panelBlock}>
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
          <div className={styles.capacityChart} ref={capacityRef}>
            <ScatterChart
              points={scatterPoints}
              /* Real pixels, so the viewBox is 1:1 with the slot. The floors
                 cover the first paint, before the observer has measured. */
              viewWidth={Math.max(360, Math.round(capacityBox.width) || SUMMARY_VIEW_WIDTH)}
              height={Math.max(260, Math.round(capacityBox.height) || 320)}
              hovered={scatterFocus}
              /* Local state, not the global hover: this chart's readout is the
                 panel beside it, and driving global hover would also pop the
                 map's floating tooltip. */
              onHover={setScatterFocus}
              xLabel={`${xMetric.axis} →`}
              yLabel={yMetric.axis}
              /* All four corners, named by the preset; the chart counts them. */
              quadrants={preset.quadrants}
            />
          </div>

          <div className={styles.capacityPanel}>
            <ScatterPanel
              counties={counties}
              presets={SCATTER_PRESETS}
              preset={preset}
              onChangePreset={setPresetId}
              x={xMetric}
              y={yMetric}
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
        Page-level rail: observed SNAP enrollment, then the policy feed. One
        colour, full-bleed to the right edge — 2026-09-11 direction.

        The pairing is the point: the feed says what changed on paper and the
        chart says what changed in the caseload. Sticky, so both stay beside
        whichever view the reader has scrolled to — see .rail in the stylesheet.
      */}
      <aside className={styles.rail}>
        <SnapTrend data={snap} policyStart={statewide.meta.policy_start} />
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
        measure={state.measure}
        tooltipStats={view.tooltip.stats}
        origin={state.hoverOrigin}
      />
    </div>
  );
}
