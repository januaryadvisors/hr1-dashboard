/**
 * <CountyTooltip> — §7, spec'd in §6.5, redesigned 2026-09-01 to the client's
 * tooltip reference.
 *
 * Every domain gets a row: the layer's binned ramp, a caret for this county, and
 * a tick at the state median — so the reader sees the four domains disagree
 * without switching layers, which is the whole framework argument (§8 tab 3).
 * The active layer's row is highlighted.
 *
 * Hovering follows the cursor. Clicking a county pins it: the panel freezes,
 * becomes interactive, and gains Expand and close controls. Expanded shows the
 * underlying numbers rather than just the index positions.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { INFRA_TYPES, layerByKey, scoreField, VISIBLE_LAYERS } from '../config/layers';
import { fmtInt, fmtMonth, fmtPct, fmtPctDelta, fmtPercentile } from '../lib/format';
import { DomainScale } from './DomainScale';
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
  /** True when showing the pinned county rather than a hovered one. */
  isPinned: boolean;
  /** The pinned geoid, used to freeze the panel at the moment of the click. */
  pinnedGeoid: string | null;
  onClose: () => void;
  stats: LayerStats;
  months: string[];
  window: [string, string];
}

export function CountyTooltip({
  county,
  layer,
  isPinned,
  pinnedGeoid,
  onClose,
  stats,
  months,
  window: win,
}: CountyTooltipProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);
  // Mirrored in a ref so the pin effect reads the live cursor position rather
  // than whatever it was on the render that happened to schedule the effect.
  const posRef = useRef({ x: 0, y: 0 });
  // Where the panel sat when it was pinned, so it stops chasing the cursor.
  const frozen = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      setPos(posRef.current);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Freeze on the CLICK, not on the cursor later leaving the map — otherwise the
  // panel jumps to wherever the pointer happened to exit.
  useEffect(() => {
    if (pinnedGeoid) {
      frozen.current = posRef.current;
    } else {
      frozen.current = null;
      setExpanded(false);
    }
  }, [pinnedGeoid]);

  // Escape closes a pinned panel.
  useEffect(() => {
    if (!isPinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPinned, onClose]);

  const i0 = months.indexOf(win[0]);
  const i1 = months.indexOf(win[1]);

  const enrollment = useMemo(
    () => (county && i0 >= 0 && i1 >= 0 ? county.snap_enrolled.slice(i0, i1 + 1) : []),
    [county, i0, i1],
  );

  if (!county) return null;

  const def = layerByKey(layer);
  const anchor = isPinned && frozen.current ? frozen.current : pos;

  // Flip at the viewport edge rather than letting the panel clip.
  const flipX = anchor.x + OFFSET + WIDTH > window.innerWidth;
  const left = Math.max(8, flipX ? anchor.x - OFFSET - WIDTH : anchor.x + OFFSET);
  const estHeight = expanded ? 640 : 470;
  const top = Math.max(
    8,
    anchor.y + OFFSET + estHeight > window.innerHeight
      ? Math.min(anchor.y - OFFSET - estHeight, window.innerHeight - estHeight - 8)
      : anchor.y + OFFSET,
  );

  const start = enrollment[0] ?? 0;
  const end = enrollment[enrollment.length - 1] ?? 0;
  const pctChange = start > 0 ? (end - start) / start : null;
  const countField = def.countField;
  const countValue = countField ? (county[countField] as number) : null;
  const shareOfCaseload = countValue != null && start > 0 ? countValue / start : null;

  return (
    <div
      className={`${styles.root} ${isPinned ? styles.pinned : ''}`}
      style={{ left, top }}
      role={isPinned ? 'dialog' : 'tooltip'}
      aria-label={`${county.name} County details`}
    >
      <div className={styles.head}>
        <span>
          <span className={styles.countyName}>{county.name} County</span>
          <span className={styles.fips}>
            FIPS {county.geoid} · {fmtInt(county.pop)} residents
          </span>
        </span>
        {isPinned && (
          <span className={styles.headActions}>
            <button
              type="button"
              className={styles.headBtn}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
            <button
              type="button"
              className={`${styles.headBtn} ${styles.closeBtn}`}
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </span>
        )}
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
          <div className={styles.statLabel}>
            {countField === 'noncit_snap_persons' ? 'Non-citizen' : 'Newly subject'}
          </div>
          <div className={`${styles.statValue} tabular`}>
            {countValue == null ? '—' : fmtInt(countValue)}
          </div>
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

      <div className={styles.sparkHead}>
        SNAP enrolled, {fmtMonth(win[0])} → {fmtMonth(win[1])}
      </div>
      <Sparkline values={enrollment} />
      <div className={styles.foot}>
        <span>{fmtInt(start)}</span>
        <span>{fmtInt(end)}</span>
      </div>

      {expanded && (
        <div className={styles.expanded}>
          <div className={styles.detailGrid}>
            <span className={styles.detailHead}>Domain</span>
            <span className={styles.detailHead}>Components</span>
            <span className={styles.detailHead}>MOE</span>
            {VISIBLE_LAYERS.filter((l) => l.key !== 'composite').map((l) => {
              const moe = county[`${l.key}_moe` as keyof County];
              return (
                <div key={l.key} style={{ display: 'contents' }}>
                  <span className={styles.detailLabel}>{l.label}</span>
                  <span className="tabular">{l.components ?? '—'}</span>
                  <span className="tabular">
                    {typeof moe === 'number' ? `±${moe.toFixed(3)}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className={styles.detailGrid} style={{ marginTop: 'var(--space-3)' }}>
            <span className={styles.detailHead}>Listed sites</span>
            <span className={styles.detailHead} />
            <span className={styles.detailHead}>Count</span>
            {INFRA_TYPES.map((t) => (
              <div key={t.key} style={{ display: 'contents' }}>
                <span className={styles.detailLabel}>{t.label}</span>
                <span />
                <span className="tabular">{county.infra[t.key] || '—'}</span>
              </div>
            ))}
          </div>

          <div className={styles.detailGrid} style={{ marginTop: 'var(--space-3)' }}>
            <span className={styles.detailLabel}>Domains at Q5</span>
            <span />
            <span className="tabular">{county.cumulative_impact} of 4</span>
            <span className={styles.detailLabel}>Vulnerability index</span>
            <span />
            <span className="tabular">{county.vulnerability_score.toFixed(2)} of 4</span>
          </div>

          {countField === 'newly_subject_persons' && (
            // §10: flag synthetic estimates wherever they appear.
            <div className={styles.flags}>
              Newly-subject population is a PUMS-modelled estimate, not a lookup.
            </div>
          )}
          {county.is_gap && (
            <div className={styles.flags}>Gap county — no food bank, no navigator listed.</div>
          )}
          {county.small_denominator && (
            <div className={styles.hint}>
              Population under 10,000 — rates here are unstable and the map dims this county.
            </div>
          )}
        </div>
      )}

      {isPinned ? (
        <div className={styles.hint}>Esc or ✕ to close.</div>
      ) : (
        <div className={styles.hint}>Click the county to pin this panel.</div>
      )}
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
