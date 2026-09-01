/**
 * The data contract — spec §3. These types are the shape export_tool_data.R must
 * satisfy. public/data/*.json are fixtures matching them (see scripts/).
 */

/** Four scored domains plus the un-sourced Children layer and the composite. */
export type DomainKey = 'd1' | 'd2' | 'd3' | 'd4' | 'd5';
export type LayerKey = DomainKey | 'composite';

export type Measure = 'rate' | 'count';
export type MapStyle = 'geo' | 'grid' | 'density';
export type InfraKey = 'food_bank' | 'cms_navigator' | 'chw' | 'counselor';

export interface CountyInfra {
  food_bank: number;
  cms_navigator: number;
  chw: number;
  counselor: number;
}

/** One of the 254 records in counties.json (§3.1). */
export interface County {
  geoid: string;
  name: string;
  pop: number;

  d1_score: number | null;
  d2_score: number | null;
  d3_score: number | null;
  d4_score: number | null;
  d5_score: number | null;

  d1_tier: number | null;
  d2_tier: number | null;
  d3_tier: number | null;
  d4_tier: number | null;
  d5_tier: number | null;

  d1_n: number | null;
  d2_n: number | null;
  d3_n: number | null;
  d4_n: number | null;
  d5_n: number | null;

  d1_moe: number | null;
  d2_moe: number | null;
  d3_moe: number | null;
  d4_moe: number | null;
  d5_moe: number | null;

  /** Sum of the four domain percentiles, 0–4. */
  vulnerability_score: number;
  /** Domains at Q5, 0–4. Overlay and filter only, never a fill (§3.1). */
  cumulative_impact: number;

  /** D1 count basis. PUMS-modelled — flag wherever shown (§10). */
  newly_subject_persons: number;
  /** D2 count basis. */
  noncit_snap_persons: number;

  /** Monthly enrolled individuals, parallel to statewide meta.months. */
  snap_enrolled: number[];

  infra: CountyInfra;
  /** Top-quintile vulnerability, zero food banks, zero navigators. Precomputed. */
  is_gap: boolean;
  /** pop < 10,000. Drives dimming in rate view (§6.5). */
  small_denominator: boolean;
  /** [lon, lat]. See docs/SPEC-DEVIATIONS.md. */
  centroid: [number, number];
  /** Tile-cartogram cell. Precomputed, never solved at runtime. */
  grid: { r: number; c: number };

  /** Present only on fixture data. */
  fixture?: boolean;
}

export interface AgeBand {
  band: string;
  july_enrolled: number;
  latest_enrolled: number;
  pct_change: number;
}

/** statewide.json (§3.3). Everything the Insights page and brush need, precomputed. */
export interface Statewide {
  fixture?: boolean;
  meta: {
    months: string[];
    history_months: string[];
    policy_start: string;
    latest: string;
    texas_population: number;
    grid: { cols: number; rows: number };
    generated_from?: string;
    seed?: number;
  };
  enrolled: number[];
  monthly_change: (number | null)[];
  participation_share: number[];
  age_bands: AgeBand[];
  people_vs_households: { people: number; households: number };
  county_type_rollup: { type: string; pctChange: number }[];
  funnel: { center: number; limits: { caseload: number; sd: number }[] };
}

/** Minimal TopoJSON shape we consume (§3.2). */
export interface Topology {
  type: 'Topology';
  objects: {
    counties: unknown;
    state: unknown;
  };
  arcs: unknown;
  transform?: unknown;
}
