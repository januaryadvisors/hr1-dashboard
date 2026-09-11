import { describe, expect, it } from 'vitest';
import { classify } from './timeline';
/**
 * @typedef {import('./timeline').TimelineItem} TimelineItem
 */

const item = (title, body) => ({
  month: '2026-01',
  title,
  body,
});

describe('bulletin classification', () => {
  it('tags a bulletin that names SNAP', () => {
    expect(classify(item('Bulletin 26-09', 'SNAP Streamlined Reporting Requirements'))).toEqual([
      'snap',
    ]);
  });

  it('tags H.R. 1 however it is written', () => {
    for (const body of [
      'H.R. 1 SNAP Alien Eligibility Impact',
      'House Resolution 1 ABAWD Exceptions and Age Limit Change',
      'HR1 implementation notes',
    ]) {
      expect(classify(item('Bulletin', body))).toContain('hr1');
    }
  });

  /**
   * ABAWD and "work rules" are the specific provisions H.R. 1 changed AND they
   * are SNAP terms, so a bulletin naming either belongs under both filters.
   */
  it('tags the work-requirement provisions as both SNAP and H.R. 1', () => {
    expect(classify(item('Bulletin', 'ABAWD Functionality Enhancements')).sort()).toEqual([
      'hr1',
      'snap',
    ]);
    expect(
      classify(item('Bulletin', 'SNAP Work Rules – Verbal Informing Documentation')).sort(),
    ).toEqual(['hr1', 'snap']);
  });

  it('tags the coverage side of the handbook', () => {
    // Texas Works runs Medicaid and CHIP off the same handbook as SNAP, so a
    // sizeable share of the feed is coverage policy. It used to fall through
    // untagged, which made the filters look like they covered the feed when they
    // covered two thirds of it.
    expect(
      classify(item('Bulletin 26-14', 'Removal of Fixed Certification Periods for CHIP')),
    ).toEqual(['health']);
    expect(
      classify(item('Bulletin 26-15', 'Remove Continuous Eligibility from Transitional Medicaid')),
    ).toEqual(['health']);
    expect(classify(item('Bulletin', 'Medicare Savings Program update'))).toEqual(['health']);
  });

  it('leaves a bulletin about none of the three untagged', () => {
    expect(classify(item('Bulletin', 'Spousal Impoverishment Dependent Allowance'))).toEqual([]);
    expect(classify(item('Bulletin 26-05', 'Mileage Rate Increase'))).toEqual([]);
  });

  it('does not match SNAP inside another word', () => {
    expect(classify(item('Bulletin', 'Snapshot reporting for TIERS'))).toEqual([]);
  });

  /**
   * The limitation the UI footnote exists for: this is a text match, not a
   * judgment about scope. Mandatory shelter costs change the SNAP shelter
   * deduction and the title never says SNAP.
   */
  it('is a text match, and misses cross-programme bulletins that do not name SNAP', () => {
    expect(classify(item('Bulletin 26-05', 'Revised - Mandatory Shelter Costs Verification'))).toEqual(
      [],
    );
  });
});
