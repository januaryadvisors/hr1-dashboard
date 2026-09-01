// Build public/data/geometry.json — spec §3.2.
//
// TopoJSON, quantized, simplified to roughly 40KB. County polygons keyed by geoid,
// plus a state outline object for the hairline border. CRS stays EPSG:4326; the
// projection to Texas Albers happens client-side (src/lib/projection.ts).
//
// The 8MB source geojson is NOT committed — set GEOJSON_SRC to re-run.
// Output IS committed so CI builds standalone.

// mapshaper is CommonJS — no named ESM exports.
import mapshaper from 'mapshaper';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC =
  process.env.GEOJSON_SRC ??
  resolve(ROOT, '../texas-county-choropleth-view/public/tx_counties.geojson');
const OUT = resolve(ROOT, 'public/data/geometry.json');

// keep-shapes stops small counties collapsing at aggressive simplification.
// 3.5% lands near the 40KB target; raise if a county visibly degrades.
const SIMPLIFY = process.env.SIMPLIFY ?? '3.5%';

const cmd = [
  `-i "${SRC}" name=counties`,
  // FIPS -> geoid, "Sherman County" -> "Sherman" (spec §3.1: name without "County").
  `-each 'geoid = String(FIPS), name = String(COUNTY).replace(/ County$/, "")'`,
  `-filter-fields geoid,name`,
  `-simplify ${SIMPLIFY} keep-shapes`,
  // "+" emits the dissolve as an additional layer rather than replacing counties,
  // so both objects share one arc topology instead of duplicating it.
  `-dissolve2 + name=state`,
  `-o "${OUT}" format=topojson quantization=1e4 target=*`,
].join(' ');

console.log(`source:    ${SRC}`);
console.log(`simplify:  ${SIMPLIFY}`);

await mapshaper.runCommands(cmd);

const topo = JSON.parse(readFileSync(OUT, 'utf8'));
const counties = topo.objects.counties.geometries;
const raw = statSync(OUT).size;
const gz = gzipSync(readFileSync(OUT)).length;

// Guard the contract rather than trusting the pipeline.
const missing = counties.filter((g) => !g.properties?.geoid || !g.properties?.name);
if (counties.length !== 254) throw new Error(`expected 254 counties, got ${counties.length}`);
if (missing.length) throw new Error(`${missing.length} counties missing geoid/name`);
if (!topo.objects.state) throw new Error('state outline object missing');

const dupes = new Set();
const seen = new Set();
for (const g of counties) {
  if (seen.has(g.properties.geoid)) dupes.add(g.properties.geoid);
  seen.add(g.properties.geoid);
}
if (dupes.size) throw new Error(`duplicate geoids: ${[...dupes].join(', ')}`);

writeFileSync(OUT, JSON.stringify(topo));

console.log(`counties:  ${counties.length}`);
console.log(`objects:   ${Object.keys(topo.objects).join(', ')}`);
console.log(`size:      ${(raw / 1024).toFixed(1)}KB raw / ${(gz / 1024).toFixed(1)}KB gzipped`);
if (gz > 60 * 1024) console.warn(`WARNING: over the ~40KB gzipped target in §3.2`);
