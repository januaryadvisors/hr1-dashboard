/** C-01 and C-02 — spec §5. */
import { useLocation, useNavigate } from 'react-router-dom';
import { SegmentedControl } from './SegmentedControl';
import type { Measure } from '../types';
import styles from './AppHeader.module.css';

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  // Districts is reached from the Map page's geography control, not the header (C-01).
  const page = location.pathname.startsWith('/insights') ? 'insights' : 'map';

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true" />
        <span className={styles.title}>Texas SNAP &amp; H.R. 1</span>
      </div>
      <SegmentedControl
        label="Page"
        options={[
          { value: 'map', label: 'Map' },
          { value: 'insights', label: 'Insights' },
        ]}
        value={page}
        onChange={(v) => navigate({ pathname: v === 'map' ? '/map' : '/insights/decline', search: location.search })}
      />
    </header>
  );
}

export function MeasureBar({
  measure,
  onChange,
  inert = false,
  note,
}: {
  measure: Measure;
  onChange: (m: Measure) => void;
  inert?: boolean;
  note?: string;
}) {
  return (
    <div className={styles.measureBar}>
      <SegmentedControl
        label="Measure"
        options={[
          { value: 'rate', label: 'Rate' },
          { value: 'count', label: 'Count' },
        ]}
        value={measure}
        onChange={onChange}
        inert={inert}
      />
      {note && <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)' }}>{note}</span>}
    </div>
  );
}

