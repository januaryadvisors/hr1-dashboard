import { describe, expect, it } from 'vitest';
import { colorRampPalette } from './colorRamp';
import { RAMP_ANCHORS } from './scales';

/**
 * Expected values produced by real R, so this test fails if the port drifts:
 *
 *   Rscript -e 'grDevices::colorRampPalette(c("#F0F3F8","#7793B8","#0E3464"))(6)'
 *
 * Spec §13 requires the dashboard and the internal leaflet review maps to agree
 * on colour exactly. This is that guarantee.
 */
const R_OUTPUT_6 = {
  d1: ['#F0F3F8', '#BFCCDE', '#8FA6C4', '#617FA7', '#375985', '#0E3464'],
  d2: ['#EEF6F7', '#CDE3E6', '#ACD1D5', '#89BCC2', '#64A5AC', '#3F8E96'],
  d3: ['#FDF2E1', '#FBE3BD', '#F9D599', '#F6C475', '#F4B252', '#F2A02F'],
  d4: ['#EAF4EE', '#C2DECD', '#9AC8AC', '#73B38A', '#4DA068', '#288C46'],
  composite: ['#F2F0EE', '#E3C1BB', '#D19087', '#BB5B51', '#90372F', '#5A1D18'],
};

const R_OUTPUT_7 = {
  d1: ['#F0F3F8', '#C7D3E2', '#9FB3CD', '#7793B8', '#54739C', '#315380', '#0E3464'],
  d2: ['#EEF6F7', '#D2E6E9', '#B7D7DB', '#9CC8CD', '#7DB4BA', '#5EA1A8', '#3F8E96'],
  d3: ['#FDF2E1', '#FBE6C3', '#F9DAA5', '#F8CE87', '#F6BE69', '#F3AF4C', '#F2A02F'],
  d4: ['#EAF4EE', '#C9E2D2', '#A8D0B7', '#87BE9C', '#67AD7F', '#479C62', '#288C46'],
  composite: ['#F2F0EE', '#E5C9C3', '#D9A29A', '#C6756C', '#B44A3F', '#87332B', '#5A1D18'],
};

describe('colorRampPalette — parity with R grDevices', () => {
  for (const [key, expected] of Object.entries(R_OUTPUT_6)) {
    it(`${key} matches R at n=6`, () => {
      expect(colorRampPalette(RAMP_ANCHORS[key], 6)).toEqual(expected);
    });
  }

  for (const [key, expected] of Object.entries(R_OUTPUT_7)) {
    it(`${key} matches R at n=7 (the count build_scores.R generates)`, () => {
      expect(colorRampPalette(RAMP_ANCHORS[key], 7)).toEqual(expected);
    });
  }

  it('reproduces the anchors exactly when they land on samples', () => {
    // 3 anchors at n=7 put the mid anchor on sample index 3.
    expect(colorRampPalette(RAMP_ANCHORS.d1, 7)[3]).toBe('#7793B8');
  });

  it('returns the endpoints unchanged', () => {
    const r = colorRampPalette(RAMP_ANCHORS.d3, 6);
    expect(r[0]).toBe('#FDF2E1');
    expect(r[r.length - 1]).toBe('#F2A02F');
  });

  it('handles degenerate counts', () => {
    expect(colorRampPalette(RAMP_ANCHORS.d1, 0)).toEqual([]);
    expect(colorRampPalette(RAMP_ANCHORS.d1, 1)).toEqual(['#F0F3F8']);
  });
});
