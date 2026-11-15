// SOL 60: RED HORIZON — static data: physics constants, world layout, customization options,
// story ("Echoes of Ares-7"), quest chain, NASA Codex, citations, game modes, default keybinds.

export const MARS = {
  g: 3.72, // m/s², surface gravity
  earthDelayLabel: '14 min 22 s',
  earthDelaySec: 862,
  pressureHpa: 7.5,
};

import { OLYMPUS, buildTrail, ledgeShelter } from './olympusRoute.js';
import { SOURCES } from './nasaDatasets.js';

// One in-game sol lasts this many real seconds (day/night cycle, crop growth, Sol counter).
export const SOL_REAL_SECONDS = 420;

// World bounds (metres). North is -Z. The crater sits south, Olympus Mons rises north.
export const WORLD = { minX: -600, maxX: 600, minZ: -720, maxZ: 480 };
export const CRATER = { x: 40, z: 210, r: 270, depth: 14, rim: 16 };
export const MT_SHARP = { x: 110, z: 270, r: 48, h: 16 };
// Olympus Mons: terraced cliff bands + spiralling ramp ledges (see olympusRoute.js). COMPRESSED, NOT TO SCALE.
export { OLYMPUS };

// Guide route around and up Olympus Mons: approach -> scarp ramp -> bench traverses -> ramps -> caldera pad.
export const TRAIL = buildTrail();
export const TRAIL_HALF_WIDTH = 4.2;

const LEDGE_C = ledgeShelter(1);
const LEDGE_D = ledgeShelter(4);

export const SITES = {
  landing: { x: 22, z: 300 },
  rescuePad: { x: OLYMPUS.x, z: OLYMPUS.z },
  ascentStart: { x: Math.round(TRAIL[0][0] + 8), z: Math.round(TRAIL[0][1] + 34) },
};

// Pre-built pressurized emergency dome shelters (anchor = point whose height the pad copies).
export const SHELTERS = [
  { id: 'hab-a', name: 'Ridgeback Hab', x: 58, z: 262, r: 6, door: Math.PI * 0.5 },
  { id: 'hab-b', name: 'Rim Outpost', x: 26, z: -150, r: 6, door: Math.PI * 0.5 },
  { id: 'hab-c', name: 'Tharsis Ledge Shelter', x: LEDGE_C.x, z: LEDGE_C.z, r: 5, door: LEDGE_C.door },
  { id: 'hab-d', name: 'Caldera Wall Shelter', x: LEDGE_D.x, z: LEDGE_D.z, r: 5, door: LEDGE_D.door },
];

// Repairable NASA infrastructure.
export const DEVICES = [
  { id: 'rover', kind: 'rover', name: 'Mars Exploration Rover "Tenacity"', x: -38, z: 228, repairTime: 6, yaw: 0.6 },
  { id: 'sub1', kind: 'solar', name: 'Solar Power Substation', x: 150, z: 172, repairTime: 4.5, yaw: 0.3 },
  { id: 'sub2', kind: 'rtg', name: 'RTG Power Substation', x: -142, z: 300, repairTime: 4.5, yaw: -0.4 },
  { id: 'relay', kind: 'relay', name: 'Deep-Space Relay Tower', x: -40, z: -60, repairTime: 6, yaw: 0 },
  { id: 'weather', kind: 'weather', name: 'REMS / MEDA Weather Station', x: 100, z: 215, repairTime: 5, yaw: 0.5 },
];

// Flattened pads (site footprints). Anchor = height source point.
export const PADS = [
  { x: SITES.landing.x, z: SITES.landing.z, r: 9 },
  ...SHELTERS.map((s) => ({ x: s.x, z: s.z, r: s.r + 3, anchor: s.anchor })),
  ...DEVICES.map((d) => ({ x: d.x, z: d.z, r: d.kind === 'relay' ? 8 : 6 })),
  { x: SITES.ascentStart.x, z: SITES.ascentStart.z, r: 5 },
  { x: SITES.rescuePad.x, z: SITES.rescuePad.z, r: 10 },
];

// Holographic echoes of NASA's pioneers.
export const ECHOES = [
  {
    id: 'perseverance',
    name: 'Perseverance',
    x: -70,
    z: 190,
    years: '2021 –',
    text: 'Echo // Perseverance. MOXIE turned Martian CO2 into 122 grams of breathable oxygen. Every gram you grow here matters. Start your farm.',
    source: 'NASA Mars 2020 / MOXIE',
  },
];

// ---------------------------------------------------------------- Customization
export const SUIT_COLORS = [
  { id: 'white', name: 'NASA White', hex: '#e9ecef' },
  { id: 'orange', name: 'Ares Orange', hex: '#e8682a' },
  { id: 'cobalt', name: 'Cobalt Blue', hex: '#2f5fd0' },
  { id: 'slate', name: 'Stealth Slate', hex: '#4a5260' },
];
export const ACCENT_TRIMS = [
  { id: 'red', name: 'Mission Red', hex: '#d62b2b' },
  { id: 'yellow', name: 'Signal Yellow', hex: '#f2c230' },
  { id: 'teal', name: 'Pathfinder Teal', hex: '#20b2aa' },
  { id: 'silver', name: 'Mylar Silver', hex: '#b8c2cc' },
];
export const VISOR_TINTS = [
  { id: 'gold', name: '24k Gold', hex: '#d4a017', metal: 1.0, rough: 0.12 },
  { id: 'cyan', name: 'Cyan HUD', hex: '#22d3ee', metal: 0.6, rough: 0.08 },
  { id: 'obsidian', name: 'Obsidian', hex: '#14161a', metal: 0.9, rough: 0.05 },
];
export const BACKPACKS = [
  { id: 'plss', name: 'Standard PLSS', desc: 'Balanced life support.', o2Cap: 100, shield: 0.85, solar: 0 },
  { id: 'o2max', name: 'Extended O2 Tanks', desc: '+25% oxygen capacity.', o2Cap: 125, shield: 0.8, solar: 0 },
  { id: 'rad', name: 'Rad-Shield Pack', desc: 'Suit shield blocks 95% of flare dose.', o2Cap: 95, shield: 0.95, solar: 0 },
  { id: 'solar', name: 'Solar-Wing Pack', desc: 'Recharges battery in daylight.', o2Cap: 95, shield: 0.8, solar: 1 },
];
export const PATCHES = [
  { id: 'ares7', name: 'Ares-7 Crest', motto: 'ARES-7' },
  { id: 'olympus', name: 'Olympus Summit', motto: 'ASCEND' },
  { id: 'pioneer', name: 'Pioneer Legacy', motto: 'PERSEVERE' },
  { id: 'redplanet', name: 'Red Planet', motto: 'SOL 60' },
];
export const HULL_SCHEMES = [
  { id: 'classic', name: 'Classic White', base: '#e8e8e4', band: '#1d1f24' },
  { id: 'ares', name: 'Ares Orange', base: '#e8e3da', band: '#e0601f' },
  { id: 'cobalt', name: 'Cobalt Night', base: '#27324a', band: '#9fb4d8' },
  { id: 'retro', name: 'Retro Silver', base: '#b9bec6', band: '#b3262c' },
];
export const THRUSTER_BELLS = [
  { id: 'raptor', name: 'Wide Bell' },
  { id: 'rl10', name: 'Long Nozzle' },
  { id: 'aerospike', name: 'Aerospike' },
  { id: 'quad', name: 'Quad Cluster' },
];
export const HULL_DECALS = [
  { id: 'ares', name: 'ARES-7 Wordmark' },
  { id: 'stripes', name: 'Flag Stripes' },
  { id: 'checker', name: 'Roll Checker' },
  { id: 'none', name: 'Clean' },
];
export const FLAG_LAYOUTS = [
  { id: 'h3', name: 'Horizontal Tricolor' },
  { id: 'v3', name: 'Vertical Tricolor' },
  { id: 'diag', name: 'Diagonal Split' },
  { id: 'chevron', name: 'Chevron' },
  { id: 'quarter', name: 'Quartered' },
];
export const FLAG_COLORS = ['#c1272d', '#f2f2f2', '#1f3a93', '#f2c230', '#1e8c4e', '#e8682a', '#111318', '#22d3ee'];
export const FLAG_EMBLEMS = [
  { id: 'star', name: 'Star' },
  { id: 'planet', name: 'Ringed Planet' },
  { id: 'rocket', name: 'Rocket' },
  { id: 'olympus', name: 'Olympus' },
  { id: 'none', name: 'None' },
];

export const DEFAULT_CUSTOM = {
  suit: 'white',
  accent: 'red',
  visor: 'gold',
  backpack: 'plss',
  patch: 'ares7',
  hull: 'ares',
  bell: 'raptor',
  decal: 'ares',
  flagLayout: 'h3',
  flagColors: ['#c1272d', '#f2f2f2', '#1f3a93'],
  flagEmblem: 'star',
  loadout: ['scrubber', 'insulation', 'booster', 'veggie'],
};

export const byId = (list, id) => list.find((o) => o.id === id) || list[0];

// ---------------------------------------------------------------- Story & quest
export const QUEST_STEPS = [
  {
    step: 1,
    title: 'Establish Life Support',
    brief: 'Plant your mission flag, secure a pressurized shelter and start Martian agriculture.',
  },
  {
    step: 2,
    title: 'Restore the Power Grid',
    brief: 'Repair the Solar and RTG power substations and calibrate the REMS / MEDA weather station. Fixing the rover makes travel faster.',
  },
  {
    step: 3,
    title: 'Transmit to Earth',
    brief: 'Repair the Deep-Space Relay Tower on the north rim, lock the high-gain signal and transmit.',
  },
  {
    step: 4,
    title: 'Climb Olympus Mons',
    brief: 'The rescue rocket is on the summit caldera. Circle the cliff bands ramp by ramp, or climb the faces with pitons, and board it.',
  },
];

export const RADIO = {
  intro: [
    ['FLIGHT', 'Ares-7, this is a recorded uplink. Year 2034. An orbital anomaly cut your relay link. You are alone in Gale Crater.'],
    ['FLIGHT', 'Earth is 14 minutes and 22 seconds away by radio. A planet-wide storm is building. Plant your flag, find shelter, grow food.'],
  ],
  flag: [['YOU', 'Flag planted. Ares-7 has arrived. Now: air, warmth, food.']],
  shelter: [['HAB', 'Pressure nominal. Oxygen recharge active. This dome will keep you alive through storms and quakes.']],
  farm: [['YOU', 'First seeds in Martian regolith. Water them, and they will feed me and the oxygen loop.']],
  step2: [['YOU', 'Life support is stable. Next: the power grid. Two substations went dark when the relay failed.']],
  sub: [['GRID', 'Substation online. Conduits energized.']],
  rover: [['ROVER', 'Actuators green. RTG core warm. Press E to drive.']],
  step3: [['YOU', 'Grid restored. Now the relay tower on the north rim. Earth has to hear us.']],
  relayFixed: [['RELAY', 'Transceiver repaired. Align the high-gain dish: press E as the signal needle crosses the lock band.']],
  transmit: [['YOU', 'Telemetry away. Fourteen minutes for it to cross the void… and fourteen more for any reply.']],
  reply: [
    ['EARTH', 'Ares-7, Houston. We hear you. You are not alone. Say again, you are not alone.'],
    ['EARTH', 'The storm will bury the lowlands. Our rescue ascent rocket is landing on the summit caldera of Olympus Mons. Climb, Commander.'],
  ],
  step4: [['YOU', 'Twenty-two kilometres of volcano, scaled down to one long climb. Shelters on the ledges. Go.']],
  ledge1: [['YOU', 'Tharsis Ledge shelter ahead. Air is thinner already.']],
  ledge2: [['YOU', 'Caldera Wall shelter. Almost there. Don’t look down.']],
  summit: [['EARTH', 'We have you on the summit cameras. Rocket hatch is open. Come home.']],
  shipInbound: [['EARTH', 'Ares-7, the rescue ascent vehicle is on final approach. Clear the pad.']],
  shipDown: [['RESCUE', 'Touchdown on the caldera. Commander, hold position, we are coming to you.']],
  greet: [['RESCUE', 'Commander! Good to see a friendly face. Follow me aboard, the storm is closing in.']],
  dustWarn: [['FLIGHT', 'Dust wall inbound. Get inside a shelter or behind a rock ridge, now.']],
  quakeWarn: [['SEIS', 'Seismic event, Cerberus Fossae. Clear the slopes! Watch for falling rock.']],
  flareWarn: [['RAD', 'Solar particle event incoming. Take shelter or press R for suit shielding.']],
  lowO2: [['SUIT', 'Warning: oxygen low. Recharge in a shelter or harvest crops.']],
  cold: [['SUIT', 'Warning: core temperature falling.']],
};

export const ENDINGS = {
  rescued: {
    title: 'HOMEWARD BOUND',
    text: 'The rescue rocket clears the summit of Olympus Mons as the storm swallows the plains below. Ares-7 is coming home.',
  },
  lost: {
    title: 'SIGNAL LOST',
    text: 'The Commander did not survive. The telemetry you gathered still reached Earth, and the next crew will know the way.',
  },
  sandbox: {
    title: 'SANDBOX COMPLETE',
    text: 'Cadet flight complete. Every system you repaired is logged for the next mission.',
  },
  expedition: {
    title: 'EXPEDITION COMPLETE',
    text: 'The rover is rolling, the pioneers are accounted for, Bright Angel is scanned and the weather grid is calibrated. Gale Crater has never been this well understood.',
  },
};

// Branching epilogues appended to the ending, chosen by how the player treated the NASA pioneers.
export const LEGACY_ENDINGS = {
  mesh: 'LEGACY BRANCH · THE GHOST MESH: You preserved every pioneer you reached and linked their transponders into a UHF mesh. Their last whispers ride your signal home, and the next crew will land to a crater that still remembers its explorers.',
  salvage: 'LEGACY BRANCH · THE SALVAGER: You stripped the dormant pioneers for batteries, oxygen and suit patches. It kept you alive, and the machines gave their final service, but the heritage sites were left bare.',
  mixed: 'LEGACY BRANCH · THE PRAGMATIST: You preserved some pioneers and salvaged others, weighing legacy against survival the way every real mission planner must.',
  none: 'LEGACY BRANCH · THE UNMET: The pioneers still wait in the dust of Gale Crater, their beacons ticking. Next time, follow the Morse.',
};

// ---------------------------------------------------------------- NASA Codex
export const CODEX = [
  {
    id: 'mola',
    title: 'Olympus Mons',
    source: 'MGS MOLA DEM',
    text: 'The tallest volcano in the solar system: about 21.9 km above the Mars datum (roughly 25 km above the surrounding plains) and about 624 km across, ringed by a basal escarpment up to ~8 km tall, with a summit caldera ~80 × 60 km and ~3 km deep. MOLA laser altimetry mapped it. In-game it is compressed about 80× in height and placed beside Gale Crater; in reality the two are ~5,300 km apart.',
  },
  {
    id: 'scale',
    title: 'Not to Scale: Why',
    source: 'Game design note · MOLA / USGS',
    text: 'Compressed Simulation Zone — Not to Scale / Regions Combined for Mission Playability. Gale Crater (154 km wide, 5.4° S) and Olympus Mons (~624 km wide, 18.65° N in Tharsis) are ~5,300 km apart. The game squeezes both into a 1.2 km zone so one mission can visit them. Shapes, materials, weather and physics follow NASA data; distances and heights do not.',
  },
  {
    id: 'roverpower',
    title: 'Rover Power Budget',
    source: 'MSL Curiosity · MER',
    text: 'Curiosity runs on an MMRTG giving ~110 W, charging batteries that cover peak loads; Spirit and Opportunity depended on solar panels that dust slowly blanketed. Driving, climbing, heaters through −80 °C nights and instruments all draw on the same budget, which is why mission planners schedule every watt-hour.',
  },
  {
    id: 'spectra',
    title: 'Reading Minerals in Light',
    source: 'MRO CRISM · Perseverance SHERLOC',
    text: 'Hydrated minerals absorb near-infrared light at characteristic wavelengths: Fe/Mg clays near 1.41, 1.91 and 2.30 µm, gypsum near 1.45, 1.75 and 1.94 µm. Hematite shows bands near 0.53 and 0.86 µm. Matching these bands is how orbiters and rovers map ancient water.',
  },
  {
    id: 'gale',
    title: 'Gale Crater',
    source: 'MSL Curiosity',
    text: 'A 154 km impact crater holding Aeolis Mons (Mount Sharp). Curiosity found an ancient lake bed here, a habitable environment billions of years ago.',
  },
  {
    id: 'rems',
    title: 'Temperature & Pressure',
    source: 'Curiosity REMS',
    text: 'Air at Gale swings from about −78 °C at night to near 0 °C on summer afternoons, at roughly 0.6% of Earth’s sea-level pressure. Higher elevations are colder and thinner.',
  },
  {
    id: 'meda',
    title: 'Dust Storms & Wind',
    source: 'Perseverance MEDA',
    text: 'MEDA records wind, dust and dust devils at Jezero. Regional storms can raise dust walls; global storms, like the one in 2018, darken the sky for months.',
  },
  {
    id: 'seis',
    title: 'Marsquakes',
    source: 'InSight SEIS',
    text: 'InSight detected more than 1,300 marsquakes, the largest a magnitude 4.7 in May 2022. Many originate near Cerberus Fossae, a young fault system east of Elysium.',
  },
  {
    id: 'rad',
    title: 'Radiation',
    source: 'MSL RAD',
    text: 'RAD measured about 0.67 millisieverts per day on the surface. Solar particle events can spike the dose; shielding and shelters matter.',
  },
  {
    id: 'escapade',
    title: 'Space Weather',
    source: 'NASA ESCAPADE',
    text: 'ESCAPADE’s twin spacecraft study how the solar wind strips Mars’ atmosphere, improving space-weather forecasts for future crews.',
  },
  {
    id: 'veggie',
    title: 'Growing Food',
    source: 'NASA Veggie / Regolith Simulant Studies',
    text: 'Veggie grew lettuce, kale and zinnias on the ISS. Experiments with Mars regolith simulants show crops such as potatoes need added nutrients and careful watering to thrive.',
  },
  {
    id: 'spirulina',
    title: 'Spirulina & Oxygen',
    source: 'ESA MELiSSA / NASA Bioregenerative Life Support',
    text: 'Cyanobacteria such as spirulina turn CO2 into oxygen and protein. Bioregenerative loops are being studied for long-duration missions.',
  },
  {
    id: 'moxie',
    title: 'MOXIE',
    source: 'Mars 2020 MOXIE',
    text: 'MOXIE produced 122 g of oxygen from the Martian atmosphere across 16 runs, proving in-situ oxygen production works.',
  },
  {
    id: 'hirise',
    title: 'Orbital Mapping',
    source: 'MRO HiRISE / SHARAD',
    text: 'HiRISE resolves features about 30 cm across from orbit; SHARAD radar sees buried ice layers. Both guide where rovers and crews can safely go.',
  },
  {
    id: 'sunset',
    title: 'Blue Sunsets',
    source: 'MSL Mastcam',
    text: 'Fine Martian dust scatters blue light forward, so the sky near the setting Sun glows blue. Curiosity photographed one in Gale Crater in 2015.',
  },
  {
    id: 'aurora',
    title: 'Martian Aurora',
    source: 'Perseverance / MAVEN',
    text: 'In 2024 Perseverance captured the first visible-light aurora from the surface of another planet, a faint green glow triggered by a solar storm.',
  },
  {
    id: 'phobos',
    title: 'Phobos Transit',
    source: 'MSL Mastcam / Perseverance Mastcam-Z',
    text: 'Phobos is small and close, so it crosses the Sun in about 30 seconds and never fully eclipses it. Curiosity and Perseverance have photographed these transits to refine the moon’s orbit.',
  },
  {
    id: 'geyser',
    title: 'CO2 Dry-Ice Geysers',
    source: 'MRO HiRISE / CRISM',
    text: 'In spring, sunlight warms translucent CO2 ice near the poles; it sublimates and bursts out as jets, spraying dark dust into fan-shaped spots. HiRISE images show the fans, but no spacecraft has watched a jet fire.',
  },
  {
    id: 'delay',
    title: 'Light-Time Delay',
    source: 'NASA Deep Space Network',
    text: 'Radio signals take between about 3 and 22 minutes to cross between Earth and Mars. Crews must act on their own between messages.',
  },
];

// Citations: { text, url } — the URL is the NASA / PDS / USGS page that documents the dataset or mission.
export const CITATIONS = [
  { text: 'Smith, D. E. et al. (2001). Mars Orbiter Laser Altimeter (MOLA): Experiment summary. JGR Planets 106(E10). Data: NASA PDS Geosciences Node.', url: SOURCES.pdsMola.url },
  { text: 'MOLA Mission Experiment Gridded Data Records (MEGDR), global Mars topography. NASA PDS Geosciences Node.', url: SOURCES.pdsMegdr.url },
  { text: 'NASA/MOLA Science Team (2000). Olympus Mons from MOLA topography, PIA02806.', url: SOURCES.molaOlympus.url },
  { text: 'NASA/JPL-Caltech. Mount Sharp inside Gale Crater (Gale 154 km; Mount Sharp 5.5 km above the floor).', url: SOURCES.galeSharp.url },
  { text: 'Gómez-Elvira, J. et al. (2012). REMS: The environmental sensor suite for the Mars Science Laboratory rover. Space Sci. Rev. 170.', url: SOURCES.rems.url },
  { text: 'Rodriguez-Manfredi, J. A. et al. (2021). The Mars Environmental Dynamics Analyzer, MEDA. Space Sci. Rev. 217.', url: SOURCES.meda.url },
  { text: 'NASA NSSDC (Williams, D. R.). Mars Fact Sheet: gravity, pressure, temperature and winds.', url: SOURCES.factsheet.url },
  { text: 'Banerdt, W. B. et al. (2020). Initial results from the InSight mission on Mars. Nature Geoscience 13.', url: SOURCES.insight.url },
  { text: 'Hassler, D. M. et al. (2014). Mars’ surface radiation environment measured with the MSL Curiosity rover. Science 343.', url: SOURCES.curiosity.url },
  { text: 'NASA Goddard / UC Berkeley SSL. ESCAPADE mission overview.', url: SOURCES.escapade.url },
  { text: 'Hoffman, J. A. et al. (2022). Mars Oxygen ISRU Experiment (MOXIE). Science Advances 8.', url: SOURCES.perseverance.url },
  { text: 'McEwen, A. S. et al. (2007). MRO HiRISE; Murchie, S. et al. (2007). CRISM. JGR Planets 112.', url: SOURCES.mro.url },
  { text: 'NASA/JPL MER Spirit and Opportunity mission archive (2004–2019).', url: SOURCES.mer.url },
  { text: 'NASA Moon to Mars Architecture: life support, ISRU and surface power for crewed Mars missions.', url: SOURCES.m2m.url },
  { text: 'USGS / IAU Gazetteer of Planetary Nomenclature: Gale, Aeolis Mons, Olympus Mons coordinates.', url: SOURCES.gazetteer.url },
];

// ---------------------------------------------------------------- Modes, keys, graphics
export const GAME_MODES = [
  {
    id: 'campaign',
    name: 'Full Story Campaign',
    desc: 'Bunker hangar -> launch -> Gale Crater survival -> relay -> Olympus Mons finale.',
  },
  {
    id: 'ascent',
    name: 'Olympus Mons Ascent',
    desc: 'Start at the foot of the volcano with the storm rising. Climb to the rescue rocket.',
  },
  {
    id: 'expedition',
    name: 'Rover Rescue & Science Expedition',
    desc: 'Open-world exploration of Gale Crater: repair and drive the rover, track the NASA pioneers by Morse beacon, scan Bright Angel, calibrate the weather station.',
  },
  {
    id: 'cadet',
    name: 'Cadet Sandbox',
    desc: 'Softer hazards, unlimited build kits and no permadeath. (The 60-second Judge Path is the big button above.)',
    variants: [
      { id: 'sandbox', name: 'Cadet Sandbox' },
      
    ],
  },
];

export const DEFAULT_KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  interact: 'KeyE',
  build: 'KeyB',
  rotate: 'KeyQ',
  flashlight: 'KeyF',
  xray: 'KeyX',
  codex: 'KeyI',
  shield: 'KeyR',
  hud: 'KeyH',
  selfie: 'KeyP',
  crouch: 'KeyV',
  mastcam: 'KeyC',
  piton: 'KeyT',
  data: 'KeyN',
};

export const KEY_LABELS = {
  forward: 'Move forward',
  back: 'Move back',
  left: 'Strafe left',
  right: 'Strafe right',
  jump: 'Mars jump',
  sprint: 'Sprint',
  interact: 'Interact / repair / drive',
  build: 'Build mode',
  rotate: 'Rotate build / switch crop',
  flashlight: 'Helmet flashlight',
  xray: 'X-Ray blueprint',
  codex: 'NASA Codex',
  shield: 'Suit radiation shield',
  hud: 'Hide / show HUD',
  selfie: 'Mars selfie',
  crouch: 'Crouch (hold)',
  mastcam: 'Mastcam-Z photo mode',
  piton: 'Place piton (while climbing)',
  data: 'NASA data overlay',
};

export const GRAPHICS = {
  low: { label: 'Low', pixelRatio: 0.75, shadows: false, shadowSize: 0, terrainSeg: 150, rocks: 260, particles: 260, antialias: false, post: false },
  medium: { label: 'Medium', pixelRatio: 1, shadows: true, shadowSize: 2048, terrainSeg: 210, rocks: 480, particles: 520, antialias: true, post: false },
  high: { label: 'High', pixelRatio: 1.5, shadows: true, shadowSize: 4096, terrainSeg: 270, rocks: 720, particles: 900, antialias: true, post: true },
};

export const DEFAULT_SETTINGS = {
  graphics: 'medium',
  resScale: 1,
  fov: 62,
  volume: 0.7,
  marsFilter: true,
  sensitivity: 1,
  reducedMotion: false, // first run follows the OS prefers-reduced-motion setting
  touchControls: false, // first run turns on for touch-first devices
  captions: true, // visual beacon bearing + live Morse captions
};

export const BUILD_ITEMS = [
  { id: 'habitat', name: 'Pressurized Habitat', radius: 4.6 },
  { id: 'planter', name: 'Regolith Planter', radius: 1.5 },
];

export const CROPS = {
  potato: { name: 'Martian Potatoes', growTime: 150, o2: 10, food: 38, focus: 12 },
  spirulina: { name: 'Spirulina Tank', growTime: 110, o2: 28, food: 12, focus: 10 },
};

export const RADIO_SLEEP = [['HAB', 'Rest cycle complete. Sunrise over Gale Crater. Oxygen full, suit systems nominal.']];

// Opening cutscene: subtitle beats shown while Ares-7 descends (each ~3.9 s). Facts link to NASA sources in the Codex.
export const BRIEFING = [
  { title: 'SOL 1 · YEAR 2034 · ARES-7 ENTRY', text: 'Compressed Simulation Zone, not to scale: Gale Crater and Olympus Mons, ~5,300 km apart on the real Mars, share one mission map.' },
  { title: 'THIN AIR', text: 'Surface pressure is ~600–900 Pa, under 1% of Earth’s. There is no breathable oxygen: every breath comes from your suit, your shelters and your crops.' },
  { title: 'EXTREME COLD', text: 'Curiosity’s REMS station records about −80 °C before dawn and near 0 °C on the best afternoons. Night and altitude drain your warmth and battery.' },
  { title: 'DUST STORMS', text: 'Dust fronts at 17–30 m/s blot out the Sun, clog suit filters and bury solar panels. Shelter, or get behind a ridge.' },
  { title: 'SEISMIC INSTABILITY', text: 'InSight’s SEIS heard 1,319 marsquakes. A tremor shakes boulders loose from cliffs: feel the P-wave, then get off the slopes.' },
  { title: 'ROVER ENERGY', text: 'Rover Tenacity pays for every metre: driving, climbing inclines, lights and cold nights drain it. Aim solar arrays, clear dust and route substation power to keep it alive.' },
  { title: 'THE MISSION', text: 'Restore power, map hydrated minerals, find the dormant NASA pioneers, call Earth, then climb Olympus Mons, around its cliff bands, to the rescue ship.' },
];
export const BRIEFING_BEAT = 3.9;
