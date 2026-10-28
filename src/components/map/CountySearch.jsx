/**
 * County lookup with autocomplete.
 *
 * Selecting a result sets the hovered county, which highlights it on the hero map
 * and in every thumbnail and opens its tooltip — the same path a mouse hover
 * takes, so there is one highlight mechanism rather than two.
 *
 * That highlight is transient: moving the pointer over the map replaces it.
 */
import { useMemo, useRef, useState } from 'react';
import { cx } from '../../lib/cx';
/**
 * @typedef {import('../../types').County} County
 */
import styles from './CountySearch.module.css';

const MAX_RESULTS = 8;

/**
 * @typedef {Object} CountySearchProps
 * @property {County[]} counties
 * @property {(county: County) => string} renderValue - The active layer's value for a county, already formatted.
 *   Passed in rather than read off the county here: the loss layers have no
 *   score column and three of the layers use three different units, so the page
 *   that owns the values owns the formatting too.
 * @property {(geoid: string | null) => void} onSelect
 * @property {string} [placeholder] - Defaults to "Find a county…". The Insights scope bar reuses this for districts.
 * @property {string} [emptyText]
 * @property {string} [className] - Extra class on the root, for a caller that needs a different width.
 * @property {number} [maxResults] - Rows listed before the list stops. Defaults to 8; the list scrolls.
 * @property {string} [initialLabel] - The name of the place already picked, shown in the field on mount.
 * @property {boolean} [pill] - Fully rounded, to sit in a row of pill buttons.
 * @property {boolean} [browse] - Open on focus with every item listed, before
 *   anything is typed, so a reader can see what there is to pick from. Typing
 *   narrows it as usual. Also lists everything again when the field still holds
 *   the last pick, so reopening it is not a list of one.
 *
 * Items may carry `keywords`: a list of names that match but are not
 * highlighted — a district's counties, so "Travis" finds every district in
 * Travis. A keyword must match a whole name or the start of one, and exact
 * matches rank first: "Harris" lists the 24 Harris districts before the one
 * containing HarrisON County. Name matches always sort ahead of keyword matches.
 */

export function CountySearch({
  counties,
  renderValue,
  onSelect,
  placeholder = 'Find a county…',
  emptyText = 'No county matches that.',
  className,
  maxResults = MAX_RESULTS,
  browse = false,
  initialLabel,
  pill = false,
}) {
  const [query, setQuery] = useState(initialLabel ?? '');
  /** The label last committed to the field, so browse can tell a pick from a search. */
  const [picked, setPicked] = useState(initialLabel ?? null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (browse && (!q || query === picked)) {
      return [...counties]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((c) => ({ county: c, at: Infinity, kw: 0 }));
    }
    if (!q) return [];
    // Prefix matches first — typing "wil" should reach Williamson before Wilbarger
    // only if it sorts there, but a prefix must always beat a mid-word hit.
    const scored = counties
      .map((c) => {
        const name = c.name.toLowerCase();
        const at = name.indexOf(q);
        if (at !== -1) return { county: c, at, kw: 0 };
        // Keyword hits rank after every name hit and highlight nothing:
        // an exact keyword (kw 1) before a keyword that only starts with q (kw 2).
        const kws = c.keywords?.map((k) => k.toLowerCase()) ?? [];
        if (kws.includes(q)) return { county: c, at: Infinity, kw: 1 };
        if (kws.some((k) => k.startsWith(q))) return { county: c, at: Infinity, kw: 2 };
        return null;
      })
      .filter((r) => r !== null)
      .sort(
        (a, b) =>
          (a.at === b.at ? 0 : a.at - b.at) ||
          a.kw - b.kw ||
          a.county.name.localeCompare(b.county.name, undefined, { numeric: true }),
      );

    return scored.slice(0, maxResults);
  }, [counties, query, maxResults, browse, picked]);

  const commit = (geoid, label) => {
    onSelect(geoid);
    if (label) {
      setQuery(label);
      setPicked(label);
    }
    setOpen(false);
  };

  const clear = () => {
    setQuery('');
    setPicked(null);
    setOpen(false);
    onSelect(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clear();
      return;
    }
    if (e.key === 'ArrowDown' && !open && browse) {
      e.preventDefault();
      setOpen(true);
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

  const showList = open && (browse || query.trim().length > 0);

  return (
    <div className={cx(styles.root, pill && styles.pill, className)}>
      {/* A click on the icon or the caret lands on the field, not the input. */}
      <div
        className={styles.field}
        onClick={(e) => {
          if (e.target !== inputRef.current && !e.target.closest('button')) inputRef.current?.focus();
        }}
      >
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
          aria-label={placeholder.replace(/…$/, '')}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={(e) => {
            setOpen(true);
            if (browse) {
              setActiveIndex(0);
              // A reader who starts typing replaces the last pick, not appends to it.
              e.target.select();
            }
          }}
          // A field that is already focused gets no second focus event.
          onClick={() => setOpen(true)}
          // Delay so a click on an option lands before the list unmounts.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button type="button" className={styles.clear} aria-label="Clear search" onClick={clear}>
            ✕
          </button>
        ) : (
          browse && (
            // Says "this is a dropdown" before the field is touched.
            <svg className={styles.caret} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )
        )}
      </div>

      {showList && (
        <ul className={styles.list} id="county-search-list" role="listbox">
          {results.length === 0 && <li className={styles.empty}>{emptyText}</li>}
          {results.map((r, i) => {
            const q = query.trim();
            const inName = Number.isFinite(r.at);
            const before = inName ? r.county.name.slice(0, r.at) : r.county.name;
            const hit = inName ? r.county.name.slice(r.at, r.at + q.length) : '';
            const after = inName ? r.county.name.slice(r.at + q.length) : '';
            return (
              <li
                key={r.county.geoid}
                role="option"
                aria-selected={i === activeIndex}
                className={cx(styles.option, i === activeIndex && styles.active)}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(r.county.geoid, r.county.name)}
              >
                <span>
                  {before}
                  <span className={styles.match}>{hit}</span>
                  {after}
                </span>
                <span className={cx(styles.optionValue, 'tabular')}>
                  {renderValue(r.county)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
