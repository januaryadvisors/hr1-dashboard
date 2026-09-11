/**
 * <CountyMap> — spec §7: "One component, four sizes." Used by the hero map, the
 * four view thumbnails, the Insights small multiples, and the district maps.
 *
 * §13 step 2: "This is the whole risk of the project; get it right before any
 * chrome." Both render styles read the same data (§6.5):
 *
 *   geo      true county polygons, Texas Albers, ramp fill at percentile
 *   density  centroid bubbles, sqrt-scaled, over a light county outline
 *
 * NOTE: §6.5 specified a THIRD style, Grid — first an equal-size lattice, then a
 * population-weighted area cartogram on the client's 2026-09-01 direction.
 * Removed entirely on 2026-09-11: three ways to draw one number was one too
 * many, and the cartogram was the one readers had to be taught to read. The
 * lattice is still precomputed in the data (`grid: {r, c}`) because it still
 * drives keyboard navigation order. See docs/SPEC-DEVIATIONS.md.
 *
 * Both measures draw the SAME kind of map — a choropleth. Rate colours by the
 * layer's own share or percentile; count colours by the raw headcount on
 * quantile breaks. See the note on `counting` below for why that departs from
 * §11, and what it costs.
 */
import { memo, useMemo, useRef } from 'react';
/**
 * @typedef {import('../../types').County} County
 * @typedef {import('../../types').InfraKey} InfraKey
 * @typedef {import('../../types').LayerKey} LayerKey
 * @typedef {import('../../types').MapStyle} MapStyle
 * @typedef {import('../../types').Measure} Measure
 */
/**
 * @typedef {import('../../lib/mapGeometry').MapGeometry} MapGeometry
 */
import { countBinsFor, formatLayerValue } from '../../lib/layerValues';
import { fmtInt } from '../../lib/format';
/**
 * @typedef {import('../../lib/layerValues').LayerValues} LayerValues
 */
import { bivariateColor, colorFor } from '../../lib/scales';
import { radiusScale, relax } from '../../lib/density';
/**
 * @typedef {import('../../lib/density').Bubble} Bubble
 */
import { INFRA_GLYPH_ORDER, InfraGlyph } from './InfraGlyph';
import styles from './CountyMap.module.css';

/**
 * @typedef {'thumb' | 'small' | 'medium' | 'hero'} MapSize
 */

/** Stroke weights and mark visibility per size. A thumbnail cannot carry marks. */
const SIZE_SPEC = {
  thumb: { county: 0.15, state: 0.4, marks: false, maxBubble: 11 },
  small: { county: 0.3, state: 0.7, marks: false, maxBubble: 16 },
  medium: { county: 0.4, state: 0.9, marks: true, maxBubble: 24 },
  hero: { county: 0.5, state: 1, marks: true, maxBubble: 34 },
};

/**
 * @typedef {Object} CountyMapProps
 * @property {County[]} counties
 * @property {Map<string, County>} byGeoid
 * @property {MapGeometry} geometry - Render-ready shapes, shared by every panel. See src/lib/mapGeometry.ts.
 * @property {{ cols: number; rows: number }} grid
 * @property {string} viewBox - Radius basis for the density style, in projected units.
 * @property {LayerKey} layer - Which ramp and bins to colour with.
 * @property {LayerValues} values - The numbers to draw, precomputed by the page (src/lib/layerValues.ts).
 *   Passed in rather than derived here because the loss layers recompute from
 *   the brush window — the map would otherwise need to know about months.
 * @property {MapStyle} style
 * @property {Measure} measure
 * @property {MapSize} size
 * @property {InfraKey[]} [marks] - Infrastructure types whose marks should draw (§6.6).
 * @property {{ q5?: boolean; gap?: boolean }} [overlays]
 * @property {boolean} [interactive]
 * @property {string | null} [hovered]
 * @property {(geoid: string | null) => void} [onHover]
 * @property {string} title - Accessible name; every map needs one (§13 step 9).
 */

function CountyMapInner(props) {
  const {
    counties,
    byGeoid,
    geometry,
    grid,
    viewBox,
    layer,
    values,
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
  const svgRef = useRef(null);

  /**
   * Count measure draws a CHOROPLETH of the raw headcount — 2026-09-11 direction.
   *
   * It used to switch form entirely: neutral polygons with proportional circles
   * on top, on the §11 reasoning that "Harris at 5.13M residents swamps any fill
   * scale". That reasoning is about a LINEAR fill scale, and it is correct about
   * one — 253 of 254 counties would land in the bottom band. The bins below are
   * quantile breaks instead, so each colour holds the same number of counties
   * and the map stays readable at both ends. The legend prints the actual edges,
   * because equal-count bands are only honest if the reader can see them.
   *
   * The trade is real and worth stating: on a count choropleth, area is county
   * size and colour is headcount, so a big empty county reads louder than a
   * small crowded one. That is what the proportional-symbol map avoided. It is
   * the client's call, and the two measures now differ only in what they encode
   * rather than in what kind of map they are.
   */
  const counting = measure === 'count' && !!values.count;

  const countBins = useMemo(
    () => (counting ? countBinsFor(values, layer) : null),
    [counting, values, layer],
  );

  /**
   * The layer's own rate or percentile. Still the basis for the top-quintile
   * overlay and the accessible label even in count measure — "the worst fifth"
   * has to keep meaning the worst fifth by rate, or switching measure would
   * quietly redefine an overlay the reader turned on for a different reason
   * (by headcount, the top fifth is essentially the five biggest metros).
   */
  const rateValue = (county) => (county ? values.fill.get(county.geoid) ?? null : null);

  /** What the polygon is COLOURED by. The only thing count measure changes. */
  const fillValue = (county) => {
    if (!county) return null;
    if (counting) return values.count.get(county.geoid) ?? null;
    return rateValue(county);
  };

  /**
   * Two axes in, one fill out. The map does not know which layers are bivariate
   * — being handed a second axis is the whole signal.
   */
  const colorOf = (county, value) => {
    const second = values.secondary;
    if (counting) return colorFor(value, layer, countBins);
    if (!second) return colorFor(value, layer, values.bins);
    return bivariateColor(
      value,
      values.bins,
      county ? second.fill.get(county.geoid) ?? null : null,
      second.bins,
    );
  };

  // ------------------------------------------------------------- county paths
  const paths = useMemo(
    () => [...geometry.paths].map(([geoid, d]) => ({ geoid, d })),
    [geometry.paths],
  );

  // --------------------------------------------------------------- bubbles
  const bubbles = useMemo(() => {
    if (style !== 'density') return [];

    // §6.5: radius is the count metric in count measure, population in rate.
    const valueOf = (c) =>
      measure === 'count' ? values.count?.get(c.geoid) ?? 0 : c.pop;

    const max = counties.reduce((m, c) => Math.max(m, valueOf(c)), 0);
    const scale = radiusScale(max, spec.maxBubble);

    const placed = [];
    for (const c of counties) {
      const xy = geometry.centroids.get(c.geoid);
      if (!xy) continue;
      const r = scale(valueOf(c));
      if (r <= 0) continue;
      placed.push({ geoid: c.geoid, x: xy[0], y: xy[1], r });
    }
    return relax(placed);
  }, [counties, values, measure, geometry.centroids, spec.maxBubble, style]);

  // ------------------------------------------------------------- interaction
  const handleEnter = (geoid) => {
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
  const handleMove = (e) => {
    if (!interactive) return;
    const el = e.target;
    if (!el || !el.closest('[data-geoid]')) onHover?.(null);
  };
  /**
   * §6.5: "arrow keys walk counties in reading order on the grid lattice." The
   * lattice drives keyboard order in every style, which is why grid is
   * precomputed for all of them. Enter/Space did the pinning; it returns with
   * the reworked selection.
   */
  const handleKeyDown = (e) => {
    if (!interactive) return;

    const current = hovered;
    const focus = (geoid) => {
      if (geoid) onHover?.(geoid);
    };

    const deltas = {
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
  const classFor = (county) => {
    const parts = [styles.county];
    if (!county) return parts.join(' ');
    if (county.geoid === hovered) parts.push(styles.hovered);
    // §6.5: dim small denominators in rate measure only.
    if (measure === 'rate' && county.small_denominator) parts.push(styles.smallDenominator);
    return parts.join(' ');
  };

  const label = (county) => {
    if (!county) return undefined;
    const rate = formatLayerValue(layer, rateValue(county));
    // In count measure colour encodes the headcount, so the label leads with it
    // and keeps the rate for context.
    if (counting) {
      return `${county.name}: ${fmtInt(values.count.get(county.geoid) ?? 0)} (${rate})`;
    }
    return `${county.name}: ${rate}`;
  };

  const q5Set = useMemo(() => {
    if (!overlays.q5) return new Set();
    // §6.8 / M-08: outline every county in Q5 on the layer showing.
    const sorted = counties
      .map((c) => rateValue(c))
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    if (!sorted.length) return new Set();
    const cut = sorted[Math.floor(sorted.length * 0.8)];
    return new Set(
      counties.filter((c) => (rateValue(c) ?? -Infinity) >= cut).map((c) => c.geoid),
    );
  }, [counties, values, overlays.q5]);

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

      {/* ------------------------------------------------------------ GEO */}
      {style !== 'density' && (
        <g>
          {paths.map(({ geoid, d }) => {
            const county = byGeoid.get(geoid);
            const value = fillValue(county);
            return (
              <path
                key={geoid}
                data-geoid={geoid}
                d={d}
                className={classFor(county)}
                fill={colorOf(county, value)}
                strokeWidth={spec.county}
                onMouseEnter={() => handleEnter(geoid)}
                aria-label={label(county)}
              />
            );
          })}
        </g>
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

      {/* Bubbles are the density style only, now that count is a choropleth. */}
      {style === 'density' && (
        <g>
          {bubbles.map((b) => {
            const county = byGeoid.get(b.geoid);
            const value = fillValue(county);
            return (
              <circle
                key={b.geoid}
                data-geoid={b.geoid}
                cx={b.x}
                cy={b.y}
                r={b.r}
                className={`${styles.bubble} ${classFor(county)}`}
                fill={colorOf(county, value)}
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
