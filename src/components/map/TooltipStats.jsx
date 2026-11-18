/**
 * The county tooltip's row of facts, in the measure the reader picked so it
 * answers in the same unit as the map. The index view has its own four facts.
 */
import { foodbankCoverage } from '../../config/layers';
import { cx } from '../../lib/cx';
import { fmtInt, fmtMonth, fmtPct, fmtPctDelta } from '../../lib/format';
import styles from './CountyTooltip.module.css';

/** Labels for the layer's own series; anything not listed is all of SNAP. */
const SERIES_LABELS = {
  snap_enrolled: {
    enrolled: 'On SNAP',
    enrolledRate: '% of residents on SNAP',
    lost: 'Lost since',
    lostRate: '% lost since',
  },
  snap_children: {
    enrolled: 'Children on SNAP',
    enrolledRate: 'Children on SNAP, % of residents',
    lost: 'Children lost since',
    lostRate: '% of children lost since',
  },
};

export const seriesLabels = (field) => SERIES_LABELS[field] ?? SERIES_LABELS.snap_enrolled;

function Stat({ label, title, value, unit, negative = false, missing = false }) {
  return (
    <div>
      <div className={styles.statLabel} title={title}>
        {label}
      </div>
      <div className={cx(styles.statValue, negative && styles.negative, missing && styles.statMissing, 'tabular')}>
        {value}
      </div>
      {unit && <div className={styles.statUnit}>{unit}</div>}
    </div>
  );
}

/**
 * The index view: raw headcounts whatever the measure (the index is already
 * the rate), each naming its unit since people and households sit side by side.
 */
function IndexStats({ county, window: [from, to], trend, foodbank }) {
  const coverage = foodbankCoverage(foodbank);
  const households = county.foodbank_households;
  const netLost = trend.start - trend.end;
  return (
    <div className={cx(styles.stats, styles.statsQuad)}>
      <Stat label={`People on SNAP, ${fmtMonth(to)}`} value={trend.published ? fmtInt(trend.end) : '—'} />
      <Stat
        label={`Change since ${fmtMonth(from)}`}
        value={!trend.published ? '—' : netLost > 0 ? `−${fmtInt(netLost)}` : `+${fmtInt(-netLost)}`}
        unit="people"
        negative={netLost > 0}
      />
      <Stat label="Total population" value={fmtInt(county.pop)} unit="residents" />
      <Stat
        label="Households connected to benefits assistance through food banks"
        title={[
          'Unique households connected to benefits assistance by reporting food banks',
          coverage.period,
          county.foodbank_banks?.join(', '),
          coverage.banks,
        ]
          .filter(Boolean)
          .join(' · ')}
        // null means no reporting food bank covers the county, not zero.
        value={households == null ? 'No data yet' : fmtInt(households)}
        unit={coverage.period}
        missing={households == null}
      />
    </div>
  );
}

/** The third fact: who the work rule reaches, subsidised Marketplace enrollees, or the loss. */
function ThirdStat({ view, county, counting, trend, labels, from, acaYear }) {
  if (view === 'work') {
    return (
      <Stat
        label={counting ? 'Newly subject to requirements' : '% of caseload newly subject'}
        title="Modelled: SNAP recipients newly subject to the H.R. 1 work requirement"
        value={
          counting
            ? fmtInt(county.newly_subject_persons)
            : trend.subjectShare == null
              ? '—'
              : fmtPct(trend.subjectShare, 1)
        }
        negative
      />
    );
  }
  if (view === 'aca') {
    return (
      <Stat
        label={`Subsidised Marketplace enrollees${counting ? '' : ' per 1,000'}, ${acaYear}`}
        title="CMS open-enrollment county file"
        value={counting ? fmtInt(county.aptc_consumers) : county.aptc_per_1k?.toFixed(0) ?? '—'}
      />
    );
  }
  const lost = trend.start - trend.end;
  return (
    <Stat
      label={`${counting ? labels.lost : labels.lostRate} ${fmtMonth(from)}`}
      value={
        counting ? (lost > 0 ? `−${fmtInt(lost)}` : '0') : trend.change == null ? '—' : fmtPctDelta(trend.change)
      }
      negative
    />
  );
}

/**
 * @param {{
 *   kind: 'enrollment' | 'index',
 *   view: string,
 *   county: object,
 *   window: [string, string],
 *   counting: boolean,
 *   trend: { start: number, end: number, published: boolean, change: number | null, subjectShare: number | null },
 *   labels: object,
 *   foodbank?: object,
 *   acaYear?: number,
 * }} props
 *   `trend`: the layer's series at the window's ends (see CountyTooltip).
 */
export function TooltipStats({ kind, view, county, window, counting, trend, labels, foodbank, acaYear }) {
  if (kind === 'index') {
    return <IndexStats county={county} window={window} trend={trend} foodbank={foodbank} />;
  }
  // Residents stays in both measures, so the three columns hold steady when the measure changes.
  return (
    <div className={styles.stats}>
      <Stat label="Residents" value={fmtInt(county.pop)} />
      <Stat
        label={counting ? labels.enrolled : labels.enrolledRate}
        value={counting ? fmtInt(trend.end) : county.pop > 0 ? fmtPct(trend.end / county.pop, 1) : '—'}
      />
      <ThirdStat
        view={view}
        county={county}
        counting={counting}
        trend={trend}
        labels={labels}
        from={window[0]}
        acaYear={acaYear}
      />
    </div>
  );
}
