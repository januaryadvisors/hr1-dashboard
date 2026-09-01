/** <SegmentedControl> — §7. Rate/Count, Style, Map/Insights, geography. */
import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Visible but not applicable — §8 requires labelling rather than hiding. */
  inert?: boolean;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  inert = false,
  label,
}: SegmentedControlProps<T>) {
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
