/**
 * The data contract — spec §3. These types are the shape export_tool_data.R must
 * satisfy. public/data/*.json are built to them from the analysis repo by
 * scripts/build-county-data.mjs.
 */

/**
 * Four scored domains plus the un-sourced Children layer and the composite.
 *
 * @typedef {'d1' | 'd2' | 'd3' | 'd4' | 'd5'} DomainKey
 */

/**
 * Layers whose value is a windowed enrollment loss rather than a stored score.
 * They recompute from the brush window every time it moves, which is why they
 * have no `*_score` column and go through src/lib/layerValues.ts instead.
 *
 * @typedef {'loss' | 'child_loss' | 'medicaid_loss'} LossKey
 */

/**
 * The bivariate work layer: two metrics on one map, red against blue. Not a
 * percentile and not a count — it has two values per county, so it goes through
 * LayerValues.secondary rather than any single ramp.
 *
 * @typedef {'work_both'} BivariateKey
 */

/**
 * @typedef {DomainKey | 'composite' | LossKey | BivariateKey} LayerKey
 */

/**
 * The four views of the map (spec §6.4 reworked 2026-09-10 on client direction —
 * six layer cards became four views). A view is one or two layers plus a
 * decision about whether assistance capacity is drawn; see config/layers.ts.
 *
 * @typedef {'loss' | 'work' | 'vulnerability' | 'medicaid' | 'children'} ViewKey
 */

/**
 * @typedef {'rate' | 'count'} Measure
 */
/**
 * How the map draws. 'grid' — the area cartogram — was removed on 2026-09-11;
 * see the note in <CountyMap>.
 *
 * @typedef {'geo' | 'density'} MapStyle
 */
/**
 * @typedef {'food_bank' | 'cms_navigator' | 'chw' | 'counselor'} InfraKey
 */

/**
 * @typedef {Object} CountyInfra
 * @property {number | null} food_bank - null: Feeding Texas registry not supplied yet.
 * @property {number} cms_navigator - CMS 2025–26 navigator organisations serving the county.
 * @property {number} chw - DSHS CHW networks naming the county (Dec 2021 directory).
 * @property {number | null} counselor - null: CMS assister locator not pulled.
 */

/**
 * One of the 254 records in counties.json (§3.1).
 *
 * @typedef {Object} County
 * @property {string} geoid
 * @property {string} name
 * @property {number} pop
 * @property {number | null} d1_score
 * @property {number | null} d2_score
 * @property {number | null} d3_score
 * @property {number | null} d4_score
 * @property {number | null} d5_score
 * @property {number | null} d1_tier
 * @property {number | null} d2_tier
 * @property {number | null} d3_tier
 * @property {number | null} d4_tier
 * @property {number | null} d5_tier
 * @property {number | null} d1_n
 * @property {number | null} d2_n
 * @property {number | null} d3_n
 * @property {number | null} d4_n
 * @property {number | null} d5_n
 * @property {number | null} d1_moe
 * @property {number | null} d2_moe
 * @property {number | null} d3_moe
 * @property {number | null} d4_moe
 * @property {number | null} d5_moe
 * @property {number} vulnerability_score - Sum of the four domain percentiles, 0–4.
 * @property {number} cumulative_impact - Domains at Q5, 0–4. Overlay and filter only, never a fill (§3.1).
 * @property {number} newly_subject_persons - D1 count basis. PUMS-modelled — flag wherever shown (§10).
 * @property {number} noncit_snap_persons - D2 count basis.
 * @property {number[]} snap_enrolled - Monthly enrolled individuals, parallel to statewide meta.months.
 * @property {(number|null)[]} [medicaid_enrolled] - Monthly Medicaid enrollment, aligned onto statewide meta.months.
 *   Observed HHSC data on its own month axis, attached at load time from
 *   medicaid-observed.json rather than shipped in counties.json. null in
 *   any month HHSC did not publish, and absent entirely if the file 404s.
 * @property {number[]} snap_children - Monthly enrolled children (under 18), parallel to statewide meta.months.
 *   Added 2026-09-10 for the Children view. NOT in the spec's §3.1 contract —
 *   see docs/SPEC-DEVIATIONS.md §A4. Built from HHSC's own county age columns
 *   (under 5 + 5–17), so it is observed, not apportioned.
 * @property {CountyInfra} infra - Organisations listed as serving the county. food_bank and counselor are
 *   null (registry not sourced), which is NOT the same as 0 — see INFRA_TYPES.
 * @property {boolean} is_gap - Top-quintile vulnerability and zero CMS navigators. The spec's food-bank clause
 *   waits on the registry. Precomputed.
 * @property {boolean} small_denominator - pop < 10,000. Drives dimming in rate view (§6.5).
 * @property {[number, number]} centroid - [lon, lat]. See docs/SPEC-DEVIATIONS.md.
 * @property {{ r: number; c: number }} grid - Tile-cartogram cell. Precomputed, never solved at runtime.
 * @property {boolean} [fixture] - Present only on fixture data.
 */

/**
 * @typedef {Object} AgeBand
 * @property {string} band
 * @property {number} july_enrolled
 * @property {number} latest_enrolled
 * @property {number} pct_change
 */

/**
 * statewide.json (§3.3). Everything the Insights page and brush need, precomputed.
 *
 * @typedef {Object} Statewide
 * @property {boolean} [fixture]
 * @property {{ months: string[]; history_months: string[]; policy_start: string; latest: string; texas_population: number; grid: { cols: number; rows: number }; generated_from?: string; sources?: string[]; notes?: string[]; }} meta
 * @property {number[]} enrolled
 * @property {(number | null)[]} monthly_change
 * @property {number[]} participation_share
 * @property {AgeBand[]} age_bands - Policy start to latest, steepest loss first.
 * @property {Record<string, number[]>} [age_series] - Monthly enrolled per band, parallel to meta.months.
 * @property {number[]} [cases] - Monthly SNAP cases (households).
 * @property {{ people: number; households: number }} people_vs_households
 * @property {{ type: string; pctChange: number }[]} county_type_rollup
 * @property {{ method?: string; center: number; limits: { caseload: number; sd: number }[] }} funnel - The policy-window
 *   fit, for reference and downloads. The Insights page refits per window (buildFunnel).
 */

/**
 * Minimal TopoJSON shape we consume (§3.2).
 *
 * @typedef {Object} Topology
 * @property {'Topology'} type
 * @property {{ counties: unknown; state: unknown; }} objects
 * @property {unknown} arcs
 * @property {unknown} [transform]
 */
