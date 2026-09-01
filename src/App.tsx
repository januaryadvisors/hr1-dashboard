/** §2: react-router, three routes — /map, /insights/:tab, /districts. */
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppHeader } from './components/AppHeader';
import { AppProvider } from './state/AppContext';
import { Callout } from './components/Callout';
import { MissingDataError } from './data/load';
import MapPage from './pages/MapPage';
import InsightsPage from './pages/InsightsPage';
import DistrictsPage from './pages/DistrictsPage';
import styles from './App.module.css';

function Shell() {
  return (
    <div className={styles.app}>
      <AppHeader />
      <main className={styles.main}>
        <Routes>
          <Route path="/map" element={<MapPage />} />
          <Route path="/insights" element={<Navigate to="/insights/decline" replace />} />
          <Route path="/insights/:tab" element={<InsightsPage />} />
          <Route path="/districts" element={<DistrictsPage />} />
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
                Waiting on <code>{error.file}</code>. Generate the fixtures with{' '}
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
