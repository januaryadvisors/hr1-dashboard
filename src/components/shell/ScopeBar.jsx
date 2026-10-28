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
import { PlaceOutline } from './PlaceOutline';
import { cx } from '../../lib/cx';
import { fmtInt, fmtMonthBody, fmtPctDelta } from '../../lib/format';
import { shortfallLabels } from '../../lib/insights';
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
 * @property {(geoid: string | null) => void} onSelect
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

  const searchLabel = (geo === 'county' ? county : district?.plan === geo ? district : null)?.name;

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
          <CountySearch
            // Remount on a geography or scope change, so the field shows the
            // place picked and a half-typed name does not linger.
            key={`${geo}:${scope.key}`}
            className={styles.search}
            pill
            initialLabel={searchLabel}
            // Open on focus with the whole list (254 counties, or the chamber's
            // districts in order), so the choices are visible before typing.
            browse
            // Harris alone holds 24 House districts; the list scrolls.
            maxResults={geo === 'county' ? 8 : 40}
            counties={searchItems}
            renderValue={(c) => (c.plan ? countiesBrief(c) : fmtInt(c.pop))}
            onSelect={(geoid) => onSelect(geoid)}
            placeholder={chamber ? 'Number or county…' : 'Find a county…'}
            emptyText={chamber ? `No ${chamber.label} district matches that.` : 'No county matches that.'}
          />
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

          {/*
            The same three figures for every place — Texas, a county or a district:
            people and children no longer on SNAP since the window began, and how
            much less in benefits has gone out.
          */}
          <dl className={styles.stats}>
            <Stat
              label="People no longer on SNAP"
              value={lossLabel(figures.people)}
              sub={change.pct == null ? null : `${fmtPctDelta(change.pct, 1)} since ${fmtMonthBody(win[0])}`}
              negative={figures.people > 0}
            />
            <Stat label="Children no longer on SNAP" value={lossLabel(figures.children)} sub="under 18" negative={figures.children > 0} />
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
        </div>
      </header>
    </div>
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
      <dd className={cx(styles.statValue, negative && styles.negative, 'tabular')}>{value}</dd>
      {sub && <dd className={styles.statSub}>{sub}</dd>}
    </div>
  );
}
