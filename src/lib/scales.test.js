import { describe, expect, it } from 'vitest';
import {
  equalShareBins,
  niceRound,
  roundedQuantileBins,
  BINS_COMPOSITE,
  BINS_SCORE,
  binIndex,
  binsFor,
  colorFor,
  NO_DATA,
  rampFor,
} from './scales';

describe('bins', () => {
  it('uses build_scores.R:334 thresholds for domain layers', () => {
    expect([...BINS_SCORE]).toEqual([0, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0]);
    expect(binsFor('d1')).toBe(BINS_SCORE);
  });

  it('rebins the composite per spec §6.4', () => {
    expect([...BINS_COMPOSITE]).toEqual([0.8, 1.35, 1.65, 1.85, 2.05, 2.27, 2.66, 3.4]);
    expect(binsFor('composite')).toBe(BINS_COMPOSITE);
  });

  it('gives one colour per bin interval', () => {
    expect(rampFor('d1')).toHaveLength(BINS_SCORE.length - 1);
    expect(rampFor('composite')).toHaveLength(BINS_COMPOSITE.length - 1);
  });

  it('has no single ramp for the bivariate layer', () => {
    expect(rampFor('work_both')).toEqual([]);
  });
});

describe('binIndex', () => {
  const b = BINS_SCORE;

  it('places values in right-open intervals', () => {
    expect(binIndex(0, b)).toBe(0);
    expect(binIndex(0.199, b)).toBe(0);
    expect(binIndex(0.2, b)).toBe(1);
    expect(binIndex(0.85, b)).toBe(4);
    expect(binIndex(0.9, b)).toBe(5);
  });

  it('closes the top interval so p100 is not dropped', () => {
    expect(binIndex(1.0, b)).toBe(b.length - 2);
    expect(binIndex(1.5, b)).toBe(b.length - 2);
  });

  it('clamps below the first threshold rather than dropping', () => {
    expect(binIndex(-0.1, b)).toBe(0);
  });

  it('reports absence distinctly from zero', () => {
    expect(binIndex(null, b)).toBe(-1);
    expect(binIndex(undefined, b)).toBe(-1);
    expect(binIndex(NaN, b)).toBe(-1);
    expect(binIndex(0, b)).toBe(0);
  });
});

describe('colorFor', () => {
  it('maps the extremes to the ramp endpoints', () => {
    expect(colorFor(0, 'd1')).toBe('#F0F3F8');
    expect(colorFor(1, 'd1')).toBe('#0E3464');
  });

  it('renders absence as warm grey, never a ramp colour', () => {
    expect(colorFor(null, 'd1')).toBe(NO_DATA);
    expect(rampFor('d1')).not.toContain(NO_DATA);
  });

  it('falls back to no-data for a layer with no ramp', () => {
    expect(colorFor(0.5, 'work_both')).toBe(NO_DATA);
  });

  it('uses the composite scale on a 0–4 value', () => {
    // 2.0 sits in the [1.85, 2.05) interval → index 3 of the composite ramp.
    expect(colorFor(2.0, 'composite')).toBe(rampFor('composite')[3]);
  });
});

describe('niceRound, roundedQuantileBins, equalShareBins', () => {
  it('rounds to the 1 / 2.5 / 5 ladder', () => {
    expect([120, 331, 703, 1956, 0].map(niceRound)).toEqual([100, 250, 500, 2500, 0]);
  });

  it('gives five classes of nice, strictly increasing edges, 0 to the max', () => {
    const values = Array.from({ length: 254 }, (_, i) => Math.round(10 * 1.04 ** i));
    const bins = roundedQuantileBins(values, 5);
    expect(bins).toHaveLength(6);
    expect(bins[0]).toBe(0);
    expect(bins[5]).toBe(Math.max(...values));
    for (let i = 1; i < bins.length; i++) expect(bins[i]).toBeGreaterThan(bins[i - 1]);
    for (const e of bins.slice(1, -1)) expect(niceRound(e)).toBe(e);
  });

  it('never collapses a class when quintiles round to the same number', () => {
    const bins = roundedQuantileBins([0, 0, 0, 0, 1, 1, 1, 2, 2, 3], 5);
    for (let i = 1; i < bins.length; i++) expect(bins[i]).toBeGreaterThan(bins[i - 1]);
  });

  it('steps the share lost in whole percents up to the 98th percentile', () => {
    // 28% at the top → steps of 6: 0 / 6 / 12 / 18 / 24, open to 100%.
    const shares = Array.from({ length: 100 }, (_, i) => (i / 99) * 0.28);
    expect(equalShareBins(shares, 5)).toEqual([0, 0.06, 0.12, 0.18, 0.24, 1]);
  });
});
