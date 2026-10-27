/**
 * <ScopeBar> — the Insights page header. Picks what every chart below reads
 * from: Texas, one county, or one TX House, TX Senate or US House district.
 *
 * This is the control that turns the Insights page into a county stat page. The
 * selection lives in `state.scope` and mirrors to `?county=`, so the URL in the
 * address bar after picking a county IS the shareable link — there is no
 * separate "generate report" step to get out of sync with what is on screen.
 *
 * When a county is scoped the bar also carries its headline figures, because a
 * reader who was sent this link arrives wanting four numbers, not a chart.
 *
 * A DISTRICT'S NUMBERS MAY BE ESTIMATES, and the bar says which every time. HHSC
 * publishes SNAP by county; a district containing part of a split county gets
 * an apportioned share of it (see build-county-data.mjs). These pages go to
 * legislative offices who will repeat the figure, so "exact" and "estimated" are
 * stated beside the numbers rather than in a methodology note.
 */
import { useEffect, useMemo, useState } from 'react';
import { CountySearch } from '../map/CountySearch';
import { SegmentedControl } from './SegmentedControl';
import { HelpList } from '../map/HelpList';
import { fmtInt, fmtMonthBody, fmtPctDelta } from '../../lib/format';
import { shortfallLabels } from '../../lib/insights';
/**
 * @typedef {import('../../lib/insights').Scope} Scope
 * @typedef {import('../../lib/insights').WindowChange} WindowChange
 */
/**
 * @typedef {import('../../types').County} County
 */
import styles from './ScopeBar.module.css';

/**
 * @typedef {Object} ScopeBarProps
 * @property {County[]} counties
 * @property {Scope} scope
 * @property {WindowChange} change - Enrollment change across the active window, for the scope.
 * @property {import('../../data/load').DistrictCounts | null} districtCounts - null hides the geography switch.
 * @property {[string, string]} window
 * @property {{ people: number | null, children: number | null, seniors: number | null,
 *   shortfall: { total: number, monthly: number, base: number, baseFrom: number } | null,
 *   baseFromLabel: string | null, sinceLabel: string }} figures - The four headline
 *   figures, for the window. baseFromLabel is the first month the shortfall's yardstick averages. sinceLabel is "H.R. 1" when the window starts at the policy month, else that month.
 * @property {(geoid: string | null) => void} onSelect
 * @property {() => void} onPrint
 */

/** "Harris (part)", "Travis, Hays", "Bowie +4" — enough to recognise a district in a list. */
function countiesBrief(d) {
  const [first, ...rest] = d.counties;
  if (!first) return '';
  if (!rest.length) return first.share < 1 ? `${first.name} (part)` : first.name;
  if (rest.length === 1) return `${first.name}, ${rest[0].name}`;
  return `${first.name} +${rest.length}`;
}

export function ScopeBar({
  counties,
  scope,
  change,
  districtCounts,
  window: win,
  figures,
  onSelect,
  onPrint,
}) {
  const isScoped = scope.kind !== 'state';
  const county = scope.county;
  const district = scope.district;

  /** Which list the search offers. Follows the scope, but the reader can switch before picking. */
  const [geo, setGeo] = useState(district ? district.plan : 'county');
  useEffect(() => {
    if (district) setGeo(district.plan);
    else if (county) setGeo('county');
  }, [district, county]);

  const searchItems = useMemo(() => {
    if (geo === 'county' || !districtCounts) return counties;
    return districtCounts.districts
      .filter((d) => d.plan === geo)
      .map((d) => ({ ...d, keywords: d.counties.map((c) => c.name) }));
  }, [geo, counties, districtCounts]);

  const chamber = districtCounts?.meta.chambers[geo];


  /** The district's composition, for the meta line. */
  const districtMeta = district
    ? district.exact
      ? `${district.counties.length} whole ${district.counties.length === 1 ? 'county' : 'counties'}`
      : district.counties.length === 1
        ? `part of ${district.counties[0].name} County`
        : `${district.counties.length} counties, ${district.counties.filter((c) => c.share < 1).length} split`
    : null;


  return (
    <header className={styles.root}>
      <div className={styles.topRow}>
        <div className={styles.identity}>
          <span className="eyebrow">
            {county ? 'County report' : district ? 'District report' : 'Statewide'}
          </span>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{scope.label}</h1>
            {/* Exact vs estimated, on the name — the first thing a reader copying
                a figure out of this box sees. The sentences below say why. */}
            {district && (
              <span
                className={`${styles.badge} ${district.exact ? styles.badgeExact : styles.badgeEstimated}`}
                title={
                  district.exact
                    ? 'Built from whole counties: the published HHSC caseloads, added up.'
                    : 'Includes part of a county split across districts: apportioned from the county total.'
                }
              >
                {district.exact ? 'Exact count' : 'Estimated'}
              </span>
            )}
          </div>
          <p className={styles.meta}>
            {county ? (
              <>
                FIPS {county.geoid} · {fmtInt(scope.population)} residents ·{' '}
                {fmtMonthBody(win[0])} → {fmtMonthBody(win[1])}
              </>
            ) : district ? (
              <>
                {districtCounts?.meta.chambers[district.plan]?.plan} · {fmtInt(scope.population)}{' '}
                residents · {districtMeta} · {fmtMonthBody(win[0])} → {fmtMonthBody(win[1])}
              </>
            ) : (
              <>
                All 254 counties · {fmtInt(scope.population)} residents ·{' '}
                {fmtMonthBody(win[0])} → {fmtMonthBody(win[1])}
              </>
            )}
          </p>
        </div>

        <div className={styles.picker}>
          {districtCounts && (
            <SegmentedControl
              className={styles.geo}
              label="Geography"
              size="sm"
              options={[
                { value: 'county', label: 'County', title: 'The 254 counties' },
                ...Object.entries(districtCounts.meta.chambers).map(([plan, c]) => ({
                  value: plan,
                  label: c.label,
                  title: `${c.plan}, ${c.count} districts — enrollment counts only`,
                })),
              ]}
              value={geo}
              onChange={setGeo}
            />
          )}
          <CountySearch
            // Remount on a geography switch so a half-typed county name does not
            // linger as a query against the district list.
            key={geo}
            className={styles.search}
            // Harris alone holds 24 House districts; the list scrolls.
            maxResults={geo === 'county' ? 8 : 40}
            counties={searchItems}
            renderValue={(c) => (c.plan ? countiesBrief(c) : fmtInt(c.pop))}
            onSelect={(geoid) => onSelect(geoid)}
            placeholder={chamber ? 'Number or county…' : 'Find a county…'}
            emptyText={chamber ? `No ${chamber.label} district matches that.` : 'No county matches that.'}
          />
          <div className={styles.pickerActions}>
            {isScoped && (
              <button type="button" className={styles.clear} onClick={() => onSelect(null)}>
                Back to statewide
              </button>
            )}
            {/* The browser's own print dialog, which saves a PDF — the page
                carries a print stylesheet that lays the report out on paper. */}
            <button type="button" className={styles.print} onClick={onPrint}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M4 6V2h8v4M4 12H2.5V6.5h11V12H12M4 9.5h8V14H4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              Print / save as PDF
            </button>
          </div>
        </div>
      </div>

      {/*
        The same four figures for every place — Texas, a county or a district
        (2026-10-16): people, children and seniors who left SNAP over the
        window, and how much less in benefits now goes out each month.
      */}
      <dl className={styles.stats}>
        <Stat
          label="People who left SNAP"
          value={lossLabel(figures.people)}
          sub={change.pct == null ? null : `${fmtPctDelta(change.pct, 1)} since ${fmtMonthBody(win[0])}`}
          negative={figures.people > 0}
        />
        <Stat label="Children who left SNAP" value={lossLabel(figures.children)} sub="under 18" negative={figures.children > 0} />
        <Stat label="Seniors who left SNAP" value={lossLabel(figures.seniors)} sub="65 and older" negative={figures.seniors > 0} />
        {/*
          Cumulative, not one month against another (2026-10-16): every month
          after the start, the average month of the year to the start minus
          benefits paid, summed, net (benefitShortfall). One number for the
          whole period — the Map story's figure for Texas — rather than one that
          moves with whichever month is latest. SNAP benefits can only be spent
          at SNAP-authorized retailers, so this is money those stores did not
          take in.
        */}
        <Stat
          {...(figures.shortfall
            ? shortfallLabels(figures.shortfall.total)
            : { label: 'Less spent at SNAP-authorized stores', value: '—' })}
          sub={`estimated, against a typical month in the year before ${figures.sinceLabel}`}
          negative={figures.shortfall?.total > 0}
          title={
            figures.shortfall
              ? `An estimate: the average month from ${figures.baseFromLabel} to ${fmtMonthBody(win[0])}, ` +
                `minus SNAP benefits paid each month after it through ${fmtMonthBody(win[1])}, summed. ` +
                'A month above that average counts against the total; a total below zero shows as more spent.'
              : undefined
          }
        />
      </dl>

      {/*
        Enrollment help listed in the county — the tooltip's bar chart. Counties
        only: the health-worker figure is a range, not a count, and an
        organisation serving several counties would be counted once per county if
        a district or the state were summed.
      */}
      {county && (
        <div className={styles.capacity}>
          <h2 className={styles.capacityTitle}>Enrollment help listed in {scope.label}</h2>
          <HelpList county={county} className={styles.helpList} />
        </div>
      )}

      {district && <DistrictMethod district={district} />}
    </header>
  );
}

/** "138,946", or "+1,204 gained" when the count went up instead. */
function lossLabel(n) {
  if (n == null) return '—';
  return n >= 0 ? fmtInt(n) : `+${fmtInt(-n)} gained`;
}

function Stat({ label, value, sub, negative = false, title }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel} title={title}>
        {label}
      </dt>
      <dd className={`${styles.statValue} ${negative ? styles.negative : ''} tabular`}>{value}</dd>
      {sub && <dd className={styles.statSub}>{sub}</dd>}
    </div>
  );
}

/** Sources cited in the methodology, each checked to resolve (2026-09-23). */
const SOURCES = {
  acs: 'https://www.census.gov/programs-surveys/acs',
  // Table B22001, Texas tracts — the counts the split uses.
  snapHouseholds: 'https://data.census.gov/table/ACSDT5Y2024.B22001?g=040XX00US48$1400000',
  blocks: 'https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html',
  // Texas Legislative Council block-equivalency files, one per plan.
  plans: {
    txhouse: 'https://data.capitol.texas.gov/dataset/planh2316',
    txsenate: 'https://data.capitol.texas.gov/dataset/plans2168',
    ushouse: 'https://data.capitol.texas.gov/dataset/planc2333',
  },
};

function Source({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function DistrictMethod({ district }) {
  return (
    <div className={styles.method}>
      <h2 className={styles.methodTitle}>Methodology</h2>
      <p>
        HHSC publishes SNAP enrollment at the county level only, so district figures are assembled
        from county data. Where a district is composed entirely of whole counties, its figures are the
        sum of those counties&rsquo; published caseloads.
      </p>
      <div>
        <p>
          Where a district includes part of a county divided between districts, that county&rsquo;s
          caseload is apportioned:
        </p>
        <ol className={styles.methodSteps}>
          <li>
            The <Source href={SOURCES.acs}>American Community Survey (2020–24)</Source> reports the
            number of households receiving SNAP in each census tract, a unit of roughly 4,000
            residents.
          </li>
          <li>
            Each tract is allocated to districts according to where its residents live, using{' '}
            <Source href={SOURCES.blocks}>2020 census blocks</Source> and the{' '}
            <Source href={SOURCES.plans[district.plan] ?? SOURCES.plans.txhouse}>
              Texas Legislative Council&rsquo;s block-to-district assignments
            </Source>
            .
          </li>
          <li>
            Each district receives a share of the county&rsquo;s HHSC total equal to its share of the
            county&rsquo;s{' '}
            <Source href={SOURCES.snapHouseholds}>households that report receiving SNAP</Source>.
          </li>
        </ol>
      </div>
    </div>
  );
}
