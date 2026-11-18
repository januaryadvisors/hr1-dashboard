/**
 * The hero map's colour key, read off the same class edges the map draws with
 * so the key always describes the map on screen.
 */
import { countLabelFor, layerBasis, layerByKey } from '../config/layers';
import { countBinsFor } from './layerValues';
import { fmtInt, fmtPct, fmtPercentile } from './format';

/** How a layer's values are written in its key. */
function valueFormat(layer, basis, counting) {
  if (counting) return fmtInt;
  if (basis === 'window') return (v) => fmtPct(v, 0);
  if (basis === 'rate') return layerByKey(layer).format;
  if (layer === 'composite') return (v) => v.toFixed(2);
  return fmtPercentile;
}

/** The labels at the two ends of the colour bar. */
function endLabels(layer, basis, bins) {
  const top = bins?.[bins.length - 2];
  if (basis === 'window') return ['0%', `${fmtPct(top, 0)}+`];
  if (basis === 'rate') {
    const fmt = layerByKey(layer).format;
    return [fmt(bins[0]), `${fmt(top)}+`];
  }
  if (layer === 'composite') return ['0.8', '3.4'];
  return ['p0', 'p100'];
}

/** The key's heading in rate measure; undefined lets the key use its default. */
function rateHeading(layer, basis) {
  if (basis === 'window') return 'Share of caseload lost';
  if (basis === 'rate') return layerByKey(layer).rateLabel;
  if (layer === 'composite') return 'Vulnerability index, 0–4';
  return undefined;
}

/** Each swatch's range, e.g. "10% – 15%". Open-ended classes end in "or more". */
function swatchRanges(edges, fmt, openTop) {
  if (!edges || edges.length < 2) return undefined;
  const last = edges.length - 2;
  return edges
    .slice(0, -1)
    .map((lo, i) => (openTop && i === last ? `${fmt(lo)} or more` : `${fmt(lo)} – ${fmt(edges[i + 1])}`));
}

/**
 * Props for <RampLegend> on the hero map.
 *
 * @param {string} layer
 * @param {import('../types').LayerValues} values - From buildLayerValues.
 * @param {boolean} counting - Count measure on a layer that has counts.
 */
export function rampLegendProps(layer, values, counting) {
  const basis = layerBasis(layer);
  const countBins = countBinsFor(values, layer);
  const [loLabel, hiLabel] = endLabels(layer, basis, values.bins);
  const openTop = counting || basis === 'window' || basis === 'rate';
  return {
    layer,
    mode: counting ? 'count' : 'rate',
    maxCount: values.maxCount,
    bins: countBins ?? undefined,
    label: counting ? countLabelFor(layer) : rateHeading(layer, basis),
    loLabel,
    hiLabel,
    ranges: swatchRanges(counting ? countBins : values.bins, valueFormat(layer, basis, counting), openTop),
  };
}
