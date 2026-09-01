// Approximate recent populations for the largest Texas counties, so the fixture
// map is recognisable (Harris dominates, the metros read correctly) rather than
// noise. Everything else is filled by a calibrated power law.
//
// These are APPROXIMATE and exist only to make the fixture plausible. The real
// values arrive with counties.json from export_tool_data.R.
export const KNOWN_POPULATIONS = {
  Harris: 5130000,
  Dallas: 2650000,
  Tarrant: 2180000,
  Bexar: 2090000,
  Travis: 1330000,
  Collin: 1200000,
  Denton: 1010000,
  Hidalgo: 900000,
  'Fort Bend': 900000,
  'El Paso': 870000,
  Montgomery: 750000,
  Williamson: 700000,
  Cameron: 430000,
  Brazoria: 400000,
  Bell: 400000,
  Galveston: 360000,
  Nueces: 355000,
  Lubbock: 320000,
  Webb: 270000,
  McLennan: 270000,
  Hays: 270000,
  Jefferson: 250000,
  Smith: 245000,
  Brazos: 240000,
  Ellis: 220000,
  Johnson: 200000,
  Comal: 175000,
  Guadalupe: 175000,
  Kaufman: 175000,
  Midland: 175000,
  Parker: 165000,
  Ector: 165000,
  Randall: 145000,
  Taylor: 145000,
  Grayson: 145000,
  Rockwall: 130000,
  Wichita: 130000,
  'Tom Green': 120000,
  Potter: 115000,
  Angelina: 86000,
};

/** Texas projected total, back-solved from the spec's own participation figures:
 *  2,971,598 enrolled = 9.3% of Texans (§6.3). */
export const TEXAS_POPULATION = Math.round(2971598 / 0.093);
