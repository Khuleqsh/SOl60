// SOL 60: RED HORIZON — static mission data
// All numbers that describe real hardware are taken from NASA/JPL mission records.

export const VEHICLES = {
  atlas: {
    id: 'atlas',
    name: 'Atlas-Express Lander',
    tag: 'FAST TRANSIT',
    maxMass: 180,
    budget: 450,
    transitDays: 180,
    transitRad: 6,
    thermalDrift: 0,
    blurb:
      'Light direct-entry lander on a fast conjunction-class trajectory. Short cruise, tight thermal calibration, very little room.',
    pros: ['180-day cruise: low deep-space dose', 'Suit heater loop arrives in calibration'],
    cons: ['180 kg payload ceiling', '$450M cost cap'],
  },
  sls: {
    id: 'sls',
    name: 'SLS-Cargo Heavy',
    tag: 'HEAVY LIFT',
    maxMass: 280,
    budget: 650,
    transitDays: 260,
    transitRad: 14,
    thermalDrift: -6,
    blurb:
      'Heavy cargo stack on a slow minimum-energy transfer. Carries far more, but the long cold soak lets the suit heater loop drift.',
    pros: ['280 kg payload ceiling', '$650M cost cap'],
    cons: ['260-day cruise: higher transit dose', 'Thermal drift: suit runs 6 °C colder'],
  },
};

export const BASE = {
  loadW: 40, // suit avionics, CO2 scrubber fans, comms, pumps
  comms: 32, // UHF relay through Mars Reconnaissance Orbiter passes
  o2Sols: 3, // primary + secondary oxygen tanks
  battery: 1.2, // W·sol of storage per 1% of battery
};

export const ITEMS = [
  {
    id: 'rtg',
    name: 'MMRTG Nuclear Battery',
    short: 'MMRTG',
    mass: 45,
    cost: 140,
    stat: '+35 W constant, even in dust storms',
    detail: 'Pu-238 decay heat through thermocouples. Waste heat also warms the suit loop by 15 °C.',
  },
  {
    id: 'solar',
    name: 'UltraFlex Solar Array',
    short: 'UltraFlex',
    mass: 20,
    cost: 50,
    stat: '+55 W in clear sun, 2 W in dust storms',
    detail: 'Fan-fold circular array. Superb power-to-mass until atmospheric opacity climbs.',
  },
  {
    id: 'shield',
    name: 'Polyethylene Radiation Shielding',
    short: 'Poly Shield',
    mass: 40,
    cost: 80,
    stat: '-75% cosmic / solar radiation dose',
    detail: 'Hydrogen-rich polymer stops protons and fragments heavy ions with few secondaries.',
  },
  {
    id: 'dish',
    name: 'High-Gain Ka-Band Dish',
    short: 'Ka-Band HGA',
    mass: 25,
    cost: 75,
    stat: '+150 kbps: transmits legacy rover data',
    detail: 'Direct-to-Earth downlink. Without it, legacy archives trickle through a 32 kbps UHF relay.',
  },
  {
    id: 'brush',
    name: 'Electrostatic Dust Removal Brush',
    short: 'Dust Brush',
    mass: 10,
    cost: 35,
    stat: 'Restores solar panels, cleans rover lenses',
    detail: 'Travelling-wave electrodes lift charged dust off arrays, seals, filters and optics.',
  },
  {
    id: 'libs',
    name: 'Laser-Induced Breakdown Spectrometer',
    short: 'LIBS',
    mass: 30,
    cost: 110,
    stat: '2.5x Science Data multiplier',
    detail: 'ChemCam-class laser vaporises rock at 7 m and reads the plasma spectrum.',
  },
  {
    id: 'eclss',
    name: 'Closed-Loop ECLSS Water/O2 Recycler',
    short: 'ECLSS',
    mass: 50,
    cost: 130,
    stat: '+4 Sols life support endurance',
    detail: 'Sabatier reactor and electrolysis close the oxygen loop. Needs no sunlight.',
  },
  {
    id: 'aerogel',
    name: 'Aerogel Thermal Suit Liner',
    short: 'Aerogel Liner',
    mass: 15,
    cost: 45,
    stat: 'Prevents hypothermia down to -85 °C',
    detail: 'Silica aerogel, k = 0.015 W/m·K. Also cuts night heater draw by 60%.',
  },
  {
    id: 'moxie',
    name: 'MOXIE Oxygen Generator',
    short: 'MOXIE',
    mass: 35,
    cost: 95,
    stat: '+25% O2 per Sol, draws 15 W',
    detail: 'Solid-oxide electrolysis of atmospheric CO2. Intake filter clogs in dust storms.',
  },
  {
    id: 'lidar',
    name: 'Autonomous Hazard LiDAR',
    short: 'Hazard LiDAR',
    mass: 15,
    cost: 55,
    stat: 'Halves steep-terrain power / O2 drain',
    detail: 'Plots the lowest-energy line through slopes, even with zero visibility.',
  },
  {
    id: 'drill',
    name: 'Deep-Core Seismic Drill',
    short: 'Core Drill',
    mass: 35,
    cost: 90,
    stat: 'Unlocks subsurface science at craters',
    detail: 'Two-metre cores below the radiation-sterilised top layer of crater floors.',
  },
  {
    id: 'medkit',
    name: 'Emergency Med-Gel & Rad-Away Kit',
    short: 'Med-Gel Kit',
    mass: 12,
    cost: 40,
    stat: 'One-time recovery from injury / radiation',
    detail: 'Single use. Fires automatically at critical dose or injury, or seals a suit leak.',
  },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// Map coordinates: 100 x 100 units, 1 unit = 0.5 km.
export const KM_PER_UNIT = 0.5;
export const LZ = { x: -38, z: 36, name: 'Bradbury Landing Zone' };
export const SUMMIT = { x: 30, z: -28, name: 'Mount Sharp Summit' };
export const ENCOUNTER_RADIUS = 9;

export const CRATERS = [
  { id: 'crater1', name: 'Yellowknife Basin', x: -17, z: 23, r: 6, depth: 2.3 },
  { id: 'crater2', name: 'Kimberley Crater', x: -12, z: -5, r: 7, depth: 2.6 },
  { id: 'crater3', name: 'Murray Hollow', x: 16, z: -3, r: 5.5, depth: 2.1 },
  { id: 'crater4', name: 'Glenelg Pit', x: 11, z: 17, r: 5, depth: 1.9 },
];

export const HARDWARE = [
  {
    id: 'opportunity',
    name: 'MER-B Opportunity',
    kind: 'Mars Exploration Rover',
    status: 'SILENT SINCE SOL 5111',
    pos: { x: -28, z: 10 },
    history: [
      'Landed 25 January 2004 for a 90-sol mission. Operated for 5,111 sols: 14 years.',
      'Drove 45.16 km, an off-world record. Found hematite "blueberries" and gypsum veins laid down by water.',
      'Silenced in June 2018 when a planet-encircling dust storm pushed optical depth past 10 and starved its solar arrays.',
    ],
    quote: '"My battery is low and it\'s getting dark."',
    quoteNote: 'A poetic paraphrase of its final telemetry, 10 June 2018.',
    preserve: {
      label: 'Clean & Transmit Final Telemetry',
      reward: '+400 Science Data and the Legacy Medal',
    },
    salvage: {
      label: 'Salvage Battery Cells',
      reward: '+30 W emergency power reserve. Preservation bonus lost.',
    },
  },
  {
    id: 'insight',
    name: 'InSight Lander',
    kind: 'Geophysical Lander',
    status: 'SILENT SINCE SOL 1440',
    pos: { x: -4, z: 24 },
    history: [
      'Landed 26 November 2018 to study the deep interior of Mars.',
      'Its SEIS seismometer logged 1,319 marsquakes, including a magnitude 4.7 event, and measured the core.',
      'Dust slowly buried its twin solar arrays. Last contact: 15 December 2022.',
    ],
    quote: '"My power\'s really low, so this may be the last image I can send."',
    quoteNote: 'Mission team post, December 2022.',
    preserve: {
      label: 'Download Marsquake Core Archive',
      reward: '+350 Science Data',
    },
    salvage: {
      label: 'Strip Solar Wing',
      reward: '+40 W solar power. The seismic archive stays buried.',
    },
  },
  {
    id: 'ingenuity',
    name: 'Ingenuity Mars Helicopter',
    kind: 'Technology Demonstrator',
    status: 'GROUNDED AFTER FLIGHT 72',
    pos: { x: 4, z: -6 },
    history: [
      'First powered, controlled flight on another planet: 19 April 2021.',
      'Planned for 5 flights. Flew 72, covering 17 km in about 129 minutes aloft.',
      'A rotor blade broke on landing in featureless sand on 18 January 2024.',
    ],
    quote: '"The little helicopter that could."',
    quoteNote: 'NASA, on retiring Ingenuity, January 2024.',
    preserve: {
      label: 'Recover Flight Black Box',
      reward: '+250 Science Data and an exact weather forecast for the remaining Sols',
    },
    salvage: {
      label: 'Salvage Carbon Rotor & Sensor',
      reward: 'Terrain mobility drain cut by 40%',
    },
  },
  {
    id: 'spirit',
    name: 'MER-A Spirit',
    kind: 'Mars Exploration Rover',
    status: 'EMBEDDED AT TROY SINCE SOL 1892',
    pos: { x: 27, z: 8 },
    history: [
      'Landed 4 January 2004. Outlived its 90-sol warranty more than twenty times over.',
      'A dragging wheel uncovered nearly pure silica: evidence of ancient hot springs.',
      'Broke through a crust into soft sulfate sand at "Troy" in 2009 and could not tilt its arrays toward the winter sun. Last signal: 22 March 2010.',
    ],
    quote: '"Free Spirit."',
    quoteNote: 'The nine-month extrication campaign, 2009.',
    preserve: {
      label: 'Beam Stationary Science Logs',
      reward: '+300 Science Data',
    },
    salvage: {
      label: 'Harvest Radioisotope Heater Units',
      reward: '+20 °C thermal protection. The science logs are lost.',
    },
  },
];

export const HARDWARE_BY_ID = Object.fromEntries(HARDWARE.map((h) => [h.id, h]));

export const LAYERS = [
  {
    id: 'slope',
    name: 'MOLA Topography & Slope',
    short: 'MOLA',
    instrument: 'Mars Orbiter Laser Altimeter',
    hazard: 'Steep walls drain extra power and O2',
    counter: 'Hazard LiDAR',
    stops: ['#0b3b4a', '#2bd67b', '#ffd23f', '#ff2e3e'],
    lo: 'FLAT',
    hi: '30°+',
  },
  {
    id: 'rad',
    name: 'RAD Space Weather & Radiation',
    short: 'RAD',
    instrument: 'Radiation Assessment Detector',
    hazard: 'High ground has less air above it to stop cosmic rays',
    counter: 'Polyethylene Shielding',
    stops: ['#140c2e', '#5a2bd9', '#e23bd0', '#ffd6f2'],
    lo: 'LOW',
    hi: 'HIGH',
  },
  {
    id: 'thermal',
    name: 'THEMIS Thermal Inertia',
    short: 'THEMIS',
    instrument: 'Mars Odyssey THEMIS / MGS TES',
    hazard: 'Loose dust plunges to -85 °C or below at night',
    counter: 'MMRTG or Aerogel Liner',
    stops: ['#ff8a2a', '#7a4a52', '#2f7fd6', '#c9f2ff'],
    lo: 'BEDROCK',
    hi: 'FREEZE',
  },
  {
    id: 'tau',
    name: 'Dust Optical Depth (Tau)',
    short: 'TAU',
    instrument: 'MARCI / Mastcam opacity',
    hazard: 'Active storm corridors choke solar power',
    counter: 'MMRTG, Dust Brush',
    stops: ['#241a14', '#8a5424', '#e09a45', '#ffe2b0'],
    lo: 'CLEAR',
    hi: 'STORM',
  },
  {
    id: 'crism',
    name: 'MRO CRISM Hydrated Minerals',
    short: 'CRISM',
    instrument: 'MRO Compact Reconnaissance Imaging Spectrometer',
    hazard: 'Clay / sulfate zones: +50% Spectrometer science',
    counter: 'LIBS Spectrometer',
    stops: ['#101820', '#1f5f5a', '#3fd0a8', '#e8fff4'],
    lo: 'MAFIC',
    hi: 'CLAY',
  },
  {
    id: 'sharad',
    name: 'MRO SHARAD Subsurface Ice Radar',
    short: 'SHARAD',
    instrument: 'MRO Shallow Radar sounder',
    hazard: 'Buried water ice: Drill / MOXIE emergency O2 & water',
    counter: 'Core Drill or MOXIE',
    stops: ['#0a0f1f', '#1c3a7a', '#4aa3ff', '#e6f6ff'],
    lo: 'DRY',
    hi: 'ICE',
  },
];

export function engineeringStats(vehicle, ids) {
  const has = (id) => ids.includes(id);
  let mass = 0;
  let cost = 0;
  for (const id of ids) {
    mass += ITEM_BY_ID[id].mass;
    cost += ITEM_BY_ID[id].cost;
  }
  const load = BASE.loadW + (has('moxie') ? 15 : 0);
  const powerClear = (has('rtg') ? 35 : 0) + (has('solar') ? 55 : 0) - load;
  const powerStorm = (has('rtg') ? 35 : 0) + (has('solar') ? 2 : 0) - load;
  const comms = BASE.comms + (has('dish') ? 150 : 0);
  const o2Cap = BASE.o2Sols + (has('eclss') ? 4 : 0);
  const net = 1 - (has('moxie') ? 0.75 : 0);
  const endurance = o2Cap / net;
  const sciMult = has('libs') ? 2.5 : 1;
  return {
    mass,
    cost,
    powerClear,
    powerStorm,
    comms,
    endurance,
    sciMult,
    drill: has('drill'),
    overload: mass > vehicle.maxMass,
    overBudget: cost > vehicle.budget,
  };
}

// ======================================================================
// Expansion data: play modes, contracts, launch windows, advisors,
// landmarks, archive, and the NASA dataset registry.
// ======================================================================

export const MODES = {
  cadet: {
    id: 'cadet',
    name: 'Cadet Mode',
    tag: 'LEARN',
    timer: 90,
    hazard: 0.6,
    badges: true,
    caps: true,
    blurb: '90 s bunker timer, helpful gear badges, hazard damage reduced by 40%.',
  },
  director: {
    id: 'director',
    name: 'Flight Director',
    tag: 'REALISTIC',
    timer: 60,
    hazard: 1,
    badges: false,
    caps: true,
    blurb: 'Strict 60 s timer and the full Curiosity REMS hazard set.',
  },
  sandbox: {
    id: 'sandbox',
    name: 'Sandbox Mode',
    tag: 'EXPERIMENT',
    timer: 120,
    hazard: 1,
    badges: true,
    caps: false,
    blurb: 'No Budget or Mass caps. Pack anything and see what happens.',
  },
};

export const CONTRACTS = [
  {
    id: 'astro',
    name: 'Mount Sharp Boxwork Astrobiology',
    short: 'ASTROBIOLOGY',
    requires: ['libs'],
    goal: 'Pack the LIBS Spectrometer and return 1,500+ Science Data.',
    bonus: 600,
    blurb: 'Curiosity found boxwork ridges on Mount Sharp: mineral veins left by groundwater. Read them with a laser.',
  },
  {
    id: 'ice',
    name: 'Subsurface Ice & Seismic Survey',
    short: 'ICE SURVEY',
    requires: ['drill'],
    goal: 'Pack the Deep-Core Drill and survive a night in a -80 °C thermal zone.',
    bonus: 700,
    blurb: 'SHARAD radar hints at buried ice. Core it, and live through the cold that keeps it frozen.',
  },
  {
    id: 'rescue',
    name: 'Legacy Rover Telemetry Rescue',
    short: 'LEGACY RESCUE',
    requires: ['dish', 'brush'],
    goal: 'Pack the High-Gain Dish and Dust Brush, then preserve 3+ silent NASA machines.',
    bonus: 800,
    blurb: 'Their last memories are still on board. Clean them, wake them, and send it home.',
  },
];
export const CONTRACT_BY_ID = Object.fromEntries(CONTRACTS.map((c) => [c.id, c]));

export const WINDOWS = {
  hohmann: {
    id: 'hohmann',
    name: '26-Month Hohmann Transfer',
    tag: 'STANDARD',
    massDelta: 0,
    budgetDelta: 0,
    radFactor: 1,
    transitFactor: 1,
    blurb: 'Minimum-energy ellipse. Launch when Mars leads Earth by about 44°. Standard mass and transit.',
  },
  fast: {
    id: 'fast',
    name: 'Off-Window Fast-Conjunct',
    tag: 'HIGH ENERGY',
    massDelta: -25,
    budgetDelta: 40,
    radFactor: 0.7,
    transitFactor: 0.72,
    blurb: 'Burn harder, arrive sooner. -25 kg payload ceiling, +$40M budget, 30% less cruise dose.',
  },
};

export function applyWindow(vehicle, windowId) {
  const w = WINDOWS[windowId] || WINDOWS.hohmann;
  return {
    ...vehicle,
    maxMass: vehicle.maxMass + w.massDelta,
    budget: vehicle.budget + w.budgetDelta,
    transitDays: Math.round(vehicle.transitDays * w.transitFactor),
    transitRad: +(vehicle.transitRad * w.radFactor).toFixed(1),
    windowId: w.id,
  };
}

export const EDL_HEAVY_KG = 200;

// Recommended items per contract, used for Cadet badges.
export const CADET_HINTS = {
  base: ['rtg', 'aerogel', 'eclss', 'shield'],
  astro: ['libs'],
  ice: ['drill', 'aerogel'],
  rescue: ['dish', 'brush'],
};

export const ADVISORS = {
  vance: { id: 'vance', name: 'Dr. Vance', role: 'Chief Scientist', color: '#a78bfa', initials: 'EV' },
  reyes: { id: 'reyes', name: 'Cmdr. Reyes', role: 'Safety & Life Support', color: '#f87171', initials: 'MR' },
  sato: { id: 'sato', name: 'Flight Director Sato', role: 'Comms & Budget', color: '#38bdf8', initials: 'KS' },
};

// Landmarks on the surface (x, z in map units). Scannable for science.
export const LANDMARKS = [
  {
    id: 'ballast',
    kind: 'edl',
    name: 'Tungsten Balance Mass Craters',
    x: -33,
    z: 28,
    sci: 100,
    text: 'Two 75 kg tungsten blocks are ejected before entry to shift the capsule centre of mass and fly a lifting trajectory. They hit the ground at about 4,000 km/h.',
  },
  {
    id: 'chute',
    kind: 'edl',
    name: 'Shredded Parachute Fabric',
    x: -31,
    z: 19,
    sci: 100,
    text: 'Nylon and Kevlar canopy fragments. The supersonic disk-gap-band chute opens at Mach 1.7 in air 1% as dense as Earth\'s.',
  },
  {
    id: 'crane',
    kind: 'edl',
    name: 'Sky-Crane Descent Stage Wreckage',
    x: -22,
    z: 31,
    sci: 100,
    text: 'After lowering its rover on 7.5 m nylon bridles, the descent stage flies away at full throttle and crashes about 650 m from the landing site.',
  },
  {
    id: 'heatshield',
    kind: 'heritage',
    name: "Opportunity's Heat Shield & Iron-Nickel Meteorite",
    x: -24,
    z: 4,
    sci: 150,
    text: 'In 2005 Opportunity drove to its own discarded heat shield and found beside it "Heat Shield Rock": the first meteorite ever identified on another planet, a basketball-sized iron-nickel lump.',
  },
  {
    id: 'percache',
    kind: 'perseverance',
    name: 'Perseverance Sample Cache & Bright Angel',
    x: 20,
    z: 6,
    sci: 200,
    text: 'Titanium sample tubes like those Perseverance seals and caches. The "Cheyava Falls" rock from the Bright Angel formation carries organic carbon and "leopard spot" textures: a potential biosignature.',
  },
  {
    id: 'boxwork',
    kind: 'boxwork',
    name: 'Mount Sharp Boxwork Ridges',
    x: 24,
    z: -14,
    sci: 150,
    text: 'A honeycomb of low ridges: minerals deposited by groundwater in fractures, left standing when softer rock eroded. Curiosity began exploring the boxwork in 2025.',
  },
];
export const LANDMARK_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

export const GEYSERS = [
  { id: 'geyser1', x: -9, z: 15, onPath: false },
  { id: 'geyser2', x: 8, z: 0, onPath: true },
  { id: 'geyser3', x: 22, z: -20, onPath: false },
];

export const COSPAR_ZONE = { x: 12, z: -10, r: 7, name: 'COSPAR Special Region (Subsurface Ice)' };

export const FAMILY = [
  { id: 'sojourner', name: 'Sojourner', year: 1997, how: 'Soft sky-crane landing (Pathfinder EDL heritage)' },
  { id: 'spirit', name: 'Spirit', year: 2004, how: 'Preserve & transmit Spirit' },
  { id: 'opportunity', name: 'Opportunity', year: 2004, how: 'Preserve & transmit Opportunity' },
  { id: 'curiosity', name: 'Curiosity', year: 2012, how: 'Hail Curiosity near Mount Sharp' },
  { id: 'perseverance', name: 'Perseverance', year: 2021, how: 'Scan the Perseverance sample cache' },
  { id: 'ingenuity', name: 'Ingenuity', year: 2021, how: 'Recover the Ingenuity black box' },
];

// Real landing coordinates and headline discoveries for the Archive.
export const ARCHIVE = [
  {
    id: 'opportunity',
    group: 'mars',
    name: 'MER-B Opportunity',
    coords: '1.95° S, 354.47° E · Meridiani Planum (Eagle crater)',
    landed: '25 January 2004',
    final: 'Sol 5111 · 10 June 2018',
    youth:
      'Opportunity was a golf-cart-sized robot geologist. It was meant to drive for 90 days and kept going for almost 15 years! It found tiny round "blueberries" made of a mineral that forms in water.',
    engineer:
      'Solar-powered MER with a 0.9 kWh Li-ion bank and RHU thermal control. 45.16 km traverse. Mini-TES and Mössbauer confirmed hematite concretions and jarosite: acidic, aqueous diagenesis. Lost to a tau > 10 planet-encircling dust event in 2018.',
    discoveries: ['Hematite "blueberries"', 'Gypsum veins at Endeavour crater', 'Heat Shield Rock meteorite'],
  },
  {
    id: 'spirit',
    group: 'mars',
    name: 'MER-A Spirit',
    coords: '14.57° S, 175.48° E · Gusev crater (Columbia Memorial Station)',
    landed: '4 January 2004',
    final: 'Sol 2208 · 22 March 2010',
    youth:
      'Spirit had a broken wheel that it dragged behind it, and that wheel dug up bright white soil made of silica. That soil probably came from ancient hot springs, a place where tiny life might have lived.',
    engineer:
      'Twin of Opportunity. Drove 7.73 km in reverse for long stretches on a failed right-front wheel motor. Embedded at Troy in sulfate sand, it could not tilt its arrays for winter insolation; the thermal-electrical budget failed.',
    discoveries: ['~90% opaline silica at Home Plate', 'Carbonate outcrop at Comanche', 'Dust-devil array cleaning'],
  },
  {
    id: 'insight',
    group: 'mars',
    name: 'InSight Lander',
    coords: '4.50° N, 135.62° E · Elysium Planitia',
    landed: '26 November 2018',
    final: '15 December 2022',
    youth:
      'InSight was a lander that listened to Mars like a doctor with a stethoscope. It felt more than 1,300 marsquakes and learned how big the core of Mars is.',
    engineer:
      'Phoenix-heritage lander with twin 2.15 m UltraFlex arrays. SEIS (VBB + SP seismometers) under a wind and thermal shield; HP3 mole failed to penetrate cohesive duricrust. Measured a liquid iron core radius of about 1,830 km.',
    discoveries: ['1,319 marsquakes', 'Liquid core ~1,830 km radius', 'Crust layering at Elysium'],
  },
  {
    id: 'ingenuity',
    group: 'mars',
    name: 'Ingenuity Mars Helicopter',
    coords: '18.44° N, 77.45° E · Jezero crater (Wright Brothers Field)',
    landed: '18 February 2021 (with Perseverance)',
    final: 'Flight 72 · 18 January 2024',
    youth:
      'Ingenuity was the first aircraft to fly on another planet. It weighed as much as a big bag of sugar and spun its rotors super fast because Mars air is so thin.',
    engineer:
      '1.8 kg coaxial rotorcraft, 1.2 m blades at ~2,400 rpm in 1.2% Earth-sea-level density. Snapdragon 801 flight computer, COTS IMU and downward VIO camera. 72 flights, 17 km, 128.8 min aloft. Featureless terrain defeated the navigation filter on the final landing.',
    discoveries: ['First powered flight on another world', '72 flights vs 5 planned', 'Aerial scouting for Perseverance'],
  },
  {
    id: 'alsep',
    group: 'moon',
    name: 'Apollo 12 ALSEP',
    coords: '3.01° S, 23.42° W · Oceanus Procellarum',
    landed: '19 November 1969',
    final: 'Switched off 30 September 1977',
    youth:
      'Astronauts left a science station on the Moon. Its dust detector showed that lunar dust slowly coats everything and makes machines run hotter. That lesson helped engineers design Mars robots.',
    engineer:
      'SNAP-27 RTG-powered station (73 W) with PSE seismometer, magnetometer, solar wind spectrometer and a Dust Detector Experiment: three solar cells whose output degraded as dust accumulated. Data directly informed MER array dust-factor models.',
    discoveries: ['Moonquakes ring for an hour', 'Dust accumulation degrades thermal control', 'RTG ran for 8 years'],
  },
  {
    id: 'surveyor3',
    group: 'moon',
    name: 'Surveyor 3',
    coords: '3.01° S, 23.42° W · Oceanus Procellarum',
    landed: '20 April 1967',
    final: 'Visited by Apollo 12, 20 November 1969',
    youth:
      'Surveyor 3 waited on the Moon for two and a half years. Then astronauts walked over and brought its camera home! Scientists studied how the dust and sunlight had changed its paint and parts.',
    engineer:
      'Robotic lander whose TV camera and surface sampler were returned by Conrad and Bean. Analysis showed sandblasting by the LM descent plume and dust-driven changes to thermal coatings: the first in-situ study of long-term regolith exposure.',
    discoveries: ['First hardware returned from another world', 'LM plume sandblasting', 'Coating darkening from dust and UV'],
  },
];
export const ARCHIVE_BY_ID = Object.fromEntries(ARCHIVE.map((a) => [a.id, a]));

// NASA dataset registry: every system cites the source that drives it.
export const NASA_DATA = {
  mola: { tag: 'NASA JPL Mars Trek / MOLA DEM', cite: 'Smith, D.E. et al. (2003). MGS MOLA Mission Experiment Gridded Data Records. NASA PDS.' },
  rems: { tag: 'Curiosity REMS / Perseverance MEDA', cite: 'Gómez-Elvira, J. (2013). MSL REMS Environmental Data Records. NASA PDS Atmospheres Node.' },
  rad: { tag: 'MSL RAD', cite: 'Hassler, D.M. et al. (2014). Mars surface radiation environment measured by MSL RAD. Science 343.' },
  themis: { tag: 'Mars Odyssey THEMIS', cite: 'Christensen, P.R. (2002). THEMIS Thermal Inertia mosaics. NASA PDS Geosciences Node.' },
  tau: { tag: 'MRO MARCI / Mastcam Tau', cite: 'Lemmon, M.T. et al. (2015). Dust aerosol opacity from MER and MSL. Icarus 251.' },
  crism: { tag: 'MRO CRISM', cite: 'Murchie, S. et al. (2007). CRISM Targeted Reduced Data Records. NASA PDS Geosciences Node.' },
  sharad: { tag: 'MRO SHARAD', cite: 'Seu, R. et al. (2007). SHARAD Radargrams. NASA PDS Geosciences Node.' },
  hirise: { tag: 'MRO HiRISE', cite: 'McEwen, A.S. et al. (2007). HiRISE Reduced Data Records. NASA PDS / University of Arizona.' },
  pds: { tag: 'NASA PDS', cite: 'NASA Planetary Data System (pds.nasa.gov), mission archives for MER, InSight, MSL, Mars 2020.' },
  seis: { tag: 'InSight SEIS', cite: 'InSight Mars SEIS Data Service (2019). SEIS raw data, InSight Mission. IPGP, JPL, CNES, ETHZ, ICL, MPS.' },
  eyes: { tag: 'NASA Eyes on the Solar System', cite: 'NASA/JPL Eyes on the Solar System (eyes.nasa.gov), Earth–Mars transfer geometry.' },
  dsn: { tag: 'NASA JPL Deep Space Network', cite: 'NASA DSN Now (eyes.nasa.gov/dsn), Goldstone / Madrid / Canberra complexes.' },
  escapade: { tag: 'NASA ESCAPADE', cite: 'Lillis, R. et al. ESCAPADE twin-spacecraft Mars space weather mission, UC Berkeley SSL / NASA SIMPLEx.' },
  m2020: { tag: 'Mars 2020 Perseverance', cite: 'NASA JPL (2026). Perseverance sets off-world record for total distance driven (45.22 km, Sol 2006).' },
  moxie: { tag: 'Mars 2020 MOXIE', cite: 'Hoffman, J.A. et al. (2022). Mars Oxygen ISRU Experiment results. Science Advances 8.' },
  alsep: { tag: 'Apollo 12 ALSEP / NSSDCA', cite: 'NASA NSSDCA, Apollo 12 ALSEP Dust Detector Experiment (1969-060C).' },
  cospar: { tag: 'COSPAR Planetary Protection Policy', cite: 'COSPAR (2021). COSPAR Policy on Planetary Protection, Special Regions on Mars.' },
};
