/**
 * The data contract — spec §3. These types are the shape export_tool_data.R must
 * satisfy. public/data/*.json are built to them from the analysis repo by
 * scripts/build-county-data.mjs.
 */

/**
 * The four scored domains (config/layers.js DOMAINS).
 *
 * @typedef {'d1' | 'd2' | 'd3' | 'd4'} DomainKey
 */

/**
 * Layers whose value is a windowed enrollment loss rather than a stored score.
 * They recompute from the brush window every time it moves, which is why they
 * have no `*_score` column and go through src/lib/layerValues.js instead. The
 * layers with basis 'window' in config/layers.js (LOSS_LAYERS).
 *
 * @typedef {'loss' | 'child_loss'} LossKey
 */

/**
 * The bivariate work layer: two metrics on one map, red against blue. Not a
 * percentile and not a count — it has two values per county, so it goes through
 * LayerValues.secondary rather than any single ramp.
 *
 * @typedef {'work_both'} BivariateKey
 */

/**
 * @typedef {DomainKey | 'composite' | LossKey | BivariateKey | 'aca_aptc'} LayerKey
 */

/**
 * The views of the map, in place of spec §6.4's layer cards (docs/SPEC-DEVIATIONS.md
 * §D3). A view is one or more layers plus a decision about whether assistance
 * capacity is drawn; see config/layers.js.
 *
 * @typedef {'loss' | 'work' | 'vulnerability' | 'aca' | 'children'} ViewKey
 */

/**
 * @typedef {'rate' | 'count'} Measure
 */
/**
 * How the map draws, as the reader picks it. One story step draws the tile grid
 * instead (StoryStep.mapStyle).
 *
 * @typedef {'geo' | 'density'} MapStyle
 */
/**
 * @typedef {'food_bank' | 'cms_navigator' | 'chw' | 'cpp'} InfraKey
 */

/**
 * @typedef {Object} CountyInfra
 * @property {number | null} food_bank - Reporting Feeding Texas member banks that served at least one
 *   household in the county. null: no reporting bank covers the county, not 0 (INFRA_TYPES.partial).
 * @property {number} cms_navigator - CMS 2025–26 navigator organisations serving the county.
 * @property {number} chw - Certified-CHW range as a band position in statewide meta.chw_bands (0 = none).
 *   NOT a count — see County.chw_band.
 * @property {number} cpp - HHSC Community Partner Program sites at levels 3–4 (application help).
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
 * @property {number[]} snap_children - Monthly enrolled children (under 18), parallel to statewide meta.months.
 *   For the Children view. NOT in the spec's §3.1 contract —
 *   see docs/SPEC-DEVIATIONS.md §A4. Built from HHSC's own county age columns
 *   (under 5 + 5–17), so it is observed, not apportioned.
 * @property {Record<string, number[]>} snap_age - Monthly enrolled per age band, keyed like statewide age_series.
 * @property {number | null} aptc_consumers - ACA Marketplace consumers with an advance premium tax credit at the
 *   latest open enrollment (meta.aca_year). null where CMS suppresses the county.
 * @property {number | null} aptc_per_1k - aptc_consumers per 1,000 residents.
 * @property {CountyInfra} infra - Help listed as serving the county. food_bank is null where no reporting
 *   bank covers the county — NOT the same as 0.
 * @property {string | null} chw_band - The certified-CHW range as DSHS publishes it, e.g. "11–100". null: none.
 * @property {number | null} chw_exact - Exact certified-CHW count, where the report prints one (top five).
 * @property {number} cpp_sites_all - Community Partner Program sites at every level.
 * @property {number | null} foodbank_households - Unique households those banks served over meta.foodbank.period.
 *   null where infra.food_bank is.
 * @property {string[] | null} foodbank_banks - The banks behind infra.food_bank, by full name.
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
 * @typedef {Object} FoodbankMeta - statewide.meta.foodbank, derived by build-county-data.mjs.
 * @property {[string, string]} period - First and last month of the food-bank data, "YYYY-MM".
 * @property {string[]} banks_reporting - Full names of the member banks that have reported.
 * @property {number | null} banks_total - Texas member banks on the roster; null if the roster is absent.
 * @property {number} counties_with_data - Counties at least one reporting bank covers.
 */

/**
 * @typedef {Object} Statewide
 * @property {boolean} [fixture]
 * @property {{ months: string[]; history_months: string[]; policy_start: string; latest: string; texas_population: number; grid: { cols: number; rows: number }; trend_window: [string, string]; foodbank: FoodbankMeta; chw_bands: string[]; generated_from?: string; sources?: string[]; notes?: string[]; }} meta
 * @property {number[]} enrolled
 * @property {(number | null)[]} monthly_change
 * @property {number[]} participation_share
 * @property {AgeBand[]} age_bands - Policy start to latest, steepest loss first.
 * @property {Record<string, number[]>} age_series - Monthly enrolled per band, parallel to meta.months.
 * @property {number[]} [cases] - Monthly SNAP cases (households).
 * @property {{ people: number; households: number }} people_vs_households
 * @property {{ type: string; pctChange: number }[]} county_type_rollup
 * @property {{ method?: string; center: number; limits: { caseload: number; sd: number }[] }} funnel - The policy-window
 *   fit (buildFunnel), for reference and downloads.
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
