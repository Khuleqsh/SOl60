// SOL 60 — tactile, science-grounded mini-puzzles (pure state + rules; the UI lives in ui/PuzzleOverlay.jsx).
// Each is solvable in ~15–45 s with mouse, trackpad or touch. All use a seeded RNG for repeatable tests.

import { mulberry32 } from '../engine/terrainPhysics.js';

// ---------------------------------------------------------------- 1. Signal triangulation (two dishes)
// Two dish dials (0..1 frequency offset) must sit on the beacon's carrier. Signal = product of two Gaussians.
export function createTriangulation(seed = 1, tol = 0.05) {
  const r = mulberry32(seed);
  return { type: 'triangulation', a: 0.1 + r() * 0.15, b: 0.85 - r() * 0.15, ta: 0.25 + r() * 0.5, tb: 0.25 + r() * 0.5, tol, hold: 0 };
}
export const triangulationSignal = (s) => Math.exp(-(((s.a - s.ta) / (s.tol * 1.6)) ** 2)) * Math.exp(-(((s.b - s.tb) / (s.tol * 1.6)) ** 2));
export const triangulationSolved = (s) => Math.abs(s.a - s.ta) <= s.tol && Math.abs(s.b - s.tb) <= s.tol;

// ---------------------------------------------------------------- 2. Power routing (rotate conduit tiles)
// Tiles carry connections N=1 E=2 S=4 W=8. Power enters the left edge of the source row and must exit the right
// edge of the sink row. "Hot" tiles are overloaded RTG relays: routing current through one trips the breaker.
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const rot = (m) => ((m << 1) | (m >> 3)) & 15;
export const rotateMask = (m, times = 1) => {
  let x = m;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) x = rot(x);
  return x;
};
const DIRS = [
  [N, 0, -1, S],
  [E, 1, 0, W],
  [S, 0, 1, N],
  [W, -1, 0, E],
];

export function createPowerGrid(seed = 1, size = 4) {
  const r = mulberry32(seed);
  const srcRow = Math.floor(r() * size);
  const sinkRow = Math.floor(r() * size);
  // carve a monotone path left -> right
  const path = [];
  let x = 0;
  let y = srcRow;
  path.push([x, y]);
  while (x < size - 1 || y !== sinkRow) {
    const canRight = x < size - 1;
    const needV = y !== sinkRow;
    if (needV && (!canRight || r() < 0.45)) y += Math.sign(sinkRow - y);
    else x += 1;
    path.push([x, y]);
  }
  const masks = Array.from({ length: size * size }, () => 0);
  const onPath = new Set(path.map(([px, py]) => py * size + px));
  path.forEach(([px, py], i) => {
    let m = 0;
    const prev = i === 0 ? [px - 1, py] : path[i - 1];
    const next = i === path.length - 1 ? [px + 1, py] : path[i + 1];
    for (const [nx, ny] of [prev, next]) for (const [bit, dx, dy] of DIRS) if (px + dx === nx && py + dy === ny) m |= bit;
    masks[py * size + px] = m;
  });
  // decoys: straight or corner pieces; a few are overloaded ("hot")
  const hot = [];
  for (let i = 0; i < size * size; i++) {
    if (onPath.has(i)) continue;
    masks[i] = r() < 0.5 ? N | S : N | E;
    if (r() < 0.35) hot.push(i);
  }
  const solution = masks.slice();
  const tiles = masks.map((m, i) => {
    const turns = 1 + Math.floor(r() * 3);
    return { mask: rotateMask(m, turns), hot: hot.includes(i) };
  });
  return { type: 'power', size, srcRow, sinkRow, tiles, solution, maxAmps: 3 };
}

export function rotateTile(s, i) {
  s.tiles[i].mask = rotateMask(s.tiles[i].mask, 1);
  return s;
}

/** Walks the current from the source; returns { lit:Set, reached, overload }. */
export function tracePower(s) {
  const { size } = s;
  const lit = new Set();
  let overload = false;
  let reached = false;
  const start = s.srcRow * size;
  if (!(s.tiles[start].mask & W)) return { lit, reached, overload };
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (lit.has(i)) continue;
    lit.add(i);
    if (s.tiles[i].hot) overload = true;
    const x = i % size;
    const y = Math.floor(i / size);
    const m = s.tiles[i].mask;
    if (x === size - 1 && y === s.sinkRow && m & E) reached = true;
    for (const [bit, dx, dy, back] of DIRS) {
      if (!(m & bit)) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      if (s.tiles[j].mask & back) stack.push(j);
    }
  }
  return { lit, reached, overload };
}
export const powerSolved = (s) => {
  const t = tracePower(s);
  return t.reached && !t.overload;
};

// ---------------------------------------------------------------- 3. Spectroscopy sample match (CRISM / SHERLOC)
// Near-infrared absorption bands (µm) used to identify minerals from orbit and on the ground.
export const MINERALS = [
  { id: 'smectite', name: 'Fe/Mg smectite clay (hydrated)', bands: [1.41, 1.91, 2.3], meaning: 'Formed in long-lived liquid water: a habitable-environment marker.' },
  { id: 'gypsum', name: 'Gypsum (hydrated calcium sulfate)', bands: [1.45, 1.75, 1.94], meaning: 'Precipitates when salty water evaporates, as in drying lakes.' },
  { id: 'hematite', name: 'Hematite (iron oxide)', bands: [0.53, 0.86], meaning: 'Opportunity’s “blueberries”: concretions grown in groundwater.' },
];
export function createSpectro(seed = 1, tol = 0.05, mineralId) {
  const r = mulberry32(seed);
  const mineral = MINERALS.find((m) => m.id === mineralId) || MINERALS[Math.floor(r() * MINERALS.length)];
  return { type: 'spectro', mineral, tol, sliders: mineral.bands.map(() => 0.5 + r() * 1.8) };
}
export const spectroSolved = (s) => s.sliders.every((v, i) => Math.abs(v - s.mineral.bands[i]) <= s.tol);
/** Reflectance spectrum for drawing: 1 minus Gaussian dips at the true bands (what the instrument sees). */
export function spectrum(mineral, lambda) {
  let v = 1;
  for (const b of mineral.bands) v -= 0.45 * Math.exp(-(((lambda - b) / 0.035) ** 2));
  return v;
}

// ---------------------------------------------------------------- 4. Airlock pressure / thermal valve balancing
// Bring the airlock from Mars ambient (~0.7 kPa) to habitat pressure (NASA exploration atmosphere ~56.5 kPa) using a
// fast and a slow supply valve and a vent, without overshooting the 62 kPa relief limit. Hold within ±1.5 kPa for 2 s.
export const HAB_KPA = 56.5;
export const MARS_KPA = 0.7;
export const RELIEF_KPA = 62;
export function createValves() {
  return { type: 'valves', p: MARS_KPA, fast: 0, slow: 0, vent: 0, hold: 0, trips: 0, tempC: -60 };
}
/** Integrate the airlock pressure for dt seconds. Returns the state (mutated). */
export function stepValves(s, dt) {
  const supply = 101 - s.p; // pressure head from the habitat tanks
  const dp = (s.fast * 0.9 + s.slow * 0.22) * supply * 0.12 - s.vent * (s.p - MARS_KPA) * 0.35;
  s.p = Math.max(MARS_KPA, s.p + dp * dt);
  s.tempC += ((s.p / HAB_KPA) * 80 - 60 - s.tempC) * Math.min(1, dt * 0.5);
  if (s.p > RELIEF_KPA) {
    // relief valve blows: chamber dumps back toward Mars ambient
    s.p = MARS_KPA + 4;
    s.trips++;
    s.hold = 0;
  }
  s.hold = Math.abs(s.p - HAB_KPA) <= 1.5 ? s.hold + dt : 0;
  return s;
}
export const valvesSolved = (s) => s.hold >= 2;

// ---------------------------------------------------------------- 5. Solar array orientation (rover recharge)
// Point a portable array at the Sun: azimuth + tilt. Output = cosine of the misalignment.
export function createSolarAim(sunAz, sunElevRad) {
  return { type: 'solar', az: sunAz + Math.PI * 0.75, tilt: 0.15, sunAz, sunTilt: Math.PI / 2 - sunElevRad, hold: 0 };
}
export function solarOutput(s) {
  const n = [Math.sin(s.tilt) * Math.sin(s.az), Math.cos(s.tilt), -Math.sin(s.tilt) * Math.cos(s.az)];
  const d = [Math.sin(s.sunTilt) * Math.sin(s.sunAz), Math.cos(s.sunTilt), -Math.sin(s.sunTilt) * Math.cos(s.sunAz)];
  return Math.max(0, n[0] * d[0] + n[1] * d[1] + n[2] * d[2]);
}
export const solarSolved = (s) => solarOutput(s) >= 0.96;

/** Generic: is this puzzle state solved? */
export function isSolved(s) {
  if (!s) return false;
  if (s.type === 'triangulation') return triangulationSolved(s);
  if (s.type === 'power') return powerSolved(s);
  if (s.type === 'spectro') return spectroSolved(s);
  if (s.type === 'valves') return valvesSolved(s);
  if (s.type === 'solar') return solarSolved(s);
  return false;
}

/** Applies the reference solution (used by the Judge Path autopilot to demonstrate a solve). */
export function autoSolveStep(s, dt) {
  const k = Math.min(1, dt * 2.2);
  if (s.type === 'triangulation') {
    s.a += (s.ta - s.a) * k;
    s.b += (s.tb - s.b) * k;
  } else if (s.type === 'spectro') {
    s.sliders = s.sliders.map((v, i) => v + (s.mineral.bands[i] - v) * k);
  } else if (s.type === 'power') {
    const i = s.tiles.findIndex((t, j) => t.mask !== s.solution[j] && !t.hot && s.solution[j]);
    if (i >= 0) rotateTile(s, i);
  } else if (s.type === 'valves') {
    s.fast = s.p < HAB_KPA - 12 ? 1 : 0;
    s.slow = s.p < HAB_KPA - 0.6 ? 1 : 0;
    s.vent = s.p > HAB_KPA + 0.8 ? 0.6 : 0;
    stepValves(s, dt);
  } else if (s.type === 'solar') {
    s.az += (s.sunAz - s.az) * k;
    s.tilt += (s.sunTilt - s.tilt) * k;
  }
  return s;
}
