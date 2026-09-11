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
 */
import { CountySearch } from './CountySearch';
import { Sparkline } from './Sparkline';
import { fmtInt, fmtMonth } from '../lib/format';
import type { MetricContext, MetricDef } from '../config/metrics';
import type { County } from '../types';
import styles from './ScatterPanel.module.css';

export interface ScatterPanelProps {
  counties: County[];
  /** Metrics offered on the active view. */
  options: MetricDef[];
  x: MetricDef;
  y: MetricDef;
  onChangeX: (id: string) => void;
  onChangeY: (id: string) => void;
  ctx: MetricContext;
  /** Hovered or searched county. */
  focus: County | null;
  onFocus: (geoid: string | null) => void;
  /** Window bounds, for the enrollment line's labels. */
  window: [string, string];
  /**
   * Show the child series instead of the whole caseload.
   *
   * Follows the map's active view, so the line beside the scatter is about the
   * same population the map above is coloured by.
   */
  childSeries: boolean;
}

/** Dropdown grouped by MetricDef.group, in registry order. */
function MetricSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: MetricDef[];
  value: string;
  onChange: (id: string) => void;
}) {
  const groups: { group: string; items: MetricDef[] }[] = [];
  for (const m of options) {
    const last = groups[groups.length - 1];
    if (last && last.group === m.group) last.items.push(m);
    else groups.push({ group: m.group, items: [m] });
  }

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function ScatterPanel({
  counties,
  options,
  x,
  y,
  onChangeX,
  onChangeY,
  ctx,
  focus,
  onFocus,
  window: win,
  childSeries,
}: ScatterPanelProps) {
  const readValue = (m: MetricDef, c: County) => {
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

        <MetricSelect
          id="scatter-x"
          label="Horizontal axis"
          options={options}
          value={x.id}
          onChange={onChangeX}
        />
        <MetricSelect
          id="scatter-y"
          label="Vertical axis"
          options={options}
          value={y.id}
          onChange={onChangeY}
        />
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
              the reason to distrust a rate. */}
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
            {!focus.is_gap && !focus.small_denominator && (
              <li className={styles.flag}>
                Not a gap county, and large enough for its rates to be stable.
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
