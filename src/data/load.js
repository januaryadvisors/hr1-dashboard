/**
 * Data loading — spec §2: "Static JSON fetched once, cached in context."
 *
 * The four files are the §3 contract. counties.json and statewide.json are
 * currently FIXTURES from scripts/build-fixtures.mjs; districts.json is expected
 * to 404 until the aggregation method is settled (§3.4, §12), which is a normal
 * state and not an error.
 */
import { feature } from 'topojson-client';
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

// BASE_URL carries vite's `base`, so this works at / in dev and at
// /hr1-dashboard/ on Pages.
const dataUrl = (file) => `${import.meta.env.BASE_URL}data/${file}`;

export class MissingDataError extends Error {
  file;
  constructor(file) {
    super(`${file} has not been exported yet.`);
    this.name = 'MissingDataError';
    this.file = file;
  }
}

async function getJson(file) {
  let res;
  try {
    res = await fetch(dataUrl(file));
  } catch {
    throw new MissingDataError(file);
  }
  if (res.status === 404) throw new MissingDataError(file);
  if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);

  // A dev server with SPA fallback answers a missing .json with index.html, so a
  // 200 is not proof the file exists.
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new MissingDataError(file);
  }
}

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
 * @property {boolean} isFixture - True when either payload is fixture data — drives the standing banner.
 */

export async function loadDataset() {
  const [counties, statewide, topo] = await Promise.all([
    getJson('counties.json'),
    getJson('statewide.json'),
    getJson('geometry.json'),
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
    isFixture: Boolean(counties[0]?.fixture || statewide.fixture),
  };
}

/** districts.json is optional by design (§3.4). Absent → null, never a throw. */
export async function loadDistricts() {
  try {
    return await getJson('districts.json');
  } catch (err) {
    if (err instanceof MissingDataError) return null;
    throw err;
  }
}
