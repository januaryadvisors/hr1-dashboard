/**
 * Which county the hero map's tooltip shows, and how it can be closed.
 *
 * Three sources set it: the pointer on the map, a row in the shortlist, and a
 * search pick (pinned until closed). See `hovered`, `hoverOrigin` and `pinned`
 * in state/appState.js.
 */
import { useCallback, useEffect, useRef } from 'react';

/** How long the pointer must rest on a map county before it replaces a pinned pick. */
const PIN_DWELL_MS = 50;

export function useCountyHover(state, dispatch) {
  const pinnedRef = useRef(state.pinned);
  pinnedRef.current = state.pinned;
  const dwellRef = useRef(0);
  useEffect(() => () => clearTimeout(dwellRef.current), []);

  /*
     With a pick pinned, a map county takes over only after a short rest, so
     the pointer can cross the map to the pinned tooltip's close button.
  */
  const onMapHover = useCallback(
    (geoid) => {
      clearTimeout(dwellRef.current);
      if (geoid && pinnedRef.current) {
        dwellRef.current = setTimeout(() => dispatch({ type: 'hover', geoid }), PIN_DWELL_MS);
      } else {
        dispatch({ type: 'hover', geoid });
      }
    },
    [dispatch],
  );

  const onListHover = useCallback(
    (geoid) => dispatch({ type: 'hover', geoid, origin: 'list' }),
    [dispatch],
  );

  const pinnedShown = !state.hovered && !!state.pinned;
  const fromList = !!state.hovered && state.hoverOrigin === 'list';

  /*
     A pinned pick and a shortlist hover both get a close button. A shortlist
     tooltip also stays up while the pointer rests on it: the list's leave and
     the tooltip's enter arrive in one event, so re-asserting the county keeps it.
  */
  const tooltip = {
    origin: state.hovered ? state.hoverOrigin : 'external',
    onClose: pinnedShown
      ? () => dispatch({ type: 'pin', geoid: null })
      : fromList
        ? () => onListHover(null)
        : undefined,
    onHold: fromList ? () => onListHover(state.hovered) : undefined,
    onRelease: fromList ? () => onListHover(null) : undefined,
  };

  return { onMapHover, onListHover, tooltip };
}
