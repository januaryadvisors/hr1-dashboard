/**
 * <Section> — a page section: one bold line, an optional subtitle, then the
 * content. Keeps the heading treatment in one place.
 *
 * `tone` alternates the band's ground between the two tans, so consecutive
 * sections read as separate territory without a rule between them. The band
 * spans the main column only — the sticky rail keeps its own ground.
 *
 * @typedef {import('react').ReactNode} ReactNode
 */
import { cx } from '../../lib/cx';
import styles from './Section.module.css';

/**
 * @typedef {Object} SectionProps
 * @property {string} title
 * @property {string} [subtitle] - One short line under the title.
 * @property {'base' | 'alt'} [tone] - Alternating ground. 'alt' is the half-step darker tan.
 * @property {string} [id] - Anchor for in-page jumps.
 * @property {ReactNode} children
 */

export function Section({ title, subtitle, tone = 'base', id, children }) {
  return (
    <section id={id} className={cx(styles.root, tone === 'alt' && styles.alt)}>
      <div>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
