/** The Insights page's generated sentences. */
import { fmtInt, fmtMonthBody, fmtOrdinal, fmtPct } from '../../lib/format';

/** "12,345 individuals have lost enrollment in Harris County since July 2025." */
export function enrollmentHeadline(change, where, since) {
  if (change < 0) return `${fmtInt(-change)} individuals have lost enrollment${where} since ${since}.`;
  if (change > 0) return `${fmtInt(change)} more individuals are enrolled${where} than in ${since}.`;
  return `Enrollment${where} is unchanged since ${since}.`;
}

/**
 * The map subhead's line on the picked place against Texas.
 *
 * @param {string} label - The place, e.g. "Harris County".
 * @param {boolean} several - Several counties added together.
 * @param {{ here: string, relation: string, texas: string } | null} versus - From againstTexas().
 */
export function placeVsTexas(label, several, versus) {
  if (!versus) return `${label} ${several ? 'are' : 'is'} outlined.`;
  const comparison = `${versus.relation} the ${versus.texas} for Texas`;
  return several
    ? `${label}, outlined, are ${versus.here} together, ${comparison}.`
    : `${label}, outlined, is ${versus.here}, ${comparison}.`;
}

/**
 * The map section's sentence: where the picked place ranks for people lost,
 * and its share against Texas. Statewide, the place that lost the most.
 *
 * @param {object} args
 * @param {object} args.scope
 * @param {{ key: string, lost: number }[]} args.ranked - Places in rank order.
 * @param {string[]} args.placeKeys - The keys of the picked place(s).
 * @param {{ noun: string }} args.peers
 * @param {(key: string) => string} args.nameOf - A place's full name.
 * @param {number} args.texasShare - Texas's share lost.
 * @param {string} args.startMonth
 * @param {object | null} args.versus - From againstTexas().
 */
export function rankingHeadline({ scope, ranked, placeKeys, peers, nameOf, texasShare, startMonth, versus }) {
  if (scope.kind === 'state') {
    const top = ranked[0];
    return top?.lost > 0
      ? `${nameOf(top.key)} lost the most people, ${fmtInt(top.lost)}, and Texas as a whole lost ` +
          `${fmtPct(texasShare, 1)} of its ${fmtMonthBody(startMonth)} caseload.`
      : null;
  }

  const best = ranked.findIndex((u) => placeKeys.includes(u.key));
  if (best < 0) return null;
  const rank = `${fmtOrdinal(best + 1)} of ${fmtInt(ranked.length)} ${peers.noun} for people no longer on SNAP`;

  if (scope.kind === 'counties') {
    const together = versus ? ` Together they lost ${versus.here}, ${versus.relation} the ${versus.texas} for Texas.` : '';
    return `Of these counties, ${nameOf(ranked[best].key)} ranks highest, ${rank}.${together}`;
  }
  const share = versus
    ? `; its share lost, ${versus.here}, is ${versus.relation} the ${versus.texas} for Texas.`
    : '.';
  return `${scope.label} ranks ${rank}${share}`;
}
