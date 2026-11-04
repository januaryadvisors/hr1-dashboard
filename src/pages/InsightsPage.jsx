/**
 * Insights page — spec §8. One scrolling page of four sections.
 *
 * SCOPED. Every chart reads from a `Scope` (src/lib/insights.js) — Texas, one
 * county, several counties added together (`?county=48201,48157`) or a
 * district — so the page doubles as a county stat page for sharing with people who
 * will never touch the map: `/insights/decline?county=48201` is the link, and it
 * is just the address bar after picking a county.
 *
 * Every chart describes the place picked, the age bands included — the whole
 * purpose is to hand numbers to someone who will repeat them, so none of them
 * may quietly be the statewide figure.
 */
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { loadDistrictShapes } from '../data/load';
import { DumbbellChart } from '../components/charts/DumbbellChart';
import { IndexedLines } from '../components/charts/IndexedLines';
import { LineChart } from '../components/charts/LineChart';
import { LossMap } from '../components/charts/LossMap';
import { PieChart } from '../components/charts/PieChart';
import { PlaceRankList, rankUnits } from '../components/charts/PlaceRankList';
import { DistrictMethod } from '../components/shell/DistrictMethod';
import { ScopeBar } from '../components/shell/ScopeBar';
import {
  ageBandRows,
  ageGroupLoss,
  ageLeadTitle,
  whoHeadline,
  buildScope,
  peersFor,
  indexTo,
  benefitShortfall,
  windowChange,
  windowLoss,
} from '../lib/insights';
import { PHONE } from '../lib/breakpoints';
import { cx } from '../lib/cx';
import { fmtDelta, fmtInt, fmtMillions, fmtMonthBody, fmtMonthFull, fmtOrdinal, fmtPct } from '../lib/format';
import { buildLayerValues } from '../lib/layerValues';
import { lossShare, windowEnds } from '../lib/series';
import { scrollBelowHeader } from '../lib/layout';
import { useLoaded } from '../lib/useLoaded';
import { useMediaQuery } from '../lib/useMediaQuery';
import styles from './InsightsPage.module.css';

/*
 * Each chart fills the column, around 900px wide, and its viewBox is authored
 * near that width on purpose: the charts scale to their container, so a viewBox
 * twice the rendered width would halve the apparent size of every axis label.
 * On a phone the column is a third as wide, so the charts are drawn narrower.
 */
const VIEW_WIDTH = 960;
const PHONE_VIEW_WIDTH = 470;

/**
 * The age pie's slices: burgundy for children, as the page's loss colour, then
 * blue and amber. Checked with the dataviz palette validator against white
 * (lightness band, chroma, colourblind and normal-vision separation, 3:1 contrast).
 */
const AGE_COLORS = { '0–17': '#b44a3f', '18–64': '#3a75a8', '65+': '#c98316' };

/** The page's sections, in order. The left column indexes them. */
const SECTIONS = [
  { id: 'enrollment', title: 'Enrollment' },
  { id: 'who', title: 'Who is falling off' },
  { id: 'map', title: 'Across Texas' },
];

/** Indexed too while a district is shown: the note on how its figures are built. */
const METHOD_SECTION = { id: 'methodology', title: 'Methodology' };

/** The section each /insights/:tab slug opens at, so a shared tab link lands somewhere sensible. */
const TAB_SECTION = { decline: 'enrollment', who: 'who' };

/** useLoaded's loader while no district is picked: nothing to fetch. */
const loadNothing = () => Promise.resolve(null);

/**
 * PRINT SIZES. On paper every card is the full page width and the whole report
 * aims for one Letter page, so while printing each chart is drawn at about its
 * printed width (a full-width card on a 0.4in-margin page is ~720px) and short
 * enough that the three cards and the report box share the page.
 */
const PRINT_VIEW_WIDTH = 720;
/** The age pie and the arrow chart share a row on paper, so the arrows draw at half width. */
const PRINT_HALF_VIEW_WIDTH = 350;
const PRINT_CHART_H = 140;

function ChartCard({ title, subhead, children }) {
  return (
    <section className={styles.chartBlock}>
      <h2 className={styles.chartTitle}>{title}</h2>
      {subhead && <p className={styles.chartSubhead}>{subhead}</p>}
      {children}
    </section>
  );
}

export default function InsightsPage() {
  const { tab } = useParams();
  const { data, projection, statePath, state, dispatch } = useApp();
  const { counties, byGeoid, statewide } = data;
  const months = statewide.meta.months;

  /** H.R. 1 to the latest month, always. The Map page's period slider does not reach this page. */
  const win = useMemo(() => [statewide.meta.policy_start, months.at(-1)], [statewide, months]);
  const i0 = months.indexOf(win[0]);
  const i1 = months.length - 1;

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

  /** The report box's three figures — the same for every place. */
  const figures = useMemo(() => {
    const shortfall = benefitShortfall(scope.payments, i0, i1);
    return {
      people: windowLoss(scope.enrolled, i0, i1),
      children: windowLoss(scope.children, i0, i1),
      shortfall,
      baseFromLabel: shortfall ? fmtMonthBody(months[shortfall.baseFrom]) : null,
      // A no-break space, so a wrapped line never ends on "H.R.".
      sinceLabel: 'H.R.\u00a01',
    };
  }, [scope, i0, i1, months]);

  /**
   * Print / save as PDF: the browser's own dialog, with the page's print
   * stylesheet (InsightsPage.module.css, ScopeBar.module.css). The document
   * title is the PDF's default file name, so it names the place and window for
   * the length of the dialog and is put back after.
   */
  const printReport = () => {
    const previous = document.title;
    document.title = `${scope.label} — SNAP and H.R. 1, ${fmtMonthBody(win[0])} to ${fmtMonthBody(win[1])}`;
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
  const phone = useMediaQuery(PHONE);
  /** Chart sizes for the medium: screen, phone, or a full-width card on paper. */
  const vw = printing ? PRINT_VIEW_WIDTH : phone ? PHONE_VIEW_WIDTH : VIEW_WIDTH;
  const chartH = (screen) => (printing ? PRINT_CHART_H : screen);

  /** The map's shapes: every county, or every district of the picked one's chamber. */
  const districtShapes = useLoaded(scope.district ? loadDistrictShapes : loadNothing);
  const mapShapes = useMemo(() => {
    const features = scope.district ? districtShapes?.[scope.district.plan] : data.geometry.counties;
    if (!features) return null;
    return features.map((f) => ({
      key: f.properties.geoid,
      name: scope.district
        ? (districtCounts.byId.get(f.properties.geoid)?.name ?? f.properties.geoid)
        : `${f.properties.name} County`,
      d: projection.path(f) ?? '',
    }));
  }, [scope.district, districtShapes, districtCounts, data.geometry.counties, projection]);
  /** The keys outlined on the map: the place picked, or each county added together. */
  const placeKeys = useMemo(
    () => (scope.kind === 'counties' ? scope.counties.map((c) => c.geoid) : [scope.key]),
    [scope],
  );
  /** The picked place's boundary for the report box: its own shape (every county's, together), or Texas. */
  const outline = useMemo(() => {
    const base = { statePath, canvas: projection, label: scope.label };
    if (scope.kind === 'state') return { ...base, d: null, bounds: null };
    const features = scope.district ? districtShapes?.[scope.district.plan] : data.geometry.counties;
    const fs = placeKeys.map((k) => features?.find((x) => x.properties.geoid === k)).filter(Boolean);
    if (!fs.length) return null;
    const boxes = fs.map((f) => projection.path.bounds(f));
    return {
      ...base,
      d: fs.map((f) => projection.path(f)).join(''),
      bounds: [
        [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))],
        [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))],
      ],
    };
  }, [scope, placeKeys, districtShapes, data.geometry.counties, projection, statePath]);

  const mapValues = useMemo(() => buildLayerValues(peers.units, 'loss', i0, i1), [peers, i0, i1]);
  /** The map's places for the rank list beside it: people lost, and the share the map shows. */
  const rankPlaces = useMemo(
    () =>
      peers.units.map((u) => ({
        key: u.geoid,
        // "District 18" rather than "Congressional District 18": the heading says which chamber.
        name: u.name.replace(/^Congressional District /, 'District '),
        lost: mapValues.count?.get(u.geoid) ?? null,
        share: mapValues.fill.get(u.geoid) ?? null,
      })),
    [peers, mapValues],
  );
  /** The same places in rank order, for the section's sentence. */
  const ranked = useMemo(() => rankUnits(rankPlaces), [rankPlaces]);

  // ------------------------------------------------------------ section index
  /** The sections on the page: the three, and the methodology note under a district. */
  const sections = useMemo(() => (scope.district ? [...SECTIONS, METHOD_SECTION] : SECTIONS), [scope.district]);
  /** Which section is in view, for the index's highlight. */
  const [inView, setInView] = useState(SECTIONS[0].id);
  useEffect(() => {
    const els = sections.map((sec) => document.getElementById(sec.id)).filter(Boolean);
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
    /*
       At the foot of the page the last section can be too short to reach the
       upper third (the methodology note), so the bottom of the page lights it.
    */
    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) setInView(sections.at(-1).id);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [sections]);

  const goTo = (id) => {
    const el = document.getElementById(id);
    if (el) scrollBelowHeader(el);
  };

  // A tab link lands on its section, once.
  useEffect(() => {
    const id = TAB_SECTION[tab];
    if (id && id !== SECTIONS[0].id) requestAnimationFrame(() => goTo(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lost = change.absolute;
  const since = fmtMonthFull(win[0]);
  const where = isScoped ? ` in ${scope.label}` : '';
  const headline =
    lost < 0
      ? `${fmtInt(-lost)} individuals have lost enrollment${where} since ${since}.`
      : lost > 0
        ? `${fmtInt(lost)} more individuals are enrolled${where} than in ${since}.`
        : `Enrollment${where} is unchanged since ${since}.`;

  const texasLine = { label: 'Texas', color: 'var(--text-faint)', dashed: true };

  /**
   * The picked place's share lost against Texas's, for the map's subhead. The
   * two are compared as printed, so "higher" never sits between equal figures.
   */
  const several = scope.kind === 'counties';
  const placeShare = several
    ? lossShare(windowEnds(scope.enrolled, i0, i1))
    : mapValues.fill.get(scope.key);
  const placeAgainstTexas = (() => {
    if (placeShare == null) return `${scope.label} ${several ? 'are' : 'is'} outlined.`;
    const here = fmtPct(placeShare, 1);
    const texas = fmtPct(mapValues.statewideShare, 1);
    const relation =
      here === texas
        ? 'the same as'
        : placeShare > mapValues.statewideShare
          ? 'higher than'
          : 'lower than';
    return several
      ? `${scope.label}, outlined, are ${here} together, ${relation} the ${texas} for Texas.`
      : `${scope.label}, outlined, is ${here}, ${relation} the ${texas} for Texas.`;
  })();

  /** Under 10,000 residents, an age band can be a few dozen people. */
  const smallNumbers =
    scope.county?.small_denominator || (several && scope.population < 10_000)
      ? ' Small numbers: a few people move these a long way.'
      : '';

  /** Who left, in three age groups — the pie. A group that grew has no slice. */
  const ageGroups = useMemo(() => ageGroupLoss(scope.ageSeries, i0, i1), [scope.ageSeries, i0, i1]);
  const anyLost = ageGroups?.some((g) => g.lost > 0);
  const ageTitle = ageLeadTitle(ageGroups);

  /**
   * The map section's sentence: where the place ranks for people lost, and its
   * share against Texas's. Statewide, the county that lost the most people.
   * Names are written out in full here ("Harris County", "Congressional
   * District 18"); the list beside the map shortens them.
   */
  const fullName = (u) => (peers.singular === 'county' ? `${u.name} County` : u.name);
  const unitName = (key) => fullName(peers.units.find((u) => u.geoid === key));
  const compareHeadline = (() => {
    const texas = fmtPct(mapValues.statewideShare, 1);
    if (!isScoped) {
      const top = ranked[0];
      return top?.lost > 0
        ? `${unitName(top.key)} lost the most people, ${fmtInt(top.lost)}, and Texas as a whole lost ` +
            `${texas} of its ${fmtMonthBody(win[0])} caseload.`
        : null;
    }
    const total = `${fmtInt(ranked.length)} ${peers.noun}`;
    const best = ranked.findIndex((u) => placeKeys.includes(u.key));
    const versus =
      placeShare == null
        ? ''
        : `${fmtPct(placeShare, 1)}, ${
            fmtPct(placeShare, 1) === texas ? 'the same as' : placeShare > mapValues.statewideShare ? 'higher than' : 'lower than'
          } the ${texas} for Texas`;
    if (several) {
      return (
        `Of these counties, ${unitName(ranked[best].key)} ranks highest, ${fmtOrdinal(best + 1)} of ${total} ` +
        `for people no longer on SNAP.` + (versus ? ` Together they lost ${versus}.` : '')
      );
    }
    if (best < 0) return null;
    return (
      `${scope.label} ranks ${fmtOrdinal(best + 1)} of ${total} for people no longer on SNAP` +
      (versus ? `; its share lost, ${versus.replace(', ', ', is ')}.` : '.')
    );
  })();

  return (
    <div className={styles.page}>
      <nav className={styles.tabs} aria-label="Insights sections">
        {sections.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className={cx(styles.tab, inView === sec.id && styles.tabActive)}
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
          window={win}
          figures={figures}
          onSelect={(geoid) => dispatch({ type: 'setScope', geoid })}
          onPrint={printReport}
          outline={outline}
        />

        {/* ---------------------------------------------------- 1 Enrollment */}
        <section id="enrollment" className={styles.section}>
          <h2 className={styles.sectionTitle}>Enrollment</h2>
          {/* The number, plainly — no written claim. */}
          <p className={styles.headline}>{headline}</p>
          {/*
            Counties and Texas cannot share a count axis — a county's line
            would lie flat along the bottom of Texas's 3.5M scale — so once a
            place is picked both lines are indexed to the window's start.
          */}
          <ChartCard
            title="Residents who lost SNAP"
            subhead={
              isScoped
                ? `Enrolled individuals, ${scope.label} against Texas, indexed (${fmtMonthBody(win[0])} = 100)`
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
                height={chartH(300)}
                title={`${scope.label} indexed against Texas`}
              />
            ) : (
              <LineChart
                months={months}
                series={[{ label: 'Texas', values: statewide.enrolled }]}
                shade={win}
                formatY={(v) => (v >= 1e6 ? fmtMillions(v) : fmtInt(v))}
                viewWidth={vw}
                height={chartH(300)}
                title="Enrolled individuals in Texas"
              />
            )}
          </ChartCard>
        </section>

        {/* --------------------------------------------- 2 Who is falling off */}
        {/* The pie and the arrows sit side by side when printed (sectionPair). */}
        <section id="who" className={cx(styles.section, styles.sectionPair)}>
          <h2 className={styles.sectionTitle}>Who is falling off</h2>
          {ageGroups && <p className={styles.headline}>{whoHeadline(ageGroups, where, since)}</p>}
          {anyLost && (
            <ChartCard
              title={`People no longer on SNAP in ${scope.label}, ${fmtMonthBody(win[0])} → ${fmtMonthBody(win[1])}, by age group`}
              subhead={ageTitle ? `${ageTitle}.` : null}
            >
              <PieChart
                slices={ageGroups.map((g) => ({
                  label: g.label,
                  value: Math.max(0, g.lost),
                  color: AGE_COLORS[g.label],
                  // Negative, as a loss: "−3,445".
                  count: g.lost > 0 ? fmtDelta(-g.lost) : '—',
                  share: g.lost > 0 ? fmtPct(g.share, 1) : '—',
                }))}
                size={printing ? 96 : phone ? 170 : 210}
                countLabel="Change in enrollment"
                title={`Residents no longer on SNAP in ${scope.label}, by age group`}
              />
            </ChartCard>
          )}
          {/* The same three age groups as the pie; the five HHSC bands only if a band is missing. */}
          <ChartCard
            title="Residents who lost SNAP, by age group"
            subhead={`Enrolled individuals by age group, ${scope.label}, ${fmtMonthBody(win[0])} → ${fmtMonthBody(win[1])}.${smallNumbers}`}
          >
            <DumbbellChart
              rows={ageGroups ?? ageBandRows(scope.ageSeries, i0, i1)}
              viewWidth={printing && anyLost ? PRINT_HALF_VIEW_WIDTH : vw}
              rowH={printing ? 22 : 40}
              ticks={printing ? 4 : phone ? 4 : 8}
            />
          </ChartCard>
        </section>

        {/* --------------------------------------------------- 3 Across Texas */}
        <section id="map" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {isScoped ? `How does ${scope.label} compare to Texas?` : 'Across Texas'}
          </h2>
          {compareHeadline && <p className={styles.headline}>{compareHeadline}</p>}
          <ChartCard
            title={`No longer on SNAP since H.R. 1, by ${peers.singular}`}
            subhead={
              `Share of each ${peers.singular}'s ${fmtMonthBody(win[0])} caseload no longer enrolled in ` +
              `${fmtMonthBody(win[1])}.` +
              (scope.district ? ' Districts inside one split county share its rate.' : '') +
              (isScoped ? ` ${placeAgainstTexas}` : '')
            }
          >
            {mapShapes && (
              <LossMap
                shapes={mapShapes}
                fill={mapValues.fill}
                lost={mapValues.count}
                highlight={isScoped ? placeKeys : null}
                canvas={projection}
                title={`Share no longer on SNAP by ${peers.singular}${isScoped ? `, ${scope.label} outlined` : ''}`}
                aside={
                  <PlaceRankList
                    units={rankPlaces}
                    picked={isScoped ? placeKeys : []}
                    noun={peers.noun}
                    singular={peers.singular}
                  />
                }
              />
            )}
          </ChartCard>
        </section>

        {scope.district && (
          <div id={METHOD_SECTION.id} className={styles.anchor}>
            <DistrictMethod district={scope.district} />
          </div>
        )}

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
