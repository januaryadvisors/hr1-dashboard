/**
 * The Insights page: one scrolling report on SNAP since H.R. 1, for Texas, one
 * county, several counties added together, or a district. The address bar is
 * the shareable link (`/insights/decline?county=48201`), and every figure
 * describes the place picked, never quietly the statewide one.
 */
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../state/AppContext';
import { loadDistrictOfficials, loadDistrictShapes } from '../../data/load';
import { DumbbellChart } from '../../components/charts/DumbbellChart';
import { IndexedLines } from '../../components/charts/IndexedLines';
import { LineChart } from '../../components/charts/LineChart';
import { LossMap } from '../../components/charts/LossMap';
import { PieChart } from '../../components/charts/PieChart';
import { PlaceRankList, rankUnits } from '../../components/charts/PlaceRankList';
import feedingTexasLogo from '../../assets/feeding-texas-logo.png';
import { FunderLogo } from '../../components/shell/FunderLogo';
import { Methodology, MethodologyBrief } from '../../components/shell/Methodology';
import { ScopeBar } from '../../components/shell/ScopeBar';
import {
  AGE_COLORS,
  ageBandRows,
  ageGroupLoss,
  ageLeadTitle,
  monthRange,
  againstTexas,
  benefitShortfall,
  buildScope,
  indexTo,
  peersFor,
  whoHeadline,
  windowChange,
  windowLoss,
} from '../../lib/insights';
import { PHONE } from '../../lib/breakpoints';
import { cx } from '../../lib/cx';
import { fmtDelta, fmtInt, fmtMillions, fmtMonthBody, fmtMonthFull, fmtPct } from '../../lib/format';
import { buildLayerValues } from '../../lib/layerValues';
import { scrollBelowHeader } from '../../lib/layout';
import { seatHolder } from '../../lib/officials';
import { lossShare, windowEnds } from '../../lib/series';
import { useLoaded } from '../../lib/useLoaded';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { printWithTitle, usePrintMode } from '../../lib/usePrintMode';
import { titleSize } from '../../lib/printTitle';
import { useSectionInView } from '../../lib/useSectionInView';
import { enrollmentHeadline, placeVsTexas, rankingHeadline } from './copy';
import { mapShapes, placeKeysFor, placeOutline } from './places';
import styles from './InsightsPage.module.css';

/*
 * Chart viewBox widths, near each chart's rendered width so axis labels keep
 * their intended size: the ~900px column, a phone, and a card on Letter paper.
 */
const VIEW_WIDTH = 960;
const PHONE_VIEW_WIDTH = 470;
const PRINT_VIEW_WIDTH = 720;
/** On paper the pie and the arrows share a row, so the arrows draw at half width. */
const PRINT_HALF_VIEW_WIDTH = 350;
const PRINT_CHART_H = 145;

const SECTIONS = [
  { id: 'enrollment', title: 'Enrollment' },
  { id: 'who', title: 'Who is falling off' },
  { id: 'map', title: 'Across Texas' },
  { id: 'methodology', title: 'Methodology' },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);

/** The section each /insights/:tab link opens at. */
const TAB_SECTION = { decline: 'enrollment', who: 'who' };

const TEXAS_LINE = { label: 'Texas', color: 'var(--text-faint)', dashed: true };

const loadNothing = () => Promise.resolve(null);

const goToSection = (id) => {
  const el = document.getElementById(id);
  if (el) scrollBelowHeader(el);
};

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
  const { counties, byGeoid, statewide, districtCounts } = data;
  const months = statewide.meta.months;

  /** Always H.R. 1 to the latest month: the Map page's brush does not reach this page. */
  const win = useMemo(() => [statewide.meta.policy_start, months.at(-1)], [statewide, months]);
  const i0 = months.indexOf(win[0]);
  const i1 = months.length - 1;
  const startLabel = fmtMonthBody(win[0]);
  const endLabel = fmtMonthBody(win[1]);

  // ------------------------------------------------------------ the place
  const scope = useMemo(
    () => buildScope(counties, byGeoid, statewide, state.scope, districtCounts),
    [counties, byGeoid, statewide, state.scope, districtCounts],
  );
  const isScoped = scope.kind !== 'state';
  const several = scope.kind === 'counties';
  const where = isScoped ? ` in ${scope.label}` : '';
  const since = fmtMonthFull(win[0]);

  /** What the place is ranked against: counties, or the districts of its chamber. */
  const peers = useMemo(() => peersFor(scope, counties, districtCounts), [scope, counties, districtCounts]);
  const change = useMemo(() => windowChange(scope.enrolled, i0, i1), [scope.enrolled, i0, i1]);

  /** The report box's figures, the same for every place. */
  const figures = useMemo(() => {
    const shortfall = benefitShortfall(scope.payments, i0, i1);
    return {
      people: windowLoss(scope.enrolled, i0, i1),
      children: windowLoss(scope.children, i0, i1),
      shortfall,
      baseFromLabel: shortfall ? fmtMonthBody(months[shortfall.baseFrom]) : null,
      // The months totalled, and the months averaged before them.
      totalRange: monthRange(months, i0 + 1, i1),
      baseRange: shortfall ? monthRange(months, shortfall.baseFrom, i0) : null,
    };
  }, [scope, i0, i1, months]);

  const official = useLoaded(scope.district ? loadDistrictOfficials : loadNothing);
  const holder = scope.district && official ? seatHolder(scope.district.geoid, official) : null;

  // ------------------------------------------------------------ shapes
  const districtShapes = useLoaded(scope.district ? loadDistrictShapes : loadNothing);
  const countyFeatures = data.geometry.counties;
  const placeKeys = useMemo(() => placeKeysFor(scope), [scope]);
  const shapes = useMemo(
    () => mapShapes({ scope, countyFeatures, districtShapes, districtCounts, projection }),
    [scope, countyFeatures, districtShapes, districtCounts, projection],
  );
  const outline = useMemo(
    () => placeOutline({ scope, placeKeys, countyFeatures, districtShapes, projection, statePath }),
    [scope, placeKeys, countyFeatures, districtShapes, projection, statePath],
  );

  // ------------------------------------------------------------ the map section
  const mapValues = useMemo(() => buildLayerValues(peers.units, 'loss', i0, i1), [peers, i0, i1]);
  const rankPlaces = useMemo(
    () =>
      peers.units.map((u) => ({
        key: u.geoid,
        // "District 18": the list's heading already names the chamber.
        name: u.name.replace(/^Congressional District /, 'District '),
        lost: mapValues.count?.get(u.geoid) ?? null,
        share: mapValues.fill.get(u.geoid) ?? null,
      })),
    [peers, mapValues],
  );
  const ranked = useMemo(() => rankUnits(rankPlaces), [rankPlaces]);

  const placeShare = several ? lossShare(windowEnds(scope.enrolled, i0, i1)) : mapValues.fill.get(scope.key);
  const versus = placeShare == null ? null : againstTexas(placeShare, mapValues.statewideShare);
  const nameOf = (key) => {
    const unit = peers.units.find((u) => u.geoid === key);
    return peers.singular === 'county' ? `${unit.name} County` : unit.name;
  };
  const compareHeadline = rankingHeadline({
    scope,
    ranked,
    placeKeys,
    peers,
    nameOf,
    texasShare: mapValues.statewideShare,
    startMonth: win[0],
    versus,
  });

  // ------------------------------------------------------------ who lost SNAP
  const ageGroups = useMemo(() => ageGroupLoss(scope.ageSeries, i0, i1), [scope.ageSeries, i0, i1]);
  const anyLost = ageGroups?.some((g) => g.lost > 0);
  const ageTitle = ageLeadTitle(ageGroups);
  /** Under 10,000 residents an age band can be a few dozen people. */
  const smallNumbers =
    scope.county?.small_denominator || (several && scope.population < 10_000)
      ? ' Small numbers: a few people move these a long way.'
      : '';

  // ------------------------------------------------------------ layout
  const printing = usePrintMode();
  const phone = useMediaQuery(PHONE);
  const viewWidth = printing ? PRINT_VIEW_WIDTH : phone ? PHONE_VIEW_WIDTH : VIEW_WIDTH;
  /** Seven or more counties added together: a shorter chart on paper, to leave the ranking its rows. */
  const manyCounties = titleSize(scope.counties?.length ?? 0) === 'xs';
  const chartHeight = (screen) => (printing ? PRINT_CHART_H - (manyCounties ? 20 : 0) : screen);

  const inView = useSectionInView(SECTION_IDS);
  // A tab link lands on its section, once.
  useEffect(() => {
    const id = TAB_SECTION[tab];
    if (id && id !== SECTION_IDS[0]) requestAnimationFrame(() => goToSection(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The one-pager's title, the same for every place; the place is named in the
   * report box under it. The PDF's file name adds the place and the latest month.
   */
  const printTitle = 'Tracking Texas SNAP Enrollment After H.R. 1';
  const printReport = () => printWithTitle(`${printTitle} — ${scope.label} (through ${endLabel})`);
  /**
   * The page's own address, printed as the one-pager's source line. Read while
   * printing, so it is the address of the place on paper (the scope is
   * mirrored to the URL).
   */
  const pageUrl = printing ? window.location.href : '';

  return (
    <div className={styles.page}>
      <nav className={styles.tabs} aria-label="Insights sections">
        {SECTIONS.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className={cx(styles.tab, inView === sec.id && styles.tabActive)}
            aria-current={inView === sec.id ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault();
              goToSection(sec.id);
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
          official={holder}
          printTitle={printTitle}
        />

        <section id="enrollment" className={styles.section}>
          <h2 className={styles.sectionTitle}>Enrollment</h2>
          <p className={styles.headline}>{enrollmentHeadline(change.absolute, where, since)}</p>
          {/* A place and Texas cannot share a count axis, so a picked place is indexed against Texas. */}
          <ChartCard
            title="Residents who lost SNAP"
            subhead={
              isScoped
                ? `Enrolled individuals, ${scope.label} against Texas, indexed (${startLabel} = 100)`
                : 'Enrolled individuals, monthly'
            }
          >
            {isScoped ? (
              <IndexedLines
                months={months}
                refIndex={i0}
                series={[
                  { ...TEXAS_LINE, values: indexTo(statewide.enrolled, i0) },
                  {
                    label: scope.label,
                    values: indexTo(scope.enrolled, i0),
                    color: 'var(--ja-burgundy)',
                    emphasis: true,
                  },
                ]}
                viewWidth={viewWidth}
                height={chartHeight(300)}
                title={`${scope.label} indexed against Texas`}
              />
            ) : (
              <LineChart
                months={months}
                series={[{ label: 'Texas', values: statewide.enrolled }]}
                shade={win}
                formatY={(v) => (v >= 1e6 ? fmtMillions(v) : fmtInt(v))}
                viewWidth={viewWidth}
                height={chartHeight(300)}
                title="Enrolled individuals in Texas"
              />
            )}
          </ChartCard>
        </section>

        {/* sectionPair: on paper the pie and the arrows share a row. */}
        <section id="who" className={cx(styles.section, styles.sectionPair)}>
          <h2 className={styles.sectionTitle}>Who is falling off</h2>
          {ageGroups && <p className={styles.headline}>{whoHeadline(ageGroups, where, since)}</p>}
          {anyLost && (
            <ChartCard
              title={`People no longer on SNAP in ${scope.label}, ${startLabel} → ${endLabel}, by age group`}
              subhead={ageTitle ? `${ageTitle}.` : null}
            >
              <PieChart
                slices={ageGroups.map((g) => ({
                  label: g.label,
                  value: Math.max(0, g.lost),
                  color: AGE_COLORS[g.label],
                  count: g.lost > 0 ? fmtDelta(-g.lost) : '—',
                  share: g.lost > 0 ? fmtPct(g.share, 1) : '—',
                }))}
                size={printing ? 104 : phone ? 170 : 210}
                countLabel="Change in enrollment"
                shareLabel="Share of total loss"
                title={`Residents no longer on SNAP in ${scope.label}, by age group`}
              />
            </ChartCard>
          )}
          {/* The pie's three age groups; HHSC's five bands only if a band is missing. */}
          <ChartCard
            title="Residents who lost SNAP, by age group"
            subhead={`Enrolled individuals by age group, ${scope.label}, ${startLabel} → ${endLabel}.${smallNumbers}`}
          >
            <DumbbellChart
              rows={ageGroups ?? ageBandRows(scope.ageSeries, i0, i1)}
              viewWidth={printing && anyLost ? PRINT_HALF_VIEW_WIDTH : viewWidth}
              rowH={printing ? 24 : 40}
              ticks={printing || phone ? 4 : 8}
            />
          </ChartCard>
        </section>

        <section id="map" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {isScoped ? `How does ${scope.label} compare to Texas?` : 'Across Texas'}
          </h2>
          {compareHeadline && <p className={styles.headline}>{compareHeadline}</p>}
          <ChartCard
            title={`No longer on SNAP since H.R. 1, by ${peers.singular}`}
            subhead={
              `Share of each ${peers.singular}'s ${startLabel} caseload no longer enrolled in ${endLabel}.` +
              (scope.district ? ' Districts inside one split county share its rate.' : '') +
              (isScoped ? ` ${placeVsTexas(scope.label, several, versus)}` : '')
            }
          >
            {shapes && (
              <LossMap
                shapes={shapes}
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

        <div id="methodology" className={styles.anchor}>
          <Methodology from={startLabel} to={endLabel} county={scope.kind === 'county'} district={scope.district} />
        </div>

        {data.isFixture && (
          <p className={styles.fixtureNote}>
            Figures on this page are generated test data calibrated to the published statewide findings.
            They are not the real export.
          </p>
        )}

        {/* Bottom right: Feeding Texas beside its partner. Paper has its own footer. */}
        <div className={styles.screenLogos}>
          <img className={styles.screenFtLogo} src={feedingTexasLogo} alt="Feeding Texas" />
          <FunderLogo />
        </div>

        {/* Paper only: the short methodology with a link to the full one, and
            whose report it is. */}
        <footer className={styles.printFooter}>
          <MethodologyBrief from={startLabel} to={endLabel} district={Boolean(scope.district)} url={pageUrl} />
          <div className={styles.printLogos}>
            <img className={styles.printFtLogo} src={feedingTexasLogo} alt="Feeding Texas" />
            <FunderLogo className={styles.printFunder} />
          </div>
        </footer>
      </main>
    </div>
  );
}
