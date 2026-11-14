// Six-sol survival simulation. Pure state machine: the 3D scene only reads from it.

import { ITEMS, HARDWARE_BY_ID, CRATERS, BASE, MODES, LANDMARK_BY_ID, GEYSERS } from './data.js';
import { layersAt, routePoint, clamp01, lerp } from './terrain.js';

export const DAY_FRAC = 0.55; // fraction of each sol spent walking in daylight
export const MISSION_END = 5 + DAY_FRAC; // summit at dusk on Sol 6
export const SOL_SECONDS = 26; // real seconds per sol at 1x
const SOL_HOURS = 24.66;
export const DUSK = { start: DAY_FRAC - 0.075, end: DAY_FRAC + 0.09 }; // Martian blue sunset window
export const ECLIPSE = { T: 2.2, len: 0.096 }; // Phobos transit, Sol 3 morning
export const QUAKE_T = 3.32; // Cerberus Fossae marsquake, Sol 4
export const MRO_WINDOW = [0.1, 0.42]; // fraction of an even sol when MRO is overhead
export const OWLT = '14m 22s';
export const SCAN_RANGE = 7;

// Deterministic seed from any string, e.g. "GALE-2026".
export function hashSeed(str) {
  const t = String(str ?? '').trim().toUpperCase();
  if (!t) return (Math.random() * 4294967296) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mroOverhead(T) {
  const sol = Math.floor(T) + 1;
  const t = T - Math.floor(T);
  return sol % 2 === 0 && t >= MRO_WINDOW[0] && t <= MRO_WINDOW[1];
}

// Sols (fractional) until the next MRO pass begins; 0 while overhead.
export function mroCountdown(T) {
  if (mroOverhead(T)) return 0;
  let k = Math.floor(T);
  for (let i = 0; i < 4; i++) {
    const sol = k + 1;
    const start = k + MRO_WINDOW[0];
    if (sol % 2 === 0 && start > T) return start - T;
    k++;
  }
  return 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gale Crater weather in the style of Curiosity's REMS station. A planet-encircling
// dust storm cools the days and warms the nights, exactly as REMS saw in 2018.
function buildWeather(stormStart, stormLen, rng) {
  const prof = stormLen === 3 ? [0.7, 1, 0.55] : [0.85, 1];
  const out = [];
  for (let sol = 1; sol <= 6; sol++) {
    const k = sol - stormStart;
    const storm = k >= 0 && k < stormLen ? prof[k] : 0;
    const post = k >= stormLen ? 0.12 : 0;
    const j = sol === 1 ? () => 0 : () => (rng() - 0.5) * 2;
    out.push({
      sol,
      storm,
      tau: +(0.55 + j() * 0.1 + storm * 6.2 + post * 6).toFixed(2),
      dayT: Math.round(-14 + j() * 3 - storm * 15),
      nightT: Math.round(-79 + j() * 2.5 + storm * 9),
      pressure: Math.round(730 + j() * 4 + storm * 22),
      wind: Math.round(5 + j() * 2 + storm * 19),
      uv: storm > 0.3 ? 'LOW' : sol === 2 ? 'VERY HIGH' : sol === 6 ? 'HIGH' : 'MODERATE',
      label:
        storm >= 0.95
          ? 'GLOBAL DUST STORM: PEAK'
          : storm > 0
            ? 'GLOBAL DUST STORM'
            : post
              ? 'DUST HAZE CLEARING'
              : 'CLEAR',
    });
  }
  return out;
}

function log(s, text, tone = 'info', mark = null) {
  s.log.push({ T: s.T, sol: Math.min(6, Math.floor(s.T) + 1), text, tone });
  if (mark) s.marks.push({ T: s.T, label: mark, tone });
}

function sample(s) {
  s.history.push({
    T: s.T,
    power: s.power,
    o2: (s.o2 / s.o2Cap) * 100,
    rad: Math.min(100, s.rad),
    thermal: s.thermal,
    science: s.science,
    focus: s.focus,
  });
  s.lastSample = s.T;
}

function nearestOnRoute(route, x, z) {
  let best = { d: Infinity, t: 0 };
  for (const p of route.samples) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best.d) best = { d, t: p.t };
  }
  return best;
}

export function createMission({
  vehicle,
  packed,
  route,
  seed,
  mode = 'director',
  contract = null,
  damaged = null,
  repaired = false,
  escapade = false,
  sterilized = false,
  softLanding = true,
}) {
  const seedNum = (seed ?? Date.now()) >>> 0;
  const rng = mulberry32(seedNum);
  const M = MODES[mode] || MODES.director;
  const has = {};
  const lost = damaged && !repaired ? damaged : null;
  ITEMS.forEach((i) => (has[i.id] = packed.includes(i.id) && i.id !== lost));
  const stormStart = rng() < 0.5 ? 3 : 4;
  const stormLen = rng() < 0.6 ? 3 : 2;
  const weather = buildWeather(stormStart, stormLen, rng);
  const o2Cap = BASE.o2Sols + (has.eclss ? 4 : 0);
  const schedule = [
    { id: 'spe1', T: 1 + 0.12 + rng() * 0.25 },
    { id: 'storm', T: stormStart - 1 + 0.04 },
    { id: 'leak', T: stormStart + 0.1 + rng() * 0.3 },
    { id: 'quake', T: QUAKE_T },
  ];
  if (rng() < 0.7) schedule.push({ id: 'spe2', T: 5 + 0.06 + rng() * 0.2 });
  schedule.sort((a, b) => a.T - b.T);
  const quiet = []; // non-blocking timed effects
  if (escapade) {
    for (const ev of schedule) {
      if (ev.id === 'spe1' || ev.id === 'spe2') quiet.push({ id: `warn_${ev.id}`, T: Math.max(0.02, ev.T - 1), target: ev.T });
    }
  }
  quiet.push({ id: 'eclipse_on', T: ECLIPSE.T }, { id: 'eclipse_off', T: ECLIPSE.T + ECLIPSE.len });

  // Geysers and landmarks positioned relative to this route.
  const geysers = GEYSERS.map((g) => {
    const n = nearestOnRoute(route, g.x, g.z);
    return { ...g, t: n.t, d: n.d, walkIn: n.d < 2.6 };
  });

  const s = {
    seed: seedNum,
    mode: M.id,
    hz: M.hazard,
    contract,
    vehicle,
    has,
    packed: [...packed],
    lost,
    damaged,
    repaired,
    route,
    rng,
    weather,
    stormStart,
    stormLen,
    T: 0,
    power: (repaired && damaged ? 88 : 100) - (sterilized ? 6 : 0),
    o2: o2Cap,
    o2Cap,
    rad: vehicle.transitRad * (has.shield ? 0.5 : 1) * M.hazard,
    thermal: 100,
    focus: 100,
    visorDust: 0,
    science: 0,
    sciInSitu: 0,
    sciLegacy: 0,
    sciDrill: 0,
    sciBonus: 0,
    alive: true,
    done: false,
    cause: null,
    escapade,
    sterilized,
    flags: {
      medkit: has.medkit,
      injured: false,
      leakRate: 0,
      leaked: 0,
      sealed: false,
      wing: false,
      rhu: false,
      rotor: false,
      forecast: false,
      legacyMedal: false,
      panelDust: 0,
      speDose: 0,
      sheltered: 0,
      berm: false,
      lavaTube: false,
      dragWheel: false,
      eclipse: false,
      eclipseAward: 0,
      quakeIce: false,
      icePocket: false,
      devilWon: null,
      contained: false,
      gazedSol: 0,
      warned: {},
      survivedCold: false,
      knockback: 0,
      petRock: false,
      synergy: false,
    },
    comms: BASE.comms + (has.dish ? 150 : 0),
    meshLinks: [],
    scanned: {},
    abrasion: {},
    locks: {},
    family: { sojourner: !!softLanding, spirit: false, opportunity: false, curiosity: false, perseverance: false, ingenuity: false },
    geysers,
    schedule,
    quiet,
    fired: {},
    encounters: {},
    craterHits: {},
    log: [],
    marks: [],
    history: [],
    record: { choices: [], actions: [] },
    stats: { coldestEff: 0, coldestSol: 0, coldestFreeze: 0, stormSols: stormLen, moxieClogged: false },
    solLogged: 0,
    wasDay: true,
    lastSample: -1,
    view: null,
  };
  log(
    s,
    `Touchdown at Bradbury. ${vehicle.name} cruise dose: ${s.rad.toFixed(0)}%. Traverse is ${route.km.toFixed(0)} km to the summit.`,
    'cyan',
  );
  if (damaged) {
    const name = ITEMS.find((i) => i.id === damaged).name;
    log(s, repaired ? `${name} repaired after the hard landing (12% battery spent).` : `${name} destroyed in the hard landing.`, repaired ? 'amber' : 'crimson', 'EDL');
  }
  sample(s);
  s.view = { ...derive(s) };
  Object.assign(s.view, rates(s, s.view));
  return s;
}

export function derive(s) {
  const Tc = Math.min(s.T, MISSION_END);
  const solIdx = Math.min(5, Math.floor(Tc));
  const tSol = Tc - solIdx;
  const isDay = tSol < DAY_FRAC;
  const progress = Math.min(1, (solIdx + Math.min(tSol / DAY_FRAC, 1)) / 6);
  const pos = routePoint(s.route, progress);
  const L = layersAt(pos.x, pos.z);
  const wx = s.weather[solIdx];
  const range = wx.dayT - wx.nightT;
  let ambient;
  if (isDay) {
    ambient = wx.nightT + range * (0.1 + 0.9 * Math.sin(Math.PI * Math.min(tSol / DAY_FRAC, 1) * 0.85));
  } else {
    const v = (tSol - DAY_FRAC) / (1 - DAY_FRAC);
    ambient = wx.nightT + range * 0.51 * Math.exp(-4 * v);
  }
  const hour = (6 + tSol * SOL_HOURS) % SOL_HOURS;
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  const dusk = tSol >= DUSK.start && tSol <= DUSK.end;
  const sunElev = isDay ? Math.sin(Math.PI * (tSol / DAY_FRAC)) : -Math.sin(Math.PI * ((tSol - DAY_FRAC) / (1 - DAY_FRAC)));
  const eclipse = Tc >= ECLIPSE.T && Tc <= ECLIPSE.T + ECLIPSE.len ? Math.sin(Math.PI * ((Tc - ECLIPSE.T) / ECLIPSE.len)) : 0;
  return {
    sol: solIdx + 1,
    tSol,
    isDay,
    dusk,
    sunElev,
    eclipse,
    mro: mroOverhead(Tc),
    mroIn: mroCountdown(Tc),
    progress,
    pos,
    L,
    wx,
    ambient,
    clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

export function stormActive(s, d) {
  return d.wx.storm > 0;
}

export function legacyFactor(s) {
  return s.has.dish ? 1 : Math.min(1, 0.5 + 0.15 * s.meshLinks.length);
}

export function effectiveNightTemp(s, d) {
  return (
    d.wx.nightT -
    12 * d.L.freeze +
    s.vehicle.thermalDrift +
    (s.has.rtg ? 15 : 0) +
    (s.flags.rhu ? 20 : 0) +
    (s.flags.lavaTube && d.wx.storm > 0 ? 25 : 0) +
    (s.flags.berm ? 4 : 0)
  );
}

function rates(s, d) {
  const pace = s.route.pace;
  const mob = (s.has.lidar ? 0.5 : 1) * (s.flags.rotor ? 0.6 : 1) * (s.flags.dragWheel ? 1.15 : 1);
  const tube = s.flags.lavaTube && d.wx.storm > 0;
  const slopeLoad = d.L.slope * mob;
  const storm = d.wx.storm;

  // --- power (watts) ---
  let gen = s.has.rtg ? 35 : 0;
  const solarAvg = (s.has.solar ? 55 : 0) + (s.flags.wing ? 40 : 0);
  let solar = 0;
  if (solarAvg > 0 && d.isDay) {
    const sun = ((Math.PI / 2) * Math.sin((Math.PI * d.tSol) / DAY_FRAC)) / DAY_FRAC;
    const atten = storm > 0 ? lerp(1, 2 / 55, Math.min(1, storm * 1.35)) : 1 - 0.3 * d.L.tau;
    solar = solarAvg * sun * atten * (1 - s.flags.panelDust) * (1 - 0.45 * d.eclipse);
  }
  gen += solar;
  let load = BASE.loadW;
  const moxieOn = s.has.moxie && s.power > 4;
  if (moxieOn) load += 15;
  const nightEff = effectiveNightTemp(s, d);
  let heater = 0;
  if (!d.isDay) heater = clamp01((-52 - nightEff) / 34) * 24 * (s.has.aerogel ? 0.4 : 1);
  load += heater;
  if (d.isDay && !tube) load += 6 * pace + 26 * slopeLoad * pace;
  if (storm > 0 && d.isDay && !s.has.lidar && !tube) load += 7 * storm * (0.5 + d.L.tau) * (s.flags.berm ? 0.5 : 1);
  const netW = gen - load;

  // --- oxygen (sols of endurance per sol) ---
  let o2use = d.isDay ? 0.7 + 0.3 * pace + slopeLoad : 0.8;
  if (tube) o2use = 0.8;
  if (s.flags.injured) o2use *= 1.2;
  if (s.rad > 70) o2use *= 1.12;
  if (s.focus < 35) o2use *= 1.1;
  let o2gen = 0;
  let clog = 1;
  if (moxieOn) {
    if (storm > 0) clog = s.has.brush ? 0.85 : lerp(1, 0.35, storm);
    o2gen = 0.75 * clog;
  }
  const o2Net = o2gen - o2use - s.flags.leakRate * s.o2Cap * s.hz;

  // --- radiation (% of acute limit per sol) ---
  const radRate =
    4.5 *
    (1 + 1.6 * d.L.rad) *
    (s.has.shield ? 0.25 : 1) *
    (storm > 0 ? 0.9 : 1) *
    (tube ? 0.15 : 1) *
    (s.flags.berm && !d.isDay ? 0.5 : 1) *
    s.hz;

  // --- core temperature ---
  let thermalRate;
  let deficit = 0;
  if (d.isDay) thermalRate = 22;
  else {
    const rating = (s.has.aerogel ? -85 : -60) + (s.power < 10 ? 8 : 0);
    deficit = Math.max(0, rating - nightEff);
    thermalRate = deficit > 0 ? -4 * deficit * s.hz : 6;
  }

  let sciRate = d.isDay ? (60 / DAY_FRAC) * (s.has.libs ? 2.5 : 1) : 0;
  if (s.has.libs) sciRate *= 1 + 0.5 * d.L.crism; // CRISM hydrated minerals
  if (d.mro) sciRate *= 2; // MRO overhead doubles transmission
  if (s.focus < 35) sciRate *= 0.75;
  sciRate *= 1 - 0.35 * s.visorDust;
  if (tube) sciRate *= 0.3;
  const focusRate = -(10 + 8 * storm + (d.isDay ? 0 : 4) + (s.flags.injured ? 5 : 0)) * (tube || s.flags.berm ? 0.8 : 1);

  return {
    genW: gen,
    loadW: load,
    netW,
    solarW: solar,
    heaterW: heater,
    moxieOn,
    moxieClog: clog,
    o2use,
    o2gen,
    o2Net,
    radRate,
    thermalRate,
    deficit,
    nightEff,
    sciRate,
    focusRate,
    storm,
    tube,
  };
}

function useMedkit(s, why) {
  s.flags.medkit = false;
  log(s, `Med-Gel & Rad-Away kit expended: ${why}.`, 'cyan', 'MED');
}

function die(s, cause, out) {
  s.alive = false;
  s.cause = cause;
  s.deathT = s.T;
  const text = {
    oxygen: 'O2 partial pressure below 16 kPa. Loss of consciousness.',
    power: 'Battery bus at 0 V. Scrubber fans and heaters offline.',
    hypothermia: 'Core temperature below 28 °C. Cardiac arrhythmia.',
    radiation: 'Acute radiation syndrome. Crew incapacitated.',
  }[cause];
  log(s, text, 'crimson', 'LOC');
  sample(s);
  out.push({ type: 'end' });
}

export function stepMission(s, dt) {
  const out = [];
  if (!s.alive || s.done) return out;
  const d = derive(s);

  if (d.sol !== s.solLogged) {
    s.solLogged = d.sol;
    const wx = d.wx;
    log(
      s,
      `SOL ${d.sol} REMS: ${wx.label}. High ${wx.dayT} °C, low ${wx.nightT} °C, ${wx.pressure} Pa, tau ${wx.tau.toFixed(1)}, UV ${wx.uv}.`,
      wx.storm > 0 ? 'amber' : 'info',
    );
    if (wx.uv === 'VERY HIGH') log(s, 'UV index spike: visor gold film at full attenuation.', 'amber');
    if (s.has.brush && s.flags.panelDust > 0.04 && (s.has.solar || s.flags.wing)) {
      s.flags.panelDust = 0;
      log(s, 'Electrostatic brush cycle: solar arrays back to full output.', 'cyan');
    }
    if (d.sol % 2 === 0) log(s, `MRO overhead this sol: relay passes double Science Data transmission.`, 'cyan');
    if (s.flags.lavaTube && wx.storm === 0 && s.weather[d.sol - 2]?.storm > 0) {
      log(s, 'Storm has passed. Leaving the lava tube.', 'cyan');
    }
    out.push({ type: 'sol', sol: d.sol });
  }

  // Non-blocking timed effects.
  for (const q of s.quiet) {
    if (!s.fired[q.id] && s.T >= q.T) {
      s.fired[q.id] = true;
      if (q.id.startsWith('warn_')) {
        s.flags.warned[q.id.slice(5)] = true;
        log(s, 'ESCAPADE-Blue/Gold: solar energetic particle front detected. Impact in about 1 sol.', 'amber', 'WARN');
        out.push({ type: 'banner', id: 'spewarn', text: 'ESCAPADE SPACE WEATHER: SOLAR PARTICLE STORM IN ~1 SOL', tone: 'amber' });
      } else if (q.id === 'eclipse_on') {
        s.flags.eclipse = true;
        log(s, 'Phobos transit: the potato-shaped moon crosses the solar disk.', 'cyan', 'PHOBOS');
        out.push({ type: 'fx', id: 'eclipse', on: true });
      } else if (q.id === 'eclipse_off') {
        s.flags.eclipse = false;
        if (s.has.libs && s.power > 5) {
          s.science += 300;
          s.sciBonus += 300;
          s.flags.eclipseAward = 300;
          log(s, 'Spectrometer logged the Phobos transit limb-darkening profile. +300 Astronomy Data.', 'cyan');
          out.push({ type: 'toast', text: 'PHOBOS TRANSIT: +300 ASTRONOMY DATA', tone: 'cyan' });
        } else {
          log(s, 'Phobos transit over. No powered spectrometer to record it.', 'info');
        }
        out.push({ type: 'fx', id: 'eclipse', on: false });
      }
    }
  }

  for (const ev of s.schedule) {
    if (!s.fired[ev.id] && s.T >= ev.T) {
      s.fired[ev.id] = true;
      out.push({ type: 'event', id: ev.id });
      return out;
    }
  }
  for (const enc of s.route.encounters) {
    if (!s.fired[enc.id] && d.progress >= enc.t - 1e-6) {
      s.fired[enc.id] = true;
      out.push({ type: 'encounter', id: enc.id });
      return out;
    }
  }
  if (!s.fired.slope && d.isDay && ((d.L.slope > 0.5 && d.progress > 0.22) || d.progress > 0.9)) {
    s.fired.slope = true;
    out.push({ type: 'event', id: 'slope' });
    return out;
  }
  // Spirit's 2005 dust-devil cleaning gamble.
  if (
    !s.fired.devil &&
    d.isDay &&
    d.wx.storm === 0 &&
    (s.has.solar || s.flags.wing) &&
    !s.has.brush &&
    s.flags.panelDust > 0.22
  ) {
    s.fired.devil = true;
    out.push({ type: 'event', id: 'devil' });
    return out;
  }
  // CO2 geyser directly on the path.
  for (const g of s.geysers) {
    if (g.walkIn && !s.fired[`walk_${g.id}`] && d.progress >= g.t) {
      s.fired[`walk_${g.id}`] = true;
      if (!s.scanned[g.id]) {
        s.visorDust = Math.min(1, s.visorDust + 0.45);
        s.flags.knockback += 1;
        s.thermal = Math.max(1, s.thermal - 4 * s.hz);
        log(s, 'Walked into a sublimating CO2 jet. Knocked back, visor coated in dark dust.', 'amber', 'GEYSER');
        out.push({ type: 'fx', id: 'knockback' });
        out.push({ type: 'toast', text: 'CO2 GEYSER: KNOCKED BACK, VISOR DUSTED', tone: 'amber' });
      }
    }
  }
  for (const c of s.route.craters) {
    if (!s.fired[c.id] && d.progress >= c.t) {
      s.fired[c.id] = true;
      const crater = CRATERS.find((k) => k.id === c.id);
      if (!s.flags.petRock) {
        s.flags.petRock = true;
        log(s, `A fist-sized ventifact at ${crater.name} has been adopted as crew mascot.`, 'cyan', 'PET');
        out.push({ type: 'toast', text: 'BADGE: ADOPTED A MARS PET ROCK', tone: 'cyan' });
      }
      if (s.has.drill) {
        const gain = 150 * (s.has.libs ? 2.5 : 1);
        s.science += gain;
        s.sciDrill += gain;
        s.craterHits[c.id] = true;
        log(s, `Deep-core drill at ${crater.name}: 2 m subsurface core, +${Math.round(gain)} data.`, 'cyan', 'CORE');
        out.push({ type: 'toast', text: `SUBSURFACE CORE: +${Math.round(gain)} DATA`, tone: 'cyan' });
      } else {
        s.craterHits[c.id] = false;
        log(s, `Crossed ${crater.name}. No drill aboard: subsurface science left in the ground.`, 'info');
      }
    }
  }
  // SHARAD buried ice: emergency O2 and water.
  if (s.route.iceT != null && !s.fired.ice && d.progress >= s.route.iceT) {
    s.fired.ice = true;
    if (s.has.drill || s.has.moxie) {
      const o2 = 0.6;
      s.o2 = Math.min(s.o2Cap, s.o2 + o2);
      s.flags.icePocket = true;
      if (s.has.drill) {
        s.science += 120;
        s.sciDrill += 120;
      }
      log(s, `SHARAD ice reflector confirmed. ${s.has.drill ? 'Drill cored' : 'MOXIE electrolysed'} buried ice: +${Math.round((o2 / s.o2Cap) * 100)}% O2.`, 'cyan', 'ICE');
      out.push({ type: 'toast', text: 'SHARAD ICE HARVEST: EMERGENCY O2 + WATER', tone: 'cyan' });
    } else {
      log(s, 'Walking over a SHARAD ice reflector. No drill or MOXIE to harvest it.', 'info');
    }
  }
  // Hail Curiosity on the lower slopes of Mount Sharp.
  if (!s.fired.curiosity && d.progress > 0.8) {
    s.fired.curiosity = true;
    s.family.curiosity = true;
    log(s, 'UHF hail answered: Curiosity, still climbing Mount Sharp after 14 years.', 'cyan', 'MSL');
    out.push({ type: 'toast', text: 'FAMILY PORTRAIT: CURIOSITY HAILED', tone: 'cyan' });
  }

  if (s.wasDay && !d.isDay) {
    const eff = effectiveNightTemp(s, d);
    if (eff < s.stats.coldestEff) {
      s.stats.coldestEff = eff;
      s.stats.coldestSol = d.sol;
      s.stats.coldestFreeze = d.L.freeze;
    }
    const ground = Math.round(d.wx.nightT - 12 * d.L.freeze);
    if (ground <= -80) s.flags.coldNight = true;
    log(s, `Camp ${d.sol}. Overnight low ${d.wx.nightT} °C; this ground reads ${ground} °C.`, d.L.freeze > 0.45 ? 'amber' : 'info');
    out.push({ type: 'night', sol: d.sol });
  }
  if (!s.wasDay && d.isDay && s.flags.coldNight) s.flags.survivedCold = true;
  s.wasDay = d.isDay;

  const r = rates(s, d);
  if (r.moxieOn && r.moxieClog < 0.6) s.stats.moxieClogged = true;
  s.power = Math.min(100, s.power + (r.netW / BASE.battery) * dt);
  s.o2 = Math.min(s.o2Cap, s.o2 + r.o2Net * dt);
  s.flags.leaked += s.flags.leakRate * s.o2Cap * s.hz * dt;
  s.rad += r.radRate * dt;
  s.thermal = Math.min(100, s.thermal + r.thermalRate * dt);
  s.focus = Math.max(0, Math.min(100, s.focus + r.focusRate * dt));
  s.science += r.sciRate * dt;
  s.sciInSitu += r.sciRate * dt;
  if (!s.has.brush) s.flags.panelDust = Math.min(0.6, s.flags.panelDust + (0.015 + 0.22 * r.storm) * dt);
  if (!r.tube) s.visorDust = Math.min(1, s.visorDust + (0.04 + 0.5 * r.storm) * dt * (s.flags.berm && !d.isDay ? 0.5 : 1));
  s.T += dt;
  s.view = { ...d, ...r };

  if (s.rad >= 88 && s.flags.medkit) {
    s.rad -= 45;
    useMedkit(s, 'Rad-Away chelation cut dose by 45 points');
    out.push({ type: 'toast', text: 'RAD-AWAY ADMINISTERED: DOSE -45', tone: 'cyan' });
  }

  if (s.o2 <= 0) die(s, 'oxygen', out);
  else if (s.power <= 0) die(s, 'power', out);
  else if (s.thermal <= 0) die(s, 'hypothermia', out);
  else if (s.rad >= 100) die(s, 'radiation', out);
  if (!s.alive) return out;

  if (s.T - s.lastSample >= 0.03) sample(s);

  if (s.T >= MISSION_END) {
    s.done = true;
    s.T = MISSION_END;
    if (!s.flags.synergy && Object.values(s.family).every(Boolean)) {
      s.flags.synergy = true;
      s.science += 500;
      s.sciBonus += 500;
      log(s, 'Mars Family Portrait complete: +500 Synergy Bonus.', 'cyan', 'FAMILY');
    }
    log(s, 'Mount Sharp summit reached. Ascent vehicle beacon acquired.', 'cyan', 'SUMMIT');
    sample(s);
    out.push({ type: 'end' });
  }
  return out;
}

// ---------- player actions (camp, scans, mini-games) ----------

function act(s, type, data) {
  s.record.actions.push({ T: s.T, type, ...data });
}

export function canBuildBerm(s) {
  return !s.flags.berm && (s.has.drill || s.has.lidar || s.science >= 250);
}

export function buildBerm(s) {
  if (!canBuildBerm(s)) return null;
  s.flags.berm = true;
  s.power = Math.max(1, s.power - 6);
  s.o2 -= 0.04;
  act(s, 'berm', {});
  log(s, 'ISRU sintered-regolith berm printed around camp: storm and radiation exposure halved.', 'cyan', 'BERM');
  return 'Regolith berm built. Storm and radiation damage at camp reduced by 50%.';
}

export function canGaze(s) {
  const d = derive(s);
  return d.dusk && s.flags.gazedSol !== d.sol && d.wx.storm < 0.6;
}

export function gazeEarth(s) {
  if (!canGaze(s)) return null;
  const d = derive(s);
  s.flags.gazedSol = d.sol;
  s.focus = Math.min(100, s.focus + 35);
  act(s, 'gaze', {});
  log(s, 'Pale Blue Dot: Earth and the Moon, a double star in the blue twilight. Crew Focus restored.', 'cyan', 'EARTH');
  return 'Crew Focus +35.';
}

export function brushVisor(s) {
  act(s, 'brush', {});
  if (s.has.brush) {
    s.visorDust = 0;
    s.flags.panelDust = 0;
    log(s, 'Electrostatic brush pulse: visor and arrays clear.', 'cyan');
    return 'Visor and solar arrays cleared.';
  }
  s.visorDust *= 0.55;
  s.focus = Math.max(0, s.focus - 2);
  return 'Glove-wiped the visor. Smeared, but better.';
}

export function scanTargets(s) {
  const d = s.view || derive(s);
  const p = d.pos;
  const list = [];
  const push = (id, name, kind, x, z, extra = {}) => {
    const dist = Math.hypot(p.x - x, p.z - z);
    if (dist <= SCAN_RANGE && !s.scanned[id]) list.push({ id, name, kind, x, z, dist, ...extra });
  };
  for (const l of Object.values(LANDMARK_BY_ID)) push(l.id, l.name, l.kind, l.x, l.z);
  for (const g of s.geysers) push(g.id, 'Sublimating CO2 Dry-Ice Geyser', 'geyser', g.x, g.z, { needs: 'libs' });
  return list.sort((a, b) => a.dist - b.dist);
}

const BEARINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function bearing(dx, dz) {
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return BEARINGS[Math.round(((a + 360) % 360) / 45) % 8];
}

export function scan(s, id) {
  if (s.scanned[id]) return null;
  const lm = LANDMARK_BY_ID[id];
  const g = s.geysers.find((k) => k.id === id);
  if (g) {
    if (!s.has.libs) return { ok: false, text: 'Geyser scans need the LIBS Spectrometer.' };
    s.scanned[id] = true;
    s.science += 250;
    s.sciBonus += 250;
    act(s, 'scan', { id });
    log(s, 'LIBS scan of a CO2 jet: entrained basaltic fines and perchlorate. +250 Science Data.', 'cyan', 'SCAN');
    return { ok: true, sci: 250, text: 'Kieffer-model cold jet: CO2 ice sublimating under sunlit translucent slab ice. +250 Science Data.' };
  }
  if (!lm) return null;
  s.scanned[id] = true;
  const gain = lm.sci;
  s.science += gain;
  s.sciBonus += gain;
  act(s, 'scan', { id });
  let hint = '';
  if (lm.kind === 'edl') {
    const p = (s.view || derive(s)).pos;
    let best = null;
    for (const hw of Object.values(HARDWARE_BY_ID)) {
      if (s.encounters[hw.id]) continue;
      const dd = Math.hypot(hw.pos.x - p.x, hw.pos.z - p.z);
      if (!best || dd < best.d) best = { hw, d: dd };
    }
    if (best) hint = ` Debris scatter points ${bearing(best.hw.pos.x - p.x, best.hw.pos.z - p.z)}: ${best.hw.name}, ${(best.d * 0.5).toFixed(1)} km.`;
  }
  if (lm.kind === 'perseverance') s.family.perseverance = true;
  log(s, `Scanned ${lm.name}. +${gain} Science Data.${hint}`, 'cyan', 'SCAN');
  return { ok: true, sci: gain, text: lm.text + hint, kind: lm.kind };
}

// 50-micron abrasion gauge result. depth in microns.
export function resolveAbrasion(s, siteId, depth) {
  if (s.abrasion[siteId]) return null;
  const inZone = depth >= 40 && depth <= 60;
  const gain = inZone ? 600 : depth < 40 ? 60 : 30;
  s.abrasion[siteId] = { depth, inZone };
  s.science += gain;
  s.sciBonus += gain;
  act(s, 'abrade', { id: siteId, depth });
  log(
    s,
    inZone
      ? `Abrasion stopped at ${Math.round(depth)} µm: inside the 50-micron organic-carbon zone. +600 Organic Carbon Data.`
      : `Abrasion stopped at ${Math.round(depth)} µm: ${depth < 40 ? 'still in the oxidised rind' : 'overshot and vaporised the organics'}. +${gain} data.`,
    inZone ? 'cyan' : 'amber',
    'ABRADE',
  );
  return { inZone, gain };
}

export function setContained(s, on) {
  s.flags.contained = !!on;
}

// ---------- event cards ----------

const pct = (sols, s) => `${Math.round((sols / s.o2Cap) * 100)}%`;

export function eventCard(s, trig) {
  const d = derive(s);
  const shield = s.has.shield ? 0.25 : 1;

  if (trig.type === 'encounter') {
    const hw = HARDWARE_BY_ID[trig.id];
    const legacy = legacyFactor(s);
    const relayNote = s.has.dish
      ? 'Ka-band dish: full archive goes direct to Earth.'
      : s.meshLinks.length
        ? `UHF Ghost Mesh (${s.meshLinks.length} linked) returns ${Math.round(legacy * 100)}% of the archive.`
        : 'No high-gain dish: the 32 kbps UHF relay returns only half before the pass window closes.';
    const card = {
      kind: 'encounter',
      id: hw.id,
      tone: 'cyan',
      eyebrow: `ABANDONED BUT NOT FORGOTTEN · ${hw.kind.toUpperCase()}`,
      title: hw.name,
      subtitle: hw.status,
      body: hw.history,
      quote: hw.quote,
      quoteNote: hw.quoteNote,
      choices: [],
    };
    if (hw.id === 'opportunity') {
      const can = s.has.brush || s.has.dish;
      card.choices = [
        {
          label: hw.preserve.label,
          detail: can
            ? `${s.has.brush ? 'Dust brush clears the arrays' : 'Ka-band dish relays its memory'}. +400 Science Data, Legacy Medal.`
            : '+400 Science Data and the Legacy Medal.',
          disabled: !can,
          why: 'Requires the Electrostatic Dust Brush or the High-Gain Ka-Band Dish',
        },
        { label: hw.salvage.label, detail: '+30% battery reserve from its lithium-ion cells. Forfeits the Legacy Medal.' },
      ];
    } else if (hw.id === 'insight') {
      card.choices = [
        { label: hw.preserve.label, detail: `+${Math.round(350 * legacy)} Science Data. ${relayNote}` },
        { label: hw.salvage.label, detail: '+40 W solar generation in clear sky (still near zero inside a dust storm).' },
      ];
    } else if (hw.id === 'ingenuity') {
      card.choices = [
        {
          label: hw.preserve.label,
          detail: `+${Math.round(250 * legacy)} Science Data and its atmospheric log: exact forecast for the remaining Sols. ${relayNote}`,
        },
        { label: hw.salvage.label, detail: 'Carbon rotor as a trekking pole, plus its nav sensor: terrain drain -40%.' },
      ];
    } else {
      card.choices = [
        { label: hw.preserve.label, detail: `+${Math.round(300 * legacy)} Science Data. ${relayNote}` },
        { label: hw.salvage.label, detail: 'Eight 1 W plutonium heater units against the suit core: +20 °C at night.' },
      ];
    }
    return card;
  }

  if (trig.id === 'spe1' || trig.id === 'spe2') {
    const base = trig.id === 'spe1' ? 38 : 28;
    const warned = s.flags.warned[trig.id];
    const full = base * shield * s.hz * (warned ? 0.7 : 1) * (s.flags.berm ? 0.85 : 1);
    return {
      kind: 'hazard',
      id: trig.id,
      tone: 'crimson',
      eyebrow: 'RAD SPACE WEATHER ALERT',
      title: 'Solar Particle Event',
      subtitle: `PROTON FLUX > 100 MeV · ARRIVAL IN MINUTES`,
      body: [
        'An X-class flare has launched a proton storm. Mars has no global magnetic field and only about 16 g/cm² of air overhead (Earth has 1,030), so the particles reach the ground.',
        s.has.shield
          ? 'Polyethylene shielding is aboard: its hydrogen absorbs 75% of the dose.'
          : 'You have no polyethylene shielding. The suit alone stops almost nothing.',
        warned
          ? 'ESCAPADE gave a 1-sol warning: shelter was pre-staged, cutting the dose by 30%.'
          : 'No space-weather warning was received.',
      ],
      choices: [
        {
          label: 'Dig in behind a regolith berm',
          detail: `Three hours of cover. Dose +${(full * 0.45).toFixed(0)}%, costs ${pct(0.12, s)} O2 and 4% battery.`,
        },
        { label: 'Keep moving on schedule', detail: `Full exposure. Dose +${full.toFixed(0)}%.` },
      ],
    };
  }

  if (trig.id === 'storm') {
    const wx = s.weather[s.stormStart - 1];
    const choices = [
      {
        label: 'Purge and tape the suit seals',
        detail: `Positive-pressure purge keeps grit out of the joints. Costs 5% battery and ${pct(0.08, s)} O2.`,
      },
      { label: 'Press on', detail: 'Save consumables now. Seals take the full abrasion.' },
    ];
    if (s.has.brush) {
      choices.unshift({
        label: 'Run the electrostatic brush over seals',
        detail: 'Dust brush repels charged grains from joints and MOXIE intake. No cost.',
      });
    }
    if ((s.has.drill || s.has.lidar) && s.route.craters.length) {
      choices.unshift({
        label: 'Shelter in a crater lava tube',
        detail: `${s.has.lidar ? 'LiDAR' : 'Seismic drill'} has located a subsurface lava tube near ${CRATERS.find((k) => k.id === s.route.craters[0].id).name}. Blocks 85% of radiation and +25 °C at night for the whole storm. Science slows to 30%.`,
      });
    }
    return {
      kind: 'hazard',
      id: 'storm',
      tone: 'amber',
      eyebrow: 'MARCI ORBITAL IMAGERY',
      title: 'Perchlorate Dust Storm',
      subtitle: `OPTICAL DEPTH TAU ${wx.tau.toFixed(1)} AND RISING`,
      body: [
        'A regional storm has gone planet-encircling. Direct sunlight at the surface is falling by more than 95%.',
        'Martian dust is 0.5 to 1% perchlorate salt: toxic, electrostatically clingy, and abrasive on suit seals.',
        s.has.rtg
          ? 'MMRTG output is unaffected by opacity.'
          : s.has.solar
            ? 'UltraFlex output will collapse from 55 W toward 2 W.'
            : 'You are on battery alone.',
      ],
      choices,
    };
  }

  if (trig.id === 'leak') {
    const choices = [];
    if (s.flags.medkit) {
      choices.push({
        label: 'Seal it with Med-Gel',
        detail: 'Uses the one-time kit as a sealant. Leak stopped completely.',
      });
    }
    choices.push({
      label: 'Field-patch with Kapton tape',
      detail: `Vents ${pct(0.03 * s.o2Cap, s)} O2 while you work. Leaves a slow seep.`,
    });
    choices.push({
      label: 'Monitor only',
      detail: `No time lost. Leak continues at ${s.flags.sealed ? '2' : '4.5'}% of tank per Sol.`,
    });
    return {
      kind: 'hazard',
      id: 'leak',
      tone: 'crimson',
      eyebrow: 'SUIT PRESSURE WARNING',
      title: 'Suit Seal Micro-Leak',
      subtitle: `${s.flags.sealed ? 'MINOR' : 'ACTIVE'} DECOMPRESSION · LEFT WRIST BEARING`,
      body: [
        'Perchlorate grit has scored a rotary seal. Ambient pressure is 0.7% of Earth sea level, so the suit bleeds straight to near-vacuum.',
        s.flags.sealed
          ? `Your earlier seal protection held the loss to ${pct(0.03 * s.o2Cap, s)} of the tank.`
          : `${pct(0.07 * s.o2Cap, s)} of the tank vented before the alarm tripped.`,
      ],
      choices,
    };
  }

  if (trig.id === 'quake') {
    const insight = s.encounters.insight === 'preserve';
    const choices = [];
    if (insight)
      choices.push({
        label: 'Triangulate with InSight SEIS',
        detail: 'Your preserved InSight seismometer plus suit accelerometers locate the source. Reveals a subsurface ice pocket: +400 Science Data and +15% O2.',
      });
    choices.push({ label: 'Brace and log the waveform', detail: '+60 Science Data from suit accelerometers. Costs 3% battery.' });
    choices.push({ label: 'Keep walking', detail: `No cost, but a ${Math.round(30 * s.hz)}% chance of a fall on shifting talus.` });
    return {
      kind: 'hazard',
      id: 'quake',
      tone: 'amber',
      eyebrow: 'CERBERUS FOSSAE SEISMIC EVENT',
      title: 'Marsquake',
      subtitle: 'MAGNITUDE 3.9 · SOURCE DEPTH ~25 km',
      body: [
        'Cerberus Fossae is a set of young fractures in Elysium where InSight located most of its strongest quakes. Mars has no plate tectonics: these quakes come from a slowly cooling, shrinking crust.',
        insight
          ? 'InSight is awake again thanks to you. Two seismic stations can triangulate what one cannot.'
          : 'With InSight silent, you have a single station: you can feel it, but not locate it.',
      ],
      choices,
    };
  }

  if (trig.id === 'devil') {
    return {
      kind: 'hazard',
      id: 'devil',
      tone: 'amber',
      eyebrow: 'SPIRIT HERITAGE · SOL 420, MARCH 2005',
      title: 'Wait for a Dust Devil?',
      subtitle: `SOLAR ARRAYS ${Math.round(s.flags.panelDust * 100)}% OBSCURED`,
      body: [
        'In March 2005, a passing dust devil swept Spirit\'s arrays almost clean overnight, lifting its power from 400 to over 800 watt-hours a sol.',
        'Afternoon convection here is spinning up vortices. Camp in their path and you might get lucky. Waiting costs a full sol of oxygen and rations.',
      ],
      choices: [
        { label: 'Wait for a dust devil', detail: `Costs ${pct(1, s)} O2. 60% chance the arrays are scoured clean.` },
        { label: 'Keep walking', detail: 'Live with the dust.' },
      ],
    };
  }

  // slope
  const deg = Math.max(24, Math.round((Math.atan(d.L.grade) * 180) / Math.PI));
  const k = (s.has.lidar ? 0.5 : 1) * (s.flags.rotor ? 0.6 : 1);
  return {
    kind: 'hazard',
    id: 'slope',
    tone: 'amber',
    eyebrow: 'MOLA TERRAIN ADVISORY',
    title: 'Steep Slope Traverse',
    subtitle: `${deg}° GRADE · LOOSE SULFATE TALUS`,
    body: [
      'The strata of Mount Sharp step upward in eroded benches. In 0.38 g you weigh less, but the suit still masses the same: every slip costs oxygen.',
      s.has.lidar
        ? 'Hazard LiDAR has plotted a stable line up the face.'
        : 'Without LiDAR you are choosing footholds by eye.',
    ],
    choices: [
      {
        label: 'Direct ascent',
        detail: s.has.lidar
          ? `LiDAR-guided. Costs ${(4 * k * 2).toFixed(0)}% battery and ${pct(0.08, s)} O2.`
          : `Fast but exposed. Costs ${(10 * k).toFixed(0)}% battery, ${pct(0.2 * k, s)} O2, and a 40% chance of a fall.`,
      },
      {
        label: 'Switchback detour',
        detail: `Safe. Costs ${(6 * k).toFixed(0)}% battery and ${pct(0.15 * k, s)} O2.`,
      },
    ],
  };
}

export function resolveChoice(s, trig, idx, opts = {}) {
  const card = eventCard(s, trig);
  const choice = card.choices[idx];
  const label = choice.label;
  const shield = s.has.shield ? 0.25 : 1;
  let text = '';
  let tone = 'cyan';
  s.record.choices.push({ key: `${trig.type}:${trig.id}`, label, idx, lock: opts.lock });

  if (trig.type === 'encounter') {
    const lock = opts.lock == null ? 1 : opts.lock;
    s.locks[trig.id] = lock;
    const mro = derive(s).mro;
    const legacy = legacyFactor(s) * (0.85 + 0.15 * lock) * (mro ? 2 : 1);
    const preserve = idx === 0;
    s.encounters[trig.id] = preserve ? 'preserve' : 'salvage';
    const addLegacy = (n) => {
      s.science += n;
      s.sciLegacy += n;
      return Math.round(n);
    };
    if (preserve && trig.id !== 'ingenuity') {
      s.meshLinks.push(trig.id);
      s.comms += 50;
    }
    if (preserve) s.family[trig.id] = true;
    if (trig.id === 'opportunity') {
      if (preserve) {
        const n = addLegacy(400 * (0.85 + 0.15 * lock) * (mro ? 2 : 1));
        s.flags.legacyMedal = true;
        text = `Arrays cleared. Opportunity's last memory block is on its way to Earth after 5,111 sols. +${n} Science Data. Legacy Medal awarded.`;
      } else {
        s.power = Math.min(100, s.power + 30);
        tone = 'amber';
        text = 'Battery cells pulled from the warm electronics box. +30% battery reserve. Opportunity stays dark.';
      }
    } else if (trig.id === 'insight') {
      if (preserve) {
        const n = addLegacy(350 * legacy);
        text = `Marsquake core archive copied: 1,319 events, the size of the Martian core. +${n} Science Data.`;
      } else {
        s.flags.wing = true;
        tone = 'amber';
        text = 'One 2.15 m solar wing unbolted and brushed off. +40 W in clear sky.';
      }
    } else if (trig.id === 'ingenuity') {
      if (preserve) {
        const n = addLegacy(250 * legacy);
        s.flags.forecast = true;
        text = `Flight computer recovered. 72 flights of pressure and wind data unlock the forecast for every remaining Sol. +${n} Science Data.`;
      } else {
        s.flags.rotor = true;
        tone = 'amber';
        text = 'Carbon-fibre rotor and nav sensor salvaged. Terrain mobility drain cut by 40%.';
      }
    } else {
      if (preserve) {
        const n = addLegacy(300 * legacy);
        text = `Spirit's stationary science logs beamed out from Troy. +${n} Science Data.`;
      } else {
        s.flags.rhu = true;
        tone = 'amber';
        text = 'Radioisotope heater units strapped against the suit core. +20 °C of night protection.';
      }
    }
    if (preserve && trig.id !== 'ingenuity') text += ` UHF Ghost Mesh link established: +50 kbps (now ${s.comms} kbps).`;
    if (preserve && mro) text += ' MRO was overhead: transmission doubled.';
    log(s, `${HARDWARE_BY_ID[trig.id].name}: ${label}. ${text}`, tone, preserve ? 'DATA' : 'SALVAGE');
    return { text, tone, preserve };
  }

  if (trig.id === 'quake') {
    if (label.startsWith('Triangulate')) {
      s.science += 400;
      s.sciBonus += 400;
      s.o2 = Math.min(s.o2Cap, s.o2 + 0.15 * s.o2Cap);
      s.flags.quakeIce = true;
      text = 'Two-station fix: the waves reflect off a shallow ice lens 40 m down. Mapped and tapped. +400 Science Data, +15% O2.';
    } else if (label.startsWith('Brace')) {
      s.science += 60;
      s.sciBonus += 60;
      s.power -= 3;
      text = 'You crouch and let the suit log the P and S arrivals. +60 Science Data.';
    } else if (s.rng() < 0.3 * s.hz) {
      s.thermal = Math.max(1, s.thermal - 6);
      s.power -= 3;
      tone = 'amber';
      text = 'The talus shifts under you. A hard fall, but no breach.';
    } else {
      tone = 'amber';
      text = 'The ground rolls for twenty seconds and settles. You keep moving.';
    }
    log(s, `Marsquake. ${text}`, tone, 'QUAKE');
    return { text, tone };
  }

  if (trig.id === 'devil') {
    if (label.startsWith('Wait')) {
      s.o2 -= 1;
      if (s.rng() < 0.6) {
        s.flags.panelDust = 0;
        s.flags.devilWon = true;
        s.focus = Math.min(100, s.focus + 10);
        text = 'A 300 m vortex walks straight across camp. The arrays come out spotless, just like Spirit\'s.';
      } else {
        s.flags.devilWon = false;
        tone = 'amber';
        text = 'The dust devils pass a kilometre to the east. A sol of oxygen spent for nothing.';
      }
    } else {
      tone = 'amber';
      text = 'You keep walking under dusty arrays.';
    }
    log(s, `Dust devil gamble. ${text}`, tone, 'DEVIL');
    return { text, tone };
  }

  if (trig.id === 'spe1' || trig.id === 'spe2') {
    const base =
      (trig.id === 'spe1' ? 38 : 28) * shield * s.hz * (s.flags.warned[trig.id] ? 0.7 : 1) * (s.flags.berm ? 0.85 : 1);
    if (label.startsWith('Dig in')) {
      const dose = base * 0.45;
      s.rad += dose;
      s.flags.speDose += dose;
      s.flags.sheltered++;
      s.o2 -= 0.12;
      s.power -= 4;
      text = `Half a metre of regolith took the edge off the proton storm. Dose +${dose.toFixed(0)}%.`;
    } else {
      s.rad += base;
      s.flags.speDose += base;
      tone = base > 15 ? 'crimson' : 'amber';
      text = `You walked through the peak flux. Dose +${base.toFixed(0)}%.`;
    }
    log(s, `Solar particle event. ${text}`, tone, 'SPE');
    return { text, tone };
  }

  if (trig.id === 'storm') {
    if (label.startsWith('Shelter')) {
      s.flags.lavaTube = true;
      s.flags.sealed = true;
      text = 'You descend through a collapsed skylight into a basalt lava tube. Metres of rock overhead block radiation and the night cold.';
    } else if (label.startsWith('Run the')) {
      s.flags.sealed = true;
      text = 'Electrostatic field holds the dust off the seals. No consumables spent.';
    } else if (label.startsWith('Purge')) {
      s.flags.sealed = true;
      s.power -= 5;
      s.o2 -= 0.08;
      text = 'Seals purged and taped. They should hold through the storm.';
    } else {
      tone = 'amber';
      text = 'You push into the wall of dust with seals exposed.';
    }
    log(s, `Dust storm onset. ${text}`, tone, 'STORM');
    return { text, tone };
  }

  if (trig.id === 'leak') {
    const initial = (s.flags.sealed ? 0.03 : 0.07) * s.o2Cap * s.hz;
    s.o2 -= initial;
    s.flags.leaked += initial;
    if (label.startsWith('Seal it')) {
      s.flags.medkit = false;
      text = 'Med-Gel cured in the bearing race. Suit pressure is holding. The kit is spent.';
    } else if (label.startsWith('Field-patch')) {
      const more = 0.03 * s.o2Cap;
      s.o2 -= more;
      s.flags.leaked += more;
      s.flags.leakRate = 0.004;
      tone = 'amber';
      text = 'Tape patch applied. A slow seep remains.';
    } else {
      s.flags.leakRate = s.flags.sealed ? 0.02 : 0.045;
      tone = 'crimson';
      text = 'You watch the pressure needle and keep walking. The leak continues.';
    }
    log(s, `Suit micro-leak. ${text}`, tone, 'LEAK');
    return { text, tone };
  }

  // slope
  const k = (s.has.lidar ? 0.5 : 1) * (s.flags.rotor ? 0.6 : 1);
  if (label.startsWith('Direct')) {
    if (s.has.lidar) {
      s.power -= 4 * k * 2;
      s.o2 -= 0.08;
      text = 'LiDAR line held all the way up the bench. Clean ascent.';
    } else {
      s.power -= 10 * k * s.hz;
      s.o2 -= 0.2 * k * s.hz;
      if (s.rng() < 0.4) {
        s.thermal = Math.max(1, s.thermal - 10 * s.hz);
        s.flags.dragWheel = true;
        s.science += 500;
        s.sciBonus += 500;
        log(
          s,
          'Dragged-Wheel Silica Discovery: your damaged boot-cart wheel ploughed up bright white soil, ~90% opaline silica, just like Spirit at Home Plate. +500 Science Data. Movement drain +15%.',
          'cyan',
          'SILICA',
        );
        if (s.flags.medkit) {
          useMedkit(s, 'Med-Gel splinted a knee injury after a fall');
          text = 'The talus let go and you fell four metres. Med-Gel stabilised the knee. The kit is spent.';
          tone = 'amber';
        } else {
          s.flags.injured = true;
          tone = 'crimson';
          text = 'The talus let go and you fell four metres. Injured knee: oxygen use is up 20% for the rest of the traverse.';
        }
      } else {
        tone = 'amber';
        text = 'You scrambled up on loose rock. It held. Barely.';
      }
    }
  } else {
    s.power -= 6 * k;
    s.o2 -= 0.15 * k;
    text = 'The switchbacks added distance but kept you on stable ground.';
  }
  log(s, `Steep slope. ${text}`, tone, 'SLOPE');
  return { text, tone };
}

export function forecastFor(s) {
  return s.weather.map((w) => ({ sol: w.sol, label: w.label, tau: w.tau, nightT: w.nightT, dayT: w.dayT, storm: w.storm }));
}

// ---------- headless replay (What-If lab) ----------

function pickReplay(card, record, key, cursor) {
  const past = record.choices.filter((c) => c.key === key);
  const want = past[cursor[key] || 0];
  cursor[key] = (cursor[key] || 0) + 1;
  const enabled = card.choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
  if (want) {
    const same = card.choices.findIndex((c) => c.label === want.label && !c.disabled);
    if (same >= 0) return { idx: same, lock: want.lock };
    // A preserve that is now impossible falls back to salvage, otherwise the same slot.
    if (!card.choices[want.idx]?.disabled && want.idx < card.choices.length) return { idx: want.idx, lock: want.lock };
  }
  // Heuristic for decisions the player never faced: the safer, sheltered option.
  return { idx: enabled[0] ?? 0, lock: 1 };
}

export function simulate(params, record = { choices: [], actions: [] }, opts = {}) {
  const s = createMission(params);
  const cursor = {};
  const actions = [...record.actions].sort((a, b) => a.T - b.T);
  let ai = 0;
  const dt = opts.dt || 0.004;
  let guard = 0;
  while (s.alive && !s.done && guard++ < 30000) {
    while (ai < actions.length && actions[ai].T <= s.T) {
      const a = actions[ai++];
      if (a.type === 'berm') buildBerm(s);
      else if (a.type === 'gaze') {
        if (canGaze(s)) gazeEarth(s);
      } else if (a.type === 'brush') brushVisor(s);
      else if (a.type === 'scan') scan(s, a.id);
      else if (a.type === 'abrade') resolveAbrasion(s, a.id, a.depth);
    }
    const out = stepMission(s, dt);
    for (const o of out) {
      if (o.type === 'event' || o.type === 'encounter') {
        const card = eventCard(s, o);
        const pick = pickReplay(card, record, `${o.type}:${o.id}`, cursor);
        resolveChoice(s, o, pick.idx, { lock: pick.lock });
      }
    }
  }
  if (opts.contained != null) s.flags.contained = opts.contained;
  return s;
}
