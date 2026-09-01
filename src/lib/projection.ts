/**
 * Texas Albers, tuned to EPSG:3083 (NAD83 / Texas Centric Albers Equal Area):
 * standard parallels 27.5°N and 35°N, central meridian 100°W.
 *
 * Spec §2: "Fit once to the state bbox and reuse the same projection object
 * across every panel so thumbnails and the hero map register exactly."
 *
 * That is why this module builds ONE projection at load time and exports a
 * canonical viewBox with it. Every panel renders the same viewBox at a different
 * width — never its own refitted projection, which would break registration.
 */
import { geoAlbers, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

/** Canonical canvas width. Height is derived from Texas's fitted aspect. */
const CANVAS_WIDTH = 1000;
const PADDING = 8;

export interface Projection {
  projection: GeoProjection;
  path: GeoPath;
  /** "0 0 W H" — identical for every panel. */
  viewBox: string;
  width: number;
  height: number;
  /** Project a [lon, lat] centroid into canvas space. */
  project: (lonLat: [number, number]) => [number, number] | null;
}

export function createProjection(state: Feature | FeatureCollection): Projection {
  // Fit to a square first to learn the true aspect, then refit to that aspect so
  // no panel wastes space and the map fills its box.
  const probe = geoAlbers().parallels([27.5, 35]).rotate([100, 0]);
  probe.fitExtent(
    [
      [PADDING, PADDING],
      [CANVAS_WIDTH - PADDING, CANVAS_WIDTH - PADDING],
    ],
    state as never,
  );
  const bounds = geoPath(probe).bounds(state as never);
  const drawnWidth = bounds[1][0] - bounds[0][0];
  const drawnHeight = bounds[1][1] - bounds[0][1];
  const height = Math.round((CANVAS_WIDTH - 2 * PADDING) * (drawnHeight / drawnWidth)) + 2 * PADDING;

  const projection = geoAlbers().parallels([27.5, 35]).rotate([100, 0]);
  projection.fitExtent(
    [
      [PADDING, PADDING],
      [CANVAS_WIDTH - PADDING, height - PADDING],
    ],
    state as never,
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

/** Path string for one county geometry, or null when it fails to project. */
export function pathFor(p: Projection, geometry: Feature<Geometry> | Geometry): string | null {
  return p.path(geometry as never);
}
