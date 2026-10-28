/**
 * <ScatterPanel> — the scatter's title and controls, framing the chart.
 *
 * The preset's question as a full-width title, the controls in a row under it,
 * then the chart at the card's full width, so the plot is wider than it is tall
 * and the quadrants stay easy to tell apart. The chart comes in as `chart` so
 * this component owns the order and the chart keeps its own sizing.
 *
 * The county readout is a tooltip beside the point (<ScatterTooltip>), styled
 * like the map's: hovering a point, or searching a county, shows the two axis
 * values, the enrollment line for the population the map above is coloured by,
 * and the two flags that matter whatever the axes are set to.
 *
 * ONE PICKER, NOT TWO. Offering the whole metric registry on each axis would be
 * some 500 orderings; most are meaningless and a handful are misleading. The
 * control picks a QUESTION and the preset supplies both axes, so every state of
 * this chart is one somebody chose. See SCATTER_PRESETS.
 */
import { CountySearch } from '../map/CountySearch';
import { Sparkline } from './Sparkline';
import { cx } from '../../lib/cx';
import { fmtInt, fmtMonth } from '../../lib/format';
import styles from './ScatterPanel.module.css';

/**
 * @typedef {import('../../config/metrics').MetricContext} MetricContext
 * @typedef {import('../../config/metrics').MetricDef} MetricDef
 * @typedef {import('../../config/metrics').ScatterPreset} ScatterPreset
 * @typedef {import('../../types').County} County
 */

/**
 * @typedef {Object} ScatterPanelProps
 * @property {County[]} counties
 * @property {ScatterPreset[]} presets - The curated pairings on offer.
 * @property {ScatterPreset} preset - The one showing.
 * @property {(id: string) => void} onChangePreset
 * @property {MetricDef} x - The preset's x axis, resolved: search results show each county's value on it.
 * @property {MetricContext} ctx
 * @property {(geoid: string | null) => void} onFocus - Search picks a county.
 * @property {import('react').ReactNode} chart - The scatter itself, set under the controls.
 */

export function ScatterPanel({ counties, presets, preset, onChangePreset, x, ctx, onFocus, chart }) {
  return (
    <div className={styles.root}>
      {/* The question is the point of the preset, so it heads the card as the
          chart's title. */}
      <h3 className={styles.question}>{preset.question}</h3>

      <div className={styles.form}>
        <div className={cx(styles.field, styles.compare)}>
          <label className={styles.fieldLabel} htmlFor="scatter-preset">
            Compare
          </label>
          <select
            id="scatter-preset"
            className={styles.select}
            value={preset.id}
            onChange={(e) => onChangePreset(e.target.value)}
          >
            {presets.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Find a county</span>
          <CountySearch
            counties={counties}
            renderValue={(c) => {
              const v = x.value(c, ctx);
              return v == null ? '—' : x.format(v);
            }}
            onSelect={onFocus}
          />
        </div>
      </div>

      {chart}
    </div>
  );
}

/**
 * <ScatterTooltip> — one county's readout, beside its point. Positioned by the
 * caller in the chart's own pixel space (see ScatterChart's renderOverlay).
 *
 * @param {{
 *   county: County,
 *   x: MetricDef,
 *   y: MetricDef,
 *   ctx: MetricContext,
 *   window: [string, string],
 *   childSeries: boolean,
 *   style: import('react').CSSProperties,
 * }} props
 */
export function ScatterTooltip({ county, x, y, ctx, window: win, childSeries, style }) {
  const readValue = (m) => {
    const v = m.value(county, ctx);
    return v == null ? '—' : m.format(v);
  };
  // The axis values say where the county sits; the line says how it got there.
  const series = childSeries ? county.snap_children : county.snap_enrolled;
  const slice = series?.slice(ctx.i0, ctx.i1 + 1) ?? [];

  return (
    <div className={styles.tooltip} style={style} role="status" aria-live="polite">
      <div className={styles.countyName}>{county.name} County</div>
      <p className={styles.fips}>
        FIPS {county.geoid} · {fmtInt(county.pop)} residents
      </p>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt className={styles.rowLabel}>{x.axis}</dt>
          <dd className={cx(styles.rowValue, 'tabular')}>{readValue(x)}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.rowLabel}>{y.axis}</dt>
          <dd className={cx(styles.rowValue, 'tabular')}>{readValue(y)}</dd>
        </div>
      </dl>

      {slice.length >= 2 && (
        <div className={styles.spark}>
          <div className={styles.sparkHead}>
            {childSeries ? 'Children enrolled' : 'SNAP enrolled'}, {fmtMonth(win[0])} →{' '}
            {fmtMonth(win[1])}
          </div>
          <Sparkline values={slice} />
          <div className={styles.sparkFoot}>
            <span className="tabular">{fmtInt(slice[0])}</span>
            <span className="tabular">{fmtInt(slice[slice.length - 1])}</span>
          </div>
        </div>
      )}

      {/* Two facts that stay relevant whatever the axes are set to — the gap
          flag is the section's whole subject, and a small denominator is the
          reason to distrust a rate. Nothing renders when neither applies: a
          flag area is read as a warning area. */}
      {(county.is_gap || county.small_denominator) && (
        <ul className={styles.flags}>
          {county.is_gap && (
            <li className={styles.flagAlert}>
              Gap county: top-quintile vulnerability, no CMS navigator listed.
            </li>
          )}
          {county.small_denominator && (
            <li className={styles.flag}>
              Under 10,000 residents — rates here move on a handful of households.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
