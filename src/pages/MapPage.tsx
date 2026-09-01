/**
 * Map page — spec §6. Composition only: every piece is a component from §7 and
 * every number recomputes from the brush window (§6.2).
 */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { activeGeoid, ALL_INFRA } from '../state/appState';
import { INFRA_TYPES, LAYERS, layerByKey, scoreField } from '../config/layers';
import { CountyMap } from '../components/CountyMap';
import { CountyTooltip } from '../components/CountyTooltip';
import { SegmentedControl } from '../components/SegmentedControl';
import { RampLegend } from '../components/RampLegend';
import { RankList, type RankRow } from '../components/RankList';
import { Callout } from '../components/Callout';
import { BrushChart, buildPresets } from '../components/BrushChart';
import { TimelineFeed } from '../components/TimelineFeed';
import { ColumnChart } from '../components/ColumnChart';
import { DumbbellChart } from '../components/DumbbellChart';
import { ScatterChart, type ScatterPoint } from '../components/ScatterChart';
import { InfraGlyph } from '../components/InfraGlyph';
import { downloadSelection } from '../lib/download';
import { loadTimeline, type TimelineContent } from '../data/timeline';
import { fmtDelta, fmtMonth, fmtMonthBody, fmtPercentile } from '../lib/format';
import type { InfraKey, MapStyle } from '../types';
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
  const { data, projection, state, dispatch } = useApp();
  const { counties, byGeoid, statewide, geometry } = data;
  const months = statewide.meta.months;

  const [timeline, setTimeline] = useState<TimelineContent>({ stats: [], feed: [] });
  useEffect(() => {
    loadTimeline().then(setTimeline);
  }, []);

  const layerDef = layerByKey(state.layer);
  const activeId = activeGeoid(state);
  const activeCounty = activeId ? byGeoid.get(activeId) ?? null : null;

  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);

  // ------------------------------------------------------- window arithmetic
  const windowChange = useMemo(
    () => statewide.enrolled[i1] - statewide.enrolled[i0],
    [statewide.enrolled, i0, i1],
  );

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
  const scatterPoints = useMemo<ScatterPoint[]>(
    () =>
      counties.map((c) => {
        const sites =
          c.infra.food_bank + c.infra.cms_navigator + c.infra.chw + c.infra.counselor;
        return {
          geoid: c.geoid,
          name: c.name,
          x: c.vulnerability_score / 4,
          y: (sites / c.pop) * 10000,
          weight: c.pop,
        };
      }),
    [counties],
  );

  // M-09 "Highest on this layer" — six rows maximum, within-layer only.
  const rankRows = useMemo<RankRow[]>(() => {
    const field = scoreField(state.layer);
    return counties
      .map((c) => ({ c, v: c[field] }))
      .filter((r): r is { c: typeof counties[number]; v: number } => typeof r.v === 'number')
      .sort((a, b) => b.v - a.v)
      .slice(0, 6)
      .map(({ c, v }) => ({
        geoid: c.geoid,
        name: c.name,
        fraction: state.layer === 'composite' ? v / 4 : v,
        value: state.layer === 'composite' ? v.toFixed(2) : fmtPercentile(v),
      }));
  }, [counties, state.layer]);

  const infraCounts = useMemo(
    () =>
      Object.fromEntries(
        ALL_INFRA.map((k) => [k, counties.filter((c) => c.infra[k] > 0).length]),
      ) as Record<InfraKey, number>,
    [counties],
  );

  const maxCount = useMemo(() => {
    const field = layerDef.countField;
    if (!field) return 0;
    return counties.reduce((m, c) => Math.max(m, (c[field] as number) ?? 0), 0);
  }, [counties, layerDef.countField]);

  // C-03: count measure with no count basis replaces the map, and the toggle is
  // NOT greyed out.
  const noCount = state.measure === 'count' && !layerDef.countField;

  const mapProps = {
    counties,
    byGeoid,
    geometry: geometry.counties,
    state: geometry.state,
    projection,
    grid: statewide.meta.grid,
    measure: state.measure,
  };

  return (
    <div className={styles.page}>
      {/* ---------------------------------------------------- M-01 + M-03 */}
      <section className={styles.heroBand}>
        <div className={styles.heroLeft}>
          <div>
            <div className="eyebrow">
              {fmtMonth(state.window[0])} → {fmtMonth(state.window[1])}
            </div>
            <div className={styles.heroNumberRow}>
              <span className={`${styles.heroNumber} tabular`}>{fmtDelta(windowChange)}</span>
              <span className={styles.heroPhrase}>
                fewer Texans on SNAP than {fmtMonthBody(state.window[0])}
              </span>
            </div>
          </div>

          {/* §6.1 requires real copy, not lorem. Kept short on client direction —
              the audience already knows the situation. */}
          <p className={styles.heroBody}>
            Losses began three months after signing, broke sharply in November, and have run
            50,000–80,000 a month since. This is observed enrollment change, not a modelled
            estimate of who H.R. 1 affected.
          </p>

          {/* ---------------------------------------------------------- M-02 */}
          <BrushChart
            months={months}
            series={statewide.enrolled}
            window={state.window}
            presets={buildPresets(statewide.meta.policy_start)}
            onChange={(w) => dispatch({ type: 'setWindow', window: w })}
            viewWidth={BRUSH_VIEW_WIDTH}
            height={108}
          />

          <div className={styles.downloadRow}>
            <button
              type="button"
              className={styles.download}
              onClick={() => downloadSelection(data, state)}
            >
              Download data
            </button>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)' }}>
              CSV of the current window and layer, plus JSON with the MOE columns.
            </span>
          </div>
        </div>

        <div className={styles.statementRail}>
          <TimelineFeed content={timeline} window={state.window} />
        </div>
      </section>

      {/* --------------------------------- M-04 + M-05 + right rail, one row */}
      <div className={styles.mapRow}>
        <section className={styles.layerStrip} aria-label="Indicator layers">
        {LAYERS.map((l) => {
          const disabled = !l.available;
          const classes = [
            styles.layerCard,
            l.key === state.layer ? styles.layerCardActive : '',
            l.key === 'composite' ? styles.layerCardDemoted : '',
            disabled ? styles.layerCardDisabled : '',
          ].join(' ');
          return (
            <button
              key={l.key}
              type="button"
              className={classes}
              disabled={disabled}
              title={l.note ?? l.formalName}
              aria-pressed={l.key === state.layer}
              onClick={() => dispatch({ type: 'setLayer', layer: l.key })}
            >
              <span className={styles.layerCardTitle}>{l.label}</span>
              {/* Live thumbnail, same projection and measure as the hero map, so
                  the strip is a legend for the whole page (§6.4).

                  In count measure a layer with no count basis has nothing to
                  size symbols by, and rendering it would produce a blank card
                  that reads as "no exposure" rather than "no denominator". Per
                  C-03 we name the reason instead of inventing one. */}
              {!l.available ? (
                <span className={styles.layerCardNote}>No source column yet</span>
              ) : state.measure === 'count' && !l.countField ? (
                <span className={styles.layerCardNote}>No count basis</span>
              ) : (
                <CountyMap
                  {...mapProps}
                  layer={l.key}
                  style={state.style}
                  size="thumb"
                  hovered={state.hovered}
                  pinned={state.pinned}
                  title={`${l.label} thumbnail`}
                />
              )}
            </button>
          );
        })}

          {/* M-09 sits here rather than in the right rail so the left column is
              not mostly empty below the strip. */}
          <div className={styles.rankCard}>
            <div className={styles.railTitle}>Highest on this layer</div>
            <p className={styles.railSubhead}>
              A within-layer shortlist, not a statewide ranking. Switch layers and the list changes
              completely — that is the point.
            </p>
            <RankList
              rows={rankRows}
              activeGeoid={activeId}
              onHover={(geoid) => dispatch({ type: 'hover', geoid })}
              onSelect={(geoid) => dispatch({ type: 'pin', geoid })}
            />
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{layerDef.formalName}</h2>
              <p className={styles.panelCopy}>{layerDef.copy}</p>
              <p className={styles.railFootnote}>
                {layerDef.components == null
                  ? 'No components defined.'
                  : `${layerDef.components} component${layerDef.components === 1 ? '' : 's'}.`}
                {state.measure === 'rate' &&
                  ' Counties under 10,000 residents are dimmed — their rates are unstable.'}
              </p>
            </div>
            <div className={styles.panelControls}>
              <SegmentedControl
                label="Render style"
                size="sm"
                options={[
                  { value: 'geo', label: 'Geo', title: 'True county polygons' },
                  {
                    value: 'grid',
                    label: 'Cartogram',
                    title: 'Population-weighted — block area is proportional to population',
                  },
                  { value: 'density', label: 'Density', title: 'Centroid bubbles' },
                ]}
                value={state.style}
                onChange={(v) => dispatch({ type: 'setStyle', style: v as MapStyle })}
              />
              <RampLegend
                layer={state.layer}
                mode={state.measure === 'count' && layerDef.countField ? 'count' : 'rate'}
                maxCount={maxCount}
                label={state.measure === 'count' && layerDef.countField ? layerDef.label : undefined}
              />
            </div>
          </div>

          <div className={styles.mapHolder}>
            {noCount ? (
              <Callout tone="caution" title="No count basis for this layer">
                {layerDef.noCountReason}
                <br />
                Switch back to <strong>Rate</strong> to see it as a percentile, or pick a layer with
                a count: Work requirements or Citizenship.
              </Callout>
            ) : (
              <CountyMap
                {...mapProps}
                layer={state.layer}
                style={state.style}
                size="hero"
                interactive
                marks={state.infra}
                overlays={{ q5: state.overlayQ5, gap: state.overlayGap }}
                hovered={state.hovered}
                pinned={state.pinned}
                onHover={(geoid) => dispatch({ type: 'hover', geoid })}
                onPin={(geoid) => dispatch({ type: 'pin', geoid })}
                title={`${layerDef.formalName}, ${state.style} view`}
              />
            )}
          </div>

          <div className={styles.panelFooter}>
            <span className="eyebrow">Marks</span>
            {INFRA_TYPES.map((t) => (
              <span key={t.key} className={styles.markKey}>
                <svg width="12" height="12" aria-hidden="true">
                  <InfraGlyph type={t.key} x={6} y={6} size={3.5} legend />
                </svg>
                {t.label}
              </span>
            ))}
            <span className={styles.markKey}>
              <svg width="12" height="12" aria-hidden="true">
                <rect x={2} y={2} width={8} height={8} fill="none"
                  stroke="var(--ja-burgundy)" strokeWidth={1.2} />
              </svg>
              Gap county
            </span>
            {/* §6.6: not optional, does not shrink. */}
            <span className={styles.presenceNote}>
              {state.style === 'grid' && (
                <>
                  Marks are hidden on the cartogram — blocks are moved off their true centroids, so
                  a mark would sit over the wrong county.{' '}
                </>
              )}
              Presence, not capacity. Absent mark = <strong>not listed</strong>, not a confirmed
              zero.
            </span>
          </div>
        </section>

        <aside className={styles.rail}>
          {/* -------------------------------------------------------- M-07 */}
          <div className={styles.railCard}>
            <div className={styles.railTitle}>Assistance infrastructure</div>
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
                  {infraCounts[t.key]} counties
                </span>
              </label>
            ))}

            <p className={styles.railFootnote}>
              Counts are counties with at least one listed site. Registry pull, not a capacity
              measure.
            </p>
          </div>

          {/* -------------------------------------------------------- M-08 */}
          <div className={styles.railCard}>
            <div className={styles.railTitle}>Overlays</div>

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
                Outlines every county in Q5 on the layer showing.
              </span>
            </div>

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
                Top-quintile vulnerability with no food bank site and no navigator listed.
              </span>
            </div>
          </div>

        </aside>
      </div>

      {/* ------------------------------------------------------------ M-10 */}
      <section className={styles.summaryRow}>
        <div className={chartStyles.card}>
          <h3 className={chartStyles.title}>Where need meets capacity</h3>
          <p className={chartStyles.subhead}>
            Vulnerability percentile against listed enrollment-support sites per 10,000 residents.
            The bottom-right quadrant is the gap: high need, nothing listed to meet it.
          </p>
          <ScatterChart
            points={scatterPoints}
            viewWidth={SUMMARY_VIEW_WIDTH}
            height={230}
            pinned={state.pinned}
            hovered={state.hovered}
            onHover={(geoid) => dispatch({ type: 'hover', geoid })}
            onSelect={(geoid) => dispatch({ type: 'pin', geoid })}
          />
          <p className={chartStyles.footnote}>
            Capacity counts four registries: CMS-certified navigators and application counselors,
            Feeding Texas partner enrollment sites, and DSHS-certified CHW/promotor networks.{' '}
            {counties.filter((c) => c.infra.cms_navigator === 0).length} of 254 counties have zero
            CMS navigators, so they sit flat on the axis — the inventory is thin, and that is the
            finding.
          </p>
        </div>

        <div className={chartStyles.card}>
          <h3 className={chartStyles.title}>The decline has not stopped</h3>
          <p className={chartStyles.subhead}>
            Steady losses of 50k to 80k every month since November. No floor in the data yet.
          </p>
          <ColumnChart
            months={changeSlice.months}
            values={changeSlice.values}
            annotations={[{ month: '2025-11', label: 'NOV −110k' }]}
            viewWidth={SUMMARY_VIEW_WIDTH}
            height={230}
          />
          <p className={chartStyles.footnote}>
            Month-over-month change in enrolled individuals across the selected window.
          </p>
        </div>

        <div className={chartStyles.card}>
          <h3 className={chartStyles.title}>Who is falling off</h3>
          <p className={chartStyles.subhead}>
            Enrolled individuals by age, {fmtMonthBody(state.window[0])} →{' '}
            {fmtMonthBody(state.window[1])}. Working-age adults and children carry the whole
            decline; seniors are unchanged.
          </p>
          <DumbbellChart rows={ageRows} viewWidth={SUMMARY_VIEW_WIDTH} />
          <p className={chartStyles.footnote}>
            Dot at the window start, arrowhead at the window end. Age-band shares are statewide,
            not county-level.
          </p>
        </div>
      </section>

      <CountyTooltip county={activeCounty} layer={state.layer} measure={state.measure} />
    </div>
  );
}
