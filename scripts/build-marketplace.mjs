// build-marketplace.mjs — public/data/marketplace.json from the analysis repo.
//
// The story's last chapter (ACA Marketplace) needs two statewide series, both
// already cleaned by feeding-texas-hr1/rscripts/collect_marketplace.R:
//
//   marketplace_effectuated_statewide.parquet
//     CMS Health Insurance Exchanges Monthly Effectuated Enrollment, Texas,
//     one row per month from Jan 2016. Effectuated = a plan the person has
//     paid for and that is active.
//   marketplace_county.parquet
//     CMS OEP County-Level Public Use Files, 2021–2026, one row per county
//     per year. Only plan_selections is used here, summed to the state.
//
// The "never paid" share is analyze_marketplace_aptc.R's gap, reproduced
// exactly: (OEP plan selections − February effectuated) / plan selections.
// Both inputs are the same numbers that script charts, so the two agree.
//
// Usage:  npm run build:marketplace   (FT_DATA overrides the input folder)

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FT_DATA = resolve(ROOT, process.env.FT_DATA ?? '../feeding-texas-hr1/data-clean');
const OUT = resolve(ROOT, 'public/data/marketplace.json');

const read = async (name) =>
  parquetReadObjects({ file: await asyncBufferFromFile(resolve(FT_DATA, name)), compressors });

const pad = (m) => String(m).padStart(2, '0');

const eff = (await read('marketplace_effectuated_statewide.parquet'))
  .map((r) => ({ month: `${r.year}-${pad(r.month)}`, value: Number(r.effectuated_enr) }))
  .sort((a, b) => a.month.localeCompare(b.month));

const selections = new Map();
for (const r of await read('marketplace_county.parquet')) {
  const y = Number(r.year);
  selections.set(y, (selections.get(y) ?? 0) + (Number(r.plan_selections) || 0));
}

const febOf = (y) => eff.find((r) => r.month === `${y}-02`)?.value ?? null;
const oep = [...selections.keys()]
  .sort((a, b) => a - b)
  .map((year) => {
    const sel = selections.get(year);
    const feb = febOf(year);
    return {
      year,
      plan_selections: sel,
      feb_effectuated: feb,
      not_effectuated_share: feb == null ? null : (sel - feb) / sel,
    };
  });

const out = {
  source: 'CMS Health Insurance Exchanges Monthly Effectuated Enrollment; CMS OEP County-Level Public Use Files',
  source_url: 'https://data.cms.gov/marketplace/health-insurance-exchanges-monthly-effectuated-enrollment',
  oep_source_url: 'https://www.cms.gov/data-research/statistics-trends-and-reports/marketplace-products',
  generated: new Date().toISOString().slice(0, 10),
  effectuated: { months: eff.map((r) => r.month), values: eff.map((r) => r.value) },
  oep,
};

writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(
  `marketplace.json: ${eff.length} months (${eff[0].month} → ${eff.at(-1).month}), ` +
    `OEP ${oep[0].year}–${oep.at(-1).year}`,
);
