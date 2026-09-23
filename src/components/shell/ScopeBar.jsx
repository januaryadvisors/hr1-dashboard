/**
 * <ScopeBar> — the Insights page header. Picks what every chart below reads
 * from: Texas, one county, or one TX House / Senate district.
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
import { fmtDelta, fmtInt, fmtMonthBody, fmtPct, fmtPctDelta } from '../../lib/format';
/**
 * @typedef {import('../../lib/insights').LossRank} LossRank
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
 * @property {LossRank | null} rank - Where the scope ranks among its peers. null when scoped to the state.
 * @property {import('../../lib/insights').Peers} peers - What the rank is among: counties, or the chamber's districts.
 * @property {import('../../data/load').DistrictCounts | null} districtCounts - null hides the geography switch.
 * @property {Map<string, County>} byGeoid - For a district's margin: each split county's own series.
 * @property {[string, string]} window
 * @property {(geoid: string | null) => void} onSelect
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
  rank,
  peers,
  districtCounts,
  byGeoid,
  window: win,
  onSelect,
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

  /**
   * Share of the scope's own caseload newly subject to the work requirement.
   * §10: the numerator is PUMS-modelled, flagged wherever shown.
   */
  const subject = county?.newly_subject_persons ?? district?.newly_subject_persons ?? null;
  /** For the stat row: the statewide figure is the sum of the counties' estimates. */
  const subjectShown = useMemo(
    () =>
      subject ??
      (scope.kind === 'state'
        ? counties.reduce((t, c) => t + (c.newly_subject_persons ?? 0), 0)
        : null),
    [subject, scope.kind, counties],
  );
  const subjectShare = subject != null && change.start > 0 ? subject / change.start : null;

  /** The district's composition, for the meta line. */
  const districtMeta = district
    ? district.exact
      ? `${district.counties.length} whole ${district.counties.length === 1 ? 'county' : 'counties'}`
      : district.counties.length === 1
        ? `part of ${district.counties[0].name} County`
        : `${district.counties.length} counties, ${district.counties.filter((c) => c.share < 1).length} split`
    : null;

  /**
   * 90% margin on a district count, from the survey margin on each split share:
   * the count is sum(share_c * county_c), so its MOE is sqrt(sum((moe_c * county_c)^2)).
   * Whole counties contribute nothing. null when a split has no survey MOE (a
   * fallback weight) — better no ± than a ± that claims more precision than exists.
   */
  const districtMoe = (read) => {
    if (!district || district.exact) return null;
    let sq = 0;
    for (const m of district.counties) {
      if (m.share >= 1) continue;
      if (m.share_moe == null) return null;
      const v = read(byGeoid?.get(m.geoid));
      if (v == null) return null;
      sq += (m.share_moe * v) ** 2;
    }
    return Math.sqrt(sq);
  };
  const moeSubject = districtMoe((c) => c?.newly_subject_persons);

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
          {isScoped && (
            <button type="button" className={styles.clear} onClick={() => onSelect(null)}>
              Back to statewide
            </button>
          )}
        </div>
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Enrolled now</dt>
          <dd className={`${styles.statValue} tabular`}>{fmtInt(change.end)}</dd>
        </div>
        <div className={styles.stat}>
          <dt
            className={styles.statLabel}
            title="Residents newly subject to H.R. 1's work requirement. PUMS-modelled estimate, not a lookup."
          >
            Newly subject
          </dt>
          <dd className={`${styles.statValue} tabular`}>
            {subjectShown == null ? '—' : fmtInt(subjectShown)}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Change since {fmtMonthBody(win[0])}</dt>
          <dd className={`${styles.statValue} ${styles.negative} tabular`}>
            {fmtDelta(change.absolute)}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Percent change</dt>
          <dd className={`${styles.statValue} ${styles.negative} tabular`}>
            {fmtPctDelta(change.pct, 1)}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Participation rate</dt>
          <dd className={`${styles.statValue} tabular`}>
            {scope.population > 0 ? fmtPct(change.end / scope.population, 1) : '—'}
          </dd>
        </div>
      </dl>

      {/*
        The comparison sentence. Both the statewide figure and the county median
        are quoted because they routinely disagree — the statewide number is
        dominated by the metros, the median describes the typical county — and
        quoting only the flattering one is how a stat page misleads.
      */}
      {isScoped && (
      <div className={styles.notes}>
      {rank && (
        <p className={styles.compare}>
          <strong>{scope.label}</strong>{' '}
          {rank.pct < 0 ? 'lost' : 'grew by'} <strong>{fmtPctDelta(rank.pct, 1)}</strong>
          {rank.pct < 0 ? ' of its caseload' : ''}, {comparison(rank, peers.singular)}. That is the{' '}
          <strong>
            {rank.tied ? 'joint ' : ''}
            {ordinal(rank.rank)} steepest
          </strong>{' '}
          percentage loss of {rank.total} {peers.noun}
          {rank.tied ? ` — ${rank.tied + 1} share that figure` : ''}.
          {county?.small_denominator && (
            <span className={styles.caveat}>
              {' '}
              Under 10,000 residents — a percentage on a caseload this small moves on a handful of
              households. See the funnel plot before quoting the rank.
            </span>
          )}
        </p>
      )}

      {subject != null && subjectShare != null && (
        <p className={styles.compare}>
          <strong>{fmtInt(subject)}</strong>
          {moeSubject != null ? ` (± ${fmtInt(moeSubject)} margin of error)` : ''} residents are newly
          subject to H.R. 1&rsquo;s work requirement — {fmtPct(subjectShare, 0)} of the caseload at
          the start of this window.{' '}
          <span className={styles.caveat}>
            PUMS-modelled estimate, not a lookup
            {district && !district.exact ? ', apportioned from county figures' : ''}.
          </span>
        </p>
      )}
      </div>
      )}

      {district && <DistrictMethod district={district} />}
    </header>
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

/**
 * "a smaller loss than the −15.5% for Texas as a whole and the −15.8% for the
 * median House district" — each comparison judged on its own, at the precision
 * printed, so a county steeper than Texas but gentler than the median says both.
 * ("Lower than" is avoided on purpose: −13.4% is a smaller loss but a higher
 * number than −15.5%, and readers split on which one "lower" means.)
 */
function comparison(rank, singular) {
  const state = `${fmtPctDelta(rank.statePct, 1)} for Texas as a whole`;
  const median = `${fmtPctDelta(rank.medianPct, 1)} for the median ${singular}`;
  if (rank.pct >= 0) return `against ${state} and ${median}`;
  const side = (other) => {
    const a = Math.round(rank.pct * 1000);
    const b = Math.round(other * 1000);
    return a === b ? 'the same as' : a < b ? 'a steeper loss than' : 'a smaller loss than';
  };
  const s1 = side(rank.statePct);
  const s2 = side(rank.medianPct);
  return s1 === s2
    ? `${s1} the ${state} and the ${median}`
    : `${s1} the ${state} but ${s2} the ${median}`;
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
