// SOL 60 — logic, data-integrity and boot smoke tests (Vitest, Node environment).
import { describe, it, expect, beforeAll } from 'vitest';

import { SOURCES, ALL_SOURCE_URLS, CODEX_SOURCE, codexSource, GALE_TO_OLYMPUS_KM, scaleFacts, MOLA_PROFILES, ENVIRONMENT, compareToNasa, SCALE_NOTICE } from '../src/data/nasaDatasets.js';
import { CODEX, CITATIONS, CRATER, OLYMPUS, MT_SHARP, TRAIL, SHELTERS, SITES, GAME_MODES, DEFAULT_CUSTOM, MARS } from '../src/data/nasaData.js';
import { LOADOUT_ITEMS, BUDGET_LIMIT, MASS_LIMIT, loadoutEffects, sanitizeLoadout, canAfford, loadoutTotals } from '../src/data/scienceData.js';
import { ROUTE, olympusHeight } from '../src/data/olympusRoute.js';
import { getTerrainHeight, analyticHeight, buildHeightfield, clearHeightfield, getHeightfield, stepPlayer, setTerrainSeed, CollisionWorld } from '../src/engine/terrainPhysics.js';
import { gripRate, placePiton, tryArrest, ROPE_LENGTH } from '../src/logic/climbing.js';
import { roverDrain, roverSolar, stepRoverBattery, arrayAlignment } from '../src/logic/roverEnergy.js';
import * as PZ from '../src/logic/puzzles.js';
import { morseSequence, morseStateAt, toMorse, bearingTo } from '../src/logic/morse.js';
import { createQuest, advance, checklist, STEPS } from '../src/logic/questMachine.js';
import { detectWebGL } from '../src/logic/webgl.js';
import { makeSim } from '../src/engine/game.js';

// ---------------------------------------------------------------- NASA dataset integrity
describe('NASA datasets & citations', () => {
  it('every source URL is HTTPS and well formed', () => {
    expect(ALL_SOURCE_URLS.length).toBeGreaterThan(10);
    for (const u of ALL_SOURCE_URLS) {
      expect(u.startsWith('https://')).toBe(true);
      expect(() => new URL(u)).not.toThrow();
    }
  });
  it('every Codex entry resolves to an HTTPS source', () => {
    for (const c of CODEX) {
      const s = codexSource(c);
      expect(s.url, c.id).toMatch(/^https:\/\//);
      if (CODEX_SOURCE[c.id]) expect(SOURCES[CODEX_SOURCE[c.id]], c.id).toBeTruthy();
    }
  });
  it('every citation has text and an HTTPS URL', () => {
    expect(CITATIONS.length).toBeGreaterThan(10);
    for (const c of CITATIONS) {
      expect(c.text.length).toBeGreaterThan(20);
      expect(c.url).toMatch(/^https:\/\//);
    }
  });
  it('real-world scale facts are honest and computed from the game layout', () => {
    expect(GALE_TO_OLYMPUS_KM).toBeGreaterThan(5000);
    expect(GALE_TO_OLYMPUS_KM).toBeLessThan(5600);
    const rows = scaleFacts({ CRATER, OLYMPUS, MT_SHARP });
    expect(rows.find((r) => r.label === 'Olympus Mons height').real).toContain('21.9 km');
    expect(rows.find((r) => r.label === 'Gale Crater diameter').real).toContain('154 km');
    for (const r of rows) expect(r.factor).toBeGreaterThan(10);
    expect(SCALE_NOTICE).toMatch(/Not to Scale/);
  });
  it('MOLA profiles and environment references are inside published ranges', () => {
    expect(Math.max(...MOLA_PROFILES.olympus.points.map((p) => p.elevKm))).toBeCloseTo(21.2, 1);
    expect(ENVIRONMENT.gravity.value).toBeCloseTo(3.72, 2);
    expect(MARS.g).toBeCloseTo(ENVIRONMENT.gravity.value, 2);
    expect(ENVIRONMENT.airTempC.min).toBeLessThanOrEqual(-75);
    const rows = compareToNasa({ tempC: -40, pressurePa: 750, windMs: 5, uvLabel: 'High' });
    expect(rows.every((r) => r.ok && r.source.url.startsWith('https://'))).toBe(true);
  });
});

// ---------------------------------------------------------------- terrain, Olympus Mons, collision
describe('Olympus Mons route & render-synchronised collision', () => {
  beforeAll(() => {
    setTerrainSeed(1337);
    buildHeightfield(210, 3);
  });
  it('mountain is a tall terraced model with offset ramps (spiral route)', () => {
    expect(OLYMPUS.h).toBeGreaterThan(200);
    expect(ROUTE.cliffs.length).toBe(OLYMPUS.tiers + 1);
    for (let i = 1; i < ROUTE.cliffs.length; i++) expect(ROUTE.cliffs[i].start).toBeGreaterThan(ROUTE.cliffs[i - 1].start + ROUTE.cliffs[i - 1].span);
    expect(olympusHeight(OLYMPUS.x, OLYMPUS.z + 40)).toBeGreaterThan(OLYMPUS.h - 1); // plateau (+ talus apron)
  });
  it('the guide trail is walkable end to end (max grade below the climb limit)', () => {
    let mx = 0;
    for (let i = 1; i < TRAIL.length; i++) {
      const [ax, az] = TRAIL[i - 1];
      const [bx, bz] = TRAIL[i];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
      for (let j = 1; j <= n; j++) {
        const x0 = ax + ((bx - ax) * (j - 1)) / n;
        const z0 = az + ((bz - az) * (j - 1)) / n;
        const x1 = ax + ((bx - ax) * j) / n;
        const z1 = az + ((bz - az) * j) / n;
        mx = Math.max(mx, Math.abs(getTerrainHeight(x1, z1) - getTerrainHeight(x0, z0)) / Math.hypot(x1 - x0, z1 - z0));
      }
    }
    expect(mx).toBeLessThan(1.05);
  });
  it('physics height equals the rendered mesh vertices exactly', () => {
    const { hi, lo } = getHeightfield();
    for (const g of [hi, lo]) {
      for (let k = 0; k < 500; k++) {
        const i = (k * 37) % g.nx;
        const j = (k * 91) % g.nz;
        expect(getTerrainHeight(g.x0 + i * g.dx, g.z0 + j * g.dx)).toBeCloseTo(g.h[j * (g.nx + 1) + i], 6);
      }
    }
  });
  it('walking straight at a cliff band is blocked; pushing in grabs the face and climbs it without clipping', () => {
    const c = ROUTE.cliffs[3];
    const phi = c.start + c.span + 0.7;
    const r = c.R + 6;
    const dx = -Math.cos(phi);
    const dz = -Math.sin(phi);
    const mk = () => {
      const p = { x: OLYMPUS.x + Math.cos(phi) * r, z: OLYMPUS.z + Math.sin(phi) * r, vx: 0, vy: 0, vz: 0, grounded: true, anticip: 0, landT: 0 };
      p.y = getTerrainHeight(p.x, p.z);
      return p;
    };
    const walker = mk();
    const y0 = walker.y;
    for (let i = 0; i < 600; i++) stepPlayer(walker, { mx: dx, mz: dz, climb: false }, 1 / 60, null);
    expect(walker.y - y0).toBeLessThan(3);
    const climber = mk();
    let maxPen = 0;
    for (let i = 0; i < 60 * 60 && climber.y < y0 + (c.high - c.low) - 1; i++) {
      stepPlayer(climber, { mx: dx, mz: dz, grip: 100 }, 1 / 60, null);
      if (climber.climb) maxPen = Math.max(maxPen, getTerrainHeight(climber.x, climber.z) - climber.y);
    }
    expect(climber.y - y0).toBeGreaterThan(c.high - c.low - 2);
    expect(maxPen).toBeLessThan(0.1);
  });
  it('fast movement never tunnels through a rock collider', () => {
    clearHeightfield();
    const world = new CollisionWorld(16);
    world.addStatic({ x: 30, z: 300, r: 0.6, tag: 'rock' });
    const p = { x: 25, z: 300, y: 0, vx: 0, vy: 0, vz: 0, grounded: true, anticip: 0, landT: 0 };
    p.y = getTerrainHeight(p.x, p.z);
    for (let i = 0; i < 120; i++) stepPlayer(p, { mx: 1, mz: 0, sprint: true }, 1 / 20, world);
    expect(p.x).toBeLessThan(30);
    buildHeightfield(210, 3);
  });
  it('ledge shelters sit on Olympus benches', () => {
    for (const id of ['hab-c', 'hab-d']) {
      const s = SHELTERS.find((h) => h.id === id);
      expect(getTerrainHeight(s.x, s.z)).toBeGreaterThan(OLYMPUS.scarpH);
    }
  });
});

// ---------------------------------------------------------------- climbing rules
describe('climbing: grip, pitons, rope arrest', () => {
  it('grip drains while climbing (worse with dusty gloves) and recovers on the ground', () => {
    expect(gripRate({ climbing: true })).toBeLessThan(0);
    expect(gripRate({ climbing: true, gloveDust: 1 })).toBeLessThan(gripRate({ climbing: true, gloveDust: 0 }));
    expect(gripRate({ climbing: false })).toBeGreaterThan(0);
  });
  it('pitons are limited and catch a fall below the anchor', () => {
    const st = { pitons: 1 };
    const p = { x: 0, y: 100, z: 0, climb: { dx: 0, dz: -1 } };
    expect(placePiton(st, p)).toBeTruthy();
    expect(placePiton(st, p)).toBeNull();
    const faller = { x: 0.5, y: 100 - ROPE_LENGTH - 1, z: 0, vx: 0, vy: -8, vz: 0, grounded: false, climb: null };
    expect(tryArrest(faller, st.anchor, () => 0)).toBe(true);
    expect(faller.climb).toBeTruthy();
    expect(faller.vy).toBe(0);
  });
});

// ---------------------------------------------------------------- bunker loadout
describe('bunker loadout budget', () => {
  it('the player cannot afford every item', () => {
    const all = LOADOUT_ITEMS.map((i) => i.id);
    expect(loadoutTotals(all).cost).toBeGreaterThan(BUDGET_LIMIT * 1.8);
    expect(sanitizeLoadout(all).length).toBeLessThan(all.length);
    const t = loadoutTotals(sanitizeLoadout(all));
    expect(t.cost).toBeLessThanOrEqual(BUDGET_LIMIT);
    expect(t.mass).toBeLessThanOrEqual(MASS_LIMIT);
  });
  it('every item solves a stated problem and changes at least one gameplay effect', () => {
    const base = loadoutEffects([]);
    for (const it of LOADOUT_ITEMS) {
      expect(it.solves.length).toBeGreaterThan(10);
      const fx = loadoutEffects([it.id]);
      const changed = Object.keys(base).some((k) => k !== 'totals' && JSON.stringify(fx[k]) !== JSON.stringify(base[k]));
      expect(changed, it.id).toBe(true);
    }
  });
  it('the default loadout is affordable and canAfford enforces limits', () => {
    expect(sanitizeLoadout(DEFAULT_CUSTOM.loadout)).toEqual(DEFAULT_CUSTOM.loadout);
    expect(canAfford(DEFAULT_CUSTOM.loadout, 'mmrtg')).toBe(false);
    expect(canAfford([], 'mmrtg')).toBe(true);
  });
});

// ---------------------------------------------------------------- rover energy
describe('rover energy economy', () => {
  it('driving drains, uphill drains more, cold costs heater power', () => {
    expect(roverDrain({ speed: 8 })).toBeGreaterThan(roverDrain({ speed: 0 }));
    expect(roverDrain({ speed: 8, grade: 0.3 })).toBeGreaterThan(roverDrain({ speed: 8, grade: 0 }));
    expect(roverDrain({ speed: 0, tempC: -80 })).toBeGreaterThan(roverDrain({ speed: 0, tempC: 0 }));
  });
  it('solar: none at night, dust hurts, an aligned array charges far faster', () => {
    expect(roverSolar({ sunElev: -0.2 })).toBe(0);
    expect(roverSolar({ sunElev: 0.8, panelDust: 0.9 })).toBeLessThan(roverSolar({ sunElev: 0.8 }));
    expect(roverSolar({ sunElev: 0.8, arrayAlign: 1 })).toBeGreaterThan(roverSolar({ sunElev: 0.8 }) * 5);
    expect(arrayAlignment(0, 0, { x: 0, y: 1, z: 0 })).toBeCloseTo(1, 5);
  });
  it('a full-speed drive empties the battery; a station recharges it', () => {
    const st = { pct: 100 };
    for (let i = 0; i < 400; i++) stepRoverBattery(st, { driving: true, speed: 9.5, sunElev: 0 }, 0.5);
    expect(st.pct).toBe(0);
    for (let i = 0; i < 40; i++) stepRoverBattery(st, { driving: false, station: true, sunElev: 0 }, 0.5);
    expect(st.pct).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------- puzzles
describe('environmental puzzles', () => {
  it('triangulation, spectroscopy and solar aiming start unsolved and auto-solve', () => {
    for (const s of [PZ.createTriangulation(3), PZ.createSpectro(5), PZ.createSolarAim(1.2, 0.6)]) {
      expect(PZ.isSolved(s)).toBe(false);
      for (let i = 0; i < 300; i++) PZ.autoSolveStep(s, 1 / 30);
      expect(PZ.isSolved(s), s.type).toBe(true);
    }
  });
  it('power routing: scrambled grid is solvable by rotation and overloads are detected', () => {
    for (let seed = 1; seed < 20; seed++) {
      const g = PZ.createPowerGrid(seed);
      g.tiles.forEach((t, i) => {
        t.mask = g.solution[i];
      });
      expect(PZ.powerSolved(g), `seed ${seed}`).toBe(true);
    }
    const g = PZ.createPowerGrid(7);
    for (let i = 0; i < 64; i++) PZ.autoSolveStep(g, 0.1);
    expect(PZ.powerSolved(g)).toBe(true);
  });
  it('airlock valves: overshooting trips the relief valve; careful balancing holds', () => {
    const s = PZ.createValves();
    s.fast = 1;
    for (let i = 0; i < 600; i++) PZ.stepValves(s, 0.05);
    expect(s.trips).toBeGreaterThan(0);
    const t = PZ.createValves();
    for (let i = 0; i < 1200 && !PZ.valvesSolved(t); i++) PZ.autoSolveStep(t, 0.05);
    expect(PZ.valvesSolved(t)).toBe(true);
  });
  it('mineral bands match published CRISM values', () => {
    expect(PZ.MINERALS.find((m) => m.id === 'smectite').bands).toEqual([1.41, 1.91, 2.3]);
  });
});

// ---------------------------------------------------------------- Morse captions
describe('Morse beacon captions', () => {
  it('encodes callsigns and decodes progressively over a cycle', () => {
    expect(toMorse('OPPY')).toBe('--- .--. .--. -.--');
    const seq = morseSequence('SOS');
    expect(seq.filter((s) => s.on).length).toBe(9);
    const st = morseStateAt('OPPY', 0.01);
    expect(st.on).toBe(true);
    expect(st.current).toBe('O');
    const late = morseStateAt('OPPY', st.cycle - 0.01);
    expect(late.decoded).toBe('OPPY');
  });
  it('bearing is clockwise from north (-Z)', () => {
    expect(bearingTo(0, 0, 0, -10).deg).toBeCloseTo(0, 5);
    expect(bearingTo(0, 0, 10, 0).deg).toBeCloseTo(90, 5);
  });
});

// ---------------------------------------------------------------- quests & stage boot
describe('quest state machine', () => {
  it('progresses life support -> power -> transmit -> ascent', () => {
    const q = createQuest('campaign');
    const dev = { sub1: { done: false }, sub2: { done: false }, weather: { done: false }, rover: { done: false }, relay: { done: false } };
    expect(advance(q, dev)).toEqual([]);
    Object.assign(q, { flag: true, shelter: true, farm: true });
    expect(advance(q, dev)).toContain('lifeSupportDone');
    expect(q.step).toBe(STEPS.POWER);
    dev.sub1.done = dev.sub2.done = dev.weather.done = true;
    advance(q, dev);
    expect(q.step).toBe(STEPS.TRANSMIT);
    q.transmitting = true;
    q.transmitT = 1;
    expect(advance(q, dev, 2)).toContain('earthReplied');
    expect(q.step).toBe(STEPS.ASCENT);
    expect(checklist(q, dev).length).toBeGreaterThan(2);
  });
});

describe('stage boot smoke tests', () => {
  it('every game mode builds a valid simulation state', () => {
    const modes = ['campaign', 'ascent', 'expedition', 'sandbox', 'tour'];
    for (const m of modes) {
      const sim = makeSim(m, DEFAULT_CUSTOM, 42);
      expect(sim.mode).toBe(m);
      expect(Number.isFinite(sim.player.y)).toBe(true);
      expect(sim.vitals.o2Cap).toBeGreaterThan(0);
      expect(sim.vitals.grip).toBe(100);
      expect(sim.rover.battery).toBeGreaterThan(0);
    }
    expect(GAME_MODES.length).toBeGreaterThanOrEqual(3);
    expect(SITES.rescuePad).toBeTruthy();
  });
  it('WebGL detection degrades gracefully without a GPU', () => {
    expect(detectWebGL(undefined).ok).toBe(false);
    const fakeDoc = { createElement: () => ({ getContext: () => null }) };
    expect(detectWebGL(fakeDoc).ok).toBe(false);
  });
  it('the UI and stage modules import cleanly (no broken imports)', async () => {
    const mods = await Promise.all([
      import('../src/App.jsx'),
      import('../src/ui/TitleScreen.jsx'),
      import('../src/ui/SettingsModal.jsx'),
      import('../src/ui/Debrief.jsx'),
      import('../src/components/CustomizationModals.jsx'),
      import('../src/stages/GameStage.jsx'),
      import('../src/engine/proceduralWorld.js'),
    ]);
    for (const m of mods) expect(m).toBeTruthy();
  });
});
