// SOL 60: RED HORIZON — science content: NASA Pioneers (Opportunity, Spirit, InSight, Ingenuity), the Bright Angel
// SHERLOC scan site, 2-sentence Discovery Insights, the 12-item Earth Bunker cargo loadout, and extra Codex entries.

import { CODEX, CITATIONS } from './nasaData.js';
import { SOURCES } from './nasaDatasets.js';

// ---------------------------------------------------------------- NASA Pioneers (full encounters)
// Opportunity, Spirit, InSight and Ingenuity lie dormant on the crater floor. Each broadcasts a Morse callsign.
export const PIONEER_LOCK_SECONDS = 5;
export const BEACON_RANGE = 460; // metres at which a beacon becomes audible
export const PIONEERS = [
  {
    id: 'opportunity',
    name: 'Opportunity',
    code: 'OPPY',
    freq: 620,
    kind: 'mer',
    x: -112,
    z: 326,
    years: '2004 – 2019',
    codex: 'opportunity',
    insight: {
      title: 'Opportunity · Meridiani Planum',
      text: 'Built for a 90-sol mission, Opportunity worked for almost 15 years and drove 45.16 km, and its hematite "blueberries" showed that liquid water once soaked this plain. A planet-encircling dust storm starved its solar panels in June 2018, ending contact.',
      source: 'NASA/JPL Mars Exploration Rover Mission',
    },
  },
  {
    id: 'spirit',
    name: 'Spirit',
    code: 'SPRT',
    freq: 740,
    kind: 'mer',
    x: -190,
    z: 140,
    years: '2004 – 2010',
    codex: 'spirit',
    insight: {
      title: 'Spirit · Gusev Crater',
      text: "Spirit's dragging wheel churned up nearly pure opaline silica at Home Plate, a signature of hot springs or steam vents that once fed a habitable environment. It became stuck in soft sand in 2009 and last called home on 22 March 2010.",
      source: 'NASA/JPL Mars Exploration Rover Mission',
    },
  },
  {
    id: 'insight',
    name: 'InSight',
    code: 'INST',
    freq: 520,
    kind: 'insight',
    x: -120,
    z: -110,
    years: '2018 – 2022',
    codex: 'insightlander',
    insight: {
      title: 'InSight · Elysium Planitia',
      text: "InSight's SEIS recorded more than 1,300 marsquakes, and their echoes revealed that Mars has a liquid core about 1,830 km in radius. The mission ended in December 2022 as dust slowly buried its solar panels.",
      source: 'NASA InSight / SEIS (JPL & CNES)',
    },
  },
  {
    id: 'ingenuity',
    name: 'Ingenuity',
    code: 'INGN',
    freq: 880,
    kind: 'heli',
    x: 190,
    z: 70,
    years: '2021 – 2024',
    codex: 'ingenuity',
    insight: {
      title: 'Ingenuity · Wright Brothers Field',
      text: "On 19 April 2021 Ingenuity made the first powered, controlled flight on another planet, spinning its rotors at about 2,400 rpm in air only 1% as dense as Earth's. Planned for 5 flights, it completed 72 before rotor damage ended its career in January 2024.",
      source: 'NASA/JPL Mars Helicopter Project',
    },
  },
];

// Perseverance science site: Bright Angel formation (Jezero), represented here on the crater floor.
export const SCIENCE_SITES = {
  sherloc: { id: 'sherloc', name: 'Bright Angel Outcrop', x: 30, z: 130, scanSeconds: 2 },
};

// Bite-sized 2-sentence NASA Discovery Insights shown after each repair / science task.
export const INSIGHTS = {
  rover: {
    title: 'Rover Wheels',
    text: "Curiosity's aluminium wheels carry \"JPL\" in Morse code, so every track doubles as a visual-odometry reference. Sharp rocks tore those wheels, which is why Perseverance received thicker, tougher ones.",
    source: 'NASA/JPL Mars Science Laboratory & Mars 2020',
  },
  sub1: {
    title: 'Solar Power on Mars',
    text: 'Mars receives only about 43% of the sunlight Earth does, and dust slowly coats solar panels. Dust devils periodically cleaned Spirit and Opportunity, carrying them years past their 90-sol warranty.',
    source: 'NASA/JPL Mars Exploration Rover Mission',
  },
  sub2: {
    title: 'Radioisotope Power',
    text: 'The Multi-Mission RTG on Curiosity and Perseverance turns the heat of decaying plutonium-238 into roughly 110 watts of electricity, day or night. Its waste heat also keeps instruments warm through brutally cold nights.',
    source: 'NASA Radioisotope Power Systems Program',
  },
  relay: {
    title: 'Talking Across the Void',
    text: 'Rovers send most of their data by UHF to orbiters such as MRO, which relay it to Earth through the Deep Space Network. One-way light-time between the planets ranges from about 3 to 22 minutes.',
    source: 'NASA Deep Space Network / MRO Electra',
  },
  weather: {
    title: 'Reading the Martian Sky',
    text: "Curiosity's REMS and Perseverance's MEDA record air and ground temperature, pressure, wind and dust every sol, the data behind this calibration. NASA's ESCAPADE orbiters add how the solar wind strips the atmosphere, sharpening space-weather forecasts.",
    source: 'Curiosity REMS · Perseverance MEDA · NASA ESCAPADE',
  },
  sherloc: {
    title: 'Bright Angel Organic Carbon',
    text: "SHERLOC's deep-UV laser mapped organic carbon and minerals at about 50-micron scale just under the abraded surface of rock in Jezero's Bright Angel formation. Organics can form with or without life, so this is a potential biosignature, not proof of life.",
    source: 'NASA Perseverance SHERLOC & PIXL',
  },
  mesh: {
    title: 'Planetary Protection & Heritage',
    text: 'COSPAR planetary-protection policy keeps Earth microbes from contaminating Mars, so dead landers stay put as protected heritage sites. The UHF Ghost Mesh is a gameplay tribute, since these spacecraft can no longer transmit.',
    source: 'COSPAR Planetary Protection Policy',
  },
};

export const RADIO_SCIENCE = {
  expeditionIntro: [
    ['FLIGHT', 'Ares-7, welcome to Gale Crater. Your rover is dead, four NASA pioneers lie dormant in the dust, and Bright Angel is waiting to be scanned.'],
    ['FLIGHT', 'Repair the rover, follow the Morse beacons on your compass ribbon, and bring home the science. No time limit, but dust walls will not wait.'],
  ],
  beacon: [['SIGNAL', 'Faint Morse beacons detected. Follow the compass ribbon and listen in stereo: louder means closer.']],
  weatherDone: [['METEO', 'REMS / MEDA calibrated. ESCAPADE space-weather feed online: 1-sol early warning for dust walls and flares.']],
  sherlocDone: [['SHERLOC', 'Fluorescence peaks detected. Complex organic carbon beneath the abraded surface. Logging as a potential biosignature.']],
  preserved: [['MESH', 'UHF Ghost Mesh node linked. A faint handshake answers from a long-dead transponder.']],
  salvaged: [['SUIT', 'Salvage complete: battery cells, an oxygen bottle and a suit patch kit recovered.']],
  expeditionDone: [['FLIGHT', 'Expedition objectives complete. Outstanding work, Commander.']],
};

// ---------------------------------------------------------------- Pre-launch bunker loadout (60 s, Earth Bunker)
// Nine items, 208 credits in total against a 100-credit budget: you can afford about four. Every item fixes one painful
// mission problem, so every choice leaves another problem unsolved. Heritage = the real NASA hardware it is modelled on.
export const MASS_LIMIT = 100; // kg the Ares-7 lander can carry
export const BUDGET_LIMIT = 100; // mission credits
export const LOADOUT_ITEMS = [
  { id: 'scrubber', name: 'High-Capacity O2 Scrubber', heritage: 'ISS CDRA / Mars 2020 MOXIE', mass: 18, cost: 30, power: -1, comms: 0, endurance: 5, science: 0, solves: 'Oxygen runs out on the long Olympus climb', note: '+35% suit O2 capacity, 15% slower O2 drain.' },
  { id: 'pitons', name: 'Seismic Anchors & Pitons ×6', heritage: 'EVA tether anchors', mass: 12, cost: 28, power: 0, comms: 0, endurance: 1, science: 0, solves: 'Falls on cliff climbs; marsquakes shove you off slopes', note: '6 climbing anchors that arrest falls; quakes cannot push you.' },
  { id: 'capacitor', name: 'Rover Fast-Charge Capacitor', heritage: 'MSL Li-ion + MMRTG charge bus', mass: 16, cost: 26, power: 2, comms: 0, endurance: 0, science: 0, solves: 'The rover battery drains on every drive and incline', note: 'Rover charges 1.8× faster and holds 25% more energy.' },
  { id: 'insulation', name: 'Thermal Regolith Insulation', heritage: 'MER warm electronics box aerogel', mass: 10, cost: 22, power: 0, comms: 0, endurance: 3, science: 0, solves: '−80 °C nights and the cold summit drain your warmth', note: '55% less cold loss; suit heaters use less battery.' },
  { id: 'spectrometer', name: 'Deep-Core Spectrometer', heritage: 'Perseverance SHERLOC / PIXL, MRO CRISM', mass: 11, cost: 20, power: -1, comms: 0, endurance: 0, science: 5, solves: 'Spectroscopy matches are hard; science score is low', note: 'Wider mineral-band tolerance, science ×1.5.' },
  { id: 'booster', name: 'Pioneer Signal Booster', heritage: 'MRO / MAVEN Electra UHF relay', mass: 5, cost: 18, power: -1, comms: 5, endurance: 0, science: 1, solves: 'Faint beacons and a slow, fussy Earth uplink', note: 'Beacons heard 60% farther, easier dish triangulation, faster uplink.' },
  { id: 'mmrtg', name: 'MMRTG Power Core', heritage: 'Curiosity / Perseverance MMRTG (~110 W)', mass: 45, cost: 34, power: 5, comms: 0, endurance: 1, science: 0, solves: 'Suit battery dies at night (flashlight, shield, heaters)', note: 'Suit and rover trickle-charge day and night.' },
  { id: 'veggie', name: 'Veggie Plant Chamber', heritage: 'ISS Veggie', mass: 10, cost: 14, power: -1, comms: 0, endurance: 3, science: 1, solves: 'Food runs short; few planters for oxygen crops', note: '+2 planter kits, more food at landing.' },
  { id: 'rad', name: 'RAD-Guided Storm Shelter Liner', heritage: 'MSL RAD detector', mass: 6, cost: 16, power: 0, comms: 0, endurance: 1, science: 1, solves: 'Solar flares dose you when caught outside', note: '35% less radiation dose.' },
];

export const loadoutTotals = (ids) => {
  const t = { mass: 0, cost: 0, power: 0, comms: 0, endurance: 0, science: 0 };
  for (const id of ids || []) {
    const it = LOADOUT_ITEMS.find((i) => i.id === id);
    if (!it) continue;
    for (const k of Object.keys(t)) t[k] += it[k];
  }
  return t;
};

/** Gameplay effects derived from a loadout. Always valid, even for an empty list. */
export const loadoutEffects = (ids) => {
  const list = Array.isArray(ids) ? ids : [];
  const has = (id) => list.includes(id);
  const t = loadoutTotals(list);
  return {
    totals: t,
    o2Bonus: has('scrubber') ? 35 : 0, // extra O2 capacity (%)
    o2DrainMul: has('scrubber') ? 0.85 : 1,
    foodStart: has('veggie') ? 100 : 85,
    batteryDrain: has('insulation') ? 0.8 : 1, // flashlight / shield / heater cost multiplier
    batteryRegen: has('mmrtg') ? 0.35 : 0, // suit battery %/s, day and night
    tuneBonus: has('booster') ? 0.06 : 0, // wider triangulation tolerance
    transmitCut: has('booster') ? 10 : 0, // seconds shaved off the light-time wait
    sciMul: has('spectrometer') ? 1.5 : 1,
    spectroTol: has('spectrometer') ? 0.09 : 0.05, // µm tolerance in the spectroscopy match
    radCut: has('rad') ? 0.65 : 1,
    planterKits: has('veggie') ? 2 : 0,
    pitons: has('pitons') ? 6 : 0,
    quakeAnchor: has('pitons'),
    roverChargeMul: has('capacitor') ? 1.8 : 1,
    roverCapMul: has('capacitor') ? 1.25 : 1,
    roverTrickle: has('mmrtg') ? 0.12 : 0,
    coldCut: has('insulation') ? 0.45 : 1,
    beaconMul: has('booster') ? 1.6 : 1,
  };
};

/** Drops unknown, duplicate or over-budget items, keeping the order the player picked them in. */
export const sanitizeLoadout = (ids) => {
  const out = [];
  let mass = 0;
  let cost = 0;
  for (const id of Array.isArray(ids) ? ids : []) {
    const it = LOADOUT_ITEMS.find((i) => i.id === id);
    if (!it || out.includes(id)) continue;
    if (mass + it.mass > MASS_LIMIT || cost + it.cost > BUDGET_LIMIT) continue;
    mass += it.mass;
    cost += it.cost;
    out.push(id);
  }
  return out;
};

/** Can `id` be added to `ids` without breaking the mass or credit limit? */
export const canAfford = (ids, id) => {
  const it = LOADOUT_ITEMS.find((i) => i.id === id);
  if (!it || (ids || []).includes(id)) return false;
  const t = loadoutTotals(ids);
  return t.mass + it.mass <= MASS_LIMIT && t.cost + it.cost <= BUDGET_LIMIT;
};

// ---------------------------------------------------------------- additional Codex entries
// `model` links an entry to a procedural 3D model in the Moon-to-Mars 3D Archive viewer.
CODEX.push(
  {
    id: 'opportunity',
    title: 'Opportunity (MER-B)',
    source: 'NASA/JPL Mars Exploration Rover Mission',
    model: 'mer',
    text: 'Landed in Meridiani Planum on 25 January 2004 for a 90-sol mission and drove 45.16 km before a global dust storm silenced it in June 2018. Its hematite spherules and layered rocks proved that liquid water once soaked the plain.',
  },
  {
    id: 'spirit',
    title: 'Spirit (MER-A)',
    source: 'NASA/JPL Mars Exploration Rover Mission',
    model: 'mer',
    text: 'Spirit explored Gusev Crater from January 2004 and found opaline silica at Home Plate, a clue to ancient hot springs. It became trapped in soft sand in 2009 and last transmitted on 22 March 2010.',
  },
  {
    id: 'insightlander',
    title: 'InSight Lander',
    source: 'NASA InSight / SEIS (JPL, CNES)',
    model: 'insight',
    text: 'InSight landed on Elysium Planitia on 26 November 2018 and placed the first seismometer on the Martian surface. Its data revealed the thickness of the crust, the size of the liquid core and the largest quake, magnitude 4.7, in May 2022.',
  },
  {
    id: 'ingenuity',
    title: 'Ingenuity Helicopter',
    source: 'NASA/JPL Mars Helicopter Project',
    model: 'heli',
    text: 'A 1.8 kg technology demonstrator, Ingenuity flew 72 times between April 2021 and January 2024, covering about 17 km. It proved aerial scouting on Mars and inspired concepts for larger Mars helicopters.',
  },
  {
    id: 'alsep',
    title: 'Apollo 12 ALSEP',
    source: 'NASA Apollo Lunar Surface Experiments Package',
    model: 'alsep',
    text: 'Apollo 12 astronauts deployed the first full ALSEP in November 1969, a nuclear-powered station with a seismometer, magnetometer and solar-wind sensors. It transmitted until 1977 and showed that the Moon rings like a bell after impacts.',
  },
  {
    id: 'surveyor3',
    title: 'Surveyor 3',
    source: 'NASA Surveyor Program',
    model: 'surveyor',
    text: 'Surveyor 3 soft-landed on the Moon in April 1967 and dug trenches with a scoop to test the soil. Apollo 12 astronauts walked to it in 1969 and returned its camera and scoop, a rare look at how hardware ages on another world.',
  },
  {
    id: 'cospar',
    title: 'COSPAR Planetary Protection',
    source: 'COSPAR Planetary Protection Policy',
    text: 'COSPAR sets categories I to V for missions, and Mars landers searching for life face strict bioburden limits. Special Regions, where liquid water could let Earth microbes replicate, are restricted so we do not mistake our own hitchhikers for Martian life.',
  },
  {
    id: 'sherloc',
    title: 'SHERLOC & PIXL',
    source: 'NASA Perseverance SHERLOC / PIXL',
    text: "SHERLOC uses a deep-UV laser to excite organics and minerals, and PIXL maps elements with X-rays. Together they read a rock's chemistry at roughly 50-micron scale, about the width of a human hair.",
  },
  {
    id: 'm2m',
    title: 'Moon to Mars Architecture',
    source: 'NASA Moon to Mars Architecture',
    text: "NASA's Artemis campaign builds the Moon-based skills needed for Mars: surface power, life support, communications and in-situ resource use. Each lesson from Apollo 12 to Perseverance feeds the design of the first crewed Mars mission.",
  },
);

CITATIONS.push(
  { text: 'NASA/JPL (2019). Mars Exploration Rover Mission: Spirit and Opportunity mission summaries.', url: SOURCES.mer.url },
  { text: 'Banerdt, W. B. et al. (2020); Stähler, S. C. et al. (2021). InSight SEIS crust, mantle and core structure.', url: SOURCES.insight.url },
  { text: 'Balaram, J. et al. (2021). Ingenuity Mars Helicopter: flight summaries. NASA/JPL.', url: SOURCES.ingenuity.url },
  { text: 'Farley, K. A. et al. (2022). Aqueously altered igneous rocks sampled on the floor of Jezero crater (SHERLOC/PIXL). Science 377.', url: SOURCES.perseverance.url },
  { text: 'NASA (1970). Apollo 12 Preliminary Science Report: ALSEP and Surveyor 3. NASA SP-235.', url: SOURCES.apollo12.url },
);
