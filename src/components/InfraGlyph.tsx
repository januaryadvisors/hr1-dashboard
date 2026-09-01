/**
 * Assistance-infrastructure glyphs (§6.6). Four shapes, "deliberately
 * distinguishable without colour" — so they are shape-first and monochrome ink,
 * never a colour-coded dot.
 */
import type { InfraKey } from '../types';

export const INFRA_GLYPH_ORDER: InfraKey[] = ['food_bank', 'cms_navigator', 'chw', 'counselor'];

export interface InfraGlyphProps {
  type: InfraKey;
  x: number;
  y: number;
  size: number;
  /** Standalone use in the legend needs a slightly heavier stroke. */
  legend?: boolean;
}

export function InfraGlyph({ type, x, y, size, legend = false }: InfraGlyphProps) {
  const ink = 'var(--ja-ink)';
  const sw = legend ? 1.2 : 0.6;

  switch (type) {
    case 'food_bank': // filled square
      return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={ink} />;
    case 'cms_navigator': // open circle
      return <circle cx={x} cy={y} r={size} fill="none" stroke={ink} strokeWidth={sw} />;
    case 'chw': // open diamond
      return (
        <path
          d={`M${x} ${y - size}L${x + size} ${y}L${x} ${y + size}L${x - size} ${y}Z`}
          fill="none"
          stroke={ink}
          strokeWidth={sw}
        />
      );
    case 'counselor': // plus
      return (
        <path
          d={`M${x} ${y - size}V${y + size}M${x - size} ${y}H${x + size}`}
          stroke={ink}
          strokeWidth={sw * 1.4}
          fill="none"
        />
      );
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
