import { describe, expect, it } from 'vitest';
import {
  ageBandRows,
  buildFunnel,
  buildScope,
  childPace,
  fitFunnel,
  peersFor,
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

  /** 24 Harris districts all print −17.1%; rounding noise must not rank them. */
  it('gives units that print the same figure the same rank', () => {
    const tie = [
      county('48001', 'A', 1000, [1000, 1000, 800]), // −20.0%
      county('48003', 'B', 1000, [10000, 10000, 8001]), // −19.99%, prints −20.0%
      county('48005', 'C', 1000, [1000, 1000, 900]), // −10.0%
    ];
    expect(lossRank(tie, '48003', [12000, 12000, 9701], 0, 2)).toMatchObject({ rank: 1, tied: 1 });
    expect(lossRank(tie, '48005', [12000, 12000, 9701], 0, 2)).toMatchObject({ rank: 3, tied: 0 });
  });

  it('returns null for a county that is not in the set', () => {
    expect(lossRank(COUNTIES, '48999', STATEWIDE.enrolled, 0, 2)).toBeNull();
  });
});

/**
 * A spread that narrows with size the way real county data does: deviation from
 * the mean is ±k/sqrt(caseload), alternating sign so the weighted mean stays put.
 */
const funnelCounties = (() => {
  const out = [];
  [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200].forEach((caseload, k) => {
    for (const sign of [1, -1]) {
      const dev = (sign * 2.5) / Math.sqrt(caseload);
      out.push(
        county(`4${String(out.length).padStart(4, '0')}`, `C${k}${sign}`, caseload * 10, [
          caseload,
          caseload,
          Math.round(caseload * (1 - 0.15 + dev)),
        ]),
      );
    }
  });
  return out;
})();

describe('fitFunnel', () => {
  it('recovers the spread narrowing with caseload', () => {
    const points = funnelCounties.map((c) => ({
      caseload: c.snap_enrolled[0],
      pct: (c.snap_enrolled[2] - c.snap_enrolled[0]) / c.snap_enrolled[0],
    }));
    const fit = fitFunnel(points);
    expect(fit.center).toBeCloseTo(-0.15, 2);
    // |dev| ~ caseload^-0.5, blunted a little by the notebook's +0.5pp offset.
    expect(fit.b).toBeLessThan(-0.2);
    expect(fit.sdAt(100)).toBeGreaterThan(fit.sdAt(10_000));
  });

  it('draws a flat band when there is no slope to fit', () => {
    const fit = fitFunnel([
      { caseload: 500, pct: -0.1 },
      { caseload: 500, pct: -0.2 },
    ]);
    expect(fit.b).toBe(0);
    expect(fit.sdAt(50)).toBeCloseTo(fit.sdAt(5000));
  });
});

describe('buildFunnel', () => {
  it('plots percentage change against the caseload it was measured on', () => {
    const f = buildFunnel(COUNTIES, 0, 2);
    const alpha = f.points.find((p) => p.geoid === '48001');
    expect(alpha?.caseload).toBe(1000);
    expect(alpha?.pct).toBeCloseTo(-0.2);
    // Caseload-weighted mean change = the statewide change of these counties.
    expect(f.center).toBeCloseTo(-0.1625);
  });

  /**
   * The whole point of the chart: the same percentage is unremarkable on a
   * small caseload and an outlier on a big one, because the limits widen to the
   * left. Both counties sit 12 points below the mean.
   */
  it('judges a county against the limits for its own caseload', () => {
    const f = buildFunnel(
      [
        ...funnelCounties,
        county('48901', 'Big', 500_000, [50_000, 50_000, 50_000 * (1 - 0.15 - 0.12)]),
        county('48903', 'Small', 1_000, [100, 100, 100 * (1 - 0.15 - 0.12)]),
      ],
      0,
      2,
    );
    expect(f.points.find((p) => p.geoid === '48901')?.outside).toBe(true);
    expect(f.points.find((p) => p.geoid === '48903')?.outside).toBe(false);
  });

  it('skips a county with no caseload to measure against', () => {
    const withEmpty = [...COUNTIES, county('48007', 'Empty', 100, [0, 0, 0])];
    const f = buildFunnel(withEmpty, 0, 2);
    expect(f.points.some((p) => p.geoid === '48007')).toBe(false);
  });

  it('widens the band as caseload falls', () => {
    const f = buildFunnel(funnelCounties, 0, 2);
    const band = funnelBand(f, 100, 10_000, 20);
    const width = (b) => b.hi - b.lo;
    expect(width(band[0])).toBeGreaterThan(width(band[band.length - 1]));
  });

  it('brackets the centre line at every caseload', () => {
    const f = buildFunnel(funnelCounties, 0, 2);
    for (const b of funnelBand(f, 100, 10_000, 20)) {
      expect(b.lo).toBeLessThan(f.center);
      expect(b.hi).toBeGreaterThan(f.center);
    }
  });
});

describe('ageBandRows', () => {
  const sw = {
    meta: { months: ['a', 'b', 'c'], policy_start: 'a' },
    enrolled: [300, 280, 250],
    age_bands: [
      { band: 'Kids', july_enrolled: 100, latest_enrolled: 90, pct_change: -0.1 },
      { band: 'Adults', july_enrolled: 200, latest_enrolled: 160, pct_change: -0.2 },
    ],
    age_series: { Kids: [100, 98, 90], Adults: [200, 182, 160] },
  };

  it('reads the window from the monthly series, steepest first', () => {
    const rows = ageBandRows(sw, 0, 1);
    expect(rows.map((r) => r.label)).toEqual(['Adults', 'Kids']);
    expect(rows[0]).toMatchObject({ from: 200, to: 182 });
    expect(rows[0].pctChange).toBeCloseTo(-0.09);
    expect(rows[1].pctChange).toBeCloseTo(-0.02);
  });
});

describe('district scope', () => {
  const house = (n, enrolled, children) => ({
    geoid: `txhouse-${n}`,
    plan: 'txhouse',
    number: n,
    name: `House District ${n}`,
    pop: 200_000,
    snap_enrolled: enrolled,
    snap_children: children,
    newly_subject_persons: 1000,
    exact: false,
    allocated_share: 1,
    counties: [{ geoid: '48001', name: 'Alpha', share: 0.5 }],
  });
  const districtCounts = {
    meta: {
      chambers: {
        txhouse: { label: 'TX House', plan: 'PlanH2316', noun: 'House District', count: 2 },
        txsenate: { label: 'TX Senate', plan: 'PlanS2168', noun: 'Senate District', count: 1 },
      },
    },
    districts: [
      house(1, [1000, 950, 900], [500, 450, 400]),
      house(2, [2000, 1990, 1980], [800, 797, 794]),
      { ...house(9, [5000, 4000, 3000], [1, 1, 1]), geoid: 'txsenate-9', plan: 'txsenate' },
    ],
  };
  districtCounts.byId = new Map(districtCounts.districts.map((d) => [d.geoid, d]));

  it('scopes to a district by its key', () => {
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, 'txhouse-1', districtCounts);
    expect(s.kind).toBe('district');
    expect(s.label).toBe('House District 1');
    expect(s.county).toBeNull();
    expect(s.enrolled).toEqual([1000, 950, 900]);
    expect(s.population).toBe(200_000);
  });

  it('still resolves a county when district data is present', () => {
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, '48001', districtCounts);
    expect(s.kind).toBe('county');
    expect(s.district).toBeNull();
  });

  /** A House district ranked among 254 counties would be ranked against Loving County. */
  it('compares a district only with its own chamber', () => {
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, 'txhouse-2', districtCounts);
    const peers = peersFor(s, COUNTIES, districtCounts);
    expect(peers.units.map((u) => u.geoid)).toEqual(['txhouse-1', 'txhouse-2']);
    expect(peers.noun).toBe('House districts');
    const r = lossRank(peers.units, s.key, STATEWIDE.enrolled, 0, 2);
    expect(r?.rank).toBe(2);
    expect(r?.total).toBe(2);
  });

  it('compares a county with counties', () => {
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, '48001', districtCounts);
    expect(peersFor(s, COUNTIES, districtCounts).noun).toBe('counties');
  });

  /** The "who is falling off" heading used to assert "faster" everywhere. */
  it('reads whether children are falling faster or slower off the numbers', () => {
    const faster = buildScope(COUNTIES, byGeoid, STATEWIDE, 'txhouse-1', districtCounts);
    expect(childPace(faster, 0, 2)).toBe('faster'); // children −20%, all −10%
    const same = buildScope(COUNTIES, byGeoid, STATEWIDE, 'txhouse-2', districtCounts);
    expect(childPace(same, 0, 2)).toBe('same'); // −0.75% against −1%
    const slower = { children: [100, 99, 98], enrolled: [100, 90, 80] };
    expect(childPace(slower, 0, 2)).toBe('slower');
  });
});
