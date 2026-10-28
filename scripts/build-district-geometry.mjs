// Build public/data/district-geometry.json — the outlines the Insights map
// draws for a district scope.
//
// TopoJSON, quantized and simplified like geometry.json, one object per chamber
// (txhouse, txsenate, ushouse). Each district's geoid is the district-counts.json
// key ("txhouse-133"), so the map joins the two without translation. CRS stays
// EPSG:4326; the page projects with the same Texas Albers as the county map.
//
// Source: the analysis repo's tool-data/boundaries_*.geojson, which are the
// plans district-counts.json is built on (PlanH2316, PlanS2168, PlanC2333).

// mapshaper is CommonJS — no named ESM exports.
import mapshaper from 'mapshaper';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { FT_DATA, ROOT } from './lib/paths.mjs';

const OUT = resolve(ROOT, 'public/data/district-geometry.json');
const TOOL_DATA = resolve(FT_DATA, '../tool-data');

/** [object name in the output, source file, district count]. */
const CHAMBERS = [
  ['txhouse', 'boundaries_tx_house.geojson', 150],
  ['txsenate', 'boundaries_tx_senate.geojson', 31],
  ['ushouse', 'boundaries_us_house.geojson', 38],
];

// A district map is read at a few hundred pixels wide; this is plenty.
const SIMPLIFY = process.env.SIMPLIFY ?? '4%';

const cmd = [
  `-i ${CHAMBERS.map(([, file]) => `"${resolve(TOOL_DATA, file)}"`).join(' ')} combine-files`,
  `-rename-layers ${CHAMBERS.map(([name]) => name).join(',')}`,
  ...CHAMBERS.map(([name]) => `-each 'geoid = "${name}-" + Number(geoid)' target=${name}`),
  `-simplify ${SIMPLIFY} keep-shapes target=*`,
  `-o "${OUT}" format=topojson quantization=1e4 target=*`,
].join(' ');

await mapshaper.runCommands(cmd);

const topo = JSON.parse(readFileSync(OUT, 'utf8'));
for (const [name, , expected] of CHAMBERS) {
  const n = topo.objects[name]?.geometries.length;
  if (n !== expected) throw new Error(`${name}: expected ${expected} districts, got ${n}`);
}
writeFileSync(OUT, JSON.stringify(topo));

const gz = gzipSync(readFileSync(OUT)).length;
console.log(`objects:   ${Object.keys(topo.objects).join(', ')}`);
console.log(`size:      ${(gz / 1024).toFixed(1)}KB gzipped`);
