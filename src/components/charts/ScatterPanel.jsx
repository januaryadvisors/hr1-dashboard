/**
 * <ScatterPanel> — the scatter's controls and readout, in the column beside it.
 *
 * Replaces the floating tooltip for this chart on client direction 2026-09-11,
 * and it is a better fit than a tooltip was: the panel can hold the axis
 * pickers as well as the readout, it does not cover the points it is describing,
 * and a value that stays on screen can be read twice and written down. A
 * legislative aide copying two figures off a hover tooltip is a bad experience.
 *
 * Default state is the form and a prompt. Hovering a point, or searching a
 * county, fills in that county's readout: the two axis values, the enrollment
 * line for the population the map above is coloured by, and the two flags that
 * matter whatever the axes are set to.
 *
 * ONE PICKER, NOT TWO — 2026-09-11 direction. It used to offer the whole metric
 * registry on each axis, which is some 500 orderings; most are meaningless and a
 * handful are misleading, and finding the few good ones was left to the reader.
 * The control now picks a QUESTION and the preset supplies both axes, so every
 * state of this chart is one somebody chose. See SCATTER_PRESETS.
 */
import { CountySearch } from '../map/CountySearch';
import { Sparkline } from './Sparkline';
import { fmtInt, fmtMonth } from '../../lib/format';
/**
 * @typedef {import('../../config/metrics').MetricContext} MetricContext
 * @typedef {import('../../config/metrics').MetricDef} MetricDef
 * @typedef {import('../../config/metrics').ScatterPreset} ScatterPreset
 */
/**
 * @typedef {import('../../types').County} County
 */
import styles from './ScatterPanel.module.css';

/**
 * @typedef {Object} ScatterPanelProps
 * @property {County[]} counties
 * @property {ScatterPreset[]} presets - The curated pairings on offer.
 * @property {ScatterPreset} preset - The one showing.
 * @property {(id: string) => void} onChangePreset
 * @property {MetricDef} x - The preset's axes, resolved. Read-only here.
 * @property {MetricDef} y
 * @property {MetricContext} ctx
 * @property {County | null} focus - Hovered or searched county.
 * @property {(geoid: string | null) => void} onFocus
 * @property {[string, string]} window - Window bounds, for the enrollment line's labels.
 * @property {boolean} childSeries - Show the child series instead of the whole caseload.
 *   Follows the map's active view, so the line beside the scatter is about the
 *   same population the map above is coloured by.
 */

export function ScatterPanel({
  counties,
  presets,
  preset,
  onChangePreset,
  x,
  y,
  ctx,
  focus,
  onFocus,
  window: win,
  childSeries,
}) {
  const readValue = (m, c) => {
    const v = m.value(c, ctx);
    return v == null ? '—' : m.format(v);
  };

  return (
    <div className={styles.root}>
      <div className={styles.form}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Find a county</span>
          <CountySearch
            counties={counties}
            renderValue={(c) => readValue(x, c)}
            onSelect={onFocus}
          />
        </div>

        <div className={styles.field}>
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
          {/* The question is the point of the preset, so it is on screen rather
              than in a title attribute. */}
          <p className={styles.question}>{preset.question}</p>
          <p className={styles.axisNote}>
            Horizontal: {x.axis} · Vertical: {y.axis}
          </p>
        </div>
      </div>

      {focus ? (
        <div className={styles.readout}>
          <div className={styles.readoutHead}>
            <span className={styles.countyName}>{focus.name} County</span>
            <button
              type="button"
              className={styles.clear}
              onClick={() => onFocus(null)}
              aria-label="Clear selection"
            >
              ×
            </button>
          </div>
          <p className={styles.fips}>
            FIPS {focus.geoid} · {fmtInt(focus.pop)} residents
          </p>

          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.rowLabel}>{x.axis}</dt>
              <dd className={`${styles.rowValue} tabular`}>{readValue(x, focus)}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.rowLabel}>{y.axis}</dt>
              <dd className={`${styles.rowValue} tabular`}>{readValue(y, focus)}</dd>
            </div>
          </dl>

          {/* Carried over from the tooltip this panel replaced: the axis values
              say where the county sits, the line says how it got there. */}
          {(() => {
            const series = childSeries ? focus.snap_children : focus.snap_enrolled;
            const i0 = ctx.i0;
            const i1 = ctx.i1;
            const slice = series?.slice(i0, i1 + 1) ?? [];
            if (slice.length < 2) return null;
            return (
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
            );
          })()}

          {/* Two facts that stay relevant whatever the axes are set to — the
              gap flag is the section's whole subject, and a small denominator is
              the reason to distrust a rate.

              Nothing renders when neither applies. The "all clear" line that
              used to fill that space was removed on 2026-09-11: a flag area is
              read as a warning area, and printing a sentence there on the
              majority of counties trained the eye to skip it. */}
          <ul className={styles.flags}>
            {focus.is_gap && (
              <li className={styles.flagAlert}>
                Gap county: top-quintile vulnerability, no food bank site and no navigator listed.
              </li>
            )}
            {focus.small_denominator && (
              <li className={styles.flag}>
                Under 10,000 residents — rates here move on a handful of households.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className={styles.readout}>
          {/* The capacity definition and the zero-navigator figure used to fill
              this space; both were removed on 2026-09-11 and are going into a
              methodology page. */}
          <p className={styles.hint}>Hover a county on the chart, or search for one above.</p>
        </div>
      )}
    </div>
  );
}
