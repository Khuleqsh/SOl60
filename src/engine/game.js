// SOL 60 — per-frame mission logic (no React): sim construction, player/rover/hazard updates, quest flow, rendering
// glue. Real-time state lives in one mutable `sim` object; React only reads a 5 Hz snapshot.

import * as THREE from 'three';
import { BRIEFING, BRIEFING_BEAT, SOL_REAL_SECONDS, SHELTERS, DEVICES, SITES, RADIO_SLEEP, TRAIL, OLYMPUS, QUEST_STEPS, RADIO, BACKPACKS, BUILD_ITEMS, CROPS, CODEX, byId } from '../data/nasaData.js';
import { getTerrainHeight, getTerrainNormal, stepPlayer, stepRover, stepBoulders, checkPlacement, findShelter, inLee, trailInfo, trailPointAt, trailGuidePoint, TRAIL_LENGTH, mulberry32, clamp } from './terrainPhysics.js';
import { PIONEERS, SCIENCE_SITES, INSIGHTS, RADIO_SCIENCE, loadoutEffects, sanitizeLoadout } from '../data/scienceData.js';
import { createScienceGame } from './science.js';
import { audio } from './audioSynth.js';
import { stepRoverBattery, arrayAlignment, panelDustRate, pctToWh } from '../logic/roverEnergy.js';
import { morseStateAt, bearingTo } from '../logic/morse.js';
import { compareToNasa, simPressurePa, uvIndexLabel } from '../data/nasaDatasets.js';
import { ROUTE } from '../data/olympusRoute.js';
import { createQuest, advance as advanceQuest, checklist as questChecklist } from '../logic/questMachine.js';
import { GRIP_MAX, gripRate, gloveDustRate, climbO2Mul, placePiton, tryArrest, anchorStale } from '../logic/climbing.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const DEVICE_RADIUS = { rover: 4, solar: 5.5, rtg: 4, relay: 5.5, weather: 4.5 };
const CODEX_TITLE = Object.fromEntries(CODEX.map((c) => [c.id, c.title]));
const _mp = new V3();

/** Height of a landed ship's deck and boarding ramp at world (x, z); terrain elsewhere. */
function makeShipGround(ship) {
  const top = ship.radius + 0.1;
  const run = Math.cos(ship.rampSlope) * ship.rampLen;
  const tan = Math.tan(ship.rampSlope);
  return (x, z) => {
    const g = ship.group.position;
    const lx = x - g.x;
    const lz = z - g.z;
    if (Math.abs(lx) < 0.75 && lz < top + run + 0.05 && lz > top - 4) {
      if (lz <= top) return g.y + ship.sill;
      return Math.max(getTerrainHeight(x, z), g.y + ship.sill - (lz - top) * tan);
    }
    return getTerrainHeight(x, z);
  };
}

/**
 * Projects a world point to the HUD. Behind the camera or off-screen it is pinned to the screen edge
 * with an arrow pointing toward it, so the marker never sinks into terrain and always stays readable.
 */
function placeMarker(dom, prefix, cam, canvas, wx, wy, wz, label, show) {
  const el = dom[`${prefix}El`];
  if (!el || !canvas) return;
  if (!show) {
    el.style.opacity = '0';
    return;
  }
  _mp.set(wx, wy, wz);
  const dist = cam.position.distanceTo(_mp);
  _mp.project(cam);
  const behind = _mp.z > 1;
  let x = behind ? -_mp.x : _mp.x;
  let y = behind ? -_mp.y : _mp.y;
  const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.88;
  if (off) {
    if (Math.hypot(x, y) < 1e-4) {
      x = 0;
      y = -1;
    }
    const k = Math.min(0.9 / Math.max(Math.abs(x), 1e-6), 0.88 / Math.max(Math.abs(y), 1e-6));
    x *= k;
    y *= k;
  }
  const W = canvas.clientWidth || 1;
  const H = canvas.clientHeight || 1;
  el.style.transform = `translate3d(${((x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-y * 0.5 + 0.5) * H).toFixed(1)}px, 0)`;
  el.style.opacity = '1';
  const txt = dom[`${prefix}Text`];
  if (txt) txt.textContent = `${label} ${Math.round(dist)} m`;
  const ring = dom[`${prefix}Ring`];
  const arrow = dom[`${prefix}Arrow`];
  if (ring) ring.style.display = off ? 'none' : 'block';
  if (arrow) {
    arrow.style.display = off ? 'block' : 'none';
    arrow.style.transform = `rotate(${Math.atan2(-y, x).toFixed(3)}rad)`;
  }
}
// ======================================================================= sim construction
export function makeSim(mode, custom, seed) {
  const bp = byId(BACKPACKS, custom.backpack);
  const sandbox = mode === 'sandbox';
  const ascent = mode === 'ascent';
  const expedition = mode === 'expedition';
  const fx = loadoutEffects(sanitizeLoadout(custom.loadout));
  const o2Cap = Math.round(bp.o2Cap * (1 + fx.o2Bonus / 100));
  const start = ascent ? SITES.ascentStart : SITES.landing;
  const sim = {
    mode,
    seed,
    rand: mulberry32(seed ^ 0xabcdef),
    t: 0,
    frame: 0,
    phase: ascent ? 'play' : 'landing',
    solClock: SOL_REAL_SECONDS * (ascent ? 0.4 : 0.34),
    hz: sandbox ? 0.5 : mode === 'tour' ? 0.3 : expedition ? 0.7 : 1, // the Judge Quick-Tour should never fail
    sandbox,
    player: { x: start.x, y: getTerrainHeight(start.x, start.z), z: start.z, vx: 0, vy: 0, vz: 0, grounded: true, anticip: 0, landT: 0, alt: 0, facing: ascent ? Math.PI : 0, speedMul: 1, pushX: 0, pushZ: 0 },
    cam: { yaw: ascent ? 0 : Math.PI, pitch: 0.3, dist: 7, shake: 0, lastMouse: -10 },
    input: { keys: {}, jump: false, interact: false, interactHeld: false, mouseDown: false },
    vitals: { o2: o2Cap, o2Cap, health: 100, warmth: 100, food: fx.foodStart, stamina: 100, filter: 0, rad: 0, battery: 100, focus: 90, grip: 100 },
    climb: { pitons: fx.pitons, anchor: null, gloveDust: 0, tipShown: false, pitonsUsed: 0 },
    bp,
    fx,
    loadoutIds: sanitizeLoadout(custom.loadout),
    insight: null,
    sciProg: 0,
    rover: { battery: 100, capMul: fx.roverCapMul, panelDust: 0.15, array: null, routed: {}, drainW: 0, chargeW: 0, repaired: false, driving: false, x: 0, z: 0, y: 0, yaw: 0, speed: 0, steer: 0, wheelRot: 0, pitch: 0, roll: 0, t: 0, tooSteep: 0, collider: null },
    devices: Object.fromEntries(DEVICES.map((d) => [d.id, { progress: 0, done: false }])),
    quest: createQuest(mode),
    weather: {
      dust: { state: 'idle', next: 95, ox: 0, oz: 0, dx: 1, dz: 0, s: 0, speed: 7, thick: 140 },
      quake: { state: 'idle', next: 150, t: 0, spawnT: 0 },
      flare: { state: 'idle', next: 230, t: 0 },
      gust: { t: 0, next: 12, dx: 0, dz: 0 },
      rockfall: { next: 8 },
      storm: { active: ascent, z: ascent ? -20 : 480 },
    },
    boulders: Array.from({ length: 28 }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, rot: 0, life: 0, hitT: 0 })),
    build: { active: false, item: 'habitat', rot: 0, ok: false, reason: '', x: 0, z: 0 },
    kits: { habitat: sandbox ? Infinity : ascent ? 1 : 2, planter: sandbox ? Infinity : (ascent ? 0 : 4) + fx.planterKits },
    cropChoice: 'potato',
    tune: null,
    radioQ: [],
    radio: null,
    radioT: 0,
    log: [],
    stats: { time: 0, sols: 1, distance: 0, maxAlt: 0, repairs: 0, harvests: 0, hazards: 0, rad: 0, built: 0, echoes: 0, ascentTime: 0, roverRepaired: false, roverDist: 0, sciScore: 0, sherloc: false },
    echoesSeen: {},
    flags: { flashlight: false, xray: false, shield: false, hudHidden: false },
    toast: null,
    toastT: 0,
    cine: ascent ? null : { type: 'landing', t: 0 },
    plantT: 0,
    hurtT: 0,
    dustAmt: 0,
    windAmt: 0.3,
    inShelter: null,
    prompt: null,
    objective: null,
    repairing: null,
    codexSeen: new Set(['gale', 'rems']),
    warnT: { o2: 0, cold: 0 },
    ended: null,
    deathT: 0,
    auto: null,
    tour: mode === 'tour' ? { t: 0, done: {} } : null,
    sleep: null,
    npc: { state: 'hidden', x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: 0, sp: 0, t: 0, visible: false },
    crouching: false,
    shiftK: 0,
    shiftT: 0,
  };
  return sim;
}
// ======================================================================= game logic (per-frame, no React)
export function createGame(sim, world, dom, keysRef, settingsRef, setCodexOpen) {
  const P = sim.player;
  const V = sim.vitals;
  const rv = sim.rover;
  const rand = sim.rand;
  const npc = sim.npc;
  const tmp = new V3();
  const tmp2 = new V3();
  const nrm = { x: 0, y: 1, z: 0 };
  const shelters = world.shelters;
  const roverDef = DEVICES.find((d) => d.kind === 'rover');
  rv.x = roverDef.x;
  rv.z = roverDef.z;
  rv.yaw = roverDef.yaw;
  rv.collider = world.roverCollider;
  stepRover(rv, {}, 0.0001, null);
  let mmCount = 0;

  // ---------------------------------------------------------------- helpers
  const solFrac = () => (sim.solClock / SOL_REAL_SECONDS) % 1;
  const solNum = () => 1 + Math.floor(sim.solClock / SOL_REAL_SECONDS);
  const clockStr = () => {
    const h = solFrac() * 24;
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  };
  const log = (text) => sim.log.push({ sol: solNum(), clock: clockStr(), text });
  const say = (lines) => {
    for (const l of lines) sim.radioQ.push(l);
  };
  const toast = (text, t = 2.6) => {
    sim.toast = text;
    sim.toastT = t;
  };
  const codex = (...ids) => {
    for (const id of ids) {
      if (!sim.codexSeen.has(id)) {
        sim.codexSeen.add(id);
        toast(`NASA Codex updated: ${CODEX_TITLE[id]} [I]`, 3);
      }
    }
  };
  /** 2-sentence NASA Discovery Insight card (title, text, cited source), shown for `secs` seconds. */
  const showInsight = (ins, secs = 14) => {
    sim.insight = { title: ins.title, text: ins.text, source: ins.source, t: secs };
  };
  const altitude = () => Math.max(0, P.y - 2);
  const altFactor = () => clamp((P.y - 8) / OLYMPUS.h, 0, 1);
  const camForward = () => ({ x: -Math.sin(sim.cam.yaw), z: -Math.cos(sim.cam.yaw) });
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const deviceWorld = (id, out) => {
    if (id === 'rover') return out.set(rv.x, rv.y + 0.8, rv.z);
    const d = world.devices[id];
    return d.group.localToWorld(out.copy(d.sparkLocal));
  };
  const doorPoint = (s, out = {}) => {
    out.x = s.x + Math.cos(s.doorAngle ?? s.door) * (s.r + 2);
    out.z = s.z + Math.sin(s.doorAngle ?? s.door) * (s.r + 2);
    return out;
  };
  const nearestShelter = (x, z) => {
    let best = null;
    let bd = 1e9;
    for (const s of shelters) {
      const d = dist2(x, z, s.x, s.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  const allDone = (ids) => ids.every((id) => sim.devices[id].done);

  // ---------------------------------------------------------------- setup
  function prepareLanding() {
    world.lander.group.position.y = world.landerY + 150;
    world.lander.setFlame(1, 0);
    world.astro.root.visible = false;
    codex('gale', 'rems');
    sim.codexSeen = new Set(['gale', 'rems']);
    sim.toast = null;
  }

  function startAscentMode() {
    sim.quest.step = 4;
    sim.weather.storm.active = true;
    sim.weather.dust.next = 1e9;
    say(RADIO.reply.slice(1));
    say(RADIO.step4);
    log('Olympus Mons Ascent: the rescue ship will land on the summit caldera as you near it.');
    codex('mola');
    sim.quest.step4T = sim.t;
  }

  function finishLanding() {
    const L = world.lander;
    L.group.position.y = world.landerY;
    L.setFlame(0);
    L.setHatch(1);
    L.setRamp(1);
    const foot = L.group.localToWorld(L.rampFoot());
    P.x = foot.x;
    P.z = foot.z + 0.6;
    P.y = getTerrainHeight(P.x, P.z);
    // face east toward the flag site; the camera sits west of the player, clear of the lander ramp
    P.facing = Math.PI / 2;
    sim.cam.yaw = -Math.PI / 2;
    sim.cam.pitch = 0.28;
    world.astro.root.visible = true;
    sim.cine = null;
    sim.phase = 'play';
    if (sim.mode === 'expedition') {
      world.flag.group.visible = true;
      world.flag.group.scale.set(1, 1, 1);
      world.collision.addStatic({ x: world.flagPos.x, z: world.flagPos.z, r: 0.3, tag: 'flag' });
      say(RADIO_SCIENCE.expeditionIntro);
    } else say(RADIO.intro);
    log('Touchdown in Gale Crater. Ares-7 is down and the Commander is alive.');
  }

  function rocketArrive(instant) {
    const R = world.rescue;
    R.group.visible = true;
    world.rescueCollider.active = true;
    if (instant) {
      sim.quest.rocketT = 99;
      R.group.position.y = world.rescueY;
      R.setFlame(0);
      R.setHatch(1);
      R.setRamp(1);
    } else sim.quest.rocketT = 0;
  }

  // ---------------------------------------------------------------- actions
  function onAction(a) {
    if (sim.tour && !['xray', 'codex', 'hud', 'flashlight', 'selfie'].includes(a)) {
      if (a === 'jump' && sim.cine) skipCine();
      return;
    }
    if (a === 'jump') {
      if (sim.cine) skipCine();
      else sim.input.jump = true;
    } else if (a === 'interact') {
      sim.input.interact = true;
      sim.input.interactHeld = true;
    } else if (a === 'build') toggleBuild();
    else if (a === 'rotate') {
      if (science.salvageKey()) return;
      if (sim.build.active) sim.build.rot += Math.PI / 2;
      else {
        sim.cropChoice = sim.cropChoice === 'potato' ? 'spirulina' : 'potato';
        toast(`Seed selected: ${CROPS[sim.cropChoice].name}`, 1.6);
      }
    } else if (a === 'flashlight') {
      sim.flags.flashlight = !sim.flags.flashlight && V.battery > 1;
      audio.click(0.3);
    } else if (a === 'xray') {
      sim.flags.xray = !sim.flags.xray;
      world.setXray(sim.flags.xray);
    } else if (a === 'codex') {
      setCodexOpen((o) => !o);
    } else if (a === 'shield') {
      sim.flags.shield = !sim.flags.shield && V.battery > 2;
      audio.beep(sim.flags.shield ? 1400 : 600);
    } else if (a === 'mastcam') {
      sim.photo = !sim.photo;
      sim.flags.hudHidden = sim.photo;
      toast(sim.photo ? 'Mastcam-Z photo mode: press the selfie key to capture' : 'Photo mode off', 2);
    } else if (a === 'piton') usePiton();
    else if (a === 'data') sim.flags.dataOverlay = !sim.flags.dataOverlay;
    else if (a === 'hud') sim.flags.hudHidden = !sim.flags.hudHidden;
    else if (a === 'selfie') {
      const url = world.captureSelfie();
      if (url) {
        sim.selfie = url;
        toast('Mars selfie captured for the debrief');
        audio.click(0.5);
      }
    }
  }

  function usePiton() {
    const C = sim.climb;
    if (sim.phase !== 'play' || rv.driving) return;
    if (!P.climb && P.alt < 0.3) {
      toast(C.pitons > 0 ? 'Pitons are placed on a rock face: grab a cliff first' : 'No pitons: buy Seismic Anchors in the bunker', 2.2);
      return;
    }
    if (!placePiton(C, P)) {
      toast('No pitons left', 1.8);
      audio.beep(260);
      return;
    }
    V.grip = Math.min(GRIP_MAX, V.grip + 30);
    audio.click(0.6);
    audio.beep(900);
    toast(`Piton set · ${C.pitons} left · rest here to recover grip`, 2.4);
    world.addPiton?.(P.x + (P.climb ? P.climb.dx * 0.35 : 0), P.y + 1.1, P.z + (P.climb ? P.climb.dz * 0.35 : 0));
  }
  function brushGloves() {
    sim.climb.gloveDust = 0;
    audio.click(0.3);
    toast('Regolith brushed off the gloves: grip restored', 1.8);
  }

  function skipCine() {
    if (!sim.cine) return;
    if (sim.cine.type === 'landing') finishLanding();
  }

  function toggleBuild() {
    if (rv.driving || sim.phase !== 'play') return;
    sim.build.active = !sim.build.active;
    world.ghosts.habitat.visible = world.ghosts.planter.visible = false;
    audio.ui();
  }
  function selectBuild(item) {
    if (!sim.build.active) return;
    sim.build.item = item;
    audio.ui();
  }

  function plantFlag() {
    sim.quest.flag = true;
    sim.plantT = 1.4;
    world.flag.group.visible = true;
    world.flag.group.scale.set(1, 0.01, 1);
    world.collision.addStatic({ x: world.flagPos.x, z: world.flagPos.z, r: 0.3, tag: 'flag' });
    say(RADIO.flag);
    log('Planted the Ares-7 mission flag beside the lander.');
    audio.success();
  }

  function sow(p) {
    p.crop = sim.cropChoice;
    p.growth = 0;
    p.water = 0.7;
    world.updatePlanter(p);
    if (!sim.quest.farm) {
      sim.quest.farm = true;
      say(RADIO.farm);
      log(`First Martian crop sown: ${CROPS[p.crop].name}.`);
      codex('veggie', 'spirulina');
    }
    audio.success();
  }
  function harvest(p) {
    const c = CROPS[p.crop];
    V.o2 = Math.min(V.o2Cap, V.o2 + c.o2);
    V.food = Math.min(100, V.food + c.food);
    V.focus = Math.min(100, V.focus + c.focus);
    sim.stats.harvests++;
    log(`Harvested ${c.name}: +${c.o2} O2, +${c.food} food, +${c.focus} focus.`);
    toast(`Harvest! +${c.o2} O2 · +${c.food} food · +${c.focus} focus`);
    p.crop = null;
    p.growth = 0;
    p.water = 0;
    world.updatePlanter(p);
    audio.success();
  }

  function enterRover() {
    rv.driving = true;
    sim.build.active = false;
    world.roverCollider.active = false;
    sim.cam.dist = Math.max(sim.cam.dist, 10);
    audio.hatch();
  }
  function exitRover() {
    const offs = [
      [Math.cos(rv.yaw) * 2.9, -Math.sin(rv.yaw) * 2.9],
      [-Math.cos(rv.yaw) * 2.9, Math.sin(rv.yaw) * 2.9],
      [-Math.sin(rv.yaw) * 3.4, -Math.cos(rv.yaw) * 3.4],
      [Math.sin(rv.yaw) * 3.4, Math.cos(rv.yaw) * 3.4],
    ];
    for (const [ox, oz] of offs) {
      const x = rv.x + ox;
      const z = rv.z + oz;
      if (!world.collision.overlaps(x, z, 0.5, 0, world.roverCollider)) {
        rv.driving = false;
        rv.speed = 0;
        world.roverCollider.active = true;
        world.roverCollider.x = rv.x;
        world.roverCollider.z = rv.z;
        P.x = x;
        P.z = z;
        P.y = getTerrainHeight(x, z);
        P.vx = P.vz = P.vy = 0;
        P.grounded = true;
        sim.cam.dist = 7;
        audio.hatch();
        return true;
      }
    }
    toast('No room to climb out here');
    return false;
  }

  function completeRepair(id) {
    const st = sim.devices[id];
    st.done = true;
    st.progress = 1;
    sim.stats.repairs++;
    audio.success();
    if (id === 'rover') {
      rv.repaired = true;
      sim.stats.roverRepaired = true;
      world.rover.setRepaired(true);
      say(RADIO.rover);
      log('Repaired the rover’s wheel actuators and RTG core. Drivable!');
    } else {
      world.devices[id].setRepaired(true);
      if (id === 'relay') {
        say(RADIO.relayFixed);
        log('Deep-Space Relay transceiver repaired.');
        codex('delay', 'hirise');
      } else if (id === 'weather') {
        sim.escapade = true;
        say(RADIO_SCIENCE.weatherDone);
        log('Calibrated the REMS / MEDA weather station: ESCAPADE 1-sol storm early warnings online.');
        codex('rems', 'meda', 'escapade');
        V.focus = Math.min(100, V.focus + 8 * sim.fx.sciMul);
        sim.stats.sciScore += Math.round(100 * sim.fx.sciMul);
      } else {
        const c = world.conduits.find((k) => k.id === id);
        if (c) c.mesh.material.color.set('#35d6ff');
        say(RADIO.sub);
        log(`${world.devices[id].def.name} back online.`);
      }
    }
    toast(`${DEVICES.find((d) => d.id === id).name} repaired`);
    if (INSIGHTS[id]) showInsight(INSIGHTS[id], 16);
  }

  function startTune() {
    // dual-dish signal triangulation puzzle (the Pioneer Signal Booster widens the lock tolerance)
    requestPuzzle('triangulation', 'relay', { tol: 0.045 + sim.fx.tuneBonus * 0.4 }, finishTune);
  }
  function finishTune() {
    sim.tune = null;
    sim.quest.tuned = true;
    sim.quest.transmitting = true;
    sim.quest.transmitT = sim.tour ? 3 : Math.max(8, 26 - sim.fx.transmitCut - (sim.sci ? sim.sci.preserved * 3 : 0));
    world.devices.relay.beam.material.opacity = 0.45;
    audio.transmit();
    say(RADIO.transmit);
    log('High-gain dishes triangulated. Distress + science telemetry transmitted to Earth.');
  }

  /** Rover battery: driving / inclines / cold / lights drain it; deck panels, an aimed array and powered substations charge it. */
  function stepRoverEnergy(dt) {
    const sd = world.skyU.sunDir.value;
    const grade = rv.driving ? Math.sin(-rv.pitch) * Math.sign(rv.speed || 1) : 0;
    let arrayAlign = null;
    if (rv.array && dist2(rv.x, rv.z, rv.array.x, rv.array.z) < 9) arrayAlign = arrayAlignment(rv.array.az, rv.array.tilt, { x: sd.x, y: sd.y, z: sd.z });
    let station = false;
    for (const id of ['sub1', 'sub2']) {
      const d = DEVICES.find((k) => k.id === id);
      if (sim.devices[id].done && rv.routed[id] && dist2(rv.x, rv.z, d.x, d.z) < 14) station = true;
    }
    rv.panelDust = Math.min(1, rv.panelDust + panelDustRate(sim.inShelter ? 0 : sim.dustAmt) * dt);
    const r = stepRoverBattery(
      rv,
      { driving: rv.driving, speed: rv.speed, grade, tempC: sim.tempC ?? -40, lights: rv.driving && sd.y < 0.1, sunElev: sd.y, panelDust: rv.panelDust, atmosDust: sim.dustAmt, arrayAlign, station, chargeMul: sim.fx.roverChargeMul, trickle: sim.fx.roverTrickle },
      dt,
    );
    rv.drainW = r.drain;
    rv.chargeW = r.charge;
    rv.station = station;
    if (rv.battery < 15 && rv.driving && !rv.warned) {
      rv.warned = true;
      say([['ROVER', 'Battery under 15 percent. Find sunlight, clear the panels, or reach a powered substation.']]);
    }
    if (rv.battery > 30) rv.warned = false;
  }

  function enterRoverChecked() {
    if (rv.battery <= 0.5) {
      toast('Rover battery flat: recharge it first (solar array, clean panels or a powered substation)', 3);
      audio.beep(260);
      return;
    }
    enterRover();
  }

  /** Deploys the portable array beside the rover after the player aims it at the Sun (solar puzzle). */
  function deployArray() {
    const sd = world.skyU.sunDir.value;
    const sunAz = Math.atan2(sd.x, -sd.z);
    const sunElev = Math.asin(clamp(sd.y, -1, 1));
    requestPuzzle('solar', 'array', { sunAz, sunElev }, () => {
      const a = rv.yaw + Math.PI / 2;
      const x = rv.x + Math.cos(a) * 3.4;
      const z = rv.z - Math.sin(a) * 3.4;
      rv.array = { x, z, az: sunAz, tilt: Math.PI / 2 - sunElev };
      world.addSolarArray?.(x, getTerrainHeight(x, z), z, sunAz, Math.PI / 2 - sunElev);
      toast('Portable array aimed at the Sun: rover charging', 3);
      log('Deployed and aimed a portable solar array to recharge the rover.');
      codex('roverpower');
    });
  }
  function tuneLock() {
    const tn = sim.tune;
    if (!tn || tn.cool > 0) return;
    if (tn.needle >= tn.band[0] && tn.needle <= tn.band[1]) {
      tn.locks++;
      audio.beep(1500 + tn.locks * 200);
      tn.speed += 0.25;
      const c = 0.15 + rand() * 0.7;
      const w = 0.16 - tn.locks * 0.025 + sim.fx.tuneBonus;
      tn.band = [c - w / 2, c + w / 2];
      if (tn.locks >= 3) {
        sim.tune = null;
        sim.quest.tuned = true;
        sim.quest.transmitting = true;
        sim.quest.transmitT = sim.tour ? 5 : Math.max(8, 26 - sim.fx.transmitCut - (sim.sci ? sim.sci.preserved * 3 : 0));
        world.devices.relay.beam.material.opacity = 0.45;
        audio.transmit();
        say(RADIO.transmit);
        log('High-gain lock achieved. Distress + science telemetry transmitted to Earth.');
      }
    } else {
      tn.cool = 0.5;
      audio.beep(300);
    }
  }

  // ---------------------------------------------------------------- rescue crew NPC + extraction
  const shipGround = makeShipGround(world.rescue);
  const landerGround = makeShipGround(world.lander);
  const _wind = { x: 0, z: 0 };
  /** Wind vector (world space) for secondary motion: prevailing breeze, gusts and dust-wall fronts. */
  function windVec() {
    const D = sim.weather.dust;
    const G = sim.weather.gust;
    const dx = D.state !== 'idle' ? D.dx : G.t > 0 ? G.dx : 0.7;
    const dz = D.state !== 'idle' ? D.dz : G.t > 0 ? G.dz : 0.3;
    _wind.x = dx * sim.windAmt;
    _wind.z = dz * sim.windAmt;
    return _wind;
  }

  /** Ramp geometry of the rescue ship in world space (the ship is not rotated, +z is the hatch side). */
  function rampGeo() {
    const R = world.rescue;
    const g = R.group.position;
    const top = R.radius + 0.1;
    const run = Math.cos(R.rampSlope) * R.rampLen;
    return {
      top: { x: g.x, z: g.z + top },
      foot: { x: g.x, z: g.z + top + run },
      inside: { x: g.x, z: g.z + R.radius - 1.7 },
      deep: { x: g.x, z: g.z + R.radius - 2.5 },
    };
  }

  /** Walk an entity {x,z,vx,vz,facing,sp} toward (tx,tz): eased acceleration, turns toward travel. Returns distance left. */
  function steer(e, tx, tz, speed, dt, turn = 8) {
    const dx = tx - e.x;
    const dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    const want = d > 0.04 ? Math.min(speed, d / dt) : 0;
    e.sp += (want - e.sp) * Math.min(1, dt * 4);
    if (d > 0.01 && e.sp > 0.001) {
      const step = Math.min(d, e.sp * dt);
      e.x += (dx / d) * step;
      e.z += (dz / d) * step;
      e.vx = (dx / d) * e.sp;
      e.vz = (dz / d) * e.sp;
      if (e.sp > 0.25) e.facing += angleDiff(Math.atan2(dx, dz), e.facing) * Math.min(1, dt * turn);
    } else {
      e.vx = e.vz = 0;
    }
    return d;
  }

  const lookTo = (from, tx, tz) => clamp(angleDiff(Math.atan2(tx - from.x, tz - from.z), from.facing), -1.1, 1.1);
  function animateNpc(dt, beckon, lookAtPlayer = true) {
    const w = windVec();
    world.npc.animator.update(dt, {
      speed: Math.hypot(npc.vx, npc.vz),
      vx: npc.vx,
      vz: npc.vz,
      facing: npc.facing,
      x: npc.x,
      y: npc.y,
      z: npc.z,
      ground: shipGround,
      grounded: true,
      beckon,
      lookYaw: lookAtPlayer ? lookTo(npc, P.x, P.z) : 0,
      windX: w.x,
      windZ: w.z,
    });
  }

  /** Rescue crew member: walks out of the hatch, approaches the Commander, then greets and beckons. */
  function updateNpc(dt) {
    const q = sim.quest;
    if (npc.state === 'hidden') {
      if (q.rocketT < 7.6) return;
      const g = rampGeo();
      Object.assign(npc, { state: 'exit', x: g.inside.x, z: g.inside.z, facing: 0, sp: 0, vx: 0, vz: 0, t: 0, visible: true });
    }
    const g = rampGeo();
    npc.t += dt;
    let beckon = false;
    if (npc.state === 'exit') {
      if (steer(npc, g.foot.x, g.foot.z + 0.4, 1.9, dt) < 0.35) npc.state = 'approach';
    } else {
      const dx = P.x - npc.x;
      const dz = P.z - npc.z;
      const d = Math.hypot(dx, dz) || 1;
      if (npc.state === 'approach') {
        const stop = 2.7;
        steer(npc, P.x - (dx / d) * stop, P.z - (dz / d) * stop, clamp((d - stop) * 1.4, 0, 3.6), dt, 6);
        const pos = { x: npc.x, z: npc.z };
        if (world.collision.resolve(pos, 0.45)) {
          npc.x = pos.x;
          npc.z = pos.z;
        }
        if (d < stop + 0.5 && npc.sp < 0.7) {
          npc.state = 'greet';
          npc.t = 0;
          say(RADIO.greet);
        }
      } else {
        // greet, then keep waiting for the Commander: face them, ease to a stop, beckon
        npc.facing += angleDiff(Math.atan2(dx, dz), npc.facing) * Math.min(1, dt * 6);
        npc.sp = Math.max(0, npc.sp - dt * 5);
        npc.vx = Math.sin(npc.facing) * npc.sp;
        npc.vz = Math.cos(npc.facing) * npc.sp;
        npc.x += npc.vx * dt;
        npc.z += npc.vz * dt;
        beckon = npc.state === 'greet' ? npc.t < 3.4 : npc.t % 6 < 2.6;
        if (npc.state === 'greet' && npc.t >= 3.4) {
          npc.state = 'wait';
          npc.t = 0;
        }
        if (d > 7) {
          npc.state = 'approach';
          npc.t = 0;
        }
      }
    }
    npc.y = shipGround(npc.x, npc.z);
    animateNpc(dt, beckon);
  }

  function startBoarding() {
    if (sim.phase !== 'play') return;
    sim.selfie = world.captureSelfie() || sim.selfie;
    sim.phase = 'boarding';
    sim.build.active = false;
    sim.stats.ascentTime = sim.t - sim.quest.step4T;
    log('Followed the rescue crew aboard the ship on the summit of Olympus Mons.');
    const g = rampGeo();
    const onRamp = (e) => Math.abs(e.x - g.top.x) < 1.0 && e.z < g.foot.z + 0.3 && e.z > g.top.z - 0.5;
    if (npc.state === 'hidden') {
      Object.assign(npc, { x: g.top.x, z: g.top.z, facing: 0, sp: 0, vx: 0, vz: 0, t: 0, visible: true });
    }
    npc.state = 'lead';
    P.sp = Math.hypot(P.vx, P.vz);
    const pts = [g.foot, g.top, g.inside, g.deep];
    sim.cine = { type: 'boarding', t: 0, stage: 'follow', ts: 0, g, pts, nwp: onRamp(npc) ? 1 : 0, pwp: onRamp(P) ? 1 : 0, waveT: 0 };
    audio.hatch();
  }

  function endMission(outcome) {
    if (sim.ended) return;
    sim.stats.time = sim.t;
    sim.stats.sols = solNum();
    sim.stats.rad = V.rad;
    sim.ended = {
      outcome: sim.sandbox && outcome === 'rescued' ? 'sandbox' : outcome,
      stats: { ...sim.stats },
      log: [...sim.log],
      selfie: sim.selfie || null,
      mode: sim.mode,
      custom: { backpack: sim.bp.id },
      science: science.summary(),
      loadout: sim.loadoutIds,
      fx: { totals: sim.fx.totals, sciMul: sim.fx.sciMul },
    };
  }

  // ---------------------------------------------------------------- objective
  const objTmp = {};
  function computeObjective() {
    const q = sim.quest;
    const o = { x: 0, z: 0, label: '' };
    if (sim.mode === 'expedition') {
      const dev = (id, label) => {
        const d = DEVICES.find((k) => k.id === id);
        return { x: id === 'rover' ? rv.x : d.x, z: id === 'rover' ? rv.z : d.z, label };
      };
      let t = null;
      if (!sim.devices.rover.done) t = dev('rover', 'Repair the broken rover: hold E with the welding torch');
      else if (!sim.devices.weather.done) t = dev('weather', 'Calibrate the REMS / MEDA weather station (hold E)');
      else t = science.nextTarget();
      if (!t) {
        const todo = ['sub1', 'sub2'].filter((id) => !sim.devices[id].done).map((id) => dev(id, 'Repair the ' + DEVICES.find((k) => k.id === id).name));
        todo.sort((a, b) => dist2(P.x, P.z, a.x, a.z) - dist2(P.x, P.z, b.x, b.z));
        t = todo[0] || null;
      }
      const left = Math.max(0, Math.round(400 - (sim.stats.roverDist || 0)));
      if (!t && left > 0) t = dev('rover', rv.driving ? 'Keep driving: ' + left + ' m to go' : 'Board the rover and drive ' + left + ' m (E)');
      if (!t) t = { x: P.x, z: P.z, label: 'Expedition complete' };
      o.x = t.x;
      o.z = t.z;
      o.label = t.label;
      sim.objective = o;
      return;
    }
    if (q.step === 1) {
      if (!q.flag) {
        o.x = world.flagPos.x;
        o.z = world.flagPos.z;
        o.label = 'Plant your mission flag beside the lander';
      } else if (!q.shelter) {
        const s = nearestShelter(P.x, P.z);
        doorPoint(s, objTmp);
        o.x = objTmp.x;
        o.z = objTmp.z;
        o.label = `Secure a shelter: enter ${s.name} through its airlock`;
      } else if (!q.farm) {
        const unsown = world.planters.find((p) => !p.crop);
        if (unsown) {
          o.x = unsown.x;
          o.z = unsown.z;
          o.label = 'Sow Martian potatoes or spirulina in your planter';
        } else {
          const s = SHELTERS[0];
          o.x = s.x + 9;
          o.z = s.z;
          o.label = 'Start farming: press B, choose 2 (Planter) and place it near the hab';
        }
      }
    } else if (q.step === 2) {
      const todo = ['sub1', 'sub2', 'weather'].filter((id) => !sim.devices[id].done);
      let best = null;
      let bd = 1e9;
      for (const id of todo) {
        const d = DEVICES.find((x) => x.id === id);
        const dd = dist2(P.x, P.z, d.x, d.z);
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      }
      if (best) {
        o.x = best.x;
        o.z = best.z;
        o.label = `Repair the ${best.name}`;
      }
    } else if (q.step === 3) {
      const relay = DEVICES.find((d) => d.id === 'relay');
      o.x = relay.x;
      o.z = relay.z;
      o.label = !sim.devices.relay.done ? 'Reach and repair the Deep-Space Relay Tower (north rim)' : !q.tuned ? 'Align the high-gain dish and transmit to Earth' : 'Signal in flight. Hold on for Earth’s reply';
    } else if (q.step === 4) {
      const ti = trailInfo(P.x, P.z);
      const foot = world.rescue.group.localToWorld(tmp.copy(world.rescue.rampFoot()));
      if (ti.s > TRAIL_LENGTH - 26 && ti.d < 14) {
        o.x = foot.x;
        o.z = foot.z;
        o.label = q.rocketT >= 9 ? 'Follow the rescue crew aboard the ship' : 'Reach the summit pad: rescue ship inbound';
      } else if (ti.d > 26 || (ti.s < 1 && dist2(P.x, P.z, TRAIL[0][0], TRAIL[0][1]) > 6)) {
        const t0 = TRAIL[0];
        o.x = t0[0];
        o.z = t0[1];
        o.label = 'Reach the scarp ramp at the foot of Olympus Mons';
      } else {
        const pt = trailGuidePoint(ti.s, 24);
        o.x = pt.x;
        o.z = pt.z;
        o.label = `Circle the cliff bands to the next ramp (or climb a face): ${Math.round((ti.s / TRAIL_LENGTH) * 100)}% to the summit`;
      }
    }
    sim.objective = o;
  }

  function checklist() {
    if (sim.mode === 'expedition') return science.expeditionChecklist();
    return questChecklist(sim.quest, sim.devices, { pitonsLeft: sim.climb.pitons });
  }

  // ---------------------------------------------------------------- puzzles (UI in ui/PuzzleOverlay.jsx)
  const puzzleDoneFns = {};
  /** Opens a mini-puzzle. The player stands still while it is open; hazards keep running. */
  function requestPuzzle(kind, id, params, onSolve) {
    if (sim.puzzle) return false;
    sim.puzzle = { kind, id, params: params || {}, seed: (rand() * 1e9) | 0, auto: !!sim.tour, openedAt: sim.t };
    puzzleDoneFns[id] = onSolve;
    sim.input.keys = {};
    sim.input.interactHeld = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
    audio.ui();
    return true;
  }
  function puzzleDone(id, solved) {
    if (!sim.puzzle || sim.puzzle.id !== id) return;
    const kind = sim.puzzle.kind;
    sim.puzzle = null;
    const fn = puzzleDoneFns[id];
    delete puzzleDoneFns[id];
    if (solved) {
      sim.stats.puzzles = (sim.stats.puzzles || 0) + 1;
      log(`Solved the ${PUZZLE_NAMES[kind] || kind} puzzle.`);
      fn?.();
    } else toast('Puzzle closed: you can try again any time', 2);
  }
  const PUZZLE_NAMES = { triangulation: 'signal triangulation', power: 'power routing', spectro: 'spectroscopy match', valves: 'airlock pressure', solar: 'solar array alignment' };

  // ---------------------------------------------------------------- interaction scan
  function scanInteract() {
    let pr = null;
    let act = null;
    const q = sim.quest;
    if (sim.build.active || sim.phase !== 'play') return { pr, act };
    if (rv.driving) return { pr: { key: 'interact', text: 'Exit rover' }, act: exitRover };
    // flag
    if (!q.flag && sim.mode !== 'ascent' && dist2(P.x, P.z, world.flagPos.x, world.flagPos.z) < 5) {
      return { pr: { key: 'interact', text: 'Plant the Ares-7 mission flag' }, act: plantFlag };
    }
    // NASA pioneers (dish lock, preserve / salvage) and the Bright Angel SHERLOC scan
    const sci = science.scan();
    if (sci) return sci;
    // rescue rocket
    if (q.step === 4 && q.rocketT >= 9) {
      const foot = world.rescue.group.localToWorld(tmp.copy(world.rescue.rampFoot()));
      const nearNpc = npc.visible && dist2(P.x, P.z, npc.x, npc.z) < 5;
      if (nearNpc || dist2(P.x, P.z, foot.x, foot.z) < 4.5) {
        return { pr: { key: 'interact', text: nearNpc ? 'Follow the rescue crew aboard' : 'Board the rescue ship' }, act: startBoarding };
      }
    }
    // shelters: airlock door, bunk, and oxygen guidance
    for (const s of shelters) {
      if (!s.door) continue;
      const dp = doorPoint(s, {});
      if (dist2(P.x, P.z, dp.x, dp.z) < 3.2) {
        const opening = s.door.target === 0;
        const open = () => {
          s.door.target = opening ? 1 : 0;
          audio.hatch();
          toast(opening ? 'Airlock opening' : 'Airlock sealed');
        };
        // first entry of each shelter: equalize the airlock against the habitat (pressure / thermal valve puzzle)
        if (opening && !s.door.equalized && !sim.tour) {
          return {
            pr: { key: 'interact', text: `Equalize the airlock pressure · ${s.name}` },
            act: () =>
              requestPuzzle('valves', `airlock:${s.id}`, {}, () => {
                s.door.equalized = true;
                open();
                codex('rems');
              }),
          };
        }
        return { pr: { key: 'interact', text: `${opening ? 'Open' : 'Close'} the airlock door · ${s.name}` }, act: open };
      }
      const inside = !!findShelter(P.x, P.z, [s]);
      if (inside && dist2(P.x, P.z, s.bed.x, s.bed.z) < 2.2) {
        return { pr: { key: 'interact', text: 'Lie down and sleep until sunrise' }, act: () => startSleep(s) };
      }
      if (!inside && V.o2 < V.o2Cap * 0.5 && dist2(P.x, P.z, s.x, s.z) < s.r + 14) {
        const how = s.door.target ? 'walk inside' : 'open the airlock door at its front';
        return { pr: { key: null, text: `Oxygen source: ${s.name}. To recharge O2, ${how}.` }, act: null };
      }
    }
    // rover energy field work: clear dust off the panels, deploy and aim the portable array
    if (sim.devices.rover.done && !rv.driving && dist2(P.x, P.z, rv.x, rv.z) < 5) {
      if (rv.panelDust > 0.35) {
        return { pr: { key: 'interact', text: `Hold to clear dust from the rover’s solar panels · ${Math.round(rv.panelDust * 100)}% covered` }, act: 'clean', id: 'rover' };
      }
      const sunUp = world.skyU.sunDir.value.y > 0.05;
      if (rv.battery < 65 && !rv.array && sunUp) {
        return { pr: { key: 'interact', text: `Rover battery ${Math.round(rv.battery)}% · deploy and aim the portable solar array` }, act: deployArray };
      }
      if (rv.battery <= 0.5) return { pr: { key: null, text: 'Rover battery flat: aim a solar array, clear the panels, or tow-charge at a powered substation' }, act: null };
    }
    // charging hookup at a repaired substation: route the power cells first
    for (const id of ['sub1', 'sub2']) {
      const d = DEVICES.find((k) => k.id === id);
      if (sim.devices[id].done && !rv.routed[id] && dist2(P.x, P.z, d.x, d.z) < DEVICE_RADIUS[d.kind]) {
        return { pr: { key: 'interact', text: `Route power cells for rover charging at the ${d.name}` }, act: () => requestPuzzle('power', `route:${id}`, {}, () => {
          rv.routed[id] = true;
          toast('Charging bay live: park the rover within 14 m to recharge', 3);
          codex('roverpower');
        }) };
      }
    }
    // devices
    for (const def of DEVICES) {
      const st = sim.devices[def.id];
      const cx = def.id === 'rover' ? rv.x : def.x;
      const cz = def.id === 'rover' ? rv.z : def.z;
      const d = dist2(P.x, P.z, cx, cz);
      if (d > DEVICE_RADIUS[def.kind]) continue;
      if (!st.done) {
        return { pr: { key: 'interact', text: `Hold to ${def.kind === 'weather' ? 'calibrate' : 'repair'} ${def.name} · ${Math.round(st.progress * 100)}%` }, act: 'repair', id: def.id };
      }
      if (def.id === 'rover') return { pr: { key: 'interact', text: `Drive the rover · battery ${Math.round(rv.battery)}%` }, act: enterRoverChecked };
      if (def.id === 'relay' && !q.tuned && q.step >= 3) {
        return { pr: { key: 'interact', text: 'Triangulate the high-gain dishes on Earth' }, act: startTune };
      }
    }
    // planters
    for (const p of world.planters) {
      if (dist2(P.x, P.z, p.x, p.z) > 2.6) continue;
      if (!p.crop) return { pr: { key: 'interact', text: `Sow ${CROPS[sim.cropChoice].name} · [${keyLabelShort(keysRef.current.rotate)}] switch seed` }, act: () => sow(p) };
      if (p.growth >= 1) return { pr: { key: 'interact', text: `Harvest ${CROPS[p.crop].name}` }, act: () => harvest(p) };
      if (p.water < 0.6)
        return {
          pr: { key: 'interact', text: `Water the ${CROPS[p.crop].name} · ${Math.round(p.growth * 100)}% grown` },
          act: () => {
            p.water = 1;
            world.updatePlanter(p);
            audio.click(0.4);
          },
        };
      return { pr: { key: null, text: `${CROPS[p.crop].name}: ${Math.round(p.growth * 100)}% grown · water ${Math.round(p.water * 100)}%` }, act: null };
    }
    return { pr, act };
  }
  const keyLabelShort = (c) => (c || '').replace(/^Key/, '');

  // ---------------------------------------------------------------- quest progression
  function updateQuest(dt) {
    const q = sim.quest;
    if (sim.mode === 'expedition') return; // open-world: the science checklist replaces the 4-step campaign
    if (q.step === 3 && q.transmitting) world.devices.relay.setAim(sim.t * 0.3);
    for (const e of advanceQuest(q, sim.devices, dt)) {
      if (e === 'lifeSupportDone') {
        say(RADIO.step2);
        log('Life support established. Moving on to the power grid.');
        sim.weather.dust.next = Math.min(sim.weather.dust.next, sim.t + 40);
      } else if (e === 'gridRestored') {
        say(RADIO.step3);
        log('Power grid restored.');
      } else if (e === 'earthReplied') {
        world.devices.relay.beam.material.opacity = 0.15;
        say(RADIO.reply);
        say(RADIO.step4);
        log('Earth replied. A rescue ascent rocket is landing on the summit of Olympus Mons.');
        q.step4T = sim.t;
        sim.weather.storm.active = true;
        sim.weather.storm.z = Math.max(P.z + 260, 300);
        sim.weather.dust.next = 1e9;
        if (sim.weather.dust.state !== 'idle') sim.weather.dust.s = 5000;
        codex('mola');
        audio.success();
      }
    }
    if (q.step === 4) {
      // extraction event: the rescue ship comes down as the Commander nears the summit pad
      if (!q.shipCalled) {
        const nearPad = dist2(P.x, P.z, SITES.rescuePad.x, SITES.rescuePad.z) < 90;
        const ti = trailInfo(P.x, P.z);
        if (nearPad || (ti.d < 14 && ti.s > TRAIL_LENGTH - 70)) {
          q.shipCalled = true;
          say(RADIO.shipInbound);
          log('Rescue ascent vehicle on final approach to the summit pad.');
          rocketArrive(false);
        }
      }
      const c = shelters.find((s) => s.id === 'hab-c');
      const d = shelters.find((s) => s.id === 'hab-d');
      if (!q.ledgeC && dist2(P.x, P.z, c.x, c.z) < 16) {
        q.ledgeC = true;
        say(RADIO.ledge1);
        log('Reached the Tharsis Ledge shelter.');
      }
      if (!q.ledgeD && dist2(P.x, P.z, d.x, d.z) < 16) {
        q.ledgeD = true;
        say(RADIO.ledge2);
        log('Reached the Caldera Wall shelter.');
      }
      if (!q.summitSaid && Math.hypot(P.x - OLYMPUS.x, P.z - OLYMPUS.z) < OLYMPUS.calderaR) {
        q.summitSaid = true;
        say(RADIO.summit);
        log('Summit caldera reached: the top of the tallest volcano in the solar system.');
      }
    }
    // rescue rocket descent
    if (q.rocketT >= 0 && q.rocketT < 9) {
      q.rocketT += dt * (sim.tour ? 1.8 : 1);
      const R = world.rescue;
      const k = clamp(q.rocketT / 7, 0, 1);
      const alt = 220 * Math.pow(1 - k, 3);
      R.group.position.y = world.rescueY + alt;
      R.setFlame(k < 1 ? 1 : 0, sim.t);
      // thruster blast: dust ring and shake once the ship is low enough to wash the pad
      if (alt < 45 && k < 1) {
        const near = 1 - alt / 45;
        for (let i = 0; i < 5; i++) {
          const a = rand() * TAU;
          const sp = 6 + rand() * 10;
          world.dust.emit(R.group.position.x + Math.cos(a) * 3, world.rescueY + 0.4, R.group.position.z + Math.sin(a) * 3, Math.cos(a) * sp, 0.5 + rand(), Math.sin(a) * sp, 2.4, 2.6);
        }
        if (dist2(P.x, P.z, R.group.position.x, R.group.position.z) < 140) sim.cam.shake = Math.max(sim.cam.shake, near * 0.1);
      }
      if (q.rocketT >= 7 && !q.shipDown) {
        q.shipDown = true;
        audio.thud(2);
        world.shockwave(SITES.rescuePad.x, world.rescueY, SITES.rescuePad.z, 1);
        sim.cam.shake = Math.max(sim.cam.shake, dist2(P.x, P.z, SITES.rescuePad.x, SITES.rescuePad.z) < 140 ? 0.4 : 0);
        say(RADIO.shipDown);
        log('The rescue ship touched down on the summit pad.');
      }
      if (q.rocketT > 7) {
        const o = clamp((q.rocketT - 7) / 1.5, 0, 1);
        R.setHatch(o);
        R.setRamp(o);
      }
    }
  }

  // ---------------------------------------------------------------- hazards
  /**
   * Natural rockfall source near (x, z): the lip of a cliff or steep ridge ABOVE the player whose ground drops away
   * toward them. Returns null on open plains, so rocks never appear out of thin air.
   */
  function findCliffSource(x, z, y, minD = 8, maxD = 45) {
    let best = null;
    let bs = -1;
    for (let i = 0; i < 16; i++) {
      const a = rand() * TAU;
      const d = minD + rand() * (maxD - minD);
      const sx = x + Math.cos(a) * d;
      const sz = z + Math.sin(a) * d;
      const h = getTerrainHeight(sx, sz);
      if (h < y + 5) continue;
      const dirx = (x - sx) / d;
      const dirz = (z - sz) / d;
      const drop = h - getTerrainHeight(sx + dirx * 3, sz + dirz * 3);
      const score = drop + (h - y) * 0.2;
      if (drop > 1.5 && score > bs) {
        bs = score;
        best = { x: sx, z: sz, h, dirx, dirz };
      }
    }
    return best;
  }
  /** Stage 2: a boulder works loose on the lip (wobbling, shedding dust) before it falls. */
  function spawnLoose(src, r) {
    const b = sim.boulders.find((k) => !k.active);
    if (!b) return;
    Object.assign(b, { active: true, x: src.x, z: src.z, r, y: src.h + r * 0.85, vx: 0, vy: 0, vz: 0, life: 20, rot: 0, hitT: 0, slowT: 0, loose: 1.0 + rand() * 0.9, dirx: src.dirx, dirz: src.dirz });
    for (let i = 0; i < 6; i++) world.dust.emit(src.x + (rand() - 0.5) * 3, src.h + 0.3, src.z + (rand() - 0.5) * 3, (rand() - 0.5) * 1.5, -0.4, (rand() - 0.5) * 1.5, 1.6, 1.2);
    if (dist2(src.x, src.z, P.x, P.z) < 60) audio.click(0.45);
  }
  /** Stage 1 (P-wave): dust shaken loose from nearby cliff faces, no rocks yet. */
  function shakeCliffDust() {
    const src = findCliffSource(P.x, P.z, P.y - 3, 6, 40);
    if (!src) return;
    for (let i = 0; i < 4; i++) world.dust.emit(src.x + (rand() - 0.5) * 4, src.h, src.z + (rand() - 0.5) * 4, src.dirx * 0.8 + (rand() - 0.5), -1.2 - rand(), src.dirz * 0.8 + (rand() - 0.5), 2.2, 1.4);
  }

  function quakeSpawn() {
    const src = findCliffSource(P.x, P.z, P.y, 8, 50);
    if (src) spawnLoose(src, 0.5 + rand() * 0.8);
  }

  function rockfallSpawn() {
    const src = findCliffSource(P.x, P.z, P.y, 6, 38);
    if (src) spawnLoose(src, 0.45 + rand() * 0.7);
  }

  function updateHazards(dt, sheltered) {
    const W = sim.weather;
    const hz = sim.hz;
    const step4 = sim.quest.step === 4;
    let exposedDust = false;
    let dustVis = 0;
    let hazard = null;
    const grace = sim.mode === 'campaign' || sim.mode === 'sandbox' ? sim.quest.flag : sim.mode === 'expedition' ? sim.t > 75 : true;

    // --- rolling dust wall
    const D = W.dust;
    if (D.state === 'idle' && grace && !step4 && sim.t > D.next && !sim.tour) startDustWall(sim.escapade ? 55 : 28);
    if (D.state === 'idle' && sim.escapade && grace && !step4 && !sim.tour && D.next - sim.t < 80 && D.next - sim.t > 0) {
      hazard = { active: false, text: `ESCAPADE 1-SOL FORECAST · DUST FRONT IN ~${Math.ceil(D.next - sim.t)}s` };
    }
    if (D.state !== 'idle') {
      D.s += D.speed * dt;
      const along = (P.x - D.ox) * D.dx + (P.z - D.oz) * D.dz;
      const rel = along - D.s;
      const inside = Math.abs(rel) < D.thick / 2;
      if (inside) {
        if (D.state !== 'active') {
          D.state = 'active';
          codex('meda');
        }
        dustVis = 0.9;
        const lee = inLee(P.x, P.y, P.z, D.dx, D.dz, world.collision);
        exposedDust = !sheltered && !lee;
        hazard = { active: true, text: sheltered ? 'DUST WALL · SHELTERED' : lee ? 'DUST WALL · IN THE LEE OF A RIDGE' : 'DUST WALL · EXPOSED, FILTERS CLOGGING' };
      } else if (rel > 0) {
        const secs = Math.max(0, Math.round((rel - D.thick / 2) / D.speed));
        dustVis = Math.max(dustVis, clamp(1 - (rel - D.thick / 2) / 160, 0, 0.5));
        hazard = { active: false, text: `DUST WALL INBOUND · ${secs}s · SHELTER OR GET BEHIND A RIDGE` };
      } else {
        dustVis = Math.max(dustVis, clamp(1 + (rel + D.thick / 2) / 120, 0, 0.4));
      }
      if (D.s > along + D.thick / 2 + 260 || D.s > 2500) {
        D.state = 'idle';
        D.next = sim.t + (150 + rand() * 80) / hz;
        sim.stats.hazards++;
        log('A dust wall swept over. Survived.');
      }
    }

    // --- marsquake
    const Q = W.quake;
    if (Q.state === 'idle' && grace && sim.t > Q.next && !sim.tour) startQuake();
    if (Q.state === 'rumble') {
      // P-wave: a low rumble and subtle shake; dust trickles off the cliffs before any rock moves
      Q.t -= dt;
      sim.cam.shake = Math.max(sim.cam.shake, 0.05);
      if (rand() < dt * 6) shakeCliffDust();
      hazard = hazard || { active: false, text: `P-WAVE DETECTED · S-WAVE IN ${Math.ceil(Math.max(0, Q.t))}s · MOVE AWAY FROM CLIFFS` };
      if (Q.t <= 0) {
        Q.state = 'active';
        Q.t = 11;
      }
    } else if (Q.state === 'active') {
      Q.t -= dt;
      Q.spawnT -= dt;
      sim.cam.shake = Math.max(sim.cam.shake, 0.32 * Math.min(1, Q.t / 3));
      if (Q.spawnT <= 0) {
        Q.spawnT = 0.75 / hz;
        quakeSpawn();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU;
          world.dust.emit(P.x + Math.cos(a) * 6, P.y + 0.2, P.z + Math.sin(a) * 6, Math.cos(a) * 5, 0.6, Math.sin(a) * 5, 1.6, 1.2);
        }
      }
      if (!sheltered && P.grounded) {
        getTerrainNormal(P.x, P.z, undefined, nrm);
        if (nrm.y < 0.86 && !sim.fx.quakeAnchor) {
          P.pushX = nrm.x * 7;
          P.pushZ = nrm.z * 7;
        }
      }
      hazard = { active: true, text: 'MARSQUAKE · DODGE FALLING ROCKS' };
      if (Q.t <= 0) {
        Q.state = 'idle';
        Q.next = sim.t + (step4 ? 70 + rand() * 40 : 130 + rand() * 70) / hz;
        sim.stats.hazards++;
        log('Survived a Cerberus Fossae marsquake.');
      }
    }

    // --- solar flare
    const F = W.flare;
    let geiger = 0.4;
    let aurora = 0;
    if (F.state === 'idle' && grace && sim.t > F.next && !sim.tour) startFlare();
    if (F.state === 'warning') {
      F.t -= dt;
      const k = 1 - F.t / 20;
      geiger = 1 + k * 22;
      aurora = k * 0.6;
      hazard = hazard || { active: false, text: `SOLAR PARTICLE EVENT IN ${Math.ceil(F.t)}s · SHELTER OR [R] SHIELD` };
      if (F.t <= 0) {
        F.state = 'active';
        F.t = 24;
      }
    } else if (F.state === 'active') {
      F.t -= dt;
      aurora = 1;
      const shield = sim.flags.shield ? sim.bp.shield : 0;
      const factor = sheltered ? 0.04 : 1 - shield;
      geiger = 4 + factor * 40;
      V.rad += 0.32 * hz * factor * dt * sim.fx.radCut;
      if (factor > 0.3) {
        V.focus -= 0.5 * dt * hz;
        V.health -= 0.22 * dt * hz;
      }
      hazard = hazard || { active: true, text: sheltered ? 'SOLAR FLARE · SHELTERED' : sim.flags.shield ? 'SOLAR FLARE · SUIT SHIELD ACTIVE' : 'SOLAR FLARE · TAKE COVER OR PRESS R' };
      if (F.t <= 0) {
        F.state = 'idle';
        F.next = sim.t + (210 + rand() * 90) / hz;
        sim.stats.hazards++;
        log('Rode out a solar particle event.');
      }
    }

    // --- finale: super-storm front, gusts, rockfall
    const S = W.storm;
    if (S.active) {
      S.z -= (sim.sandbox ? 0.55 : 0.85) * dt;
      S.z = Math.max(S.z, OLYMPUS.z + OLYMPUS.r - 30);
      const ahead = P.z - S.z;
      if (ahead > 0) {
        dustVis = Math.max(dustVis, 0.92);
        if (!sheltered) exposedDust = true;
        hazard = hazard || { active: true, text: 'SUPER-STORM · GET UP THE MOUNTAIN' };
      } else dustVis = Math.max(dustVis, clamp(1 + ahead / 180, 0, 0.55));
    }
    const onMountain = Math.hypot(P.x - OLYMPUS.x, P.z - OLYMPUS.z) < OLYMPUS.r && P.y > 12;
    const G = W.gust;
    if (step4 && onMountain && !sheltered) {
      G.next -= dt;
      if (G.next <= 0 && G.t <= 0) {
        G.t = 3.5;
        const a = rand() * TAU;
        G.dx = Math.cos(a);
        G.dz = Math.sin(a);
        G.next = 12 + rand() * 12;
        audio.warn();
      }
      const R = W.rockfall;
      R.next -= dt;
      if (R.next <= 0) {
        R.next = (7 + rand() * 6) / hz;
        const n = 1 + Math.floor(rand() * 2.5);
        for (let i = 0; i < n; i++) rockfallSpawn();
      }
    }
    if (G.t > 0) {
      G.t -= dt;
      const k = Math.sin((G.t / 3.5) * Math.PI);
      if (!sheltered && !rv.driving) {
        P.pushX += G.dx * 6 * k * hz;
        P.pushZ += G.dz * 6 * k * hz;
      }
      dustVis = Math.max(dustVis, 0.55 * k);
      hazard = hazard || { active: true, text: 'DUST GUST · BRACE, STAY ON THE TRAIL' };
    }

    sim.windAmt = clamp(0.25 + dustVis * 0.8 + (G.t > 0 ? 0.6 : 0), 0, 1.5);
    return { exposedDust, dustVis, hazard, geiger, aurora };
  }

  function startDustWall(warnSecs) {
    const D = sim.weather.dust;
    const a = rand() * TAU;
    D.dx = Math.cos(a);
    D.dz = Math.sin(a);
    D.ox = P.x;
    D.oz = P.z;
    D.speed = 7;
    D.s = -(warnSecs * D.speed + D.thick / 2);
    D.state = 'warning';
    say(RADIO.dustWarn);
    audio.warn();
  }
  function startQuake() {
    const Q = sim.weather.quake;
    Q.state = 'rumble';
    Q.t = 3.5;
    Q.spawnT = 0;
    say(RADIO.quakeWarn);
    codex('seis');
  }
  function startFlare() {
    const F = sim.weather.flare;
    F.state = 'warning';
    F.t = 20;
    say(RADIO.flareWarn);
    codex('rad', 'escapade', 'aurora');
  }

  // ---------------------------------------------------------------- Judge Quick-Tour
  function tourUpdate(dt) {
    const T = sim.tour;
    if (sim.phase === 'landing') return;
    T.t += dt * 1.45; // the 60-Second Judge Path: the scripted beats below are compressed into about a minute
    const at = (time, fn) => {
      if (!T.done[time] && T.t >= time) {
        T.done[time] = true;
        fn();
      }
    };
    const teleport = (x, z, yaw) => {
      if (rv.driving) {
        rv.driving = false;
        world.roverCollider.active = true;
      }
      P.x = x;
      P.z = z;
      P.y = getTerrainHeight(x, z);
      P.vx = P.vy = P.vz = 0;
      P.grounded = true;
      if (yaw !== undefined) sim.cam.yaw = yaw;
    };
    const near = (id) => {
      const d = DEVICES.find((k) => k.id === id);
      const x = id === 'rover' ? rv.x : d.x;
      const z = id === 'rover' ? rv.z : d.z;
      teleport(x + 2.6, z + 2.6, Math.atan2(2.6, 2.6));
      sim.tourRepair = id;
    };
    const tourPioneer = (pid) => {
      const pn = PIONEERS.find((k) => k.id === pid);
      teleport(pn.x + 5, pn.z + 4, Math.atan2(5, 4));
      sim.tourRepair = null;
      science.forceLock(pid);
    };
    at(1, () => plantFlag());
    at(4, () => {
      const s = SHELTERS[0];
      const dp = doorPoint(s);
      if (shelters[0].door) shelters[0].door.target = 1; // the airlock is shut by default; the tour opens it
      teleport(dp.x + Math.cos(s.door) * 3, dp.z + Math.sin(s.door) * 3, Math.PI / 2 - s.door);
      sim.auto = { x: s.x, z: s.z, sprint: true };
    });
    at(9, () => {
      sim.auto = null;
      const s = SHELTERS[0];
      let p = null;
      for (let i = 0; i < 24 && !p; i++) {
        const a = (i / 24) * TAU;
        const x = s.x + Math.cos(a) * 11;
        const z = s.z + Math.sin(a) * 11;
        if (checkPlacement(x, z, 1.5, world.collision).ok) p = world.addPlanter(x, z, a);
      }
      if (!p) p = world.addPlanter(s.x + 11, s.z, 0);
      sim.stats.built++;
      teleport(p.x + 2.4, p.z + 0.5);
      sow(p);
      sim.tourGrow = p;
    });
    at(13, () => near('sub1'));
    at(18, () => near('sub2'));
    at(21.5, () => tourPioneer('opportunity'));
    at(25, () => tourPioneer('ingenuity'));
    at(28.5, () => {
      const sd = SCIENCE_SITES.sherloc;
      teleport(sd.x + 4.2, sd.z + 3, Math.atan2(4.2, 3));
      sim.tourRepair = null;
      // autopilot demo of the spectroscopy match, then the SHERLOC result
      if (!requestPuzzle('spectro', 'sherloc', { mineral: 'smectite', tol: 0.05 }, science.forceScan)) science.forceScan();
    });
    at(31, () => near('weather'));
    at(33, () => near('rover'));
    at(37, () => {
      sim.tourRepair = null;
      if (!sim.devices.rover.done) completeRepair('rover');
      enterRover();
    });
    at(44, () => {
      exitRover();
      sim.solClock = SOL_REAL_SECONDS * (solNum() - 1 + 0.735);
      codex('sunset');
      near('relay');
    });
    at(49, () => {
      sim.tourRepair = null;
      if (!sim.devices.relay.done) completeRepair('relay');
      if (sim.quest.step < 3) sim.quest.step = 3;
      startTune();
    });
    at(57, () => {
      if (!sim.quest.tuned) {
        sim.tune = null;
        sim.quest.tuned = true;
        sim.quest.transmitting = true;
        sim.quest.transmitT = 1;
      }
      sim.solClock = SOL_REAL_SECONDS * (solNum() - 1 + 1.45);
      teleport(TRAIL[0][0] + 6, TRAIL[0][1] + 30, 0);
      startDustWall(4);
      startQuake();
    });
    at(64, () => {
      const pt = trailPointAt(TRAIL_LENGTH * 0.35);
      teleport(pt.x, pt.z);
      startFlare();
      sim.weather.flare.t = 3;
    });
    at(71, () => {
      // Peak-style climb: hang on a cliff band beside the route and climb the last few metres to the bench above
      const c = ROUTE.cliffs[4];
      const nxt = ROUTE.cliffs[5];
      const phi = c.start + c.span + (nxt.start - c.start - c.span) * 0.35;
      const r = nxt.R + 0.6;
      const x = OLYMPUS.x + Math.cos(phi) * r;
      const z = OLYMPUS.z + Math.sin(phi) * r;
      teleport(x, z);
      P.y = getTerrainHeight(x - Math.cos(phi) * 0.8, z - Math.sin(phi) * 0.8) + nxt.high - nxt.low - 4.5;
      P.climb = { dx: -Math.cos(phi), dz: -Math.sin(phi), t: 0 };
      P.grounded = false;
      sim.cam.yaw = Math.atan2(Math.cos(phi), Math.sin(phi));
      sim.auto = { x: OLYMPUS.x + Math.cos(phi) * (nxt.R - 6), z: OLYMPUS.z + Math.sin(phi) * (nxt.R - 6), climb: true };
      if (sim.climb.pitons > 0) usePiton();
    });
    at(77, () => {
      // near the pad the extraction event fires: the ship descends while the Commander walks up
      const pt = trailPointAt(TRAIL_LENGTH - 36);
      teleport(pt.x, pt.z);
      const R = world.rescue;
      const foot = R.group.localToWorld(new V3().copy(R.rampFoot()));
      sim.auto = { x: foot.x, z: foot.z + 3 };
    });
    at(84, () => {
      sim.auto = null;
      if (sim.quest.rocketT < 9) rocketArrive(true);
      startBoarding();
    });
    // continuous tour behaviours
    if (sim.tourRepair) sim.input.interactHeld = true;
    else if (!sim.tune) sim.input.interactHeld = false;
    if (sim.tourGrow && sim.tourGrow.crop) {
      sim.tourGrow.growth = Math.min(1, sim.tourGrow.growth + dt * 0.25);
      sim.tourGrow.water = 1;
    }
    if (sim.tune && sim.tune.needle > sim.tune.band[0] + 0.01 && sim.tune.needle < sim.tune.band[1] - 0.01) tuneLock();
    if (T.t > 43 && T.t < 49 && sim.quest.step === 2) {
      ['sub1', 'sub2', 'weather'].forEach((id) => !sim.devices[id].done && completeRepair(id));
    }
    if (T.t >= 64 && T.t < 77 && P.grounded && sim.quest.step === 4) {
      const ti = trailInfo(P.x, P.z);
      const pt = trailGuidePoint(ti.s, 6);
      sim.auto = { x: pt.x, z: pt.z, sprint: true };
    }
  }

  // ---------------------------------------------------------------- main update
  const inputDir = { mx: 0, mz: 0, sprint: false, jump: false };
  let lastFoot = 0;

  function update(dt) {
    sim.t += dt;
    sim.frame++;
    const tourMul = sim.tour ? 1.6 : 1;
    sim.solClock += dt * tourMul;
    if (sim.tour) tourUpdate(dt);

    if (sim.sleep) updateSleep(dt);
    else if (sim.phase === 'landing') updateLanding(dt);
    else if (sim.phase === 'boarding') updateBoarding(dt);
    else if (sim.phase === 'dead') {
      sim.deathT += dt;
      if (sim.deathT > 3.5) endMission('lost');
    } else updatePlay(dt);

    // radio queue
    if (sim.radio) {
      sim.radioT -= dt;
      if (sim.radioT <= 0) sim.radio = null;
    }
    if (!sim.radio && sim.radioQ.length) {
      const [speaker, text] = sim.radioQ.shift();
      sim.radio = { speaker, text };
      sim.radioT = sim.tour ? Math.max(2.5, text.length * 0.032) : Math.max(4, text.length * 0.058);
      audio.radio();
    }
    if (sim.toastT > 0) {
      sim.toastT -= dt;
      if (sim.toastT <= 0) sim.toast = null;
    }
    if (sim.insight) {
      sim.insight.t -= dt;
      if (sim.insight.t <= 0) sim.insight = null;
    }
  }

  function updateLanding(dt) {
    const c = sim.cine;
    c.t += dt * (sim.tour ? 1.6 : 1);
    const L = world.lander;
    // opening narrative: the lander descends from high above Gale while the briefing subtitles play
    const PRE = c.pre ?? (c.pre = sim.tour ? 2.5 : BRIEFING.length * BRIEFING_BEAT);
    if (c.t < PRE) {
      const u = c.t / PRE;
      L.group.position.y = world.landerY + 150 + 300 * (1 - u);
      L.setFlame(0.35 + 0.25 * Math.sin(sim.t * 9) ** 2, sim.t);
      const beat = Math.min(BRIEFING.length - 1, Math.floor(c.t / BRIEFING_BEAT));
      sim.cineSub = sim.tour ? { title: 'JUDGE PATH', text: BRIEFING[0].text } : BRIEFING[beat];
      sim.audioState = { rocket: 0.5 };
      return;
    }
    sim.cineSub = null;
    const t = c.t - PRE;
    const k = clamp(t / 6, 0, 1);
    const alt = 150 * Math.pow(1 - k, 3);
    L.group.position.y = world.landerY + alt;
    L.setFlame(k < 1 ? 0.55 + (1 - k) * 0.45 : 0, sim.t);
    if (alt < 30 && k < 1) {
      for (let i = 0; i < 4; i++) {
        const a = rand() * TAU;
        const sp = 6 + rand() * 8;
        world.dust.emit(SITES.landing.x + Math.cos(a) * 3, world.landerY + 0.3, SITES.landing.z + Math.sin(a) * 3, Math.cos(a) * sp, 0.4 + rand(), Math.sin(a) * sp, 2.2, 2.2);
      }
      sim.cam.shake = Math.max(sim.cam.shake, (1 - alt / 30) * 0.12);
    }
    if (k >= 1 && !c.touched) {
      c.touched = true;
      audio.thud(2);
      world.shockwave(SITES.landing.x, world.landerY, SITES.landing.z, 0.8);
      sim.cam.shake = Math.max(sim.cam.shake, 0.35);
      log('Ares-7 lander touchdown, Gale Crater.');
    }
    if (t > 6.2) {
      const o = clamp((t - 6.2) / 1.0, 0, 1);
      L.setHatch(o);
      L.setRamp(o);
    }
    if (t > 7.3) {
      // walk down the ramp
      world.astro.root.visible = true;
      const w = clamp((t - 7.3) / 2.0, 0, 1);
      const top = L.group.localToWorld(tmp.set(0, L.sill, L.radius - 0.2));
      const foot = L.group.localToWorld(tmp2.copy(L.rampFoot()));
      P.x = top.x + (foot.x - top.x) * w;
      P.y = top.y + (foot.y - top.y) * w + 0.04;
      P.z = top.z + (foot.z - top.z) * w;
      P.facing = 0;
      world.animator.update(dt, { speed: 2.4, vx: 0, vz: 2.4, facing: 0, x: P.x, y: P.y, z: P.z, ground: landerGround, grounded: true, anticip: 0, landT: 0, repairing: false, vy: 0 });
    }
    sim.audioState = { rocket: k < 1 ? 1 : 0 };
    if (t > 9.5) finishLanding();
  }

  /**
   * Extraction: the crew member leads the Commander up the ramp, beckons from the hatch, both go in, the ramp
   * retracts and the hatch seals, the engines ignite and the ship lifts off; the screen fades into the debrief.
   */
  function updateBoarding(dt) {
    const c = sim.cine;
    const R = world.rescue;
    const g = c.g;
    const sdt = dt * (sim.tour ? 1.8 : 1);
    c.t += sdt;
    const hideZ = g.top.z - 0.35;
    const w = windVec();
    let audioRocket = 0;

    if (c.stage === 'follow' || c.stage === 'wave' || c.stage === 'enter') {
      // --- crew member
      const npcDone = c.stage === 'wave';
      if (!npcDone) {
        const idx = c.stage === 'enter' ? Math.max(c.nwp, 2) : c.nwp;
        const speed = c.stage === 'enter' ? 1.9 : 2.3;
        const tgt = c.pts[Math.min(idx, 3)];
        if (steer(npc, tgt.x, tgt.z, speed, sdt) < 0.2 && c.nwp < 3) c.nwp++;
        if (c.stage === 'follow' && c.nwp >= 2) {
          c.stage = 'wave';
          c.waveT = 0;
        }
      } else {
        // wait at the hatch, turn back toward the Commander and beckon
        c.waveT += sdt;
        npc.facing += angleDiff(Math.atan2(P.x - npc.x, P.z - npc.z), npc.facing) * Math.min(1, sdt * 6);
        npc.sp = Math.max(0, npc.sp - sdt * 6);
        npc.vx = npc.vz = 0;
      }
      npc.y = shipGround(npc.x, npc.z);
      if (npc.z < hideZ) npc.visible = false;

      // --- Commander follows, never closer than ~1.5 m behind the crew member
      const gap = Math.hypot(P.x - npc.x, P.z - npc.z);
      const pIdx = c.stage === 'enter' ? Math.max(c.pwp, 2) : Math.min(c.pwp, 1);
      const ptgt = c.pts[Math.min(pIdx, 3)];
      let pSpeed = c.stage === 'enter' ? 1.9 : 3.0;
      if (npc.visible && gap < 1.6 && c.stage !== 'wave') pSpeed = Math.min(pSpeed, Math.max(0.3, npc.sp * 0.9));
      if (steer(P, ptgt.x, ptgt.z, pSpeed, sdt) < 0.25 && c.pwp < 3 && (c.stage === 'enter' || c.pwp < 1)) c.pwp++;
      P.y = shipGround(P.x, P.z);
      if (P.z < hideZ) world.astro.root.visible = false;

      if (c.stage === 'wave') {
        const atTop = Math.hypot(P.x - g.top.x, P.z - g.top.z) < 1.9;
        if (c.waveT > 1.5 && (atTop || c.waveT > 6)) {
          c.stage = 'enter';
          c.nwp = 2;
          c.pwp = 2;
        }
      }
      if (c.stage === 'enter' && !npc.visible && !world.astro.root.visible) {
        c.stage = 'seal';
        c.ts = 0;
        audio.hatch();
      }
    } else if (c.stage === 'seal') {
      c.ts += sdt;
      npc.vx = npc.vz = P.vx = P.vz = 0;
      R.setRamp(1 - clamp(c.ts / 1.4, 0, 1));
      R.setHatch(1 - clamp((c.ts - 1.5) / 0.9, 0, 1));
      if (c.ts > 2.4 && !c.sealed) {
        c.sealed = true;
        audio.hatch();
      }
      if (c.ts > 3.3) {
        c.stage = 'ignite';
        c.ts = 0;
        world.shockwave(SITES.rescuePad.x, world.rescueY, SITES.rescuePad.z, 0.8);
      }
    } else if (c.stage === 'ignite') {
      c.ts += sdt;
      const k = clamp(c.ts / 1.3, 0, 1);
      R.setFlame(k, sim.t);
      audioRocket = k;
      sim.cam.shake = Math.max(sim.cam.shake, k * 0.12);
      for (let i = 0; i < 3; i++) {
        const a = rand() * TAU;
        world.dust.emit(R.group.position.x + Math.cos(a) * 3, world.rescueY + 0.4, R.group.position.z + Math.sin(a) * 3, Math.cos(a) * 10, 1, Math.sin(a) * 10, 2.5, 3);
      }
      if (c.ts > 1.7) {
        c.stage = 'lift';
        c.lt = 0;
        world.shockwave(SITES.rescuePad.x, world.rescueY, SITES.rescuePad.z, 1.5);
        sim.cam.shake = Math.max(sim.cam.shake, 0.45);
        log('The rescue ship lifted off Olympus Mons.');
      }
    } else if (c.stage === 'lift') {
      c.lt += sdt;
      const lt = c.lt;
      R.group.position.y = world.rescueY + 1.6 * lt * lt;
      R.setFlame(1, sim.t);
      audioRocket = 1;
      sim.cam.shake = Math.max(sim.cam.shake, Math.max(0, 0.22 - lt * 0.04));
      if (lt < 2.6) {
        for (let i = 0; i < 2; i++) {
          const a = rand() * TAU;
          world.dust.emit(R.group.position.x + Math.cos(a) * 3, world.rescueY + 0.4, R.group.position.z + Math.sin(a) * 3, Math.cos(a) * 12, 1.2, Math.sin(a) * 12, 2.2, 2.6);
        }
      }
      if (dom.fade) dom.fade.style.opacity = String(clamp((lt - 5.6) / 1.3, 0, 1));
      if (lt > 7.2) endMission('rescued');
    }
    if (npc.visible) npc.y = shipGround(npc.x, npc.z);
    P.y = shipGround(P.x, P.z);

    // --- animation for both characters (they only animate while visible)
    if (world.astro.root.visible) {
      world.animator.update(dt, {
        speed: Math.hypot(P.vx, P.vz),
        vx: P.vx,
        vz: P.vz,
        facing: P.facing,
        x: P.x,
        y: P.y,
        z: P.z,
        ground: shipGround,
        grounded: true,
        anticip: 0,
        landT: 0,
        repairing: false,
        vy: 0,
        lookYaw: npc.visible ? lookTo(P, npc.x, npc.z) : 0,
        windX: w.x,
        windZ: w.z,
      });
    }
    if (npc.visible) animateNpc(dt, c.stage === 'wave', true);
    sim.audioState = { rocket: audioRocket };
  }

  function updatePlay(dt) {
    const keys = sim.input.keys;
    const q = sim.quest;
    P.pushX = 0;
    P.pushZ = 0;
    const shelter = rv.driving ? null : findShelter(P.x, P.z, shelters);
    const sheltered = !!shelter;
    if (shelter && !sim.inShelter) {
      audio.hatch();
      if (!q.shelter && q.step === 1) {
        q.shelter = true;
        say(RADIO.shelter);
        log(`Secured shelter: ${shelter.name}.`);
      }
    }
    sim.inShelter = shelter ? shelter.name : null;

    const hzr = updateHazards(dt, sheltered);
    sim.dustAmt += (hzr.dustVis - sim.dustAmt) * Math.min(1, dt * 1.5);
    sim.hazard = hzr.hazard;
    sim.geiger = hzr.geiger;
    sim.aurora = hzr.aurora;

    // --- movement input
    const f = camForward();
    const r = { x: -f.z, z: f.x };
    let fwd = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    let str = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let mx = f.x * fwd + r.x * str;
    let mz = f.z * fwd + r.z * str;
    let sprint = !!keys.sprint;
    if (sim.auto) {
      const dx = sim.auto.x - P.x;
      const dz = sim.auto.z - P.z;
      const l = Math.hypot(dx, dz);
      if (l > 0.8) {
        mx = dx / l;
        mz = dz / l;
        sprint = !!sim.auto.sprint;
        if (!sim.cam.lastMouse || sim.t - sim.cam.lastMouse > 1.5) sim.cam.yaw += angleDiff(Math.atan2(-mx, -mz), sim.cam.yaw) * Math.min(1, dt * 2);
      } else mx = mz = 0;
      fwd = 1;
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    if (sim.build.active || sim.plantT > 0) sprint = false;
    if (sprint && V.stamina < 2) sprint = false;
    // crouch (hold): slower, lower, no sprint
    sim.crouching = !!keys.crouch && !rv.driving && !sim.build.active;
    if (sim.crouching) {
      sprint = false;
      mx *= 0.5;
      mz *= 0.5;
    }
    // shift: sprint raises the FOV and drives the camera's kick; the render step eases it
    sim.shiftT = sprint && (mx || mz) && !rv.driving ? 1 : 0;
    const focusWobble = V.focus < 25 ? Math.sin(sim.t * 1.3) * 0.25 : 0;

    // --- interaction
    const { pr, act, id } = sim.puzzle ? { pr: null, act: null, id: null } : scanInteract();
    sim.prompt = pr;
    let repairing = null;
    const sciHolding = science.tickHold(act === 'science' ? id : null, sim.input.interactHeld && !rv.driving, dt);
    sim.cleaning = false;
    if (sim.puzzle) mx = mz = 0;
    if (act === 'repair') {
      if (sim.input.interactHeld && !rv.driving) repairing = id;
    } else if (act === 'clean') {
      if (sim.input.interactHeld) {
        sim.cleaning = true;
        rv.panelDust = Math.max(0, rv.panelDust - dt * 0.32);
        mx = mz = 0;
        P.facing = Math.atan2(rv.x - P.x, rv.z - P.z);
        if (Math.random() < 0.5) world.dust.emit(rv.x + (rand() - 0.5) * 2, rv.y + 1.4, rv.z + (rand() - 0.5) * 2, (rand() - 0.5) * 2, 1, (rand() - 0.5) * 2, 1, 0.5);
        if (rv.panelDust <= 0.02) {
          toast('Rover panels clear: full solar output restored', 2.4);
          log('Brushed dust off the rover’s solar panels.');
          sim.input.interactHeld = false;
        }
      }
    } else if (sim.input.interact && typeof act === 'function') act();
    else if (sim.input.interact && P.climb) brushGloves();
    if (sim.build.active && sim.input.interact) placeBuild();
    sim.input.interact = false;

    if (sim.tune) {
      const tn = sim.tune;
      tn.needle += tn.dir * tn.speed * dt;
      if (tn.needle > 1) {
        tn.needle = 1;
        tn.dir = -1;
      } else if (tn.needle < 0) {
        tn.needle = 0;
        tn.dir = 1;
      }
      if (tn.cool > 0) tn.cool -= dt;
      if (dist2(P.x, P.z, DEVICES[3].x, DEVICES[3].z) > 9) sim.tune = null;
    }

    // --- repair
    sim.repairing = repairing;
    if (repairing) {
      const def = DEVICES.find((d) => d.id === repairing);
      const st = sim.devices[repairing];
      st.progress += (dt / def.repairTime) * (sim.tour ? 1.6 : 1) * (sim.sandbox ? 1.5 : 1);
      const dp = deviceWorld(repairing, tmp);
      P.facing = Math.atan2(dp.x - P.x, dp.z - P.z);
      mx = mz = 0;
      for (let i = 0; i < 3; i++) world.sparks.emit(dp.x, dp.y, dp.z, (rand() - 0.5) * 4, rand() * 3.5, (rand() - 0.5) * 4, 0.5 + rand() * 0.4, 0.09, 3.72);
      if (st.progress >= 1) {
        st.progress = 1;
        const rid = repairing;
        // power substations: the hardware is fixed, now route current through the relays without an overload
        if ((def.kind === 'solar' || def.kind === 'rtg') && (!sim.tour || def.kind === 'solar')) {
          requestPuzzle('power', `route:${rid}`, {}, () => {
            rv.routed[rid] = true;
            completeRepair(rid);
          });
        } else completeRepair(rid);
      }
    }
    stepRoverEnergy(dt);

    if (sciHolding) {
      mx = mz = 0;
    }

    // --- rover or on foot
    if (rv.driving) {
      const ti = Math.hypot(rv.x - OLYMPUS.x, rv.z - OLYMPUS.z) < OLYMPUS.r ? trailInfo(rv.x, rv.z) : null;
      let throttle = fwd;
      const steer = -str;
      if (sim.tour) {
        throttle = 1;
      }
      if (rv.battery <= 0) {
        throttle = 0;
        if (!sim.toast) toast('Rover battery depleted: climb out and recharge (solar array, clean panels, substation)', 3);
      }
      if (ti && ti.s > 40 && throttle > 0) {
        throttle = -0.3;
        if (!sim.toast) toast('The trail narrows: too steep for the rover. Continue on foot.');
      }
      rv.boost = sprint ? 1.25 : 1;
      stepRover(rv, { throttle, steer: sim.tour ? Math.sin(sim.t * 0.7) * 0.6 : steer }, dt, world.collision);
      rv.t += dt;
      P.x = rv.x;
      P.z = rv.z;
      P.y = rv.y + 0.6;
      P.vx = Math.sin(rv.yaw) * rv.speed;
      P.vz = Math.cos(rv.yaw) * rv.speed;
      P.grounded = true;
      P.facing = rv.yaw;
      sim.stats.distance += Math.abs(rv.speed) * dt;
      sim.stats.roverDist = (sim.stats.roverDist || 0) + Math.abs(rv.speed) * dt;
      sim.trackAcc = (sim.trackAcc || 0) + Math.abs(rv.speed) * dt;
      if (sim.trackAcc > 0.55) {
        sim.trackAcc = 0;
        for (const side of [-1, 1]) world.tirePrints.add(rv.x + Math.cos(rv.yaw) * 1.18 * side, rv.z - Math.sin(rv.yaw) * 1.18 * side, rv.yaw);
      }
      if (Math.abs(rv.speed) > 2) {
        for (const side of [-1, 1]) {
          const bx = rv.x - Math.sin(rv.yaw) * 1.4 + Math.cos(rv.yaw) * side * 1.1;
          const bz = rv.z - Math.cos(rv.yaw) * 1.4 - Math.sin(rv.yaw) * side * 1.1;
          world.dust.emit(bx, rv.y + 0.2, bz, -Math.sin(rv.yaw) * rv.speed * 0.4 + (rand() - 0.5), 1.2 + rand() * 1.5, -Math.cos(rv.yaw) * rv.speed * 0.4 + (rand() - 0.5), 1.4, 0.9, 1.2);
        }
      }
      if (sim.t - sim.cam.lastMouse > 1.2) sim.cam.yaw += angleDiff(rv.yaw + Math.PI, sim.cam.yaw) * Math.min(1, dt * 2.5);
    } else {
      if (sim.build.active) updateBuildGhost();
      inputDir.mx = mx * (sim.plantT > 0 ? 0 : 1);
      inputDir.mz = mz * (sim.plantT > 0 ? 0 : 1);
      if (focusWobble) {
        const c = Math.cos(focusWobble);
        const s = Math.sin(focusWobble);
        const nx = inputDir.mx * c - inputDir.mz * s;
        inputDir.mz = inputDir.mx * s + inputDir.mz * c;
        inputDir.mx = nx;
      }
      inputDir.sprint = sprint && (mx !== 0 || mz !== 0);
      inputDir.jump = sim.input.jump && !sim.build.active;
      inputDir.grip = V.grip;
      inputDir.letGo = !!keys.crouch && !!P.climb;
      inputDir.climb = !sim.build.active && (!sim.auto || !!sim.auto.climb);
      sim.input.jump = false;
      const ox = P.x;
      const oz = P.z;
      const wasClimbing = !!P.climb;
      const ev = stepPlayer(P, inputDir, dt, world.collision);
      sim.stats.distance += Math.hypot(P.x - ox, P.z - oz);
      // ---- Peak-style climbing: grip, glove regolith, pitons, rope arrest
      const C = sim.climb;
      if (ev.climbStart) {
        audio.click(0.5);
        if (!C.tipShown) {
          C.tipShown = true;
          toast(`Climbing · W/S up/down · A/D traverse · Space leap · ${keyLabelShort(keysRef.current.piton)} piton (${C.pitons} left) · ${keyLabelShort(keysRef.current.crouch)} let go`, 5);
        }
      }
      if (ev.mantled) {
        audio.land(2);
        sim.stats.climbs = (sim.stats.climbs || 0) + 1;
      }
      if (ev.slipped) {
        toast('Grip gone: you slipped off the face!', 2.5);
        audio.hurt();
      }
      const onPiton = !!C.anchor && P.climb && Math.hypot(P.x - C.anchor.x, P.z - C.anchor.z) < 1.5 && Math.abs(P.y - C.anchor.y) < 1.5;
      V.grip = clamp(V.grip + gripRate({ climbing: !!P.climb, moving: !!(mx || mz), onPiton, gloveDust: C.gloveDust, dust: sim.dustAmt, tempC: sim.tempC ?? -40 }) * dt, 0, GRIP_MAX);
      if (P.climb) C.gloveDust = Math.min(1, C.gloveDust + gloveDustRate(sim.dustAmt) * dt);
      if (tryArrest(P, C.anchor, getTerrainHeight)) {
        toast('Piton caught your fall', 2.5);
        audio.thud(0.8);
        sim.cam.shake = Math.max(sim.cam.shake, 0.18);
        V.grip = Math.max(V.grip, 30);
        log('A piton arrested a fall on Olympus Mons.');
      }
      if (anchorStale(C.anchor, P) && P.grounded) C.anchor = null;
      if (wasClimbing && !P.climb && !ev.mantled && !P.grounded) C.fallFromY = P.y;
      if (ev.jumped) {
        audio.jump();
        for (let i = 0; i < 6; i++) world.dust.emit(P.x, P.y + 0.1, P.z, (rand() - 0.5) * 2, 0.5, (rand() - 0.5) * 2, 1, 0.5);
      }
      if (ev.landed) {
        audio.land(ev.landSpeed);
        const n = Math.min(18, 6 + ev.landSpeed * 2);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          world.dust.emit(P.x + Math.cos(a) * 0.4, P.y + 0.1, P.z + Math.sin(a) * 0.4, Math.cos(a) * (1 + ev.landSpeed * 0.3), 0.4 + rand() * 0.5, Math.sin(a) * (1 + ev.landSpeed * 0.3), 1.3, 0.7);
        }
        if (ev.landSpeed > 8.5) {
          const dmg = (ev.landSpeed - 8.5) * 9 * sim.hz;
          V.health -= dmg;
          sim.hurtT = 0.6;
          audio.hurt();
          log(`Hard landing at ${ev.landSpeed.toFixed(1)} m/s.`);
        }
      }
      const sp = Math.hypot(P.vx, P.vz);
      if (P.climb) P.facing += angleDiff(Math.atan2(P.climb.dx, P.climb.dz), P.facing) * Math.min(1, dt * 12);
      else if (sp > 0.3 && !repairing) P.facing += angleDiff(Math.atan2(P.vx, P.vz), P.facing) * Math.min(1, dt * 10);
      if (sim.plantT > 0) {
        sim.plantT -= dt;
        const fy = clamp(1 - sim.plantT / 1.0, 0.01, 1);
        world.flag.group.scale.set(1, fy, 1);
        P.facing = Math.atan2(world.flagPos.x - P.x, world.flagPos.z - P.z);
      }
      const wv = windVec();
      const foot = world.animator.update(dt, {
        speed: sp,
        vx: P.vx,
        vz: P.vz,
        facing: P.facing,
        x: P.x,
        y: P.y,
        z: P.z,
        ground: getTerrainHeight,
        grounded: P.grounded,
        anticip: P.anticip,
        landT: P.landT,
        repairing: !!repairing || sim.plantT > 0 || sim.sciHolding || !!P.climb,
        crouch: sim.crouching,
        vy: P.vy,
        lookYaw: angleDiff(sim.cam.yaw + Math.PI, P.facing),
        lookPitch: (sim.cam.pitch - 0.3) * 0.5,
        windX: wv.x,
        windZ: wv.z,
      });
      if (foot && sim.t - lastFoot > 0.2) {
        lastFoot = sim.t;
        audio.footstep(sprint ? 1 : 0);
        sim.stepSide = -(sim.stepSide || 1);
        world.bootPrints.add(P.x + Math.cos(P.facing) * 0.11 * sim.stepSide, P.z - Math.sin(P.facing) * 0.11 * sim.stepSide, P.facing);
        world.dust.emit(P.x, P.y + 0.05, P.z, (rand() - 0.5) * 0.6, 0.3, (rand() - 0.5) * 0.6, 0.9, 0.35);
      }
    }

    // --- boulders
    stepBoulders(sim.boulders, dt, world.collision);
    for (const b of sim.boulders) {
      if (!b.active) continue;
      if (b.loose > 0) {
        // stage 2: wedged on the lip, shedding grit; then it tips over the edge toward the slope below
        b.loose -= dt;
        if (rand() < dt * 8) world.dust.emit(b.x + (rand() - 0.5) * b.r, b.y - b.r * 0.5, b.z + (rand() - 0.5) * b.r, b.dirx * 0.5, -1.5, b.dirz * 0.5, 1.2, 0.5);
        if (b.loose <= 0) {
          b.loose = 0;
          const sp = 1.6 + rand() * 1.8;
          b.vx = b.dirx * sp;
          b.vz = b.dirz * sp;
          b.vy = 0.4;
          if (dist2(b.x, b.z, P.x, P.z) < 60) audio.thud(0.35);
        }
        continue;
      }
      // stage 3: tumbling under Mars gravity (3.72 m/s²) with a dust trail and impact scars
      if (Math.hypot(b.vx, b.vz) > 2.5 && rand() < dt * 10) world.dust.emit(b.x, b.y - b.r * 0.6, b.z, -b.vx * 0.1, 0.4, -b.vz * 0.1, 1.4, 0.8 * b.r);
      if (b.bounced) {
        b.bounced = false;
        world.dust.emit(b.x, b.y - b.r, b.z, 0, 0.8, 0, 1.2, 1.5 * b.r);
        world.impactPrints.add(b.x, b.z, rand() * TAU);
        if (dist2(b.x, b.z, P.x, P.z) < 30) audio.thud(0.6);
      }
      b.hitT -= dt;
      if (b.hitT <= 0 && !sheltered && !rv.driving) {
        const d = Math.hypot(b.x - P.x, b.y - (P.y + 0.9), b.z - P.z);
        const rel = Math.hypot(b.vx - P.vx, b.vy - P.vy, b.vz - P.vz);
        if (d < b.r + 0.6 && rel > 1.5) {
          b.hitT = 1;
          const dmg = Math.min(45, rel * 4.2) * sim.hz;
          V.health -= dmg;
          sim.hurtT = 0.7;
          sim.cam.shake = Math.max(sim.cam.shake, 0.3);
          P.vx += b.vx * 0.6;
          P.vz += b.vz * 0.6;
          b.vx *= -0.3;
          b.vz *= -0.3;
          audio.hurt();
          log(`Struck by a falling boulder (−${Math.round(dmg)} suit integrity).`);
        }
      }
    }

    // --- vitals
    updateVitals(dt, sheltered, hzr.exposedDust, sprint && !rv.driving && (mx || mz));

    // --- echoes
    for (const e of world.echoes) {
      const d = dist2(P.x, P.z, e.def.x, e.def.z);
      e.group.visible = d < 60;
      if (e.group.visible) {
        e.group.rotation.y += dt * 0.4;
        const fl = 0.35 + Math.sin(sim.t * 13 + e.def.x) * 0.08 + (Math.random() < 0.03 ? -0.3 : 0);
        e.mat.opacity = fl;
      }
      if (d < 9 && !sim.echoesSeen[e.def.id]) {
        sim.echoesSeen[e.def.id] = true;
        sim.stats.echoes++;
        V.focus = Math.min(100, V.focus + 10);
        sim.radioQ.unshift(['ECHO', e.def.text]);
        log(`Found the holographic echo of ${e.def.name} (${e.def.years}).`);
        codex(e.def.id === 'insight' ? 'seis' : e.def.id === 'perseverance' ? 'moxie' : 'meda');
      }
    }

    // --- planters grow
    for (const p of world.planters) {
      if (!p.crop) continue;
      p.water = Math.max(0, p.water - dt / 85);
      if (p.water > 0 && p.growth < 1) {
        const nearHab = shelters.some((s) => dist2(s.x, s.z, p.x, p.z) < 14);
        p.growth = Math.min(1, p.growth + (dt / CROPS[p.crop].growTime) * (nearHab ? 1.25 : 1) * (sim.sandbox ? 2 : 1));
      }
    }
    if ((sim.frame % 15) === 0) for (const p of world.planters) world.updatePlanter(p);

    updateQuest(dt);
    computeObjective();
    updateNpc(dt);
    science.tick(dt);

    // sunset codex
    const sf = solFrac();
    if (sf > 0.72 && sf < 0.76) codex('sunset');

    sim.stats.maxAlt = Math.max(sim.stats.maxAlt, altitude());
    if (V.health <= 0) {
      if (sim.sandbox) respawn();
      else {
        sim.phase = 'dead';
        sim.deathT = 0;
        sim.selfie = world.captureSelfie() || sim.selfie;
        log('Suit integrity failure. The Commander was lost.');
        audio.hurt();
      }
    }
  }

  function startSleep(s) {
    if (sim.sleep || sim.phase !== 'play') return;
    // bed axis points from the dome centre to the bunk; the head rests toward the centre
    const a = s.doorAngle + Math.PI;
    const rad = { x: Math.cos(a), z: Math.sin(a) };
    const tan = { x: -Math.sin(a), z: Math.cos(a) };
    const floorY = getTerrainHeight(s.bed.x, s.bed.z);
    const wake = { x: s.bed.x + tan.x * 1.5, z: s.bed.z + tan.z * 1.5 };
    wake.y = getTerrainHeight(wake.x, wake.z);
    sim.sleep = {
      t: 0,
      applied: false,
      s,
      yaw: Math.PI / 2 - a,
      from: { x: P.x, y: P.y, z: P.z, yaw: P.facing },
      lie: { x: s.bed.x + rad.x * 0.95, z: s.bed.z + rad.z * 0.95, y: floorY + 0.77 },
      wake,
      wakeYaw: Math.atan2(s.x - wake.x, s.z - wake.z),
      pose: { x: P.x, y: P.y, z: P.z, rx: 0, yaw: P.facing },
    };
    sim.input.keys = {};
    log('Went to sleep inside the shelter.');
  }

  /**
   * Lie down on the mattress, fade out, skip to the next sunrise, restore vitals, fade in, then rise and step
   * onto the clear floor beside the bunk (never standing on or inside it).
   */
  function updateSleep(dt) {
    const S = sim.sleep;
    S.t += dt;
    const t = S.t;
    const ease = (k) => clamp(k, 0, 1) * clamp(k, 0, 1) * (3 - 2 * clamp(k, 0, 1));
    const po = S.pose;
    if (t < 1.3) {
      const k = ease(t / 1.3);
      po.x = S.from.x + (S.lie.x - S.from.x) * k;
      po.z = S.from.z + (S.lie.z - S.from.z) * k;
      po.y = S.from.y + (S.lie.y - S.from.y) * k;
      po.rx = -(Math.PI / 2) * k;
      po.yaw = S.from.yaw + angleDiff(S.yaw, S.from.yaw) * k;
    } else if (t < 5.0) {
      Object.assign(po, { x: S.lie.x, y: S.lie.y, z: S.lie.z, rx: -Math.PI / 2, yaw: S.yaw });
    } else {
      const k = ease((t - 5.0) / 0.8);
      po.x = S.lie.x + (S.wake.x - S.lie.x) * k;
      po.z = S.lie.z + (S.wake.z - S.lie.z) * k;
      po.y = S.lie.y + (S.wake.y - S.lie.y) * k;
      po.rx = -(Math.PI / 2) * (1 - k);
      po.yaw = S.yaw + angleDiff(S.wakeYaw, S.yaw) * k;
    }
    P.x = po.x;
    P.z = po.z;
    P.y = getTerrainHeight(po.x, po.z);
    world.animator.update(dt, { speed: 0, grounded: true, anticip: 0, landT: 0, repairing: false, vy: 0 });
    const fade = t < 1.3 ? 0 : t < 2.7 ? (t - 1.3) / 1.4 : t < 3.6 ? 1 : t < 5.0 ? 1 - (t - 3.6) / 1.4 : 0;
    if (dom.fade) dom.fade.style.opacity = String(fade);
    if (t >= 5.8) {
      // wake upright on the floor beside the bed, facing the room
      P.x = S.wake.x;
      P.z = S.wake.z;
      P.y = S.wake.y;
      P.vx = P.vy = P.vz = 0;
      P.grounded = true;
      P.facing = S.wakeYaw;
      sim.cam.yaw = S.wakeYaw - Math.PI;
      world.astro.root.rotation.set(0, S.wakeYaw, 0);
      sim.sleep = null;
      return;
    }
    if (!S.applied && t >= 2.7) {
      S.applied = true;
      const dayStart = Math.floor(sim.solClock / SOL_REAL_SECONDS) * SOL_REAL_SECONDS;
      let target = dayStart + 0.27 * SOL_REAL_SECONDS;
      if (target <= sim.solClock) target += SOL_REAL_SECONDS;
      sim.solClock = target;
      Object.assign(V, {
        o2: V.o2Cap,
        health: Math.min(100, V.health + 50),
        warmth: 100,
        stamina: 100,
        focus: Math.min(100, V.focus + 40),
        food: Math.max(0, V.food - 8),
        battery: Math.min(100, V.battery + 35),
        filter: 0,
      });
      say(RADIO_SLEEP);
      log('Slept until sunrise. Oxygen full, suit warm and repaired.');
      audio.success();
    }
  }

  function respawn() {
    const s = nearestShelter(P.x, P.z);
    P.x = s.x;
    P.z = s.z;
    P.y = getTerrainHeight(s.x, s.z);
    P.vx = P.vy = P.vz = 0;
    Object.assign(V, { o2: V.o2Cap, health: 100, warmth: 100, stamina: 100, filter: 0 });
    toast('Cadet rescue: revived inside the nearest shelter', 3.5);
    log(`Cadet rescue drone recovered the Commander to ${s.name}.`);
  }

  function updateVitals(dt, sheltered, exposedDust, sprinting) {
    const af = altFactor();
    const hz = sim.hz;
    const sf = solFrac();
    const dayCurve = Math.max(0, Math.sin((sf - 0.25) * TAU));
    const temp = -75 + 72 * Math.pow(dayCurve, 0.7) - af * 38 - sim.dustAmt * 4;
    sim.tempC = Math.round(temp);
    if (sheltered) {
      V.o2 = Math.min(V.o2Cap, V.o2 + 9 * dt);
      V.warmth = Math.min(100, V.warmth + 7 * dt);
      V.filter = Math.max(0, V.filter - 12 * dt);
      V.health = Math.min(100, V.health + 1.6 * dt);
      V.battery = Math.min(100, V.battery + 2.5 * dt);
    } else {
      const drain = 0.16 * climbO2Mul(!!P.climb) * sim.fx.o2DrainMul * (sprinting ? 1.6 : 1) * (1 + af * 0.95) * (exposedDust ? 2.2 : 1) * (sim.sandbox ? 0.6 : 1);
      V.o2 -= drain * dt;
      let cold = temp < -15 ? ((-15 - temp) / 60) * 0.55 * hz * sim.fx.coldCut : -0.4;
      if (cold > 0 && V.battery > 0) {
        cold *= 0.6;
        V.battery -= 0.08 * dt;
      }
      V.warmth = clamp(V.warmth - cold * dt, 0, 100);
      if (exposedDust) {
        V.filter = Math.min(100, V.filter + 3.2 * hz * dt);
        if (V.filter > 85) V.health -= 1.2 * hz * dt;
      }
    }
    V.food = Math.max(0, V.food - 0.045 * dt);
    if (sprinting) V.stamina = Math.max(0, V.stamina - 16 * dt);
    else V.stamina = Math.min(100, V.stamina + (5 + (V.food / 100) * 9) * dt);
    V.focus = clamp(V.focus - (0.025 + (V.warmth < 30 ? 0.1 : 0)) * dt, 0, 100);
    V.rad += (0.67 / SOL_REAL_SECONDS) * dt * (sheltered ? 0.2 : 1) * sim.fx.radCut;
    if (sim.flags.flashlight) V.battery -= 0.22 * dt * sim.fx.batteryDrain;
    if (sim.flags.shield) V.battery -= 2.6 * dt * sim.fx.batteryDrain;
    if (sim.bp.solar && dayCurve > 0.1) V.battery += 0.5 * dayCurve * dt;
    if (dayCurve > 0.1) V.battery += sim.fx.batteryRegen * dayCurve * dt;
    for (const id of ['sub1', 'sub2']) {
      if (sim.devices[id].done) {
        const d = DEVICES.find((k) => k.id === id);
        if (dist2(P.x, P.z, d.x, d.z) < 30) V.battery += 1.4 * dt;
      }
    }
    V.battery = clamp(V.battery, 0, 100);
    if (V.battery <= 0) {
      sim.flags.flashlight = false;
      sim.flags.shield = false;
    }
    if (V.o2 <= 0) {
      V.o2 = 0;
      V.health -= 6 * dt;
    }
    if (V.warmth < 20) V.health -= 0.6 * hz * dt;
    if (V.food <= 0) V.health -= 0.2 * dt;
    if (sim.sandbox) {
      V.o2 = Math.max(V.o2, 5);
    }
    // warnings
    sim.warnT.o2 -= dt;
    sim.warnT.cold -= dt;
    if (V.o2 < V.o2Cap * 0.25 && sim.warnT.o2 <= 0) {
      sim.warnT.o2 = 35;
      say(RADIO.lowO2);
      audio.warn();
    }
    if (V.warmth < 30 && sim.warnT.cold <= 0) {
      sim.warnT.cold = 40;
      say(RADIO.cold);
    }
  }

  // ---------------------------------------------------------------- building
  function updateBuildGhost() {
    const b = sim.build;
    const item = BUILD_ITEMS.find((i) => i.id === b.item);
    const f = camForward();
    const d = b.item === 'habitat' ? 8 : 3.6;
    b.x = P.x + f.x * d;
    b.z = P.z + f.z * d;
    const y = getTerrainHeight(b.x, b.z);
    const g = world.ghosts[b.item];
    const other = world.ghosts[b.item === 'habitat' ? 'planter' : 'habitat'];
    other.visible = false;
    g.visible = true;
    g.position.set(b.x, y + 0.02, b.z);
    const doorA = Math.atan2(P.z - b.z, P.x - b.x) + b.rot;
    b.door = doorA;
    g.rotation.y = b.item === 'habitat' ? Math.PI / 2 - doorA : b.rot + sim.cam.yaw;
    const blockers = [
      { x: SITES.landing.x, z: SITES.landing.z + 4, r: 4, reason: 'Keep the lander ramp clear' },
      { x: SITES.rescuePad.x, z: SITES.rescuePad.z, r: 12, reason: 'Keep the landing pad clear' },
      { x: P.x, z: P.z, r: 0.6, reason: 'You are standing there' },
    ];
    let res = checkPlacement(b.x, b.z, item.radius, world.collision, blockers);
    if (res.ok && sim.kits[b.item] <= 0) res = { ok: false, reason: `No ${item.name} kits left` };
    if (res.ok && b.item === 'habitat' && Math.hypot(b.x - OLYMPUS.x, b.z - OLYMPUS.z) < OLYMPUS.r && trailInfo(b.x, b.z).d < 12) res = { ok: false, reason: 'Would block the trail' };
    b.ok = res.ok;
    b.reason = res.ok ? `${item.name}: ${res.reason}` : res.reason;
    world.ghostMat.color.set(res.ok ? '#10b981' : '#dc2626');
    world.ghostWire.color.set(res.ok ? '#34f5b0' : '#ff4d4d');
  }

  function placeBuild() {
    const b = sim.build;
    if (!b.ok) {
      audio.beep(260);
      return;
    }
    if (b.item === 'habitat') {
      world.addHabitat(b.x, b.z, b.door);
      log('Built a pressurized habitat shelter.');
    } else {
      world.addPlanter(b.x, b.z, b.rot + sim.cam.yaw);
      log('Built a regolith planter.');
    }
    sim.kits[b.item]--;
    sim.stats.built++;
    audio.success();
    toast(`${BUILD_ITEMS.find((i) => i.id === b.item).name} placed`);
    updateBuildGhost();
  }

  // ---------------------------------------------------------------- cutscene free-look
  // While a cutscene plays, dragging orbits the camera 360° around the scripted shot (damped, never underground).
  const cineLook = { yaw: 0, pitch: 0, yawS: 0, pitchS: 0, active: false };
  const _off = new V3();
  function applyCineLook(dt) {
    const k = Math.min(1, dt * 6);
    cineLook.yawS += (cineLook.yaw - cineLook.yawS) * k;
    cineLook.pitchS += (cineLook.pitch - cineLook.pitchS) * k;
    if (Math.abs(cineLook.yawS) < 1e-4 && Math.abs(cineLook.pitchS) < 1e-4) return;
    _off.copy(camPos).sub(camTarget);
    const r = _off.length();
    const yaw0 = Math.atan2(_off.x, _off.z) + cineLook.yawS;
    const pitch0 = clamp(Math.asin(clamp(_off.y / Math.max(r, 1e-6), -1, 1)) + cineLook.pitchS, -0.15, 1.35);
    camPos.set(camTarget.x + Math.sin(yaw0) * Math.cos(pitch0) * r, camTarget.y + Math.sin(pitch0) * r, camTarget.z + Math.cos(yaw0) * Math.cos(pitch0) * r);
    camPos.y = Math.max(camPos.y, getTerrainHeight(camPos.x, camPos.z) + 1.2);
  }

  // ---------------------------------------------------------------- render (every frame, also while paused)
  const camPos = new V3();
  const camTarget = new V3();
  const rootQ = new THREE.Quaternion();
  const seatLocal = new V3(-0.35, 0.78, 0.1);
  function render(dt) {
    const cam = world.camera;
    const astro = world.astro;
    const day = world.setEnvironment(solFrac(), clamp(sim.dustAmt, 0, 1), sim.aurora || 0, V.focus);
    world.skyU.time.value = sim.t;

    // player rig placement
    if (rv.driving) {
      world.rover.body.updateWorldMatrix(true, false);
      world.rover.body.localToWorld(tmp.copy(seatLocal));
      astro.root.position.copy(tmp);
      world.rover.body.getWorldQuaternion(rootQ);
      astro.root.quaternion.copy(rootQ);
      world.animator.update(dt, { speed: 0, grounded: true, anticip: 0, landT: 0.3, repairing: false, vy: 0 });
    } else if (sim.sleep) {
      // lying on the mattress (rotation.x = -PI/2 about the bunk axis), then rising beside it
      const po = sim.sleep.pose;
      astro.root.position.set(po.x, po.y, po.z);
      astro.root.rotation.set(po.rx, po.yaw, 0, 'YXZ');
    } else {
      astro.root.position.set(P.x, P.y, P.z);
      astro.root.rotation.set(0, P.facing, 0);
    }
    // spine bar: cyan when oxygen is healthy, pulsing red when low
    const o2f = V.o2 / V.o2Cap;
    const bar = astro.spineBar.material;
    bar.emissive.setRGB(o2f > 0.35 ? 0.18 : 1, o2f > 0.35 ? 0.9 : 0.15, o2f > 0.35 ? 1 : 0.1);
    bar.emissiveIntensity = o2f > 0.35 ? 1.8 : 1.2 + Math.sin(sim.t * 8) * 0.9;
    world.shadowDecal.visible = astro.root.visible && !rv.driving && !sim.sleep;
    if (world.shadowDecal.visible) world.updateShadow(P.x, P.y, P.z);

    // rescue crew member + ship lights
    const nr = world.npc;
    nr.astro.root.visible = npc.visible;
    nr.shadow.visible = npc.visible;
    if (npc.visible) {
      nr.astro.root.position.set(npc.x, npc.y, npc.z);
      nr.astro.root.rotation.set(0, npc.facing, 0);
      world.updateNpcShadow(npc.x, npc.y, npc.z, shipGround);
    }
    if (world.rescue.group.visible) world.rescue.tick(sim.t);

    // rover visuals
    const rg = world.rover.group;
    rg.position.set(rv.x, rv.y, rv.z);
    rg.rotation.set(rv.pitch, rv.yaw, rv.roll, 'YXZ');
    world.rover.update(rv, dt);
    world.roverLight.intensity = rv.driving ? 40 * (day < 0.5 ? 1 : 0.4) : 0;

    // lights
    world.flashlight.intensity = sim.flags.flashlight ? 60 : 0;
    if (sim.repairing) {
      astro.getTorchTip(tmp);
      world.torchLight.position.copy(tmp);
      world.torchLight.intensity = 6 + Math.random() * 8;
      for (let i = 0; i < 2; i++) world.sparks.emit(tmp.x, tmp.y, tmp.z, (rand() - 0.5) * 3, rand() * 2.5, (rand() - 0.5) * 3, 0.35, 0.06, 3.72);
    } else world.torchLight.intensity = 0;

    // flag
    if (world.flag.group.visible) world.flag.update(sim.t, sim.windAmt);

    // shelter beacons
    for (const s of world.shelters) {
      const pulse = 0.75 + Math.sin(sim.t * 3 + s.x) * 0.25;
      s.dome.beacon.scale.setScalar(2.4 + pulse * 1.4);
      s.dome.beacon.material.opacity = 0.5 + pulse * 0.4;
      s.dome.glass.material.opacity = sim.inShelter === s.name ? 0.08 : 0.22;
    }
    // device sparks while broken (ambient)
    if ((sim.frame & 3) === 0) {
      for (const def of DEVICES) {
        if (sim.devices[def.id].done) continue;
        const dp = deviceWorld(def.id, tmp2);
        if (dist2(P.x, P.z, dp.x, dp.z) > 80) continue;
        if (Math.random() < 0.5) for (let i = 0; i < 4; i++) world.sparks.emit(dp.x, dp.y, dp.z, (rand() - 0.5) * 3, rand() * 3, (rand() - 0.5) * 3, 0.5, 0.07, 3.72);
      }
    }
    // conduit pulse
    for (const c of world.conduits) if (sim.devices[c.id].done) c.mesh.material.color.setHSL(0.53, 0.9, 0.45 + Math.sin(sim.t * 4) * 0.12);

    // boulders -> instanced mesh
    const bm = world.boulderMesh;
    let n = 0;
    for (const b of sim.boulders) {
      if (!b.active) continue;
      const jit = b.loose > 0 ? 0.06 : 0; // wobbling loose rock
      tmp.set(b.x + (Math.random() - 0.5) * jit, b.y, b.z + (Math.random() - 0.5) * jit);
      rootQ.setFromAxisAngle(tmp2.set(Math.cos(b.vz), 0, -Math.sin(b.vx)).normalize(), b.rot);
      mStore.compose(tmp, rootQ, tmp2.set(b.r, b.r * 0.9, b.r));
      bm.setMatrixAt(n++, mStore);
    }
    bm.count = n;
    bm.instanceMatrix.needsUpdate = true;

    // layered cloudy storm front (instanced billowing puffs; fog + sky tint come from sim.dustAmt)
    const D = sim.weather.dust;
    const S = sim.weather.storm;
    let front = null;
    if (S.active) front = { x: P.x, z: S.z, nx: 0, nz: -1 };
    else if (D.state !== 'idle') front = { x: D.ox + D.dx * (D.s + D.thick / 2), z: D.oz + D.dz * (D.s + D.thick / 2), nx: D.dx, nz: D.dz };
    world.storm.setLight(day);
    world.storm.update(dt, sim.t, front, P, front ? 1 : 0);


    // ambient wind-blown dust motes around the player
    const wind = sim.windAmt;
    const wdx = D.state !== 'idle' ? D.dx : sim.weather.gust.t > 0 ? sim.weather.gust.dx : 0.7;
    const wdz = D.state !== 'idle' ? D.dz : sim.weather.gust.t > 0 ? sim.weather.gust.dz : 0.3;
    const motes = Math.floor(wind * 3 + Math.random());
    for (let i = 0; i < motes; i++) {
      world.motes.emit(P.x + (rand() - 0.5) * 40 - wdx * 12, P.y + rand() * 6, P.z + (rand() - 0.5) * 40 - wdz * 12, wdx * (4 + wind * 10), (rand() - 0.3) * 0.6, wdz * (4 + wind * 10), 3, 0.18);
    }
    // CO2 geysers: periodic white jets rising from the dark fans near the player
    let nearGeyser = false;
    for (const g of world.geysers) {
      const dg = dist2(P.x, P.z, g.x, g.z);
      if (dg > 170) continue;
      if (Math.sin(sim.t * 0.35 + g.x * 0.07) > 0.15) {
        if (dg < 70) nearGeyser = true;
        if (Math.random() < 0.8) world.geyser.emit(g.x + (rand() - 0.5) * 2, g.y + 0.3, g.z + (rand() - 0.5) * 2, (rand() - 0.5) * 1.2 + wdx * 1.5, 7 + rand() * 5, (rand() - 0.5) * 1.2 + wdz * 1.5, 3.4, 2.4, 1.2);
      }
    }
    if (nearGeyser) codex('geyser');
    // Phobos crosses the Sun for ~25 s each afternoon (not in a dust storm)
    const sfNow = solFrac();
    const phK = sfNow > 0.52 && sfNow < 0.58 && sim.dustAmt < 0.5 ? ((sfNow - 0.52) / 0.06) * 2 - 1 : null;
    world.setPhobos(phK);
    if (phK !== null && Math.abs(phK) < 0.3) codex('phobos');
    // storm feel: wind buffets the camera and dust / frost creeps across the visor
    if (sim.dustAmt > 0.45 && !sim.inShelter) sim.cam.shake = Math.max(sim.cam.shake, (sim.dustAmt - 0.4) * 0.07);
    if (dom.visorDust) dom.visorDust.style.opacity = String(sim.inShelter ? 0 : clamp((sim.dustAmt - 0.25) * 1.3, 0, 0.85));
    if (dom.visorFrost) dom.visorFrost.style.opacity = String(clamp((60 - V.warmth) / 50, 0, 0.8));
    world.dust.update(dt);
    world.geyser.update(dt);
    world.updateShock(dt);
    world.sparks.update(dt);
    world.motes.update(dt);

    // waypoint beam
    const o = sim.objective;
    world.beacon.visible = false; // the objective is a 2D marker now, so the 3D beam can't clip into terrain
    if (o) {
      world.beacon.position.set(o.x, getTerrainHeight(o.x, o.z), o.z);
      const near = clamp(Math.hypot(o.x - P.x, o.z - P.z) / 35, 0.08, 1);
      world.beamMat.opacity = (0.22 + Math.sin(sim.t * 4) * 0.1) * near;
      world.beacon.children[1].scale.setScalar(1 + ((sim.t * 0.8) % 1) * 0.8);
    }

    // ghosts off when not building
    if (!sim.build.active) world.ghosts.habitat.visible = world.ghosts.planter.visible = false;

    // camera
    if (sim.cine && sim.cine.type === 'landing') {
      const L = world.lander.group.position;
      const a = sim.t * 0.25 + 0.6;
      camTarget.set(L.x, L.y + 4, L.z);
      camPos.set(L.x + Math.sin(a) * 30, Math.max(L.y * 0.6 + world.landerY * 0.4 + 10, getTerrainHeight(L.x + Math.sin(a) * 30, L.z + Math.cos(a) * 30) + 4), L.z + Math.cos(a) * 30);
      if (sim.cine.t - (sim.cine.pre || 0) > 7.3) {
        camTarget.set(P.x, P.y + 1.4, P.z);
        camPos.set(P.x + 5, P.y + 3, P.z + 8);
      }
      applyCineLook(dt);
      cam.position.lerp(camPos, Math.min(1, dt * 3));
    } else if (sim.cine && sim.cine.type === 'boarding') {
      const c = sim.cine;
      const g = c.g;
      const R = world.rescue.group.position;
      if (c.stage === 'lift') {
        // pull back and tilt up with the ship
        camPos.set(g.top.x + 16 + c.lt * 0.8, world.rescueY + 5 + c.lt * 0.6, g.top.z + 10 + c.lt * 1.2);
        camTarget.set(R.x, R.y + 7, R.z);
      } else if (c.stage === 'seal' || c.stage === 'ignite') {
        camPos.set(g.top.x + 13, world.rescueY + 4.5, g.top.z + 9);
        camTarget.set(R.x, world.rescueY + 4, R.z);
      } else {
        // 3/4 view following the crew member and the Commander up the ramp
        const mx = npc.visible ? (P.x + npc.x) / 2 : P.x;
        const mz = npc.visible ? (P.z + npc.z) / 2 : P.z;
        const my = npc.visible ? Math.max(P.y, npc.y) : P.y;
        camTarget.set(mx, my + 1.5, mz);
        camPos.set(mx + 4.6, my + 2.1, mz + 4.8);
      }
      applyCineLook(dt);
      cam.position.lerp(camPos, Math.min(1, dt * (c.stage === 'lift' ? 4 : 2.5)));
    } else {
      const pitch = sim.cam.pitch;
      let dist = rv.driving ? Math.max(sim.cam.dist, 10) : sim.cam.dist;
      if (sim.inShelter) dist = Math.min(dist, 5.5);
      camTarget.set(P.x, P.y + (rv.driving ? 2.2 : 1.55), P.z);
      camPos.set(P.x + Math.sin(sim.cam.yaw) * dist * Math.cos(pitch), camTarget.y + dist * Math.sin(pitch), P.z + Math.cos(sim.cam.yaw) * dist * Math.cos(pitch));
      const gh = getTerrainHeight(camPos.x, camPos.z) + 0.6;
      if (camPos.y < gh) camPos.y = gh;
      // keep line of sight: lift the camera if a ridge sits between it and the player
      for (const k of [0.3, 0.55, 0.8]) {
        const sx = camTarget.x + (camPos.x - camTarget.x) * k;
        const sz = camTarget.z + (camPos.z - camTarget.z) * k;
        const sy = camTarget.y + (camPos.y - camTarget.y) * k;
        const need = getTerrainHeight(sx, sz) + 0.5 - sy;
        if (need > 0) camPos.y += need / k;
      }
      cam.position.lerp(camPos, Math.min(1, dt * 14));
    }
    sim.cam.shake = Math.max(0, sim.cam.shake - dt * 0.4);
    // reduced motion (OS setting or in-game toggle): camera shake is damped to a gentle 12%
    const shakeMul = settingsRef.current.reducedMotion ? 0.12 : 1;
    if (sim.cam.shake * shakeMul > 0.001) {
      const s = sim.cam.shake * shakeMul;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(camTarget);
    world.placeSunAround(P.x, P.y, P.z);

    // audio
    const as = sim.audioState || {};
    audio.update(dt, {
      wind: sim.windAmt,
      dust: sim.dustAmt,
      welding: !!sim.repairing || !!as.laser,
      quake: sim.weather.quake.state === 'active' ? 1 : sim.weather.quake.state === 'rumble' ? 0.4 : 0,
      motor: rv.driving ? Math.min(1, Math.abs(rv.speed) / 9) + 0.1 : 0,
      rocket: as.rocket || (sim.quest.rocketT >= 0 && sim.quest.rocketT < 7 ? 0.6 : 0),
      geiger: sim.phase === 'play' ? sim.geiger || 0.4 : 0,
    });
    sim.audioState = null;

    // direct DOM writes (no React)
    if (dom.ring) {
      const st = sim.repairing ? sim.devices[sim.repairing] : null;
      const prog = st ? st.progress : sim.sciProg || 0;
      const on = !!st || prog > 0.001;
      dom.ring.style.strokeDashoffset = String(163.4 * (1 - prog));
      dom.ring.style.opacity = on ? '1' : '0';
      dom.ring.style.stroke = st ? '#ffcc33' : '#58e1ff';
      if (dom.ringBg) dom.ringBg.setAttribute('opacity', on ? '1' : '0');
    }
    if (dom.needle && sim.tune) dom.needle.style.left = `calc(${(sim.tune.needle * 100).toFixed(2)}% - 2px)`;
    // 2D markers: objective, and oxygen guidance whenever O2 runs low outside a shelter
    const canvasEl = world.renderer.domElement;
    const playing = sim.phase === 'play' && !sim.sleep;
    placeMarker(dom, 'obj', world.camera, canvasEl, o ? o.x : 0, o ? getTerrainHeight(o.x, o.z) + 2.6 : 0, o ? o.z : 0, '', !!o && playing);
    const o2Low = V.o2 < V.o2Cap * 0.35 && !sim.inShelter && playing;
    const nearest = o2Low ? nearestShelter(P.x, P.z) : null;
    const dp = nearest ? doorPoint(nearest, {}) : null;
    placeMarker(dom, 'o2', world.camera, canvasEl, dp ? dp.x : 0, dp ? nearest.y + 2.6 : 0, dp ? dp.z : 0, 'O2', !!dp);
    // airlock door animation and sleep/shift camera feedback
    world.updateDoors(dt, P.x, P.z);
    sim.shiftK += (sim.shiftT - sim.shiftK) * Math.min(1, dt * 5);
    const fovT = sim.photo ? 28 : (settingsRef.current.fov || 62) + sim.shiftK * 9;
    if (Math.abs(world.camera.fov - fovT) > 0.02) {
      world.camera.fov += (fovT - world.camera.fov) * Math.min(1, dt * 6);
      world.camera.updateProjectionMatrix();
    }
    world.setFocus(camTarget);
    if (dom.vignette) {
      sim.hurtT = Math.max(0, sim.hurtT - dt);
      const lowPulse = V.health < 30 || V.o2 < V.o2Cap * 0.15 ? 0.35 + Math.sin(sim.t * 6) * 0.2 : 0;
      dom.vignette.style.opacity = String(clamp(Math.max(sim.hurtT * 1.2, lowPulse), 0, 1));
    }
    if (dom.fade && sim.phase === 'dead') dom.fade.style.opacity = String(clamp(sim.deathT / 3, 0, 1));
    else if (dom.fade && sim.phase !== 'boarding' && !sim.sleep) dom.fade.style.opacity = '0';

    science.animate(sim.t, dt);
    world.render();
  }
  const mStore = new THREE.Matrix4();

  // ---------------------------------------------------------------- minimap + HUD snapshot
  function minimapInfo() {
    mmCount++;
    const items = [];
    for (const s of shelters) items.push({ x: s.x, z: s.z, kind: 'shelter' });
    for (const d of DEVICES) {
      const x = d.id === 'rover' ? rv.x : d.x;
      const z = d.id === 'rover' ? rv.z : d.z;
      items.push({ x, z, kind: sim.devices[d.id].done ? 'done' : 'device' });
    }
    for (const p of world.planters) items.push({ x: p.x, z: p.z, kind: 'planter' });
    for (const e of world.echoes) if (!sim.echoesSeen[e.def.id]) items.push({ x: e.def.x, z: e.def.z, kind: 'echo' });
    for (const pn of PIONEERS) if (science.state.pioneers[pn.id].state !== 'preserved' && science.state.pioneers[pn.id].state !== 'salvaged') items.push({ x: pn.x, z: pn.z, kind: 'echo' });
    if (!science.state.sherloc.done) items.push({ x: SCIENCE_SITES.sherloc.x, z: SCIENCE_SITES.sherloc.z, kind: 'sci' });
    items.push({ x: SITES.landing.x, z: SITES.landing.z, kind: 'lander' });
    if (world.rescue.group.visible || sim.quest.step === 4) items.push({ x: SITES.rescuePad.x, z: SITES.rescuePad.z, kind: 'rocket' });
    const D = sim.weather.dust;
    return {
      cx: P.x,
      cz: P.z,
      yaw: sim.cam.yaw,
      facing: P.facing,
      range: rv.driving ? 220 : sim.quest.step === 4 ? 140 : 170,
      items,
      objective: sim.phase === 'play' ? sim.objective : null,
      boulders: sim.boulders.filter((b) => b.active),
      wall: D.state !== 'idle' && !sim.weather.storm.active ? { x: D.ox + D.dx * D.s, z: D.oz + D.dz * D.s, dx: D.dx, dz: D.dz, thick: D.thick } : null,
      storm: sim.weather.storm.active ? sim.weather.storm.z : null,
      flare: sim.weather.flare.state !== 'idle',
      quake: sim.weather.quake.state !== 'idle',
      t: sim.t,
    };
  }

  /** Data for the top Compass Ribbon: heading, markers for pioneers, science sites, shelters and the objective. */
  function compassInfo() {
    const markers = science.compassMarkers();
    for (const s of shelters) markers.push({ x: s.x, z: s.z, label: '', color: '#3dff8a', kind: 'shelter', dim: true });
    const o = sim.objective;
    if (o && sim.phase === 'play') markers.push({ x: o.x, z: o.z, label: 'OBJ', color: '#ffcc33', kind: 'objective' });
    return { yaw: sim.cam.yaw, x: P.x, z: P.z, markers, t: sim.t };
  }

  /** Visual beacon data for the Deaf / hard-of-hearing HUD: bearing arc, signal strength, live Morse caption. */
  function beaconInfo() {
    const list = sim.beacons || [];
    return list.map((b) => {
      const pn = PIONEERS.find((k) => k.id === b.id);
      const br = bearingTo(P.x, P.z, pn.x, pn.z, sim.cam.yaw);
      return { id: b.id, code: b.code, name: pn.name, dist: b.d, strength: Math.min(1, b.gain / 0.3), rel: br.rel, deg: br.deg, morse: morseStateAt(b.code, sim.t) };
    });
  }

  function windMsNow() {
    return 2 + sim.windAmt * 18;
  }

  function snapshot() {
    const q = sim.quest;
    const st = QUEST_STEPS[q.step - 1];
    const cl = checklist();
    const exp = sim.mode === 'expedition';
    return {
      mode: sim.mode,
      phase: sim.phase,
      step: q.step,
      stepTitle: exp ? 'Rover Rescue & Science Expedition' : st.title,
      headline: exp ? `EXPEDITION · ${cl.filter((c) => c.done).length}/${cl.length}` : `${sim.sandbox ? 'CADET · ' : ''}STEP ${q.step}/4 · ${st.title.toUpperCase()}`,
      science: science.snapshot(),
      insight: sim.insight ? { title: sim.insight.title, text: sim.insight.text, source: sim.insight.source } : null,
      escapade: !!sim.escapade,
      checklist: cl,
      objective: sim.objective ? { label: sim.objective.label } : { label: st.brief },
      vitals: { ...V },
      sol: solNum(),
      clock: clockStr(),
      tempC: sim.tempC ?? -40,
      alt: Math.round(altitude()),
      inShelter: sim.inShelter,
      prompt: sim.phase === 'play' ? sim.prompt : null,
      hazard: sim.phase === 'play' ? sim.hazard : null,
      radio: sim.radio,
      build: sim.build.active
        ? {
            active: true,
            item: sim.build.item,
            ok: sim.build.ok,
            reason: sim.build.reason,
            items: BUILD_ITEMS.map((i) => ({ id: i.id, name: i.name, kits: sim.kits[i.id] === Infinity ? '∞' : sim.kits[i.id] })),
          }
        : null,
      rover: rv.driving ? { driving: true, speed: Math.round(Math.abs(rv.speed) * 3.6), steep: rv.tooSteep > 0 } : null,
      tune: sim.tune ? { active: true, locks: sim.tune.locks, band: sim.tune.band } : null,
      transmit: q.transmitting ? Math.ceil(q.transmitT) : null,
      shield: sim.flags.shield,
      flashlight: sim.flags.flashlight,
      xray: sim.flags.xray,
      hudHidden: sim.flags.hudHidden,
      photo: !!sim.photo,
      toast: sim.toast,
      cinematic: sim.cine?.type === 'landing' ? 'Ares-7 powered descent · Gale Crater' : sim.cine?.type === 'boarding' ? 'Boarding the rescue rocket' : sim.tour ? 'JUDGE QUICK-TOUR' : null,
      codexSeen: sim.codexSeen,
      puzzle: sim.puzzle ? { kind: sim.puzzle.kind, id: sim.puzzle.id, params: sim.puzzle.params, seed: sim.puzzle.seed, auto: sim.puzzle.auto } : null,
      roverEnergy:
        sim.devices.rover.done && (rv.driving || dist2(P.x, P.z, rv.x, rv.z) < 14)
          ? { pct: rv.battery, wh: pctToWh(rv.battery, rv.capMul), drain: rv.drainW, charge: rv.chargeW, dust: rv.panelDust, array: !!rv.array, station: !!rv.station }
          : null,
      climb: { climbing: !!P.climb, grip: V.grip, pitons: sim.climb.pitons, gloveDust: sim.climb.gloveDust, anchored: !!sim.climb.anchor },
      cineSub: sim.cine ? sim.cineSub || null : null,
      cineActive: !!sim.cine,
      dataOverlay:
        sim.flags.dataOverlay || (sim.tour && sim.phase === 'play')
          ? compareToNasa({ tempC: sim.tempC ?? -40, pressurePa: simPressurePa(solFrac(), altitude()), windMs: windMsNow(), uvLabel: uvIndexLabel(world.skyU.sunDir.value.y, sim.dustAmt) })
          : null,
    };
  }

  // ---------------------------------------------------------------- NASA pioneers + Bright Angel (see engine/science.js)
  const science = createScienceGame({ sim, world, V, P, audio, say, log, toast, codex, dist2, camForward, endMission, showInsight, requestPuzzle });

  return { update, render, snapshot, minimapInfo, compassInfo, beaconInfo, onAction, selectBuild, prepareLanding, startAscentMode, puzzleDone, cineLook };
}

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
