/**
 * The key to the assistance marks under the hero map: glyphs on the Geo and
 * Density maps, bars on the box chart (where each tile carries bars).
 */
import { INFRA_TYPES } from '../../config/layers';
import { INFRA_BAR_ORDER } from './InfraBars';
import { INFRA_COLOR, InfraGlyph } from './InfraGlyph';
import styles from './MarksKey.module.css';

const AVAILABLE = INFRA_TYPES.filter((t) => t.available);
const UNSOURCED = INFRA_TYPES.filter((t) => !t.available);
const BAR_TYPES = INFRA_BAR_ORDER.map((key) => AVAILABLE.find((t) => t.key === key)).filter(Boolean);

function Item({ children, label }) {
  return (
    <span className={styles.item}>
      {children}
      {label}
    </span>
  );
}

function Glyph({ type, noData = false }) {
  return (
    <svg width="12" height="12" aria-hidden="true">
      <InfraGlyph type={type} x={6} y={6} size={3.5} legend noData={noData} />
    </svg>
  );
}

function GlyphKey({ showFoodBankGap }) {
  return (
    <>
      <span className="eyebrow">Marks</span>
      {AVAILABLE.map((t) => (
        <Item key={t.key} label={t.label}>
          <Glyph type={t.key} />
        </Item>
      ))}
      {showFoodBankGap && (
        <Item label="No reporting food bank">
          <Glyph type="food_bank" noData />
        </Item>
      )}
    </>
  );
}

function BarKey({ showGap }) {
  return (
    <>
      <span className="eyebrow">Bars</span>
      {BAR_TYPES.map((t) => (
        <Item key={t.key} label={t.plural}>
          <svg width="6" height="12" aria-hidden="true">
            <rect x={1} y={2} width={4} height={10} fill={INFRA_COLOR[t.key]} />
          </svg>
        </Item>
      ))}
      {/* Named, so a missing bar never reads as zero. */}
      {UNSOURCED.length > 0 && (
        <Item label={`${UNSOURCED.map((t) => t.shortLabel).join(', ')}: not yet sourced`} />
      )}
      {showGap && (
        <Item label="Gap county">
          <svg width="12" height="12" aria-hidden="true">
            <rect
              x={1.5}
              y={1.5}
              width={9}
              height={9}
              fill="none"
              stroke="var(--ja-burgundy)"
              strokeWidth={1.5}
              strokeDasharray="2 1.5"
            />
          </svg>
        </Item>
      )}
    </>
  );
}

/**
 * @param {{ asBars: boolean, infra: string[], gapOn: boolean }} props
 *   `infra`: the assistance types shown; `gapOn`: the gap-county overlay is on.
 */
export function MarksKey({ asBars, infra, gapOn }) {
  return asBars ? <BarKey showGap={gapOn} /> : <GlyphKey showFoodBankGap={infra.includes('food_bank')} />;
}
