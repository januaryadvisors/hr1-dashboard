/**
 * <Methodology> — how the Insights figures are built, under the charts, for
 * every place: where the numbers come from and what each one counts. A
 * district adds how its figures are assembled from county data.
 *
 * Kept short: it is there for anyone who needs to defend a figure. Every
 * definition here must match the code that computes it (lib/insights.js).
 */
import styles from './Methodology.module.css';

/** Sources cited in the methodology. */
const SOURCES = {
  hhsc: 'https://www.hhs.texas.gov/about/records-statistics/data-statistics/supplemental-nutritional-assistance-program-snap-statistics',
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

/**
 * @param {{ from: string, to: string, county: boolean, district: import('../../data/load').DistrictUnit | null }} props
 *   `from` and `to` name the period's months ("Jul 2025"). `county` adds the
 *   enrollment-help note, shown on a single county only.
 */
export function Methodology({ from, to, county, district }) {
  return (
    <section className={district ? styles.rootDistrict : styles.root}>
      <h2 className={styles.title}>Methodology</h2>
      <p>
        <strong>Enrollment.</strong> Texans eligible for SNAP each month, by county, from{' '}
        <Source href={SOURCES.hhsc}>Texas HHSC SNAP statistics</Source>. Texas is the sum of its 254
        counties (call-center and state-office rows excluded); counties picked together are added up.
      </p>
      <p>
        <strong>People no longer on SNAP.</strong> Enrollment in {from}, when H.R. 1 was signed, minus
        enrollment in {to}, the latest month. A net change: people who joined in between offset
        people who left.
      </p>
      <p>
        <strong>Age groups.</strong> HHSC&rsquo;s five age bands, combined: under 5 and 5–17 as 0–17;
        18–59 and 60–64 as 18–64; and 65+.
      </p>
      <p>
        <strong>Change in SNAP spending.</strong> An estimate: the average month of benefits paid over
        the 12 months to {from}, minus the benefits paid each month after it, summed. Months above that
        average count against the total. SNAP benefits can only be spent at SNAP-authorized stores.
      </p>
      <p>
        <strong>Map and ranking.</strong> The map shades each place by the share of its {from}{' '}
        caseload no longer enrolled in {to}; a place whose caseload grew reads 0%. The list beside it
        ranks by number of people, so a small county with a large share does not top it.
      </p>
      {county && (
        <p>
          <strong>Enrollment help.</strong> CMS Navigator awardees serving the county (2025–26), HHSC
          Community Partner Program sites (levels 3–4), certified community health workers as the
          range DSHS reports, and the Feeding Texas member food banks that report serving the county
          (not every member bank reports).
        </p>
      )}

      {district && (
        <>
          <p>
            <strong>Districts.</strong> HHSC publishes SNAP enrollment at the county level only, so
            district figures are assembled from county data. Where a district is composed entirely of
            whole counties, its figures are the sum of those counties&rsquo; published caseloads.
          </p>
          <div>
            <p>
              Where a district includes part of a county divided between districts, that
              county&rsquo;s caseload is apportioned:
            </p>
            <ol className={styles.steps}>
              <li>
                The <Source href={SOURCES.acs}>American Community Survey (2020–24)</Source> reports
                the number of households receiving SNAP in each census tract, a unit of roughly 4,000
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
                Each district receives a share of the county&rsquo;s HHSC total equal to its share of
                the county&rsquo;s{' '}
                <Source href={SOURCES.snapHouseholds}>households that report receiving SNAP</Source>.
              </li>
            </ol>
          </div>
        </>
      )}
    </section>
  );
}
