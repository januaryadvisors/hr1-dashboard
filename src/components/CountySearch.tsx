/**
 * County lookup with autocomplete.
 *
 * Selecting a result sets the hovered county, which highlights it on the hero map
 * and in every thumbnail and opens its tooltip — the same path a mouse hover
 * takes, so there is one highlight mechanism rather than two.
 *
 * That highlight is transient: moving the pointer over the map replaces it. A
 * selection that survives is what the reworked click-to-select will add.
 */
import { useMemo, useRef, useState } from 'react';
import type { County, LayerKey } from '../types';
import { scoreField } from '../config/layers';
import { fmtPercentile } from '../lib/format';
import styles from './CountySearch.module.css';

const MAX_RESULTS = 8;

export interface CountySearchProps {
  counties: County[];
  layer: LayerKey;
  onSelect: (geoid: string | null) => void;
}

export function CountySearch({ counties, layer, onSelect }: CountySearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Prefix matches first — typing "wil" should reach Williamson before Wilbarger
    // only if it sorts there, but a prefix must always beat a mid-word hit.
    const scored = counties
      .map((c) => {
        const name = c.name.toLowerCase();
        const at = name.indexOf(q);
        if (at === -1) return null;
        return { county: c, at };
      })
      .filter((r): r is { county: County; at: number } => r !== null)
      .sort((a, b) => a.at - b.at || a.county.name.localeCompare(b.county.name));

    return scored.slice(0, MAX_RESULTS);
  }, [counties, query]);

  const commit = (geoid: string | null, label?: string) => {
    onSelect(geoid);
    if (label) setQuery(label);
    setOpen(false);
  };

  const clear = () => {
    setQuery('');
    setOpen(false);
    onSelect(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clear();
      return;
    }
    if (!results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[Math.min(activeIndex, results.length - 1)];
      if (pick) commit(pick.county.geoid, pick.county.name);
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className={styles.root}>
      <div className={styles.field}>
        <svg className={styles.icon} width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 10L14.5 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls="county-search-list"
          aria-autocomplete="list"
          aria-label="Find a county"
          placeholder="Find a county…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on an option lands before the list unmounts.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" className={styles.clear} aria-label="Clear search" onClick={clear}>
            ✕
          </button>
        )}
      </div>

      {showList && (
        <ul className={styles.list} id="county-search-list" role="listbox">
          {results.length === 0 && <li className={styles.empty}>No county matches that.</li>}
          {results.map((r, i) => {
            const value = r.county[scoreField(layer)];
            const num = typeof value === 'number' ? value : null;
            const q = query.trim();
            const before = r.county.name.slice(0, r.at);
            const hit = r.county.name.slice(r.at, r.at + q.length);
            const after = r.county.name.slice(r.at + q.length);
            return (
              <li
                key={r.county.geoid}
                role="option"
                aria-selected={i === activeIndex}
                className={`${styles.option} ${i === activeIndex ? styles.active : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(r.county.geoid, r.county.name)}
              >
                <span>
                  {before}
                  <span className={styles.match}>{hit}</span>
                  {after}
                </span>
                <span className={`${styles.optionValue} tabular`}>
                  {layer === 'composite'
                    ? num?.toFixed(2) ?? '—'
                    : fmtPercentile(num)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
