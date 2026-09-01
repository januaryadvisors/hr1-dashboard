/**
 * §1 / §6.1: "CSV/JSON download of whatever the current filter state selects",
 * with "a companion JSON that includes the MOE columns."
 *
 * §10 requires every estimate to ship with its MOE — in the tooltip, in the
 * download, in the table. The CSV carries the columns a spreadsheet user wants;
 * the JSON carries everything including MOEs and provenance.
 */
import type { Dataset } from '../data/load';
import type { AppState } from '../state/appState';
import { layerByKey, scoreField } from '../config/layers';

export type CsvValue = string | number | boolean | null;

export function toCsv(rows: Record<string, CsvValue>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: CsvValue) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => esc(row[c])).join(','));
  }
  return lines.join('\n');
}

function triggerDownload(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadSelection(data: Dataset, state: AppState) {
  const { counties, statewide } = data;
  const months = statewide.meta.months;
  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);
  const def = layerByKey(state.layer);
  const field = scoreField(state.layer);

  const rows = counties.map((c) => {
    const start = c.snap_enrolled[i0];
    const end = c.snap_enrolled[i1];
    return {
      geoid: c.geoid,
      name: c.name,
      pop: c.pop,
      layer: state.layer,
      layer_name: def.formalName,
      layer_value: (c[field] as number) ?? null,
      layer_moe: state.layer === 'composite' ? null : ((c[`${state.layer}_moe`] as number) ?? null),
      cumulative_impact: c.cumulative_impact,
      vulnerability_score: c.vulnerability_score,
      count_metric: def.countField ?? '',
      count_value: def.countField ? ((c[def.countField] as number) ?? null) : null,
      snap_enrolled_start: start,
      snap_enrolled_end: end,
      snap_change: end - start,
      food_bank_sites: c.infra.food_bank,
      cms_navigators: c.infra.cms_navigator,
      chw_networks: c.infra.chw,
      application_counselors: c.infra.counselor,
      is_gap: c.is_gap,
      small_denominator: c.small_denominator,
    };
  });

  const stamp = `${state.window[0]}_${state.window[1]}`;
  triggerDownload(`tx-snap-hr1-${state.layer}-${stamp}.csv`, 'text/csv;charset=utf-8', toCsv(rows));

  triggerDownload(
    `tx-snap-hr1-${state.layer}-${stamp}.json`,
    'application/json',
    JSON.stringify(
      {
        meta: {
          layer: state.layer,
          layer_name: def.formalName,
          measure: state.measure,
          style: state.style,
          window: state.window,
          components: def.components,
          fixture: data.isFixture,
          notes: [
            'Every estimate ships with its margin of error.',
            def.countField === 'newly_subject_persons'
              ? 'newly_subject_persons is a PUMS-modelled estimate, not a lookup.'
              : null,
            data.isFixture
              ? 'FIXTURE DATA — synthetic values generated against the build spec §3 contract.'
              : null,
          ].filter(Boolean),
        },
        counties: rows,
      },
      null,
      2,
    ),
  );
}
