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
 * @property {SnapObserved | null} medicaid - Observed Medicaid enrollment, or null when the file is absent.
 * @property {boolean} hasMedicaid - Whether the Medicaid view has data to draw. False hides the view.
 * @property {boolean} isFixture - True when either payload is fixture data — drives the standing banner.
 */

/**
 * Attach observed Medicaid enrollment to the county records.
 *
 * The Medicaid series is published on its OWN month axis (Feb 2022 – Jan 2026,
 * with seven months HHSC never posted) while every other series on a County is
 * indexed against statewide.meta.months. Aligning here rather than at the point
 * of use means `medicaid_enrolled[i]` and `snap_enrolled[i]` are the same month,
 * so the brush, the loss layers and the tooltip all work on it unmodified.
 *
 * Months outside the Medicaid range, and months HHSC skipped, are null — not
 * zero and not carried forward. A loss layer reading a null endpoint renders
 * the county as no-data, which is the truth.
 */
function attachMedicaid(counties, statewide, medicaid) {
  if (!medicaid?.months?.length) return false;
  const at = new Map(medicaid.months.map((m, i) => [m, i]));
  const axis = statewide.meta.months;

  for (const county of counties) {
    const series = medicaid.counties?.[county.geoid];
    if (!series) continue;
    county.medicaid_enrolled = axis.map((m) => {
      const i = at.get(m);
      return i == null ? null : series.caseload[i];
    });
  }
  return true;
}

export async function loadDataset() {
  const [counties, statewide, topo, medicaid] = await Promise.all([
    getJson('counties.json'),
    getJson('statewide.json'),
    getJson('geometry.json'),
    // Optional by design: the Medicaid view hides itself if the file is absent.
    getJson('medicaid-observed.json').catch(() => null),
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

  const hasMedicaid = attachMedicaid(counties, statewide, medicaid);

  return {
    counties,
    byGeoid,
    statewide,
    geometry,
    medicaid: hasMedicaid ? medicaid : null,
    hasMedicaid,
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
