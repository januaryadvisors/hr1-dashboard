/**
 * Insights page — spec §8. One scrolling page of four sections (2026-10-16).
 *
 * SCOPED. Every chart reads from a `Scope` (src/lib/insights.js) — Texas, or one
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
 */
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { Callout } from '../components/shell/Callout';
import { ColumnChart } from '../components/charts/ColumnChart';
import { DumbbellChart } from '../components/charts/DumbbellChart';
import { FunnelPlot } from '../components/charts/FunnelPlot';
import { IndexedLines } from '../components/charts/IndexedLines';
import { LineChart } from '../components/charts/LineChart';
import { ScopeBar } from '../components/shell/ScopeBar';
import {
  ageBandRows,
  buildFunnel,
  buildScope,
  peersFor,
  indexTo,
  monthlyChange,
  participationShare,
  benefitShortfall,
  windowChange,
  windowLoss,
} from '../lib/insights';
import { fmtDelta, fmtInt, fmtMonthBody, fmtMonthFull, fmtPct } from '../lib/format';
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
 * ONE PAGE, FOUR SECTIONS — 2026-10-16. It was five tabbed chapters, each led
 * by a written claim; the client's direction is one scrolling page that shows
 * the numbers and lets them speak. The left column is now a section index, and
 * the old tab slugs in /insights/:tab land on the matching section.
 *
 * Dropped in the same pass: the four-domains chapter, the capacity chapter
 * (and its scatter), the ten-largest-losses chart and the placeholder cards.
 */
const SECTIONS = [
  { id: 'enrollment', title: 'Enrollment' },
  { id: 'who', title: 'Who is falling off' },
  { id: 'children', title: 'Children against the whole caseload' },
  { id: 'size', title: 'Change against caseload size' },
];

/** The old tab slugs, so a shared /insights/<tab> link still lands somewhere sensible. */
const LEGACY_TAB = { decline: 'enrollment', who: 'who', 'rate-count': 'size' };

/** Viewbox width for a chart that spans both columns — about its rendered width. */
const WIDE_VIEW_WIDTH = 960;

/**
 * PRINT SIZES. On paper every card is half the page wide and the whole report
 * aims for one Letter page, so while printing each chart is drawn at about its
 * printed width (a half-width card on a 0.4in-margin page is ~350px) and short.
 * Drawn at the screen sizes and scaled down, the wide charts' 12px axis type
 * printed at ~4px.
 */
const PRINT_VIEW_WIDTH = 350;
const PRINT_CHART_H = 112;

/** Marks a chart the data cannot scope below state level. */
function StatewideBadge({ scoped }) {
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

  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);

  const { districtCounts } = data;
  const scope = useMemo(
    () => buildScope(counties, byGeoid, statewide, state.scope, districtCounts),
    [counties, byGeoid, statewide, state.scope, districtCounts],
  );
  /** Scoped to anything below the state — the comparison lines and badges key off this. */
  const isScoped = scope.kind !== 'state';

  /** What the scope is ranked and plotted against: counties, or the same chamber's districts. */
  const peers = useMemo(
    () => peersFor(scope, counties, districtCounts),
    [scope, counties, districtCounts],
  );

  const change = useMemo(() => windowChange(scope.enrolled, i0, i1), [scope.enrolled, i0, i1]);

  /** Statewide series, always available as the comparison line. */
  const stateIndexed = useMemo(() => indexTo(statewide.enrolled, i0), [statewide.enrolled, i0]);
  const scopeIndexed = useMemo(() => indexTo(scope.enrolled, i0), [scope.enrolled, i0]);
  const childIndexed = useMemo(
    () => (scope.children ? indexTo(scope.children, i0) : null),
    [scope.children, i0],
  );

  /** The report box's four figures — the same for every place. */
  const figures = useMemo(() => {
    const shortfall = benefitShortfall(scope.payments, i0, i1);
    return {
      people: windowLoss(scope.enrolled, i0, i1),
      children: windowLoss(scope.children, i0, i1),
      seniors: windowLoss(scope.seniors, i0, i1),
      shortfall,
      baseFromLabel: shortfall ? fmtMonthBody(months[shortfall.baseFrom]) : null,
      sinceLabel:
        state.window[0] === statewide.meta.policy_start ? 'H.R. 1' : fmtMonthBody(state.window[0]),
    };
  }, [scope, i0, i1, months, state.window, statewide.meta.policy_start]);

  /**
   * Print / save as PDF: the browser's own dialog, with the page's print
   * stylesheet (InsightsPage.module.css, ScopeBar.module.css). The document
   * title is the PDF's default file name, so it names the place and window for
   * the length of the dialog and is put back after.
   */
  const printReport = () => {
    const previous = document.title;
    document.title = `${scope.label} — SNAP and H.R. 1, ${fmtMonthBody(state.window[0])} to ${fmtMonthBody(state.window[1])}`;
    const restore = () => {
      document.title = previous;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  };

  /**
   * True for the length of a print, whichever way it was started (the button or
   * the browser's own Print). flushSync so the charts have re-rendered at their
   * print sizes before the browser lays the page out for paper.
   */
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  /** Chart sizes for the medium: screen, or a half-width card on paper. */
  const vw = printing ? PRINT_VIEW_WIDTH : VIEW_WIDTH;
  const wideVw = printing ? PRINT_VIEW_WIDTH : WIDE_VIEW_WIDTH;
  const chartH = (screen) => (printing ? PRINT_CHART_H : screen);

  const funnel = useMemo(() => buildFunnel(peers.units, i0, i1), [peers, i0, i1]);
  const funnelOutside = funnel.points.filter((p) => p.outside).length;
  /** A 2-sd band should catch ~5%; past 10% it is not describing this window. */
  const funnelCalibrated = funnelOutside <= funnel.points.length * 0.1;

  // ------------------------------------------------------------ section index
  /** Which section is in view, for the index's highlight. */
  const [inView, setInView] = useState(SECTIONS[0].id);
  useEffect(() => {
    const els = SECTIONS.map((sec) => document.getElementById(sec.id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        )[0];
        if (hit) setInView(hit.target.id);
      },
      // A section counts as "in view" once it reaches the upper third.
      { rootMargin: '-15% 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const goTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - header - 16, behavior: 'smooth' });
  };

  // An old tab link lands on its section, once.
  useEffect(() => {
    const id = LEGACY_TAB[tab];
    if (id && id !== SECTIONS[0].id) requestAnimationFrame(() => goTo(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lost = change.absolute;
  const since = fmtMonthFull(state.window[0]);
  const where = isScoped ? ` in ${scope.label}` : '';
  const headline =
    lost < 0
      ? `${fmtInt(-lost)} individuals have lost enrollment${where} since ${since}.`
      : lost > 0
        ? `${fmtInt(lost)} more individuals are enrolled${where} than in ${since}.`
        : `Enrollment${where} is unchanged since ${since}.`;

  const texasLine = { label: 'Texas', color: 'var(--text-faint)', dashed: true };

  /** November 2025, when Texas's new rules took effect — the label reads the data. */
  const novChange = monthlyChange(statewide.enrolled)[months.indexOf('2025-11')];

  return (
    <div className={styles.page}>
      <nav className={styles.tabs} aria-label="Insights sections">
        {SECTIONS.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className={`${styles.tab} ${inView === sec.id ? styles.tabActive : ''}`}
            aria-current={inView === sec.id ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault();
              goTo(sec.id);
            }}
          >
            {sec.title}
          </a>
        ))}
      </nav>

      <main className={styles.content}>
        <ScopeBar
          counties={counties}
          scope={scope}
          change={change}
          districtCounts={districtCounts}
          window={state.window}
          figures={figures}
          onSelect={(geoid) => dispatch({ type: 'setScope', geoid })}
          onPrint={printReport}
        />

        {/* ---------------------------------------------------- 1 Enrollment */}
        <section id="enrollment" className={styles.section}>
          <h2 className={styles.sectionTitle}>Enrollment</h2>
          {/* The number, plainly — no written claim (2026-10-16). */}
          <p className={styles.headline}>{headline}</p>
          <div className={styles.chartGrid}>
            {/*
              Counties and Texas cannot share a count axis — a county's line
              would lie flat along the bottom of Texas's 3.5M scale — so once a
              place is picked both lines are indexed to the window's start.
            */}
            <ChartCard
              title="Enrolled individuals"
              subhead={
                isScoped
                  ? `${scope.label} against Texas, indexed (${fmtMonthBody(state.window[0])} = 100)`
                  : 'Enrolled individuals, monthly'
              }
            >
              {isScoped ? (
                <IndexedLines
                  months={months}
                  refIndex={i0}
                  series={[
                    { ...texasLine, values: stateIndexed },
                    {
                      label: scope.label,
                      values: scopeIndexed,
                      color: 'var(--ja-burgundy)',
                      emphasis: true,
                    },
                  ]}
                  viewWidth={vw}
                  height={chartH(250)}
                  title={`${scope.label} indexed against Texas`}
                />
              ) : (
                <LineChart
                  months={months}
                  series={[{ label: 'Texas', values: statewide.enrolled }]}
                  shade={state.window}
                  formatY={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : fmtInt(v))}
                  viewWidth={vw}
                  height={chartH(240)}
                  title="Enrolled individuals in Texas"
                />
              )}
            </ChartCard>

            <ChartCard
              title="Month-over-month change"
              subhead={`Change in enrolled individuals, ${scope.label}`}
            >
              <ColumnChart
                months={months.slice(i0, i1 + 1)}
                values={monthlyChange(scope.enrolled).slice(i0, i1 + 1)}
                annotations={
                  isScoped || !Number.isFinite(novChange)
                    ? []
                    : [{ month: '2025-11', label: `NOV ${fmtDelta(novChange / 1000)}k` }]
                }
                viewWidth={vw}
                height={chartH(220)}
              />
            </ChartCard>

            <ChartCard
              title="Share of residents enrolled"
              subhead={
                isScoped
                  ? `Enrolled as a share of the population, ${scope.label} and Texas`
                  : "Enrolled as a share of Texas's population"
              }
              wide
            >
              <LineChart
                months={months}
                series={[
                  ...(isScoped
                    ? [
                        {
                          ...texasLine,
                          values: participationShare(statewide.enrolled, statewide.meta.texas_population),
                        },
                      ]
                    : []),
                  {
                    label: scope.label,
                    values: participationShare(scope.enrolled, scope.population),
                    color: 'var(--ja-teal)',
                  },
                ]}
                shade={state.window}
                formatY={(v) => fmtPct(v, 1)}
                viewWidth={wideVw}
                height={chartH(260)}
                title={`Share of residents enrolled in ${scope.label}`}
              />
            </ChartCard>
          </div>
        </section>

        {/* --------------------------------------------- 2 Who is falling off */}
        <section id="who" className={styles.section}>
          <h2 className={styles.sectionTitle}>Who is falling off</h2>
          <div className={styles.chartGrid}>
            <ChartCard
              title="Age bands, indexed"
              subhead="Enrolled individuals by age band, indexed to 100 at the window start"
              statewideOnly
              scoped={isScoped}
            >
              <IndexedLines
                months={statewide.age_series ? months.slice(i0, i1 + 1) : [state.window[0], state.window[1]]}
                refIndex={0}
                series={statewide.age_bands.map((b) => ({
                  label: b.band,
                  // Monthly, from the band series, when the data carries it.
                  values: statewide.age_series
                    ? indexTo(statewide.age_series[b.band].slice(i0, i1 + 1), 0)
                    : [100, 100 * (1 + b.pct_change)],
                }))}
                viewWidth={vw}
                height={chartH(240)}
                title="Age bands indexed to the window start"
              />
            </ChartCard>

            <ChartCard
              title="Change by age band"
              subhead={`Enrolled individuals by age band, ${fmtMonthBody(state.window[0])} → ${fmtMonthBody(state.window[1])}`}
              statewideOnly
              scoped={isScoped}
            >
              <DumbbellChart
                rows={ageBandRows(statewide, i0, i1)}
                viewWidth={vw}
                rowH={printing ? 17 : 32}
              />
            </ChartCard>
          </div>
        </section>

        {/* ----------------------------- 3 Children against the whole caseload */}
        {childIndexed && (
          <section id="children" className={styles.section}>
            <h2 className={styles.sectionTitle}>Children against the whole caseload</h2>
            <div className={styles.chartGrid}>
              <ChartCard
                title={`Children and all enrolled, ${scope.label}`}
                subhead={`Indexed, ${fmtMonthBody(state.window[0])} = 100`}
                wide
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
                  viewWidth={wideVw}
                  height={chartH(280)}
                  refLabelRight={printing}
                  title={`Children against all enrolled in ${scope.label}`}
                />
              </ChartCard>
            </div>
          </section>
        )}

        {/* ------------------------------------ 4 Change against caseload size */}
        <section id="size" className={styles.section}>
          <h2 className={styles.sectionTitle}>Change against caseload size</h2>
          {/*
            Kept on one line, but NOT removed: the published limits describe
            sampling noise only, so the band catches far more than the ~5% a
            calibrated one would. Without this the chart reads as "110
            outliers", which is not a finding this page supports. Full
            reasoning in docs/SPEC-DEVIATIONS.md §Q2.
          */}
          {!funnelCalibrated && (
            <Callout tone="caution" title="Limits are not calibrated for this window">
              {funnelOutside} of {funnel.points.length} {peers.noun} fall outside the fitted limits,
              so the chart does not mark outliers. See §Q2.
            </Callout>
          )}
          <div className={styles.chartGrid}>
            <ChartCard
              title="Percentage change against caseload size"
              subhead={`Percent change against caseload size, one point per ${peers.singular}. The band is the spread expected at that size (2 sd, fitted to this window); ${funnelOutside} of ${funnel.points.length} ${peers.noun} fall outside it.`}
              wide
            >
              <FunnelPlot
                data={funnel}
                markOutliers={funnelCalibrated}
                highlight={isScoped ? scope.key : null}
                viewWidth={wideVw}
                height={chartH(420)}
              />
            </ChartCard>
          </div>
        </section>

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
