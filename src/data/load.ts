/**
 * Data loading — spec §2: "Static JSON fetched once, cached in context."
 *
 * The four files are the §3 contract. counties.json and statewide.json are
 * currently FIXTURES from scripts/build-fixtures.mjs; districts.json is expected
 * to 404 until the aggregation method is settled (§3.4, §12), which is a normal
 * state and not an error.
 */
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { County, Statewide, Topology } from '../types';

// BASE_URL carries vite's `base`, so this works at / in dev and at
// /hr1-dashboard/ on Pages.
const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

export class MissingDataError extends Error {
  readonly file: string;
  constructor(file: string) {
    super(`${file} has not been exported yet.`);
    this.name = 'MissingDataError';
    this.file = file;
  }
}

async function getJson<T>(file: string): Promise<T> {
  let res: Response;
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
    return JSON.parse(text) as T;
  } catch {
    throw new MissingDataError(file);
  }
}

export interface CountyGeometry {
  counties: Feature<Geometry, { geoid: string; name: string }>[];
  state: Feature | FeatureCollection;
}

function parseGeometry(topo: Topology): CountyGeometry {
  const fc = feature(topo as never, topo.objects.counties as never) as unknown as FeatureCollection;
  const state = feature(topo as never, topo.objects.state as never) as unknown as Feature;
  return {
    counties: fc.features as CountyGeometry['counties'],
    state,
  };
}

export interface Dataset {
  counties: County[];
  byGeoid: Map<string, County>;
  statewide: Statewide;
  geometry: CountyGeometry;
  /** True when either payload is fixture data — drives the standing banner. */
  isFixture: boolean;
}

export async function loadDataset(): Promise<Dataset> {
  const [counties, statewide, topo] = await Promise.all([
    getJson<County[]>('counties.json'),
    getJson<Statewide>('statewide.json'),
    getJson<Topology>('geometry.json'),
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
export async function loadDistricts(): Promise<unknown | null> {
  try {
    return await getJson<unknown>('districts.json');
  } catch (err) {
    if (err instanceof MissingDataError) return null;
    throw err;
  }
}
