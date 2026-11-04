/**
 * <ScopeBar> — the Insights page header. Picks what every chart below reads
 * from: Texas, one or more counties (checked in the list and added together),
 * or one TX House, TX Senate or US House district.
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
import { PlaceOutline } from './PlaceOutline';
import { cx } from '../../lib/cx';
import { fmtDelta, fmtInt, fmtMonthBody, fmtPctDelta } from '../../lib/format';
import { shortfallLabels, SPENDING_LABEL } from '../../lib/insights';
import styles from './ScopeBar.module.css';

/**
 * @typedef {import('../../lib/insights').Scope} Scope
 * @typedef {import('../../lib/insights').WindowChange} WindowChange
 * @typedef {import('../../types').County} County
 */

/**
 * @typedef {Object} ScopeBarProps
 * @property {County[]} counties
 * @property {Scope} scope
 * @property {WindowChange} change - Enrollment change across the active window, for the scope.
 * @property {import('../../data/load').DistrictCounts | null} districtCounts - null hides the geography switch.
 * @property {[string, string]} window
 * @property {{ people: number | null, children: number | null,
 *   shortfall: { total: number, monthly: number, base: number, baseFrom: number } | null,
 *   baseFromLabel: string | null, sinceLabel: string }} figures - The three headline
 *   figures, for the window. baseFromLabel is the first month the shortfall's yardstick averages. sinceLabel is "H.R. 1" when the window starts at the policy month, else that month.
 * @property {(scope: string | null) => void} onSelect - A county geoid, several joined with commas, a district key, or null.
 * @property {() => void} onPrint
 * @property {import('./PlaceOutline').PlaceOutlineProps | null} outline - The place's boundary, once its
 *   shape has loaded.
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
  outline,
}) {
  const isScoped = scope.kind !== 'state';
  const county = scope.county;
  const district = scope.district;
  /** The counties checked: one, several, or none while Texas or a district is shown. */
  const picked = county ? [county] : scope.counties;

  /** Which list the search offers. Follows the scope, but the reader can switch before picking. */
  const [geo, setGeo] = useState(district ? district.plan : 'county');
  useEffect(() => {
    if (district) setGeo(district.plan);
    else if (picked.length) setGeo('county');
  }, [district, picked.length]);

  const searchItems = useMemo(() => {
    if (geo === 'county' || !districtCounts) return counties;
    return districtCounts.districts
      .filter((d) => d.plan === geo)
      .map((d) => ({ ...d, keywords: d.counties.map((c) => c.name) }));
  }, [geo, counties, districtCounts]);

  const chamber = districtCounts?.meta.chambers[geo];

  const searchLabel = district?.plan === geo ? district.name : undefined;
  /** What the closed county field says: "Harris", "Harris, Fort Bend", "Harris +3". */
  const countySummary =
    picked.length > 2 ? `${picked[0].name} +${picked.length - 1}` : picked.map((c) => c.name).join(', ');

  return (
    <div className={styles.root}>
      {/* The controls sit above the report, not in it: the card is what prints
          and what a reader copies figures out of. */}
      <div className={styles.controls}>
        {isScoped ? (
          <button type="button" className={styles.back} onClick={() => onSelect(null)}>
            ← Statewide
          </button>
        ) : (
          <span />
        )}
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
          {geo === 'county' ? (
            /*
              Counties are a checkbox list: every county checked is added into one
              set of figures, not drawn as a line each. Not remounted on a pick, so
              the list stays open while the reader checks several.
            */
            <CountySearch
              key="county"
              className={styles.search}
              pill
              browse
              multiple
              selected={picked.map((c) => c.geoid)}
              summary={countySummary}
              maxResults={8}
              counties={searchItems}
              renderValue={(c) => fmtInt(c.pop)}
              onSelect={(geoids) => onSelect(geoids.length ? geoids.join(',') : null)}
              placeholder="Find counties…"
              emptyText="No county matches that."
            />
          ) : (
            <CountySearch
              // Remount on a chamber or scope change, so the field shows the
              // place picked and a half-typed name does not linger.
              key={`${geo}:${scope.key}`}
              className={styles.search}
              pill
              initialLabel={searchLabel}
              // Open on focus with the chamber's districts in order, so the
              // choices are visible before typing.
              browse
              // Harris alone holds 24 House districts; the list scrolls.
              maxResults={40}
              counties={searchItems}
              renderValue={countiesBrief}
              onSelect={(geoid) => onSelect(geoid)}
              placeholder="Number or county…"
              emptyText={`No ${chamber?.label ?? ''} district matches that.`}
            />
          )}
          {/* The browser's own print dialog, which saves a PDF — the page
              carries a print stylesheet that lays the report out on paper. */}
          <button type="button" className={cx('pill', styles.print)} onClick={onPrint}>
            Print / PDF
          </button>
        </div>
      </div>

      <header className={styles.card}>
        {outline && <PlaceOutline {...outline} />}

        <div className={styles.body}>
          {/* Exact vs estimated, over a district's name — the first thing a
              reader copying a figure out of this box sees. */}
          {district && (
            <div className={styles.badgeRow}>
              <span
                className={cx(styles.badge, district.exact ? styles.badgeExact : styles.badgeEstimated)}
                title={
                  district.exact
                    ? 'Built from whole counties: the published HHSC caseloads, added up.'
                    : 'Includes part of a county split across districts: apportioned from the county total.'
                }
              >
                {district.exact ? 'Exact count' : 'Estimated'}
              </span>
            </div>
          )}
          <h1 className={styles.name}>{scope.label}</h1>
          {/* A long list is named by its first two counties; the rest are listed here. */}
          {picked.length > 3 && (
            <p className={styles.included}>Added together: {picked.map((c) => c.name).join(', ')}</p>
          )}

          {/*
            The same three figures for every place — Texas, a county or a district:
            the change in people and in children on SNAP since the window began, and
            in benefits spent. Each label names what changed; the sign says which way.
          */}
          <dl className={styles.stats}>
            <Stat
              label="Change in people on SNAP"
              value={changeLabel(figures.people)}
              sub={change.pct == null ? null : `${fmtPctDelta(change.pct, 1)} since ${fmtMonthBody(win[0])}`}
              negative={figures.people > 0}
            />
            <Stat
              label="Change in children on SNAP"
              value={changeLabel(figures.children)}
              sub="under 18"
              negative={figures.children > 0}
            />
            {/*
              Cumulative, not one month against another: every month
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
                : { label: SPENDING_LABEL, value: '—' })}
              sub={`estimated, against a typical month in the year before ${figures.sinceLabel}`}
              negative={figures.shortfall?.total > 0}
              title={
                figures.shortfall
                  ? `An estimate: the average month from ${figures.baseFromLabel} to ${fmtMonthBody(win[0])}, ` +
                    `minus SNAP benefits paid each month after it through ${fmtMonthBody(win[1])}, summed. ` +
                    'A month above that average counts against the total; a total above it shows as a gain (+).'
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
        </div>
      </header>
    </div>
  );
}

/** A count lost as a signed change: 138,946 lost → "−138,946", 1,204 gained → "+1,204". */
function changeLabel(n) {
  if (n == null) return '—';
  return n === 0 ? '0' : fmtDelta(-n);
}

function Stat({ label, value, sub, negative = false, title }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel} title={title}>
        {label}
      </dt>
      <dd className={cx(styles.statValue, negative && styles.negative, 'tabular')}>{value}</dd>
      {sub && <dd className={styles.statSub}>{sub}</dd>}
    </div>
  );
}
