/**
 * Layer definitions — spec §6.4. Order here is the order of the layer strip.
 *
 * The composite sits last and is visually demoted on purpose: "publishing the
 * sub-scores is the point of the framework" (§11).
 *
 * Ramps live in src/lib/scales.ts, traceable to build_scores.R. Do not put
 * colours here.
 */
import type { LayerKey } from '../types';

export interface LayerDef {
  key: LayerKey;
  /** Layer-strip card title, matching the wireframe. */
  label: string;
  /** Formal name for the map panel header (§6.5). */
  formalName: string;
  /** Two to three sentences of layer-specific copy for the panel (§6.5). */
  copy: string;
  /** Component count, rendered on every panel (§6.5). null where unsourced. */
  components: number | null;
  /** The count-measure field, or null where the layer has no count basis (C-03). */
  countField: 'newly_subject_persons' | 'noncit_snap_persons' | null;
  /** Why there is no count, shown in the C-03 panel. */
  noCountReason?: string;
  /** False until a source column exists — see §3 warning and §12. */
  available: boolean;
  /** Extra note for the strip card. */
  note?: string;
}

export const LAYERS: LayerDef[] = [
  {
    key: 'd1',
    label: 'Work requirements',
    formalName: 'D1 — Work-requirement exposure',
    copy:
      'Where H.R. 1’s expanded work requirements reach the most people. Built from the ' +
      'population newly subject to the requirement, plus veterans, people experiencing ' +
      'homelessness, and young adults ageing out of foster care. The newly-subject estimate is ' +
      'PUMS-modelled, not a lookup.',
    components: 5,
    countField: 'newly_subject_persons',
    available: true,
  },
  {
    key: 'd4',
    label: 'Socioeconomic Need',
    formalName: 'D4 — Socioeconomic need',
    copy:
      'Baseline need: the share of residents below 165% of the federal poverty level and the ' +
      'share of adults without a high-school credential. Only two components, so this layer ' +
      'moves less than the others and should be read as context rather than exposure.',
    components: 2,
    countField: null,
    noCountReason:
      'D4 is built from two population shares. There is no count of people “in socioeconomic need” ' +
      'to map — inventing a denominator would invent a finding.',
    available: true,
  },
  {
    key: 'd3',
    label: 'Access to work',
    formalName: 'D3 — Access to work',
    copy:
      'Whether meeting a work requirement is practical where someone lives: in-county employment ' +
      'share, jobs per worker, vehicle and internet access, unemployment, the low-wage mix, and ' +
      'average weekly wage. Seven components, the widest of the four domains.',
    components: 7,
    countField: null,
    noCountReason:
      'D3 combines seven rates describing local labour-market conditions. No count basis exists.',
    available: true,
  },
  {
    key: 'd2',
    label: 'Citizenship',
    formalName: 'D2 — Citizenship and status',
    copy:
      'Households affected by H.R. 1’s eligibility restrictions tied to immigration status, ' +
      'including mixed-status households and households with limited English proficiency. This ' +
      'layer runs opposite D1 (r = −0.30) — the counties most exposed here are not the ones most ' +
      'exposed to work requirements.',
    components: 4,
    countField: 'noncit_snap_persons',
    available: true,
    note: 'Runs opposite D1 at r = −0.30',
  },
  {
    key: 'd5',
    label: 'Children',
    formalName: 'D5 — Children',
    copy: 'Not yet defined.',
    components: null,
    countField: null,
    // §3 warning: there is no d5_* column in vulnerability_county.csv, and the
    // spec forbids synthesising one from the statewide SNAP age bands.
    available: false,
    note: 'No source column yet — see build spec §3',
  },
  {
    key: 'composite',
    label: 'Vulnerability Index',
    formalName: 'Composite vulnerability index',
    copy:
      'The four domain percentiles summed onto a 0–4 scale. Shown last and deliberately demoted: ' +
      'the sub-scores are the framework’s point, and averaging them hides the one domain telling a ' +
      'non-border story.',
    components: 4,
    countField: null,
    noCountReason:
      'The composite sums four percentiles. A count of a percentile sum is not a quantity of anything.',
    available: true,
  },
];

/** Only the layers that can actually be shown (§12: five entries until d5 exists). */
export const VISIBLE_LAYERS = LAYERS.filter((l) => l.available);

export const layerByKey = (key: LayerKey): LayerDef =>
  LAYERS.find((l) => l.key === key) ?? LAYERS[0];

/** The score field a layer reads for its fill. */
export function scoreField(key: LayerKey): keyof import('../types').County {
  return key === 'composite'
    ? 'vulnerability_score'
    : (`${key}_score` as keyof import('../types').County);
}

export const INFRA_TYPES = [
  { key: 'food_bank', label: 'Food bank enrollment site', glyph: 'square', source: 'Feeding Texas partner registry' },
  { key: 'cms_navigator', label: 'CMS-funded navigator', glyph: 'circle', source: '149 counties have none' },
  { key: 'chw', label: 'CHW / promotor network', glyph: 'diamond', source: 'DSHS-certified' },
  { key: 'counselor', label: 'Certified application counselor', glyph: 'plus', source: 'CMS assister locator' },
] as const;
