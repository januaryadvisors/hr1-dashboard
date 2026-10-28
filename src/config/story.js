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
 * COPY is the client's. EVERY FIGURE IN IT IS COMPUTED: titles, bodies and subheads are functions of
 * `StoryFacts` (built in MapPage from the loaded data and the brush window), so
 * the words and the chart beside them cannot disagree and neither goes stale
 * when a month lands.
 *
 * @typedef {import('../types').LayerKey} LayerKey
 * @typedef {import('../types').Measure} Measure
 * @typedef {import('../types').ViewKey} ViewKey
 */
import { DOMAINS } from './layers';

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
 * @property {'snapLine' | 'ageLines' | 'shortfall' | 'workStrip' | 'childTypes'
 *   | 'indexRecipe' | 'indexStrip' | 'marketLine' | 'neverPaid'} [chart]
 *   A static figure MapPage renders. The rail holds figures to read, never
 *   controls — those live in Map options.
 * @property {StorySource[] | ((f: StoryFacts) => StorySource[])} [sources]
 * @property {string} [sourceNote] - Plain text after the linked sources.
 * @property {LayerKey} [layer] - Defaults to the chapter view's first metric.
 * @property {Measure} [measure] - Omitted: keep the reader's choice, falling back to rate where the
 *   layer has no count basis (C-03) so a step never opens on the "no count" callout.
 * @property {boolean} [capacity] - On the index view, whether the assistance marks (or the grid's
 *   bars) draw on arrival. Default off: the index reads first on its own, and the
 *   reader turns the assistance on with the map's "Index + assistance" switch.
 * @property {'grid'} [mapStyle] - Draws the hero map as the equal-size tile grid for this step only,
 *   whatever the reader's Geo/Density choice. Grid is not a reader-selectable style — it exists
 *   for the one step that needs a square per county.
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
        // "Still falling" only while the latest month is down; MapPage checks. The
        // figure is the average since the rules took effect, so the title says so
        // rather than reading as this month's loss.
        title: (f) =>
          !f.avgMonthlyK
            ? 'Down since the new rules took effect'
            : f.stillFalling
              ? `Still falling: about ${f.avgMonthlyK} a month since ${f.rulesMonth}`
              : `Down about ${f.avgMonthlyK} a month since ${f.rulesMonth}`,
        body: (f) =>
          f.fellEveryMonth
            ? 'Enrollment has fallen every month since the new rules took effect.'
            : 'Enrollment has fallen since the new rules took effect.',
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
          `About ${f.childrenK} children and ${f.adultsK} adults ages 18–59 have left SNAP.`,
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
            ? `An estimated $${f.shortfallM} million ${f.shortfallMore ? 'more' : 'less'} reached Texas grocery stores`
            : 'SNAP payments to Texas grocery stores',
        body: (f) =>
          f.shortfallM
            ? `From ${f.shortfallFrom} through ${f.shortfallTo}, SNAP payments ran a net $${f.shortfallM} ` +
              `million ${f.shortfallMore ? 'above' : 'below'} the average month of the year before H.R. 1 was signed ` +
              `(${f.baseRange}).`
            : 'Total SNAP benefits paid each month since H.R. 1 was signed.',
        subhead: (f) =>
          'Total SNAP benefits paid to Texas households each month, in millions of dollars. ' +
          `Hatched: the amount below the ${f.baseRange} monthly average.`,
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
        body: (f) => `That is about 1 in ${f.oneIn} SNAP enrollees.`,
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
        id: 'children-rural',
        title: (f) =>
          f.childFaster
            ? `${f.childFaster} counties are losing children’s benefits faster`
            : 'Children’s benefits lost, by county type',
        body: (f) =>
          `Rural counties have lost ${f.childRural} of children on SNAP, against ${f.childMetro} in ` +
          'metro counties.',
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
        capacity: false,
        title: 'How the index is built',
        // No copy: the recipe chart explains itself.
        body: '',
        chart: 'indexRecipe',
        sources: [{ label: 'Feeding Texas H.R. 1 vulnerability index' }],
        measure: 'rate',
      },
      {
        id: 'vuln-strip',
        title: 'Where each county sits on the index',
        body: (f) =>
          `Rural counties sit highest on our vulnerability index, with a median score of ${f.compRural}.`,
        subhead: 'Vulnerability index, 0–4, by county type; the black tick is the median.',
        chart: 'indexStrip',
        sources: [{ label: 'Feeding Texas H.R. 1 vulnerability index' }],
        measure: 'rate',
        // One square per county, with the listed-assistance bars inside each.
        mapStyle: 'grid',
        capacity: true,
      },
    ],
  },
  {
    view: 'aca',
    nav: 'ACA Marketplace',
    steps: [
      {
        id: 'market-paid',
        title: (f) => (f.mktDrop ? `Paid enrollment fell by ${f.mktDrop}` : 'Paid Marketplace enrollment'),
        body: (f) =>
          f.mktDropPct
            ? `Paid (effectuated) enrollment fell ${f.mktDropPct} between ${f.mktFrom} and ${f.mktTo}.`
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
        title: (f) => (f.neverOneIn ? `1 in ${f.neverOneIn} sign-ups never paid` : 'Sign-ups that never paid'),
        body: (f) =>
          f.neverLatest
            ? `Of the ${f.selLatestM} million Texans who picked a ${f.oepLatest} plan, ` +
              `${f.neverLatest} never paid for or kept their coverage through February.`
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

/** The story flattened to one list of scroll stops, each knowing its chapter. */
export function buildStory() {
  const steps = [];
  STORY.forEach((chapter, ci) => {
    chapter.steps.forEach((step, si) => {
      steps.push({ ...step, chapter, chapterIndex: ci, stepInChapter: si });
    });
  });
  /** Index of each chapter's first step, for the chapter bar's jumps. */
  const firstStep = STORY.map((c) => steps.findIndex((s) => s.chapter === c));
  return { chapters: STORY, steps, firstStep };
}

/** What goes into each domain of the index, for the recipe chart. */
export const INDEX_DOMAINS = DOMAINS.map((d) => ({ name: d.formalName, measures: d.measures }));
