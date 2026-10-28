/**
 * <HelpList> — the enrollment help listed in a county, in words.
 */
import { INFRA_TYPES } from '../../config/layers';
import { cx } from '../../lib/cx';
import { fmtInt } from '../../lib/format';
import { INFRA_BAR_ORDER } from './InfraBars';
import { InfraGlyph } from './InfraGlyph';
import styles from './HelpList.module.css';

/** "2 CMS navigators" — count and noun, singular for one. */
const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/** One line of the help list, in words. */
function helpLine(county, key) {
  const n = county.infra[key];
  switch (key) {
    case 'cms_navigator':
      return plural(n, 'CMS navigator', 'CMS navigators');
    case 'cpp':
      return plural(n, 'Community Partner Program site', 'Community Partner Program sites');
    case 'chw':
      // A range read off the DSHS report, not a count.
      return n === 0 || !county.chw_band
        ? 'No certified community health workers'
        : `${county.chw_band} certified community health workers`;
    case 'food_bank':
      // null is "no reporting food bank covers it", which is not "none".
      return n == null
        ? 'No reporting food bank'
        : plural(n, 'food bank serving the county', 'food banks serving the county');
    default:
      return null;
  }
}

/**
 * Enrollment help listed in a county, as text. One line per registry, each
 * with its map-key symbol. Used by the
 * Insights report box; the map tooltip keeps the bar chart (<InfraColumnChart>).
 * `className` sets the layout and size.
 */
export function HelpList({ county, className }) {
  return (
    <ul className={cx(styles.list, className)}>
      {INFRA_BAR_ORDER.map((key) => INFRA_TYPES.find((t) => t.key === key))
        .filter((t) => t?.available)
        .map((t) => {
          const v = county.infra[t.key];
          const absent = v === 0 || (t.partial && v == null);
          return (
            <li key={t.key} className={absent ? styles.absent : undefined}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <InfraGlyph type={t.key} x={7} y={7} size={4} legend noData={t.partial && v == null} />
              </svg>
              {helpLine(county, t.key)}
            </li>
          );
        })}
    </ul>
  );
}
