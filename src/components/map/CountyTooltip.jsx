/**
 * <CountyTooltip> — §7, spec'd in §6.5.
 *
 * WHAT SHOWS DEPENDS ON THE VIEW: `ViewDef.tooltip` decides, and the sections
 * are:
 *
 *   head      county, FIPS, population        always
 *   focus     the active layer's own band      score layers, except the index
 *   index     all five indexes, one row each   Vulnerability index only
 *   stats     the three facts, per ViewDef     always
 *   capacity  the four registries as columns   Vulnerability index only
 *   chart     caseload line, or exposure bars  per view
 *
 * The index table gives every index the same full-size scale in one column, so
 * the five read against each other.
 *
 * The domain spread is the Vulnerability index's whole argument — that the four
 * domains disagree (§8 tab 3) — so it stays there and only there.
 *
 * Follows the cursor on hover.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  foodbankCoverage,
  layerBasis,
  layerByKey,
  SCORE_LAYERS,
  scoreField,
  viewForLayer,
} from '../../config/layers';
import { cx } from '../../lib/cx';
import { fmtInt, fmtMonth, fmtPct, fmtPctDelta, fmtPercentile } from '../../lib/format';
import { binIndex, bivariatePalette, BIVARIATE_STEPS } from '../../lib/scales';
import { formatLayerValue } from '../../lib/layerValues';
import { median } from '../../lib/stats';
import { DomainScale } from '../charts/DomainScale';
import { InfraColumnChart, infraMax } from './InfraBars';
import { ExposureBars } from '../charts/ExposureBars';
import { Sparkline } from '../charts/Sparkline';
import styles from './CountyTooltip.module.css';

/**
 * @typedef {import('../../lib/layerValues').LayerValues} LayerValues
 * @typedef {import('../../types').County} County
 * @typedef {import('../../types').LayerKey} LayerKey
 * @typedef {import('../../types').Measure} Measure
 */

/**
 * Gap between the cursor and the panel's near corner. Small enough that the
 * panel reads as attached to the pointer rather than floating near it, and
 * still clear of the arrow cursor's own hotspot so it does not sit under the tip.
 */
const OFFSET = 6;
const WIDTH = 272;

/**
 * The labels for the layer's own series. Anything without an entry is SNAP.
 * `lost` and `lostRate` are followed by the window's first month.
 */
const SERIES_LABELS = {
  snap_enrolled: {
    enrolled: 'On SNAP',
    enrolledRate: '% of residents on SNAP',
    lost: 'Lost since',
    lostRate: '% lost since',
    chart: 'SNAP enrolled',
  },
  snap_children: {
    enrolled: 'Children on SNAP',
    enrolledRate: 'Children on SNAP, % of residents',
    lost: 'Children lost since',
    lostRate: '% of children lost since',
    chart: 'Children enrolled',
  },
};

/**
 * Statewide median per SCORED layer, and the registries' bar scale — computed
 * once for the dataset.
 *
 * The two loss layers are absent on purpose: their value moves with the brush,
 * so a fixed statewide reference would not describe them.
 *
 * @typedef {Object} LayerStats
 * @property {Record<string, number | null>} median
 * @property {Record<string, number>} infraMax - Top of each registry's bar, shared with the grid tiles so the
 *   tooltip's columns are drawn to the same scale.
 */

export function buildLayerStats(counties) {
  const medians = {};
  for (const layer of SCORE_LAYERS) {
    const field = scoreField(layer.key);
    medians[layer.key] = median(counties.map((c) => c[field]));
  }
  return { median: medians, infraMax: infraMax(counties) };
}

/** The county's score on a scored layer, or null when it has none. */
function scoreOf(county, key) {
  const value = county[scoreField(key)];
  return typeof value === 'number' ? value : null;
}

/** One index's scale: the county's caret against the statewide median tick. */
function IndexScale({ layerKey, value, stats }) {
  return (
    <DomainScale
      layer={layerKey}
      value={value}
      median={stats.median[layerKey] ?? 0}
      domain={layerKey === 'composite' ? [0, 4] : [0, 1]}
    />
  );
}

/**
 * The focused layer in full: every band coloured, caret, median tick. No
 * percentile or rank line — the scale already places the county.
 */
function FocusedIndex({ county, layer, stats }) {
  const l = layerByKey(layer);
  const value = scoreOf(county, l.key);
  return (
    <div className={cx(styles.domain, styles.active)}>
      <div className={styles.domainHead}>
        <span className={styles.domainLabel}>
          {l.key.toUpperCase()} · {l.label}
        </span>
        {value == null && <span className={styles.domainUnavailable}>no data</span>}
      </div>
      <IndexScale layerKey={l.key} value={value} stats={stats} />
    </div>
  );
}

/**
 * All five indexes, one per row: name and reading on the left, the scale on the
 * right, every scale the same width. Composite first, because it is what the
 * map is coloured by; the domains follow in framework order.
 */
function IndexTable({ county, layer, stats }) {
  const ordered = [
    ...SCORE_LAYERS.filter((l) => l.key === 'composite'),
    ...SCORE_LAYERS.filter((l) => l.key !== 'composite'),
  ];
  return (
    <div className={styles.indexTable}>
      {ordered.map((l) => {
        const value = scoreOf(county, l.key);
        /* The scale places the county, so only the composite quotes a number:
           its 0–4 score, the one the map is coloured by. A missing value still
           says so. */
        const valueLine =
          value == null ? 'no data' : l.key === 'composite' ? value.toFixed(2) : null;
        return (
          <div key={l.key} className={cx(styles.indexRow, l.key === layer && styles.indexRowActive)}>
            <div className={styles.indexText}>
              <div className={styles.indexLabel}>{l.label}</div>
              {valueLine && <div className={cx(styles.indexValue, 'tabular')}>{valueLine}</div>}
            </div>
            <IndexScale layerKey={l.key} value={value} stats={stats} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Which cell of the 3x3 this county is in. On a two-axis map the reader's first
 * question is "where am I in the key", and a single highlighted band per axis
 * answers it in the same colours the legend uses.
 */
function BivariateReadout({ county, layer, values }) {
  const grid = bivariatePalette(BIVARIATE_STEPS);
  const axes = layerByKey(layer).axes;
  const a = values.fill.get(county.geoid) ?? null;
  const b = values.secondary.fill.get(county.geoid) ?? null;
  const rows = [
    {
      axis: axes[0],
      text: formatLayerValue(layer, a),
      bin: binIndex(a, values.bins),
      // Red edge of the matrix: blue held at its low end.
      swatches: grid[0],
    },
    {
      axis: axes[1],
      text: fmtPercentile(b),
      bin: binIndex(b, values.secondary.bins),
      // Blue edge: red held at its low end.
      swatches: grid.map((row) => row[0]),
    },
  ];
  return (
    <div className={styles.bivariate}>
      <div className={styles.bivariateHead}>On this map</div>
      {rows.map((r) => (
        <div key={r.axis.label} className={styles.bivariateRow}>
          <span className={styles.bivariateLabel}>{r.axis.label}</span>
          <span className={cx(styles.bivariateValue, 'tabular')}>{r.text}</span>
          <span className={styles.bivariateBands} aria-hidden="true">
            {r.swatches.map((c, i) => (
              <span
                key={c + i}
                className={cx(styles.bivariateBand, i === r.bin && styles.bivariateBandActive)}
                style={{ background: i === r.bin ? c : '#efeded' }}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * @typedef {Object} CountyTooltipProps
 * @property {County | null} county
 * @property {LayerKey} layer
 * @property {LayerStats} stats
 * @property {LayerValues} [values] - The values the map is currently drawing. Passed in so the panel quotes the
 *   same numbers and the same classes as the shapes under the cursor — the
 *   bivariate readout below is meaningless if it re-derives them.
 * @property {string[]} months
 * @property {[string, string]} window
 * @property {Measure} [measure] - Rate or count. Decides the unit of the three facts at the top.
 * @property {'enrollment' | 'index'} [tooltipStats] - Which facts to show. From the view's TooltipSpec.
 *   'enrollment' — residents, on SNAP, lost since the window start — is every view's but the index's.
 * @property {import('../../types').FoodbankMeta} [foodbank] - statewide.meta.foodbank: the period and
 *   bank coverage the food-bank figures quote, so no date is written into this panel.
 * @property {number} [acaYear] - statewide.meta.aca_year: the open enrollment the Marketplace figure is from.
 * @property {'pointer' | 'external'} origin - 'pointer' anchors the panel to the cursor. 'external' (search, rank list)
 *   anchors it beside the county's own shape on the hero map.
 */

export function CountyTooltip({
  county,
  layer,
  stats,
  values,
  months,
  window: win,
  measure = 'count',
  tooltipStats = 'enrollment',
  foodbank,
  acaYear,
  origin,
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [countyAnchor, setCountyAnchor] = useState(null);

  /*
     The panel's real height, measured after each render, for the "would it
     overflow?" test below: a fixed estimate larger than most panels would pin
     the panel in place in the lower half of the screen. Set only when it
     changes, so this settles in one pass.
  */
  const rootRef = useRef(null);
  const [panelH, setPanelH] = useState(240);
  useLayoutEffect(() => {
    const h = rootRef.current?.offsetHeight;
    if (h && Math.abs(h - panelH) > 1) setPanelH(h);
  });

  useEffect(() => {
    const onMove = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /**
   * For an external selection, find the county's shape on the hero map and
   * anchor to its right edge. Read from the DOM rather than re-deriving screen
   * coordinates from the projection, because the map is scaled to fit its column
   * and the rendered geometry is the only thing that knows the true scale.
   */
  const geoid = county?.geoid;
  useEffect(() => {
    if (origin !== 'external' || !geoid) {
      setCountyAnchor(null);
      return;
    }
    const el = document.querySelector(`[data-hero-map] [data-geoid="${geoid}"]`);
    if (!el) {
      setCountyAnchor(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setCountyAnchor({ x: r.right, y: r.top + r.height / 2 });
  }, [origin, geoid]);

  const spec = viewForLayer(layer).tooltip;

  const i0 = months.indexOf(win[0]);
  const i1 = months.indexOf(win[1]);

  /**
   * Everything below reads the LAYER'S OWN series, so each view's tooltip is
   * about the population its map is coloured by — child enrollment on Children,
   * the whole caseload elsewhere.
   */
  const seriesField = layerByKey(layer).seriesField ?? 'snap_enrolled';
  const labels = SERIES_LABELS[seriesField] ?? SERIES_LABELS.snap_enrolled;
  /** Work requirements: the third figure is who the requirement reaches, not who left. */
  const isWorkView = viewForLayer(layer).key === 'work';
  /** ACA Marketplace: the third figure is the subsidised Marketplace population. */
  const isAcaView = viewForLayer(layer).key === 'aca';

  const enrollment = useMemo(() => {
    if (!county || i0 < 0 || i1 < 0) return [];
    return county[seriesField]?.slice(i0, i1 + 1) ?? [];
  }, [county, i0, i1, seriesField]);

  if (!county) return null;

  const fbCoverage = foodbankCoverage(foodbank);
  const fbHouseholds = county.foodbank_households;

  const anchor = countyAnchor ?? pos;

  // Flip at the viewport edge rather than letting the panel clip.
  const flipX = anchor.x + OFFSET + WIDTH > window.innerWidth;
  const left = Math.max(8, flipX ? anchor.x - OFFSET - WIDTH : anchor.x + OFFSET);
  const top = Math.max(
    8,
    anchor.y + OFFSET + panelH > window.innerHeight
      ? Math.min(anchor.y - OFFSET - panelH, window.innerHeight - panelH - 8)
      : anchor.y + OFFSET,
  );

  /* The window's endpoints, skipping any month the series does not have. */
  const published = enrollment.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const start = published[0] ?? 0;
  const end = published[published.length - 1] ?? 0;
  const pctChange = start > 0 ? (end - start) / start : null;
  // Share of the county's own caseload that is newly subject to the work
  // requirement. Independent of the active layer.
  const shareOfCaseload = start > 0 ? county.newly_subject_persons / start : null;

  /*
     Which facts this view puts at the top, and in which unit: the index view
     has its own four; every other view reports enrollment.
  */
  const counting = measure === 'count';
  const indexStats = tooltipStats === 'index';
  // Signed headcount change over the window; a gain is shown, not floored to 0.
  const netLost = start - end;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      style={{ left, top }}
      role="tooltip"
      aria-label={`${county.name} County details`}
    >
      <div className={styles.head}>
        <span>
          <span className={styles.countyName}>{county.name} County</span>
          <span className={styles.fips}>
            FIPS {county.geoid} · {fmtInt(county.pop)} residents
          </span>
        </span>
      </div>

      {/* Skipped on the loss layers, which have no percentile and no median to
          tick — the window change in the stat row below is their readout. */}
      {layerBasis(layer) === 'score' && !spec.domains && (
        <FocusedIndex county={county} layer={layer} stats={stats} />
      )}

      {/* Vulnerability index only — see ViewDef.tooltip.domains. */}
      {spec.domains && <IndexTable county={county} layer={layer} stats={stats} />}

      {values?.secondary && layerByKey(layer).axes && (
        <BivariateReadout county={county} layer={layer} values={values} />
      )}

      {/*
        THE THREE FACTS, IN THE MEASURE THE READER PICKED. The row follows the
        view AND the Rate/Count toggle, so the tooltip answers in the same unit
        as the map under it.

        `Residents` stays in both measures. It is the denominator rather than the
        measure, and keeping it holds the three columns steady when the toggle
        moves — a row that changes width as well as content reads as a different
        panel rather than the same one restated.
      */}
      <div className={cx(styles.stats, indexStats && styles.statsQuad)}>
        {indexStats ? (
          <>
            {/* Raw headcounts whatever the Rate/Count toggle says: the index is
                already the rate. Caseload now, its change, the county's
                population, then food-bank help. Three count PEOPLE and the
                food-bank one counts HOUSEHOLDS, so every figure names its unit —
                side by side they would otherwise read as the same kind of
                number. */}
            <div>
              <div className={styles.statLabel}>People on SNAP, {fmtMonth(win[1])}</div>
              <div className={cx(styles.statValue, 'tabular')}>
                {published.length ? fmtInt(end) : '—'}
              </div>
            </div>
            <div>
              <div className={styles.statLabel}>Change since {fmtMonth(win[0])}</div>
              <div className={cx(styles.statValue, netLost > 0 && styles.negative, 'tabular')}>
                {!published.length
                  ? '—'
                  : netLost > 0
                    ? `−${fmtInt(netLost)}`
                    : `+${fmtInt(-netLost)}`}
              </div>
              <div className={styles.statUnit}>people</div>
            </div>
            {/* Total population: the scale the other three figures sit against. */}
            <div>
              <div className={styles.statLabel}>Total population</div>
              <div className={cx(styles.statValue, 'tabular')}>{fmtInt(county.pop)}</div>
              <div className={styles.statUnit}>residents</div>
            </div>
            <div>
              <div
                className={styles.statLabel}
                title={[
                  'Unique households served by reporting food banks',
                  fbCoverage.period,
                  county.foodbank_banks?.join(', '),
                  fbCoverage.banks,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              >
                Households accessing SNAP application assistance via food banks
              </div>
              {/* null is "no reporting bank covers this county", not zero. */}
              <div
                className={cx(styles.statValue, fbHouseholds == null && styles.statMissing, 'tabular')}
              >
                {fbHouseholds == null ? 'No data yet' : fmtInt(fbHouseholds)}
              </div>
              <div className={styles.statUnit}>{fbCoverage.period}</div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className={styles.statLabel}>Residents</div>
              <div className={cx(styles.statValue, 'tabular')}>{fmtInt(county.pop)}</div>
            </div>
            <div>
              <div className={styles.statLabel}>
                {counting ? labels.enrolled : labels.enrolledRate}
              </div>
              <div className={cx(styles.statValue, 'tabular')}>
                {counting
                  ? fmtInt(end)
                  : county.pop > 0
                    ? fmtPct(end / county.pop, 1)
                    : '—'}
              </div>
            </div>
            {isWorkView ? (
              // Work requirements: the PUMS-modelled headcount newly subject, or
              // under Rate its share of the caseload.
              <div>
                <div
                  className={styles.statLabel}
                  title="Modelled: SNAP recipients newly subject to the H.R. 1 work requirement"
                >
                  {counting ? 'Newly subject to requirements' : '% of caseload newly subject'}
                </div>
                <div className={cx(styles.statValue, styles.negative, 'tabular')}>
                  {counting
                    ? fmtInt(county.newly_subject_persons)
                    : shareOfCaseload == null
                      ? '—'
                      : fmtPct(shareOfCaseload, 1)}
                </div>
              </div>
            ) : isAcaView ? (
              // ACA Marketplace: enrollees with a premium tax credit at the
              // latest open enrollment, or under Rate per 1,000 residents.
              <div>
                <div className={styles.statLabel} title="CMS open-enrollment county file">
                  {counting
                    ? `Subsidised Marketplace enrollees, ${acaYear}`
                    : `Subsidised Marketplace enrollees per 1,000, ${acaYear}`}
                </div>
                <div className={cx(styles.statValue, 'tabular')}>
                  {counting ? fmtInt(county.aptc_consumers) : (county.aptc_per_1k?.toFixed(0) ?? '—')}
                </div>
              </div>
            ) : (
              <div>
                <div className={styles.statLabel}>
                  {counting ? labels.lost : labels.lostRate} {fmtMonth(win[0])}
                </div>
                <div className={cx(styles.statValue, styles.negative, 'tabular')}>
                  {counting
                    ? start > end
                      ? `−${fmtInt(start - end)}`
                      : '0'
                    : pctChange == null
                      ? '—'
                      : fmtPctDelta(pctChange)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Capacity is the index view's story — see ViewDef.tooltip.capacity.
          The same bars as the grid tiles, on the same scale. §L7 applies:
          unsourced is n/a, and a county no reporting food bank covers is
          "no data", never a zero. The Insights report lists the same
          registries in words — see <HelpList>. */}
      {spec.capacity && (
        <div className={styles.capacity}>
          <InfraColumnChart county={county} max={stats.infraMax} />
        </div>
      )}

      {spec.chart === 'enrollment' && (
        <>
          <div className={styles.sparkHead}>
            {labels.chart}, {fmtMonth(win[0])} → {fmtMonth(win[1])}
          </div>
          <Sparkline values={enrollment} />
          <div className={styles.foot}>
            <span>{fmtInt(start)}</span>
            <span>{fmtInt(end)}</span>
          </div>
        </>
      )}

      {spec.chart === 'exposure' && (
        <>
          <div className={styles.sparkHead}>
            Who the requirement reaches, {fmtMonth(win[0])} → {fmtMonth(win[1])}
          </div>
          <ExposureBars
            rows={[
              { label: `Caseload, ${fmtMonth(win[0])}`, value: start, tone: 'base' },
              {
                label: 'Newly subject',
                value: county.newly_subject_persons,
                share: shareOfCaseload,
                tone: 'subject',
                modelled: true,
              },
              {
                label: 'Left SNAP since',
                value: Math.max(0, start - end),
                share: start > 0 ? Math.max(0, start - end) / start : null,
                tone: 'left',
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
