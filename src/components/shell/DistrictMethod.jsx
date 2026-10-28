/**
 * <DistrictMethod> — how a district's figures are built, under the Insights
 * charts. Shown for districts only: county and state figures are HHSC's own.
 */
import styles from './DistrictMethod.module.css';

/** Sources cited in the methodology. */
const SOURCES = {
  acs: 'https://www.census.gov/programs-surveys/acs',
  // Table B22001, Texas tracts — the counts the split uses.
  snapHouseholds: 'https://data.census.gov/table/ACSDT5Y2024.B22001?g=040XX00US48$1400000',
  blocks: 'https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html',
  // Texas Legislative Council block-equivalency files, one per plan.
  plans: {
    txhouse: 'https://data.capitol.texas.gov/dataset/planh2316',
    txsenate: 'https://data.capitol.texas.gov/dataset/plans2168',
    ushouse: 'https://data.capitol.texas.gov/dataset/planc2333',
  },
};

function Source({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function DistrictMethod({ district }) {
  return (
    <section className={styles.root}>
      <h2 className={styles.title}>Methodology</h2>
      <p>
        HHSC publishes SNAP enrollment at the county level only, so district figures are assembled
        from county data. Where a district is composed entirely of whole counties, its figures are the
        sum of those counties&rsquo; published caseloads.
      </p>
      <div>
        <p>
          Where a district includes part of a county divided between districts, that county&rsquo;s
          caseload is apportioned:
        </p>
        <ol className={styles.steps}>
          <li>
            The <Source href={SOURCES.acs}>American Community Survey (2020–24)</Source> reports the
            number of households receiving SNAP in each census tract, a unit of roughly 4,000
            residents.
          </li>
          <li>
            Each tract is allocated to districts according to where its residents live, using{' '}
            <Source href={SOURCES.blocks}>2020 census blocks</Source> and the{' '}
            <Source href={SOURCES.plans[district.plan] ?? SOURCES.plans.txhouse}>
              Texas Legislative Council&rsquo;s block-to-district assignments
            </Source>
            .
          </li>
          <li>
            Each district receives a share of the county&rsquo;s HHSC total equal to its share of the
            county&rsquo;s{' '}
            <Source href={SOURCES.snapHouseholds}>households that report receiving SNAP</Source>.
          </li>
        </ol>
      </div>
    </section>
  );
}
