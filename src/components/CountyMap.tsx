/**
 * <CountyMap> — spec §7: "One component, four sizes." Used by the hero map, the
 * six layer thumbnails, the Insights small multiples, and the district maps.
 *
 * §13 step 2: "This is the whole risk of the project; get it right before any
 * chrome." The three render styles all read the same data (§6.5):
 *
 *   geo      true county polygons, Texas Albers, ramp fill at percentile
 *   grid     contiguous area cartogram — the same county shapes, distorted so
 *            area encodes a quantity, adjacency preserved. The distortion is
 *            baked into `geometry` upstream (src/lib/useCartogram.ts), which is
 *            what lets geo and cartogram animate into one another.
 *   density  centroid bubbles, sqrt-scaled, over a light county outline
 *
 * NOTE: §6.5 originally specified Grid as an EQUAL-size lattice, arguing that
 * identical visual weight is the honest reading of a percentile. Superseded by
 * the client on 2026-09-01 in favour of a population-weighted cartogram. The
 * equal-size lattice is still precomputed in the data (`grid: {r, c}`) and still
 * drives keyboard navigation order. See docs/SPEC-DEVIATIONS.md.
 *
 * In count measure, geo becomes a proportional-symbol map over a neutral base —
 * never a fill of raw counts (§11: "Harris at 5.13M residents swamps any fill
 * scale").
 */
import { memo, useMemo, useRef } from 'react';
import type { County, InfraKey, LayerKey, MapStyle, Measure } from '../types';
import type { MapGeometry } from '../lib/mapGeometry';
import { colorFor } from '../lib/scales';
import { radiusScale, relax, type Bubble } from '../lib/density';
import { layerByKey, scoreField } from '../config/layers';
import { INFRA_GLYPH_ORDER, InfraGlyph } from './InfraGlyph';
import styles from './CountyMap.module.css';

export type MapSize = 'thumb' | 'small' | 'medium' | 'hero';

/** Stroke weights and mark visibility per size. A thumbnail cannot carry marks. */
const SIZE_SPEC: Record<
  MapSize,
  { county: number; state: number; marks: boolean; maxBubble: number }
> = {
  thumb: { county: 0.15, state: 0.4, marks: false, maxBubble: 11 },
  small: { county: 0.3, state: 0.7, marks: false, maxBubble: 16 },
  medium: { county: 0.4, state: 0.9, marks: true, maxBubble: 24 },
  hero: { county: 0.5, state: 1, marks: true, maxBubble: 34 },
};

export interface CountyMapProps {
  counties: County[];
  byGeoid: Map<string, County>;
  /** Render-ready shapes, shared by every panel. See src/lib/mapGeometry.ts. */
  geometry: MapGeometry;
  grid: { cols: number; rows: number };
  /** Radius basis for the density style, in projected units. */
  viewBox: string;

  layer: LayerKey;
  style: MapStyle;
  measure: Measure;
  size: MapSize;

  /** Infrastructure types whose marks should draw (§6.6). */
  marks?: InfraKey[];
  overlays?: { q5?: boolean; gap?: boolean };
  interactive?: boolean;

  hovered?: string | null;
  onHover?: (geoid: string | null) => void;

  /** Accessible name; every map needs one (§13 step 9). */
  title: string;
}

/** The value a county contributes to the fill, for the active layer. */
function fillValue(county: County, layer: LayerKey): number | null {
  const v = county[scoreField(layer)];
  return typeof v === 'number' ? v : null;
}

/** The value a county contributes in count measure, or null if the layer has none. */
function countValue(county: County, layer: LayerKey): number | null {
  const field = layerByKey(layer).countField;
  if (!field) return null;
  const v = county[field];
  return typeof v === 'number' ? v : null;
}

function CountyMapInner(props: CountyMapProps) {
  const {
    counties,
    byGeoid,
    geometry,
    grid,
    viewBox,
    layer,
    style,
    measure,
    size,
    marks = [],
    overlays = {},
    interactive = false,
    hovered = null,
    onHover,
    title,
  } = props;

  const spec = SIZE_SPEC[size];
  const svgRef = useRef<SVGSVGElement>(null);

  const proportional = measure === 'count' && style === 'geo';

  // ------------------------------------------------------------- county paths
  const paths = useMemo(
    () => [...geometry.paths].map(([geoid, d]) => ({ geoid, d })),
    [geometry.paths],
  );

  // --------------------------------------------------------------- bubbles
  const bubbles = useMemo<Bubble[]>(() => {
    if (style !== 'density' && !proportional) return [];

    // §6.5: radius is the count metric in count measure, population in rate.
    const valueOf = (c: County) =>
      measure === 'count' ? (countValue(c, layer) ?? 0) : c.pop;

    const max = counties.reduce((m, c) => Math.max(m, valueOf(c)), 0);
    const scale = radiusScale(max, spec.maxBubble);

    const placed: Bubble[] = [];
    for (const c of counties) {
      const xy = geometry.centroids.get(c.geoid);
      if (!xy) continue;
      const r = scale(valueOf(c));
      if (r <= 0) continue;
      placed.push({ geoid: c.geoid, x: xy[0], y: xy[1], r });
    }
    return relax(placed);
  }, [counties, layer, measure, geometry.centroids, proportional, spec.maxBubble, style]);

  // ------------------------------------------------------------- interaction
  const handleEnter = (geoid: string) => {
    if (interactive) onHover?.(geoid);
  };
  const handleLeave = () => {
    if (interactive) onHover?.(null);
  };

  /**
   * The <svg> is a rectangle; Texas is not. Relying on the element's mouseleave
   * meant the tooltip stayed up in the corners and in the gaps between counties,
   * still showing whatever was hovered last. County shapes are the only things
   * in here that take pointer events, so if the target is not one of them the
   * pointer is over empty space and the readout should clear.
   */
  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const el = e.target as Element | null;
    if (!el || !el.closest('[data-geoid]')) onHover?.(null);
  };
  /**
   * §6.5: "arrow keys walk counties in reading order on the grid lattice." The
   * lattice drives keyboard order in every style, which is why grid is
   * precomputed for all of them. Enter/Space did the pinning; it returns with
   * the reworked selection.
   */
  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!interactive) return;

    const current = hovered;
    const focus = (geoid: string | null) => {
      if (geoid) onHover?.(geoid);
    };

    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();

    if (!current) {
      // Start at the first occupied cell in reading order.
      const first = [...counties].sort(
        (a, b) => a.grid.r - b.grid.r || a.grid.c - b.grid.c,
      )[0];
      focus(first?.geoid ?? null);
      return;
    }

    const from = byGeoid.get(current);
    if (!from) return;

    // Walk outward along the direction until an occupied cell turns up, so
    // gaps in the lattice do not trap the cursor.
    const occupied = new Map(counties.map((c) => [`${c.grid.r},${c.grid.c}`, c.geoid]));
    for (let step = 1; step <= Math.max(grid.rows, grid.cols); step++) {
      const r = from.grid.r + delta[0] * step;
      const c = from.grid.c + delta[1] * step;
      if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) break;
      const hit = occupied.get(`${r},${c}`);
      if (hit) {
        focus(hit);
        return;
      }
    }
  };

  // ------------------------------------------------------------------ render
  const classFor = (county: County | undefined) => {
    const parts = [styles.county];
    if (!county) return parts.join(' ');
    if (county.geoid === hovered) parts.push(styles.hovered);
    // §6.5: dim small denominators in rate measure only.
    if (measure === 'rate' && county.small_denominator) parts.push(styles.smallDenominator);
    return parts.join(' ');
  };

  const label = (county: County | undefined) => {
    if (!county) return undefined;
    const v = fillValue(county, layer);
    return `${county.name}: ${v == null ? 'no data' : `p${Math.round(v * 100)}`}`;
  };

  const q5Set = useMemo(() => {
    if (!overlays.q5) return new Set<string>();
    // §6.8 / M-08: outline every county in Q5 on the layer showing.
    const values = counties
      .map((c) => fillValue(c, layer))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (!values.length) return new Set<string>();
    const cut = values[Math.floor(values.length * 0.8)];
    return new Set(
      counties.filter((c) => (fillValue(c, layer) ?? -Infinity) >= cut).map((c) => c.geoid),
    );
  }, [counties, layer, overlays.q5]);

  return (
    <svg
      ref={svgRef}
      className={`${styles.root} ${interactive ? styles.interactive : ''} ${styles.group}`}
      viewBox={viewBox}
      role="img"
      aria-label={title}
      data-hero-map={size === 'hero' ? '' : undefined}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <title>{title}</title>

      {/* --------------------------------------- GEO and CARTOGRAM shapes --
          Both draw the same path set; the cartogram is baked into the geometry
          upstream, which is what lets the two animate into each other. */}
      {style !== 'density' && (
        <g>
          {paths.map(({ geoid, d }) => {
            const county = byGeoid.get(geoid);
            const value = county ? fillValue(county, layer) : null;
            return (
              <path
                key={geoid}
                data-geoid={geoid}
                d={d}
                className={classFor(county)}
                // In count measure the base goes neutral and magnitude moves to
                // the bubbles drawn on top.
                fill={proportional ? '#f7f6f6' : colorFor(value, layer)}
                strokeWidth={spec.county}
                onMouseEnter={() => handleEnter(geoid)}
                aria-label={label(county)}
              />
            );
          })}
        </g>
      )}

      {/* Faint true border behind a distorted map, so the reader can see how
          far the cartogram has stretched things. */}
      {style === 'grid' && (
        <path d={geometry.statePath} fill="none" stroke="#ded9d9" strokeWidth={spec.state * 0.8} />
      )}

      {/* --------------------------------------------------------- DENSITY */}
      {style === 'density' && (
        <g>
          {paths.map(({ geoid, d }) => (
            <path key={geoid} d={d} className={styles.neutralBase} />
          ))}
        </g>
      )}

      {/* State hairline sits above the fills, below the marks. */}
      <path d={geometry.statePath} className={styles.stateOutline} strokeWidth={spec.state} />

      {/* Bubbles for density style and for proportional-symbol count maps. */}
      {(style === 'density' || proportional) && (
        <g>
          {bubbles.map((b) => {
            const county = byGeoid.get(b.geoid);
            const value = county ? fillValue(county, layer) : null;
            return (
              <circle
                key={b.geoid}
                data-geoid={b.geoid}
                cx={b.x}
                cy={b.y}
                r={b.r}
                className={`${styles.bubble} ${classFor(county)}`}
                fill={colorFor(value, layer)}
                fillOpacity={0.85}
                strokeWidth={spec.county}
                onMouseEnter={() => handleEnter(b.geoid)}
                aria-label={label(county)}
              />
            );
          })}
        </g>
      )}

      {/* Overlays (§6.8 M-08). Outlines, never fills — cumulative impact and Q5
          are too lopsided to colour a state by (§11). */}
      {/* Overlays trace whichever geometry is on screen. */}
      {overlays.q5 && (
        <g>
          {paths
            .filter(({ geoid }) => q5Set.has(geoid))
            .map(({ geoid, d }) => (
              <path key={geoid} d={d} className={styles.overlayQ5} />
            ))}
        </g>
      )}
      {overlays.gap && (
        <g>
          {paths
            .filter(({ geoid }) => byGeoid.get(geoid)?.is_gap)
            .map(({ geoid, d }) => (
              <path key={geoid} d={d} className={styles.overlayGap} />
            ))}
        </g>
      )}

      {/* Assistance-infrastructure marks (§6.6). Presence, not capacity. */}
      {/* Marks draw in every style. They follow geometry.centroids, which is
          recomputed from the shapes actually on screen, so on the cartogram they
          move with the county rather than pointing at where it used to be. */}
      {spec.marks && marks.length > 0 && (
        <g className={styles.mark}>
          {counties.flatMap((county) => {
            const xy = geometry.centroids.get(county.geoid);
            if (!xy) return [];
            return INFRA_GLYPH_ORDER.filter(
              (key) => marks.includes(key) && county.infra[key] > 0,
            ).map((key, i, arr) => (
              <InfraGlyph
                key={`${county.geoid}-${key}`}
                type={key}
                x={xy[0] + (i - (arr.length - 1) / 2) * 5.4}
                y={xy[1]}
                size={size === 'hero' ? 3 : 2.2}
              />
            ));
          })}
        </g>
      )}
    </svg>
  );
}

export const CountyMap = memo(CountyMapInner);
