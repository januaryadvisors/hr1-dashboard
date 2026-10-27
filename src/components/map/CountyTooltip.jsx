/**
 * <CountyTooltip> — §7, spec'd in §6.5, redesigned 2026-09-01 to the client's
 * tooltip reference.
 *
 * WHAT SHOWS DEPENDS ON THE VIEW (client direction 2026-09-10). This panel used
 * to render everything on every view — five domain bands, four assistance
 * registries and an enrollment sparkline — regardless of what the reader was
 * looking at. `ViewDef.tooltip` now decides, and the sections are:
 *
 *   head      county, FIPS, population        always
 *   focus     the active layer's own band      score layers, except the index
 *   index     all five indexes, one row each   Vulnerability index only
 *   stats     the three facts, per ViewDef     always
 *   capacity  the four registries as columns   Vulnerability index only
 *   chart     caseload line, or exposure bars  per view
 *
 * The index table (2026-10-16) replaced a focused band over a two-up grid of
 * compact ones: every index now gets the same full-size scale in one column,
 * so the five read against each other rather than one against four thumbnails.
 *
 * The domain spread is the Vulnerability index's whole argument — that the four
 * domains disagree (§8 tab 3) — so it stays there and only there.
 *
 * Follows the cursor on hover.
 *
 * Click-to-pin (which froze the panel and added Expand / close controls) was
 * removed on 2026-09-01 to be reworked. The expanded detail block it revealed
 * lives on in git history — restoring it means reinstating `pinned` in the state
 * model and the two controls in this header.
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
import { fmtInt, fmtMonth, fmtPct, fmtPctDelta, fmtPercentile } from '../../lib/format';
import { binIndex, bivariatePalette, BIVARIATE_STEPS } from '../../lib/scales';
import { formatLayerValue } from '../../lib/layerValues';
/**
 * @typedef {import('../../lib/layerValues').LayerValues} LayerValues
 */
import { DomainScale } from '../charts/DomainScale';
import { InfraColumnChart, infraMax } from './InfraBars';
import { ExposureBars } from '../charts/ExposureBars';
import { Sparkline } from '../charts/Sparkline';
/**
 * @typedef {import('../../types').County} County
 * @typedef {import('../../types').LayerKey} LayerKey
 */
import styles from './CountyTooltip.module.css';

/**
 * Gap between the cursor and the panel's near corner.
 *
 * 6px, down from 12 on client direction 2026-09-11. Small enough that the panel
 * reads as attached to the pointer rather than floating near it, and still clear
 * of the arrow cursor's own hotspot so it does not sit under the tip.
 */
const OFFSET = 6;
const WIDTH = 272;

/**
 * Median and descending rank per SCORED layer — computed once for the dataset.
 *
 * The two loss layers are absent on purpose: their value moves with the brush,
 * and "40th of 254 on benefits lost" would be a different sentence every time
 * the window changed.
 *
 * @typedef {Object} LayerStats
 * @property {Record<string, number>} median
 * @property {Record<string, Map<string, number>>} rank
 * @property {number} total
 * @property {Record<string, number>} infraMax - Top of each registry's bar, shared with the grid tiles so the
 *   tooltip's columns are drawn to the same scale.
 */

export function buildLayerStats(counties) {
  const median = {};
  const rank = {};

  for (const layer of SCORE_LAYERS) {
    const field = scoreField(layer.key);
    const rows = counties
      .map((c) => ({ geoid: c.geoid, v: c[field] }))
      .filter((r) => typeof r.v === 'number');

    const sorted = [...rows].sort((a, b) => a.v - b.v);
    median[layer.key] = sorted.length ? sorted[Math.floor(sorted.length / 2)].v : 0;

    // Rank 1 = highest score = most exposed.
    const byDesc = [...rows].sort((a, b) => b.v - a.v);
    rank[layer.key] = new Map(byDesc.map((r, i) => [r.geoid, i + 1]));
  }

  return { median, rank, total: counties.length, infraMax: infraMax(counties) };
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
 *   'enrollment' — residents, on SNAP, lost since the window start — is every view's but the index's,
 *   Work requirements included (2026-10-16, was a "newly subject" row of its own).
 * @property {import('../../types').FoodbankMeta} [foodbank] - statewide.meta.foodbank: the period and
 *   bank coverage the food-bank figures quote, so no date is written into this panel.
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
  origin,
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [countyAnchor, setCountyAnchor] = useState(null);

  /*
     The panel's real height, measured after each render (2026-10-16). It was
     a fixed 400/520px estimate, larger than most panels, so in the lower half
     of the screen the "would it overflow?" test always said yes and the clamp
     pinned the panel in place — it looked as if it had stopped following the
     cursor. Set only when it changes, so this settles in one pass.
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
   * Medicaid on Medicaid, the whole caseload elsewhere.
   *
   * It was a child-or-not boolean until 2026-09-11, which meant the Medicaid
   * view's tooltip quoted SNAP figures under a Medicaid heading.
   */
  const seriesField = layerByKey(layer).seriesField ?? 'snap_enrolled';
  const isChildLayer = seriesField === 'snap_children';
  /** Work requirements: the third figure is who the requirement reaches, not who left. */
  const isWorkView = viewForLayer(layer).key === 'work';
  const isMedicaid = seriesField === 'medicaid_enrolled';

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
  const estHeight = panelH;
  const top = Math.max(
    8,
    anchor.y + OFFSET + estHeight > window.innerHeight
      ? Math.min(anchor.y - OFFSET - estHeight, window.innerHeight - estHeight - 8)
      : anchor.y + OFFSET,
  );

  /*
     The window's PUBLISHED endpoints, as windowLoss() resolves them. The SNAP
     series is dense so this is just the first and last; the observed Medicaid
     series has gaps and ends before the brush does, and reading its exact
     endpoints would show an em dash on every county at the default window.
  */
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
  const enrolledLabel = isMedicaid
    ? 'On Medicaid'
    : isChildLayer
      ? 'Children on SNAP'
      : 'On SNAP';
  const lostLabel = isMedicaid
    ? `Left Medicaid since ${fmtMonth(win[0])}`
    : isChildLayer
      ? `Children lost since ${fmtMonth(win[0])}`
      : `Lost since ${fmtMonth(win[0])}`;
  /** The same two facts as percentages, for the Rate measure. */
  const enrolledRateLabel = isMedicaid
    ? '% of residents on Medicaid'
    : isChildLayer
      ? 'Children on SNAP, % of residents'
      : '% of residents on SNAP';
  const lostRateLabel = isMedicaid
    ? `% left Medicaid since ${fmtMonth(win[0])}`
    : isChildLayer
      ? `% of children lost since ${fmtMonth(win[0])}`
      : `% lost since ${fmtMonth(win[0])}`;

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

      {/*
        Focused layer in full: every band coloured, caret, median tick.

        Skipped on the loss layers, which have no percentile and no median to
        tick — the window change in the stat row below is their readout, and the
        four domains still show in the grid so the framework is not hidden.
      */}
      {layerBasis(layer) === 'score' &&
        !spec.domains &&
        (() => {
        const l = layerByKey(layer);
        const value = county[scoreField(l.key)];
        const num = typeof value === 'number' ? value : null;
        const isComposite = l.key === 'composite';
        // No percentile or rank line (client direction 2026-10-16): the scale
        // below already places the county, and "p26 · 226th" read as noise.
        return (
          <div className={`${styles.domain} ${styles.active}`}>
            <div className={styles.domainHead}>
              <span className={styles.domainLabel}>
                {l.key.toUpperCase()} · {l.label}
              </span>
              {num == null && <span className={styles.domainUnavailable}>no data</span>}
            </div>
            <DomainScale
              layer={l.key}
              value={num}
              median={stats.median[l.key] ?? 0}
              domain={isComposite ? [0, 4] : [0, 1]}
            />
          </div>
        );
      })()}

      {/*
        All five indexes, one per row: name and reading on the left, the scale
        on the right, every scale the same width. Composite first and tinted,
        because it is what the map is coloured by; the domains follow in
        framework order. Vulnerability index only — see ViewDef.tooltip.domains.
      */}
      {spec.domains && (
        <div className={styles.indexTable}>
          {[
            ...SCORE_LAYERS.filter((l) => l.key === 'composite'),
            ...SCORE_LAYERS.filter((l) => l.key !== 'composite'),
          ].map((l) => {
            const value = county[scoreField(l.key)];
            const num = typeof value === 'number' ? value : null;
            const isComposite = l.key === 'composite';
            /* No percentile or rank under each index (client direction
               2026-10-16) — the scale beside it places the county. The
               composite keeps its 0–4 score, the number the map is coloured
               by; a missing value still says so. */
            const valueLine = num == null ? 'no data' : isComposite ? num.toFixed(2) : null;
            return (
              <div
                key={l.key}
                className={`${styles.indexRow} ${l.key === layer ? styles.indexRowActive : ''}`}
              >
                <div className={styles.indexText}>
                  <div className={styles.indexLabel}>{l.label}</div>
                  {valueLine && (
                    <div className={`${styles.indexValue} tabular`}>{valueLine}</div>
                  )}
                </div>
                <DomainScale
                  layer={l.key}
                  value={num}
                  median={stats.median[l.key] ?? 0}
                  domain={isComposite ? [0, 4] : [0, 1]}
                />
              </div>
            );
          })}
        </div>
      )}

      {/*
        Which cell of the 3x3 this county is in.
        On a two-axis map the reader's first question is "where am I in the
        key", and a single highlighted band per axis answers it in the same
        colours the legend uses.
      */}
      {values?.secondary && layerByKey(layer).axes && (
        <div className={styles.bivariate}>
          <div className={styles.bivariateHead}>On this map</div>
          {(() => {
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
            return rows.map((r) => (
              <div key={r.axis.label} className={styles.bivariateRow}>
                <span className={styles.bivariateLabel}>{r.axis.label}</span>
                <span className={`${styles.bivariateValue} tabular`}>{r.text}</span>
                <span className={styles.bivariateBands} aria-hidden="true">
                  {r.swatches.map((c, i) => (
                    <span
                      key={c + i}
                      className={`${styles.bivariateBand} ${
                        i === r.bin ? styles.bivariateBandActive : ''
                      }`}
                      style={{ background: i === r.bin ? c : '#efeded' }}
                    />
                  ))}
                </span>
              </div>
            ));
          })()}
        </div>
      )}

      {/*
        THE THREE FACTS, IN THE MEASURE THE READER PICKED — 2026-09-11.

        This row used to be fixed at "Newly subject / Of caseload / Since", which
        put a work-requirement figure at the top of every tooltip including the
        one for Benefits lost, where the question is how many people left. It now
        follows the view AND the Rate/Count toggle, so the tooltip answers in the
        same unit as the map under it.

        `Residents` stays in both measures. It is the denominator rather than the
        measure, and keeping it holds the three columns steady when the toggle
        moves — a row that changes width as well as content reads as a different
        panel rather than the same one restated.
      */}
      <div className={`${styles.stats} ${indexStats ? styles.statsQuad : ''}`}>
        {indexStats ? (
          <>
            {/* Raw headcounts on client direction 2026-10-16, whatever the
                Rate/Count toggle says: the index is already the rate. Order on
                client direction 2026-10-16: caseload now, its change, the
                county's population, then food-bank help. Three count PEOPLE and
                the food-bank one counts HOUSEHOLDS, so every figure names its
                unit — side by side they would otherwise read as the same kind
                of number. */}
            <div>
              <div className={styles.statLabel}>People on SNAP, {fmtMonth(win[1])}</div>
              <div className={`${styles.statValue} tabular`}>
                {published.length ? fmtInt(end) : '—'}
              </div>
            </div>
            <div>
              <div className={styles.statLabel}>Change since {fmtMonth(win[0])}</div>
              <div
                className={`${styles.statValue} ${netLost > 0 ? styles.negative : ''} tabular`}
              >
                {!published.length
                  ? '—'
                  : netLost > 0
                    ? `−${fmtInt(netLost)}`
                    : `+${fmtInt(-netLost)}`}
              </div>
              <div className={styles.statUnit}>people</div>
            </div>
            {/* Total population in place of "newly subject" on the index view
                (2026-10-16): the scale the other three figures sit against. */}
            <div>
              <div className={styles.statLabel}>Total population</div>
              <div className={`${styles.statValue} tabular`}>{fmtInt(county.pop)}</div>
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
                className={`${styles.statValue} ${
                  fbHouseholds == null ? styles.statMissing : ''
                } tabular`}
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
              <div className={`${styles.statValue} tabular`}>{fmtInt(county.pop)}</div>
            </div>
            <div>
              <div className={styles.statLabel}>
                {counting ? enrolledLabel : enrolledRateLabel}
              </div>
              <div className={`${styles.statValue} tabular`}>
                {counting
                  ? fmtInt(end)
                  : county.pop > 0
                    ? fmtPct(end / county.pop, 1)
                    : '—'}
              </div>
            </div>
            {isWorkView ? (
              // Work requirements (2026-10-16): the PUMS-modelled headcount
              // newly subject, or under Rate its share of the caseload.
              <div>
                <div
                  className={styles.statLabel}
                  title="Modelled: SNAP recipients newly subject to the H.R. 1 work requirement"
                >
                  {counting ? 'Newly subject to requirements' : '% of caseload newly subject'}
                </div>
                <div className={`${styles.statValue} ${styles.negative} tabular`}>
                  {counting
                    ? fmtInt(county.newly_subject_persons)
                    : shareOfCaseload == null
                      ? '—'
                      : fmtPct(shareOfCaseload, 1)}
                </div>
              </div>
            ) : (
              <div>
                <div className={styles.statLabel}>
                  {counting ? lostLabel : lostRateLabel}
                </div>
                <div className={`${styles.statValue} ${styles.negative} tabular`}>
                  {counting
                    ? fmtInt(Math.max(0, start - end))
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
          The same bars as the grid tiles, on the same scale. §L7 still
          applies: unsourced is n/a, and a county no reporting food bank
          covers is "no data", never a zero. */}
      {/* The bar chart stays here (client direction 2026-10-16); the Insights
          report lists the same registries in words — see <HelpList>. */}
      {spec.capacity && (
        <div className={styles.capacity}>
          <InfraColumnChart county={county} max={stats.infraMax} />
        </div>
      )}

      {spec.chart === 'enrollment' && (
        <>
          <div className={styles.sparkHead}>
            {isMedicaid ? 'On Medicaid' : isChildLayer ? 'Children enrolled' : 'SNAP enrolled'},{' '}
            {fmtMonth(win[0])} →{' '}
            {fmtMonth(win[1])}
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
