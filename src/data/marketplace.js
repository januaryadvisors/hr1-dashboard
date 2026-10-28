/**
 * ACA Marketplace enrollment, statewide — for the story's last chapter.
 *
 * Written by scripts/build-marketplace.mjs from the analysis repo's cleaned CMS
 * files. Optional in the same way as snap-observed.json: a missing file leaves
 * the chapter's charts empty rather than failing the page.
 */
import { fetchOptionalJson } from './fetchJson';

/**
 * @typedef {Object} MarketplaceData
 * @property {{ months: string[], values: number[] }} effectuated - Monthly effectuated enrollment, "YYYY-MM".
 * @property {{ year: number, plan_selections: number, feb_effectuated: number | null, not_effectuated_share: number | null }[]} oep
 * @property {string} source
 * @property {string} source_url
 * @property {string} oep_source_url
 * @property {string} generated
 */

export async function loadMarketplace() {
  const data = await fetchOptionalJson('marketplace.json');
  if (!Array.isArray(data?.effectuated?.months) || data.effectuated.months.length < 2) return null;
  return data;
}
