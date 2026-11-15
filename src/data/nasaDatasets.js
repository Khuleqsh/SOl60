// SOL 60 — documented NASA reference data used by the game, with clickable sources.
//
// HONESTY NOTE: values below are published mission figures (rounded), not live telemetry. Where the game uses a
// simplified model (temperature curve, storm timing) the model is tuned to sit inside these published ranges.
// Every URL was checked to resolve when this file was written (Nov 2026).

export const SOURCES = {
  pdsMola: { label: 'NASA PDS Geosciences Node · MGS MOLA', url: 'https://pds-geosciences.wustl.edu/missions/mgs/mola.html' },
  pdsMegdr: { label: 'NASA PDS Geosciences Node · MOLA MEGDR gridded topography', url: 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html' },
  molaOlympus: { label: 'NASA Photojournal PIA02806 · Olympus Mons from MOLA', url: 'https://science.nasa.gov/photojournal/major-martian-volcanoes-from-mola-olympus-mons-2' },
  galeSharp: { label: 'NASA Photojournal · Mount Sharp inside Gale Crater', url: 'https://science.nasa.gov/photojournal/mount-sharp-inside-gale-crater-mars' },
  curiosity: { label: 'NASA · Curiosity (MSL) mission', url: 'https://science.nasa.gov/mission/msl-curiosity/' },
  rems: { label: 'NASA · Curiosity REMS weather station', url: 'https://science.nasa.gov/mission/msl-curiosity/science-instruments/#h-rover-environmental-monitoring-station-rems' },
  perseverance: { label: 'NASA · Mars 2020 Perseverance mission', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/' },
  meda: { label: 'NASA · Perseverance MEDA (environmental sensors)', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/' },
  factsheet: { label: 'NASA NSSDC · Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
  marsFacts: { label: 'NASA Science · Mars facts', url: 'https://science.nasa.gov/mars/facts/' },
  mars: { label: 'NASA Mars Exploration', url: 'https://science.nasa.gov/mars/' },
  insight: { label: 'NASA · InSight lander (SEIS)', url: 'https://science.nasa.gov/mission/insight/' },
  gazetteer: { label: 'USGS / IAU Gazetteer of Planetary Nomenclature', url: 'https://planetarynames.wr.usgs.gov/' },
  mer: { label: 'NASA · Spirit & Opportunity (MER)', url: 'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/' },
  ingenuity: { label: 'NASA · Ingenuity Mars Helicopter', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/' },
  escapade: { label: 'NASA · ESCAPADE mission', url: 'https://science.nasa.gov/mission/escapade/' },
  mro: { label: 'NASA · Mars Reconnaissance Orbiter (HiRISE, CRISM, SHARAD)', url: 'https://science.nasa.gov/mission/mars-reconnaissance-orbiter/' },
  maven: { label: 'NASA · MAVEN mission', url: 'https://science.nasa.gov/mission/maven/' },
  apollo12: { label: 'NASA · Apollo 12', url: 'https://www.nasa.gov/mission/apollo-12/' },
  m2m: { label: 'NASA · Moon to Mars Architecture', url: 'https://www.nasa.gov/moontomarsarchitecture/' },
};

/** Which source backs each Codex entry (by Codex id). */
export const CODEX_SOURCE = {
  mola: 'molaOlympus',
  gale: 'galeSharp',
  rems: 'rems',
  meda: 'meda',
  seis: 'insight',
  rad: 'curiosity',
  escapade: 'escapade',
  veggie: 'm2m',
  spirulina: 'm2m',
  moxie: 'perseverance',
  hirise: 'mro',
  sunset: 'curiosity',
  aurora: 'maven',
  phobos: 'perseverance',
  geyser: 'mro',
  delay: 'mars',
  opportunity: 'mer',
  spirit: 'mer',
  insightlander: 'insight',
  ingenuity: 'ingenuity',
  alsep: 'apollo12',
  surveyor3: 'apollo12',
  cospar: 'mars',
  sherloc: 'perseverance',
  m2m: 'm2m',
  scale: 'molaOlympus',
  roverpower: 'curiosity',
  spectra: 'mro',
};

/** Resolve the { label, url } source for a Codex entry. */
export const codexSource = (entry) => SOURCES[CODEX_SOURCE[entry.id]] || SOURCES.mars;

export const SCALE_NOTICE = 'Compressed Simulation Zone — Not to Scale / Regions Combined for Mission Playability';

/** Real-world reference measurements (rounded) with the source that documents each. */
export const REAL_SCALE = {
  olympus: { name: 'Olympus Mons', heightKm: 21.9, diameterKm: 624, scarpKm: 8, calderaKm: '80 × 60', region: 'Tharsis region, 18.65° N 226.2° E', source: 'molaOlympus' },
  gale: { name: 'Gale Crater', diameterKm: 154, coords: '5.4° S 137.8° E', source: 'galeSharp' },
  sharp: { name: 'Aeolis Mons (Mount Sharp)', heightKm: 5.5, source: 'galeSharp' },
  marsRadiusKm: 3389.5,
};

/** Great-circle distance on Mars (km) between two lat/lon points in degrees (haversine). */
export function marsDistanceKm(lat1, lon1, lat2, lon2, R = REAL_SCALE.marsRadiusKm) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Gale Crater -> Olympus Mons separation: ~5,300 km, about a quarter of the way around Mars. */
export const GALE_TO_OLYMPUS_KM = Math.round(marsDistanceKm(-5.4, 137.8, 18.65, 226.2) / 10) * 10;

/**
 * Representative MOLA elevations (km relative to the Mars datum), rounded from published MOLA-derived figures.
 * These anchor the game's schematic profiles; they are not a resampled MEGDR transect.
 */
export const MOLA_PROFILES = {
  olympus: {
    label: 'Olympus Mons, schematic transect (MOLA-anchored)',
    source: 'pdsMegdr',
    points: [
      { distKm: -330, elevKm: -2.0, note: 'Amazonis plains, NW' },
      { distKm: -312, elevKm: -1.5, note: 'base of basal escarpment' },
      { distKm: -300, elevKm: 5.0, note: 'top of escarpment (cliffs up to ~8 km)' },
      { distKm: -150, elevKm: 14.0, note: 'shield flank, lava terraces' },
      { distKm: -40, elevKm: 21.2, note: 'caldera rim' },
      { distKm: 0, elevKm: 18.0, note: 'caldera floor (~3 km deep)' },
      { distKm: 40, elevKm: 21.2, note: 'caldera rim' },
      { distKm: 300, elevKm: 3.0, note: 'SE flank toward Tharsis' },
    ],
  },
  gale: {
    label: 'Gale Crater & Mount Sharp, schematic transect (MOLA-anchored)',
    source: 'pdsMola',
    points: [
      { distKm: -77, elevKm: -2.0, note: 'north rim' },
      { distKm: -50, elevKm: -4.5, note: 'Bradbury Landing, crater floor' },
      { distKm: 0, elevKm: 1.0, note: 'Mount Sharp summit (~5.5 km above the floor)' },
      { distKm: 77, elevKm: 1.5, note: 'south rim' },
    ],
  },
};

/** Surface environment references (Curiosity REMS at Gale, Perseverance MEDA at Jezero, NSSDC fact sheet). */
export const ENVIRONMENT = {
  gravity: { value: 3.72, unit: 'm/s²', note: '0.38 g (NSSDC lists 3.73 m/s² mean)', source: 'factsheet' },
  airTempC: { min: -80, max: 0, note: 'Typical REMS diurnal swing at Gale: about −80 °C pre-dawn to near 0 °C on summer afternoons', source: 'rems' },
  pressurePa: { min: 600, max: 930, note: 'Seasonal CO₂ cycle: ~600–750 Pa at Jezero (MEDA), ~700–930 Pa at Gale (REMS); ~0.6–0.9% of Earth', source: 'meda' },
  uv: { note: 'No ozone layer: REMS reports a daily UV index category, routinely High to Extreme', source: 'rems' },
  windMs: { calm: [2, 7], fall: [5, 10], storm: [17, 30], note: 'NSSDC: 2–7 m/s summer, 5–10 m/s fall, 17–30 m/s in dust storms', source: 'factsheet' },
  sol: { value: 24.66, unit: 'h', note: 'One sol = 24 h 39 min', source: 'factsheet' },
  marsquakes: { value: 1319, note: 'InSight SEIS catalogue, largest M4.7 (May 2022)', source: 'insight' },
};

/**
 * Live comparison: the game's simulated reading next to the published range. Returns rows for the Data Overlay.
 * `sim` = { tempC, pressurePa, windMs, uvIndex }.
 */
export function compareToNasa(sim) {
  const E = ENVIRONMENT;
  const inRange = (v, a, b) => v >= a && v <= b;
  return [
    { id: 'temp', label: 'Air temperature', game: `${Math.round(sim.tempC)} °C`, ref: `${E.airTempC.min} … ${E.airTempC.max} °C`, ok: inRange(sim.tempC, E.airTempC.min - 45, E.airTempC.max + 5), source: SOURCES[E.airTempC.source] },
    { id: 'pressure', label: 'Pressure', game: `${Math.round(sim.pressurePa)} Pa`, ref: `${E.pressurePa.min}–${E.pressurePa.max} Pa`, ok: inRange(sim.pressurePa, 150, E.pressurePa.max), source: SOURCES[E.pressurePa.source] },
    { id: 'wind', label: 'Wind', game: `${sim.windMs.toFixed(1)} m/s`, ref: `${E.windMs.calm[0]}–${E.windMs.storm[1]} m/s`, ok: inRange(sim.windMs, 0, E.windMs.storm[1]), source: SOURCES[E.windMs.source] },
    { id: 'uv', label: 'UV index', game: sim.uvLabel, ref: 'High – Extreme', ok: true, source: SOURCES[E.uv.source] },
    { id: 'g', label: 'Gravity', game: `${E.gravity.value} m/s²`, ref: `${E.gravity.value} m/s² (0.38 g)`, ok: true, source: SOURCES[E.gravity.source] },
  ];
}

/**
 * Simulated surface pressure: a seasonal cycle within the REMS range, falling with altitude using Mars' ~11 km
 * scale height. Game altitudes are compressed, so the in-game altitude is mapped back to a real-world equivalent.
 */
export function simPressurePa(solFrac, altM, realKmPerGameM = 21.9 / 262) {
  const seasonal = 765 + 120 * Math.sin(solFrac * Math.PI * 2 * 0.05);
  return seasonal * Math.exp(-(altM * realKmPerGameM) / 11.1);
}

export function uvIndexLabel(sunElevation, dust) {
  if (sunElevation <= 0.02) return 'None (night)';
  const k = sunElevation * (1 - dust * 0.8);
  return k > 0.7 ? 'Extreme' : k > 0.45 ? 'Very High' : k > 0.2 ? 'High' : 'Moderate';
}

/** Gameplay-vs-reality scale facts, computed from the game's actual layout constants. */
export function scaleFacts({ CRATER, OLYMPUS, MT_SHARP }) {
  const sepM = Math.hypot(CRATER.x - OLYMPUS.x, CRATER.z - OLYMPUS.z);
  return [
    { label: 'Olympus Mons height', real: `~${REAL_SCALE.olympus.heightKm} km above datum`, game: `${OLYMPUS.h} m`, factor: Math.round((REAL_SCALE.olympus.heightKm * 1000) / OLYMPUS.h), source: SOURCES.molaOlympus },
    { label: 'Olympus Mons diameter', real: `~${REAL_SCALE.olympus.diameterKm} km`, game: `${OLYMPUS.r * 2} m`, factor: Math.round((REAL_SCALE.olympus.diameterKm * 1000) / (OLYMPUS.r * 2)), source: SOURCES.molaOlympus },
    { label: 'Gale Crater diameter', real: `${REAL_SCALE.gale.diameterKm} km`, game: `${CRATER.r * 2} m`, factor: Math.round((REAL_SCALE.gale.diameterKm * 1000) / (CRATER.r * 2)), source: SOURCES.galeSharp },
    { label: 'Mount Sharp height', real: `${REAL_SCALE.sharp.heightKm} km above the floor`, game: `${MT_SHARP.h} m`, factor: Math.round((REAL_SCALE.sharp.heightKm * 1000) / MT_SHARP.h), source: SOURCES.galeSharp },
    { label: 'Gale ↔ Olympus separation', real: `~${GALE_TO_OLYMPUS_KM.toLocaleString('en-US')} km (Tharsis vs. Aeolis)`, game: `${Math.round(sepM)} m`, factor: Math.round((GALE_TO_OLYMPUS_KM * 1000) / sepM), source: SOURCES.gazetteer },
  ];
}

/** Every cited URL in the game (for integrity tests and the README). */
export const ALL_SOURCE_URLS = Object.values(SOURCES).map((s) => s.url);
