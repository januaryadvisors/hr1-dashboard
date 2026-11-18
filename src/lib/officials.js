/**
 * A district's elected member, for the Insights report: the one seat the page
 * is about, in the chamber picked (TX House, TX Senate or US House).
 *
 * Districts only. A county overlaps many districts (Harris holds 24 House
 * districts), and Texas as a whole is every seat, so neither names a member.
 *
 * officials.json is built offline by scripts/fetch-officials.mjs: who holds
 * each seat, and who takes it in January.
 */

/** The member's title in each chamber. */
const ROLE = { txhouse: 'State Representative', txsenate: 'State Senator', ushouse: 'U.S. Representative' };

/**
 * @typedef {Object} Official
 * @property {string} role - "State Senator".
 * @property {string | null} name - null while the seat is to be confirmed.
 * @property {string | null} party - "R", "D", …
 * @property {'sitting' | 'elect' | 'pending'} status - 'elect' takes office on `takesOffice`.
 * @property {string | null} takesOffice - "2027-01-12" for an elect.
 */

/**
 * The seat's holder as of `today`. A winner still to be sworn in is 'elect';
 * on the day they take office they are 'sitting', even if officials.json has
 * not been rebuilt since.
 *
 * @param {string} geoid - "txsenate-15".
 * @param {{ meta: { takes_office: Record<string, string> }, seats: Record<string, { current: object | null, elect: object | null }> }} officials
 * @param {string} [today] - ISO date; defaults to now.
 * @returns {Official}
 */
export function seatHolder(geoid, officials, today = new Date().toISOString().slice(0, 10)) {
  const chamber = geoid.split('-')[0];
  const seat = officials.seats[geoid];
  const takesOffice = officials.meta.takes_office[chamber] ?? null;
  const base = { role: ROLE[chamber] ?? 'Member', takesOffice: null };
  if (seat?.elect) {
    const seated = takesOffice && today >= takesOffice;
    return { ...base, ...seat.elect, status: seated ? 'sitting' : 'elect', takesOffice: seated ? null : takesOffice };
  }
  if (seat?.current) return { ...base, ...seat.current, status: 'sitting' };
  return { ...base, name: null, party: null, status: 'pending' };
}
