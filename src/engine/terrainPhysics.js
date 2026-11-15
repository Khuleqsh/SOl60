// SOL 60: RED HORIZON — deterministic terrain (Gale Crater + Olympus Mons), collision world,
// player / rover / boulder physics and build-placement validation. Pure math, no Three.js.

import { MARS, WORLD, CRATER, MT_SHARP, OLYMPUS, TRAIL, PADS } from '../data/nasaData.js';
import { olympusHeight } from '../data/olympusRoute.js';
import { PIONEERS, SCIENCE_SITES } from '../data/scienceData.js';

// ---------------------------------------------------------------- seeded noise
export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(a) {
  let s = a >>> 0;
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let SEED = 1337;

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(SEED, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

function fbm(x, z, oct) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- trail geometry
const TRAIL_SEG = [];
let TRAIL_LEN = 0;
for (let i = 0; i < TRAIL.length - 1; i++) {
  const [ax, az] = TRAIL[i];
  const [bx, bz] = TRAIL[i + 1];
  const len = Math.hypot(bx - ax, bz - az);
  TRAIL_SEG.push({ ax, az, bx, bz, len, s0: TRAIL_LEN });
  TRAIL_LEN += len;
}
export const TRAIL_LENGTH = TRAIL_LEN;
let trailH0 = 0;
let trailH1 = OLYMPUS.h;
const padHeights = new Array(PADS.length).fill(0);

// Nearest point on the switchback polyline: distance and arc-length.
export function trailInfo(x, z) {
  let best = 1e9;
  let bestS = 0;
  for (let i = 0; i < TRAIL_SEG.length; i++) {
    const g = TRAIL_SEG[i];
    const dx = g.bx - g.ax;
    const dz = g.bz - g.az;
    const t = clamp(((x - g.ax) * dx + (z - g.az) * dz) / (g.len * g.len), 0, 1);
    const px = g.ax + dx * t;
    const pz = g.az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bestS = g.s0 + g.len * t;
    }
  }
  return { d: best, s: bestS };
}

export function trailPointAt(s) {
  const ss = clamp(s, 0, TRAIL_LEN);
  for (const g of TRAIL_SEG) {
    if (ss <= g.s0 + g.len) {
      const t = (ss - g.s0) / g.len;
      return { x: lerp(g.ax, g.bx, t), z: lerp(g.az, g.bz, t) };
    }
  }
  const last = TRAIL[TRAIL.length - 1];
  return { x: last[0], z: last[1] };
}

/** Guidance point `lead` metres up the trail that never cuts a switchback corner. */
export function trailGuidePoint(s, lead = 24) {
  for (const g of TRAIL_SEG) {
    const end = g.s0 + g.len;
    if (s < end - 2.5) return trailPointAt(Math.min(s + lead, end));
  }
  return trailPointAt(TRAIL_LEN);
}

// ---------------------------------------------------------------- height model
// Olympus Mons: terraced cliff bands with spiralling ramp ledges (data/olympusRoute.js).
const mountainHeight = (x, z) => olympusHeight(x, z);

function naturalHeight(x, z) {
  const rm = Math.hypot(x - OLYMPUS.x, z - OLYMPUS.z);
  const mMask = smooth(OLYMPUS.r + 30, OLYMPUS.r - 40, rm);
  const summit = smooth(OLYMPUS.calderaR + 4, OLYMPUS.calderaR - 6, rm);
  let h = fbm(x * 0.0045, z * 0.0045, 3) * 6 + fbm(x * 0.035, z * 0.035, 3) * 1.1;
  h *= 1 - mMask * 0.75;
  h += fbm(x * 0.09 + 31, z * 0.09 - 17, 2) * 0.9 * mMask * (1 - summit);
  // Gale Crater bowl + rim
  const dc = Math.hypot(x - CRATER.x, z - CRATER.z);
  if (dc < CRATER.r) h -= CRATER.depth * (1 - (dc / CRATER.r) ** 2);
  h += CRATER.rim * Math.exp(-(((dc - CRATER.r) / 22) ** 2));
  // Aeolis Mons (Mount Sharp)
  const ds = Math.hypot(x - MT_SHARP.x, z - MT_SHARP.z);
  h += MT_SHARP.h * Math.exp(-((ds / MT_SHARP.r) ** 2));
  // Olympus Mons
  h += mountainHeight(x, z);
  // varied Martian geomorphology: mesas, small impact craters, dunes, an alluvial fan
  h += geomorphology(x, z);
  // World edge ramparts
  const edge = Math.min(x - WORLD.minX, WORLD.maxX - x, z - WORLD.minZ, WORLD.maxZ - z);
  h += smooth(60, 0, edge) * 45;
  return h;
}

// The ramps are part of the mountain model itself, so the guide trail no longer reshapes the ground.
const heightWithTrail = (x, z) => naturalHeight(x, z);

// ---------------------------------------------------------------- geomorphology features
// Fixed, documented landforms (positions in metres). Each is dropped automatically if it would land on a mission
// site, so pads, devices and pioneers always stay on clear ground.
const KEEP_CLEAR = [...PADS.map((p) => ({ x: p.x, z: p.z, r: p.r + 10 })), ...PIONEERS.map((p) => ({ x: p.x, z: p.z, r: 16 })), { x: SCIENCE_SITES.sherloc.x, z: SCIENCE_SITES.sherloc.z, r: 14 }];
const clearOf = (x, z, r) => KEEP_CLEAR.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r) && Math.hypot(x - OLYMPUS.x, z - OLYMPUS.z) > OLYMPUS.r + r + 30;
// Stratified sedimentary mesas (flat tops, steep layered sides), like the buttes of Mount Sharp's lower slopes.
export const MESAS = [
  { x: -380, z: -40, r: 38, h: 22 },
  { x: 430, z: 110, r: 46, h: 26 },
  { x: -430, z: 330, r: 34, h: 18 },
  { x: 340, z: -250, r: 42, h: 30 },
  { x: -340, z: -330, r: 36, h: 24 },
  { x: 250, z: 420, r: 26, h: 14 },
].filter((m) => clearOf(m.x, m.z, m.r + 8));
// Small, fresh impact craters with raised ejecta rims.
export const SMALL_CRATERS = [
  { x: -60, z: 60, r: 14, d: 4 },
  { x: 205, z: 255, r: 10, d: 3 },
  { x: -220, z: 250, r: 18, d: 5 },
  { x: 120, z: 30, r: 9, d: 2.6 },
  { x: -150, z: 400, r: 12, d: 3.4 },
  { x: 300, z: 160, r: 16, d: 4.5 },
  { x: -470, z: 120, r: 22, d: 6 },
  { x: 480, z: -120, r: 20, d: 5.5 },
  { x: -260, z: -150, r: 15, d: 4 },
  { x: 230, z: -110, r: 12, d: 3.2 },
].filter((c) => clearOf(c.x, c.z, c.r * 1.8));
// Dark basaltic dune field (cf. Curiosity's Bagnold Dunes) and an alluvial fan with channels (cf. Peace Vallis).
export const DUNE_FIELD = { x: 190, z: 360, r: 70, dirX: 0.8, dirZ: 0.6, wave: 24, amp: 1.6 };
export const ALLUVIAL_FAN = { x: -170, z: 0, r: 85, apexX: -205, apexZ: -40 };

function geomorphology(x, z) {
  let h = 0;
  for (const m of MESAS) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d > m.r + 14) continue;
    const wob = valueNoise(x * 0.05 + m.x, z * 0.05 + m.z) * 5;
    const k = smooth(m.r + 6 + wob, m.r - 3 + wob, d);
    const layers = Math.floor(k * 4) / 4; // stepped strata on the flanks
    h += m.h * lerp(k, layers + smooth(0, 1, (k * 4) % 1) / 4, 0.55);
  }
  for (const c of SMALL_CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > c.r * 2.4) continue;
    const u = d / c.r;
    if (u < 1) h -= c.d * (1 - u * u);
    h += c.d * 0.32 * Math.exp(-(((d - c.r) / (c.r * 0.35)) ** 2)); // ejecta rim
  }
  const df = DUNE_FIELD;
  const dd = Math.hypot(x - df.x, z - df.z);
  if (dd < df.r + 20 && clearOf(x, z, 0)) {
    const w = smooth(df.r + 20, df.r - 20, dd);
    const ph = ((x * df.dirX + z * df.dirZ) / df.wave + valueNoise(x * 0.02, z * 0.02) * 0.6) % 1;
    const p = ph < 0 ? ph + 1 : ph;
    const crest = p < 0.7 ? p / 0.7 : (1 - p) / 0.3; // gentle stoss slope, steep lee face
    h += df.amp * w * crest * crest;
  }
  const af = ALLUVIAL_FAN;
  const da = Math.hypot(x - af.x, z - af.z);
  if (da < af.r) {
    const w = smooth(af.r, af.r * 0.3, da);
    const ang = Math.atan2(z - af.apexZ, x - af.apexX);
    const ch = Math.abs(Math.sin(ang * 9 + valueNoise(x * 0.03, z * 0.03) * 1.5));
    h += 3.2 * w - 0.9 * w * smooth(0.25, 0, ch); // fan mound cut by radiating channels
  }
  return h;
}

/** Height from the analytic model (ignores the render heightfield). Used to build it, and by tests. */
export function analyticHeight(x, z) {
  let h = heightWithTrail(x, z);
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const dx = x - p.x;
    const dz = z - p.z;
    const lim = p.r + 6;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const d = Math.hypot(dx, dz);
    if (d < lim) h = lerp(h, padHeights[i], 1 - smooth(p.r, lim, d));
  }
  return h;
}

// ---------------------------------------------------------------- render-synchronised heightfield
// The visible terrain is a triangulated grid. Physics must use the SAME triangles, otherwise the player floats over
// or sinks into the mesh wherever the analytic surface and the grid disagree (worst on cliffs). buildHeightfield()
// samples the analytic model once on the render grid(s); from then on every height query interpolates the exact
// triangle the GPU draws. Olympus Mons gets a finer patch so its sheer cliff bands and ramp ledges stay crisp.
let HF = null;

function sampleGrid(g, x, z) {
  let u = (x - g.x0) / g.dx;
  let v = (z - g.z0) / g.dx;
  u = u < 0 ? 0 : u > g.nx - 1e-6 ? g.nx - 1e-6 : u;
  v = v < 0 ? 0 : v > g.nz - 1e-6 ? g.nz - 1e-6 : v;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const W = g.nx + 1;
  const h = g.h;
  const ha = h[j * W + i]; // (i, j)
  const hb = h[(j + 1) * W + i]; // (i, j+1)
  const hc = h[(j + 1) * W + i + 1]; // (i+1, j+1)
  const hd = h[j * W + i + 1]; // (i+1, j)
  // triangles (a, b, d) and (b, c, d), split along the b-d diagonal: identical to the mesh index buffer
  if (fu + fv <= 1) return ha + (hd - ha) * fu + (hb - ha) * fv;
  return hc + (hb - hc) * (1 - fu) + (hd - hc) * (1 - fv);
}

function makeGrid(x0, z0, dx, nx, nz) {
  const W = nx + 1;
  const h = new Float32Array(W * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) h[j * W + i] = analyticHeight(x0 + i * dx, z0 + j * dx);
  return { x0, z0, dx, nx, nz, h };
}

/**
 * Builds the shared render/physics heightfield. `seg` = cells per side of the world grid; `hiFactor` = subdivision
 * of the Olympus Mons patch. Returns { lo, hi } grids ({ x0, z0, dx, nx, nz, h }); hi.cells = lo-grid cell range.
 */
export function buildHeightfield(seg = 210, hiFactor = 3) {
  HF = null;
  const dx = (WORLD.maxX - WORLD.minX) / seg;
  const lo = makeGrid(WORLD.minX, WORLD.minZ, dx, seg, Math.round((WORLD.maxZ - WORLD.minZ) / dx));
  const R = OLYMPUS.r + 24;
  const ci = (v, n) => Math.max(0, Math.min(n, v));
  const i0 = ci(Math.floor((OLYMPUS.x - R - WORLD.minX) / dx), lo.nx);
  const i1 = ci(Math.ceil((OLYMPUS.x + R - WORLD.minX) / dx), lo.nx);
  const j0 = ci(Math.floor((OLYMPUS.z - R - WORLD.minZ) / dx), lo.nz);
  const j1 = ci(Math.ceil((OLYMPUS.z + R - WORLD.minZ) / dx), lo.nz);
  const f = Math.max(1, Math.round(hiFactor));
  const hi = makeGrid(WORLD.minX + i0 * dx, WORLD.minZ + j0 * dx, dx / f, (i1 - i0) * f, (j1 - j0) * f);
  hi.cells = { i0, i1, j0, j1 };
  hi.x1 = hi.x0 + hi.nx * hi.dx;
  hi.z1 = hi.z0 + hi.nz * hi.dx;
  HF = { lo, hi };
  return HF;
}
export const getHeightfield = () => HF;
export const clearHeightfield = () => {
  HF = null;
};

/** Deterministic terrain height: the render heightfield when one is built, else the analytic model. */
export function getTerrainHeight(x, z, seed) {
  if (seed !== undefined && seed !== SEED) setTerrainSeed(seed);
  if (HF) {
    const g = HF.hi;
    if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return sampleGrid(g, x, z);
    return sampleGrid(HF.lo, x, z);
  }
  return analyticHeight(x, z);
}

const _n = { x: 0, y: 1, z: 0 };
/** Unit terrain normal (central differences). Returns a shared object unless `out` is given. */
export function getTerrainNormal(x, z, seed, out) {
  const e = 0.6;
  const hL = getTerrainHeight(x - e, z, seed);
  const hR = getTerrainHeight(x + e, z, seed);
  const hD = getTerrainHeight(x, z - e, seed);
  const hU = getTerrainHeight(x, z + e, seed);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * e;
  const l = Math.hypot(nx, ny, nz);
  const o = out || _n;
  o.x = nx / l;
  o.y = ny / l;
  o.z = nz / l;
  return o;
}

export function setTerrainSeed(seed) {
  SEED = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  HF = null; // a new seed invalidates the render heightfield; createWorld rebuilds it
  trailH0 = naturalHeight(TRAIL[0][0], TRAIL[0][1]);
  const last = TRAIL[TRAIL.length - 1];
  trailH1 = naturalHeight(last[0], last[1]);
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const a = p.anchor || [p.x, p.z];
    padHeights[i] = heightWithTrail(a[0], a[1]);
  }
  return SEED;
}
export const getTerrainSeed = () => SEED;
setTerrainSeed(SEED);

export function olympusAltitude(x, z) {
  return Math.max(0, getTerrainHeight(x, z) - trailH0);
}

// ---------------------------------------------------------------- collision world
export class CollisionWorld {
  constructor(cell = 16) {
    this.cell = cell;
    this.grid = new Map();
    this.dynamic = [];
    this._out = [];
  }
  _key(ix, iz) {
    return ix * 73856093 + iz * 19349663;
  }
  addStatic(c) {
    const cs = this.cell;
    const x0 = Math.floor((c.x - c.r) / cs);
    const x1 = Math.floor((c.x + c.r) / cs);
    const z0 = Math.floor((c.z - c.r) / cs);
    const z1 = Math.floor((c.z + c.r) / cs);
    c._cells = [];
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
        c._cells.push(k);
      }
    return c;
  }
  removeStatic(c) {
    if (!c._cells) return;
    for (const k of c._cells) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    c._cells = null;
  }
  addDynamic(c) {
    this.dynamic.push(c);
    return c;
  }
  /** Colliders near (x, z) within radius. Returned array is reused. */
  query(x, z, radius) {
    const out = this._out;
    out.length = 0;
    const cs = this.cell;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const z0 = Math.floor((z - radius) / cs);
    const z1 = Math.floor((z + radius) / cs);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.grid.get(this._key(ix, iz));
        if (!arr) continue;
        for (const c of arr) if (out.indexOf(c) < 0) out.push(c);
      }
    for (const c of this.dynamic) if (c.active !== false) out.push(c);
    return out;
  }
  overlaps(x, z, r, margin = 0, ignore = null) {
    const list = this.query(x, z, r + 8);
    for (const c of list) {
      if (c === ignore || c.active === false) continue;
      if (Math.hypot(c.x - x, c.z - z) < c.r + r + margin) return c;
    }
    return null;
  }
  /** Push a circle out of all colliders (sliding). Returns true if any contact happened. */
  resolve(pos, r, ignore = null) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const list = this.query(pos.x, pos.z, r + 6);
      let moved = false;
      for (const c of list) {
        if (c === ignore || c.active === false) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const min = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const push = min - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }
}

// ---------------------------------------------------------------- player physics
export const PLAYER_RADIUS = 0.45;
export const WALK_SPEED = 3.4;
export const SPRINT_SPEED = 6.4;
export const JUMP_SPEED = 4.6; // apex ~2.8 m in Mars' 0.38 g
export const MAX_CLIMB = 1.05; // walkable rise/run; steeper is a rock face
export const STEP_UP = 0.32; // small ledges are stepped onto regardless of slope
export const CLIMB_SPEED = 1.25; // m/s on a rock face
export const CLIMB_MIN_WALL = 1.2; // a face must rise this far within 1.6 m to be grabbed
const MAX_SUBSTEP = 0.18;
const PROBE = 0.6; // slope probe length (m) // swept movement: never move more than this per collision pass

function clampToWorld(p, margin = 4) {
  p.x = clamp(p.x, WORLD.minX + margin, WORLD.maxX - margin);
  p.z = clamp(p.z, WORLD.minZ + margin, WORLD.maxZ - margin);
}

/** How far the ground rises `ahead` metres along (dx, dz) relative to height y. */
export function wallRise(x, z, y, dx, dz, ahead = 0.7) {
  return getTerrainHeight(x + dx * ahead, z + dz * ahead) - y;
}

/**
 * Advance the player one tick. `input`: { mx, mz } world-space direction (length 0..1), sprint, jump (edge),
 * grip (0..100, from the suit), letGo, climb (allow grabbing faces). Mutates p; returns a reused events object.
 */
const _ev = { jumped: false, landed: false, landSpeed: 0, blocked: false, hit: false, climbStart: false, mantled: false, slipped: false, leap: false };
const _pos = { x: 0, z: 0 };
export function stepPlayer(p, input, dt, world) {
  const ev = _ev;
  ev.jumped = ev.landed = ev.blocked = ev.hit = ev.climbStart = ev.mantled = ev.slipped = ev.leap = false;
  ev.landSpeed = 0;
  if (p.climb) return stepClimb(p, input, dt, world, ev);

  const target = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  const tx = input.mx * target * (p.speedMul || 1);
  const tz = input.mz * target * (p.speedMul || 1);
  const accel = p.grounded ? 14 : 2.6;
  const k = Math.min(1, accel * dt);
  p.vx += (tx - p.vx) * k;
  p.vz += (tz - p.vz) * k;
  if (p.pushX || p.pushZ) {
    p.vx += p.pushX * dt;
    p.vz += p.pushZ * dt;
  }

  // jump: short crouch anticipation, then launch
  if (input.jump && p.grounded && p.anticip <= 0 && p.landT <= 0.05) p.anticip = 0.14;
  if (p.anticip > 0) {
    p.anticip -= dt;
    if (p.anticip <= 0) {
      p.anticip = 0;
      p.vy = JUMP_SPEED;
      p.grounded = false;
      p.y += 0.05;
      ev.jumped = true;
    }
  }
  if (p.landT > 0) p.landT -= dt;

  // swept horizontal move: substeps so fast motion can never tunnel through a rock or a cliff edge
  const total = Math.hypot(p.vx * dt, p.vz * dt);
  const n = Math.max(1, Math.ceil(total / MAX_SUBSTEP));
  const sdx = (p.vx * dt) / n;
  const sdz = (p.vz * dt) / n;
  for (let s = 0; s < n; s++) {
    const gOld = getTerrainHeight(p.x, p.z);
    let nx = p.x + sdx;
    let nz = p.z + sdz;
    // rock faces: measure the slope over a fixed probe ahead (not per substep, which would let tiny steps creep up
    // any cliff); refuse anything steeper than MAX_CLIMB unless it is a small ledge, and slide along the face
    if (p.grounded || p.y - gOld < 0.6) {
      const step = Math.hypot(nx - p.x, nz - p.z);
      if (step > 1e-5) {
        const base = Math.max(gOld, p.y - 0.05);
        const steepAlong = (ux, uz) => {
          const l = Math.hypot(ux, uz);
          if (l < 1e-6) return false;
          const rise = getTerrainHeight(p.x + (ux / l) * PROBE, p.z + (uz / l) * PROBE) - base;
          return rise > STEP_UP && rise / PROBE > MAX_CLIMB;
        };
        if (steepAlong(nx - p.x, nz - p.z)) {
          const okX = Math.abs(nx - p.x) > 1e-5 && !steepAlong(nx - p.x, 0);
          const okZ = Math.abs(nz - p.z) > 1e-5 && !steepAlong(0, nz - p.z);
          if (okX && !okZ) {
            nz = p.z;
            p.vz = 0;
          } else if (okZ && !okX) {
            nx = p.x;
            p.vx = 0;
          } else {
            nx = p.x;
            nz = p.z;
            p.vx *= -0.1;
            p.vz *= -0.1;
          }
          ev.blocked = true;
        }
      }
    }
    _pos.x = nx;
    _pos.z = nz;
    if (world && world.resolve(_pos, PLAYER_RADIUS)) ev.hit = true;
    clampToWorld(_pos);
    p.x = _pos.x;
    p.z = _pos.z;
  }

  const g = getTerrainHeight(p.x, p.z);
  if (!p.grounded) p.vy -= MARS.g * dt;
  p.y += p.vy * dt;
  if (p.y <= g) {
    if (!p.grounded) {
      ev.landed = true;
      ev.landSpeed = -p.vy;
      p.landT = clamp(0.12 + -p.vy * 0.03, 0.12, 0.4);
    }
    p.y = g;
    p.vy = 0;
    p.grounded = true;
  } else if (p.grounded) {
    // stay glued when walking downhill (incl. small ledges); fall off real drops
    if (p.y - g < 0.55 && p.vy <= 0) p.y = g;
    else p.grounded = false;
  }
  // too steep to stand: slide down the fall line
  if (p.grounded) {
    const nrm = getTerrainNormal(p.x, p.z);
    if (nrm.y < 0.62) {
      p.vx += nrm.x * MARS.g * 2.2 * dt;
      p.vz += nrm.z * MARS.g * 2.2 * dt;
    }
  }

  // grab a rock face: keep pushing into a tall wall for a moment (Peak-style), if the suit has grip left
  const ml = Math.hypot(input.mx, input.mz);
  if (ev.blocked && p.grounded && input.climb !== false && ml > 0.5 && (input.grip ?? 100) > 5) {
    const dx = input.mx / ml;
    const dz = input.mz / ml;
    if (wallRise(p.x, p.z, p.y, dx, dz, 1.6) >= CLIMB_MIN_WALL) {
      p.climbPush = (p.climbPush || 0) + dt;
      if (p.climbPush > 0.22) startClimb(p, dx, dz, ev);
    } else p.climbPush = 0;
  } else p.climbPush = 0;
  p.alt = p.y - getTerrainHeight(p.x, p.z);
  return ev;
}

export function startClimb(p, dx, dz, ev) {
  p.climb = { dx, dz, t: 0 };
  p.grounded = false;
  p.vx = p.vz = p.vy = 0;
  p.climbPush = 0;
  if (ev) ev.climbStart = true;
}

const _cn = { x: 0, y: 1, z: 0 };
/** Climbing a rock face: forward = up, back = down, strafe = traverse; Space leaps off; out of grip = slip. */
function stepClimb(p, input, dt, world, ev) {
  const c = p.climb;
  c.t += dt;
  if (input.letGo || !((input.grip ?? 100) > 0)) {
    p.climb = null;
    p.grounded = false;
    p.vx = -c.dx * 0.8;
    p.vz = -c.dz * 0.8;
    p.vy = 0;
    ev.slipped = !((input.grip ?? 100) > 0);
    return ev;
  }
  const tx = -c.dz;
  const tz = c.dx;
  if (input.jump && c.t > 0.25) {
    // low-gravity calculated leap: push off the wall, steered by the strafe input
    const lat = input.mx * tx + input.mz * tz;
    p.climb = null;
    p.grounded = false;
    p.vy = JUMP_SPEED * 1.05;
    p.vx = -c.dx * 2.4 + tx * lat * 3.2;
    p.vz = -c.dz * 2.4 + tz * lat * 3.2;
    ev.jumped = ev.leap = true;
    return ev;
  }
  const up = input.mx * c.dx + input.mz * c.dz;
  const lat = input.mx * tx + input.mz * tz;
  p.vy = up * CLIMB_SPEED;
  p.y += p.vy * dt;
  _pos.x = p.x + tx * lat * CLIMB_SPEED * 0.75 * dt;
  _pos.z = p.z + tz * lat * CLIMB_SPEED * 0.75 * dt;
  if (world && world.resolve(_pos, PLAYER_RADIUS * 0.8)) ev.hit = true;
  clampToWorld(_pos);
  p.x = _pos.x;
  p.z = _pos.z;
  // follow the face: re-aim the wall direction uphill along the terrain gradient just ahead
  getTerrainNormal(p.x + c.dx * 0.6, p.z + c.dz * 0.6, undefined, _cn);
  const hl = Math.hypot(_cn.x, _cn.z);
  if (hl > 0.35) {
    const wx = -_cn.x / hl;
    const wz = -_cn.z / hl;
    c.dx += (wx - c.dx) * Math.min(1, dt * 4);
    c.dz += (wz - c.dz) * Math.min(1, dt * 4);
    const l = Math.hypot(c.dx, c.dz) || 1;
    c.dx /= l;
    c.dz /= l;
  }
  // hug the wall: never inside the rock, never drifting away from it
  for (let i = 0; i < 12 && getTerrainHeight(p.x, p.z) > p.y + 0.05; i++) {
    p.x -= c.dx * 0.05;
    p.z -= c.dz * 0.05;
  }
  for (let i = 0; i < 6 && wallRise(p.x, p.z, p.y, c.dx, c.dz, 0.5) < -0.25; i++) {
    p.x += c.dx * 0.05;
    p.z += c.dz * 0.05;
  }
  const g = getTerrainHeight(p.x, p.z);
  // top of the face: mantle onto the ledge
  if (c.t > 0.4 && p.y - g > 0.6 && wallRise(p.x, p.z, p.y, c.dx, c.dz, 0.8) <= 0.35 && up >= 0) {
    p.x += c.dx * 0.9;
    p.z += c.dz * 0.9;
    p.y = getTerrainHeight(p.x, p.z);
    p.climb = null;
    p.grounded = true;
    p.vx = p.vy = p.vz = 0;
    ev.mantled = true;
  } else if (p.y <= g + 0.02) {
    // climbed back down to the foot of the face
    p.y = g;
    p.climb = null;
    p.grounded = true;
    p.vy = 0;
  }
  p.alt = p.y - getTerrainHeight(p.x, p.z);
  return ev;
}

// ---------------------------------------------------------------- rover physics
export const ROVER_RADIUS = 2.0;
export function stepRover(rv, input, dt, world) {
  const fwd = (input.throttle || 0) * (rv.boost || 1);
  const maxF = 9.5;
  const maxB = 3.5;
  if (fwd !== 0) rv.speed += fwd * 4.2 * dt;
  else rv.speed *= Math.max(0, 1 - 1.6 * dt);
  rv.speed = clamp(rv.speed, -maxB, maxF);
  const steerTarget = (input.steer || 0) * 0.55;
  rv.steer += (steerTarget - rv.steer) * Math.min(1, 6 * dt);
  rv.yaw += (rv.speed / 2.4) * Math.tan(rv.steer) * dt;

  const sx = Math.sin(rv.yaw);
  const sz = Math.cos(rv.yaw);
  let nx = rv.x + sx * rv.speed * dt;
  let nz = rv.z + sz * rv.speed * dt;
  const hC = getTerrainHeight(rv.x, rv.z);
  const dir = Math.sign(rv.speed) || 1;
  const hA = getTerrainHeight(rv.x + sx * 2.2 * dir, rv.z + sz * 2.2 * dir);
  if ((hA - hC) / 2.2 > 0.55 && Math.abs(rv.speed) > 0.05) {
    rv.speed *= 0.2;
    nx = rv.x;
    nz = rv.z;
    rv.tooSteep = 1;
  } else rv.tooSteep = Math.max(0, (rv.tooSteep || 0) - dt);
  const pos = { x: nx, z: nz };
  if (world && world.resolve(pos, ROVER_RADIUS, rv.collider)) rv.speed *= 0.6;
  clampToWorld(pos, 8);
  rv.x = pos.x;
  rv.z = pos.z;
  if (rv.collider) {
    rv.collider.x = rv.x;
    rv.collider.z = rv.z;
  }
  const L = 1.5;
  const W = 1.1;
  const hf = getTerrainHeight(rv.x + sx * L, rv.z + sz * L);
  const hb = getTerrainHeight(rv.x - sx * L, rv.z - sz * L);
  const hl = getTerrainHeight(rv.x + sz * W, rv.z - sx * W);
  const hr = getTerrainHeight(rv.x - sz * W, rv.z + sx * W);
  rv.y = (hf + hb + hl + hr) * 0.25;
  rv.pitch = Math.atan2(hb - hf, 2 * L);
  rv.roll = Math.atan2(hl - hr, 2 * W);
  // gravity along slope
  rv.speed += Math.sin(rv.pitch) * MARS.g * dt * 0.6;
  rv.wheelRot += (rv.speed / 0.42) * dt;
}

// ---------------------------------------------------------------- boulders
const _bn = { x: 0, y: 1, z: 0 };
export function stepBoulders(list, dt, world) {
  for (const b of list) {
    if (!b.active) continue;
    b.life -= dt;
    if (b.loose > 0) continue; // still wedged on the cliff lip (the game releases it)
    b.vy -= MARS.g * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    const g = getTerrainHeight(b.x, b.z);
    if (b.y - b.r < g) {
      b.y = g + b.r;
      const n = getTerrainNormal(b.x, b.z, undefined, _bn);
      const vn = b.vx * n.x + b.vy * n.y + b.vz * n.z;
      if (vn < 0) {
        const e = 1.35;
        b.vx -= e * vn * n.x;
        b.vy -= e * vn * n.y;
        b.vz -= e * vn * n.z;
        if (-vn > 3) b.bounced = true;
      }
      // downhill roll + friction
      b.vx += n.x * MARS.g * 1.4 * dt;
      b.vz += n.z * MARS.g * 1.4 * dt;
      const f = Math.max(0, 1 - 0.35 * dt);
      b.vx *= f;
      b.vz *= f;
    }
    if (world) {
      const pos = { x: b.x, z: b.z };
      if (world.resolve(pos, b.r * 0.9)) {
        b.vx = (pos.x - b.x) / Math.max(dt, 1e-3) * 0.5 + b.vx * -0.3;
        b.vz = (pos.z - b.z) / Math.max(dt, 1e-3) * 0.5 + b.vz * -0.3;
        b.x = pos.x;
        b.z = pos.z;
      }
    }
    const sp = Math.hypot(b.vx, b.vz);
    b.rot += (sp / b.r) * dt;
    b.slowT = sp < 0.4 ? (b.slowT || 0) + dt : 0;
    if (b.life <= 0 || b.slowT > 2.5 || b.x < WORLD.minX || b.x > WORLD.maxX || b.z < WORLD.minZ || b.z > WORLD.maxZ) b.active = false;
  }
}

// ---------------------------------------------------------------- placement & shelter tests
const _pn = { x: 0, y: 1, z: 0 };
export function checkPlacement(x, z, radius, world, extraBlockers = []) {
  if (x < WORLD.minX + 70 || x > WORLD.maxX - 70 || z < WORLD.minZ + 70 || z > WORLD.maxZ - 70)
    return { ok: false, reason: 'Outside survey zone' };
  const h0 = getTerrainHeight(x, z);
  let hMin = h0;
  let hMax = h0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = getTerrainHeight(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  if (hMax - hMin > 0.55 + radius * 0.06) return { ok: false, reason: 'Ground too uneven' };
  const n = getTerrainNormal(x, z, undefined, _pn);
  if (n.y < 0.95) return { ok: false, reason: 'Slope too steep' };
  if (world && world.overlaps(x, z, radius, 0.4)) return { ok: false, reason: 'Blocked by rock or structure' };
  for (const b of extraBlockers) {
    if (Math.hypot(b.x - x, b.z - z) < b.r + radius) return { ok: false, reason: b.reason || 'Blocked' };
  }
  return { ok: true, reason: 'Clear, flat ground' };
}

export function findShelter(x, z, shelters) {
  for (const s of shelters) {
    if (Math.hypot(x - s.x, z - s.z) < s.r - 0.9) return s;
  }
  return null;
}

/** True if a rock ridge or large boulder shields (x, y, z) from wind blowing along (wx, wz). */
export function inLee(x, y, z, wx, wz, world) {
  for (const d of [3, 6, 10, 15, 22]) {
    const h = getTerrainHeight(x - wx * d, z - wz * d);
    if (h > y + 2.2) return true;
  }
  if (world) {
    const list = world.query(x - wx * 4, z - wz * 4, 6);
    for (const c of list) {
      if (c.r < 1.3 || c.tag !== 'rock') continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const along = -(dx * wx + dz * wz);
      const across = Math.abs(dx * wz - dz * wx);
      if (along > 0 && along < c.r + 4 && across < c.r) return true;
    }
  }
  return false;
}

export { clamp, smooth, lerp };
