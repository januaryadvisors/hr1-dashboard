/**
 * Listed-assistance bars — one vertical bar per registry, per county.
 *
 * Client direction 2026-10-16: capacity reads as a small bar chart rather than
 * a row of glyphs. The SAME encoding draws in two places, and this module is
 * what keeps them the same:
 *
 *   <InfraTileBars>     inside each tile on the grid map, unlabelled
 *   <InfraColumnChart>  in the county tooltip, labelled, all four registries
 *
 * Both share the bar order, the hue per registry (INFRA_COLOR, so the bars and
 * the geo map's glyphs agree) and one count scale. The scale is shared ACROSS
 * registries on purpose: a county with one CHW network and three navigators
 * should show one bar a third the height of the other, not two full bars.
 *
 * Unsourced registries (food bank, counselor) carry null, not 0. The tile draws
 * nothing for them; the tooltip labels the column n/a over a dashed
 * baseline, so the absence reads as "not measured" rather than "none listed" (§L7).
 *
 * @typedef {import('../../types').County} County
 * @typedef {import('../../types').InfraKey} InfraKey
 */
import { INFRA_TYPES } from '../../config/layers';
import { INFRA_COLOR } from './InfraGlyph';
import styles from './InfraBars.module.css';

/** Sourced registries first, so the bars a reader can trust sit on the left. */
export const INFRA_BAR_ORDER = ['cms_navigator', 'chw', 'food_bank', 'counselor'];

/**
 * The top of the shared count scale: the highest count any sourced registry
 * reaches in any county. Never below 1, so an all-zero dataset still divides.
 */
export function infraMax(counties) {
  let max = 1;
  for (const c of counties) {
    for (const t of INFRA_TYPES) {
      const v = c.infra?.[t.key];
      if (t.available && typeof v === 'number' && v > max) max = v;
    }
  }
  return max;
}

/**
 * Bars inside one grid tile, bottom-aligned and centred. Every type in `types`
 * keeps its slot even at zero, so green is always first and magenta second on
 * every tile, and the eye can scan a row of tiles for one colour.
 *
 * @param {{ county: County; types: InfraKey[]; x: number; y: number; size: number; max: number }} props
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
    const h = (Math.min(v, max) / max) * maxH;
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
 * each bar.
 *
 * @param {{ county: County; max: number }} props
 */
export function InfraColumnChart({ county, max }) {
  return (
    <div className={styles.chart} role="img" aria-label={ariaFor(county)}>
      {INFRA_BAR_ORDER.map((key) => {
        const t = INFRA_TYPES.find((d) => d.key === key);
        const v = county.infra[key];
        const sourced = t.available && typeof v === 'number';
        const frac = sourced ? Math.min(v, max) / max : 0;
        return (
          <div key={key} className={`${styles.col} ${sourced ? '' : styles.unsourced}`}>
            <span className={`${styles.value} tabular`}>{sourced ? v : 'n/a'}</span>
            <span className={styles.track}>
              {sourced && (
                <span
                  className={styles.bar}
                  style={{ height: `${frac * 100}%`, background: INFRA_COLOR[key] }}
                />
              )}
            </span>
            <span className={styles.label} title={t.source}>
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
    return `${t.label}: ${t.available && typeof v === 'number' ? v : 'not sourced'}`;
  }).join('; ');
}
