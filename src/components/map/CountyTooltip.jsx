/**
 * The county panel over the hero map. What it shows depends on the view
 * (ViewDef.tooltip):
 *
 *   head      county name and FIPS                    always
 *   focus     the mapped layer's scale                score layers, not the index
 *   index     all five indexes                        Vulnerability index
 *   stats     a row of facts                          always
 *   capacity  the assistance registries as columns    Vulnerability index
 *   chart     caseload line or work-rule bars         per view
 */
import { useEffect, useMemo } from 'react';
import { layerBasis, layerByKey, SCORE_LAYERS, scoreField, viewForLayer } from '../../config/layers';
import { cx } from '../../lib/cx';
import { fmtInt, fmtMonth } from '../../lib/format';
import { median } from '../../lib/stats';
import { ExposureBars } from '../charts/ExposureBars';
import { Sparkline } from '../charts/Sparkline';
import { InfraColumnChart, infraMax } from './InfraBars';
import { BivariateReadout, FocusedIndex, IndexTable } from './TooltipIndex';
import { seriesLabels, TooltipStats } from './TooltipStats';
import { useTooltipPlacement } from './useTooltipPlacement';
import styles from './CountyTooltip.module.css';

const WIDTH = 272;
/** The index view's panel carries the most, so it is drawn larger. */
const WIDTH_LARGE = 360;

const CHART_TITLES = { snap_enrolled: 'SNAP enrolled', snap_children: 'Children enrolled' };

/**
 * Statewide medians for the index scales, and the assistance bars' scale
 * (shared with the box chart). Computed once for the dataset.
 *
 * @returns {{ median: Record<string, number | null>, infraMax: Record<string, number> }}
 */
export function buildLayerStats(counties) {
  const medians = Object.fromEntries(
    SCORE_LAYERS.map((l) => [l.key, median(counties.map((c) => c[scoreField(l.key)]))]),
  );
  return { median: medians, infraMax: infraMax(counties) };
}

/** The series at the window's ends, skipping months it has no number for. */
function trendOf(county, series) {
  const published = series.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const start = published[0] ?? 0;
  const end = published.at(-1) ?? 0;
  return {
    start,
    end,
    published: published.length > 0,
    change: start > 0 ? (end - start) / start : null,
    subjectShare: start > 0 ? county.newly_subject_persons / start : null,
  };
}

function useEscape(onClose) {
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/**
 * @param {object} props
 * @param {object | null} props.county
 * @param {string} props.layer
 * @param {ReturnType<typeof buildLayerStats>} props.stats
 * @param {object} [props.values] - What the map is drawing, so the panel quotes the same numbers.
 * @param {string[]} props.months
 * @param {[string, string]} props.window
 * @param {'rate' | 'count'} [props.measure]
 * @param {'enrollment' | 'index'} [props.tooltipStats] - Which facts row to show.
 * @param {object} [props.foodbank] - statewide.meta.foodbank.
 * @param {number} [props.acaYear]
 * @param {'pointer' | 'external' | 'list'} props.origin - What it is anchored to; see useTooltipPlacement.
 * @param {() => void} [props.onClose] - Shows a close button (and Escape closes).
 * @param {() => void} [props.onHold] - Called when the pointer rests on the panel.
 * @param {() => void} [props.onRelease] - Called when the pointer leaves it.
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
  onClose,
  onHold,
  onRelease,
}) {
  const view = viewForLayer(layer);
  const spec = view.tooltip;
  const placement = useTooltipPlacement({
    origin,
    geoid: county?.geoid,
    width: spec.domains ? WIDTH_LARGE : WIDTH,
    rowRight: view.key === 'vulnerability',
  });
  useEscape(onClose);

  // Every figure reads the mapped layer's own series: children on Children, everyone elsewhere.
  const seriesField = layerByKey(layer).seriesField ?? 'snap_enrolled';
  const i0 = months.indexOf(win[0]);
  const i1 = months.indexOf(win[1]);
  const series = useMemo(
    () => (county && i0 >= 0 && i1 >= 0 ? county[seriesField]?.slice(i0, i1 + 1) ?? [] : []),
    [county, i0, i1, seriesField],
  );

  if (!county || placement.hidden) return null;

  const trend = trendOf(county, series);
  const span = `${fmtMonth(win[0])} → ${fmtMonth(win[1])}`;

  return (
    <div
      ref={placement.ref}
      className={cx(styles.root, spec.domains && styles.large, (onClose || onHold) && styles.solid)}
      onMouseEnter={onHold}
      onMouseLeave={onRelease}
      style={placement.style}
      role={onClose ? 'dialog' : 'tooltip'}
      aria-label={`${county.name} County details`}
    >
      <div className={styles.head}>
        <span>
          <span className={styles.countyName}>{county.name} County</span>
          <span className={styles.fips}>FIPS {county.geoid}</span>
        </span>
        {onClose && (
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {layerBasis(layer) === 'score' && !spec.domains && <FocusedIndex county={county} layer={layer} stats={stats} />}
      {spec.domains && <IndexTable county={county} layer={layer} stats={stats} />}
      {values?.secondary && layerByKey(layer).axes && <BivariateReadout county={county} layer={layer} values={values} />}

      <TooltipStats
        kind={tooltipStats}
        view={view.key}
        county={county}
        window={win}
        counting={measure === 'count'}
        trend={trend}
        labels={seriesLabels(seriesField)}
        foodbank={foodbank}
        acaYear={acaYear}
      />

      {spec.capacity && (
        <div className={styles.capacity}>
          <InfraColumnChart county={county} max={stats.infraMax} large={spec.domains} />
          <p className={styles.note}>
            The Texas Health and Human Services (HHS) Community Partner Program (CPP) connects local
            organizations with the state to help residents apply for and manage benefits (such as SNAP
            food assistance, Medicaid, CHIP, and TANF) online or offline.
          </p>
        </div>
      )}

      {spec.chart === 'enrollment' && (
        <>
          <div className={styles.sparkHead}>
            {CHART_TITLES[seriesField] ?? CHART_TITLES.snap_enrolled}, {span}
          </div>
          <Sparkline values={series} />
          <div className={styles.foot}>
            <span>{fmtInt(trend.start)}</span>
            <span>{fmtInt(trend.end)}</span>
          </div>
        </>
      )}

      {spec.chart === 'exposure' && (
        <>
          <div className={styles.sparkHead}>Who the requirement reaches, {span}</div>
          <ExposureBars
            rows={[
              { label: `Caseload, ${fmtMonth(win[0])}`, value: trend.start, tone: 'base' },
              {
                label: 'Newly subject',
                value: county.newly_subject_persons,
                share: trend.subjectShare,
                tone: 'subject',
                modelled: true,
              },
              {
                label: 'Lost SNAP since',
                value: Math.max(0, trend.start - trend.end),
                share: trend.start > 0 ? Math.max(0, trend.start - trend.end) / trend.start : null,
                tone: 'left',
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
