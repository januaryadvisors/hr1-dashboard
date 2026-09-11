import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AXES,
  gapQuadrantApplies,
  METRICS,
  metricById,
  metricsForView,
  type MetricContext,
} from './metrics';
import { VIEWS } from './layers';
import type { County } from '../types';

const CTX: MetricContext = { i0: 0, i1: 2 };

const county = (over: Partial<County> = {}): County =>
  ({
    geoid: '48001',
    name: 'Alpha',
    pop: 20_000,
    snap_enrolled: [1000, 900, 800],
    snap_children: [400, 360, 300],
    d1_score: 0.4,
    d2_score: 0.5,
    d3_score: 0.6,
    d4_score: 0.7,
    vulnerability_score: 2.2,
    cumulative_impact: 1,
    newly_subject_persons: 250,
    infra: { food_bank: 2, cms_navigator: 0, chw: 1, counselor: 1 },
    is_gap: false,
    small_denominator: false,
    ...over,
  }) as County;

describe('registry integrity', () => {
  it('has unique ids', () => {
    const ids = METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers every metric to at least one view', () => {
    for (const m of METRICS) expect(m.views.length).toBeGreaterThan(0);
  });

  it('resolves every view default to a metric that view actually offers', () => {
    for (const v of VIEWS) {
      const { x, y } = DEFAULT_AXES[v.key];
      const offered = metricsForView(v.key).map((m) => m.id);
      expect(offered).toContain(x);
      expect(offered).toContain(y);
    }
  });

  /**
   * The tinted corner means "much of a bad thing, little of a good one", so
   * every view has to open on a pair that supports it — otherwise the section's
   * whole premise is hidden by default.
   */
  it('opens every view on a pair the gap quadrant applies to', () => {
    for (const v of VIEWS) {
      const { x, y } = DEFAULT_AXES[v.key];
      expect(gapQuadrantApplies(metricById(x), metricById(y))).toBe(true);
    }
  });

  it('falls back to a real metric for an unknown id', () => {
    expect(metricById('nope').id).toBe(METRICS[0].id);
  });
});

describe('values', () => {
  it('reads the loss share as a positive fraction of the start caseload', () => {
    expect(metricById('loss_share').value(county(), CTX)).toBeCloseTo(0.2);
  });

  /**
   * Counts on a linear axis pile 250 counties against the left edge, which is
   * why the defaults are shares. The counts stay available — "targeting by
   * count" is a legitimate argument (§8 tab 5) — they are just not the opening
   * view.
   */
  it('keeps the headcounts available but out of the defaults', () => {
    expect(metricById('loss_people').value(county(), CTX)).toBe(200);
    expect(Object.values(DEFAULT_AXES).map((a) => a.x)).not.toContain('loss_people');
  });

  it('reads the child series for the child metrics', () => {
    expect(metricById('child_loss_share').value(county(), CTX)).toBeCloseTo(0.25);
    expect(metricById('child_loss_people').value(county(), CTX)).toBe(100);
    expect(metricById('child_share').value(county(), CTX)).toBeCloseTo(300 / 800);
  });

  it('sums the four registries for capacity', () => {
    expect(metricById('sites_total').value(county(), CTX)).toBe(4);
    expect(metricById('sites_per_10k').value(county(), CTX)).toBeCloseTo(2);
  });

  it('reports newly subject as a share of the window-start caseload', () => {
    expect(metricById('subject_share').value(county(), CTX)).toBeCloseTo(0.25);
  });

  it('returns null rather than Infinity when a denominator is zero', () => {
    const empty = county({ snap_enrolled: [0, 0, 0], pop: 0 });
    for (const id of ['loss_share', 'participation', 'subject_share', 'sites_per_10k']) {
      expect(metricById(id).value(empty, CTX)).toBeNull();
    }
  });

  it('returns null for a missing series rather than treating it as zero', () => {
    const noKids = county({ snap_children: undefined as unknown as number[] });
    expect(metricById('child_loss_share').value(noKids, CTX)).toBeNull();
    expect(metricById('child_now').value(noKids, CTX)).toBeNull();
  });

  it('formats each metric in its own unit', () => {
    expect(metricById('loss_share').format(0.178)).toBe('17.8%');
    expect(metricById('d1').format(0.4)).toBe('p40');
    expect(metricById('vulnerability').format(2.2)).toBe('2.20');
    expect(metricById('loss_people').format(1234)).toBe('1,234');
  });
});

describe('gapQuadrantApplies', () => {
  it('holds only for need against capacity', () => {
    expect(gapQuadrantApplies(metricById('loss_share'), metricById('sites_per_10k'))).toBe(true);
  });

  it('is false when both axes point the same way', () => {
    expect(gapQuadrantApplies(metricById('loss_share'), metricById('d1'))).toBe(false);
    expect(gapQuadrantApplies(metricById('sites_per_10k'), metricById('sites_total'))).toBe(false);
  });

  /**
   * A signed change metric is 'better-high' (a loss is negative), so pairing it
   * as x would put the tint on the counties that GAINED caseload.
   */
  it('is false for a signed change on the x axis', () => {
    expect(gapQuadrantApplies(metricById('loss_pct'), metricById('sites_per_10k'))).toBe(false);
  });

  it('is false when either axis is neutral', () => {
    expect(gapQuadrantApplies(metricById('pop'), metricById('sites_per_10k'))).toBe(false);
  });
});
