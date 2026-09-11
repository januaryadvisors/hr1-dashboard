/** <SegmentedControl> — §7. Rate/Count, Style, Map/Insights, geography. */
import styles from './SegmentedControl.module.css';

/**
 * @template T
 * @typedef {Object} SegmentedOption
 * @property {T} value
 * @property {string} label
 * @property {boolean} [disabled]
 * @property {string} [title]
 */

/**
 * @template T
 * @typedef {Object} SegmentedControlProps
 * @property {SegmentedOption<T>[]} options
 * @property {T} value
 * @property {(value: T) => void} onChange
 * @property {'sm' | 'md'} [size]
 * @property {boolean} [inert] - Visible but not applicable — §8 requires labelling rather than hiding.
 * @property {string} label
 */

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  inert = false,
  label,
}) {
  return (
    <div
      className={`${styles.root} ${size === 'sm' ? styles.sm : ''} ${inert ? styles.inert : ''}`}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.option} ${o.value === value ? styles.active : ''}`}
          aria-pressed={o.value === value}
          disabled={o.disabled || inert}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
