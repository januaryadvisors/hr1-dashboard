/**
 * "Download data": a CSV of what the map currently shows, a companion JSON with
 * everything, including margins of error and provenance, and a long CSV of
 * every county's monthly SNAP figures over the full history.
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

/** HHSC age band → CSV column, in the order the bands run. */
const AGE_COLUMNS = [
  ['Under 5', 'snap_age_under_5'],
  ['5–17', 'snap_age_5_17'],
  ['18–59', 'snap_age_18_59'],
  ['60–64', 'snap_age_60_64'],
  ['65+', 'snap_age_65_plus'],
];

/**
 * One row per county per month, every month the data has — long rather than
 * wide, so it pivots or filters in a spreadsheet without reshaping. Values are
 * HHSC's monthly figures as loaded; nothing is smoothed or estimated.
 *
 * @param {Dataset['counties']} counties
 * @param {string[]} months - statewide meta.months; each county series is parallel to it.
 * @param {[string, string]} window - Months inside it are flagged `in_selected_period`.
 * @returns {Record<string, CsvValue>[]}
 */
export function monthlyRows(counties, months, window) {
  const rows = [];
  for (const c of counties) {
    months.forEach((month, i) => {
      const row = {
        geoid: c.geoid,
        name: c.name,
        month,
        in_selected_period: month >= window[0] && month <= window[1],
        snap_enrolled: c.snap_enrolled?.[i] ?? null,
        snap_children: c.snap_children?.[i] ?? null,
      };
      for (const [band, col] of AGE_COLUMNS) row[col] = c.snap_age?.[band]?.[i] ?? null;
      row.snap_benefits_paid = c.snap_payments?.[i] ?? null;
      rows.push(row);
    });
  }
  return rows;
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
        : def.rateLabel ??
          (state.layer === 'composite' ? 'sum of four percentiles, 0–4' : 'percentile within Texas, 0–1'),
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
      food_banks_serving: c.infra.food_bank,
      food_bank_households_served: c.foodbank_households,
      cms_navigators: c.infra.cms_navigator,
      community_partner_sites_l3_l4: c.infra.cpp,
      community_partner_sites_all: c.cpp_sites_all,
      certified_chws_range: c.chw_band,
      certified_chws_exact: c.chw_exact,
      is_gap: c.is_gap,
      small_denominator: c.small_denominator,
    };
  });

  const stamp = `${state.window[0]}_${state.window[1]}`;
  triggerDownload(`tx-snap-hr1-${state.layer}-${stamp}.csv`, 'text/csv;charset=utf-8', toCsv(rows));

  // The full history, not just the window: the window's months are flagged in it.
  triggerDownload(
    `tx-snap-hr1-county-monthly-${months[0]}_${months[months.length - 1]}.csv`,
    'text/csv;charset=utf-8',
    toCsv(monthlyRows(counties, months, state.window)),
  );

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
            'snap_children_* is the county under-18 series (HHSC age bands under 5 + 5–17).',
            'The county-monthly CSV has one row per county per month for every month loaded: people enrolled, children, the five HHSC age bands, and SNAP benefits paid to the county\'s households (whole dollars). in_selected_period marks the months inside `window`.',
            data.isFixture
              ? 'FIXTURE DATA — synthetic test values, not the real export.'
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
