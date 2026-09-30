/** C-01 and C-02 — spec §5. */
import { useLocation, useNavigate } from 'react-router-dom';
import { SegmentedControl } from './SegmentedControl';
import styles from './AppHeader.module.css';

/** The header's page slot. A page renders into it with createPortal. */
export const HEADER_SLOT_ID = 'app-header-slot';

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  // Districts is reached from the Map page's geography control, not the header (C-01).
  const page = location.pathname.startsWith('/insights') ? 'insights' : 'map';
  const onMap = location.pathname === '/map';

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true" />
        <span className={styles.title}>Texas SNAP &amp; H.R. 1</span>
      </div>
      {/*
        The Map page carries its own navigation — the Jump to menu, portalled
        into this slot, which also holds the Map/Insights switch — so the header
        shows one control rather than two. Every other page keeps the switch.
      */}
      {onMap ? (
        <div id={HEADER_SLOT_ID} className={styles.slot} />
      ) : (
        <SegmentedControl
          label="Page"
          options={[
            { value: 'map', label: 'Map' },
            { value: 'insights', label: 'Insights' },
          ]}
          value={page}
          onChange={(v) => navigate({ pathname: v === 'map' ? '/map' : '/insights/decline', search: location.search })}
        />
      )}
    </header>
  );
}
