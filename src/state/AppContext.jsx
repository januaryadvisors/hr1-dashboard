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
  useState,

} from 'react';
/**
 * @typedef {import('react').ReactNode} ReactNode
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { loadDataset } from '../data/load';
/**
 * @typedef {import('../data/load').Dataset} Dataset
 */
import { createProjection } from '../lib/projection';
/**
 * @typedef {import('../lib/projection').Projection} Projection
 */
/**
 * @typedef {import('../lib/cartogram').Ring} Ring
 */
import { projectRings } from '../lib/mapGeometry';
import {
  fromSearchParams,
  initialState,
  reducer,
  toSearchParams,

} from './appState';
/**
 * @typedef {import('./appState').Action} Action
 * @typedef {import('./appState').AppState} AppState
 */

/**
 * @typedef {Object} AppContextValue
 * @property {Dataset} data
 * @property {Projection} projection
 * @property {Map<string, Ring[]>} baseRings - Projected outer rings per county — the base every render mode starts from.
 * @property {string} statePath - The true state outline, drawn in every style.
 * @property {AppState} state
 * @property {AppState} defaults
 * @property {(action: Action) => void} dispatch
 */

const AppContext = createContext(null);

/**
 * @typedef {| { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: Dataset }} LoadState
 */

export function AppProvider({
  children,
  renderLoading,
  renderError,
}) {
  const [load, setLoad] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((data) => !cancelled && setLoad({ status: 'ready', data }))
      .catch((error) => !cancelled && setLoad({ status: 'error', error }));
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
function Ready({ data, children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const months = data.statewide.meta.months;
  const defaults = useMemo(
    () => initialState(data.statewide.meta.policy_start, data.statewide.meta.latest),
    [data.statewide.meta.policy_start, data.statewide.meta.latest],
  );

  // Seed from the URL so a shared link opens in the state it encodes (§4).
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    fromSearchParams(
      new URLSearchParams(location.search),
      defaults,
      months,
      new Set([...data.byGeoid.keys(), ...(data.districtCounts?.byId.keys() ?? [])]),
    ),
  );

  const projection = useMemo(() => createProjection(data.geometry.state), [data.geometry.state]);

  /**
   * Projected geometry, built once. Path strings and the cartogram are derived
   * per render mode in MapPage — see src/lib/mapGeometry.ts.
   */
  const baseRings = useMemo(
    () => projectRings(data.geometry.counties, projection),
    [data.geometry.counties, projection],
  );

  const statePath = useMemo(
    () => projection.path(data.geometry.state) ?? '',
    [projection, data.geometry.state],
  );

  // Mirror state → URL. replace, not push, so the back button steps through
  // pages rather than through every control change.
  useEffect(() => {
    const next = toSearchParams(state, defaults).toString();
    const current = new URLSearchParams(location.search).toString();
    if (next === current) return;
    navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true });
  }, [state, defaults, location.pathname, location.search, navigate]);

  const value = useMemo(
    () => ({ data, projection, baseRings, statePath, state, defaults, dispatch }),
    [data, projection, baseRings, statePath, state, defaults],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
