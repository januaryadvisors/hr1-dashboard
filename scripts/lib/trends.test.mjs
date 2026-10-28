import { describe, expect, it } from 'vitest';
import { countyTrends, excessDecline } from './trends.mjs';

describe('excessDecline', () => {
  // Two counties on straight lines: one keeps its trend, one drops 100 off it.
  const counties = [
    { snap_enrolled: [100, 110, 120, 130, 140] },
    { snap_enrolled: [500, 500, 500, 500, 400] },
  ];
  const trends = countyTrends(counties, [0, 2]);

  it('projects each county on its own trend', () => {
    // Projected at month 4: 140 + 500 = 640; actual 540.
    expect(excessDecline(trends, 4)).toBeCloseTo(540 / 640 - 1);
    expect(excessDecline(trends, 2)).toBeCloseTo(0);
  });
});
