/**
 * <Section> — a page section: one bold line, then the content.
 *
 * Started life carrying the comps' numbered eyebrow ("02 — PLACE") and a lede
 * under the title. Both removed on client direction 2026-09-11 — the numbering
 * and the ledes were restating what the charts already said, and on a page this
 * long they read as filler between the reader and the data. The component stays
 * so the heading treatment lives in one place.
 *
 * `tone` alternates the band's ground between the two tans, so consecutive
 * sections read as separate territory without a rule between them. The band
 * spans the main column only — the sticky rail keeps its own ground.
 */
import type { ReactNode } from 'react';
import styles from './Section.module.css';

export interface SectionProps {
  title: string;
  /** Alternating ground. 'alt' is the half-step darker tan. */
  tone?: 'base' | 'alt';
  /** Rendered on the title's right, e.g. a control that belongs to the section. */
  aside?: ReactNode;
  children: ReactNode;
}

export function Section({ title, tone = 'base', aside, children }: SectionProps) {
  return (
    <section className={`${styles.root} ${tone === 'alt' ? styles.alt : ''}`}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {aside && <div className={styles.headAside}>{aside}</div>}
      </div>
      {children}
    </section>
  );
}
