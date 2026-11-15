// SOL 60 — Olympus Mons playable model (pure data + math, no Three.js).
//
// The real volcano (MOLA): ~21.9 km above the Mars datum, ~624 km across, ringed by a basal escarpment up to ~8 km
// high, summit caldera ~80 x 60 km. The playable mountain is a COMPRESSED model of that structure:
//   1. a sheer basal scarp,
//   2. N terraced basaltic lava benches separated by sheer cliff bands,
//   3. a summit plateau with a shallow caldera pit and the rescue pad.
// Every cliff band has exactly ONE ramp ledge, and successive ramps are offset around the circumference, so the
// route cannot go straight up one face: it spirals around the mountain. Cliffs can also be climbed directly
// (grip / stamina, pitons) as the risky shortcut.

export const OLYMPUS = {
  x: 0,
  z: -460,
  r: 250, // footprint radius (m)
  h: 262, // summit plateau above the plains (m). Real: ~21,900 m above datum
  scarpH: 40, // basal escarpment (m). Real: up to ~8,000 m
  scarpR: 240,
  tiers: 6, // lava benches above the scarp
  calderaR: 30,
  calderaDepth: 9,
  cliffW: 2.6, // horizontal width of a sheer cliff band (m)
  rampGrade: 0.42, // rise / run along a ramp ledge (~23 deg)
  rampHalfWidth: 4.2,
  traverse: 1.05, // radians walked along each bench between ramps
  firstRampAngle: Math.PI / 2 + 0.12, // ramp 0 starts on the south face, facing Gale Crater
};

const TAU = Math.PI * 2;
export const wrapPi = (a) => {
  let d = (a + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
};
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Cliff bands from the outside in: { k, R, low, high, w, start, span } (start/span in radians, CCW). */
export function buildCliffs(o = OLYMPUS) {
  const cliffs = [];
  const inner = o.calderaR + 22;
  const dr = (o.scarpR - inner) / o.tiers;
  const stepH = (o.h - o.scarpH) / o.tiers;
  let start = o.firstRampAngle;
  for (let k = 0; k <= o.tiers; k++) {
    const R = o.scarpR - k * dr;
    const low = k === 0 ? 0 : o.scarpH + (k - 1) * stepH;
    const high = k === 0 ? o.scarpH : o.scarpH + k * stepH;
    const span = (high - low) / o.rampGrade / R;
    cliffs.push({ k, R, low, high, w: k === 0 ? o.cliffW * 1.6 : o.cliffW, start, span });
    start += span + o.traverse;
  }
  return { cliffs, dr, stepH, inner };
}

export const ROUTE = buildCliffs();

/** Height of the mountain model at (x, z) above the surrounding plains (0 outside the footprint). */
export function olympusHeight(x, z, o = OLYMPUS, route = ROUTE) {
  const dx = x - o.x;
  const dz = z - o.z;
  const r = Math.hypot(dx, dz);
  if (r > o.r + 4) return 0;
  const phi = Math.atan2(dz, dx);
  let h = 0;
  for (const c of route.cliffs) h += (c.high - c.low) * smooth(c.R + c.w / 2, c.R - c.w / 2, r);
  // talus apron at the scarp foot
  h += 3.5 * smooth(o.r + 4, o.scarpR + 2, r);
  // ramp ledges: replace one band's step with a graded ledge along the circumference
  for (const c of route.cliffs) {
    const dR = Math.abs(r - c.R);
    if (dR > o.rampHalfWidth + 2) continue;
    const u = wrapPi(phi - c.start - c.span / 2) / c.span + 0.5;
    if (u < -0.08 || u > 1.08) continue;
    const wr = 1 - smooth(o.rampHalfWidth - 1.2, o.rampHalfWidth + 1.2, dR);
    const wa = smooth(-0.07, 0, u) * smooth(1.07, 1, u);
    const rampH = c.low + (c.high - c.low) * Math.min(1, Math.max(0, u));
    const bandStep = (c.high - c.low) * smooth(c.R + c.w / 2, c.R - c.w / 2, r);
    const target = h - bandStep + (rampH - c.low);
    h += (target - h) * wr * wa;
  }
  h -= o.calderaDepth * smooth(o.calderaR, o.calderaR - 17, r); // ~0.8 max grade: walkable
  return h;
}

const polar = (r, phi, o = OLYMPUS) => [o.x + Math.cos(phi) * r, o.z + Math.sin(phi) * r];

/** Guide route [x, z][]: approach -> scarp ramp -> bench traverse -> ramp -> ... -> caldera pad. */
export function buildTrail(o = OLYMPUS, route = ROUTE) {
  const pts = [];
  const { cliffs, dr } = route;
  const c0 = cliffs[0];
  pts.push(polar(c0.R + 34, c0.start + 0.02, o));
  pts.push(polar(c0.R + 10, c0.start + 0.02, o));
  for (let k = 0; k < cliffs.length; k++) {
    const c = cliffs[k];
    const n = Math.max(3, Math.ceil((c.span * c.R) / 14));
    // stay strictly inside the ledge (u in [0.02, 0.98]) so the route never clips the cliff band beside it
    for (let i = 0; i <= n; i++) pts.push(polar(c.R, c.start + c.span * (0.02 + (0.96 * i) / n), o));
    const next = cliffs[k + 1];
    if (!next) break;
    const rBench = c.R - Math.min(9, dr * 0.3);
    const a0 = c.start + c.span * 0.98;
    const a1 = next.start + next.span * 0.02;
    pts.push(polar(rBench, a0, o));
    const m = Math.max(2, Math.ceil(((a1 - a0) * rBench) / 18));
    for (let i = 1; i < m; i++) pts.push(polar(rBench, a0 + ((a1 - a0) * i) / m, o));
    pts.push(polar(next.R + 6, a1, o));
  }
  const last = cliffs[cliffs.length - 1];
  pts.push(polar(last.R - 10, last.start + last.span * 0.98, o));
  pts.push([o.x, o.z]);
  return pts.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
}

/** Ledge shelter on bench k: inner half of the bench, beside the traverse, door facing outward (world angle). */
export function ledgeShelter(k, o = OLYMPUS, route = ROUTE) {
  const c = route.cliffs[k];
  const next = route.cliffs[k + 1];
  const mid = c.start + c.span + (next.start - c.start - c.span) * 0.5;
  const [x, z] = polar(next.R + 11.5, mid, o);
  return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, door: mid, bench: k };
}
