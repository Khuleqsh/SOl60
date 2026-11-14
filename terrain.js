// Procedural Gale Crater: heightmap, the four NASA data layers, and route geometry.
// Pure functions shared by the tactical map (Stage 2) and the surface (Stage 3).

import { HARDWARE, CRATERS, LZ, SUMMIT, ENCOUNTER_RADIUS, KM_PER_UNIT, LAYERS, COSPAR_ZONE } from './data.js';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, x) => sm(clamp01((x - a) / (b - a)));

function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = sm(x - ix);
  const fz = sm(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x, z, oct = 4, seed = 0) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, z * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function ridged(x, z, oct = 3, seed = 0) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(2 * vnoise(x * f, z * f, seed + i * 31) - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

const MOUND = { x: SUMMIT.x, z: SUMMIT.z, sigma: 17, h: 17 };

function moundBase(x, z) {
  const dx = x - MOUND.x;
  const dz = z - MOUND.z;
  const d2 = dx * dx * 0.85 + dz * dz * 1.1 + dx * dz * 0.3;
  return Math.exp(-d2 / (2 * MOUND.sigma * MOUND.sigma));
}

// Bagnold-style dark dune belt wrapping the foot of the mound.
function duneField(x, z) {
  const d = Math.hypot(x - MOUND.x, z - MOUND.z);
  const ring = Math.exp(-((d - 30) * (d - 30)) / 30);
  if (ring < 0.01) return 0;
  return ring * smoothstep(0.4, 0.58, fbm(x * 0.07, z * 0.07, 2, 55));
}

function heightRaw(x, z) {
  let h = (fbm(x * 0.03, z * 0.03, 4, 11) - 0.5) * 6;
  h += (fbm(x * 0.11, z * 0.11, 3, 23) - 0.5) * 1.3;

  // Aeolis Mons: a layered sedimentary mound, terraced by differential erosion.
  const m = moundBase(x, z);
  let mh = MOUND.h * m;
  mh += (ridged(x * 0.07, z * 0.07, 3, 37) - 0.5) * 3.2 * smoothstep(0.08, 0.6, m);
  const step = 1.7;
  const q = Math.floor(mh / step);
  const f = mh / step - q;
  const terr = (q + smoothstep(0.35, 0.9, f)) * step;
  h += lerp(mh, terr, 0.5 * smoothstep(0.1, 0.4, m));

  // Crater rim wall behind the landing zone.
  const rim = Math.max(smoothstep(44, 62, -x), smoothstep(44, 62, z));
  h += 9 * smoothstep(44, 62, -x) + 9 * smoothstep(44, 62, z);
  if (rim > 0) h += (ridged(x * 0.09, z * 0.09, 2, 61) - 0.5) * 3 * rim;

  // Small impact craters on the floor.
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1.8) {
      if (d < 1) h -= c.depth * (1 - d * d);
      h += c.depth * 0.38 * Math.exp(-((d - 1) * (d - 1)) / 0.035);
    }
  }

  const dm = duneField(x, z);
  if (dm > 0.01) h += Math.sin(x * 1.1 + z * 0.55 + fbm(x * 0.1, z * 0.1, 2, 77) * 6) * 0.45 * dm;
  return h;
}

// Level pads so the lander and the legacy hardware sit on believable ground.
const PADS = [
  { x: LZ.x, z: LZ.z, r0: 2.5, r1: 8 },
  ...HARDWARE.map((h) => ({ x: h.pos.x, z: h.pos.z, r0: 1.4, r1: 4.5 })),
];
for (const p of PADS) p.h = heightRaw(p.x, p.z);

export function heightAt(x, z) {
  let h = heightRaw(x, z);
  for (const p of PADS) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.abs(dx) > p.r1 || Math.abs(dz) > p.r1) continue;
    const w = 1 - smoothstep(p.r0, p.r1, Math.hypot(dx, dz));
    if (w > 0) h = lerp(h, p.h, w);
  }
  return h;
}

export function slopeAt(x, z) {
  const e = 0.5;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

const OPP = HARDWARE.find((h) => h.id === 'opportunity').pos;
const SPIRIT = HARDWARE.find((h) => h.id === 'spirit').pos;

function radN(x, z, h) {
  const alt = Math.pow(clamp01((h + 2) / 21), 1.15) * 0.8;
  const hot = 0.4 * smoothstep(0.56, 0.72, fbm(x * 0.05 + 9.1, z * 0.05 - 4.3, 3, 71));
  return clamp01(alt + hot);
}

function freezeN(x, z, h) {
  let v = 0.65 * duneField(x, z);
  v += 0.7 * smoothstep(0.54, 0.7, fbm(x * 0.045 - 2.2, z * 0.045 + 7.7, 3, 91));
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1) v += 0.5 * (1 - d);
  }
  // The soft sulfate sands of "Troy" that trapped Spirit.
  v += 0.75 * Math.exp(-((x - SPIRIT.x) ** 2 + (z - SPIRIT.z) ** 2) / 98);
  v += 0.25 * clamp01((h - 8) / 10);
  return clamp01(v);
}

function tauN(x, z) {
  const c = fbm(x * 0.028 + 5.5, z * 0.028 - 3.1, 3, 131);
  const band = sm(clamp01(1 - Math.abs(c - 0.5) / 0.045));
  // The corridor that buried Opportunity.
  const opp = Math.exp(-((x - OPP.x) ** 2 + (z - OPP.z) ** 2) / 128);
  return clamp01(Math.max(band * 0.9, opp * 0.85));
}

// CRISM: phyllosilicate and sulfate units form bands on the lower mound and crater floors.
function crismN(x, z, h) {
  const m = moundBase(x, z);
  const clayBand = Math.exp(-((m - 0.35) * (m - 0.35)) / 0.012) * 0.85;
  let v = clayBand * smoothstep(0.42, 0.62, fbm(x * 0.06 + 3.3, z * 0.06 - 1.7, 3, 151));
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1.2) v += 0.55 * (1 - d / 1.2);
  }
  v += 0.25 * smoothstep(0.62, 0.78, fbm(x * 0.09, z * 0.09, 2, 171));
  return clamp01(v - 0.05 * clamp01((h - 12) / 6));
}

// SHARAD: shallow radar reflectors (buried ice) under low-thermal-inertia plains.
function sharadN(x, z) {
  let v = smoothstep(0.55, 0.72, fbm(x * 0.035 - 6.1, z * 0.035 + 2.9, 3, 191));
  const dz = Math.hypot(x - COSPAR_ZONE.x, z - COSPAR_ZONE.z) / COSPAR_ZONE.r;
  if (dz < 1.4) v += 0.9 * (1 - dz / 1.4);
  return clamp01(v);
}

export function inCospar(x, z) {
  return Math.hypot(x - COSPAR_ZONE.x, z - COSPAR_ZONE.z) <= COSPAR_ZONE.r;
}

export function layersAt(x, z) {
  const h = heightAt(x, z);
  const g = slopeAt(x, z);
  return {
    h,
    grade: g,
    slope: clamp01(g / 0.85),
    rad: radN(x, z, h),
    freeze: freezeN(x, z, h),
    tau: tauN(x, z),
    crism: crismN(x, z, h),
    sharad: sharadN(x, z),
  };
}

// ---------- colour ----------

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

const RAMPS = Object.fromEntries(LAYERS.map((l) => [l.id, l.stops.map(hexToLinear)]));

export function rampColor(layerId, v) {
  const stops = RAMPS[layerId];
  const t = clamp01(v) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

const C_DARK = hexToLinear('#7a3f22');
const C_LIGHT = hexToLinear('#c98556');
const C_STRATA_A = hexToLinear('#8c5a3c');
const C_STRATA_B = hexToLinear('#d9ab7c');
const C_DUNE = hexToLinear('#3d2b27');

export function naturalColor(x, z, h, slope) {
  const n = fbm(x * 0.2, z * 0.2, 3, 301);
  const c = [lerp(C_DARK[0], C_LIGHT[0], n), lerp(C_DARK[1], C_LIGHT[1], n), lerp(C_DARK[2], C_LIGHT[2], n)];
  const m = moundBase(x, z);
  if (m > 0.12) {
    const band = 0.5 + 0.5 * Math.sin(h * 3.2 + n * 3);
    const w = smoothstep(0.12, 0.4, m) * 0.7;
    for (let i = 0; i < 3; i++) c[i] = lerp(c[i], lerp(C_STRATA_A[i], C_STRATA_B[i], band), w);
  }
  const dm = duneField(x, z) * 0.75;
  if (dm > 0) for (let i = 0; i < 3; i++) c[i] = lerp(c[i], C_DUNE[i], dm);
  const shade = 1 - slope * 0.45;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}

// ---------- route ----------

function distToSeg(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1e-9;
  const u = clamp01(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2);
  const cx = a.x + abx * u;
  const cz = a.z + abz * u;
  return { d: Math.hypot(p.x - cx, p.z - cz), u, cx, cz };
}

const STANDOFF = 1.2;
export const ROUTE_SAMPLES = 240;

export function buildRoute(waypoints) {
  const base = [LZ, ...waypoints, SUMMIT];
  const perSeg = base.slice(0, -1).map(() => []);
  for (const hw of HARDWARE) {
    let best = null;
    for (let i = 0; i < base.length - 1; i++) {
      const r = distToSeg(hw.pos, base[i], base[i + 1]);
      if (!best || r.d < best.d) best = { ...r, i };
    }
    if (best && best.d <= ENCOUNTER_RADIUS) perSeg[best.i].push({ hw, ...best });
  }

  const nodes = [{ x: LZ.x, z: LZ.z, kind: 'lz' }];
  for (let i = 0; i < base.length - 1; i++) {
    perSeg[i].sort((a, b) => a.u - b.u);
    for (const e of perSeg[i]) {
      let dx = e.cx - e.hw.pos.x;
      let dz = e.cz - e.hw.pos.z;
      let d = Math.hypot(dx, dz);
      if (d < 0.05) {
        // Path runs straight over the site: stand off perpendicular to it.
        dx = -(base[i + 1].z - base[i].z);
        dz = base[i + 1].x - base[i].x;
        d = Math.hypot(dx, dz) || 1;
      }
      nodes.push({
        x: e.hw.pos.x + (dx / d) * STANDOFF,
        z: e.hw.pos.z + (dz / d) * STANDOFF,
        kind: 'hw',
        id: e.hw.id,
      });
    }
    const b = base[i + 1];
    nodes.push({ x: b.x, z: b.z, kind: i + 1 === base.length - 1 ? 'summit' : 'wp', index: i + 1 });
  }

  const cum = [0];
  for (let i = 1; i < nodes.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].z - nodes[i - 1].z));
  }
  const length = cum[cum.length - 1] || 1;
  const route = { waypoints: waypoints.map((w) => ({ ...w })), nodes, cum, length };

  route.encounters = [];
  nodes.forEach((n, i) => {
    if (n.kind === 'hw') route.encounters.push({ id: n.id, t: cum[i] / length });
  });

  route.samples = [];
  for (let i = 0; i <= ROUTE_SAMPLES; i++) {
    const t = i / ROUTE_SAMPLES;
    const p = routePoint(route, t);
    route.samples.push({ t, x: p.x, z: p.z, ...layersAt(p.x, p.z) });
  }

  route.craters = [];
  for (const c of CRATERS) {
    let best = null;
    for (const s of route.samples) {
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (!best || d < best.d) best = { d, t: s.t };
    }
    if (best.d <= c.r * 1.05) route.craters.push({ id: c.id, t: Math.min(best.t, 0.985) });
  }

  route.camps = [];
  for (let k = 1; k <= 5; k++) {
    const p = routePoint(route, k / 6);
    route.camps.push({ sol: k, x: p.x, z: p.z, ...layersAt(p.x, p.z) });
  }

  route.cospar = route.samples.some((p) => inCospar(p.x, p.z));
  route.crismAvg = route.samples.reduce((a, p) => a + p.crism, 0) / route.samples.length;
  route.sharadMax = route.samples.reduce((a, p) => Math.max(a, p.sharad), 0);
  route.iceT = (() => {
    const hit = route.samples.find((p) => p.sharad > 0.6);
    return hit ? Math.min(0.97, hit.t) : null;
  })();
  route.km = length * KM_PER_UNIT;
  route.pace = Math.max(0.85, Math.min(1.9, length / 105));
  return route;
}

export function routePoint(route, t) {
  const { nodes, cum, length } = route;
  const d = clamp01(t) * length;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = nodes[i - 1];
  const b = nodes[i];
  const seg = cum[i] - cum[i - 1] || 1e-9;
  const u = clamp01((d - cum[i - 1]) / seg);
  return { x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), hx: b.x - a.x, hz: b.z - a.z };
}

const riskLabel = (v) => (v < 0.3 ? 'LOW' : v < 0.55 ? 'MODERATE' : v < 0.8 ? 'HIGH' : 'EXTREME');

export function assessRoute(route, has, vehicle) {
  const S = route.samples;
  const avg = (k) => S.reduce((a, s) => a + s[k], 0) / S.length;
  const max = (k) => S.reduce((a, s) => Math.max(a, s[k]), 0);
  const avgSlope = avg('slope');
  const maxSlope = max('slope');
  const avgRad = avg('rad');
  const avgTau = avg('tau');
  const campFreeze = route.camps.reduce((a, c) => a + c.freeze, 0) / route.camps.length;
  const coldCamps = route.camps.filter((c) => c.freeze > 0.45);
  const steepFrac = S.filter((s) => s.slope > 0.5).length / S.length;

  const slopeRaw = clamp01(avgSlope * 1.9 + steepFrac * 1.2 + (route.pace - 1) * 0.5);
  const radRaw = clamp01(0.4 + avgRad * 1.1);
  const thermRaw = clamp01(0.5 + campFreeze * 0.7 + (vehicle.thermalDrift < 0 ? 0.15 : 0));
  const tauRaw = clamp01(0.45 + avgTau * 1.1);

  const hazards = [
    {
      id: 'slope',
      name: 'Terrain & Slope',
      raw: slopeRaw,
      value: slopeRaw * (has.lidar ? 0.5 : 1),
      note: has.lidar ? 'Hazard LiDAR halves drain' : 'No LiDAR: full power / O2 drain',
      mitigated: !!has.lidar,
      detail: `max grade ${Math.round((Math.atan(maxSlope * 0.85) * 180) / Math.PI)}°`,
    },
    {
      id: 'rad',
      name: 'Radiation',
      raw: radRaw,
      value: radRaw * (has.shield ? 0.25 : 1),
      note: has.shield ? 'Poly shielding: -75% dose' : 'Unshielded against particle events',
      mitigated: !!has.shield,
      detail: `${Math.round(avgRad * 100)}% of route in elevated flux`,
    },
    {
      id: 'thermal',
      name: 'Night Freeze',
      raw: thermRaw,
      value: thermRaw * (has.aerogel ? 0.25 : 1) * (has.rtg ? 0.55 : 1),
      note: has.aerogel
        ? 'Aerogel liner rated to -85 °C'
        : has.rtg
          ? 'MMRTG waste heat: +15 °C'
          : 'Suit rated to only -60 °C',
      mitigated: !!(has.aerogel || has.rtg),
      detail: `${coldCamps.length} of 5 camps in freeze zones`,
    },
    {
      id: 'tau',
      name: 'Dust Storm',
      raw: tauRaw,
      value: tauRaw * (has.rtg ? 0.35 : 1) * (has.brush ? 0.8 : 1),
      note: has.rtg
        ? 'MMRTG is immune to opacity'
        : has.solar
          ? 'Solar-only: 55 W falls to 2 W'
          : 'No generation: battery only',
      mitigated: !!has.rtg,
      detail: `${Math.round(avgTau * 100)}% of route in storm corridors`,
    },
  ].map((h) => ({ ...h, label: riskLabel(h.value) }));

  const worst = hazards.reduce((a, h) => Math.max(a, h.value), 0);
  return {
    hazards,
    cospar: route.cospar,
    crism: route.crismAvg,
    sharad: route.sharadMax,
    km: route.km,
    pace: route.pace,
    hardware: route.encounters.map((e) => e.id),
    craters: route.craters.map((c) => c.id),
    coldCamps: coldCamps.map((c) => c.sol),
    overall: worst < 0.4 ? 'NOMINAL' : worst < 0.7 ? 'MARGINAL' : 'CRITICAL',
  };
}
