/**
 * Assistance-infrastructure glyphs (§6.6).
 *
 * §6.6 required four glyphs "deliberately distinguishable without colour". They
 * still are — square, triangle, circle, diamond — and since 2026-09-01 each also
 * carries its own hue, so a reader can tell them apart at a glance instead of
 * squinting at outlines.
 *
 * All four are FILLED and the same visual size. Each gets a thin white halo,
 * because these sit on top of a choropleth and have to stay legible over both
 * the palest and the darkest band of any ramp.
 *
 * @typedef {import('../../types').InfraKey} InfraKey
 */

export const INFRA_GLYPH_ORDER = ['food_bank', 'cms_navigator', 'chw', 'cpp'];

/** Hues chosen for separation from each other, not from the ramps — hence the halo. */
export const INFRA_COLOR = {
  food_bank: '#F57C1F', // orange
  cms_navigator: '#2E9E4F', // green
  chw: '#C8377E', // magenta
  cpp: '#6B4FBB', // violet
};

/**
 * "No data" grey — a partially reported registry's county that no reporting source covers
 * (food bank, 2026-10-16). Drawn rather than left blank, so a missing mark is
 * never read as a confirmed "none".
 */
export const NO_DATA_COLOR = '#B9B5B2';

/**
 * @typedef {Object} InfraGlyphProps
 * @property {InfraKey} type
 * @property {number} x
 * @property {number} y
 * @property {number} size - Nominal radius. Shapes are area-matched to it so none reads as bigger.
 * @property {boolean} [legend] - Standalone use in a legend needs a slightly heavier halo.
 * @property {boolean} [noData] - Grey: the county is not covered by any reporting source.
 */

export function InfraGlyph({ type, x, y, size, legend = false, noData = false }) {
  const fill = noData ? NO_DATA_COLOR : INFRA_COLOR[type];
  const halo = legend ? size * 0.5 : size * 0.42;
  const common = { fill, stroke: '#ffffff', strokeWidth: halo, paintOrder: 'stroke' };

  switch (type) {
    case 'food_bank': {
      // Side matched to the circle's area so it does not read as heavier.
      const h = size * 0.886;
      return <rect x={x - h} y={y - h} width={h * 2} height={h * 2} {...common} />;
    }
    case 'cms_navigator': {
      // Equilateral triangle, area-matched, nudged down so it looks centred.
      const r = size * 1.35;
      const pts = [0, 1, 2]
        .map((i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
          return `${(x + r * Math.cos(a)).toFixed(2)} ${(y + r * Math.sin(a) + size * 0.16).toFixed(2)}`;
        })
        .join('L');
      return <path d={`M${pts}Z`} {...common} />;
    }
    case 'chw':
      return <circle cx={x} cy={y} r={size} {...common} />;
    case 'cpp': {
      const r = size * 1.25;
      return (
        <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} {...common} />
      );
    }
  }
}
