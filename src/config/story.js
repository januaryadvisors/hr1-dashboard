/**
 * The homepage story — chapters, and the steps inside each one.
 *
 * On desktop the map and the story rail stick to the viewport and the page
 * scrolls behind them. Every step is one scroll stop: it pins the map to a view
 * and opens one collapsible in the rail. The reader can still work the map
 * inside a step (hover, search, Map options); scrolling to another step resets
 * the map to what that step declares.
 *
 * A chapter is one of the map VIEWS (config/layers.js), so the chapter bar's
 * thumbnails and the map's own layer can never disagree about what is on screen.
 *
 * COPY is the client's, from the 2026-09-30 comps. EVERY FIGURE IN IT IS
 * COMPUTED: titles, bodies and subheads are functions of
 * `StoryFacts` (built in MapPage from the loaded data and the brush window), so
 * the words and the chart beside them cannot disagree and neither goes stale
 * when a month lands. The one exception is the school-meals step, whose figures
 * come from outside this dataset; they are typed below with their sources.
 *
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').Measure} Measure
 * @typedef {import('../types').ViewKey} ViewKey
 */

/**
 * Formatted figures the copy quotes. Built in MapPage; any that depend on an
 * optional dataset (observed SNAP, Marketplace) are null until it loads, and
 * the copy below falls back to wording without the number.
 *
 * @typedef {Record<string, string | null>} StoryFacts
 */

/**
 * @typedef {string | ((f: StoryFacts) => string)} Copy
 */

/**
 * @typedef {Object} StorySource
 * @property {string} label
 * @property {string} [href] - Absent for sources with no public page (the exposure model).
 */

/**
 * @typedef {Object} StoryStep
 * @property {string} id - Stable, unique across the story.
 * @property {Copy} title - The collapsible's header.
 * @property {Copy} body
 * @property {Copy} [subhead] - What the chart shows, set between the body and the chart.
 * @property {'snapLine' | 'ageLines' | 'shortfall' | 'workStrip' | 'schoolMeals' | 'childTypes'
 *   | 'indexRecipe' | 'indexStrip' | 'marketLine' | 'neverPaid'} [chart]
 *   A static figure MapPage renders. The rail holds figures to read, never
 *   controls — those live in Map options.
 * @property {StorySource[] | ((f: StoryFacts) => StorySource[])} [sources]
 * @property {string} [sourceNote] - Plain text after the linked sources.
 * @property {LayerKey} [layer] - Defaults to the chapter view's first metric.
 * @property {Measure} [measure] - Omitted: keep the reader's choice, falling back to rate where the
 *   layer has no count basis (C-03) so a step never opens on the "no count" callout.
 */

/**
 * @typedef {Object} StoryChapter
 * @property {ViewKey} view
 * @property {string} nav - Short label for the chapter bar and the timeline.
 * @property {StoryStep[]} steps
 */

const HHSC = (f) => [{ label: 'Texas HHSC SNAP statistics', href: f.snapSourceUrl ?? undefined }];
const CMS = (f) => [{ label: 'CMS Marketplace data', href: f.mktSourceUrl ?? undefined }];

/** @type {StoryChapter[]} */
export const STORY = [
  {
    view: 'loss',
    nav: 'SNAP benefits lost',
    steps: [
      {
        id: 'loss-trend',
        title: (f) =>
          f.avgMonthlyK ? `Still falling, about ${f.avgMonthlyK} a month` : 'Still falling, month after month',
        body: (f) =>
          (f.peakM
            ? `Enrollment had recovered to ${f.peakM} million by ${f.peakMonth}, then `
            : 'Enrollment ') +
          (f.fellEveryMonth
            ? 'fell every month once the new rules took effect in November.'
            : 'has fallen since the new rules took effect in November.'),
        subhead: (f) =>
          `Texans enrolled in SNAP each month (people, not households), ${f.snapRange}. ` +
          'Shaded: after H.R. 1 was signed.',
        chart: 'snapLine',
        sources: HHSC,
        measure: 'count',
      },
      {
        id: 'loss-who',
        title: (f) => `${f.youngShare} are children and working-age adults`,
        body: (f) =>
          `About ${f.childrenK} children and ${f.adultsK} adults ages 18–59 have left, while ` +
          `enrollment among Texans 65 and older barely moved (${f.seniorsPct}).`,
        subhead: (f) =>
          `Percent change in SNAP enrollment since ${f.windowStartLong}, by age group. Each line is ` +
          `indexed to its own ${f.windowStartLong} level (100 = no change; 81 = down 19%).`,
        chart: 'ageLines',
        sources: HHSC,
        measure: 'rate',
      },
      {
        id: 'loss-dollars',
        title: (f) =>
          f.shortfallM
            ? `$${f.shortfallM} million less reached Texas grocery stores`
            : 'Less is reaching Texas grocery stores',
        body: (f) =>
          f.shortfallM
            ? `From ${f.shortfallFrom} through ${f.shortfallTo}, payments ran $${f.shortfallM} million ` +
              `below ${f.baseMonth} levels, and are now down $${f.monthlyDownM} million a month ` +
              `(${f.monthlyDownPct}).`
            : 'Monthly SNAP payments have fallen since the new rules took effect.',
        subhead: (f) =>
          'Total SNAP benefits paid to Texas households each month, in millions of dollars. ' +
          `Hatched: the amount below the ${f.baseMonthYear} level.`,
        chart: 'shortfall',
        sources: HHSC,
        measure: 'count',
      },
    ],
  },
  {
    view: 'work',
    nav: 'Work requirements',
    steps: [
      {
        id: 'work-subject',
        title: (f) => `${f.newlySubjectK} Texans are newly subject to work rules`,
        body: (f) =>
          `That is about 1 in ${f.oneIn} SNAP enrollees, in big metros and small towns alike, ` +
          `and ${f.metroShare} of them live in metro counties.`,
        subhead:
          'Each dot is one county, grouped by type; the black tick is the median. Showing: newly ' +
          'subject per 100 enrollees.',
        chart: 'workStrip',
        sources: [{ label: 'Newly subject: H.R. 1 exposure model' }],
        layer: 'd1',
        measure: 'count',
      },
    ],
  },
  {
    view: 'children',
    nav: 'Children',
    steps: [
      {
        id: 'children-meals',
        title: 'Losing SNAP can also mean losing automatic school meals',
        body:
          'SNAP certifies children for free school meals without an application and helps schools ' +
          'qualify for community eligibility (CEP), so families that leave SNAP must now apply on ' +
          'their own.',
        subhead:
          'Statewide shares of Texas public school students. The figures come from different ' +
          'years; see sources.',
        chart: 'schoolMeals',
        sources: [
          { label: 'FRAC CEP fact sheet', href: 'https://frac.org/news/cepfactsheetsoct2025' },
          {
            label: 'TEA enrollment',
            href: 'https://tea.texas.gov/reports-and-data/school-performance/accountability-research/enrollment-trends',
          },
        ],
        measure: 'rate',
      },
      {
        id: 'children-rural',
        title: 'Rural counties are losing children’s benefits faster',
        body: (f) =>
          `Rural counties have lost ${f.childRural} of children on SNAP, against ${f.childMetro} in ` +
          'metro counties; the ranking leaves out the smallest caseloads, which swing widely.',
        subhead: (f) =>
          `Share of children on SNAP in ${f.windowStartLong} who were no longer enrolled in ` +
          `${f.windowEndLong}, by county type.`,
        chart: 'childTypes',
        sources: HHSC,
        measure: 'rate',
      },
    ],
  },
  {
    view: 'vulnerability',
    nav: 'Vulnerability index',
    steps: [
      {
        id: 'vuln-recipe',
        title: 'How the index is built',
        body:
          'Each measure is ranked across all 254 counties from 0 (least exposed) to 1 (most), each ' +
          'domain averages its measures, and the index adds the four domains for a score of 0 to 4.',
        chart: 'indexRecipe',
        sources: [{ label: 'Feeding Texas H.R. 1 vulnerability index' }],
        measure: 'rate',
      },
      {
        id: 'vuln-strip',
        title: 'Where each county sits on the index',
        body: (f) =>
          'Rural counties sit higher on the index than metro counties, with a median of ' +
          `${f.compRural} against ${f.compMetro}.`,
        subhead: 'Vulnerability index, 0–4, by county type; the black tick is the median.',
        chart: 'indexStrip',
        sources: [{ label: 'Feeding Texas H.R. 1 vulnerability index' }],
        measure: 'rate',
      },
    ],
  },
  {
    view: 'medicaid',
    nav: 'ACA Marketplace',
    steps: [
      {
        id: 'market-paid',
        title: (f) => (f.mktDrop ? `Paid enrollment fell by ${f.mktDrop}` : 'Paid enrollment fell'),
        body: (f) =>
          f.mktDropPct
            ? `Paid (effectuated) enrollment fell ${f.mktDropPct} between ${f.mktFrom} and ` +
              `${f.mktTo}, after the enhanced premium tax credits expired.`
            : 'Effectuated enrollment counts people who paid for an active plan.',
        subhead: (f) =>
          'Texans with a Marketplace plan they have paid for (effectuated enrollment), each month' +
          (f.mktRange ? `, ${f.mktRange}.` : '.'),
        chart: 'marketLine',
        sources: CMS,
        measure: 'count',
      },
      {
        id: 'market-never',
        title: (f) => (f.neverOneIn ? `1 in ${f.neverOneIn} sign-ups never paid` : 'More sign-ups never paid'),
        body: (f) =>
          f.neverLatest
            ? `Of the ${f.selLatestM} million Texans who picked a ${f.oepLatest} plan, ` +
              `${f.neverLatest} never paid or kept their coverage through February, up from ` +
              `${f.neverPrev} the year before.`
            : '',
        subhead:
          'Share of each year’s open-enrollment plan selections that were not paid for or active ' +
          'by February.',
        chart: 'neverPaid',
        sources: (f) => [{ label: 'CMS Marketplace data', href: f.oepSourceUrl ?? undefined }],
        sourceNote: 'OEP county PUF + monthly effectuated',
        measure: 'rate',
      },
    ],
  },
];

/** Resolve a piece of copy against the facts. */
const read = (copy, f) => (typeof copy === 'function' ? copy(f) : copy ?? null);

/**
 * The story with every piece of copy resolved to a string — what the rail, the
 * chapter bar and the phone caption render.
 *
 * @param {StoryChapter[]} chapters
 * @param {StoryFacts} f
 */
export function resolveChapters(chapters, f) {
  return chapters.map((c) => ({
    ...c,
    steps: c.steps.map((s) => ({
      ...s,
      title: read(s.title, f),
      body: read(s.body, f),
      subhead: read(s.subhead, f),
      sources: read(s.sources, f) ?? [],
    })),
  }));
}

/**
 * The story flattened to one list of scroll stops, each knowing its chapter.
 *
 * `hasMedicaid` drops the last chapter when the observed Medicaid file is
 * absent: the chapter's map is the Medicaid layer.
 *
 * @param {boolean} hasMedicaid
 */
export function buildStory(hasMedicaid) {
  const chapters = STORY.filter((c) => c.view !== 'medicaid' || hasMedicaid);
  const steps = [];
  chapters.forEach((chapter, ci) => {
    chapter.steps.forEach((step, si) => {
      steps.push({ ...step, chapter, chapterIndex: ci, stepInChapter: si });
    });
  });
  /** Index of each chapter's first step, for the chapter bar's jumps. */
  const firstStep = chapters.map((c) => steps.findIndex((s) => s.chapter === c));
  return { chapters, steps, firstStep };
}

/** The school-meals figures, from outside this dataset — see the step's sources. */
export const SCHOOL_MEALS = [
  { label: 'Students at CEP campuses', display: '≈49%', share: 0.49, note: '2.72M students, 2024–25' },
  {
    label: 'Free/reduced-price eligible',
    display: '62.2%',
    share: 0.622,
    note: 'economically disadvantaged, 2023–24',
  },
];

/** What goes into each domain of the index — rscripts/build_scores.R. */
export const INDEX_DOMAINS = [
  {
    name: 'Work-requirement exposure',
    measures: [
      'SNAP enrollees newly subject to work rules',
      'households newly subject',
      'veterans on SNAP',
      'students experiencing homelessness',
      'youth aging out of foster care',
    ],
  },
  {
    name: 'Citizenship and status',
    measures: [
      'non-citizens on SNAP',
      'non-citizen households',
      'mixed-status households',
      'limited-English households',
    ],
  },
  {
    name: 'Access to work',
    measures: [
      'residents working in their own county',
      'jobs per worker',
      'households without a vehicle',
      'households without internet',
      'unemployment',
      'low-wage job mix',
      'average weekly wage',
    ],
  },
  {
    name: 'Socioeconomic need',
    measures: ['residents below 165% of the poverty line', 'adults without a high-school diploma'],
  },
];
