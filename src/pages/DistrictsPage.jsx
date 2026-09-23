/**
 * Districts view — spec §9, provisional.
 *
 * §3.4: "the app must render the Districts route from an empty-state if the file
 * 404s." §9: the aggregation is a back-end change; district scores must NOT be
 * computed in the browser, so this page stays an empty state until
 * districts.json exists.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadDistricts } from '../data/load';
import { Callout } from '../components/shell/Callout';
import { SegmentedControl } from '../components/shell/SegmentedControl';
import styles from './DistrictsPage.module.css';

export default function DistrictsPage() {
  const [districts, setDistricts] = useState(undefined);
  const [chamber, setChamber] = useState('tx_house');

  useEffect(() => {
    loadDistricts().then(setDistricts);
  }, []);

  return (
    <div className={styles.page}>
      {/* §9: persistent amber banner. */}
      <Callout tone="caution" title="Provisional — aggregation method not settled">
        Percentile scores cannot be population-weighted into districts and stay meaningful.
        Districts must be re-ranked from the underlying rates through the block-weighted
        crosswalk, then percentiled within the 150 or 31 district set. That is a back-end change,
        so nothing is computed in the browser here.
      </Callout>

      <SegmentedControl
        label="Chamber"
        options={[
          { value: 'tx_house', label: 'TX House', title: 'PlanH2316, 150 districts' },
          { value: 'tx_senate', label: 'TX Senate', title: 'PlanS2168, 31 districts' },
          {
            value: 'us_house',
            label: 'US House',
            disabled: true,
            // §9: present but disabled, with a tooltip naming the blocker.
            title: 'Blocked: Feeding Texas has not chosen between PlanC2333 and PlanC2193.',
          },
        ]}
        value={chamber}
        onChange={setChamber}
      />

      {districts === undefined && <p className={styles.status}>Checking for districts.json…</p>}

      {districts === null && (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>No district data yet</h2>
          <p>
            <code>districts.json</code> has not been exported. It needs TX House (PlanH2316, 150)
            and TX Senate (PlanS2168, 31) with the same score fields as counties, re-percentiled
            within the district set.
          </p>
          <p>
            District <strong>enrollment counts</strong> are already available: open{' '}
            <Link to="/insights/decline">Insights</Link> and switch the geography to TX House or TX
            Senate above the search. Those are counts apportioned from counties, not scores.
          </p>
          <p className={styles.emptyMeta}>
            Owner: David / January Advisors. Tracked as an open blocker in build spec §12.
          </p>
        </div>
      )}

      {districts != null && (
        <Callout tone="info" title="districts.json found">
          The file is present. Wire the layer strip and the district map here — layout mirrors the
          Map page, with a rank table replacing the county tooltip and newly-subject count as the
          lead column (§9).
        </Callout>
      )}
    </div>
  );
}
