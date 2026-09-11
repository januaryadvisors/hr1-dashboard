/**
 * The whole app state — spec §4. One reducer, ten fields, every one except
 * `hovered` mirrored to a query param so any view is a shareable link.
 *
 * NOTE: there is deliberately no `view` field. The four views are a function of
 * `layer` (config/layers.ts viewForLayer), so the view cannot drift out of sync
 * with the layer being drawn and old `?layer=` links keep working.
 *
 * Spec §2 is explicit: no Redux, no Zustand.
 */
import { VIEWS } from '../config/layers';
import type { InfraKey, LayerKey, MapStyle, Measure } from '../types';

export interface AppState {
  measure: Measure;
  layer: LayerKey;
  style: MapStyle;
  /** [startMonth, endMonth], inclusive, as "YYYY-MM". Set by the brush. */
  window: [string, string];
  infra: InfraKey[];
  overlayQ5: boolean;
  overlayGap: boolean;
  /**
   * The county every Insights chart reads from, or null for statewide.
   *
   * Separate from `hovered` on purpose: `hovered` is transient and pointer-
   * driven, this is a deliberate, shareable selection. It is what makes
   * `/insights/decline?county=48201` a county stat page someone can send to a
   * legislator.
   */
  scope: string | null;
  /**
   * Whether the advanced controls are revealed.
   *
   * Measure, the infrastructure picker and the overlays used to occupy most of
   * the right rail before anyone had read the map. Collapsed by default on
   * client direction 2026-09-10; mirrored to the URL so a link shares the state
   * the sender was actually looking at.
   */
  advanced: boolean;
  /** Transient. Never in the URL. */
  hovered: string | null;
  /**
   * How `hovered` was set. The tooltip anchors to the cursor for 'pointer' and
   * to the county's own position on the map for 'external' (search, rank list) —
   * otherwise a search result opens its panel next to the search box, nowhere
   * near the county it highlighted.
   */
  hoverOrigin: 'pointer' | 'external';
}

export type Action =
  | { type: 'setMeasure'; measure: Measure }
  | { type: 'setLayer'; layer: LayerKey }
  | { type: 'setStyle'; style: MapStyle }
  | { type: 'setWindow'; window: [string, string] }
  | { type: 'toggleInfra'; key: InfraKey }
  | { type: 'setInfra'; keys: InfraKey[] }
  | { type: 'toggleOverlayQ5' }
  | { type: 'toggleOverlayGap' }
  | { type: 'toggleAdvanced' }
  | { type: 'setAdvanced'; advanced: boolean }
  | { type: 'setScope'; geoid: string | null }
  | { type: 'hover'; geoid: string | null; origin?: 'pointer' | 'external' };

export const ALL_INFRA: InfraKey[] = ['food_bank', 'cms_navigator', 'chw', 'counselor'];

export function initialState(policyStart: string, latest: string): AppState {
  return {
    measure: 'rate',
    /**
     * §6.4 made D1 the default. Superseded 2026-09-10: the map opens on the
     * Benefits-lost view, which is observed enrollment change rather than a
     * modelled exposure percentile — the first thing a reader sees is now a
     * fact, not an index.
     */
    layer: 'loss',
    // §6.5: Geo is the default style.
    style: 'geo',
    // §6.2: "Since H.R. 1" is the default preset.
    window: [policyStart, latest],
    infra: [...ALL_INFRA],
    overlayQ5: false,
    overlayGap: false,
    // Insights opens on the statewide story; a county is opt-in.
    scope: null,
    advanced: false,
    hovered: null,
    hoverOrigin: 'pointer',
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setMeasure':
      return { ...state, measure: action.measure };
    case 'setLayer':
      return { ...state, layer: action.layer };
    case 'setStyle':
      return { ...state, style: action.style };
    case 'setWindow':
      return { ...state, window: action.window };
    case 'toggleInfra': {
      const has = state.infra.includes(action.key);
      return {
        ...state,
        // Keep ALL_INFRA order so the legend and the checkbox list never disagree.
        infra: ALL_INFRA.filter((k) => (k === action.key ? !has : state.infra.includes(k))),
      };
    }
    case 'setInfra':
      return { ...state, infra: ALL_INFRA.filter((k) => action.keys.includes(k)) };
    case 'toggleOverlayQ5':
      return { ...state, overlayQ5: !state.overlayQ5 };
    case 'toggleOverlayGap':
      return { ...state, overlayGap: !state.overlayGap };
    case 'setScope':
      return state.scope === action.geoid ? state : { ...state, scope: action.geoid };
    case 'toggleAdvanced':
      return { ...state, advanced: !state.advanced };
    case 'setAdvanced':
      return state.advanced === action.advanced ? state : { ...state, advanced: action.advanced };
    case 'hover': {
      const origin = action.origin ?? 'pointer';
      if (state.hovered === action.geoid && state.hoverOrigin === origin) return state;
      return { ...state, hovered: action.geoid, hoverOrigin: origin };
    }
    default:
      return state;
  }
}

/**
 * §6.5: "hovered ?? pinned is the county every readout reads from. One selector,
 * used everywhere."
 *
 * Click-to-pin was removed on 2026-09-01 to be reworked, so for now this is just
 * `hovered`. The selector stays — every readout goes through it, so restoring a
 * persistent selection means changing this one line, not hunting call sites.
 */
export const activeGeoid = (state: AppState): string | null => state.hovered;

// ---------------------------------------------------------------- URL mirroring

const MEASURES: Measure[] = ['rate', 'count'];
const STYLES: MapStyle[] = ['geo', 'grid', 'density'];
/**
 * The layers a view can actually put on screen.
 *
 * Deliberately NOT every key in `LayerKey`. d2 and d4 still score and still
 * appear in every tooltip, but the four-view rework left them without a view of
 * their own — and accepting `?layer=d2` would highlight the Benefits-lost card
 * while drawing a citizenship map, which is a page contradicting itself. Such a
 * link degrades to the default view instead, the same way any other
 * unrecognised param does.
 */
const LAYER_KEYS: LayerKey[] = VIEWS.flatMap((v) => v.metrics);
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Serialise to query params, omitting anything still at its default. */
export function toSearchParams(state: AppState, defaults: AppState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.measure !== defaults.measure) p.set('measure', state.measure);
  if (state.layer !== defaults.layer) p.set('layer', state.layer);
  if (state.style !== defaults.style) p.set('style', state.style);
  if (state.window[0] !== defaults.window[0] || state.window[1] !== defaults.window[1]) {
    p.set('from', state.window[0]);
    p.set('to', state.window[1]);
  }
  if (
    state.infra.length !== defaults.infra.length ||
    state.infra.some((k) => !defaults.infra.includes(k))
  ) {
    // An empty selection is meaningful, so encode it as "none" rather than
    // dropping the param and silently reverting to all-on.
    p.set('infra', state.infra.length ? state.infra.join(',') : 'none');
  }
  if (state.overlayQ5) p.set('q5', '1');
  if (state.overlayGap) p.set('gap', '1');
  if (state.scope) p.set('county', state.scope);
  if (state.advanced !== defaults.advanced) p.set('adv', state.advanced ? '1' : '0');
  return p;
}

/**
 * Parse query params over the defaults. Anything unrecognised is ignored rather
 * than throwing — a hand-edited or truncated link should still open.
 */
export function fromSearchParams(
  params: URLSearchParams,
  defaults: AppState,
  validMonths: string[],
  /**
   * Every geoid in the dataset. A `?county=` naming a county that does not
   * exist degrades to statewide rather than leaving the page scoped to nothing
   * — the same treatment every other unrecognised param gets.
   */
  validGeoids?: Set<string>,
): AppState {
  const state: AppState = { ...defaults, infra: [...defaults.infra] };

  const measure = params.get('measure');
  if (measure && MEASURES.includes(measure as Measure)) state.measure = measure as Measure;

  const layer = params.get('layer');
  if (layer && LAYER_KEYS.includes(layer as LayerKey)) state.layer = layer as LayerKey;

  const style = params.get('style');
  if (style && STYLES.includes(style as MapStyle)) state.style = style as MapStyle;

  const from = params.get('from');
  const to = params.get('to');
  if (from && to && MONTH_RE.test(from) && MONTH_RE.test(to)) {
    const i = validMonths.indexOf(from);
    const j = validMonths.indexOf(to);
    // Both endpoints must exist in the series and be in order.
    if (i !== -1 && j !== -1 && i <= j) state.window = [from, to];
  }

  const infra = params.get('infra');
  if (infra === 'none') {
    state.infra = [];
  } else if (infra) {
    const keys = infra.split(',').filter((k): k is InfraKey => ALL_INFRA.includes(k as InfraKey));
    state.infra = ALL_INFRA.filter((k) => keys.includes(k));
  }

  state.overlayQ5 = params.get('q5') === '1';
  state.overlayGap = params.get('gap') === '1';

  const adv = params.get('adv');
  if (adv === '1' || adv === '0') state.advanced = adv === '1';

  const county = params.get('county');
  if (county && (!validGeoids || validGeoids.has(county))) state.scope = county;

  return state;
}
