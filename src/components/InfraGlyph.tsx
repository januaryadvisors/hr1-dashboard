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
 */
import type { InfraKey } from '../types';

export const INFRA_GLYPH_ORDER: InfraKey[] = ['food_bank', 'cms_navigator', 'chw', 'counselor'];

/** Hues chosen for separation from each other, not from the ramps — hence the halo. */
export const INFRA_COLOR: Record<InfraKey, string> = {
  food_bank: '#F57C1F', // orange
  cms_navigator: '#2E9E4F', // green
  chw: '#C8377E', // magenta
  counselor: '#6B4FBB', // violet
};

export const INFRA_SHAPE: Record<InfraKey, string> = {
  food_bank: 'square',
  cms_navigator: 'triangle',
  chw: 'circle',
  counselor: 'diamond',
};

export interface InfraGlyphProps {
  type: InfraKey;
  x: number;
  y: number;
  /** Nominal radius. Shapes are area-matched to it so none reads as bigger. */
  size: number;
  /** Standalone use in a legend needs a slightly heavier halo. */
  legend?: boolean;
}

export function InfraGlyph({ type, x, y, size, legend = false }: InfraGlyphProps) {
  const fill = INFRA_COLOR[type];
  const halo = legend ? size * 0.5 : size * 0.42;
  const common = { fill, stroke: '#ffffff', strokeWidth: halo, paintOrder: 'stroke' as const };

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
    case 'counselor': {
      const r = size * 1.25;
      return (
        <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} {...common} />
      );
    }
  }
}

/** Gap counties are an overlay, not a mark type (§6.6) — red square outline. */
export function GapGlyph({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <rect
      x={x - size}
      y={y - size}
      width={size * 2}
      height={size * 2}
      fill="none"
      stroke="var(--ja-burgundy)"
      strokeWidth={1.2}
    />
  );
}
