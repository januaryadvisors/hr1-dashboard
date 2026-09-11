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
import { Callout } from '../components/Callout';
import { ColumnChart } from '../components/ColumnChart';
import { DomainScale } from '../components/DomainScale';
import { DumbbellChart } from '../components/DumbbellChart';
import { FunnelPlot } from '../components/FunnelPlot';
import { IndexedLines } from '../components/IndexedLines';
import { InfraGlyph } from '../components/InfraGlyph';
import { LineChart } from '../components/LineChart';
import { ScatterChart, type ScatterPoint } from '../components/ScatterChart';
import { ScopeBar } from '../components/ScopeBar';
import { buildLayerStats } from '../components/CountyTooltip';
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

/** Charts render around 940px wide in the content column. */
const VIEW_WIDTH = 940;

interface Chapter {
  slug: string;
  title: string;
  claim: string;
  /** The claim, rewritten for a single county. */
  countyClaim?: (name: string) => string;
  doesNotSupport: string;
  pending: string[];
  banner?: { tone: 'caution' | 'blocked'; text: string };
}

const CHAPTERS: Chapter[] = [
  {
    slug: 'decline',
    title: 'The decline has not stopped',
    claim: 'Enrollment is still falling, and the pace is flat rather than slowing.',
    countyClaim: (n) => `How ${n}'s caseload has moved, against Texas as a whole.`,
    doesNotSupport:
      'Causal attribution to H.R. 1. Emergency-allotment expiry and the Medicaid unwinding overlap this window.',
    pending: [],
  },
  {
    slug: 'who',
    title: 'Who is falling off',
    claim: 'Working-age adults and children carry the entire decline; seniors are unchanged.',
    countyClaim: (n) => `Children are leaving SNAP in ${n} faster than the caseload as a whole.`,
    doesNotSupport:
      'Any claim about why a given band left. The age breakdown is statewide and descriptive — it is not available per county.',
    pending: ['People vs households, indexed (statewide only)'],
  },
  {
    slug: 'domains',
    title: 'The four domains disagree',
    claim: 'No single ranking of counties can be honest about all four exposures.',
    countyClaim: (n) => `${n} does not sit in the same place on all four domains.`,
    doesNotSupport:
      'A dominant-domain map. Domains win 71 / 75 / 44 / 64 counties and the median margin is 0.105 — it would colour Texas on noise.',
    pending: ['Small multiples with synced hover', 'Correlation matrix'],
  },
  {
    slug: 'capacity',
    title: 'Where exposure meets thin capacity',
    claim: 'The counties with the least enrollment help are not the ones with the most.',
    countyClaim: (n) => `What is listed in ${n} to help people stay enrolled.`,
    doesNotSupport:
      'Requirement F4. Navigator counts alone cannot answer whether capacity is adequate.',
    pending: ['Infrastructure coverage bars', 'Gap-county table'],
    banner: {
      tone: 'caution',
      text:
        'Capacity here is a floor, not a measure. Feeding Texas still owes food-bank enrollment FTE and households-reached by county.',
    },
  },
  {
    slug: 'rate-count',
    title: 'Rate and count are two arguments',
    claim:
      'Targeting by rate and targeting by count select different counties, and both are legitimate.',
    countyClaim: (n) => `Is ${n}'s decline unusual for a caseload its size?`,
    doesNotSupport:
      'A single "correct" target list. The two framings are different questions, not different accuracies.',
    pending: ['Paired rate/count maps'],
  },
];

/** Marks a chart the data cannot scope below state level. */
function StatewideBadge({ scoped }: { scoped: boolean }) {
  if (!scoped) return null;
  return (
    <span className={styles.badge} title="Published statewide only — see §3.3">
      Statewide figure
    </span>
  );
}

function ChartCard({
  title,
  subhead,
  footnote,
  statewideOnly = false,
  scoped = false,
  children,
}: {
  title: string;
  subhead?: string;
  footnote?: React.ReactNode;
  statewideOnly?: boolean;
  scoped?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.chartBlock}>
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

  const scatterPoints = useMemo<ScatterPoint[]>(
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

        {chapter.banner && <Callout tone={chapter.banner.tone}>{chapter.banner.text}</Callout>}

        {/* ------------------------------------------------------ tab 1 */}
        {chapter.slug === 'decline' && (
          <>
            <ChartCard
              title={`Enrolled individuals, ${scope.label}`}
              subhead="The full published series. The shaded band is the window every figure on this page is measured over."
              footnote="Observed enrollment, not a modelled estimate of who H.R. 1 affected."
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
                subhead={`Both rebased to 100 at ${fmtMonthBody(state.window[0])}. Below the line is a loss; the steeper line is losing faster.`}
                footnote="Indexed because levels cannot answer this — a rural caseload is flat against the bottom of any axis Harris is also on."
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
              subhead="Losses of 50k to 80k every month since November, statewide. No floor in the data yet."
              footnote={`Change in enrolled individuals, ${scope.label}.`}
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
              subhead={
                isCounty
                  ? `Enrolled as a share of ${scope.label}'s population. A county's participation rate is not comparable to the statewide 9.3% without knowing its poverty rate.`
                  : '11.0% of Texans in July 2025, 9.3% now.'
              }
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
                subhead={`Both rebased to 100 at ${fmtMonthBody(state.window[0])}. Where the child line falls faster, children are leaving quicker than the caseload overall.`}
                footnote={
                  <>
                    Child enrollment is <strong>not in the build spec&rsquo;s §3 contract</strong> —
                    the county-by-month series is a calibrated fixture pending a real export. See
                    docs/SPEC-DEVIATIONS.md §A4.
                  </>
                }
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
              subhead={`${fmtMonthBody(state.window[0])} → ${fmtMonthBody(state.window[1])}. Working-age adults carry the steepest fall; over-65s are flat.`}
              statewideOnly
              scoped={isCounty}
              footnote={
                isCounty
                  ? `Age bands are published for Texas only (§3.3). These are NOT ${scope.label} figures — quoting them as county numbers would be wrong.`
                  : 'Statewide age bands, descriptive. Nothing here says why a band left.'
              }
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
              subhead="The same five bands rebased to 100, so the shape of each decline is comparable."
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
                subhead="Caret is this county; the tick is the state median. A county high on one domain is routinely middling on another — which is why there is no single ranking."
                footnote="Percentiles within Texas. Every estimate ships with its margin of error in the download."
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
                            {layerStats.rank[l.key]?.get(scope.county!.geoid)
                              ? ` · ${layerStats.rank[l.key]!.get(scope.county!.geoid)} of ${layerStats.total}`
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
                The domain comparison is a per-county reading. Choose a county above to see where it
                sits on each of the four domains against the state median.
              </Callout>
            )}

            <ChartCard
              title="Counties at the top fifth on more than one domain"
              subhead="Cumulative impact: how many of the four domains a county is in the worst fifth of. Most counties are in none or one; two is already unusual."
              footnote="Overlay and filter only, never a fill — the distribution is far too lopsided to colour a state by (§11)."
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
                subhead="Four registries. Presence, not capacity — a county with one listed site is not therefore served."
                footnote={
                  scope.county.is_gap
                    ? 'This county is a gap county: top-quintile vulnerability with no food bank site and no navigator listed.'
                    : undefined
                }
              >
                <div className={styles.registryGrid}>
                  {INFRA_TYPES.map((t) => {
                    const n = scope.county!.infra[t.key];
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
              subhead="Vulnerability percentile against listed enrollment-support sites per 10,000 residents. The bottom-right quadrant is the gap: high need, nothing listed to meet it."
              footnote={`${counties.filter((c) => c.infra.cms_navigator === 0).length} of 254 counties have zero CMS navigators, so they sit flat on the axis — the inventory is thin, and that is the finding.`}
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
            <Callout tone="caution" title="The control limits are not calibrated to this data">
              {funnel.points.filter((p) => p.outside).length} of {funnel.points.length} counties
              fall outside the published 2-standard-deviation limits. A calibrated band would catch
              about 5%. The published limits describe <strong>sampling noise only</strong>{' '}
              (<code>sd = 0.9/√caseload</code>), while the spread across counties is about 4.2
              percentage points — roughly seven times the band at a 10,000 caseload. So the chart
              below does not mark outliers, and <strong>&ldquo;110 counties are outliers&rdquo; is
              not a finding this page supports.</strong> Either the limits need an over-dispersion
              term or the county variation is real structure rather than noise; that is a question
              for the analysis, not the dashboard. See docs/SPEC-DEVIATIONS.md §Q2.
            </Callout>

            <ChartCard
              title="Percentage change against caseload size"
              subhead="A funnel plot. The band is the published 2-standard-deviation limits, which widen to the left because a small caseload moves on fewer households. What the chart shows reliably is how much counties vary, and that the variation is not explained by caseload size."
              footnote={
                <>
                  This is still the chart that stops a small county being over-read: a 300-person
                  caseload can swing 20% on sixty households, so a percentage rank alone would put
                  ten tiny counties at the top every time. Limits come from the published funnel in{' '}
                  <code>statewide.json</code>, not from a curve fitted here.
                </>
              }
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
              subhead="Ranked by people, not percent. These are different counties from the steepest-percentage list, and both lists are legitimate answers to different questions."
              footnote="Targeting by count sends help where the most people left; targeting by rate sends it where the largest share of a community left."
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

        {chapter.pending.length > 0 && (
          <Callout tone="info" title="Still to build">
            <ul className={styles.pending}>
              {chapter.pending.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        )}

        <p className={styles.doesNotSupport}>
          <strong>What this does not support:</strong> {chapter.doesNotSupport}
        </p>

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
