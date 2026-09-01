/**
 * Insights page — spec §8. Five tabbed chapters, thirteen charts.
 *
 * Scaffolded: routing, the tab column, chapter framing and the "what this does
 * not support" line are in place; the charts land per §13 step 7 (tabs 1, 2 and
 * 5 first — they run on statewide data, which is already available).
 */
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { Callout } from '../components/Callout';
import { ColumnChart } from '../components/ColumnChart';
import { DumbbellChart } from '../components/DumbbellChart';
import styles from './InsightsPage.module.css';

interface Chapter {
  slug: string;
  title: string;
  claim: string;
  doesNotSupport: string;
  /** Charts still to build, listed so the gap is visible rather than implied. */
  pending: string[];
  banner?: { tone: 'caution' | 'blocked'; text: string };
}

const CHAPTERS: Chapter[] = [
  {
    slug: 'decline',
    title: 'The decline has not stopped',
    claim: 'Enrollment is still falling, and the pace is flat rather than slowing.',
    doesNotSupport:
      'Causal attribution to H.R. 1. Emergency-allotment expiry and the Medicaid unwinding overlap this window.',
    pending: ['Enrollment line 2022 → May 2026', 'Participation share 11.0% → 9.3%'],
  },
  {
    slug: 'who',
    title: 'Who is falling off',
    claim: 'Working-age adults and children carry the entire decline; seniors are unchanged.',
    doesNotSupport:
      'Any claim about why a given band left. The age breakdown is statewide and descriptive.',
    pending: ['Age-band indexed lines', 'Age table', 'People vs households, indexed'],
  },
  {
    slug: 'domains',
    title: 'The four domains disagree',
    claim: 'No single ranking of counties can be honest about all four exposures.',
    doesNotSupport:
      'A dominant-domain map. Domains win 71 / 75 / 44 / 64 counties and the median margin is 0.105 — it would colour Texas on noise.',
    pending: ['Small multiples with synced hover', 'Correlation matrix', 'Cumulative-impact distribution'],
  },
  {
    slug: 'capacity',
    title: 'Where exposure meets thin capacity',
    claim: 'The counties with the least enrollment help are not the ones with the most.',
    doesNotSupport:
      'Requirement F4. Navigator counts alone cannot answer whether capacity is adequate.',
    pending: ['Gap scatter, full width', 'Infrastructure coverage bars', 'Gap-county table'],
    banner: {
      tone: 'caution',
      text:
        'Capacity here is a floor, not a measure. Feeding Texas still owes food-bank enrollment FTE and households-reached by county.',
    },
  },
  {
    slug: 'rate-count',
    title: 'Rate and count are two arguments',
    claim: 'Targeting by rate and targeting by count select different counties, and both are legitimate.',
    doesNotSupport:
      'A single "correct" target list. The two framings are different questions, not different accuracies.',
    pending: ['Paired maps', 'Top-10 absolute losses', 'Funnel plot with shrinkage toggle'],
  },
];

export default function InsightsPage() {
  const { tab } = useParams();
  const { data } = useApp();
  const chapter = CHAPTERS.find((c) => c.slug === tab) ?? CHAPTERS[0];
  const { statewide } = data;
  const months = statewide.meta.months;

  return (
    <div className={styles.page}>
      <nav className={styles.tabs} aria-label="Insights chapters">
        {CHAPTERS.map((c) => (
          <Link
            key={c.slug}
            to={{ pathname: `/insights/${c.slug}`, search: window.location.search }}
            className={`${styles.tab} ${c.slug === chapter.slug ? styles.tabActive : ''}`}
          >
            {c.title}
          </Link>
        ))}
      </nav>

      <main className={styles.content}>
        <h1 className={styles.claim}>{chapter.claim}</h1>

        {chapter.banner && <Callout tone={chapter.banner.tone}>{chapter.banner.text}</Callout>}

        {chapter.slug === 'decline' && (
          <div className={styles.chartBlock}>
            <h2 className={styles.chartTitle}>Monthly change in enrolled individuals</h2>
            <ColumnChart
              months={months}
              values={statewide.monthly_change}
              annotations={[
                { month: '2025-11', label: 'NOV −110k' },
                { month: '2026-05', label: 'MAY −78,861' },
              ]}
              height={230}
            />
          </div>
        )}

        {chapter.slug === 'who' && (
          <div className={styles.chartBlock}>
            <h2 className={styles.chartTitle}>Change by age band, Jul 2025 → May 2026</h2>
            <DumbbellChart
              rows={statewide.age_bands.map((b) => ({
                label: b.band,
                from: b.july_enrolled,
                to: b.latest_enrolled,
                pctChange: b.pct_change,
              }))}
            />
          </div>
        )}

        <Callout tone="info" title="Still to build">
          <ul className={styles.pending}>
            {chapter.pending.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          Build order per spec §13 step 7: tabs 1, 2 and 5 first (statewide data, already
          available), then 3, then 4.
        </Callout>

        <p className={styles.doesNotSupport}>
          <strong>What this does not support:</strong> {chapter.doesNotSupport}
        </p>

      </main>
    </div>
  );
}
