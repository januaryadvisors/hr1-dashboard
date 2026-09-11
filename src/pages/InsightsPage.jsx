/**
 * Insights page — spec §8. Five tabbed chapters.
 *
 * SCOPED. Every chart reads from a `Scope` (src/lib/insights.ts) — Texas, or one
 * county — so the page doubles as a county stat page for sharing with people who
 * will never touch the map: `/insights/decline?county=48201` is the link, and it
 * is just the address bar after picking a county.
 *
 * Each chart declares whether it can be scoped. The age bands and the
 * people-vs-households split are published statewide only (§3.3) and §3 forbids
 * synthesising county versions, so those carry a visible "Statewide" badge
 * instead of quietly implying they describe the county on screen. That badge is
 * the most important thing on this page: the whole purpose is to hand numbers to
 * someone who will repeat them, and a statewide figure repeated as a county
 * figure is the failure mode.
 *
 * Charts still to build are listed in-page per chapter, so the gap stays visible.
 */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { INFRA_TYPES, SCORE_LAYERS, scoreField } from '../config/layers';
import { Callout } from '../components/shell/Callout';
import { ColumnChart } from '../components/charts/ColumnChart';
import { DomainScale } from '../components/charts/DomainScale';
import { DumbbellChart } from '../components/charts/DumbbellChart';
import { FunnelPlot } from '../components/charts/FunnelPlot';
import { IndexedLines } from '../components/charts/IndexedLines';
import { InfraGlyph } from '../components/map/InfraGlyph';
import { LineChart } from '../components/charts/LineChart';
import { ScatterChart } from '../components/charts/ScatterChart';
/**
 * @typedef {import('../components/charts/ScatterChart').ScatterPoint} ScatterPoint
 */
import { ScopeBar } from '../components/shell/ScopeBar';
import { buildLayerStats } from '../components/map/CountyTooltip';
import {
  buildFunnel,
  buildScope,
  indexTo,
  lossRank,
  monthlyChange,
  participationShare,
  windowChange,
} from '../lib/insights';
import { fmtInt, fmtMonthBody, fmtPct, fmtPercentile } from '../lib/format';
import styles from './InsightsPage.module.css';

/*
 * Charts are TWO PER ROW as of 2026-09-11, so each renders around 460px wide
 * rather than filling the column.
 *
 * The viewBox is authored near that width on purpose: these charts scale to
 * their container, so a viewBox twice the rendered width halves the apparent
 * size of every axis label. At 940 in a half-width card the 9px axis type came
 * out at about 4px.
 */
const VIEW_WIDTH = 470;

/**
 * @typedef {Object} Chapter
 * @property {string} slug
 * @property {string} title
 * @property {string} claim - The chapter's finding, set as the heading above its charts.
 *   This is the one piece of running prose the page keeps: the client's note on
 *   2026-09-11 was that the claims are what make the page readable and the
 *   callouts around them were not.
 * @property {(name: string) => string} [countyClaim] - The claim, rewritten for a single county.
 * @property {string[]} pending - Charts not built yet. Each renders as a placeholder card in
 *   the grid, so the layout shows what is coming rather than a list describing it.
 */

const CHAPTERS = [
  {
    slug: 'decline',
    title: 'The decline has not stopped',
    claim: 'Enrollment is still falling, and the pace is flat rather than slowing.',
    countyClaim: (n) => `How ${n}'s caseload has moved, against Texas as a whole.`,
    pending: [],
  },
  {
    slug: 'who',
    title: 'Who is falling off',
    claim: 'Working-age adults and children carry the entire decline; seniors are unchanged.',
    countyClaim: (n) => `Children are leaving SNAP in ${n} faster than the caseload as a whole.`,
    pending: ['People vs households, indexed (statewide only)'],
  },
  {
    slug: 'domains',
    title: 'The four domains disagree',
    claim: 'No single ranking of counties can be honest about all four exposures.',
    countyClaim: (n) => `${n} does not sit in the same place on all four domains.`,
    pending: ['Small multiples with synced hover', 'Correlation matrix'],
  },
  {
    slug: 'capacity',
    title: 'Where exposure meets thin capacity',
    claim: 'The counties with the least enrollment help are not the ones with the most.',
    countyClaim: (n) => `What is listed in ${n} to help people stay enrolled.`,
    pending: ['Infrastructure coverage bars', 'Gap-county table'],
  },
  {
    slug: 'rate-count',
    title: 'Rate and count are two arguments',
    claim:
      'Targeting by rate and targeting by count select different counties, and both are legitimate.',
    countyClaim: (n) => `Is ${n}'s decline unusual for a caseload its size?`,
    pending: ['Paired rate/count maps'],
  },
];

/** Marks a chart the data cannot scope below state level. */
function StatewideBadge({ scoped }) {
  if (!scoped) return null;
  return (
    <span className={styles.badge} title="Published statewide only — see §3.3">
      Statewide figure
    </span>
  );
}

/**
 * A chart that does not exist yet.
 *
 * Rendered in the grid where the chart will go, rather than listed in a callout
 * underneath it. Two reasons: the two-up rhythm survives an odd number of real
 * charts, and a gap in the layout is a more honest description of a gap in the
 * work than a bullet list is.
 */
function PlaceholderCard({ title }) {
  return (
    <section className={`${styles.chartBlock} ${styles.placeholder}`}>
      <div className={styles.chartHead}>
        <h2 className={styles.chartTitle}>{title}</h2>
      </div>
      <div className={styles.placeholderBody} aria-hidden="true">
        Not built yet
      </div>
    </section>
  );
}

function ChartCard({
  title,
  subhead,
  footnote,
  statewideOnly = false,
  scoped = false,
  /** Spans both columns. For a chart that genuinely cannot read at half width. */
  wide = false,
  children,
}) {
  return (
    <section className={`${styles.chartBlock} ${wide ? styles.wide : ''}`}>
      <div className={styles.chartHead}>
        <h2 className={styles.chartTitle}>{title}</h2>
        {statewideOnly && <StatewideBadge scoped={scoped} />}
      </div>
      {subhead && <p className={styles.chartSubhead}>{subhead}</p>}
      {children}
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </section>
  );
}

export default function InsightsPage() {
  const { tab } = useParams();
  const { data, state, dispatch } = useApp();
  const { counties, byGeoid, statewide } = data;
  const months = statewide.meta.months;
  const chapter = CHAPTERS.find((c) => c.slug === tab) ?? CHAPTERS[0];

  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);

  const scope = useMemo(
    () => buildScope(counties, byGeoid, statewide, state.scope),
    [counties, byGeoid, statewide, state.scope],
  );
  const isCounty = scope.county != null;

  const change = useMemo(() => windowChange(scope.enrolled, i0, i1), [scope.enrolled, i0, i1]);

  const rank = useMemo(
    () =>
      scope.county
        ? lossRank(counties, scope.county.geoid, statewide.enrolled, i0, i1)
        : null,
    [counties, scope.county, statewide.enrolled, i0, i1],
  );

  /** Statewide series, always available as the comparison line. */
  const stateIndexed = useMemo(() => indexTo(statewide.enrolled, i0), [statewide.enrolled, i0]);
  const scopeIndexed = useMemo(() => indexTo(scope.enrolled, i0), [scope.enrolled, i0]);
  const childIndexed = useMemo(
    () => (scope.children ? indexTo(scope.children, i0) : null),
    [scope.children, i0],
  );

  const funnel = useMemo(() => buildFunnel(counties, statewide, i0, i1), [counties, statewide, i0, i1]);

  const layerStats = useMemo(() => buildLayerStats(counties), [counties]);

  const scatterPoints = useMemo(
    () =>
      counties.map((c) => {
        const sites = c.infra.food_bank + c.infra.cms_navigator + c.infra.chw + c.infra.counselor;
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

  const claim =
    isCounty && chapter.countyClaim ? chapter.countyClaim(scope.label) : chapter.claim;

  return (
    <div className={styles.page}>
      <nav className={styles.tabs} aria-label="Insights chapters">
        {CHAPTERS.map((c) => (
          <Link
            key={c.slug}
            to={{ pathname: `/insights/${c.slug}`, search: window.location.search }}
            className={`${styles.tab} ${c.slug === chapter.slug ? styles.tabActive : ''}`}
          >
            {c.title}
          </Link>
        ))}
      </nav>

      <main className={styles.content}>
        <ScopeBar
          counties={counties}
          scope={scope}
          change={change}
          rank={rank}
          window={state.window}
          onSelect={(geoid) => dispatch({ type: 'setScope', geoid })}
        />

        <h2 className={styles.claim}>{claim}</h2>

        <div className={styles.chartGrid}>
        {/* ------------------------------------------------------ tab 1 */}
        {chapter.slug === 'decline' && (
          <>
            <ChartCard
              title={`Enrolled individuals, ${scope.label}`}
              subhead="Enrolled individuals, monthly"
            >
              <LineChart
                months={months}
                series={[{ label: scope.label, values: scope.enrolled }]}
                shade={state.window}
                formatY={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : fmtInt(v))}
                viewWidth={VIEW_WIDTH}
                title={`Enrolled individuals in ${scope.label}`}
              />
            </ChartCard>

            {isCounty && (
              <ChartCard
                title={`${scope.label} against Texas`}
                subhead={`Indexed, ${fmtMonthBody(state.window[0])} = 100`}
              >
                <IndexedLines
                  months={months}
                  refIndex={i0}
                  series={[
                    { label: 'Texas', values: stateIndexed, color: 'var(--text-faint)', dashed: true },
                    {
                      label: scope.label,
                      values: scopeIndexed,
                      color: 'var(--ja-burgundy)',
                      emphasis: true,
                    },
                  ]}
                  viewWidth={VIEW_WIDTH}
                  title={`${scope.label} indexed against Texas`}
                />
              </ChartCard>
            )}

            <ChartCard
              title="Month-over-month change"
              subhead="Month-over-month change in enrolled individuals"
            >
              <ColumnChart
                months={months.slice(i0, i1 + 1)}
                values={monthlyChange(scope.enrolled).slice(i0, i1 + 1)}
                annotations={isCounty ? [] : [{ month: '2025-11', label: 'NOV −110k' }]}
                viewWidth={VIEW_WIDTH}
                height={220}
              />
            </ChartCard>

            <ChartCard
              title="Share of residents enrolled"
              subhead={`Enrolled as a share of ${scope.label}'s population`}
            >
              <LineChart
                months={months}
                series={[
                  {
                    label: scope.label,
                    values: participationShare(scope.enrolled, scope.population),
                    color: 'var(--ja-teal)',
                  },
                ]}
                shade={state.window}
                formatY={(v) => fmtPct(v, 1)}
                viewWidth={VIEW_WIDTH}
                height={200}
                title={`Share of residents enrolled in ${scope.label}`}
              />
            </ChartCard>
          </>
        )}

        {/* ------------------------------------------------------ tab 2 */}
        {chapter.slug === 'who' && (
          <>
            {childIndexed && (
              <ChartCard
                title={`Children against the whole caseload, ${scope.label}`}
                subhead={`Indexed, ${fmtMonthBody(state.window[0])} = 100`}
              >
                <IndexedLines
                  months={months}
                  refIndex={i0}
                  series={[
                    {
                      label: 'All enrolled',
                      values: scopeIndexed,
                      color: 'var(--text-faint)',
                      dashed: true,
                    },
                    {
                      label: 'Children under 18',
                      values: childIndexed,
                      color: 'var(--ja-burgundy)',
                      emphasis: true,
                    },
                  ]}
                  viewWidth={VIEW_WIDTH}
                  title={`Children against all enrolled in ${scope.label}`}
                />
              </ChartCard>
            )}

            <ChartCard
              title="Change by age band"
              subhead={`Enrolled individuals by age band, ${fmtMonthBody(state.window[0])} → ${fmtMonthBody(state.window[1])}`}
              statewideOnly
              scoped={isCounty}
            >
              <DumbbellChart
                rows={statewide.age_bands.map((b) => ({
                  label: b.band,
                  from: b.july_enrolled,
                  to: b.latest_enrolled,
                  pctChange: b.pct_change,
                }))}
                viewWidth={VIEW_WIDTH}
              />
            </ChartCard>

            <ChartCard
              title="Age bands, indexed"
              subhead="Age bands, indexed to 100 at the window start"
              statewideOnly
              scoped={isCounty}
            >
              <IndexedLines
                months={[state.window[0], state.window[1]]}
                refIndex={0}
                series={statewide.age_bands.map((b) => ({
                  label: b.band,
                  values: [100, 100 * (1 + b.pct_change)],
                }))}
                viewWidth={VIEW_WIDTH}
                height={220}
                title="Age bands indexed to the window start"
              />
            </ChartCard>
          </>
        )}

        {/* ------------------------------------------------------ tab 3 */}
        {chapter.slug === 'domains' && (
          <>
            {scope.county ? (
              <ChartCard
                title={`${scope.label} on all four domains`}
                subhead="Percentile within Texas, by domain"
              >
                <div className={styles.domainList}>
                  {SCORE_LAYERS.map((l) => {
                    const raw = scope.county?.[scoreField(l.key)];
                    const value = typeof raw === 'number' ? raw : null;
                    const isComposite = l.key === 'composite';
                    return (
                      <div key={l.key} className={styles.domainRow}>
                        <div className={styles.domainHead}>
                          <span className={styles.domainLabel}>{l.label}</span>
                          <span className={`${styles.domainValue} tabular`}>
                            {value == null
                              ? 'no data'
                              : isComposite
                                ? value.toFixed(2)
                                : fmtPercentile(value)}
                            {layerStats.rank[l.key]?.get(scope.county.geoid)
                              ? ` · ${layerStats.rank[l.key].get(scope.county.geoid)} of ${layerStats.total}`
                              : ''}
                          </span>
                        </div>
                        <DomainScale
                          layer={l.key}
                          value={value}
                          median={layerStats.median[l.key] ?? 0}
                          domain={isComposite ? [0, 4] : [0, 1]}
                        />
                      </div>
                    );
                  })}
                </div>
              </ChartCard>
            ) : (
              <Callout tone="info" title="Pick a county">
                Choose a county above to compare its four domain percentiles.
              </Callout>
            )}

            <ChartCard
              title="Counties at the top fifth on more than one domain"
              subhead="Counties by number of domains in the worst fifth"
            >
              <ColumnChart
                months={['0', '1', '2', '3', '4']}
                values={[0, 1, 2, 3, 4].map(
                  (n) => counties.filter((c) => c.cumulative_impact === n).length,
                )}
                labelEveryMonth
                viewWidth={VIEW_WIDTH}
                height={200}
              />
            </ChartCard>
          </>
        )}

        {/* ------------------------------------------------------ tab 4 */}
        {chapter.slug === 'capacity' && (
          <>
            {scope.county && (
              <ChartCard
                title={`Listed in ${scope.label}`}
                subhead="Listed sites by registry"
              >
                <div className={styles.registryGrid}>
                  {INFRA_TYPES.map((t) => {
                    const n = scope.county.infra[t.key];
                    return (
                      <div
                        key={t.key}
                        className={`${styles.registry} ${n === 0 ? styles.registryAbsent : ''}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                          <InfraGlyph type={t.key} x={7} y={7} size={4} legend />
                        </svg>
                        <span className={styles.registryLabel}>{t.label}</span>
                        <span className={`${styles.registryCount} tabular`}>
                          {n === 0 ? 'none listed' : n}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ChartCard>
            )}

            <ChartCard
              title="Where need meets capacity"
              subhead="Vulnerability percentile against listed sites per 10,000 residents"
            >
              <ScatterChart
                points={scatterPoints}
                viewWidth={VIEW_WIDTH}
                height={340}
                hovered={scope.county?.geoid ?? null}
              />
            </ChartCard>
          </>
        )}

        {/* ------------------------------------------------------ tab 5 */}
        {chapter.slug === 'rate-count' && (
          <>
            {/*
              Cut to one line on 2026-09-11 with the rest of the page's prose, but
              NOT removed: the published limits describe sampling noise only, so
              the band catches {n} of 254 counties where a calibrated one would
              catch about 5%. Without this the chart reads as "110 outliers",
              which is not a finding this page supports. Full reasoning in
              docs/SPEC-DEVIATIONS.md §Q2.
            */}
            <Callout tone="caution" title="Limits are not calibrated">
              {funnel.points.filter((p) => p.outside).length} of {funnel.points.length} counties
              fall outside the published limits, so the chart does not mark outliers. See §Q2.
            </Callout>

            <ChartCard
              title="Percentage change against caseload size"
              subhead="Percent change against caseload size, with 2-sd limits"
            >
              <FunnelPlot
                data={funnel}
                highlight={scope.county?.geoid ?? null}
                viewWidth={VIEW_WIDTH}
                height={340}
              />
            </ChartCard>

            <ChartCard
              title="The ten largest absolute losses"
              subhead="Top 10 counties by people who left"
            >
              <DumbbellChart
                rows={[...counties]
                  .map((c) => {
                    const w = windowChange(c.snap_enrolled, i0, i1);
                    return { name: c.name, ...w };
                  })
                  .sort((a, b) => a.absolute - b.absolute)
                  .slice(0, 10)
                  .map((r) => ({
                    label: r.name,
                    from: r.start,
                    to: r.end,
                    pctChange: r.pct ?? 0,
                  }))}
                xMax={Math.max(
                  ...counties.map((c) => c.snap_enrolled[i0] ?? 0),
                )}
                viewWidth={VIEW_WIDTH}
              />
            </ChartCard>
          </>
        )}

        {chapter.pending.map((title) => (
          <PlaceholderCard key={title} title={title} />
        ))}
        </div>

        {data.isFixture && (
          <p className={styles.fixtureNote}>
            Figures on this page are generated against the build spec §3 contract and calibrated to
            the published statewide findings. They are not the real export.
          </p>
        )}
      </main>
    </div>
  );
}
