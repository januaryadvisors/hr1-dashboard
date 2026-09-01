/**
 * <CountyTooltip> — §7, spec'd in §6.5:
 * "name, population, all layer percentiles with their tiers, cumulative impact,
 * the count metric if the layer has one, MOE, and infrastructure presence.
 * Follows the cursor with a 12px offset, flips at the viewport edge."
 */
import { useEffect, useState } from 'react';
import { INFRA_TYPES, layerByKey, scoreField, VISIBLE_LAYERS } from '../config/layers';
import { fmtInt, fmtPercentile } from '../lib/format';
import { quintile } from '../lib/scales';
import type { County, LayerKey, Measure } from '../types';
import styles from './CountyTooltip.module.css';

const OFFSET = 12;
const WIDTH = 250;

export interface CountyTooltipProps {
  county: County | null;
  layer: LayerKey;
  measure: Measure;
}

export function CountyTooltip({ county, layer, measure }: CountyTooltipProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  if (!county) return null;

  const def = layerByKey(layer);
  const countValue = def.countField ? county[def.countField] : null;

  // Flip at the viewport edge rather than letting the panel clip.
  const flipX = pos.x + OFFSET + WIDTH > window.innerWidth;
  const left = flipX ? pos.x - OFFSET - WIDTH : pos.x + OFFSET;
  // Estimated height; enough to keep the panel on screen without measuring.
  const flipY = pos.y + OFFSET + 300 > window.innerHeight;
  const top = flipY ? Math.max(8, pos.y - OFFSET - 300) : pos.y + OFFSET;

  const activeMoe = layer === 'composite' ? null : county[`${layer}_moe` as keyof County];

  return (
    <div className={styles.root} style={{ left, top }} role="tooltip">
      <div className={styles.name}>{county.name} County</div>
      <div className={`${styles.pop} tabular`}>{fmtInt(county.pop)} residents</div>

      <div className={styles.rows}>
        {VISIBLE_LAYERS.filter((l) => l.key !== 'composite').map((l) => {
          const v = county[scoreField(l.key)];
          const num = typeof v === 'number' ? v : null;
          const isActive = l.key === layer;
          return (
            <div key={l.key} style={{ display: 'contents' }}>
              <span className={`${styles.rowLabel} ${isActive ? styles.active : ''}`}>
                {l.label}
              </span>
              <span className={`tabular ${isActive ? styles.active : ''}`}>
                {fmtPercentile(num)}
              </span>
              <span className={styles.tier}>{num == null ? '' : `Q${quintile(num)}`}</span>
            </div>
          );
        })}
        <div style={{ display: 'contents' }}>
          <span className={`${styles.rowLabel} ${layer === 'composite' ? styles.active : ''}`}>
            Vulnerability index
          </span>
          <span className={`tabular ${layer === 'composite' ? styles.active : ''}`}>
            {county.vulnerability_score.toFixed(2)}
          </span>
          <span className={styles.tier}>of 4</span>
        </div>
      </div>

      <div className={styles.section}>
        Cumulative impact: <strong>{county.cumulative_impact}</strong> of 4 domains at Q5
        {typeof activeMoe === 'number' && (
          <div className={styles.moe}>MOE on {def.label.toLowerCase()}: ±{activeMoe.toFixed(3)}</div>
        )}
      </div>

      {measure === 'count' && def.countField && (
        <div className={styles.section}>
          {def.label}: <strong className="tabular">{fmtInt(countValue as number)}</strong> people
          {def.countField === 'newly_subject_persons' && (
            // §10: flag synthetic estimates wherever they appear.
            <div className={styles.flag}>PUMS-modelled estimate, not a lookup.</div>
          )}
        </div>
      )}

      <div className={styles.section}>
        Listed assistance sites
        <div className={styles.marks}>
          {INFRA_TYPES.map((t) => (
            <span key={t.key} className="tabular">
              {t.label.split(' ')[0]}: {county.infra[t.key] || '—'}
            </span>
          ))}
        </div>
      </div>

      {county.is_gap && <div className={styles.flag}>Gap county — no food bank, no navigator.</div>}
      {county.small_denominator && (
        <div className={styles.moe}>Population under 10,000 — rates are unstable.</div>
      )}
    </div>
  );
}
