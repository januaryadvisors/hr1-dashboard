import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  METRICS,
  metricById,
  metricsForView,
  presetById,
  PRESET_FOR_VIEW,
  SCATTER_PRESETS,
  splitQuadrants,
} from './metrics';
/**
 * @typedef {import('./metrics').MetricContext} MetricContext
 */
import { VIEWS } from './layers';
/**
 * @typedef {import('../types').County} County
 */

const CTX = { i0: 0, i1: 2 };

const county = (over = {}) =>
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
  });

describe('registry integrity', () => {
  it('has unique ids', () => {
    const ids = METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers every metric to at least one view', () => {
    for (const m of METRICS) expect(m.views.length).toBeGreaterThan(0);
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
  it('keeps the headcounts available but off the preset axes', () => {
    expect(metricById('loss_people').value(county(), CTX)).toBe(200);
    const axes = SCATTER_PRESETS.flatMap((p) => [p.x, p.y]);
    expect(axes).not.toContain('loss_people');
    expect(axes).not.toContain('child_loss_people');
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

  it('skips an unsourced registry rather than reading it as a count', () => {
    const real = county({ infra: { food_bank: null, cms_navigator: 2, chw: 1, counselor: null } });
    expect(metricById('sites_total').value(real, CTX)).toBe(3);
  });

  it('splits a zero-inflated axis at none-listed, not at a median of zero', () => {
    const points = [0, 0, 0, 0, 0, 0, 2, 5].map((y, i) => ({ x: i, y }));
    const median = splitQuadrants(points);
    const any = splitQuadrants(points, 'any');
    // At the median (0) every point is "hi" and the lower half is empty…
    expect(points.filter((p) => !median.isHiY(p))).toHaveLength(0);
    // …where none/any puts the six zeros below the line.
    expect(points.filter((p) => !any.isHiY(p))).toHaveLength(6);
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
    const noKids = county({ snap_children: undefined });
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

describe('scatter presets', () => {
  it('resolves both axes of every preset to a real metric', () => {
    for (const p of SCATTER_PRESETS) {
      expect(METRICS.map((m) => m.id)).toContain(p.x);
      expect(METRICS.map((m) => m.id)).toContain(p.y);
    }
  });

  it('names all four quadrants exactly once', () => {
    const corners = ['lo-lo', 'lo-hi', 'hi-lo', 'hi-hi'];
    for (const p of SCATTER_PRESETS) {
      expect(p.quadrants).toHaveLength(4);
      expect(p.quadrants.map((q) => q.corner).sort()).toEqual([...corners].sort());
      for (const q of p.quadrants) expect(q.label.length).toBeGreaterThan(0);
    }
  });

  /**
   * The tint is the section's finding. A preset with none is a chart with no
   * point; a preset where everything is the finding is a chart that cries wolf.
   */
  it('marks at least one quadrant as the concern, and never all four', () => {
    for (const p of SCATTER_PRESETS) {
      const flagged = p.quadrants.filter((q) => q.concern).length;
      expect(flagged).toBeGreaterThan(0);
      expect(flagged).toBeLessThan(4);
    }
  });

  /**
   * The corner has to follow the metrics' own `direction`. On two worse-high
   * axes the worry is high-high; on need against capacity it is high-low. Get
   * this backwards and the chart tints the counties doing best.
   */
  it('puts the concern in the corner the axis directions imply', () => {
    const worst = (m, axis) => {
      if (m.direction === 'worse-high') return 'hi';
      if (m.direction === 'better-high') return 'lo';
      return null; // neutral: the preset author decides, so nothing to check
    };
    for (const p of SCATTER_PRESETS) {
      const wx = worst(metricById(p.x));
      const wy = worst(metricById(p.y));
      for (const q of p.quadrants.filter((c) => c.concern)) {
        const [qx, qy] = q.corner.split('-');
        // children-share is the deliberate exception: its finding is the
        // DISPROPORTION, so low overall loss against high child loss.
        if (p.id === 'children-share') continue;
        if (wx) expect(qx).toBe(wx);
        if (wy) expect(qy).toBe(wy);
      }
    }
  });

  it('gives every map view a preset, and every preset id resolves', () => {
    for (const v of VIEWS) {
      const id = PRESET_FOR_VIEW[v.key];
      expect(id).toBeTruthy();
      expect(presetById(id).id).toBe(id);
    }
  });

  it('falls back to a real preset for an unknown id', () => {
    expect(presetById('nope').id).toBe(SCATTER_PRESETS[0].id);
  });

  /**
   * THE GUARD THAT MATTERS: run every preset against the committed county data
   * and check its quadrants are not degenerate.
   *
   * This is not hypothetical. The children preset originally paired child loss
   * share against overall loss share — the obvious reading of the question —
   * and the fixtures derive one from the other, so the two correlated at
   * r = 0.9998 and the concern quadrant held exactly ZERO counties. The chart
   * rendered, the tests passed, and the section's whole finding was an empty
   * box. Nothing but real data catches that.
   *
   * Reads public/data/counties.json, which is committed precisely so CI can
   * build standalone (see README). If a regenerated fixture trips this, the
   * preset needs rethinking — that is the test doing its job, not flaking.
   */
  it('divides the real counties, on every preset', async () => {
    const counties = JSON.parse(
      await readFile(new URL('../../public/data/counties.json', import.meta.url), 'utf8'),
    );
    const statewide = JSON.parse(
      await readFile(new URL('../../public/data/statewide.json', import.meta.url), 'utf8'),
    );
    const months = statewide.meta.months;
    const ctx = { i0: months.indexOf(statewide.meta.policy_start), i1: months.length - 1 };

    /*
       Attach observed Medicaid exactly as src/data/load.js does.

       counties.json does not carry it — it is a separate published file aligned
       onto the statewide month axis at load time — so without this every
       Medicaid metric reads null here and the preset looks degenerate when it is
       not. Which is how this guard first fired.
    */
    const medicaid = JSON.parse(
      await readFile(new URL('../../public/data/medicaid-observed.json', import.meta.url), 'utf8'),
    );
    const at = new Map(medicaid.months.map((m, i) => [m, i]));
    for (const c of counties) {
      const series = medicaid.counties[c.geoid];
      if (!series) continue;
      c.medicaid_enrolled = months.map((m) => {
        const i = at.get(m);
        return i == null ? null : series.caseload[i];
      });
    }

    for (const preset of SCATTER_PRESETS) {
      const mx = metricById(preset.x);
      const my = metricById(preset.y);
      const points = counties
        .map((c) => ({ x: mx.value(c, ctx), y: my.value(c, ctx) }))
        .filter((p) => p.x != null && p.y != null);

      expect(points.length, `${preset.id}: no plottable counties`).toBeGreaterThan(200);

      // The same split the chart draws — a median on most axes, none/any on a
      // zero-inflated capacity axis. A median there left the concern corner
      // empty on the real data, which is what this test caught.
      const split = splitQuadrants(points, preset.ySplit);

      for (const q of preset.quadrants) {
        const [qx, qy] = q.corner.split('-');
        const n = points.filter(
          (p) => split.isHiX(p) === (qx === 'hi') && split.isHiY(p) === (qy === 'hi'),
        ).length;
        // Every corner should hold somebody; a flagged one especially.
        expect(n, `${preset.id} ${q.corner} ("${q.label}") is empty`).toBeGreaterThan(0);
      }
    }
  });
});
