/** Joins the truthy class names: cx(styles.a, on && styles.b) → "a b". */
export const cx = (...names) => names.filter(Boolean).join(' ');
