// The statewide series (spec §3.3), constructed to hit every published anchor in
// the spec exactly rather than approximately. Those anchors are:
//
//   peak            3,654,101   Jan 2023          (§8 tab 1)
//   Jul 2025        3,518,649   policy start      (wireframe brush label, 3.52M)
//   May 2026        2,971,598   endpoint          (§8 tab 1)
//   window change    −547,051   hero number       (§6.1)
//   Nov 2025 change  −110,000   annotated drop    (§6.8)
//   May 2026 change   −78,861   annotated         (§8 tab 1)
//   participation    11.0% → 9.3%                 (§6.3)
//
// History runs 44 months (Nov 2021 – Jun 2025) plus the 11-month policy window
// (Jul 2025 – May 2026) = 55 months, which is the "44 months of history plus the
// policy window" of §3.3 and the "2021 to 2026" x-axis of §6.2.

export const PEAK = { month: '2023-01', value: 3654101 };
export const POLICY_START = { month: '2025-07', value: 3518649 };
export const LATEST = { month: '2026-05', value: 2971598 };

/** Monthly deltas across the policy window. Sums to exactly −547,051. */
export const WINDOW_DELTAS = [
  ['2025-08', -8000], // delayed onset — the provisions had not bitten yet
  ['2025-09', -12000],
  ['2025-10', -18000],
  ['2025-11', -110000], // the annotated November drop
  ['2025-12', -72400],
  ['2026-01', -68000],
  ['2026-02', -61300],
  ['2026-03', -59690],
  ['2026-04', -58800],
  ['2026-05', -78861],
];

export function monthRange(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export const MONTHS = monthRange('2021-11', '2026-05');
export const HISTORY_MONTHS = monthRange('2021-11', '2025-06');

/**
 * Build the enrolled-individuals series. History is shaped by hand through its
 * real inflections (pandemic-era plateau, the Jan 2023 peak, emergency-allotment
 * expiry in Mar 2023, the Medicaid unwinding through 2024), then the policy
 * window is laid on from WINDOW_DELTAS so the hero number is exact.
 */
export function buildEnrollmentSeries() {
  // Anchor points through the history; everything between is interpolated
  // smoothly so the line reads like a caseload, not a sawtooth.
  const anchors = [
    ['2021-11', 3395000],
    ['2022-04', 3430000],
    ['2022-10', 3560000],
    [PEAK.month, PEAK.value],
    ['2023-03', 3612000], // emergency allotments end
    ['2023-09', 3520000],
    ['2024-03', 3470000], // Medicaid unwinding overlaps
    ['2024-09', 3512000],
    ['2025-01', 3538000],
    ['2025-06', 3526000],
    [POLICY_START.month, POLICY_START.value],
  ];

  const byMonth = new Map(anchors);
  const series = new Map();

  // Monotone-ish interpolation between anchors, in month space.
  const idx = (m) => MONTHS.indexOf(m);
  for (let a = 0; a < anchors.length - 1; a++) {
    const [m0, v0] = anchors[a];
    const [m1, v1] = anchors[a + 1];
    const i0 = idx(m0);
    const i1 = idx(m1);
    for (let i = i0; i <= i1; i++) {
      const t = (i - i0) / (i1 - i0);
      // Smoothstep keeps the joins from showing as kinks.
      const e = t * t * (3 - 2 * t);
      series.set(MONTHS[i], Math.round(v0 + (v1 - v0) * e));
    }
  }
  for (const [m, v] of byMonth) series.set(m, v);

  // Policy window: exact deltas off the policy-start value.
  let running = POLICY_START.value;
  for (const [month, delta] of WINDOW_DELTAS) {
    running += delta;
    series.set(month, running);
  }

  const values = MONTHS.map((m) => series.get(m));
  if (values.some((v) => v == null)) throw new Error('gap in the enrollment series');
  if (values[values.length - 1] !== LATEST.value) {
    throw new Error(`series ends at ${values[values.length - 1]}, expected ${LATEST.value}`);
  }
  return values;
}

/** Age bands (§6.8) — percent change over the policy window is the published finding. */
export const AGE_BANDS = [
  { band: '18–59', julyEnrolled: 1412000, pctChange: -0.191 },
  { band: '5–17', julyEnrolled: 1075000, pctChange: -0.168 },
  { band: 'Under 5', julyEnrolled: 421000, pctChange: -0.166 },
  { band: '60–64', julyEnrolled: 168000, pctChange: -0.106 },
  { band: '65+', julyEnrolled: 442649, pctChange: -0.002 },
];

export const COUNTY_TYPE_ROLLUP = [
  { type: 'Metro', pctChange: -0.156 },
  { type: 'Micro', pctChange: -0.149 },
  { type: 'Rural', pctChange: -0.158 },
];

export const PEOPLE_VS_HOUSEHOLDS = { people: -0.155, households: -0.136 };
