/** C-01 and C-02 — spec §5. */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SegmentedControl } from './SegmentedControl';
import { DESKTOP } from '../../lib/breakpoints';
import { cx } from '../../lib/cx';
import { useMediaQuery } from '../../lib/useMediaQuery';
import logoUrl from '../../assets/feeding-texas-logo.png';
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
  // Districts are a scope of the Insights page, not a page of their own.
  const page = location.pathname.startsWith('/insights') ? 'insights' : 'map';
  const onMap = location.pathname === '/map';

  /*
     Two states. At the top of the Map page the header is the hero's green, so
     the two read as one band. Once the page scrolls it turns light, and on
     desktop slims to 48px — which hands the pinned story 16px more map.
  */
  const [scrolled, setScrolled] = useState(false);
  const wide = useMediaQuery(DESKTOP);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_AT);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const green = onMap && !scrolled;
  const slim = scrolled && wide;

  useEffect(() => {
    document.documentElement.style.setProperty('--header-height', `${slim ? SLIM_H : FULL_H}px`);
  }, [slim]);

  return (
    <header className={cx(styles.header, green && styles.green, slim && styles.slim)}>
      <div className={styles.brand}>
        <img className={styles.logo} src={logoUrl} alt="Feeding Texas" />
        <span className={styles.title}>Texas SNAP &amp; H.R.&nbsp;1</span>
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
