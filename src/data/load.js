/**
 * Data loading — spec §2: "Static JSON fetched once, cached in context."
 *
 * counties.json and statewide.json are the §3 contract, built from the analysis
 * repo's data-clean/ parquets by scripts/build-county-data.mjs — real HHSC
 * enrollment and build_scores.R output, no synthetic values.
 */
import { feature } from 'topojson-client';
import { fetchJson, fetchOptionalJson } from './fetchJson';

export { MissingDataError } from './fetchJson';
/**
 * @typedef {import('geojson').Feature} Feature
 * @typedef {import('geojson').FeatureCollection} FeatureCollection
 * @typedef {import('geojson').Geometry} Geometry
 */
/**
 * @typedef {import('../types').County} County
 * @typedef {import('../types').Statewide} Statewide
 * @typedef {import('../types').Topology} Topology
 */

/**
 * @typedef {Object} CountyGeometry
 * @property {Feature<Geometry, { geoid: string; name: string }>[]} counties
 * @property {Feature | FeatureCollection} state
 */

function parseGeometry(topo) {
  const fc = feature(topo, topo.objects.counties);
  const state = feature(topo, topo.objects.state);
  return {
    counties: fc.features,
    state,
  };
}

/**
 * @typedef {Object} Dataset
 * @property {County[]} counties
 * @property {Map<string, County>} byGeoid
 * @property {Statewide} statewide
 * @property {CountyGeometry} geometry
 * @property {DistrictCounts | null} districtCounts - TX House / Senate / US House enrollment counts for the Insights
 *   scope picker, or null when district-counts.json is absent (the picker then offers counties only).
 * @property {boolean} isFixture - True when either payload carries `fixture: true`. The real build never sets it;
 *   a hand-dropped fixture file still labels itself in downloads.
 */

/**
 * @typedef {Object} DistrictUnit
 * @property {string} geoid - The unit key, e.g. "txhouse-133". NOT a Census GEOID — those collide with county
 *   FIPS (SLDL 48133 is also Eastland County). Named geoid so the county helpers (buildFunnel, search)
 *   take a district unchanged.
 * @property {'txhouse' | 'txsenate' | 'ushouse'} plan
 * @property {number} number
 * @property {string} name - "House District 133".
 * @property {number} pop
 * @property {number[]} snap_enrolled - Parallel to statewide meta.months.
 * @property {number[]} snap_children
 * @property {Record<string, number[]>} snap_age - Monthly enrolled per age band, keyed like statewide age_series.
 * @property {number} newly_subject_persons - PUMS-modelled, apportioned.
 * @property {boolean} exact - Built entirely from whole counties, so the counts are sums, not estimates.
 * @property {number} allocated_share - Share of the Jul 2025 caseload apportioned from split counties.
 * @property {{ geoid: string, name: string, share: number, share_moe: number | null }[]} counties - Share = the
 *   fraction of that county's caseload assigned here, 1 for a whole county. share_moe is the 90% survey margin
 *   on a split share (0 for a whole county, null where a fallback weight has none).
 */

/**
 * @typedef {Object} DistrictCounts
 * @property {{ months: string[], chambers: Record<string, { label: string, plan: string, noun: string, count: number }>, method: string, notes: string[] }} meta
 * @property {DistrictUnit[]} districts
 * @property {Map<string, DistrictUnit>} byId
 */

/**
 * district-counts.json, indexed. Rejected (null) if its month axis is not the
 * statewide one — a district series one month out of step would put every
 * window figure on the wrong months without looking wrong.
 */
function prepareDistricts(raw, statewide) {
  if (!raw?.districts?.length) return null;
  const axis = statewide.meta.months;
  if (raw.meta?.months?.join() !== axis.join()) return null;
  return { ...raw, byId: new Map(raw.districts.map((d) => [d.geoid, d])) };
}

export async function loadDataset() {
  const [counties, statewide, topo, districtsRaw] = await Promise.all([
    fetchJson('counties.json'),
    fetchJson('statewide.json'),
    fetchJson('geometry.json'),
    // Optional too: without it the Insights picker offers counties only.
    fetchOptionalJson('district-counts.json'),
  ]);

  const geometry = parseGeometry(topo);

  // The join is the one thing that silently ruins a choropleth, so check it here
  // rather than discovering blank counties in the UI.
  const byGeoid = new Map(counties.map((c) => [c.geoid, c]));
  const unmatched = geometry.counties.filter((f) => !byGeoid.has(f.properties.geoid));
  if (unmatched.length) {
    throw new Error(
      `${unmatched.length} geometry feature(s) have no row in counties.json ` +
        `(first: ${unmatched[0].properties.geoid})`,
    );
  }
  if (counties.length !== geometry.counties.length) {
    throw new Error(
      `counties.json has ${counties.length} rows but geometry has ${geometry.counties.length}`,
    );
  }

  return {
    counties,
    byGeoid,
    statewide,
    geometry,
    districtCounts: prepareDistricts(districtsRaw, statewide),
    isFixture: Boolean(counties[0]?.fixture || statewide.fixture),
  };
}

let districtShapes = null;

/**
 * District outlines per chamber ({ txhouse, txsenate, ushouse }, each a list of
 * features keyed by district-counts.json's geoid), fetched the first time a
 * district is picked rather than with the rest of the data. null if the file is
 * absent.
 */
export function loadDistrictShapes() {
  districtShapes ??= fetchOptionalJson('district-geometry.json').then(
    (topo) =>
      topo &&
      Object.fromEntries(
        Object.entries(topo.objects).map(([plan, object]) => [plan, feature(topo, object).features]),
      ),
  );
  return districtShapes;
}
