/**
 * Texas Albers, tuned to EPSG:3083 (NAD83 / Texas Centric Albers Equal Area):
 * standard parallels 27.5°N and 35°N, central meridian 100°W.
 *
 * Built once and shared with a canonical viewBox: every map renders the same
 * viewBox at its own width, so thumbnails and the hero map line up exactly.
 */
import { geoAlbers, geoPath } from 'd3-geo';
/**
 * @typedef {import('d3-geo').GeoPath} GeoPath
 * @typedef {import('d3-geo').GeoProjection} GeoProjection
 */
/**
 * @typedef {import('geojson').Feature} Feature
 * @typedef {import('geojson').FeatureCollection} FeatureCollection
 * @typedef {import('geojson').Geometry} Geometry
 */

/** Canonical canvas width. Height is derived from Texas's fitted aspect. */
const CANVAS_WIDTH = 1000;
const PADDING = 8;

/**
 * @typedef {Object} Projection
 * @property {GeoProjection} projection
 * @property {GeoPath} path
 * @property {string} viewBox - "0 0 W H" — identical for every panel.
 * @property {number} width
 * @property {number} height
 * @property {(lonLat: [number, number]) => [number, number] | null} project - Project a [lon, lat] centroid into canvas space.
 */

export function createProjection(state) {
  // Fit to a square first to learn the true aspect, then refit to that aspect so
  // no panel wastes space and the map fills its box.
  const probe = geoAlbers().parallels([27.5, 35]).rotate([100, 0]);
  probe.fitExtent(
    [
      [PADDING, PADDING],
      [CANVAS_WIDTH - PADDING, CANVAS_WIDTH - PADDING],
    ],
    state,
  );
  const bounds = geoPath(probe).bounds(state);
  const drawnWidth = bounds[1][0] - bounds[0][0];
  const drawnHeight = bounds[1][1] - bounds[0][1];
  const height = Math.round((CANVAS_WIDTH - 2 * PADDING) * (drawnHeight / drawnWidth)) + 2 * PADDING;

  const projection = geoAlbers().parallels([27.5, 35]).rotate([100, 0]);
  projection.fitExtent(
    [
      [PADDING, PADDING],
      [CANVAS_WIDTH - PADDING, height - PADDING],
    ],
    state,
  );

  const path = geoPath(projection);

  return {
    projection,
    path,
    viewBox: `0 0 ${CANVAS_WIDTH} ${height}`,
    width: CANVAS_WIDTH,
    height,
    project: (lonLat) => {
      const p = projection(lonLat);
      return p ? [p[0], p[1]] : null;
    },
  };
}
