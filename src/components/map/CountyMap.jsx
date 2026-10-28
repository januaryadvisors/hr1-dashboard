/**
 * <CountyMap> — spec §7: one component for the Map page's hero map and the
 * chapter bar's thumbnails.
 *
 * §13 step 2: "This is the whole risk of the project; get it right before any
 * chrome." Every render style reads the same data (§6.5):
 *
 *   grid     one equal square per county on the precomputed lattice
 *   geo      true county polygons, Texas Albers, ramp fill at percentile
 *   density  centroid bubbles, sqrt-scaled, over a light county outline
 *
 * THE GRID is not a reader-selectable style: ONE story step uses it (the index
 * chapter's second step, see config/story.js). Every county is one tile with
 * room inside it for the listed-assistance bars (<InfraTileBars>). Equal tiles
 * are the honest reading of a percentile: Loving and Harris are one square
 * each. The lattice is drawn inside the shared viewBox, so panels keep their
 * size when the style changes.
 *
 * Both measures draw the SAME kind of map — a choropleth. Rate colours by the
 * layer's own share or percentile; count colours by the raw headcount on
 * quantile breaks. See the note on `counting` below for why that departs from
 * §11, and what it costs.
 */
import { memo, useMemo } from 'react';
import { countBinsFor, formatLayerValue } from '../../lib/layerValues';
import { cx } from '../../lib/cx';
import { fmtInt } from '../../lib/format';
import { bivariateColor, colorFor } from '../../lib/scales';
import { radiusScale, relax } from '../../lib/density';
import { quantileSorted } from '../../lib/stats';
import { INFRA_GLYPH_ORDER, InfraGlyph } from './InfraGlyph';
import { INFRA_TYPES, viewForLayer } from '../../config/layers';
import { InfraTileBars, infraMax } from './InfraBars';
import styles from './CountyMap.module.css';

/**
 * @typedef {import('../../types').County} County
 * @typedef {import('../../types').InfraKey} InfraKey
 * @typedef {import('../../types').LayerKey} LayerKey
 * @typedef {import('../../types').MapStyle} MapStyle
 * @typedef {import('../../types').Measure} Measure
 * @typedef {import('../../lib/mapGeometry').MapGeometry} MapGeometry
 * @typedef {import('../../lib/layerValues').LayerValues} LayerValues
 * @typedef {'thumb' | 'hero'} MapSize
 */

/** Partially reported registries, whose null draws grey rather than nothing. */
const PARTIAL_INFRA = new Set(INFRA_TYPES.filter((t) => t.partial).map((t) => t.key));

/** Stroke weights and mark visibility per size. A thumbnail cannot carry marks. */
const SIZE_SPEC = {
  thumb: { county: 0.15, state: 0.4, marks: false, maxBubble: 11 },
  hero: { county: 0.5, state: 1, marks: true, maxBubble: 34 },
};

/**
 * @typedef {Object} CountyMapProps
 * @property {County[]} counties
 * @property {Map<string, County>} byGeoid
 * @property {MapGeometry} geometry - Render-ready shapes, shared by every panel. See src/lib/mapGeometry.js.
 * @property {{ cols: number; rows: number }} grid
 * @property {string} viewBox - Radius basis for the density style, in projected units.
 * @property {LayerKey} layer - Which ramp and bins to colour with.
 * @property {LayerValues} values - The numbers to draw, precomputed by the page (src/lib/layerValues.js).
 *   Passed in rather than derived here because the loss layers recompute from
 *   the brush window — the map would otherwise need to know about months.
 * @property {MapStyle | 'grid'} style - 'grid' is set by a story step, never by the reader.
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

  /**
   * Count measure draws a CHOROPLETH of the raw headcount.
   *
   * §11 calls for proportional symbols because "Harris at 5.13M residents
   * swamps any fill scale". That is true of a LINEAR fill scale — 253 of 254
   * counties would land in the bottom band. The bins below are quantile breaks
   * instead, so each colour holds the same number of counties and the map stays
   * readable at both ends. The legend prints the actual edges, because
   * equal-count bands are only honest if the reader can see them.
   *
   * The trade is real and worth stating: on a count choropleth, area is county
   * size and colour is headcount, so a big empty county reads louder than a
   * small crowded one. A proportional-symbol map avoids that. It is the
   * client's call, and the two measures differ only in what they encode rather
   * than in what kind of map they are.
   */
  const counting = measure === 'count' && !!values.count;

  const countBins = useMemo(
    () => (counting ? countBinsFor(values, layer) : null),
    [counting, values, layer],
  );

  /**
   * The layer's own rate or percentile — the accessible label's basis in
   * either measure. (The top-quintile overlay follows the measure instead; see
   * q5Set.)
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

  // ------------------------------------------------------------ grid tiles
  /**
   * The lattice, fitted and centred inside the shared viewBox. `size` is the
   * cell pitch; tiles draw inset from it so the gaps separate them without a
   * stroke competing with the fill.
   */
  const tiles = useMemo(() => {
    if (style !== 'grid') return null;
    const [, , W, H] = viewBox.split(/\s+/).map(Number);
    const size = Math.min(W / grid.cols, H / grid.rows);
    const x0 = (W - size * grid.cols) / 2;
    const y0 = (H - size * grid.rows) / 2;
    const inset = size * 0.04;
    const rects = new Map(
      counties.map((c) => [
        c.geoid,
        {
          x: x0 + c.grid.c * size + inset,
          y: y0 + c.grid.r * size + inset,
          size: size - inset * 2,
        },
      ]),
    );
    return { rects, max: infraMax(counties) };
  }, [style, viewBox, grid.cols, grid.rows, counties]);

  /** Outline paths for the overlays, in whichever geometry is on screen. */
  const outlineFor = (geoid) => {
    if (tiles) {
      const t = tiles.rects.get(geoid);
      return t ? `M${t.x} ${t.y}h${t.size}v${t.size}h${-t.size}Z` : null;
    }
    return geometry.paths.get(geoid) ?? null;
  };

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
   * The <svg> is a rectangle; Texas is not. The element's mouseleave alone would
   * leave the tooltip up in the corners and in the gaps between counties, still
   * showing whatever was hovered last. County shapes are the only things
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
   * precomputed for all of them.
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

  /*
     §6.8 / M-08: outline the top fifth of counties on WHAT THE MAP SHOWS —
     headcount in Count, rate or percentile in Rate. Sorted ascending, the cut
     is the 80th-percentile value and every county at or above it is in: 51 of
     254.
  */
  const q5Set = useMemo(() => {
    if (!overlays.q5) return new Set();
    const sorted = counties
      .map((c) => fillValue(c))
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    if (!sorted.length) return new Set();
    const cut = quantileSorted(sorted, 0.8);
    return new Set(
      counties.filter((c) => (fillValue(c) ?? -Infinity) >= cut).map((c) => c.geoid),
    );
    // fillValue reads `counting` and `values`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counties, values, counting, overlays.q5]);

  const overlayOn = !!(overlays.q5 || overlays.gap);
  const isFlagged = (c) => (overlays.q5 && q5Set.has(c.geoid)) || (overlays.gap && c.is_gap);

  // ------------------------------------------------------------------ render
  // Every county is drawn in exactly its key colour. With an overlay on,
  // everything it does not pick out steps back, so the outlined counties read
  // at a glance rather than as a thin line to hunt for.
  const classFor = (county) =>
    cx(
      styles.county,
      county?.geoid === hovered && styles.hovered,
      county && overlayOn && !isFlagged(county) && styles.overlayDimmed,
    );

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

  /** One overlay's outlines: a white halo under the coloured line, so it holds
      its edge against dark fills as well as light ones. */
  const outlines = (list, className) => (
    <g>
      {list.map((c) => (
        <path key={`halo-${c.geoid}`} d={outlineFor(c.geoid)} className={styles.overlayHalo} />
      ))}
      {list.map((c) => (
        <path key={c.geoid} d={outlineFor(c.geoid)} className={className} />
      ))}
    </g>
  );

  return (
    <svg
      className={cx(
        styles.root,
        interactive && styles.interactive,
        // Work requirements: most counties sit in the palest class, and white
        // borders between pale fills vanish — dark outlines keep them apart.
        viewForLayer(layer).key === 'work' && styles.outlined,
      )}
      viewBox={viewBox}
      role="img"
      aria-label={title}
      data-hero-map={size === 'hero' ? '' : undefined}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {/* No <title>: browsers show it as a native grey tooltip over the whole
          map, on top of the county panel. aria-label above names the map for
          screen readers instead. */}

      {/* ----------------------------------------------------------- GRID */}
      {tiles && (
        <g>
          {counties.map((county) => {
            const t = tiles.rects.get(county.geoid);
            return (
              <rect
                key={county.geoid}
                data-geoid={county.geoid}
                x={t.x}
                y={t.y}
                width={t.size}
                height={t.size}
                rx={t.size * 0.04}
                className={classFor(county)}
                fill={colorOf(county, fillValue(county))}
                strokeWidth={0}
                onMouseEnter={() => handleEnter(county.geoid)}
                aria-label={label(county)}
              />
            );
          })}
        </g>
      )}

      {/* ------------------------------------------------------------ GEO */}
      {style === 'geo' && (
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

      {/* State hairline sits above the fills, below the marks. The grid has no
          true outline to trace — its edge is the tiles themselves. */}
      {!tiles && (
        <path d={geometry.statePath} className={styles.stateOutline} strokeWidth={spec.state} />
      )}

      {/* Bubbles are the density style only; count is a choropleth too. */}
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
                className={cx(styles.bubble, classFor(county))}
                fill={colorOf(county, value)}
                // Opaque, so a bubble is exactly its key colour.
                strokeWidth={spec.county}
                onMouseEnter={() => handleEnter(b.geoid)}
                aria-label={label(county)}
              />
            );
          })}
        </g>
      )}

      {/* Overlays (§6.8 M-08), tracing whichever geometry is on screen.
          Outlines, never fills — cumulative impact and Q5 are too lopsided to
          colour a state by (§11). */}
      {overlays.q5 && outlines(counties.filter((c) => q5Set.has(c.geoid)), styles.overlayQ5)}
      {overlays.gap && outlines(counties.filter((c) => c.is_gap), styles.overlayGap)}

      {/* Assistance-infrastructure marks (§6.6). On the grid they are bars
          inside each tile — the same encoding as the tooltip's column chart,
          see <InfraBars>. Elsewhere they are glyphs at the county centroid.
          A partial registry (food bank) with no reporting source draws grey. */}
      {spec.marks && marks.length > 0 && tiles && (
        <g className={styles.mark}>
          {counties.map((county) => {
            const t = tiles.rects.get(county.geoid);
            return (
              <InfraTileBars
                key={county.geoid}
                county={county}
                types={marks}
                x={t.x}
                y={t.y}
                size={t.size}
                max={tiles.max}
              />
            );
          })}
        </g>
      )}
      {spec.marks && marks.length > 0 && !tiles && (
        <g className={styles.mark}>
          {counties.flatMap((county) => {
            const xy = geometry.centroids.get(county.geoid);
            if (!xy) return [];
            return INFRA_GLYPH_ORDER.filter(
              (key) =>
                marks.includes(key) &&
                (county.infra[key] > 0 || (PARTIAL_INFRA.has(key) && county.infra[key] == null)),
            ).map((key, i, arr) => (
              <InfraGlyph
                key={`${county.geoid}-${key}`}
                type={key}
                x={xy[0] + (i - (arr.length - 1) / 2) * 5.4}
                y={xy[1]}
                size={size === 'hero' ? 3 : 2.2}
                noData={county.infra[key] == null}
              />
            ));
          })}
        </g>
      )}
    </svg>
  );
}

export const CountyMap = memo(CountyMapInner);
