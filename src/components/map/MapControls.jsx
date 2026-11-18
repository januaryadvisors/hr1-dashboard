/**
 * Everything inside the hero map's "Map options" popover. Each control shows
 * only on the views where it does something; nothing is ever greyed out.
 */
import { useMemo } from 'react';
import { INFRA_TYPES, layerByKey } from '../../config/layers';
import { ALL_INFRA } from '../../state/appState';
import { cx } from '../../lib/cx';
import { SegmentedControl } from '../shell/SegmentedControl';
import { Switch } from '../shell/Switch';
import { INFRA_COLOR, InfraGlyph } from './InfraGlyph';
import { MapOption, MapOptions } from './MapOptions';
import styles from './MapControls.module.css';

const AVAILABLE_INFRA = INFRA_TYPES.filter((t) => t.available);

const MEASURE_OPTIONS = [
  { value: 'rate', label: 'Rate', title: 'A share or a percentile, coloured as a choropleth' },
  { value: 'count', label: 'Count', title: 'People, as proportional symbols' },
];

const CAPACITY_OPTIONS = [
  { value: 'index', label: 'Index only', title: 'The vulnerability index alone' },
  {
    value: 'capacity',
    label: 'Index + assistance',
    title: 'With the enrollment help listed in each county drawn over it',
  },
];

const STYLE_OPTIONS = [
  { value: 'geo', label: 'Geo', title: 'True county polygons' },
  { value: 'density', label: 'Density', title: 'Centroid bubbles' },
];
const BOX_CHART_OPTION = { value: 'grid', label: 'Box chart', title: 'One equal-size box per county' };

/** Which assistance types the map marks, each keyed to its mark and colour. */
function InfraPicker({ counties, selected, asBars, dispatch }) {
  const counts = useMemo(
    () => Object.fromEntries(ALL_INFRA.map((k) => [k, counties.filter((c) => c.infra[k] > 0).length])),
    [counties],
  );

  return (
    <div className={styles.picker}>
      <div className={styles.pickerHead}>
        <span className={styles.count}>
          {selected.length} of {ALL_INFRA.length} types
        </span>
        <button type="button" className={styles.clear} onClick={() => dispatch({ type: 'setInfra', keys: [] })}>
          Clear
        </button>
      </div>

      {AVAILABLE_INFRA.map((t) => (
        <label key={t.key} className={styles.checkRow}>
          <input
            type="checkbox"
            checked={selected.includes(t.key)}
            onChange={() => dispatch({ type: 'toggleInfra', key: t.key })}
          />
          {/* The mark this type draws on the map: a bar on the box chart, a glyph elsewhere. */}
          <svg className={styles.checkKey} width="12" height="12" aria-hidden="true">
            {asBars ? (
              <rect x={4} y={1} width={4} height={10} rx={1} fill={INFRA_COLOR[t.key]} />
            ) : (
              <InfraGlyph type={t.key} x={6} y={6} size={3.5} legend />
            )}
          </svg>
          <span className={styles.checkLabel} style={{ '--key': INFRA_COLOR[t.key] }}>
            {t.label}
          </span>
          <span className={cx(styles.count, 'tabular')}>{counts[t.key]}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * @param {{
 *   view: import('../../config/layers').ViewDef,
 *   state: object,
 *   dispatch: Function,
 *   counties: object[],
 *   capacityOn: boolean,
 *   onCapacityChange: (on: boolean) => void,
 *   drawStyle: string,
 *   styleLocked: boolean,
 * }} props
 *   `styleLocked`: the story step fixes the render style, so the Style control is hidden.
 */
export function MapControls({ view, state, dispatch, counties, capacityOn, onCapacityChange, drawStyle, styleLocked }) {
  const isIndex = view.showCapacity;
  const isChildren = view.key === 'children';

  return (
    <MapOptions>
      {isChildren && (
        <MapOption label="Who">
          <Switch
            label="Show children only"
            checked={state.layer === 'child_loss'}
            onChange={(on) => dispatch({ type: 'setLayer', layer: on ? 'child_loss' : 'loss' })}
          />
        </MapOption>
      )}

      {view.metrics.length > 1 && !isChildren && (
        <MapOption label="Metric">
          <SegmentedControl
            label="Metric"
            size="sm"
            options={view.metrics.map((key) => {
              const l = layerByKey(key);
              return { value: key, label: l.label, title: l.formalName };
            })}
            value={state.layer}
            onChange={(layer) => dispatch({ type: 'setLayer', layer })}
          />
        </MapOption>
      )}

      {/* An index is not a headcount, so on the index this slot toggles the assistance marks instead. */}
      {isIndex ? (
        <MapOption label="Show">
          <SegmentedControl
            label="Show"
            size="sm"
            options={CAPACITY_OPTIONS}
            value={capacityOn ? 'capacity' : 'index'}
            onChange={(v) => onCapacityChange(v === 'capacity')}
          />
        </MapOption>
      ) : (
        <MapOption label="Measure">
          <SegmentedControl
            label="Measure"
            size="sm"
            options={MEASURE_OPTIONS}
            value={state.measure}
            onChange={(measure) => dispatch({ type: 'setMeasure', measure })}
          />
        </MapOption>
      )}

      {isIndex && capacityOn && (
        <MapOption label="Marks">
          <InfraPicker
            counties={counties}
            selected={state.infra}
            asBars={drawStyle === 'grid'}
            dispatch={dispatch}
          />
        </MapOption>
      )}

      {!styleLocked && (
        <MapOption label="Style">
          <SegmentedControl
            label="Render style"
            size="sm"
            options={isIndex ? [...STYLE_OPTIONS, BOX_CHART_OPTION] : STYLE_OPTIONS}
            value={drawStyle}
            onChange={(style) => dispatch({ type: 'setStyle', style })}
          />
        </MapOption>
      )}

      <MapOption>
        <div className={styles.overlays}>
          <Switch
            label="Highlight top quintile"
            checked={state.overlayQ5}
            onChange={() => dispatch({ type: 'toggleOverlayQ5' })}
            definition="Outlines the fifth of counties highest on what the map shows — by count or by rate."
          />
          {isIndex && (
            <Switch
              label="Gap counties"
              checked={state.overlayGap}
              onChange={() => dispatch({ type: 'toggleOverlayGap' })}
              definition="Top-quintile need with no CMS navigator listed."
            />
          )}
        </div>
      </MapOption>
    </MapOptions>
  );
}
