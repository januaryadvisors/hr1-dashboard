/** <SegmentedControl> — §7. Rate/Count, Style, Map/Insights, geography. */
import { cx } from '../../lib/cx';
import styles from './SegmentedControl.module.css';

/**
 * @template T
 * @typedef {Object} SegmentedOption
 * @property {T} value
 * @property {string} label
 * @property {string} [title]
 */

/**
 * @template T
 * @typedef {Object} SegmentedControlProps
 * @property {SegmentedOption<T>[]} options
 * @property {T} value
 * @property {(value: T) => void} onChange
 * @property {'sm' | 'md'} [size]
 * @property {'navy' | 'ink' | 'onGreen'} [tone] - Fill of the selected option. Ink for the header's
 *   page switch; onGreen for the same switch while the header is the hero's green.
 * @property {string} label
 * @property {string} [className] - Layout from the parent (e.g. stretching to fill a narrow column).
 */

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  tone = 'navy',
  label,
  className,
}) {
  return (
    <div
      className={cx(
        styles.root,
        size === 'sm' && styles.sm,
        tone === 'ink' && styles.ink,
        tone === 'onGreen' && styles.onGreen,
        className,
      )}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(styles.option, o.value === value && styles.active)}
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
