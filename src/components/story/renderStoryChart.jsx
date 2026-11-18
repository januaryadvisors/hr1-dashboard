/**
 * The figure for a story step (StoryStep.chart), or null when the step has none
 * or its data did not load. A function rather than a component because the
 * rail and the phone caption need to know whether there is a chart at all.
 */
import { scaleLinear } from 'd3-scale';
import { COUNTY_TYPES, INDEX_DOMAINS, RULES_MONTH } from '../../config/story';
import { AGE_COLORS, ageGroupLoss, benefitShortfall, indexTo } from '../../lib/insights';
import { groupByCountyType, subjectPer100 } from '../../lib/storyFacts';
import {
  fmtInt,
  fmtMillions,
  fmtMonthBody,
  fmtMonthShort,
  fmtMonthTick,
  fmtPct,
  fmtThousands,
} from '../../lib/format';
import { DumbbellChart } from '../charts/DumbbellChart';
import { PieChart } from '../charts/PieChart';
import {
  IndexRecipe,
  LineFigure,
  LineLegend,
  ShortfallFigure,
  StripFigure,
  YearBarsFigure,
} from './StoryCharts';
import styles from './StoryCharts.module.css';

const NAVY = 'var(--ja-navy)';
const RED = 'var(--ja-burgundy)';
const METRO_GREY = '#a39c95';
/** The strips take hex colours, not CSS variables. */
const STRIP_TEAL = '#3f8e96';
const STRIP_RED = '#b44a3f';

/** Rounded y ticks and a domain that contains them. */
function niceY(values, count = 4) {
  const finite = values.filter(Number.isFinite);
  const scale = scaleLinear().domain([Math.min(...finite), Math.max(...finite)]).nice(count);
  return { domain: scale.domain(), ticks: scale.ticks(count) };
}

/** One strip per county type, for the work-rule and index strips. */
function countyTypeStrips(counties, accent, read) {
  const groups = groupByCountyType(counties);
  return COUNTY_TYPES.map((type) => ({
    label: type,
    sub: `${groups[type].length} counties`,
    color: type === 'Metro' ? METRO_GREY : accent,
    points: groups[type]
      .map((c) => ({ key: c.geoid, v: read(c) }))
      .filter((p) => Number.isFinite(p.v)),
  }));
}

function SnapLine({ snap, policyStart }) {
  const months = snap.months;
  const people = snap.statewide.individuals;
  const y = niceY(people);
  return (
    <>
      <LineFigure
        title="Texans enrolled in SNAP each month"
        months={months}
        series={[{ key: 'ind', label: 'Enrolled', values: people, color: NAVY, splitColor: RED }]}
        yDomain={y.domain}
        yTicks={y.ticks}
        yFormat={fmtMillions}
        xTicks={months
          .filter((m) => m.endsWith('-01'))
          .map((m) => ({ month: m, label: `'${m.slice(2, 4)}` }))}
        shadeFrom={policyStart}
        splitAt={policyStart}
        markers={[
          { month: policyStart, n: 1 },
          { month: RULES_MONTH, n: 2 },
        ]}
      />
      <p className={styles.figureKey}>
        <b>1</b> H.R. 1 signed, {fmtMonthBody(policyStart)} · <b>2</b> Texas rules take effect{' '}
        {fmtMonthShort(RULES_MONTH)} 1
      </p>
    </>
  );
}

function AgeLines({ statewide, months, i0, i1 }) {
  const band = (name) => statewide.age_series?.[name]?.slice(i0, i1 + 1);
  if (!band('18–59')) return null;
  const children = band('Under 5').map((v, i) => v + band('5–17')[i]);
  const lines = [
    { key: 'a', label: '18–59', values: indexTo(band('18–59'), 0), color: NAVY },
    { key: 'c', label: 'Children', values: indexTo(children, 0), color: '#c0643f' },
    { key: 'n', label: '60–64', values: indexTo(band('60–64'), 0), color: '#8b8585' },
    { key: 's', label: '65+', values: indexTo(band('65+'), 0), color: '#c9c3bd' },
  ];
  const shown = months.slice(i0, i1 + 1);
  return (
    <>
      <LineFigure
        title="SNAP enrollment by age group, indexed to the window start"
        months={shown}
        series={lines}
        yDomain={[50, 104]}
        yTicks={[50, 60, 70, 80, 90, 100]}
        yFormat={String}
        xTicks={[
          { month: shown[0], label: fmtMonthTick(shown[0]) },
          { month: RULES_MONTH, label: fmtMonthShort(RULES_MONTH) },
          { month: shown.at(-1), label: fmtMonthTick(shown.at(-1)) },
        ]}
        endLabels
        height={140}
      />
      <LineLegend items={lines.map((l) => ({ label: l.label, color: l.color }))} />
    </>
  );
}

/** Monthly payments since the signing against the year before it, or null. */
function shortfallSince(snap, policyStart) {
  const signed = snap?.statewide.payments ? snap.months.indexOf(policyStart) : -1;
  return signed >= 0 ? benefitShortfall(snap.statewide.payments, signed, snap.months.length - 1) : null;
}

function Shortfall({ snap, policyStart, short }) {
  const months = snap.months;
  const signed = months.indexOf(policyStart);
  return (
    <ShortfallFigure
      title="Total SNAP benefits paid each month"
      labels={months.slice(signed).map(fmtMonthShort)}
      values={snap.statewide.payments.slice(signed)}
      base={short.base}
      baseLabel={`${fmtMonthBody(months[short.baseFrom])} – ${fmtMonthBody(months[signed])} average`}
      hatchFrom={1}
      yTicks={[0, 200e6, 400e6, 600e6]}
      yFormat={(v) => `$${Math.round(v / 1e6)}M`}
    />
  );
}

function AgePie({ statewide, i0, i1, caption }) {
  const groups = ageGroupLoss(statewide.age_series, i0, i1);
  if (!groups?.some((g) => g.lost > 0)) return null;
  return (
    <PieChart
      slices={groups.map((g) => ({
        label: g.label,
        value: Math.max(0, g.lost),
        color: AGE_COLORS[g.label],
        count: g.lost > 0 ? `−${fmtThousands(g.lost)}K` : '—',
        share: g.lost > 0 ? fmtPct(g.share, 1) : '—',
      }))}
      size={96}
      compact
      caption={caption}
      countLabel="Change"
      shareLabel="Share"
      title="Texans no longer on SNAP, by age group"
    />
  );
}

function CepDropped({ history }) {
  return (
    <YearBarsFigure
      title="Texas schools that left the Community Eligibility Provision, by school year"
      rows={history.map((r, i) => ({
        // "2026-27" → "26–27": seven full years do not fit side by side.
        label: r.year.slice(2).replace('-', '–'),
        value: r.dropped,
        display: fmtInt(r.dropped),
        tone: i === history.length - 1 ? 'alert' : 'base',
      }))}
    />
  );
}

function MarketLine({ marketplace, policyStart }) {
  const { months, values } = marketplace.effectuated;
  const scale = scaleLinear().domain([0, Math.max(...values)]).nice(4);
  return (
    <LineFigure
      title="Texans with a paid Marketplace plan each month"
      months={months}
      series={[{ key: 'eff', label: 'Effectuated', values, color: NAVY }]}
      yDomain={scale.domain()}
      yTicks={scale.ticks(4).filter((t) => t > 0)}
      yFormat={(v) => `${Math.round(v / 1e6)}M`}
      xTicks={months
        .filter((m) => m.endsWith('-01') && Number(m.slice(0, 4)) % 2 === 0)
        .map((m) => ({ month: m, label: m.slice(0, 4) }))}
      rules={[
        { month: '2021-03', label: 'ARP' },
        { month: policyStart, label: 'H.R. 1', anchor: 'end', ly: 98 },
        { month: '2026-01', label: 'Tax credits expire', color: RED, anchor: 'end', ly: 110 },
      ]}
      endDot={RED}
      height={140}
    />
  );
}

function NeverPaid({ marketplace }) {
  const rows = marketplace.oep.filter((o) => o.not_effectuated_share != null);
  return (
    <YearBarsFigure
      title="Share of open-enrollment sign-ups not paid for by February"
      rows={rows.map((o, i) => ({
        label: String(o.year),
        value: o.not_effectuated_share,
        display: fmtPct(o.not_effectuated_share),
        tone: i === rows.length - 1 ? 'alert' : i === rows.length - 2 ? 'warn' : 'base',
      }))}
    />
  );
}

/**
 * @param {import('../../config/story').StoryStep} step
 * @param {{ counties: object[], statewide: object, months: string[], i0: number, i1: number,
 *   snap: object | null, marketplace: object | null }} data
 */
export function renderStoryChart(step, { counties, statewide, months, i0, i1, snap, marketplace }) {
  const policyStart = statewide.meta.policy_start;

  switch (step.chart) {
    case 'snapLine':
      return snap ? <SnapLine snap={snap} policyStart={policyStart} /> : null;
    case 'ageLines':
      return statewide.age_series?.['18–59'] ? (
        <AgeLines statewide={statewide} months={months} i0={i0} i1={i1} />
      ) : null;
    case 'shortfall': {
      const short = shortfallSince(snap, policyStart);
      return short ? <Shortfall snap={snap} policyStart={policyStart} short={short} /> : null;
    }
    case 'workStrip':
      return (
        <StripFigure
          title="Newly subject per 100 enrollees, by county type"
          groups={countyTypeStrips(counties, STRIP_TEAL, (c) => subjectPer100(c, i0))}
          domain={[0, 30]}
          ticks={[0, 10, 20, 30]}
          medianFormat={(v) => String(Math.round(v))}
          axisLabel="Newly subject per 100 enrollees"
        />
      );
    case 'agePie':
      return ageGroupLoss(statewide.age_series, i0, i1)?.some((g) => g.lost > 0) ? (
        <AgePie statewide={statewide} i0={i0} i1={i1} caption={step.subhead} />
      ) : null;
    case 'ageArrows': {
      const groups = ageGroupLoss(statewide.age_series, i0, i1);
      return groups ? <DumbbellChart rows={groups} viewWidth={320} rowH={26} ticks={4} /> : null;
    }
    case 'cepDropped':
      return statewide.cep_history?.length ? <CepDropped history={statewide.cep_history} /> : null;
    case 'indexRecipe':
      return <IndexRecipe domains={INDEX_DOMAINS} />;
    case 'indexStrip':
      return (
        <StripFigure
          title="Vulnerability index by county type"
          groups={countyTypeStrips(counties, STRIP_RED, (c) => c.vulnerability_score)}
          domain={[0, 4]}
          ticks={[0, 1, 2, 3, 4]}
          medianFormat={(v) => v.toFixed(2)}
          axisLabel="Vulnerability index, 0–4"
        />
      );
    case 'marketLine':
      return marketplace ? <MarketLine marketplace={marketplace} policyStart={policyStart} /> : null;
    case 'neverPaid':
      return marketplace ? <NeverPaid marketplace={marketplace} /> : null;
    default:
      return null;
  }
}
