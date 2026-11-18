/**
 * Printing a page from the browser's own dialog.
 *
 * `printing` is true for the length of a print, however it was started, so
 * charts can re-render at their paper sizes. flushSync makes that re-render
 * land before the browser lays the page out.
 */
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export function usePrintMode() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printing;
}

/** Opens the print dialog with `title` as the document title, which becomes the PDF's file name. */
export function printWithTitle(title) {
  const previous = document.title;
  document.title = title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
