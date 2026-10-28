/**
 * Listed-assistance bars — one vertical bar per registry, per county.
 *
 * Capacity reads as a small bar chart. The SAME
 * encoding draws in two places, and this module keeps them the same:
 *
 *   <InfraTileBars>     inside each tile on the grid map, unlabelled
 *   <InfraColumnChart>  in the county tooltip, labelled, all four registries
 *
 * The bars share the hue per registry (INFRA_COLOR, so the bars and the geo
 * map's glyphs agree). Each registry has ITS OWN scale, topped at its highest
 * county: the four are different units — navigator orgs, CPP
 * sites in the dozens, a CHW range, reporting food banks — and on one shared
 * scale every bar but CPP's would be a sliver. So a bar's height says how
 * this county compares with other counties on that registry; the number over
 * it says how many.
 *
 * CHW is a range, not a count (INFRA_TYPES.banded): its bar is the band's
 * position and its label is the range ("11–100"), never a single number.
 *
 * The food-bank bar counts reporting food banks that served at least one
 * household in the county. Only some banks report (INFRA_TYPES.partial), so a
 * county none of them covers is null: the tooltip labels that column "no
 * data" in grey. The households those banks served are a different unit and
 * sit in the tooltip's figures, not on this scale.
 *
 * An unsourced registry carries null, not 0 (§L7). The tile draws nothing for
 * it; the tooltip labels the column n/a over a dashed baseline, so the absence
 * reads as "not measured" rather than "none listed".
 *
 * @typedef {import('../../types').County} County
 * @typedef {import('../../types').InfraKey} InfraKey
 */
import { COUNT_INFRA, INFRA_TYPES } from '../../config/layers';
import { cx } from '../../lib/cx';
import { INFRA_COLOR } from './InfraGlyph';
import styles from './InfraBars.module.css';

/** Complete counts first, then the range, then the partially reported registry. */
export const INFRA_BAR_ORDER = ['cms_navigator', 'cpp', 'chw', 'food_bank'];

/**
 * The top of each registry's own scale: the highest value it reaches in any
 * county, or the registry's fixed `scaleMax` if that is higher. Never below 1,
 * so an all-zero registry still divides.
 *
 * @returns {Record<string, number>}
 */
export function infraMax(counties) {
  const max = Object.fromEntries(
    COUNT_INFRA.map((k) => [k, Math.max(1, INFRA_TYPES.find((t) => t.key === k).scaleMax ?? 1)]),
  );
  for (const c of counties) {
    for (const key of COUNT_INFRA) {
      const v = c.infra?.[key];
      if (typeof v === 'number' && v > max[key]) max[key] = v;
    }
  }
  return max;
}

/** What a column says over its bar: the range for CHW, the count otherwise. */
export function infraValueLabel(county, key) {
  const v = county.infra[key];
  if (key === 'chw') return v === 0 ? 'none' : county.chw_band;
  return String(v);
}

/**
 * Bars inside one grid tile, bottom-aligned and centred. Every type in `types`
 * keeps its slot even at zero, so green is always first and magenta second on
 * every tile, and the eye can scan a row of tiles for one colour.
 *
 * @param {{ county: County; types: InfraKey[]; x: number; y: number; size: number; max: Record<string, number> }} props
 *   x, y, size: the tile's own box in map units.
 */
export function InfraTileBars({ county, types, x, y, size, max }) {
  const slots = INFRA_BAR_ORDER.filter((k) => types.includes(k));
  if (!slots.length) return null;

  const barW = size * 0.13;
  const gap = size * 0.07;
  const maxH = size * 0.6;
  const base = y + size * 0.84;
  const groupW = slots.length * barW + (slots.length - 1) * gap;
  const x0 = x + (size - groupW) / 2;

  return slots.map((key, i) => {
    const v = county.infra[key];
    if (typeof v !== 'number' || v <= 0) return null;
    const h = (Math.min(v, max[key]) / max[key]) * maxH;
    return (
      <rect
        key={key}
        x={x0 + i * (barW + gap)}
        y={base - h}
        width={barW}
        height={h}
        fill={INFRA_COLOR[key]}
        // Same white halo as the glyphs, so a bar holds up on the darkest band.
        stroke="#ffffff"
        strokeWidth={size * 0.035}
        paintOrder="stroke"
      />
    );
  });
}

/**
 * The tooltip's version: all four registries, labelled, with the count over
 * each bar. A partial registry's null reads "no data"; an unsourced one, n/a.
 *
 * @param {{ county: County; max: Record<string, number> }} props
 */
export function InfraColumnChart({ county, max }) {
  return (
    <div className={styles.chart} role="img" aria-label={ariaFor(county)}>
      {INFRA_BAR_ORDER.map((key) => {
        const t = INFRA_TYPES.find((d) => d.key === key);
        const v = county.infra[key];
        const sourced = t.available && typeof v === 'number';
        const frac = sourced ? Math.min(v, max[key]) / max[key] : 0;
        const missing = t.available ? 'no data' : 'n/a';
        const exact = key === 'chw' && county.chw_exact != null ? `Exact: ${county.chw_exact}` : null;
        return (
          <div key={key} className={cx(styles.col, !sourced && styles.unsourced)}>
            <span className={cx(styles.value, 'tabular')} title={exact ?? undefined}>
              {sourced ? infraValueLabel(county, key) : missing}
            </span>
            <span className={styles.track}>
              {sourced && (
                <span
                  className={styles.bar}
                  style={{ height: `${frac * 100}%`, background: INFRA_COLOR[key] }}
                />
              )}
            </span>
            <span
              className={styles.label}
              title={t.longLabel ? `${t.longLabel} · ${t.source}` : t.source}
            >
              <span className={styles.swatch} style={{ background: INFRA_COLOR[key] }} />
              {t.shortLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ariaFor(county) {
  return INFRA_BAR_ORDER.map((key) => {
    const t = INFRA_TYPES.find((d) => d.key === key);
    const v = county.infra[key];
    const missing = t.available ? 'no data' : 'not sourced';
    return `${t.label}: ${t.available && typeof v === 'number' ? infraValueLabel(county, key) : missing}`;
  }).join('; ');
}
