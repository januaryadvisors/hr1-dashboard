/**
 * <CountyTooltip> — §7, spec'd in §6.5, redesigned 2026-09-01 to the client's
 * tooltip reference.
 *
 * Every domain gets a row: the layer's binned ramp, a caret for this county, and
 * a tick at the state median — so the reader sees the four domains disagree
 * without switching layers, which is the whole framework argument (§8 tab 3).
 * The active layer's row is highlighted.
 *
 * Follows the cursor on hover.
 *
 * Click-to-pin (which froze the panel and added Expand / close controls) was
 * removed on 2026-09-01 to be reworked. The expanded detail block it revealed
 * lives on in git history — restoring it means reinstating `pinned` in the state
 * model and the two controls in this header.
 */
import { useEffect, useMemo, useState } from 'react';
import { INFRA_TYPES, layerByKey, scoreField, VISIBLE_LAYERS } from '../config/layers';
import { fmtInt, fmtMonth, fmtPct, fmtPctDelta, fmtPercentile } from '../lib/format';
import { DomainScale } from './DomainScale';
import { InfraGlyph } from './InfraGlyph';
import { Sparkline } from './Sparkline';
import type { County, LayerKey } from '../types';
import styles from './CountyTooltip.module.css';

const OFFSET = 12;
const WIDTH = 340;

/** Median and descending rank per layer — computed once for the whole dataset. */
export interface LayerStats {
  median: Record<string, number>;
  rank: Record<string, Map<string, number>>;
  total: number;
}

export function buildLayerStats(counties: County[]): LayerStats {
  const median: Record<string, number> = {};
  const rank: Record<string, Map<string, number>> = {};

  for (const layer of VISIBLE_LAYERS) {
    const field = scoreField(layer.key);
    const rows = counties
      .map((c) => ({ geoid: c.geoid, v: c[field] }))
      .filter((r): r is { geoid: string; v: number } => typeof r.v === 'number');

    const sorted = [...rows].sort((a, b) => a.v - b.v);
    median[layer.key] = sorted.length ? sorted[Math.floor(sorted.length / 2)].v : 0;

    // Rank 1 = highest score = most exposed.
    const byDesc = [...rows].sort((a, b) => b.v - a.v);
    rank[layer.key] = new Map(byDesc.map((r, i) => [r.geoid, i + 1]));
  }

  return { median, rank, total: counties.length };
}

export interface CountyTooltipProps {
  county: County | null;
  layer: LayerKey;
  stats: LayerStats;
  months: string[];
  window: [string, string];
  /**
   * 'pointer' anchors the panel to the cursor. 'external' (search, rank list)
   * anchors it beside the county's own shape on the hero map.
   */
  origin: 'pointer' | 'external';
}

export function CountyTooltip({
  county,
  layer,
  stats,
  months,
  window: win,
  origin,
}: CountyTooltipProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [countyAnchor, setCountyAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /**
   * For an external selection, find the county's shape on the hero map and
   * anchor to its right edge. Read from the DOM rather than re-deriving screen
   * coordinates from the projection, because the map is scaled to fit its column
   * and the rendered geometry is the only thing that knows the true scale.
   */
  const geoid = county?.geoid;
  useEffect(() => {
    if (origin !== 'external' || !geoid) {
      setCountyAnchor(null);
      return;
    }
    const el = document.querySelector(`[data-hero-map] [data-geoid="${geoid}"]`);
    if (!el) {
      setCountyAnchor(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setCountyAnchor({ x: r.right, y: r.top + r.height / 2 });
  }, [origin, geoid]);

  const i0 = months.indexOf(win[0]);
  const i1 = months.indexOf(win[1]);

  const enrollment = useMemo(
    () => (county && i0 >= 0 && i1 >= 0 ? county.snap_enrolled.slice(i0, i1 + 1) : []),
    [county, i0, i1],
  );

  if (!county) return null;

  const anchor = countyAnchor ?? pos;

  // Flip at the viewport edge rather than letting the panel clip.
  const flipX = anchor.x + OFFSET + WIDTH > window.innerWidth;
  const left = Math.max(8, flipX ? anchor.x - OFFSET - WIDTH : anchor.x + OFFSET);
  const estHeight = 430;
  const top = Math.max(
    8,
    anchor.y + OFFSET + estHeight > window.innerHeight
      ? Math.min(anchor.y - OFFSET - estHeight, window.innerHeight - estHeight - 8)
      : anchor.y + OFFSET,
  );

  const start = enrollment[0] ?? 0;
  const end = enrollment[enrollment.length - 1] ?? 0;
  const pctChange = start > 0 ? (end - start) / start : null;
  // Share of the county's own caseload that is newly subject to the work
  // requirement. Independent of the active layer.
  const shareOfCaseload = start > 0 ? county.newly_subject_persons / start : null;

  return (
    <div
      className={styles.root}
      style={{ left, top }}
      role="tooltip"
      aria-label={`${county.name} County details`}
    >
      <div className={styles.head}>
        <span>
          <span className={styles.countyName}>{county.name} County</span>
          <span className={styles.fips}>
            FIPS {county.geoid} · {fmtInt(county.pop)} residents
          </span>
        </span>
      </div>

      {/* Focused layer in full: every band coloured, caret, median tick. */}
      {(() => {
        const l = layerByKey(layer);
        const value = county[scoreField(l.key)];
        const num = typeof value === 'number' ? value : null;
        const rank = stats.rank[l.key]?.get(county.geoid);
        const isComposite = l.key === 'composite';
        return (
          <div className={`${styles.domain} ${styles.active}`}>
            <div className={styles.domainHead}>
              <span className={styles.domainLabel}>
                {l.key.toUpperCase()} · {l.label}
              </span>
              {num == null ? (
                <span className={styles.domainUnavailable}>no data</span>
              ) : (
                <span className={`${styles.domainValue} tabular`}>
                  {isComposite ? num.toFixed(2) : fmtPercentile(num)}
                  {rank ? ` · ${ordinal(rank)} of ${stats.total}` : ''}
                </span>
              )}
            </div>
            <DomainScale
              layer={l.key}
              value={num}
              median={stats.median[l.key] ?? 0}
              domain={isComposite ? [0, 4] : [0, 1]}
            />
          </div>
        );
      })()}

      {/* The rest, two-up: only the band each county falls in is coloured. */}
      <div className={styles.otherGrid}>
        {VISIBLE_LAYERS.filter((l) => l.key !== layer).map((l) => {
          const value = county[scoreField(l.key)];
          const num = typeof value === 'number' ? value : null;
          const rank = stats.rank[l.key]?.get(county.geoid);
          const isComposite = l.key === 'composite';
          return (
            <div key={l.key} className={styles.other}>
              <div className={styles.otherLabel}>{l.label}</div>
              <div className={`${styles.otherValue} tabular`}>
                {num == null
                  ? '—'
                  : `${isComposite ? num.toFixed(2) : fmtPercentile(num)}${
                      rank ? ` · ${ordinal(rank)}` : ''
                    }`}
              </div>
              <DomainScale
                layer={l.key}
                value={num}
                median={stats.median[l.key] ?? 0}
                domain={isComposite ? [0, 4] : [0, 1]}
                variant="compact"
              />
            </div>
          );
        })}
      </div>

      <div className={styles.stats}>
        <div>
          {/* Always the D1 count basis. It is a fact about the county, not about
              the layer being viewed — reading it off `layer` meant every column
              here showed an em dash on D3, D4 and the composite. */}
          <div className={styles.statLabel}>Newly subject</div>
          <div className={`${styles.statValue} tabular`}>{fmtInt(county.newly_subject_persons)}</div>
        </div>
        <div>
          <div className={styles.statLabel}>Of caseload</div>
          <div className={`${styles.statValue} tabular`}>
            {shareOfCaseload == null ? '—' : fmtPct(shareOfCaseload, 0)}
          </div>
        </div>
        <div>
          <div className={styles.statLabel}>Since {fmtMonth(win[0])}</div>
          <div className={`${styles.statValue} ${styles.negative} tabular`}>
            {pctChange == null ? '—' : fmtPctDelta(pctChange)}
          </div>
        </div>
      </div>

      <div className={styles.resourcesHead}>Listed assistance sites</div>
      <div className={styles.resources}>
        {INFRA_TYPES.map((t) => {
          const count = county.infra[t.key];
          const present = count > 0;
          return (
            <div
              key={t.key}
              className={`${styles.resource} ${present ? '' : styles.resourceAbsent}`}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <g className={present ? undefined : styles.glyphAbsent}>
                  <InfraGlyph type={t.key} x={6.5} y={6.5} size={3.6} legend />
                </g>
              </svg>
              <span className={styles.resourceLabel}>{t.label}</span>
              <span className={`${styles.resourceCount} tabular`}>{present ? count : '—'}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.sparkHead}>
        SNAP enrolled, {fmtMonth(win[0])} → {fmtMonth(win[1])}
      </div>
      <Sparkline values={enrollment} />
      <div className={styles.foot}>
        <span>{fmtInt(start)}</span>
        <span>{fmtInt(end)}</span>
      </div>


    </div>
  );
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
