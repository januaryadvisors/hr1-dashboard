/**
 * The Episcopal Health Foundation mark under an "In partnership with" label:
 * in the Map page's green hero band (single colour, cream), and bottom right of
 * the Insights report (full colour).
 */
import { cx } from '../../lib/cx';
import logoUrl from '../../assets/episcopal-health-foundation-logo.png';
import styles from './FunderLogo.module.css';

/**
 * @param {{ className?: string, onGreen?: boolean }} props
 *   `onGreen`: the logo's grey wordmark disappears on the hero green, so there
 *   it is drawn as a single-colour cream silhouette.
 */
export function FunderLogo({ className, onGreen = false }) {
  return (
    <div className={cx(styles.root, onGreen && styles.onGreen, className)}>
      <span className={styles.label}>In partnership with</span>
      <img className={styles.logo} src={logoUrl} alt="Episcopal Health Foundation" width="2551" height="451" />
    </div>
  );
}
