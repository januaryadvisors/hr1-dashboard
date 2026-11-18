/**
 * Shapes for the Insights page's map and the report box's outline: counties,
 * or the districts of the picked district's chamber.
 */

/** The features the map draws for this scope, or null while district shapes load. */
const featuresFor = (scope, countyFeatures, districtShapes) =>
  scope.district ? districtShapes?.[scope.district.plan] ?? null : countyFeatures;

/** Every place on the map as { key, name, d }. */
export function mapShapes({ scope, countyFeatures, districtShapes, districtCounts, projection }) {
  const features = featuresFor(scope, countyFeatures, districtShapes);
  if (!features) return null;
  return features.map((f) => ({
    key: f.properties.geoid,
    name: scope.district
      ? districtCounts.byId.get(f.properties.geoid)?.name ?? f.properties.geoid
      : `${f.properties.name} County`,
    d: projection.path(f) ?? '',
  }));
}

/** The keys outlined on the map: the place picked, or each county added together. */
export const placeKeysFor = (scope) =>
  scope.kind === 'counties' ? scope.counties.map((c) => c.geoid) : [scope.key];

/** The bounding box around several projected features. */
function unionBounds(features, path) {
  const boxes = features.map((f) => path.bounds(f));
  return [
    [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))],
    [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))],
  ];
}

/**
 * The picked place's outline for the report box: its own shape (all the picked
 * counties together), or Texas when nothing is picked. null while shapes load.
 */
export function placeOutline({ scope, placeKeys, countyFeatures, districtShapes, projection, statePath }) {
  const base = { statePath, canvas: projection, label: scope.label };
  if (scope.kind === 'state') return { ...base, d: null, bounds: null };
  const features = featuresFor(scope, countyFeatures, districtShapes);
  const picked = placeKeys.map((k) => features?.find((f) => f.properties.geoid === k)).filter(Boolean);
  if (!picked.length) return null;
  return {
    ...base,
    d: picked.map((f) => projection.path(f)).join(''),
    bounds: unionBounds(picked, projection.path),
  };
}
