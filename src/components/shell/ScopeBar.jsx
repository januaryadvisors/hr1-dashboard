/**
 * <ScopeBar> — the Insights page header. Picks what every chart below reads
 * from: Texas, or one county.
 *
 * This is the control that turns the Insights page into a county stat page. The
 * selection lives in `state.scope` and mirrors to `?county=`, so the URL in the
 * address bar after picking a county IS the shareable link — there is no
 * separate "generate report" step to get out of sync with what is on screen.
 *
 * When a county is scoped the bar also carries its headline figures, because a
 * reader who was sent this link arrives wanting four numbers, not a chart.
 */
import { CountySearch } from '../map/CountySearch';
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
 * @property {LossRank | null} rank - Where the county ranks among all 254. null when scoped to the state.
 * @property {[string, string]} window
 * @property {(geoid: string | null) => void} onSelect
 */

export function ScopeBar({
  counties,
  scope,
  change,
  rank,
  window: win,
  onSelect,
}) {
  const isCounty = scope.county != null;
  const county = scope.county;

  /**
   * Share of this county's own caseload newly subject to the work requirement.
   * §10: the numerator is PUMS-modelled, flagged wherever shown.
   */
  const subjectShare =
    county && change.start > 0 ? county.newly_subject_persons / change.start : null;

  return (
    <header className={styles.root}>
      <div className={styles.topRow}>
        <div className={styles.identity}>
          <span className="eyebrow">{isCounty ? 'County report' : 'Statewide'}</span>
          <h1 className={styles.name}>{scope.label}</h1>
          <p className={styles.meta}>
            {isCounty ? (
              <>
                FIPS {county?.geoid} · {fmtInt(scope.population)} residents ·{' '}
                {fmtMonthBody(win[0])} → {fmtMonthBody(win[1])}
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
          <CountySearch
            counties={counties}
            renderValue={(c) => fmtInt(c.pop)}
            onSelect={(geoid) => onSelect(geoid)}
          />
          {isCounty && (
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
          <dt className={styles.statLabel}>
            {isCounty ? 'Participation rate' : 'Texans enrolled'}
          </dt>
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
      {rank && (
        <p className={styles.compare}>
          <strong>{scope.label}</strong> lost <strong>{fmtPctDelta(rank.pct, 1)}</strong> of its
          caseload, against {fmtPctDelta(rank.statePct, 1)} for Texas as a whole and{' '}
          {fmtPctDelta(rank.medianPct, 1)} for the median county. That is the{' '}
          <strong>{ordinal(rank.rank)} steepest</strong> percentage loss of {rank.total} counties.
          {county?.small_denominator && (
            <span className={styles.caveat}>
              {' '}
              Under 10,000 residents — a percentage on a caseload this small moves on a handful of
              households. See the funnel plot before quoting the rank.
            </span>
          )}
        </p>
      )}

      {county && subjectShare != null && (
        <p className={styles.compare}>
          <strong>{fmtInt(county.newly_subject_persons)}</strong> residents are newly subject to
          H.R. 1&rsquo;s work requirement — {fmtPct(subjectShare, 0)} of the caseload at the start
          of this window.{' '}
          <span className={styles.caveat}>
            PUMS-modelled estimate, not a lookup.
          </span>
        </p>
      )}
    </header>
  );
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
