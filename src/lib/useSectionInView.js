/**
 * Which of a page's sections the reader is on, for a section index's highlight.
 * A section counts once it reaches the upper third of the screen; at the very
 * bottom of the page the last one counts, since it may be too short to get there.
 */
import { useEffect, useState } from 'react';

export function useSectionInView(ids) {
  const [inView, setInView] = useState(ids[0]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (first) setInView(first.target.id);
      },
      { rootMargin: '-15% 0px -60% 0px' },
    );
    ids.map((id) => document.getElementById(id)).filter(Boolean).forEach((el) => io.observe(el));

    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) setInView(ids.at(-1));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
    // The ids are a constant list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return inView;
}
