import { useEffect, useState } from 'react';

/** The value `load()` resolves to, fetched once on mount; `initial` until then. */
export function useLoaded(load, initial = null) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let live = true;
    load().then((v) => {
      if (live) setValue(v);
    });
    return () => {
      live = false;
    };
  }, [load]);
  return value;
}
