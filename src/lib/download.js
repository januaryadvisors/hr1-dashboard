/**
 * §1 / §6.1: "CSV/JSON download of whatever the current filter state selects",
 * with "a companion JSON that includes the MOE columns."
 *
 * §10 requires every estimate to ship with its MOE — in the tooltip, in the
 * download, in the table. The CSV carries the columns a spreadsheet user wants;
 * the JSON carries everything including MOEs and provenance.
 *
 * @typedef {import('../data/load').Dataset} Dataset
 */
/**
 * @typedef {import('../state/appState').AppState} AppState
 */
import { countLabelFor, layerBasis, layerByKey } from '../config/layers';
import { buildLayerValues } from './layerValues';

/**
 * @typedef {string | number | boolean | null} CsvValue
 */

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
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

function triggerDownload(filename, mime, body) {
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

export function downloadSelection(data, state) {
  const { counties, statewide } = data;
  const months = statewide.meta.months;
  const i0 = months.indexOf(state.window[0]);
  const i1 = months.indexOf(state.window[1]);
  const def = layerByKey(state.layer);
  /**
   * The layer's values come from the same builder the map uses, so a download
   * cannot disagree with what was on screen — which matters most for the loss
   * layers, whose value only exists relative to the selected window.
   */
  const values = buildLayerValues(counties, state.layer, i0, i1);
  const isWindowLayer = layerBasis(state.layer) === 'window';

  /** MOE exists per domain only; the composite and the loss layers have none. */
  const moeOf = (c) => {
    if (isWindowLayer || state.layer === 'composite') return null;
    const key = `${state.layer}_moe`;
    return c[key] ?? null;
  };

  const rows = counties.map((c) => {
    const start = c.snap_enrolled[i0];
    const end = c.snap_enrolled[i1];
    const childStart = c.snap_children?.[i0] ?? null;
    const childEnd = c.snap_children?.[i1] ?? null;
    return {
      geoid: c.geoid,
      name: c.name,
      pop: c.pop,
      layer: state.layer,
      layer_name: def.formalName,
      layer_value: values.fill.get(c.geoid) ?? null,
      layer_unit: isWindowLayer
        ? 'share of window-start caseload lost'
        : state.layer === 'composite'
          ? 'sum of four percentiles, 0–4'
          : 'percentile within Texas, 0–1',
      layer_moe: moeOf(c),
      cumulative_impact: c.cumulative_impact,
      vulnerability_score: c.vulnerability_score,
      count_metric: isWindowLayer ? countLabelFor(state.layer) : def.countField ?? '',
      count_value: values.count?.get(c.geoid) ?? null,
      snap_enrolled_start: start,
      snap_enrolled_end: end,
      snap_change: end - start,
      snap_children_start: childStart,
      snap_children_end: childEnd,
      snap_children_change: childStart != null && childEnd != null ? childEnd - childStart : null,
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
          sources: data.statewide.meta.sources ?? [],
          notes: [
            // Provenance written by the data build: what is summed, what is null
            // and why (MOEs, unsourced registries).
            ...(data.statewide.meta.notes ?? []),
            def.countField === 'newly_subject_persons'
              ? 'newly_subject_persons is a PUMS-modelled estimate, not a lookup.'
              : null,
            isWindowLayer
              ? 'layer_value is observed enrollment loss over `window`, floored at zero — a county whose caseload grew reads 0. snap_change carries the true signed change.'
              : null,
            'snap_children_* is the county under-18 series (HHSC age bands under 5 + 5–17); not in the build spec §3 contract — see docs/SPEC-DEVIATIONS.md §A4.',
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
