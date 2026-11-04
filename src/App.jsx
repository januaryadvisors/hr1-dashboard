/** §2: react-router — /map and /insights/:tab. /districts redirects to the Insights page, which reads district scopes. */
import { useLayoutEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppHeader } from './components/shell/AppHeader';
import { AppProvider } from './state/AppContext';
import { Callout } from './components/shell/Callout';
import { MissingDataError } from './data/load';
import MapPage from './pages/MapPage';
import InsightsPage from './pages/InsightsPage';
import styles from './App.module.css';

/** Keeps the query string, so a /districts?district=… link opens that district. */
function DistrictsRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/insights/decline', search }} replace />;
}

/**
 * A new page opens at its top. The two pages share one document, so without
 * this the Insights page would open at whatever depth the Map page was
 * scrolled to. Only on a change of page: moving within the Insights page
 * (its scope, its section links) keeps the reader where they are.
 */
function useTopOnPageChange() {
  const { pathname } = useLocation();
  const page = pathname.startsWith('/insights') ? 'insights' : 'map';
  const last = useRef(page);
  // Layout, so the new page never paints at the old depth.
  useLayoutEffect(() => {
    if (last.current === page) return;
    last.current = page;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);
}

function Shell() {
  useTopOnPageChange();
  return (
    <div className={styles.app}>
      <AppHeader />
      <main className={styles.main}>
        <Routes>
          <Route path="/map" element={<MapPage />} />
          <Route path="/insights" element={<Navigate to="/insights/decline" replace />} />
          <Route path="/insights/:tab" element={<InsightsPage />} />
          <Route path="/districts" element={<DistrictsRedirect />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider
      renderLoading={() => <div className={styles.boot}>Loading Texas SNAP data…</div>}
      renderError={(error) => (
        <div className={styles.bootError}>
          <Callout
            tone="blocked"
            title={
              error instanceof MissingDataError ? 'Data not exported yet' : 'Could not load the data'
            }
          >
            {error instanceof MissingDataError ? (
              <>
                Waiting on <code>{error.file}</code>. Build it from the analysis repo with{' '}
                <code>npm run build:data</code>, or drop the real export into{' '}
                <code>public/data/</code>.
              </>
            ) : (
              error.message
            )}
          </Callout>
        </div>
      )}
    >
      <Shell />
    </AppProvider>
  );
}
