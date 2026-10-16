/** C-01 and C-02 — spec §5. */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SegmentedControl } from './SegmentedControl';
import styles from './AppHeader.module.css';

/** Past this many pixels of scroll the header is "scrolled". */
const SCROLL_AT = 24;

/** The header's two heights, mirrored into --header-height (tokens.css) for
    everything that positions itself under the header — the pinned story above all. */
const FULL_H = 64;
const SLIM_H = 48;

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  // Districts is reached from the Map page's geography control, not the header (C-01).
  const page = location.pathname.startsWith('/insights') ? 'insights' : 'map';
  const onMap = location.pathname === '/map';

  /*
     Two states, 2026-10-16 direction. At the top of the Map page the header is
     the hero's green, so the two read as one band. Once the page scrolls it
     turns light, and on desktop slims to 48px — which hands the pinned story
     16px more map.
  */
  const [scrolled, setScrolled] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const onScroll = () => setScrolled(window.scrollY > SCROLL_AT);
    const onMq = () => setWide(mq.matches);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    mq.addEventListener('change', onMq);
    return () => {
      window.removeEventListener('scroll', onScroll);
      mq.removeEventListener('change', onMq);
    };
  }, []);

  const green = onMap && !scrolled;
  const slim = scrolled && wide;

  useEffect(() => {
    document.documentElement.style.setProperty('--header-height', `${slim ? SLIM_H : FULL_H}px`);
  }, [slim]);

  return (
    <header
      className={`${styles.header} ${green ? styles.green : ''} ${slim ? styles.slim : ''}`}
    >
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true" />
        <span className={styles.title}>Texas SNAP &amp; H.R. 1</span>
      </div>
      {/*
        The Map / Insights switch, on every page. The Map page's Jump to menu
        floats over the story instead of sitting here — see MapPage.
      */}
      <div className={styles.end}>
        <SegmentedControl
          label="Page"
          tone={green ? 'onGreen' : 'ink'}
          options={[
            { value: 'map', label: 'Map' },
            { value: 'insights', label: 'Insights' },
          ]}
          value={page}
          onChange={(v) => navigate({ pathname: v === 'map' ? '/map' : '/insights/decline', search: location.search })}
        />
      </div>
    </header>
  );
}
