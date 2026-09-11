import { describe, expect, it } from 'vitest';
import { buildLayerValues, formatLayerValue, fractionOf } from './layerValues';
import {
  binIndex,
  bivariateColor,
  bivariatePalette,
  BIVARIATE_CORNERS,
  BIVARIATE_STEPS,
  NO_DATA,
  quantileBins,
} from './scales';
import { defaultLayerFor, layerByKey, viewForLayer, VIEWS } from '../config/layers';
/**
 * @typedef {import('../types').County} County
 */

/** Only the fields these functions touch; the rest of §3.1 is irrelevant here. */
const county = (
  geoid,
  enrolled,
  children,
  over = {},
) =>
  ({
    geoid,
    name: geoid,
    pop: 50_000,
    d1_score: 0.5,
    d3_score: 0.5,
    vulnerability_score: 2,
    newly_subject_persons: 1_000,
    snap_enrolled: enrolled,
    snap_children: children,
    small_denominator: false,
    ...over,
  });

// Three counties over two months: a heavy loser, a light loser, and one that grew.
const COUNTIES = [
  county('a', [1000, 800], [400, 300]),
  county('b', [1000, 950], [400, 390]),
  county('c', [1000, 1050], [400, 410]),
];

describe('windowed loss layers', () => {
  it('reads loss as a share of the county’s own window-start caseload', () => {
    const v = buildLayerValues(COUNTIES, 'loss', 0, 1);
    expect(v.fill.get('a')).toBeCloseTo(0.2);
    expect(v.fill.get('b')).toBeCloseTo(0.05);
  });

  it('floors a county that grew at zero rather than showing a negative loss', () => {
    const v = buildLayerValues(COUNTIES, 'loss', 0, 1);
    expect(v.fill.get('c')).toBe(0);
    expect(v.count?.get('c')).toBe(0);
  });

  it('counts people, not shares, for the proportional-symbol map', () => {
    const v = buildLayerValues(COUNTIES, 'loss', 0, 1);
    expect(v.count?.get('a')).toBe(200);
    expect(v.maxCount).toBe(200);
  });

  it('reads the child series on the children layer', () => {
    const v = buildLayerValues(COUNTIES, 'child_loss', 0, 1);
    expect(v.fill.get('a')).toBeCloseTo(0.25);
    expect(v.count?.get('a')).toBe(100);
  });

  it('shows a missing series as no data, not as zero loss', () => {
    const missing = [county('z', [1000, 900], undefined)];
    const v = buildLayerValues(missing, 'child_loss', 0, 1);
    expect(v.fill.get('z')).toBeNull();
  });

  it('anchors its bands to the statewide loss over the same window', () => {
    const v = buildLayerValues(COUNTIES, 'loss', 0, 1);
    // 3,000 enrolled at the start, 2,800 at the end — but the county that grew
    // still counts in the denominator and the numerator.
    expect(v.statewideShare).toBeCloseTo(200 / 3000);
    // Midpoint of the ramp is "losing at the Texas rate".
    expect(v.bins[3]).toBeCloseTo(0.95 * v.statewideShare);
  });

  it('keeps its contrast when the window changes length', () => {
    // The same counties losing at the same relative pace over a window twice as
    // long must land in the same bins — that is the point of the anchor.
    const short = [county('a', [1000, 900], [1, 1]), county('b', [1000, 975], [1, 1])];
    const long = [county('a', [1000, 800], [1, 1]), county('b', [1000, 950], [1, 1])];
    const vs = buildLayerValues(short, 'loss', 0, 1);
    const vl = buildLayerValues(long, 'loss', 0, 1);
    for (const geoid of ['a', 'b']) {
      expect(binIndex(vs.fill.get(geoid), vs.bins)).toBe(binIndex(vl.fill.get(geoid), vl.bins));
    }
  });

  it('falls back to a spread rather than collapsing when nobody lost anyone', () => {
    const flat = [county('a', [1000, 1000], [1, 1])];
    const v = buildLayerValues(flat, 'loss', 0, 1);
    expect(v.statewideShare).toBe(0);
    // Strictly increasing, or binIndex has nothing to cut on.
    for (let i = 1; i < v.bins.length; i++) expect(v.bins[i]).toBeGreaterThan(v.bins[i - 1]);
  });
});

describe('score layers still read their columns', () => {
  it('reads the percentile column and the count field', () => {
    const v = buildLayerValues(COUNTIES, 'd1', 0, 1);
    expect(v.fill.get('a')).toBe(0.5);
    expect(v.count?.get('a')).toBe(1_000);
  });

  it('has no count map where the layer has no count basis (C-03)', () => {
    expect(buildLayerValues(COUNTIES, 'd3', 0, 1).count).toBeNull();
    expect(buildLayerValues(COUNTIES, 'composite', 0, 1).count).toBeNull();
  });
});

describe('formatting keeps the three units apart', () => {
  it('labels a percentile, a composite sum and a loss share differently', () => {
    expect(formatLayerValue('d1', 0.61)).toBe('p61');
    expect(formatLayerValue('composite', 2.345)).toBe('2.35');
    expect(formatLayerValue('loss', 0.152)).toBe('−15.2%');
    expect(formatLayerValue('loss', null)).toBe('—');
  });
});

describe('rank-list bar fractions', () => {
  it('scales a loss share against the layer’s own top band', () => {
    const v = buildLayerValues(COUNTIES, 'loss', 0, 1);
    const top = v.bins[v.bins.length - 2];
    expect(fractionOf('loss', top, v)).toBeCloseTo(1);
    expect(fractionOf('loss', top / 2, v)).toBeCloseTo(0.5);
  });

  it('clamps rather than overflowing past the top band', () => {
    const v = buildLayerValues(COUNTIES, 'loss', 0, 1);
    expect(fractionOf('loss', 0.99, v)).toBe(1);
  });

  it('puts the composite on its 0–4 scale', () => {
    expect(fractionOf('composite', 2)).toBe(0.5);
  });
});

describe('views and layers cannot drift apart', () => {
  it('round-trips every view through its default layer', () => {
    for (const v of VIEWS) {
      expect(viewForLayer(defaultLayerFor(v.key)).key).toBe(v.key);
    }
  });

  it('maps every metric of every view back to that view', () => {
    for (const v of VIEWS) {
      for (const layer of v.metrics) expect(viewForLayer(layer).key).toBe(v.key);
    }
  });

  it('is four views, and exactly one of them draws capacity', () => {
    expect(VIEWS).toHaveLength(4);
    expect(VIEWS.filter((v) => v.showCapacity).map((v) => v.key)).toEqual(['vulnerability']);
  });

  it('sends a domain with no view of its own to the default view', () => {
    // d2 and d4 lost their strip cards in the rework but still open a valid page.
    expect(viewForLayer('d2').key).toBe('loss');
    expect(viewForLayer('d4').key).toBe('loss');
  });
});

// --------------------------------------------------------------- bivariate

describe('the bivariate work layer', () => {
  // Caseloads chosen so the newly-subject SHARE is not just a restatement of
  // population: c has the smallest caseload and so the largest share.
  const BIV = [
    county('a', [1000, 900], [1, 1], { newly_subject_persons: 100, d3_score: 0.1 }),
    county('b', [1000, 900], [1, 1], { newly_subject_persons: 200, d3_score: 0.5 }),
    county('c', [500, 450], [1, 1], { newly_subject_persons: 200, d3_score: 0.9 }),
  ];

  it('reads the red axis as newly-subject over the county’s own caseload', () => {
    const v = buildLayerValues(BIV, 'work_both', 0, 1);
    expect(v.fill.get('a')).toBeCloseTo(0.1);
    expect(v.fill.get('b')).toBeCloseTo(0.2);
    expect(v.fill.get('c')).toBeCloseTo(0.4);
  });

  it('carries D3 as a second axis, in its published direction', () => {
    const v = buildLayerValues(BIV, 'work_both', 0, 1);
    expect(v.secondary?.fill.get('a')).toBe(0.1);
    expect(v.secondary?.fill.get('c')).toBe(0.9);
  });

  it('has no count basis — one symbol cannot size two measures', () => {
    const v = buildLayerValues(BIV, 'work_both', 0, 1);
    expect(v.count).toBeNull();
  });

  it('is the only layer that hands down a second axis', () => {
    for (const layer of ['loss', 'child_loss', 'd1', 'd3', 'composite']) {
      expect(buildLayerValues(BIV, layer, 0, 1).secondary).toBeUndefined();
    }
    expect(buildLayerValues(BIV, 'work_both', 0, 1).secondary).toBeDefined();
  });

  it('labels both axes with their direction, so the map cannot be misread', () => {
    const axes = layerByKey('work_both').axes;
    expect(axes).toHaveLength(2);
    // Both axes must point toward difficulty, or the darkest corner is nonsense.
    expect(axes?.[1].label).toMatch(/harder/i);
  });
});

describe('the bivariate colour scheme', () => {
  it('puts the four corners of the palette at the declared corners', () => {
    const g = bivariatePalette(BIVARIATE_STEPS);
    const last = BIVARIATE_STEPS - 1;
    expect(g[0][0].toUpperCase()).toBe(BIVARIATE_CORNERS.lowLow);
    expect(g[0][last].toUpperCase()).toBe(BIVARIATE_CORNERS.highA);
    expect(g[last][0].toUpperCase()).toBe(BIVARIATE_CORNERS.highB);
    expect(g[last][last].toUpperCase()).toBe(BIVARIATE_CORNERS.highBoth);
  });

  it('is a square matrix of valid hex, one row per class', () => {
    const g = bivariatePalette(3);
    expect(g).toHaveLength(3);
    for (const row of g) {
      expect(row).toHaveLength(3);
      for (const c of row) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  /**
   * The invariant the first draft of this scheme got wrong: a darker red than
   * blue made "work is unreachable here" look as urgent as "unreachable AND a
   * big exposed caseload". Lightness must encode how much of BOTH, nothing else.
   */
  it('keeps the two single-high corners at the same lightness', () => {
    const g = bivariatePalette(3);
    const lum = (hex) => {
      const [r, gr, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    };
    const redOnly = lum(g[0][2]);
    const blueOnly = lum(g[2][0]);
    expect(Math.abs(redOnly - blueOnly)).toBeLessThan(6);
    // And the joint corner has to be clearly darker than either on its own.
    expect(lum(g[2][2])).toBeLessThan(Math.min(redOnly, blueOnly) - 25);
  });

  it('keeps every adjacent pair of classes visually distinct', () => {
    const g = bivariatePalette(3);
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const dist = (x, y) =>
      Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i]));
    for (let b = 0; b < 3; b++) {
      for (let a = 0; a < 3; a++) {
        if (a < 2) expect(dist(g[b][a], g[b][a + 1])).toBeGreaterThan(25);
        if (b < 2) expect(dist(g[b][a], g[b + 1][a])).toBeGreaterThan(25);
      }
    }
  });

  it('darkens toward the both-high corner', () => {
    const g = bivariatePalette(3);
    const lum = (hex) =>
      [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(g[2][2])).toBeLessThan(lum(g[0][0]));
    expect(lum(g[2][2])).toBeLessThan(lum(g[0][2]));
    expect(lum(g[2][2])).toBeLessThan(lum(g[2][0]));
  });

  it('treats either axis missing as absence, not as a low reading', () => {
    const bins = [0, 0.33, 0.66, 1];
    expect(bivariateColor(null, bins, 0.9, bins)).toBe(NO_DATA);
    expect(bivariateColor(0.9, bins, null, bins)).toBe(NO_DATA);
    expect(bivariateColor(0.9, bins, 0.9, bins)).not.toBe(NO_DATA);
  });

  it('sends the two single-high inputs to different colours', () => {
    const bins = [0, 0.33, 0.66, 1];
    expect(bivariateColor(0.9, bins, 0.1, bins)).not.toBe(bivariateColor(0.1, bins, 0.9, bins));
  });
});

describe('quantileBins', () => {
  it('splits into equal-count classes', () => {
    const bins = quantileBins([1, 2, 3, 4, 5, 6, 7, 8, 9], 3);
    const counts = [0, 0, 0];
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9]) counts[binIndex(v, bins)] += 1;
    expect(counts).toEqual([3, 3, 3]);
  });

  it('keeps edges strictly increasing when every value is tied', () => {
    const bins = quantileBins([5, 5, 5, 5], 3);
    for (let i = 1; i < bins.length; i++) expect(bins[i]).toBeGreaterThan(bins[i - 1]);
  });

  it('returns usable edges for an empty set rather than throwing', () => {
    const bins = quantileBins([], 3);
    expect(bins).toHaveLength(4);
    expect(binIndex(0.5, bins)).toBeGreaterThanOrEqual(0);
  });
});

describe('per-view tooltip specs', () => {
  const spec = (key) => viewForLayer(key).tooltip;

  it('shows the domain spread on the vulnerability index and nowhere else', () => {
    expect(spec('composite').domains).toBe(true);
    for (const layer of ['loss', 'child_loss', 'd1', 'd3', 'work_both']) {
      expect(spec(layer).domains).toBe(false);
    }
  });

  it('shows listed assistance sites only where the map draws them', () => {
    for (const v of VIEWS) {
      expect(v.tooltip.capacity).toBe(v.showCapacity);
    }
  });

  it('ends the work view on exposure bars, and the loss views on the caseload line', () => {
    expect(spec('d1').chart).toBe('exposure');
    expect(spec('d3').chart).toBe('exposure');
    expect(spec('work_both').chart).toBe('exposure');
    expect(spec('loss').chart).toBe('enrollment');
    expect(spec('child_loss').chart).toBe('enrollment');
  });

  /**
   * The index panel is the longest of the four — five domain bands plus four
   * capacity rows — and the caseload line was the one element on it that said
   * nothing about the index. Dropped 2026-09-11.
   */
  it('gives the vulnerability index no chart at all', () => {
    expect(spec('composite').chart).toBe('none');
  });

  it('gives the children view the same treatment as benefits lost', () => {
    expect(spec('child_loss')).toEqual(spec('loss'));
  });
});
