/** <Switch> — an on/off control with its label, and optionally a definition under it. */
import { cx } from '../../lib/cx';
import styles from './Switch.module.css';

/**
 * @param {{
 *   label: string,
 *   checked: boolean,
 *   onChange: (checked: boolean) => void,
 *   definition?: import('react').ReactNode,
 * }} props
 */
export function Switch({ label, checked, onChange, definition }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cx(styles.switch, checked && styles.on)}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} aria-hidden="true" />
      </button>
      {/* §6.8 M-08: the definition is the control's label, not a tooltip. */}
      {definition && <span className={styles.definition}>{definition}</span>}
    </div>
  );
}
