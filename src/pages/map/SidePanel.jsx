/**
 * Beside the hero map: county search and the "Top affected counties" list.
 * On a phone it opens in the step caption's sheet instead (see <StepCaption>).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { CountySearch } from '../../components/map/CountySearch';
import { RankList } from '../../components/map/RankList';
import { formatLayerValue } from '../../lib/layerValues';
import { useElementSize } from '../../lib/useElementSize';
import styles from './MapPage.module.css';

const MAX_ROWS = 10;
const MIN_ROWS = 3;

/**
 * How many rows fit in the pinned stage without the list scrolling (a wheel
 * over a scrolling list would scroll it instead of the story).
 */
function useFitRows(enabled, rows) {
  const [scrollRef, box] = useElementSize();
  const innerRef = useRef(null);
  const listRef = useRef(null);
  const [fit, setFit] = useState(MAX_ROWS);
  const previousRef = useRef(null);

  useLayoutEffect(() => {
    const shown = Math.min(fit, rows.length);
    const rowH = shown ? (listRef.current?.offsetHeight ?? 0) / shown : 0;
    if (!enabled || !box.height || !rowH) return;
    // Measured from the panel's fixed part, so the answer does not depend on itself.
    const fixed = (innerRef.current?.offsetHeight ?? 0) - shown * rowH;
    // +2px tolerance for fractional row heights.
    let next = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor((box.height - fixed + 2) / rowH)));
    // Never flip back to the count just left: settle on the smaller.
    if (next === previousRef.current) next = Math.min(next, fit);
    if (next !== fit) {
      previousRef.current = fit;
      setFit(next);
    }
  }, [enabled, box.height, fit, rows]);

  return { fit: enabled ? fit : MAX_ROWS, scrollRef, innerRef, listRef };
}

/**
 * @param {{
 *   counties: object[],
 *   layer: string,
 *   values: object,
 *   rows: object[],
 *   glyph: 'line' | 'bucket',
 *   bins: number,
 *   activeGeoid: string | null,
 *   pinned: boolean,
 *   fitToStage: boolean,
 *   note?: string,
 *   onPick: (geoid: string | null) => void,
 *   onListHover: (geoid: string | null) => void,
 * }} props
 *   `pinned`: a search pick owns the tooltip, so the list does not hover.
 *   `fitToStage`: shorten the list to fit the pinned story stage.
 */
export function SidePanel({
  counties,
  layer,
  values,
  rows,
  glyph,
  bins,
  activeGeoid,
  pinned,
  fitToStage,
  note,
  onPick,
  onListHover,
}) {
  const { fit, scrollRef, innerRef, listRef } = useFitRows(fitToStage, rows);

  /*
     The search's dropdown opens over the list, so the list ignores hover while
     the search is hovered, or focused with text in it.
  */
  const [searchHover, setSearchHover] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [query, setQuery] = useState('');
  const searchActive = searchHover || (searchFocus && query.trim() !== '');

  return (
    <aside className={styles.sidePanel}>
      <div
        className={styles.panelBlock}
        onMouseEnter={() => setSearchHover(true)}
        onMouseLeave={() => setSearchHover(false)}
        onFocus={() => setSearchFocus(true)}
        onBlur={() => setSearchFocus(false)}
      >
        <CountySearch
          counties={counties}
          renderValue={(c) => formatLayerValue(layer, values.fill.get(c.geoid) ?? null)}
          onSelect={onPick}
          onQueryChange={setQuery}
        />
      </div>

      {/* Outside the search's block, so the search dropdown is never clipped. */}
      <div className={styles.sideScroll} ref={scrollRef}>
        <div ref={innerRef}>
          <div className={styles.panelBlock}>
            <div className={styles.blockTitle}>Top affected counties</div>
            {note && <p className={styles.blockNote}>{note}</p>}
            <div ref={listRef}>
              <RankList
                rows={rows.slice(0, fit)}
                glyph={glyph}
                bins={bins}
                activeGeoid={activeGeoid}
                inert={searchActive || pinned}
                onHover={onListHover}
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
