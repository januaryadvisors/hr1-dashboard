import { describe, expect, it } from 'vitest';
import {
  buildFunnel,
  buildScope,
  funnelBand,
  indexTo,
  lossRank,
  monthlyChange,
  participationShare,
  windowChange,
} from './insights';
/**
 * @typedef {import('../types').County} County
 * @typedef {import('../types').Statewide} Statewide
 */

const county = (
  geoid,
  name,
  pop,
  enrolled,
  children = enrolled.map((v) => Math.round(v * 0.4)),
) =>
  ({
    geoid,
    name,
    pop,
    snap_enrolled: enrolled,
    snap_children: children,
    d1_score: 0.5,
    d3_score: 0.5,
    vulnerability_score: 2,
    cumulative_impact: 0,
    newly_subject_persons: 100,
    infra: { food_bank: 0, cms_navigator: 0, chw: 0, counselor: 0 },
    is_gap: false,
    small_denominator: pop < 10_000,
  });

const COUNTIES = [
  county('48001', 'Alpha', 100_000, [1000, 900, 800]),
  county('48003', 'Beta', 50_000, [500, 490, 480]),
  county('48005', 'Gamma', 5_000, [100, 95, 60]),
];

const STATEWIDE = {
  meta: { texas_population: 155_000, months: ['2025-07', '2025-08', '2025-09'] },
  enrolled: [1600, 1485, 1340],
  funnel: {
    center: -0.1625,
    limits: [
      { caseload: 100, sd: 0.09 },
      { caseload: 1000, sd: 0.028 },
      { caseload: 10000, sd: 0.009 },
    ],
  },
};

const byGeoid = new Map(COUNTIES.map((c) => [c.geoid, c]));

describe('buildScope', () => {
  it('resolves a geoid to that county’s own series', () => {
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, '48003');
    expect(s.key).toBe('48003');
    expect(s.label).toBe('Beta County');
    expect(s.population).toBe(50_000);
    expect(s.enrolled).toEqual([500, 490, 480]);
    expect(s.county?.geoid).toBe('48003');
  });

  it('resolves null to Texas, using the published statewide series', () => {
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, null);
    expect(s.key).toBe('state');
    expect(s.label).toBe('Texas');
    expect(s.enrolled).toBe(STATEWIDE.enrolled);
    expect(s.county).toBeNull();
  });

  /**
   * fromSearchParams also rejects an unknown geoid, so this is the second line
   * of defence — a scope that resolves to nothing would render empty charts with
   * no explanation.
   */
  it('falls back to statewide for a geoid that is not in the dataset', () => {
    expect(buildScope(COUNTIES, byGeoid, STATEWIDE, '48999').key).toBe('state');
  });

  it('sums the statewide child series from the counties', () => {
    // statewide.json has no monthly child series — only the age bands, which are
    // a snapshot. Summing the counties is the same arithmetic the fixture
    // builder asserts reconciles.
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, null);
    expect(s.children).toEqual([400 + 200 + 40, 360 + 196 + 38, 320 + 192 + 24]);
  });
});

describe('series helpers', () => {
  it('leaves the first month of a change series null', () => {
    expect(monthlyChange([100, 90, 85])).toEqual([null, -10, -5]);
  });

  it('rebases to 100 at the reference month', () => {
    expect(indexTo([200, 180, 150], 0)).toEqual([100, 90, 75]);
  });

  it('rebases against a later reference month too', () => {
    const out = indexTo([200, 100, 50], 1);
    expect(out).toEqual([200, 100, 50]);
  });

  it('returns nulls rather than Infinity when the reference month is zero', () => {
    expect(indexTo([0, 50], 0)).toEqual([null, null]);
  });

  it('computes participation as a share of residents', () => {
    expect(participationShare([50, 25], 100)).toEqual([0.5, 0.25]);
  });

  it('guards a zero population instead of dividing by it', () => {
    expect(participationShare([50], 0)).toEqual([0]);
  });
});

describe('windowChange', () => {
  it('reports the signed absolute and percentage change', () => {
    const w = windowChange([1000, 950, 800], 0, 2);
    expect(w.start).toBe(1000);
    expect(w.end).toBe(800);
    expect(w.absolute).toBe(-200);
    expect(w.pct).toBeCloseTo(-0.2);
  });

  it('has no percentage when there was nothing to start with', () => {
    expect(windowChange([0, 10], 0, 1).pct).toBeNull();
  });
});

describe('lossRank', () => {
  it('ranks 1 for the steepest percentage loss, not the largest count', () => {
    // Gamma lost 40 people (-40%); Alpha lost 200 (-20%). Rank is by percent.
    const r = lossRank(COUNTIES, '48005', STATEWIDE.enrolled, 0, 2);
    expect(r?.rank).toBe(1);
    expect(r?.total).toBe(3);
    expect(r?.pct).toBeCloseTo(-0.4);
  });

  it('reports the statewide figure and the county median separately', () => {
    const r = lossRank(COUNTIES, '48001', STATEWIDE.enrolled, 0, 2);
    // The two disagree, which is exactly why both are quoted: the statewide
    // number is dominated by the metros, the median describes a typical county.
    expect(r?.statePct).toBeCloseTo((1340 - 1600) / 1600);
    expect(r?.medianPct).toBeCloseTo(-0.2);
    expect(r?.statePct).not.toBeCloseTo(r?.medianPct ?? 0, 3);
  });

  it('returns null for a county that is not in the set', () => {
    expect(lossRank(COUNTIES, '48999', STATEWIDE.enrolled, 0, 2)).toBeNull();
  });
});

describe('buildFunnel', () => {
  it('plots percentage change against the caseload it was measured on', () => {
    const f = buildFunnel(COUNTIES, STATEWIDE, 0, 2);
    const alpha = f.points.find((p) => p.geoid === '48001');
    expect(alpha?.caseload).toBe(1000);
    expect(alpha?.pct).toBeCloseTo(-0.2);
    expect(f.center).toBeCloseTo(-0.1625);
  });

  /**
   * The whole point of the chart: the same percentage is unremarkable on a big
   * caseload and an outlier on a small one, because the limits widen to the
   * left. Alpha at -20% on 1,000 is inside; Gamma at -40% on 100 is outside.
   */
  it('judges a county against the limits for its own caseload', () => {
    const f = buildFunnel(COUNTIES, STATEWIDE, 0, 2);
    expect(f.points.find((p) => p.geoid === '48001')?.outside).toBe(false);
    expect(f.points.find((p) => p.geoid === '48005')?.outside).toBe(true);
  });

  it('skips a county with no caseload to measure against', () => {
    const withEmpty = [...COUNTIES, county('48007', 'Empty', 100, [0, 0, 0])];
    const f = buildFunnel(withEmpty, STATEWIDE, 0, 2);
    expect(f.points.some((p) => p.geoid === '48007')).toBe(false);
  });

  it('widens the band as caseload falls', () => {
    const f = buildFunnel(COUNTIES, STATEWIDE, 0, 2);
    const band = funnelBand(f, 100, 10_000, 20);
    const width = (b) => b.hi - b.lo;
    expect(width(band[0])).toBeGreaterThan(width(band[band.length - 1]));
  });

  it('brackets the centre line at every caseload', () => {
    const f = buildFunnel(COUNTIES, STATEWIDE, 0, 2);
    for (const b of funnelBand(f, 100, 10_000, 20)) {
      expect(b.lo).toBeLessThan(f.center);
      expect(b.hi).toBeGreaterThan(f.center);
    }
  });
});
