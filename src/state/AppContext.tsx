/**
 * One context, one reducer (§2, §4). Holds the dataset, the app state, and the
 * shared projection — created once so every panel registers exactly (§2).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadDataset, type Dataset } from '../data/load';
import { createProjection, type Projection } from '../lib/projection';
import {
  dougenikCartogram,
  ringsToPath,
  type CartogramRegion,
  type Ring,
} from '../lib/cartogram';
import {
  fromSearchParams,
  initialState,
  reducer,
  toSearchParams,
  type Action,
  type AppState,
} from './appState';

interface AppContextValue {
  data: Dataset;
  projection: Projection;
  /** Population cartogram paths by geoid. Computed once — see below. */
  cartogram: Map<string, string>;
  state: AppState;
  defaults: AppState;
  dispatch: (action: Action) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; data: Dataset };

export function AppProvider({
  children,
  renderLoading,
  renderError,
}: {
  children: ReactNode;
  renderLoading: () => ReactNode;
  renderError: (error: Error) => ReactNode;
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((data) => !cancelled && setLoad({ status: 'ready', data }))
      .catch((error: Error) => !cancelled && setLoad({ status: 'error', error }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.status === 'loading') return <>{renderLoading()}</>;
  if (load.status === 'error') return <>{renderError(load.error)}</>;
  return <Ready data={load.data}>{children}</Ready>;
}

/**
 * Split out so the reducer can be seeded from the loaded data (the default window
 * depends on the statewide series) without a second render pass.
 */
function Ready({ data, children }: { data: Dataset; children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const months = data.statewide.meta.months;
  const defaults = useMemo(
    () => initialState(data.statewide.meta.policy_start, data.statewide.meta.latest),
    [data.statewide.meta.policy_start, data.statewide.meta.latest],
  );

  // Seed from the URL so a shared link opens in the state it encodes (§4).
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => fromSearchParams(new URLSearchParams(location.search), defaults, months),
  );

  const projection = useMemo(() => createProjection(data.geometry.state), [data.geometry.state]);

  /**
   * The population cartogram depends only on geometry and population — never on
   * the active layer or measure — so it is computed here, once, rather than
   * inside <CountyMap>, which renders six times per page (hero + five
   * thumbnails).
   */
  const cartogram = useMemo(() => {
    const regions: CartogramRegion[] = [];
    for (const f of data.geometry.counties) {
      const g = f.geometry;
      // Outer rings only. Treating a hole as another ring would inflate the
      // measured area, and Texas counties have none at this simplification.
      const polys: number[][][] =
        g.type === 'Polygon'
          ? [(g.coordinates as number[][][])[0]]
          : g.type === 'MultiPolygon'
            ? (g.coordinates as number[][][][]).map((poly) => poly[0])
            : [];

      const rings: Ring[] = [];
      for (const ring of polys) {
        const projected: Ring = [];
        for (const coord of ring) {
          const xy = projection.project([coord[0], coord[1]]);
          if (xy) projected.push([xy[0], xy[1]]);
        }
        if (projected.length >= 3) rings.push(projected);
      }
      if (rings.length) regions.push({ id: f.properties.geoid, rings });
    }

    const values = new Map(data.counties.map((c) => [c.geoid, c.pop]));
    const { regions: out } = dougenikCartogram(regions, values, { iterations: 4, blend: 0.75 });
    return new Map(out.map((r) => [r.id, ringsToPath(r.rings)]));
  }, [data.geometry.counties, data.counties, projection]);

  // Mirror state → URL. replace, not push, so the back button steps through
  // pages rather than through every hover-free control change.
  const lastSearch = useRef(location.search);
  useEffect(() => {
    const next = toSearchParams(state, defaults).toString();
    const current = new URLSearchParams(location.search).toString();
    if (next === current) return;
    lastSearch.current = `?${next}`;
    navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true });
  }, [state, defaults, location.pathname, location.search, navigate]);

  const value = useMemo(
    () => ({ data, projection, cartogram, state, defaults, dispatch }),
    [data, projection, cartogram, state, defaults],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
