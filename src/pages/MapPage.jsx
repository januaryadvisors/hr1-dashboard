/**
 * Map page — spec §6. Composition only: every piece is a component from §7 and
 * every number recomputes from the brush window (§6.2).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { useApp } from '../state/AppContext';
import { activeGeoid, ALL_INFRA } from '../state/appState';
import {
  countLabelFor,
  defaultLayerFor,
  hasCountBasis,
  INFRA_TYPES,
  layerBasis,
  layerByKey,
  viewByKey,
  viewForLayer,
} from '../config/layers';
import { CountyMap } from '../components/map/CountyMap';
import { buildLayerStats, CountyTooltip } from '../components/map/CountyTooltip';
import { CountySearch } from '../components/map/CountySearch';
import { SegmentedControl } from '../components/shell/SegmentedControl';
import { MapOption, MapOptions } from '../components/map/MapOptions';
import { JumpMenu, StoryExits } from '../components/shell/JumpMenu';
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
import { HeadlineStats } from '../components/hero/HeadlineStats';
import { ScatterChart } from '../components/charts/ScatterChart';
import { ChapterNav } from '../components/story/ChapterNav';
import { StoryRail } from '../components/story/StoryRail';
import { StoryProgress } from '../components/story/StoryProgress';
import { StepCaption } from '../components/story/StepCaption';
import { buildStory, INDEX_DOMAINS, resolveChapters } from '../config/story';
import {
  GroupBarsFigure,
  IndexRecipe,
  LineFigure,
  LineLegend,
  ShortfallFigure,
  StripFigure,
  YearBarsFigure,
} from '../components/story/StoryCharts';
import { useScrollSteps } from '../lib/useScrollSteps';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useFitText } from '../lib/useFitText';
/**
 * @typedef {import('../components/charts/ScatterChart').ScatterPoint} ScatterPoint
 */
import { ScatterPanel, ScatterTooltip } from '../components/charts/ScatterPanel';
import {
  metricById,
  presetById,
  PRESET_FOR_VIEW,
  SCATTER_PRESETS,
} from '../config/metrics';
import { INFRA_COLOR, InfraGlyph } from '../components/map/InfraGlyph';
import { INFRA_BAR_ORDER } from '../components/map/InfraBars';
import { downloadSelection } from '../lib/download';
import { loadTimeline } from '../data/timeline';
import { loadSnapObserved } from '../data/snap';
import { loadMarketplace } from '../data/marketplace';
/**
 * @typedef {import('../data/timeline').TimelineContent} TimelineContent
 */
import { buildGeometry } from '../lib/mapGeometry';
import { useElementSize } from '../lib/useElementSize';
import { buildLayerValues, countBinsFor, formatLayerValue, fractionOf } from '../lib/layerValues';
import { benefitShortfall, headlineStats, indexTo } from '../lib/insights';
import { binIndex, binsFor } from '../lib/scales';
import { fmtDelta, fmtInt, fmtMonthBody, fmtMonthFull, fmtPct, fmtPercentile } from '../lib/format';
/**
 * @typedef {import('../types').InfraKey} InfraKey
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').MapStyle} MapStyle
 * @typedef {import('../types').Measure} Measure
 * @typedef {import('../types').ViewKey} ViewKey
 */
import styles from './MapPage.module.css';

/**
 * The scatter's fallback width before its slot has been measured. Authoring a
 * viewBox near the rendered width keeps the axis type at its intended size.
 */
const SUMMARY_VIEW_WIDTH = 460;

/** The brush now sits in the hero's left column, not across the page. */
const BRUSH_VIEW_WIDTH = 620;

/**
 * Where the story pins and scrolls step by step: desktops, tablets, and phones
 * held upright. Outside it (a phone on its side, a very short window) the same
 * rail is a plain accordion under the map. The tablet and phone layouts are in
 * MapPage.module.css under TABLETS, pinned and PHONES, pinned.
 *
 * The height floor matters as much as the width: the pinned stage has to fit
 * the map, its key and the story's own chrome in one viewport, and below these
 * heights the map would be squeezed to a thumbnail.
 */
const STORY_MEDIA =
  '(min-width: 700px) and (min-height: 640px), (max-width: 699px) and (min-height: 560px)';

/**
 * A phone: the map is the whole stage. The rail's timeline becomes a progress
 * bar pinned above it (<StoryProgress>) and the open step a caption below it
 * (<StepCaption>), whose chart and county shortlist open on request.
 */
const PHONE_MEDIA = '(max-width: 699px)';

/** The month Texas's new SNAP rules took effect: the story's second marker. */
const RULES_MONTH = '2025-11';

const COUNTY_TYPES = ['Metro', 'Micro', 'Rural'];

const monthDate = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1));
};
/** "July 2025". */
const monthLong = (m) =>
  monthDate(m).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "Jul". */
const monthShort = (m) => monthDate(m).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
/** "Jul '25". */
const monthTick = (m) => `${monthShort(m)} '${m.slice(2, 4)}`;

/** Share of each county type's child caseload lost over the window (positive = lost). */
function childLossByType(counties, i0, i1) {
  const out = {};
  for (const t of COUNTY_TYPES) {
    const g = counties.filter((c) => c.county_type === t);
    const a = g.reduce((sum, c) => sum + (c.snap_children?.[i0] ?? 0), 0);
    const b = g.reduce((sum, c) => sum + (c.snap_children?.[i1] ?? 0), 0);
    out[t] = a > 0 ? (a - b) / a : null;
  }
  return out;
}

/** Median of a per-county value, by county type. */
function medianByType(counties, read) {
  const out = {};
  for (const t of COUNTY_TYPES) {
    const v = counties
      .filter((c) => c.county_type === t)
      .map(read)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const n = v.length;
    out[t] = n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null;
  }
  return out;
}

/**
 * Experimental: a faint white glow inside the pinned story's edges. false turns
 * it off; see .dreamEdge in MapPage.module.css to remove it outright.
 */
const DREAM_EDGE = true;

/** Anchor for the section after the story — the Jump to menu's last stop. */
const CAPACITY_ID = 'need-meets-capacity';

/**
 * The step a layer opens the story on, so a shared `?layer=d3` link lands on
 * the Access-to-work step rather than being overwritten by chapter one.
 */
function stepForLayer(steps, layer) {
  const exact = steps.findIndex((s) => s.layer === layer);
  if (exact >= 0) return exact;
  const view = viewForLayer(layer).key;
  return Math.max(0, steps.findIndex((s) => s.chapter.view === view));
}

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

  /** Statewide Marketplace enrollment, for the story's last chapter. Optional. */
  const [marketplace, setMarketplace] = useState(null);
  useEffect(() => {
    loadMarketplace().then(setMarketplace);
  }, []);

  const layerDef = layerByKey(state.layer);
  /** The pinned map title shrinks to fit its one-line slot — see useFitText. */
  const titleRef = useRef(null);
  const activeId = activeGeoid(state);
  const activeCounty = activeId ? byGeoid.get(activeId) ?? null : null;

  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);

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

    /** Statewide SNAP benefits paid each month — the counties' sum, for the hero's dollars. */
  const statewidePayments = useMemo(
    () =>
      counties[0]?.snap_payments
        ? months.map((_, i) => counties.reduce((t, c) => t + (c.snap_payments?.[i] ?? 0), 0))
        : null,
    [counties, months],
  );
  /*
     The hero band's three figures, recomputed for the window on screen —
     including mid-drag, like the headline — rather than typed into
     timeline.json. See headlineStats().
  */
  const heroStats = useMemo(() => {
    const a = months.indexOf(shownWindow[0]);
    const b = months.indexOf(shownWindow[1]);
    return a >= 0 && b >= 0 ? headlineStats(statewide, statewidePayments, a, b) : [];
  }, [months, shownWindow, statewide, statewidePayments]);

  // §6.8 "Where need meets capacity".
  // ------------------------------------------------- scatter axes and focus
  /**
   * The scatter's own focus, deliberately NOT the global `hovered`.
   *
   * The scatter has its own tooltip beside the point (<ScatterTooltip>), so
   * sharing state with the map would also pop the map's tooltip over it.
   */
  const [scatterFocus, setScatterFocus] = useState(null);

  /**
   * The scatter is sized to its slot rather than to a fixed viewBox: the slot's
   * height is set by the panel beside it and its width is fluid, so anything
   * else letterboxes. See src/lib/useElementSize.js.
   */
  const [capacityRef, capacityBox] = useElementSize();

  // ------------------------------------------------------------------ story
  /**
   * The homepage story: chapters of steps, one scroll stop per step. See
   * config/story.js for the content and lib/useScrollSteps.js for the mechanics.
   */
  const story = useMemo(() => buildStory(data.hasMedicaid), [data.hasMedicaid]);
  const storyPinned = useMediaQuery(STORY_MEDIA);
  const isPhone = useMediaQuery(PHONE_MEDIA);
  /** The phone layout of the pinned story; see PHONE_MEDIA. */
  const phoneStory = storyPinned && isPhone;
  const storyRef = useRef(null);

  /*
     Read once. A shared link naming a later chapter opens the story there (the
     hook scrolls to it on arrival); after that the scroll position, not the
     layer, picks the step.
  */
  const [initialStep] = useState(() => stepForLayer(story.steps, state.layer));
  const { active: activeStep, goTo, region, scrollToY } = useScrollSteps(storyRef, story.steps.length, {
    enabled: storyPinned,
    initial: initialStep,
  });
  const step = story.steps[Math.min(activeStep, story.steps.length - 1)];
  /**
   * Derived, not stored — see the note at the top of state/appState.js. The
   * open chapter's view wins when it lists the layer: Children also offers the
   * all-people loss layer (its "Children only" switch), and that layer must not
   * flip the chapter to SNAP benefits lost.
   */
  const chapterView = viewByKey(step.chapter.view);
  const view = chapterView.metrics.includes(state.layer) ? chapterView : viewForLayer(state.layer);
  useFitText(titleRef, storyPinned, [layerDef.formalName]);

  /**
   * Each step is a fixed state: arriving at one sets the map to the layer and
   * measure it declares. Inside the step the reader can change either, and it
   * sticks until they scroll to another step.
   *
   * Not applied on first render, so the state a shared link encodes is what the
   * reader sees on arrival.
   */
  const appliedStepRef = useRef(null);
  useEffect(() => {
    if (appliedStepRef.current === step.id) return;
    const first = appliedStepRef.current === null;
    appliedStepRef.current = step.id;
    // Local, not in the URL, so it applies on arrival too.
    setCapacityOn(!!step.capacity);
    if (first) return;

    const layer = step.layer ?? defaultLayerFor(step.chapter.view);
    // An undeclared measure keeps the reader's, unless this layer cannot be
    // counted — a step must never open on the "no count basis" callout.
    const measure =
      step.measure ?? (state.measure === 'count' && !hasCountBasis(layer) ? 'rate' : state.measure);
    if (layer !== state.layer) dispatch({ type: 'setLayer', layer });
    if (measure !== state.measure) dispatch({ type: 'setMeasure', measure });
  }, [step, state.layer, state.measure, dispatch]);

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
   * because the two loss layers are windowed — see src/lib/layerValues.js.
   */
  const layerValues = useMemo(
    () => buildLayerValues(counties, state.layer, i0, i1),
    [counties, state.layer, i0, i1],
  );

  /**
   * One value set per chapter thumbnail, keyed by the layer the card previews.
   * Built here rather than inside each card so the chapter bar and the hero map
   * share a computation when they are showing the same layer.
   */
  const thumbValues = useMemo(() => {
    const out = new Map();
    for (const c of story.chapters) {
      const key = defaultLayerFor(c.view);
      out.set(key, key === state.layer ? layerValues : buildLayerValues(counties, key, i0, i1));
    }
    return out;
  }, [story.chapters, counties, i0, i1, state.layer, layerValues]);

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

    /*
       Rate rankings leave out the smallest caseloads (LayerDef.rankFloor): a
       county of 40 enrollees that loses 20 is "−50%" and would top every list,
       which says more about the denominator than about the county.
    */
    const floor = rankCounting ? 0 : layerDef.rankFloor ?? 0;
    const startOf = (c) => {
      const sr = c[layerDef.seriesField ?? 'snap_enrolled'];
      if (!sr) return 0;
      for (let i = i0; i <= i1; i++) if (typeof sr[i] === 'number') return sr[i];
      return 0;
    };

    return counties
      .filter((c) => !floor || startOf(c) >= floor)
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
  }, [counties, layerValues, state.layer, layerDef, i0, i1, rankCounting]);

  /**
   * How many shortlist rows fit beside the pinned map.
   *
   * The pinned stage is one viewport high, so on a short screen ten rows run past
   * the bottom of the map card. Scrolling the list inside the stage was the
   * first answer and the wrong one: a wheel over the list scrolled the list, not
   * the story, so the reader could get stuck mid-step without knowing why. The
   * list shortens instead — ten rows on a usual laptop, fewer on a short window,
   * never under three. Unpinned it is always the full ten.
   */
  const [sideScrollRef, sideBox] = useElementSize();
  const sideInnerRef = useRef(null);
  const rankWrapRef = useRef(null);
  const [fitRows, setFitRows] = useState(10);
  /** The count before the last change — see the oscillation guard below. */
  const fitPrevRef = useRef(null);

  useLayoutEffect(() => {
    const avail = sideBox.height;
    const content = sideInnerRef.current?.offsetHeight ?? 0;
    const shown = Math.min(fitRows, rankRows.length);
    const rowH = shown ? (rankWrapRef.current?.offsetHeight ?? 0) / shown : 0;
    if (!storyPinned || phoneStory || !avail || !rowH) return;
    /*
       From the panel's FIXED part — everything but the rows — rather than from
       the current count, so the answer does not depend on itself. Stepping from
       the current count could flip between two values forever when rows were
       not exact multiples of rowH (borders, rounding), which crashed the page
       at 800×900 (2026-10-16).
    */
    const fixed = content - shown * rowH;
    // +2px of tolerance: row heights are fractional, and a list 0.4px over its
    // slot read as one row too many, then one too few, forever.
    let next = Math.max(3, Math.min(10, Math.floor((avail - fixed + 2) / rowH)));
    // Belt and braces: if it would go back to the count it just left, settle
    // on the smaller of the two instead of flipping.
    if (next === fitPrevRef.current) next = Math.min(next, fitRows);
    if (next !== fitRows) {
      fitPrevRef.current = fitRows;
      setFitRows(next);
    }
  }, [storyPinned, phoneStory, sideBox.height, fitRows, rankRows.length, state.layer, state.measure]);

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

  /** Registries with no source yet: named in the bars key, never as a zero count. */
  const unsourcedInfra = INFRA_TYPES.filter((t) => !t.available);
  const fbMarksOn = state.infra.includes('food_bank');

  // C-03: count measure with no count basis replaces the map, and the toggle is
  // NOT greyed out.
  const hasCount = hasCountBasis(state.layer);
  const noCount = state.measure === 'count' && !hasCount;

  /** Capacity is a reading of the index, so its marks draw on one view only. */
  const showCapacity = view.showCapacity;
  /**
   * On that view, whether the assistance marks (or the grid's bars) and their
   * key are drawn — the "Index only / Index + assistance" switch. Off on
   * arrival unless the step says otherwise (StoryStep.capacity).
   */
  const [capacityOn, setCapacityOn] = useState(false);
  const capacityShown = showCapacity && capacityOn;

  /**
   * The hero map's render style. The reader's Geo/Density choice everywhere
   * except a story step that declares its own — today only the index's second
   * step, which draws the equal-size tile grid. Read off the step rather than
   * dispatched into state, so the grid never leaks into the URL, the
   * thumbnails, or the next step.
   */
  const drawStyle = storyPinned && step.mapStyle ? step.mapStyle : state.style;

  /**
   * The figures the story's copy quotes, from the data and the brush window —
   * never typed into config/story.js.
   */
  const storyFacts = useMemo(() => {
    const f = {};
    const k = (v) => (Number.isFinite(v) ? fmtInt(Math.round(v / 1000) * 1000) : null);
    const pctOf = (v, digits = 1) => `${(Math.abs(v) * 100).toFixed(digits)}%`;
    const policy = statewide.meta.policy_start;

    f.windowStartLong = monthLong(state.window[0]);
    f.windowEndLong = monthLong(state.window[1]);

    // The statewide net, so it matches the hero number above it exactly.
    const lost = Math.max(0, -windowChange);

    // Age groups over the window, from the monthly band series.
    const band = (b) => statewide.age_series?.[b];
    const drop = (sr) => (sr ? sr[i0] - sr[i1] : 0);
    const childLost = drop(band('Under 5')) + drop(band('5–17'));
    const adultLost = drop(band('18–59'));
    f.childrenK = k(childLost);
    f.adultsK = k(adultLost);
    f.youngShare = lost > 0 ? `${Math.round(((childLost + adultLost) / lost) * 100)}%` : null;

    // Work rules: the count, over the window's starting caseload.
    const subject = counties.reduce((sum, c) => sum + (c.newly_subject_persons ?? 0), 0);
    const enrolledAtStart = statewide.enrolled[i0];
    f.newlySubjectK = k(subject);
    f.oneIn = enrolledAtStart > 0 && subject > 0 ? String(Math.round(enrolledAtStart / subject)) : null;

    // Children by county type, and the index's rural median.
    const byType = childLossByType(counties, i0, i1);
    f.childRural = byType.Rural == null ? null : pctOf(byType.Rural);
    f.childMetro = byType.Metro == null ? null : pctOf(byType.Metro);
    // Which of the two is losing children faster, so the title follows the window.
    if (byType.Rural != null && byType.Metro != null && byType.Rural !== byType.Metro) {
      f.childFaster = byType.Rural > byType.Metro ? 'Rural' : 'Metro';
    }
    const med = medianByType(counties, (c) => c.vulnerability_score);
    f.compRural = med.Rural?.toFixed(2) ?? null;

    /*
       Observed SNAP (optional file). Not windowed: these describe the series
       as published — the pace since the rules took effect, and payments
       against the month H.R. 1 was signed.
    */
    if (snap) {
      const sm = snap.months;
      const ind = snap.statewide.individuals;
      const pay = snap.statewide.payments;
      const last = sm.length - 1;
      const r = sm.indexOf(RULES_MONTH);
      const p0 = sm.indexOf(policy);
      f.snapSourceUrl = snap.source_url;
      f.snapRange = `${fmtMonthBody(sm[0])} – ${fmtMonthBody(sm[last])}`;
      if (r > 0 && last > r) {
        const avg = (ind[r] - ind[last]) / (last - r);
        f.avgMonthlyK = avg > 0 ? k(avg) : null;
        // "It fell every month" and "still falling" are only claimed while true.
        f.fellEveryMonth = ind.slice(r, last + 1).every((v, i, a) => i === 0 || v < a[i - 1])
          ? 'yes'
          : null;
        f.stillFalling = ind[last] < ind[last - 1] ? 'yes' : null;
        f.rulesMonth = monthLong(RULES_MONTH);
      }
      // The hero's arithmetic (benefitShortfall), from the signing, so the two
      // figures are the same number.
      const short = p0 >= 0 && last > p0 ? benefitShortfall(pay, p0, last) : null;
      if (short) {
        f.shortfallM = fmtInt(Math.round(Math.abs(short.total) / 1e6));
        f.shortfallMore = short.total < 0 ? 'yes' : null;
        // With years: the run crosses a year boundary, and keeps lengthening.
        f.shortfallFrom = monthLong(sm[p0 + 1]);
        f.shortfallTo = monthLong(sm[last]);
        f.baseRange = `${fmtMonthBody(sm[short.baseFrom])} – ${fmtMonthBody(sm[p0])}`;
      }
    }

    // Marketplace (optional file).
    if (marketplace) {
      const { months: em, values: ev } = marketplace.effectuated;
      const last = em.length - 1;
      const from = em.indexOf(`${Number(em[last].slice(0, 4)) - 1}-12`);
      f.mktSourceUrl = marketplace.source_url;
      f.oepSourceUrl = marketplace.oep_source_url;
      f.mktRange = `${fmtMonthBody(em[0])} – ${fmtMonthBody(em[last])}`;
      const d = from >= 0 && from < last ? ev[from] - ev[last] : 0;
      if (d > 0) {
        f.mktDrop = fmtInt(d);
        f.mktDropPct = pctOf(d / ev[from]);
        f.mktFrom = monthLong(em[from]);
        f.mktTo = monthLong(em[last]);
      }
      const oep = marketplace.oep.filter((o) => o.not_effectuated_share != null);
      const lo = oep[oep.length - 1];
      if (lo) {
        f.neverLatest = pctOf(lo.not_effectuated_share);
        f.neverOneIn = String(Math.round(1 / lo.not_effectuated_share));
        f.selLatestM = (lo.plan_selections / 1e6).toFixed(2);
        f.oepLatest = String(lo.year);
      }
    }
    return f;
  }, [counties, statewide, i0, i1, state.window, windowChange, snap, marketplace]);

  /** The story with every piece of copy resolved against the facts above. */
  const storyChapters = useMemo(
    () => resolveChapters(story.chapters, storyFacts),
    [story.chapters, storyFacts],
  );
  const stepCopy = storyChapters[step.chapterIndex].steps[step.stepInChapter];

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

  /**
   * Each key swatch's range, for its hover tooltip — from the same edges the map
   * classes counties by, so the key cannot describe a different map.
   */
  const keyCounting = state.measure === 'count' && hasCount;
  const legendRanges = useMemo(() => {
    const edges = keyCounting ? countBinsFor(layerValues, state.layer) : layerValues.bins;
    if (!edges || edges.length < 2) return undefined;
    const fmt = keyCounting
      ? fmtInt
      : isWindowLayer
        ? (v) => fmtPct(v, 0) // whole-percent steps — see equalShareBins
        : state.layer === 'composite'
          ? (v) => v.toFixed(2)
          : fmtPercentile;
    const last = edges.length - 2;
    return edges.slice(0, -1).map((lo, i) =>
      // The top class is open: a count's runs to one outlier county, a loss
      // layer's to 100% — either reads as a claim, so say "or more".
      (keyCounting || isWindowLayer) && i === last
        ? `${fmt(lo)} or more`
        : `${fmt(lo)} – ${fmt(edges[i + 1])}`,
    );
  }, [keyCounting, layerValues, state.layer, isWindowLayer]);

  const rateLegendLabel = isWindowLayer
    ? 'Share of caseload lost'
    : state.layer === 'composite'
      ? 'Vulnerability index, 0–4'
      : undefined;

  /**
   * M-07, the assistance-infrastructure picker — in Map options, on the one view
   * that draws the marks.
   *
   * It left the side panel because in the pinned stage it pushed the shortlist
   * past the bottom of the map, and it left the story rail because the rail
   * holds figures to read, not controls. Map options is where every other
   * setting for how the map draws already lives.
   */
  const infraPicker = (
    <div className={styles.storyInfra}>
        {/* The chips box that used to sit above this repeated the checkboxes
            below it; in the rail's narrow column it cost more room than it
            saved, so Clear sits beside Select all instead. */}
        <div className={styles.railHeadRow}>
          <span className={styles.countyCount}>
            {state.infra.length} of {ALL_INFRA.length} types
          </span>
          <span className={styles.infraActions}>
            <button
              type="button"
              className={styles.selectAll}
              onClick={() => dispatch({ type: 'setInfra', keys: [...ALL_INFRA] })}
            >
              Select all
            </button>
            <button
              type="button"
              className={styles.selectAll}
              onClick={() => dispatch({ type: 'setInfra', keys: [] })}
            >
              Clear
            </button>
          </span>
        </div>

        {INFRA_TYPES.filter((t) => t.available).map((t) => (
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
  );

  // ------------------------------------------------------------ parallax
  /**
   * The green band is the upper plane and scrolls away at full speed, whole and
   * unfaded; the story is the lower plane and moves slower, so the band reads
   * as lifting off the map (2026-10-16).
   *
   * At the top of the page the story starts SHIFT_PX tucked up under the band,
   * and slides out at a constant lag as the band leaves, reaching its true
   * place exactly when the stage pins — so the pinned story is never offset,
   * and there is never a gap of bare page between the two planes. Written
   * straight to a CSS variable, no re-render per scroll frame. Desktop only,
   * and never under reduced motion.
   */
  const heroRef = useRef(null);
  useEffect(() => {
    const band = heroRef.current;
    const story = storyRef.current;
    if (!band || !story) return undefined;
    const SHIFT_PX = 100;
    /*
       The story peeking under the band is dimmed at the top of the page, so the
       hero reads on its own, and lifts as the reader scrolls: gone by
       DIM_CLEAR of the way to the pin. Opacity, not motion, so it runs on
       phones and under reduced motion too.
    */
    const DIM_MAX = 0.75;
    const DIM_CLEAR = 0.6;
    const wide = window.matchMedia('(min-width: 900px)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      // The scroll position at which the stage pins under the header.
      const header =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
      // The story's own top, less the shift already applied to its stage.
      const end = story.getBoundingClientRect().top + window.scrollY - header;
      const t = Math.min(1, Math.max(0, window.scrollY / Math.max(1, end)));
      const dim = DIM_MAX * Math.max(0, 1 - t / DIM_CLEAR);
      story.style.setProperty('--under-dim', dim.toFixed(3));
      if (!wide.matches || still.matches) {
        story.style.setProperty('--under-shift', '0px');
        return;
      }
      // Linear, so the lag is one steady speed — the plane, not an animation.
      const shift = -SHIFT_PX * (1 - t);
      story.style.setProperty('--under-shift', `${shift.toFixed(1)}px`);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // ------------------------------------------------------------- jumping
  /**
   * The ways out of the story: on desktop, floating Back to top and Skip the
   * story buttons (2026-10-19, back from the Jump to menu that replaced them on
   * 2026-10-16); on phones, the Jump to menu in the progress bar, which also
   * moves between chapters. Every jump that leaves the
   * story goes through scrollToY, which settles the step before the trip so
   * the map is not redrawn for every chapter scrolled past on the way.
   */

  const pageTopOf = (el) => {
    const header =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    return el.getBoundingClientRect().top + window.scrollY - header;
  };

  function jumpPastStory() {
    const el = document.getElementById(CAPACITY_ID);
    if (el) scrollToY(pageTopOf(el));
  }

  /** Pinned, goTo scrolls there. Unpinned it only opens the step, so bring the story into view too. */
  function jumpToChapter(ci) {
    goTo(story.firstStep[ci]);
    if (!storyPinned && storyRef.current) scrollToY(pageTopOf(storyRef.current));
  }

  const jumpGroups = [
    {
      items: [{ key: 'top', label: 'Back to top', onSelect: () => scrollToY(0) }],
    },
    {
      heading: 'The story',
      items: story.chapters.map((c, ci) => ({
        key: c.view,
        prefix: String(ci + 1).padStart(2, '0'),
        label: c.nav,
        indent: true,
        current: region === 'in' && step.chapterIndex === ci,
        onSelect: () => jumpToChapter(ci),
      })),
    },
    {
      items: [
        { key: 'capacity', label: 'Skip the story', onSelect: jumpPastStory },
      ],
    },
  ];
  // The button only shows inside the story, so it always names a chapter.
  const jumpCurrent = `${step.chapterIndex + 1} · ${step.chapter.nav}`;

  /**
   * The chart slots a story step can name (StoryStep.chart). Only the open
   * chapter's steps are rendered, so this builds at most three elements.
   */
  const renderStoryChart = (s) => {
    const navy = 'var(--ja-navy)';
    const red = 'var(--ja-burgundy)';
    /** Nice y ticks and a domain that contains them. */
    const niceY = (values, n = 4) => {
      const v = values.filter(Number.isFinite);
      const sc = scaleLinear().domain([Math.min(...v), Math.max(...v)]).nice(n);
      return { domain: sc.domain(), ticks: sc.ticks(n) };
    };
    const millions = (v, digits = 1) => `${(v / 1e6).toFixed(digits)}M`;

    switch (s.chart) {
      // 1a — enrollment, annotated at signing and at the rules taking effect.
      case 'snapLine': {
        if (!snap) return null;
        const sm = snap.months;
        const ind = snap.statewide.individuals;
        const y = niceY(ind);
        return (
          <>
            <LineFigure
              title="Texans enrolled in SNAP each month"
              months={sm}
              series={[{ key: 'ind', label: 'Enrolled', values: ind, color: navy, splitColor: red }]}
              yDomain={y.domain}
              yTicks={y.ticks}
              yFormat={(v) => millions(v)}
              xTicks={sm.filter((m) => m.endsWith('-01')).map((m) => ({ month: m, label: `'${m.slice(2, 4)}` }))}
              shadeFrom={statewide.meta.policy_start}
              splitAt={statewide.meta.policy_start}
              markers={[
                { month: statewide.meta.policy_start, n: 1 },
                { month: RULES_MONTH, n: 2 },
              ]}
            />
            <p className={styles.figureKey}>
              <b>1</b> H.R. 1 signed, {fmtMonthBody(statewide.meta.policy_start)} · <b>2</b> Texas
              rules take effect {monthShort(RULES_MONTH)} 1
            </p>
          </>
        );
      }

      // 1b — each age group indexed to its own level at the window start.
      case 'ageLines': {
        const band = (b) => statewide.age_series?.[b]?.slice(i0, i1 + 1);
        if (!band('18–59')) return null;
        const kids = band('Under 5').map((v, i) => v + band('5–17')[i]);
        const lines = [
          { key: 'a', label: '18–59', values: indexTo(band('18–59'), 0), color: navy },
          { key: 'c', label: 'Children', values: indexTo(kids, 0), color: '#c0643f' },
          { key: 'n', label: '60–64', values: indexTo(band('60–64'), 0), color: '#8b8585' },
          { key: 's', label: '65+', values: indexTo(band('65+'), 0), color: '#c9c3bd' },
        ];
        const ms = months.slice(i0, i1 + 1);
        return (
          <>
            <LineFigure
              title="SNAP enrollment by age group, indexed to the window start"
              months={ms}
              series={lines}
              yDomain={[50, 104]}
              yTicks={[50, 60, 70, 80, 90, 100]}
              yFormat={(v) => String(v)}
              xTicks={[
                { month: ms[0], label: monthTick(ms[0]) },
                { month: RULES_MONTH, label: monthShort(RULES_MONTH) },
                { month: ms[ms.length - 1], label: monthTick(ms[ms.length - 1]) },
              ]}
              endLabels
              height={140}
            />
            <LineLegend items={lines.map((l) => ({ label: l.label, color: l.color }))} />
          </>
        );
      }

      // 1c — monthly payments against the year before H.R. 1 was signed.
      case 'shortfall': {
        if (!snap?.statewide.payments) return null;
        const sm = snap.months;
        const p0 = sm.indexOf(statewide.meta.policy_start);
        const short = p0 >= 0 ? benefitShortfall(snap.statewide.payments, p0, sm.length - 1) : null;
        if (!short) return null;
        const ms = sm.slice(p0);
        const vals = snap.statewide.payments.slice(p0);
        return (
          <ShortfallFigure
            title="Total SNAP benefits paid each month"
            labels={ms.map(monthShort)}
            values={vals}
            base={short.base}
            baseLabel={`${fmtMonthBody(sm[short.baseFrom])} – ${fmtMonthBody(sm[p0])} average`}
            hatchFrom={1}
            yTicks={[0, 200e6, 400e6, 600e6]}
            yFormat={(v) => `$${Math.round(v / 1e6)}M`}
          />
        );
      }

      // 2 — newly subject per 100 enrollees, a strip per county type.
      case 'workStrip':
        return (
          <StripFigure
            title="Newly subject per 100 enrollees, by county type"
            groups={COUNTY_TYPES.map((t) => {
              const g = counties.filter((c) => c.county_type === t);
              return {
                label: t,
                sub: `${g.length} counties`,
                color: t === 'Metro' ? '#a39c95' : '#3f8e96',
                points: g
                  .filter((c) => c.snap_enrolled?.[i0] > 0)
                  .map((c) => ({
                    key: c.geoid,
                    v: ((c.newly_subject_persons ?? 0) / c.snap_enrolled[i0]) * 100,
                  })),
              };
            })}
            domain={[0, 30]}
            ticks={[0, 10, 20, 30]}
            medianFormat={(v) => String(Math.round(v))}
            axisLabel="Newly subject per 100 enrollees"
          />
        );

      // 3 — share of the child caseload lost, by county type.
      case 'childTypes': {
        const by = childLossByType(counties, i0, i1);
        return (
          <GroupBarsFigure
            rows={COUNTY_TYPES.map((t) => ({
              label: t,
              value: by[t] ?? 0,
              display: by[t] == null ? '—' : `−${(by[t] * 100).toFixed(1)}%`,
              highlight: t === 'Rural',
            }))}
          />
        );
      }

      // 4a — what goes into the index. No figures, by design.
      case 'indexRecipe':
        return (
          <IndexRecipe domains={INDEX_DOMAINS} />
        );

      // 4b — every county on the index, a strip per county type.
      case 'indexStrip':
        return (
          <StripFigure
            title="Vulnerability index by county type"
            groups={COUNTY_TYPES.map((t) => {
              const g = counties.filter((c) => c.county_type === t);
              return {
                label: t,
                sub: `${g.length} counties`,
                color: t === 'Metro' ? '#a39c95' : '#b44a3f',
                points: g
                  .filter((c) => Number.isFinite(c.vulnerability_score))
                  .map((c) => ({ key: c.geoid, v: c.vulnerability_score })),
              };
            })}
            domain={[0, 4]}
            ticks={[0, 1, 2, 3, 4]}
            medianFormat={(v) => v.toFixed(2)}
            axisLabel="Vulnerability index, 0–4"
          />
        );

      // 5a — effectuated Marketplace enrollment since 2016.
      case 'marketLine': {
        if (!marketplace) return null;
        const { months: em, values: ev } = marketplace.effectuated;
        const sc = scaleLinear().domain([0, Math.max(...ev)]).nice(4);
        return (
          <LineFigure
            title="Texans with a paid Marketplace plan each month"
            months={em}
            series={[{ key: 'eff', label: 'Effectuated', values: ev, color: navy }]}
            yDomain={sc.domain()}
            yTicks={sc.ticks(4).filter((t) => t > 0)}
            yFormat={(v) => `${Math.round(v / 1e6)}M`}
            xTicks={em
              .filter((m) => m.endsWith('-01') && Number(m.slice(0, 4)) % 2 === 0)
              .map((m) => ({ month: m, label: m.slice(0, 4) }))}
            rules={[
              { month: '2021-03', label: 'ARP' },
              { month: statewide.meta.policy_start, label: 'H.R. 1', anchor: 'end', ly: 98 },
              { month: '2026-01', label: 'Tax credits expire', color: red, anchor: 'end', ly: 110 },
            ]}
            endDot={red}
            height={140}
          />
        );
      }

      // 5b — share of sign-ups not paid for by February, by year.
      case 'neverPaid': {
        if (!marketplace) return null;
        const rows = marketplace.oep.filter((o) => o.not_effectuated_share != null);
        return (
          <YearBarsFigure
            title="Share of open-enrollment sign-ups not paid for by February"
            rows={rows.map((o, i) => ({
              label: String(o.year),
              value: o.not_effectuated_share,
              display: `${(o.not_effectuated_share * 100).toFixed(1)}%`,
              tone: i === rows.length - 1 ? 'alert' : i === rows.length - 2 ? 'warn' : 'base',
            }))}
          />
        );
      }

      default:
        return null;
    }
  };

  const mapProps = {
    counties,
    byGeoid,
    geometry,
    grid: statewide.meta.grid,
    viewBox: projection.viewBox,
    measure: state.measure,
  };

  /**
   * The map's side panel: search, the shortlist and its overlays. Beside the map
   * everywhere but a phone, where there is no room beside it and it opens in
   * the step caption's sheet instead (see <StepCaption>). One element either
   * way, so the refs the row fitting reads attach to whichever is on screen.
   *
   * ONE panel, not a stack of floating cards — 2026-09-11 comps. The previous
   * version put three bordered boxes in a column beside the map, which read as
   * three unrelated widgets rather than as the map's controls.
   */
  const sidePanel = (
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

        {/* Pinned, the shortlist shows as many rows as fit here — see
            fitRows. The search stays outside, so its dropdown is never
            clipped. */}
        <div className={styles.sideScroll} ref={sideScrollRef}>
        <div ref={sideInnerRef}>
        {/* --------------------------------------------------------- M-09 */}
        <div className={styles.panelBlock}>
          <div className={styles.blockTitle}>Top affected counties</div>
          {/* The one caveat kept: on the two-measure map the list can only be
              ordered by one of them, and without saying so it would read as a
              ranking on both. */}
          {bivariateAxes && (
            <p className={styles.blockNote}>
              Ranked on the red axis only — a list cannot order two measures at once.
            </p>
          )}
          <div ref={rankWrapRef}>
          <RankList
            rows={storyPinned && !phoneStory ? rankRows.slice(0, fitRows) : rankRows}
            glyph={rankGlyph}
            bins={rankBins}
            activeGeoid={activeId}
            onHover={(geoid) => dispatch({ type: 'hover', geoid, origin: 'external' })}
          />
          </div>

        </div>
        </div>
        </div>
      </aside>
  );

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
      <section className={styles.heroBand} ref={heroRef}>
        <div className={styles.heroInner}>
        <div className={styles.heroMain}>
        {/* The window used to be restated in an eyebrow above the number.
            Removed 2026-09-11: the hero phrase already names the start month and
            the brush labels both handles, so it was the third copy of the same
            fact. */}
        <div className={styles.heroNumberRow}>
          <span className={`${styles.heroNumber} tabular`}>{fmtDelta(shownChange)}</span>
          <span className={styles.heroPhrase}>
            fewer Texans on SNAP than in {fmtMonthFull(shownWindow[0])}
            {shownWindow[0] === statewide.meta.policy_start && ', when H.R. 1 was signed'}
          </span>
        </div>

        {/* §6.1 requires real copy, not lorem. Kept short on client direction —
            the audience already knows the situation.

            Download sits alongside it rather than under the brush: it is the one
            thing on this page a reader might come for and leave with, and it was
            previously the last element before the fold. */}
        <p className={styles.heroBody}>
          Losses began three months after signing and broke sharply in November 2025.
        </p>
        <div className={styles.heroBodyRow}>
          <button
            type="button"
            className={styles.download}
            onClick={() => downloadSelection(data, state)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M3 13.5h10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
          height={150}
        />
        </div>

        {/*
          §6.3's three statewide facts, back in the green band. Computed for
          the brush window since 2026-10-16 — see headlineStats().

          They went to the sticky rail for one round to keep them fixed; the
          client's call is that being in the band matters more. A sticky element
          is bounded by its containing block, so inside a band that scrolls away
          they scroll away with it — that is the trade.
        */}
        <div className={styles.heroStats}>
          <HeadlineStats stats={heroStats} />
        </div>
        </div>
      </section>

      {/*
        ------------------------------------------------------------ the story
        The map and the story rail, pinned to the viewport while the page
        scrolls behind them one step at a time — see config/story.js.

        The markers after the stage are the scroll stops: absolutely placed,
        one per step, and the page's snap points. They only exist while the
        story is pinned; below STORY_MEDIA the stage is a normal block and the
        rail is an accordion driven by clicks.
      */}
      <section
        ref={storyRef}
        className={`${styles.story} ${storyPinned ? styles.storyPinned : ''} ${
          phoneStory ? styles.storyPhone : ''
        } ${DREAM_EDGE ? styles.dreamEdge : ''}`}
        style={{ '--story-steps': story.steps.length }}
        aria-label="The story, one map at a time"
      >
      <div className={styles.stage}>
      <div className={styles.stageMain}>
        {/* Phones: the story's timeline, laid flat and pinned above the map. */}
        {phoneStory && (
          <StoryProgress
            chapters={storyChapters.map((c) => ({
              key: c.view,
              label: c.nav,
              steps: c.steps.map((st) => st.title),
            }))}
            activeChapter={step.chapterIndex}
            activeStep={step.stepInChapter}
            onSelect={(ci, si) => goTo(story.firstStep[ci] + si)}
            aside={<JumpMenu groups={jumpGroups} currentLabel={jumpCurrent} inline />}
          />
        )}

        {/*
          The map's title leads the section, above the chapter bar — it is the
          one line that says what the reader is looking at. Pinned it is a single
          line of fixed height (see .stageTitle), so a long title cannot push the
          map down.
        */}
        <div className={styles.stageHead}>
          <h2 className={styles.stageTitle} title={layerDef.formalName} ref={titleRef}>
            {layerDef.formalName}
          </h2>
          {/*
            C-02's controls — Rate/Count, the render style, and on Work the
            metric — behind one button at the top right of the stage, out of the
            way of the key and the map; see <MapOptions>.
          */}
          <MapOptions>
            {/* Views with more than one metric only; absent, not greyed out,
                elsewhere — an inert toggle reads as a missed feature. */}
            {/* Children: one switch, children only or everyone (2026-10-16). */}
            {view.key === 'children' && (
              <MapOption label="Who">
                <div className={styles.switchRow}>
                  <span className={styles.switchLabel}>Show children only</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={state.layer === 'child_loss'}
                    aria-label="Show children only"
                    className={`${styles.switch} ${state.layer === 'child_loss' ? styles.switchOn : ''}`}
                    onClick={() =>
                      dispatch({
                        type: 'setLayer',
                        layer: state.layer === 'child_loss' ? 'loss' : 'child_loss',
                      })
                    }
                  >
                    <span className={styles.switchKnob} aria-hidden="true" />
                  </button>
                </div>
              </MapOption>
            )}
            {view.metrics.length > 1 && view.key !== 'children' && (
              <MapOption label="Metric">
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
              </MapOption>
            )}
            {/* On the index view Rate/Count says nothing — an index is not a
                headcount — so the slot switches the assistance layer instead. */}
            {showCapacity ? (
              <MapOption label="Show">
                <SegmentedControl
                  label="Show"
                  size="sm"
                  options={[
                    { value: 'index', label: 'Index only', title: 'The vulnerability index alone' },
                    {
                      value: 'capacity',
                      label: 'Index + assistance',
                      title: 'With the enrollment help listed in each county drawn over it',
                    },
                  ]}
                  value={capacityOn ? 'capacity' : 'index'}
                  onChange={(v) => setCapacityOn(v === 'capacity')}
                />
              </MapOption>
            ) : (
              <MapOption label="Measure">
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
              </MapOption>
            )}
            {capacityShown && <MapOption label="Marks">{infraPicker}</MapOption>}
            {/* Cartogram removed 2026-09-11 on client direction — two styles,
                not three. See the note on MapStyle in src/types.js. Hidden on
                the one step that forces the tile grid, where it would be inert. */}
            {drawStyle !== 'grid' && (
            <MapOption label="Style">
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
            </MapOption>
            )}
            {/* M-08's overlays, moved here from under the shortlist on client
                direction 2026-10-16: they change what the map draws, which is
                what every other control in this popover does. */}
            <MapOption label="Highlight">
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
                    Outlines the fifth of counties highest on what the map shows — by count or by rate.
                  </span>
                </div>

                {/* Hidden, not disabled, off the Vulnerability index: its
                    definition is a vulnerability quintile, so on the other
                    views it is a control for something not on screen. */}
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
                      Top-quintile need with no CMS navigator listed.
                    </span>
                  </div>
                )}
              </div>
            </MapOption>
          </MapOptions>
        </div>

        {/* The chapter bar: every map in the story, and where the reader is.
            Not on a phone, where the progress bar above does its job. */}
        {!phoneStory && (
          <ChapterNav
            items={storyChapters.map((c) => {
              const layer = defaultLayerFor(c.view);
              const values = thumbValues.get(layer);
              return {
                key: c.view,
                label: c.nav,
                steps: c.steps.map((st) => st.title),
                thumb: values ? (
                  <CountyMap
                    {...mapProps}
                    layer={layer}
                    values={values}
                    style={state.style}
                    measure="rate"
                    size="thumb"
                    hovered={state.hovered}
                    title={`${c.nav} thumbnail`}
                  />
                ) : null,
              };
            })}
            activeChapter={step.chapterIndex}
            activeStep={step.stepInChapter}
            onSelect={(ci, si) => goTo(story.firstStep[ci] + si)}
          />
        )}

        <section className={styles.panel}>
          {/* Most views have no copy any more — see LayerDef.copy. In the story
              the open step already says it, so the panel does not. */}
          {!storyPinned && layerDef.copy && <p className={styles.panelCopy}>{layerDef.copy}</p>}

          {/*
            Map column | side panel, from the top. The key and the map options
            sit over the map in the left column only, so the search and the
            shortlist start level with the key rather than below a header row.
          */}
          <div className={styles.mapBody}>
          <div className={styles.mapCol}>
            {/* The key, directly over the map. Fixed height when pinned, sized
                for the tallest key (the bivariate matrix), so the map below
                never moves. */}
            <div className={styles.mapHead}>
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
                      ranges={legendRanges}
                    />
                  )}
                </div>
            </div>

          <div className={styles.mapHolder}>
            {(() => {
              const callout = (
                <Callout tone="caution" title="No count basis for this metric">
                  {layerDef.noCountReason}
                  <br />
                  Switch back to <strong>Rate</strong> above the map, or pick a metric with a count:
                  Benefits lost, Children, or Work requirements.
                </Callout>
              );
              /*
                 C-03 replaces the map with the reason. In the pinned story that
                 would make Texas vanish mid-step, so there the map stays put,
                 faded and inert in rate, and the reason sits over it.
              */
              if (noCount && !storyPinned) return callout;
              return (
                <>
                  <CountyMap
                    {...mapProps}
                    layer={state.layer}
                    values={layerValues}
                    style={drawStyle}
                    measure={noCount ? 'rate' : state.measure}
                    size="hero"
                    interactive={!noCount}
                    /* Capacity marks and the gap overlay belong to the index, not to
                       every choropleth — see ViewDef.showCapacity. */
                    marks={capacityShown ? state.infra : []}
                    overlays={{ q5: state.overlayQ5, gap: showCapacity && state.overlayGap }}
                    hovered={noCount ? null : state.hovered}
                    onHover={noCount ? undefined : (geoid) => dispatch({ type: 'hover', geoid })}
                    title={`${layerDef.formalName}, ${drawStyle} view`}
                  />
                  {noCount && <div className={styles.mapCallout}>{callout}</div>}
                </>
              );
            })()}
          </div>
          </div>

            {!phoneStory && sidePanel}
          </div>

          <div className={styles.panelFooter}>
            {/* The band-anchoring and small-denominator notes were removed on
                2026-09-11 — they are going into a methodology page instead.
                The mark key stays, and only where the marks draw. */}
            {capacityShown && drawStyle !== 'grid' && (
              <>
                <span className="eyebrow">Marks</span>
                {INFRA_TYPES.filter((t) => t.available).map((t) => (
                  <span key={t.key} className={styles.markKey}>
                    <svg width="12" height="12" aria-hidden="true">
                      <InfraGlyph type={t.key} x={6} y={6} size={3.5} legend />
                    </svg>
                    {t.label}
                  </span>
                ))}
                {fbMarksOn && (
                  <span className={styles.markKey}>
                    <svg width="12" height="12" aria-hidden="true">
                      <InfraGlyph type="food_bank" x={6} y={6} size={3.5} legend noData />
                    </svg>
                    No reporting food bank
                  </span>
                )}
              </>
            )}
            {/* On the grid the marks are bars inside each tile, so the key is
                a bar too, named by registry — and the unsourced registries
                named, so no bar never reads as none. */}
            {capacityShown && drawStyle === 'grid' && (
              <>
                <span className="eyebrow">Bars</span>
                {INFRA_BAR_ORDER.map((key) => INFRA_TYPES.find((t) => t.key === key))
                  .filter((t) => t.available)
                  .map((t) => (
                    <span key={t.key} className={styles.markKey}>
                      <svg width="6" height="12" aria-hidden="true">
                        <rect x={1} y={2} width={4} height={10} fill={INFRA_COLOR[t.key]} />
                      </svg>
                      {t.plural}
                    </span>
                  ))}

                {unsourcedInfra.length > 0 && (
                  <span className={styles.markKey}>
                    {unsourcedInfra.map((t) => t.shortLabel).join(', ')}: not yet sourced
                  </span>
                )}
                {state.overlayGap && (
                  <span className={styles.markKey}>
                    <svg width="12" height="12" aria-hidden="true">
                      <rect
                        x={1.5}
                        y={1.5}
                        width={9}
                        height={9}
                        fill="none"
                        stroke="var(--ja-burgundy)"
                        strokeWidth={1.5}
                        strokeDasharray="2 1.5"
                      />
                    </svg>
                    Gap county
                  </span>
                )}
              </>
            )}
          </div>
        </section>

        {/* Phones: the open step, under the map. Keyed by step, so a sheet
            left open closes when the reader scrolls on. */}
        {phoneStory && (
          <StepCaption
            key={step.id}
            index={step.stepInChapter}
            step={stepCopy}
            chart={step.chart ? renderStoryChart(step) : null}
            counties={sidePanel}
            onPrev={activeStep > 0 ? () => goTo(activeStep - 1) : null}
            onNext={activeStep < story.steps.length - 1 ? () => goTo(activeStep + 1) : null}
          />
        )}
      </div>

      {!phoneStory && (
      <aside className={styles.storyRail}>
        <StoryRail
          chapters={storyChapters.map((c) => ({
            key: c.view,
            label: c.nav,
            steps: c.steps,
          }))}
          activeChapter={step.chapterIndex}
          activeStep={step.stepInChapter}
          renderChart={renderStoryChart}
          onSelect={(ci, si) => goTo(story.firstStep[ci] + si)}
        />
      </aside>
      )}
      </div>

      {storyPinned &&
        story.steps.map((s, i) => (
          <div
            key={s.id}
            className={styles.stepMarker}
            style={{ '--i': i }}
            data-step-marker=""
            aria-hidden="true"
          />
        ))}
      </section>

      <div className={styles.page}>
      {/*
        Left column: everything below the story. The page-level rail beside it
        is the only thing outside it.
      */}
      <div className={styles.mainCol}>

      {/* --------------------------------------- M-10, split per the comps.
          The scatter is its own full-width section with a side note. The two
          time-series charts that sat under it moved into the story's first
          chapter, where the month-over-month columns and the age bands now
          open as steps beside the map. */}
      <Section
        title="Where need meets capacity"
        subtitle="Each dot is a county, sized by enrollment. Pick a comparison, then hover a dot or search for a county."
        tone="alt"
        id={CAPACITY_ID}
      >
        <div className={styles.capacityRow}>
          <ScatterPanel
            counties={counties}
            presets={SCATTER_PRESETS}
            preset={preset}
            onChangePreset={setPresetId}
            x={xMetric}
            ctx={metricCtx}
            onFocus={setScatterFocus}
            chart={
              <div className={styles.capacityChart} ref={capacityRef}>
                <ScatterChart
                  points={scatterPoints}
                  /* Real pixels, so the viewBox is 1:1 with the slot. The floors
                     cover the first paint, before the observer has measured. */
                  viewWidth={Math.max(360, Math.round(capacityBox.width) || SUMMARY_VIEW_WIDTH)}
                  height={Math.max(260, Math.round(capacityBox.height) || 320)}
                  hovered={scatterFocus}
                  /* Local state, not the global hover: this chart has its own
                     tooltip, and driving global hover would also pop the map's. */
                  onHover={setScatterFocus}
                  xLabel={`${xMetric.axis} →`}
                  yLabel={yMetric.axis}
                  xFormat={xMetric.format}
                  yFormat={yMetric.format}
                  /* All four corners, named by the preset; the chart counts them. */
                  quadrants={preset.quadrants}
                  ySplit={preset.ySplit}
                  renderOverlay={({ geoid, x, y, r, width, height }) => {
                    const county = byGeoid.get(geoid);
                    if (!county) return null;
                    // Right of the point, or left of it near the right edge;
                    // kept inside the slot top and bottom.
                    const TIP_W = 280;
                    const left = x + r + 12 + TIP_W > width ? x - r - 12 - TIP_W : x + r + 12;
                    const top = Math.max(0, Math.min(y - 32, height - 250));
                    return (
                      <ScatterTooltip
                        county={county}
                        x={xMetric}
                        y={yMetric}
                        ctx={metricCtx}
                        window={state.window}
                        childSeries={layerDef.seriesField === 'snap_children'}
                        style={{ left, top }}
                      />
                    );
                  }}
                />
              </div>
            }
          />
        </div>
      </Section>

      </div>

      {/*
        Page-level rail: the policy feed. One colour, full-bleed to the right
        edge — 2026-09-11 direction. Sticky, so it stays beside whichever
        section the reader has scrolled to — see .rail in the stylesheet.

        The observed SNAP chart it used to pair with is now the story's first
        step, directly above.
      */}
      <aside className={styles.rail}>
        <div className={styles.railInner}>
          <TimelineFeed content={timeline} window={shownWindow} />
        </div>
      </aside>
      </div>

      {/* Over the story only — see StoryExits. Phones carry the Jump to menu in
          the progress bar instead — see <StoryProgress aside>. */}
      <StoryExits
        onTop={() => scrollToY(0)}
        onSkip={jumpPastStory}
        visible={region === 'in' && !phoneStory}
      />

      <CountyTooltip
        county={activeCounty}
        layer={state.layer}
        stats={layerStats}
        values={layerValues}
        months={months}
        window={state.window}
        measure={state.measure}
        tooltipStats={view.tooltip.stats}
        foodbank={statewide.meta.foodbank}
        origin={state.hoverOrigin}
      />
    </div>
  );
}
