/**
 * The county tooltip's index readouts: one layer's scale, all five on the
 * index view, and the two-axis readout on the bivariate map.
 */
import { DOMAINS, layerByKey, SCORE_LAYERS, scoreField } from '../../config/layers';
import { cx } from '../../lib/cx';
import { fmtPercentile } from '../../lib/format';
import { formatLayerValue } from '../../lib/layerValues';
import { binIndex, bivariatePalette, BIVARIATE_STEPS } from '../../lib/scales';
import { DomainScale } from '../charts/DomainScale';
import styles from './CountyTooltip.module.css';

/** The composite first (it colours the map), then the domains in the index's own order. */
const DOMAIN_RANK = new Map(DOMAINS.map((d, i) => [d.key, i]));
const INDEX_ROWS = [
  ...SCORE_LAYERS.filter((l) => l.key === 'composite'),
  ...SCORE_LAYERS.filter((l) => l.key !== 'composite').sort(
    (a, b) => (DOMAIN_RANK.get(a.key) ?? Infinity) - (DOMAIN_RANK.get(b.key) ?? Infinity),
  ),
];

/** The county's score on a scored layer, or null. */
function scoreOf(county, key) {
  const value = county[scoreField(key)];
  return typeof value === 'number' ? value : null;
}

/** The county's caret against the statewide median tick. */
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

/** The mapped layer's own scale, on score layers outside the index view. */
export function FocusedIndex({ county, layer, stats }) {
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

/** All five indexes, one row each, every scale the same width so they read against each other. */
export function IndexTable({ county, layer, stats }) {
  return (
    <div className={styles.indexTable}>
      {INDEX_ROWS.map((l) => {
        const value = scoreOf(county, l.key);
        // Only the composite quotes its number; the scales place the domains.
        const valueLine = value == null ? 'no data' : l.key === 'composite' ? value.toFixed(2) : null;
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

/** Where the county sits on each axis of the 3x3 bivariate key, in the key's colours. */
export function BivariateReadout({ county, layer, values }) {
  const grid = bivariatePalette(BIVARIATE_STEPS);
  const axes = layerByKey(layer).axes;
  const a = values.fill.get(county.geoid) ?? null;
  const b = values.secondary.fill.get(county.geoid) ?? null;
  const rows = [
    { axis: axes[0], text: formatLayerValue(layer, a), bin: binIndex(a, values.bins), swatches: grid[0] },
    {
      axis: axes[1],
      text: fmtPercentile(b),
      bin: binIndex(b, values.secondary.bins),
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
