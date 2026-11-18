import { describe, expect, it } from 'vitest';
import { seatHolder } from './officials';

const officials = {
  meta: { takes_office: { txhouse: '2027-01-12', txsenate: '2027-01-12', ushouse: '2027-01-03' } },
  seats: {
    'txhouse-133': { current: { name: 'Ann Sitting', party: 'R' }, elect: null },
    'txsenate-17': { current: { name: 'Bea Leaving', party: 'R' }, elect: { name: 'Cal Coming', party: 'D' } },
    'ushouse-38': { current: null, elect: null },
  },
};

describe('seatHolder', () => {
  it('names the sitting member, with the chamber’s title', () => {
    expect(seatHolder('txhouse-133', officials, '2026-11-11')).toEqual({
      role: 'State Representative',
      name: 'Ann Sitting',
      party: 'R',
      status: 'sitting',
      takesOffice: null,
    });
  });

  it('shows the winner as elect until they take office, then as sitting', () => {
    expect(seatHolder('txsenate-17', officials, '2027-01-11')).toMatchObject({
      role: 'State Senator',
      name: 'Cal Coming',
      status: 'elect',
      takesOffice: '2027-01-12',
    });
    expect(seatHolder('txsenate-17', officials, '2027-01-12')).toMatchObject({
      name: 'Cal Coming',
      status: 'sitting',
      takesOffice: null,
    });
  });

  it('is pending with no one to name, or a seat missing from the file', () => {
    expect(seatHolder('ushouse-38', officials, '2026-11-11')).toMatchObject({
      role: 'U.S. Representative',
      name: null,
      status: 'pending',
    });
    expect(seatHolder('ushouse-2', officials, '2026-11-11').status).toBe('pending');
  });
});
