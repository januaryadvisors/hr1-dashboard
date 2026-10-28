import { describe, expect, it } from 'vitest';
import {
  ageBandRows,
  benefitShortfall,
  shortfallLabels,
  buildFunnel,
  buildScope,
  fitFunnel,
  headlineStats,
  indexTo,
  peersFor,
  windowChange,
  windowLoss,
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
    snap_age: { Kids: children, Adults: enrolled.map((v, i) => v - children[i]) },
    d1_score: 0.5,
    d3_score: 0.5,
    vulnerability_score: 2,
    cumulative_impact: 0,
    newly_subject_persons: 100,
    infra: { food_bank: 0, cms_navigator: 0, chw: 0, cpp: 0 },
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
  age_series: { Kids: [640, 594, 536], Adults: [960, 891, 804] },
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

  it('carries the scope’s own age bands', () => {
    expect(buildScope(COUNTIES, byGeoid, STATEWIDE, '48003').ageSeries.Kids).toEqual([200, 196, 192]);
    expect(buildScope(COUNTIES, byGeoid, STATEWIDE, null).ageSeries).toBe(STATEWIDE.age_series);
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
    // The counties reconcile to the statewide caseload, which the data build
    // asserts, so their sum is the statewide child series.
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, null);
    expect(s.children).toEqual([400 + 200 + 40, 360 + 196 + 38, 320 + 192 + 24]);
  });
});

describe('series helpers', () => {
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
   * The point of the limits: the same percentage is unremarkable on a
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
});

describe('ageBandRows', () => {
  const ageSeries = { Kids: [100, 98, 90], Adults: [200, 182, 160] };

  it('reads the window from the monthly series, in band order', () => {
    const rows = ageBandRows(ageSeries, 0, 1);
    expect(rows.map((r) => r.label)).toEqual(['Kids', 'Adults']);
    expect(rows[1]).toMatchObject({ from: 200, to: 182 });
    expect(rows[1].pctChange).toBeCloseTo(-0.09);
    expect(rows[0].pctChange).toBeCloseTo(-0.02);
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
  });

  it('compares a county with counties', () => {
    const s = buildScope(COUNTIES, byGeoid, STATEWIDE, '48001', districtCounts);
    expect(peersFor(s, COUNTIES, districtCounts).noun).toBe('counties');
  });
});

describe('headline figures', () => {
  const months = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'];

  it('writes the three figures for the window given', () => {
    const statewide = {
      meta: { months, policy_start: '2025-01' },
      enrolled: [600, 610, 620, 630, 540],
      participation_share: [0.12, 0.12, 0.12, 0.12, 0.1],
      age_bands: [{ band: '18–59' }, { band: '65+' }],
      age_series: { '18–59': [100, 100, 100, 100, 80], '65+': [50, 50, 50, 50, 50] },
    };
    // Benefits: start 1,000,000, then 0 + 100k + 200k + 300k below it.
    const payments = [1_000_000, 1_000_000, 900_000, 800_000, 700_000];
    const [age, dollars, share] = headlineStats(statewide, payments, 0, 4);
    expect(age.value).toBe('−20.0%');
    expect(age.label).toBe('Adults 18–59');
    expect(age.body).toMatch(/^The steepest drop of any age group, against −[\d.]+% for all Texans on SNAP\.$/);
    expect(dollars.value).toBe('$600.0K');
    expect(dollars.body).toBe(
      'Estimated SNAP benefits not going to Texans since H.R. 1, against a typical month in the year before.',
    );
    expect(share.body).toBe('In May 2025, down from 12.0% in Jan 2025.');
  });
});

describe('windowLoss and benefitShortfall', () => {
  it('counts a loss as positive and a gain as negative', () => {
    expect(windowLoss([100, 90, 80], 0, 2)).toBe(20);
    expect(windowLoss([80, 90, 100], 0, 2)).toBe(-20);
    expect(windowLoss(null, 0, 2)).toBeNull();
  });

  it('sums each month against the start level, net of months above it', () => {
    // Nothing before the start, so the yardstick is 100; −10 + 10 + 30 → 30.
    expect(benefitShortfall([100, 110, 90, 70], 0, 3)).toEqual({ total: 30, monthly: 30, base: 100, baseFrom: 0 });
    expect(benefitShortfall(null, 0, 3)).toBeNull();
  });

  it('labels a gain as more spent, not as $0 less', () => {
    expect(shortfallLabels(600_000)).toEqual({ label: 'Less spent at SNAP-authorized stores', value: '$600.0K' });
    expect(shortfallLabels(-19_723)).toEqual({ label: 'More spent at SNAP-authorized stores', value: '+$19.7K' });
  });

  it('averages up to 12 months ending at the start for the yardstick', () => {
    // 13 months at 120 then a start month of 80: the year to the start averages
    // (11 × 120 + 80) / 12 = 116.67; two months at 100 → 2 × 16.67.
    const pay = [...Array(13).fill(120), 80, 100, 100];
    const short = benefitShortfall(pay, 13, 15);
    expect(short.baseFrom).toBe(2);
    expect(short.base).toBeCloseTo((11 * 120 + 80) / 12);
    expect(short.total).toBeCloseTo(2 * ((11 * 120 + 80) / 12 - 100));
    // Missing months are skipped, in the yardstick and in the sum.
    expect(benefitShortfall([100, null, 100, 90, null, 80], 2, 5).total).toBeCloseTo(30);
  });
});
