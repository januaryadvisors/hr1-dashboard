/**
 * The Map page: the hero band, the scrolling story around the hero map, the
 * need-vs-capacity scatter, and the policy feed. Every figure follows the
 * brush window.
 */
import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { activeGeoid } from '../../state/appState';
import { defaultLayerFor, hasCountBasis, layerBasis, layerByKey, viewByKey, viewForLayer } from '../../config/layers';
import { resolveChapters } from '../../config/story';
import { buildPresets } from '../../components/hero/BrushChart';
import { HeroBand } from '../../components/hero/HeroBand';
import { CountyMap } from '../../components/map/CountyMap';
import { buildLayerStats, CountyTooltip } from '../../components/map/CountyTooltip';
import { MapControls } from '../../components/map/MapControls';
import { MarksKey } from '../../components/map/MarksKey';
import { RampLegend } from '../../components/map/RampLegend';
import { BivariateLegend } from '../../components/map/BivariateLegend';
import { CapacitySection } from '../../components/charts/CapacitySection';
import { TimelineFeed } from '../../components/rail/TimelineFeed';
import { Callout } from '../../components/shell/Callout';
import { JumpMenu } from '../../components/shell/JumpMenu';
import { StoryExits } from '../../components/shell/StoryExits';
import { ChapterNav } from '../../components/story/ChapterNav';
import { StepCaption } from '../../components/story/StepCaption';
import { StoryProgress } from '../../components/story/StoryProgress';
import { StoryRail } from '../../components/story/StoryRail';
import { renderStoryChart } from '../../components/story/renderStoryChart';
import { loadMarketplace } from '../../data/marketplace';
import { loadSnapObserved } from '../../data/snap';
import { loadTimeline } from '../../data/timeline';
import { PHONE, STORY_PINNED } from '../../lib/breakpoints';
import { cx } from '../../lib/cx';
import { downloadSelection } from '../../lib/download';
import { headlineStats } from '../../lib/insights';
import { sumSeries } from '../../lib/series';
import { buildLayerValues } from '../../lib/layerValues';
import { headerHeight } from '../../lib/layout';
import { rampLegendProps } from '../../lib/mapLegend';
import { buildGeometry } from '../../lib/mapGeometry';
import { buildRankRows, rankBinCount, rankGlyphFor } from '../../lib/rankRows';
import { buildStoryFacts } from '../../lib/storyFacts';
import { useCountyHover } from '../../lib/useCountyHover';
import { useFitText } from '../../lib/useFitText';
import { useLoaded } from '../../lib/useLoaded';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useStory } from '../../lib/useStory';
import { useStoryParallax } from '../../lib/useStoryParallax';
import { SidePanel } from './SidePanel';
import styles from './MapPage.module.css';

/** The brush's viewBox width: about its rendered width in the hero. */
const BRUSH_VIEW_WIDTH = 620;
/** Anchor of the section after the story, where "Skip the story" lands. */
const CAPACITY_ID = 'need-meets-capacity';
const EMPTY_TIMELINE = { feed: [] };
/** One stable empty list, so the memoised hero map does not redraw. */
const NO_MARKS = [];

const pageTopOf = (el) => el.getBoundingClientRect().top + window.scrollY - headerHeight();

/** Statewide enrollment change between two months, or null if either is missing. */
function enrollmentChange(statewide, months, [from, to]) {
  const a = months.indexOf(from);
  const b = months.indexOf(to);
  return a >= 0 && b >= 0 ? statewide.enrolled[b] - statewide.enrolled[a] : null;
}

export default function MapPage() {
  const { data, projection, baseRings, statePath, state, dispatch } = useApp();
  const { counties, byGeoid, statewide } = data;
  const months = statewide.meta.months;
  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);

  // Optional files: the page still works without them.
  const timeline = useLoaded(loadTimeline, EMPTY_TIMELINE);
  const snap = useLoaded(loadSnapObserved);
  const marketplace = useLoaded(loadMarketplace);

  // ------------------------------------------------------------ the brush
  /** The window while a brush handle is dragged. Only cheap readouts follow it live. */
  const [preview, setPreview] = useState(null);
  const shownWindow = preview ?? state.window;
  const windowChange = enrollmentChange(statewide, months, state.window);
  const shownChange = enrollmentChange(statewide, months, shownWindow) ?? windowChange;

  const statewidePayments = useMemo(() => sumSeries(counties, 'snap_payments'), [counties]);
  const heroStats = useMemo(() => {
    const a = months.indexOf(shownWindow[0]);
    const b = months.indexOf(shownWindow[1]);
    return a >= 0 && b >= 0 ? headlineStats(statewide, statewidePayments, a, b) : [];
  }, [months, shownWindow, statewide, statewidePayments]);

  const brushProps = useMemo(
    () => ({
      months,
      series: statewide.enrolled,
      window: state.window,
      presets: buildPresets(statewide.meta.policy_start),
      onChange: (window) => dispatch({ type: 'setWindow', window }),
      onPreview: setPreview,
      viewWidth: BRUSH_VIEW_WIDTH,
    }),
    [months, statewide, state.window, dispatch],
  );

  // ------------------------------------------------------------ the story
  const storyPinned = useMediaQuery(STORY_PINNED);
  const isPhone = useMediaQuery(PHONE);
  /** On a pinned phone the map is the whole stage; the rail becomes a progress bar and a caption. */
  const phoneStory = storyPinned && isPhone;
  const { story, storyRef, step, active, goTo, goToStep, region, scrollToY, capacityOn, setCapacityOn } =
    useStory({ state, dispatch, pinned: storyPinned });
  useStoryParallax(storyRef);

  const storyFacts = useMemo(
    () =>
      buildStoryFacts({ counties, statewide, window: state.window, i0, i1, windowChange, snap, marketplace }),
    [counties, statewide, state.window, i0, i1, windowChange, snap, marketplace],
  );
  const chapters = useMemo(() => resolveChapters(story.chapters, storyFacts), [story.chapters, storyFacts]);
  const railChapters = useMemo(
    () => chapters.map((c) => ({ key: c.view, label: c.nav, steps: c.steps })),
    [chapters],
  );
  const navChapters = useMemo(
    () => railChapters.map((c) => ({ ...c, steps: c.steps.map((s) => s.title) })),
    [railChapters],
  );
  const stepCopy = chapters[step.chapterIndex].steps[step.stepInChapter];
  const chartData = { counties, statewide, months, i0, i1, snap, marketplace };
  const storyChart = (s) => renderStoryChart(s, chartData);

  // ------------------------------------------------------------- the map
  const layerDef = layerByKey(state.layer);
  // The open chapter's view wins when it lists the layer (Children also shows `loss`).
  const chapterView = viewByKey(step.chapter.view);
  const view = chapterView.metrics.includes(state.layer) ? chapterView : viewForLayer(state.layer);
  const isIndexView = view.showCapacity;
  const capacityShown = isIndexView && capacityOn;

  const noCount = state.measure === 'count' && !hasCountBasis(state.layer);
  const counting = state.measure === 'count' && !noCount;
  const bivariateAxes = layerBasis(state.layer) === 'bivariate' ? layerDef.axes : undefined;

  // A story step can fix the style; the box chart (grid) is the index view's only.
  const stepStyle = storyPinned ? step.mapStyle : undefined;
  const drawStyle = stepStyle ?? (state.style === 'grid' && !isIndexView ? 'geo' : state.style);

  const layerValues = useMemo(
    () => buildLayerValues(counties, state.layer, i0, i1),
    [counties, state.layer, i0, i1],
  );
  const thumbValues = useMemo(() => {
    const out = new Map();
    for (const c of story.chapters) {
      const key = defaultLayerFor(c.view);
      out.set(key, key === state.layer ? layerValues : buildLayerValues(counties, key, i0, i1));
    }
    return out;
  }, [story.chapters, counties, i0, i1, state.layer, layerValues]);

  const rankRows = useMemo(
    () => buildRankRows({ counties, layer: state.layer, values: layerValues, counting, i0, i1 }),
    [counties, state.layer, layerValues, counting, i0, i1],
  );

  const geometry = useMemo(() => buildGeometry(baseRings, statePath), [baseRings, statePath]);
  const layerStats = useMemo(() => buildLayerStats(counties), [counties]);
  const mapOverlays = useMemo(
    () => ({ q5: state.overlayQ5, gap: isIndexView && state.overlayGap }),
    [state.overlayQ5, state.overlayGap, isIndexView],
  );

  const titleRef = useRef(null);
  useFitText(titleRef, storyPinned, [layerDef.formalName]);
  const activeId = activeGeoid(state);
  const { onMapHover, onListHover, tooltip } = useCountyHover(state, dispatch);

  const mapProps = {
    counties,
    byGeoid,
    geometry,
    grid: statewide.meta.grid,
    viewBox: projection.viewBox,
    measure: state.measure,
  };

  // ------------------------------------------------------------ jumping
  function jumpPastStory() {
    const el = document.getElementById(CAPACITY_ID);
    if (el) scrollToY(pageTopOf(el));
  }

  /** Pinned, goTo scrolls there; unpinned it only opens the step, so scroll the story into view too. */
  function jumpToChapter(ci) {
    goTo(story.firstStep[ci]);
    if (!storyPinned && storyRef.current) scrollToY(pageTopOf(storyRef.current));
  }

  const jumpGroups = [
    { items: [{ key: 'top', label: 'Back to top', onSelect: () => scrollToY(0) }] },
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
    { items: [{ key: 'capacity', label: 'Skip the story', onSelect: jumpPastStory }] },
  ];

  // ------------------------------------------------------------ render
  const sidePanel = (
    <SidePanel
      counties={counties}
      layer={state.layer}
      values={layerValues}
      rows={rankRows}
      glyph={rankGlyphFor(state.layer)}
      bins={rankBinCount(state.layer, layerValues, counting)}
      activeGeoid={activeId}
      pinned={!!state.pinned}
      fitToStage={storyPinned && !phoneStory}
      note={bivariateAxes && 'Ranked on the red axis only — a list cannot order two measures at once.'}
      onPick={(geoid) => dispatch({ type: 'pin', geoid })}
      onListHover={onListHover}
    />
  );

  const noCountCallout = (
    <Callout tone="caution" title="No count basis for this metric">
      {layerDef.noCountReason}
      <br />
      Switch back to <strong>Rate</strong> above the map, or pick a metric with a count: Benefits lost,
      Children, or Work requirements.
    </Callout>
  );

  const heroMap = (
    <CountyMap
      {...mapProps}
      layer={state.layer}
      values={layerValues}
      style={drawStyle}
      measure={noCount ? 'rate' : state.measure}
      size="hero"
      interactive={!noCount}
      marks={capacityShown ? state.infra : NO_MARKS}
      overlays={mapOverlays}
      hovered={noCount ? null : activeId}
      spotlight={noCount || state.hovered ? null : state.pinned}
      onHover={noCount ? undefined : onMapHover}
      title={`${layerDef.formalName}, ${drawStyle} view`}
    />
  );

  return (
    <div className={styles.root}>
      <HeroBand
        change={shownChange}
        window={shownWindow}
        policyStart={statewide.meta.policy_start}
        brushProps={brushProps}
        stats={heroStats}
        onDownload={() => downloadSelection(data, state)}
      />

      {/* The map and the story rail, pinned while the page scrolls one step at a time. */}
      <section
        ref={storyRef}
        className={cx(styles.story, storyPinned && styles.storyPinned, phoneStory && styles.storyPhone)}
        style={{ '--story-steps': story.steps.length }}
        aria-label="The story, one map at a time"
      >
        <div className={styles.stage}>
          <div className={styles.stageMain}>
            {phoneStory && (
              <StoryProgress
                chapters={navChapters}
                activeChapter={step.chapterIndex}
                activeStep={step.stepInChapter}
                onSelect={goToStep}
                aside={
                  <JumpMenu
                    groups={jumpGroups}
                    currentLabel={`${step.chapterIndex + 1} · ${step.chapter.nav}`}
                    inline
                  />
                }
              />
            )}

            <div className={styles.stageHead}>
              <h2 className={styles.stageTitle} title={layerDef.formalName} ref={titleRef}>
                {layerDef.formalName}
              </h2>
              <MapControls
                view={view}
                state={state}
                dispatch={dispatch}
                counties={counties}
                capacityOn={capacityOn}
                onCapacityChange={setCapacityOn}
                drawStyle={drawStyle}
                styleLocked={!!stepStyle}
              />
            </div>

            {!phoneStory && (
              <ChapterNav
                items={navChapters.map((c) => {
                  const layer = defaultLayerFor(c.key);
                  const values = thumbValues.get(layer);
                  const thumb = values ? (
                    <CountyMap
                      {...mapProps}
                      layer={layer}
                      values={values}
                      style={state.style === 'grid' && c.key !== 'vulnerability' ? 'geo' : state.style}
                      measure="rate"
                      size="thumb"
                      hovered={activeId}
                      title={`${c.label} thumbnail`}
                    />
                  ) : null;
                  return { ...c, thumb };
                })}
                activeChapter={step.chapterIndex}
                activeStep={step.stepInChapter}
                onSelect={goToStep}
              />
            )}

            <section className={styles.panel}>
              {/* In the story the open step already says this. */}
              {!storyPinned && layerDef.copy && <p className={styles.panelCopy}>{layerDef.copy}</p>}

              <div className={styles.mapBody}>
                <div className={styles.mapCol}>
                  <div className={styles.mapHead}>
                    <div className={styles.panelLegend}>
                      {bivariateAxes ? (
                        <BivariateLegend axes={bivariateAxes} />
                      ) : (
                        <RampLegend {...rampLegendProps(state.layer, layerValues, counting)} />
                      )}
                    </div>
                  </div>

                  {/* No count basis: unpinned the reason replaces the map; pinned it sits over a faded map. */}
                  <div className={styles.mapHolder}>
                    {noCount && !storyPinned ? (
                      noCountCallout
                    ) : (
                      <>
                        {heroMap}
                        {noCount && <div className={styles.mapCallout}>{noCountCallout}</div>}
                      </>
                    )}
                  </div>
                </div>

                {!phoneStory && sidePanel}
              </div>

              <div className={styles.panelFooter}>
                {capacityShown && (
                  <MarksKey asBars={drawStyle === 'grid'} infra={state.infra} gapOn={state.overlayGap} />
                )}
              </div>
            </section>

            {/* Keyed by step, so an open sheet closes when the reader moves on. */}
            {phoneStory && (
              <StepCaption
                key={step.id}
                index={step.stepInChapter}
                step={stepCopy}
                chart={step.chart ? storyChart(step) : null}
                counties={sidePanel}
                onPrev={active > 0 ? () => goTo(active - 1) : null}
                onNext={active < story.steps.length - 1 ? () => goTo(active + 1) : null}
              />
            )}
          </div>

          {!phoneStory && (
            <aside className={styles.storyRail}>
              <StoryRail
                chapters={railChapters}
                activeChapter={step.chapterIndex}
                activeStep={step.stepInChapter}
                renderChart={storyChart}
                onSelect={goToStep}
              />
            </aside>
          )}
        </div>

        {/* The scroll stops, one per step. */}
        {storyPinned &&
          story.steps.map((s, i) => (
            <div key={s.id} className={styles.stepMarker} style={{ '--i': i }} data-step-marker="" aria-hidden="true" />
          ))}
      </section>

      <div className={styles.page}>
        <div className={styles.mainCol}>
          <CapacitySection
            id={CAPACITY_ID}
            counties={counties}
            byGeoid={byGeoid}
            i0={i0}
            i1={i1}
            window={state.window}
            childSeries={layerDef.seriesField === 'snap_children'}
          />
        </div>

        <aside className={styles.rail}>
          <div className={styles.railInner}>
            <TimelineFeed content={timeline} window={shownWindow} />
          </div>
        </aside>
      </div>

      <StoryExits onTop={() => scrollToY(0)} onSkip={jumpPastStory} visible={region === 'in' && !phoneStory} />

      <CountyTooltip
        county={activeId ? byGeoid.get(activeId) ?? null : null}
        layer={state.layer}
        stats={layerStats}
        values={layerValues}
        months={months}
        window={state.window}
        measure={state.measure}
        tooltipStats={view.tooltip.stats}
        foodbank={statewide.meta.foodbank}
        acaYear={statewide.meta.aca_year}
        {...tooltip}
      />
    </div>
  );
}
