/**
 * The "Top affected counties" shortlist beside the hero map: ten counties,
 * ranked and read in the measure the reader picked, so it agrees with the map.
 */
import { layerBasis, layerByKey } from '../config/layers';
import { binsFor, binIndex } from './scales';
import { countBinsFor, formatLayerValue } from './layerValues';
import { firstPublished } from './series';
import { fmtInt } from './format';

const MAX_ROWS = 10;

/** The class edges the map is drawing with right now. */
function activeBins(layer, values, counting) {
  return (counting ? countBinsFor(values, layer) : values.bins) ?? binsFor(layer);
}

/**
 * The shortlist rows.
 *
 * Rate rankings skip counties below the layer's rankFloor: a county of 40
 * enrollees that loses 20 is "−50%" and would otherwise top every list.
 */
export function buildRankRows({ counties, layer, values, counting, i0, i1 }) {
  const def = layerByKey(layer);
  const seriesField = def.seriesField ?? 'snap_enrolled';
  const bins = activeBins(layer, values, counting);
  const floor = counting ? 0 : def.rankFloor ?? 0;

  const read = (c) => (counting ? values.count.get(c.geoid) : values.fill.get(c.geoid)) ?? null;
  const caseloadAtStart = (c) => {
    const series = c[seriesField];
    const i = firstPublished(series, i0, i1);
    return i < 0 ? 0 : series[i];
  };

  return counties
    .filter((c) => !floor || caseloadAtStart(c) >= floor)
    .map((c) => ({ c, v: read(c) }))
    .filter((r) => r.v != null)
    .sort((a, b) => b.v - a.v)
    .slice(0, MAX_ROWS)
    .map(({ c, v }) => ({
      geoid: c.geoid,
      name: c.name,
      value: counting ? fmtInt(v) : formatLayerValue(layer, v),
      series: (c[seriesField] ?? []).slice(i0, i1 + 1),
      bin: bins ? binIndex(v, bins) : 0,
    }));
}

/**
 * What each row draws beside its name: a trend line on the enrollment views,
 * or the class steps on percentile views, where all ten sit in the top class.
 */
export const rankGlyphFor = (layer) =>
  ['score', 'rate'].includes(layerBasis(layer)) ? 'bucket' : 'line';

/** How many classes the bucket glyph steps through. */
export const rankBinCount = (layer, values, counting) => activeBins(layer, values, counting).length - 1;
