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
    () => ({ data, projection, state, defaults, dispatch }),
    [data, projection, state, defaults],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
