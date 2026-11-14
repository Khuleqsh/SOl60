// Procedural composite-geometry models. Nothing is loaded from disk or network.

import * as THREE from 'three';
import { getTextures } from './textures.js';
import { xrayCore } from './engine.js';

const UP = new THREE.Vector3(0, 1, 0);

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const cyl = (rt, rb, h, mat, x, y, z, seg = 18) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
const sph = (r, mat, x, y, z) => mesh(new THREE.SphereGeometry(r, 22, 16), mat, x, y, z);
const cap = (r, len, mat, x, y, z) => mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat, x, y, z);

function strut(a, b, r, mat) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = cyl(r, r, va.distanceTo(vb), mat, 0, 0, 0, 8);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, vb.clone().sub(va).normalize());
  return m;
}

let _m = null;
const _glow = {};
export function M() {
  if (_m) return _m;
  const T = getTextures();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  _m = {
    suit: std({ color: 0xece8df, roughness: 0.82, metalness: 0.02 }),
    suitGrey: std({ color: 0x6b727b, roughness: 0.7, metalness: 0.1 }),
    suitOrange: std({ color: 0xe8622a, roughness: 0.7 }),
    visor: std({ color: 0xffc247, metalness: 1, roughness: 0.14, emissive: 0xb86a08, emissiveIntensity: 0.6 }),
    metal: std({ map: T.metal, roughnessMap: T.metalRough, metalness: 0.85, roughness: 0.7, color: 0xd0d4da }),
    darkMetal: std({ map: T.metal, color: 0x3d434c, metalness: 0.8, roughness: 0.55 }),
    black: std({ color: 0x121418, roughness: 0.6, metalness: 0.3 }),
    rubber: std({ color: 0x1b1b1e, roughness: 0.95 }),
    white: std({ color: 0xf2f2ee, roughness: 0.55 }),
    whiteDS: std({ color: 0xf2f2ee, roughness: 0.5, side: THREE.DoubleSide }),
    foil: std({ map: T.foil, bumpMap: T.foilBump, bumpScale: 1.5, metalness: 0.9, roughness: 0.3, color: 0xffe6ad }),
    solar: std({ map: T.solar, metalness: 0.55, roughness: 0.28, side: THREE.DoubleSide }),
    solarDusty: std({ map: T.solarDusty, metalness: 0.05, roughness: 0.95, side: THREE.DoubleSide }),
    glass: std({ color: 0x0a1420, metalness: 0.9, roughness: 0.08 }),
    carbon: std({ color: 0x18191c, roughness: 0.42, metalness: 0.45 }),
    polyBlue: std({ color: 0x8fb8e6, roughness: 0.45 }),
    aerogel: std({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.5,
      roughness: 0.15,
      emissive: 0x2a7fbf,
      emissiveIntensity: 0.45,
      side: THREE.DoubleSide,
    }),
    red: std({ color: 0xd4202a, roughness: 0.5 }),
    dust: std({ map: T.regolith, bumpMap: T.regolithBump, bumpScale: 2, roughness: 1, color: 0xd9a57c }),
  };
  return _m;
}

export function glow(color, intensity = 2) {
  const key = `${color}_${intensity}`;
  if (!_glow[key]) {
    _glow[key] = new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
    });
  }
  return _glow[key];
}

// ---------------------------------------------------------------- astronaut

export function createAstronaut() {
  const m = M();
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  const torso = cap(0.27, 0.42, m.suit, 0, 1.18, 0);
  torso.scale.set(1.15, 1, 0.86);
  body.add(torso);
  body.add(box(0.5, 0.07, 0.38, m.suitOrange, 0, 0.94, 0)); // hip ring
  body.add(box(0.32, 0.22, 0.1, m.suitGrey, 0, 1.24, 0.25)); // chest display & control module
  body.add(box(0.05, 0.03, 0.02, glow(0x35d6ff, 3), -0.08, 1.29, 0.305));
  body.add(box(0.05, 0.03, 0.02, glow(0x3dff8a, 3), 0, 1.29, 0.305));
  body.add(box(0.05, 0.03, 0.02, glow(0xffb020, 3), 0.08, 1.29, 0.305));
  // PLSS life-support backpack
  body.add(box(0.5, 0.66, 0.26, m.suit, 0, 1.27, -0.31));
  body.add(box(0.52, 0.06, 0.28, m.suitOrange, 0, 1.52, -0.31));
  body.add(box(0.3, 0.3, 0.04, m.suitGrey, 0, 1.2, -0.45));
  body.add(cyl(0.012, 0.012, 0.42, m.darkMetal, 0.2, 1.8, -0.36, 6));
  body.add(sph(0.025, glow(0xff3030, 3), 0.2, 2.02, -0.36));
  // Diegetic telemetry: five emissive segments on the PLSS back plate.
  const barMats = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x3dff8a, emissiveIntensity: 3, roughness: 0.4 });
    barMats.push(mat);
    const seg = box(0.2, 0.04, 0.015, mat, 0, 1.06 + i * 0.07, -0.475);
    seg.castShadow = false;
    seg.userData.noXray = true;
    body.add(seg);
  }
  // Fold-out backpack solar panels that darken with dust.
  const packSolar = m.solar.clone();
  for (const sx of [-1, 1]) {
    const pnl = box(0.22, 0.012, 0.3, packSolar, sx * 0.37, 1.6, -0.33);
    pnl.rotation.z = sx * -0.35;
    body.add(pnl);
  }
  // X-ray internals: twin O2 bottles and the battery pack.
  for (const sx of [-0.12, 0.12]) {
    const tank = xrayCore(0x35d6ff, 0.07, 0.5);
    tank.position.set(sx, 1.27, -0.31);
    body.add(tank);
  }
  const batt = xrayCore(0x3dff8a, 0.06, 0.18);
  batt.position.set(0, 1.27, -0.4);
  batt.rotation.z = Math.PI / 2;
  body.add(batt);
  // helmet
  const head = new THREE.Group();
  head.position.set(0, 1.71, 0);
  body.add(head);
  head.add(sph(0.255, m.suit, 0, 0, 0));
  const visor = sph(0.222, m.visor, 0, 0.005, 0.065);
  visor.scale.set(1, 0.84, 0.9);
  head.add(visor);
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.035, 10, 28), m.suitGrey, 0, -0.2, 0);
  ring.rotation.x = Math.PI / 2;
  head.add(ring);
  head.add(box(0.06, 0.06, 0.08, glow(0xfff2cc, 4), -0.26, 0.06, 0.06));
  head.add(box(0.06, 0.06, 0.08, glow(0xfff2cc, 4), 0.26, 0.06, 0.06));

  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.37 * side, 1.43, 0);
    shoulder.add(sph(0.12, m.suit, 0, 0, 0));
    shoulder.add(cap(0.085, 0.2, m.suit, 0, -0.18, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.35, 0);
    elbow.add(sph(0.088, m.suitOrange, 0, 0, 0));
    elbow.add(cap(0.075, 0.18, m.suit, 0, -0.15, 0));
    elbow.add(sph(0.085, m.suitGrey, 0, -0.32, 0));
    shoulder.add(elbow);
    shoulder.rotation.z = 0.09 * side;
    body.add(shoulder);
    return { shoulder, elbow };
  };
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(0.155 * side, 0.88, 0);
    hip.add(cap(0.115, 0.22, m.suit, 0, -0.2, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.43, 0);
    knee.add(sph(0.105, m.suitOrange, 0, 0, 0));
    knee.add(cap(0.095, 0.2, m.suit, 0, -0.18, 0));
    knee.add(box(0.19, 0.13, 0.33, m.suitGrey, 0, -0.39, 0.05));
    hip.add(knee);
    body.add(hip);
    return { hip, knee };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const lamp = new THREE.SpotLight(0xfff0d0, 0, 26, 0.55, 0.6, 1.4);
  lamp.position.set(0, 1.78, 0.2);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, 0.2, 7);
  g.add(lamp, lampTarget);
  lamp.target = lampTarget;

  const st = { phase: 0, amp: 0, pose: 'walk', fall: 0, cheer: 0 };
  const solarBase = packSolar.color.clone();
  const dustCol = new THREE.Color(0xc98556);
  const cGood = new THREE.Color(0x3dff8a);
  const cWarn = new THREE.Color(0xffb020);
  const cBad = new THREE.Color(0xff2e3e);
  // o2, power in 0..1; dust 0..1
  g.userData.setTelemetry = (o2, power, dust = 0) => {
    const lvl = Math.max(0, Math.min(1, Math.min(o2, power)));
    const col = lvl > 0.5 ? cGood : lvl > 0.25 ? cWarn : cBad;
    barMats.forEach((mat, i) => {
      const on = lvl * 5 > i + 0.15;
      mat.emissive.copy(col);
      mat.emissiveIntensity = on ? 3.2 : 0.15;
    });
    packSolar.color.copy(solarBase).lerp(dustCol, Math.min(1, dust));
    packSolar.roughness = 0.28 + 0.65 * dust;
    packSolar.metalness = 0.55 * (1 - dust);
  };
  g.userData.suitMats = [m.suit];
  g.userData.lamp = lamp;
  g.userData.head = head;
  g.userData.state = st;
  // dt in seconds; moving 0..1; rate scales stride cadence
  g.userData.update = (dt, moving, rate = 1) => {
    st.amp += ((moving ? 1 : 0) - st.amp) * Math.min(1, dt * 6);
    st.phase += dt * 7.2 * rate * (0.25 + st.amp * 0.75);
    const s = Math.sin(st.phase);
    const c = Math.cos(st.phase);
    const a = st.amp;
    legL.hip.rotation.x = -s * 0.62 * a;
    legR.hip.rotation.x = s * 0.62 * a;
    legL.knee.rotation.x = Math.max(0, c) * 0.95 * a + 0.04;
    legR.knee.rotation.x = Math.max(0, -c) * 0.95 * a + 0.04;
    armL.shoulder.rotation.x = s * 0.42 * a;
    armR.shoulder.rotation.x = -s * 0.42 * a + st.cheer * -2.6;
    armL.elbow.rotation.x = -0.28 - Math.max(0, s) * 0.3 * a;
    armR.elbow.rotation.x = -0.28 - Math.max(0, -s) * 0.3 * a;
    const breathe = Math.sin(st.phase * 0.35) * 0.008 * (1 - a);
    body.position.y = Math.abs(c) * 0.045 * a + breathe;
    body.rotation.x = 0.07 * a;
    if (st.pose === 'dead') st.fall = Math.min(1, st.fall + dt * 0.8);
    if (st.pose === 'cheer') st.cheer = Math.min(1, st.cheer + dt * 1.5);
    const f = st.fall * st.fall * (3 - 2 * st.fall);
    g.rotation.x = f * (Math.PI / 2) * 0.96;
    body.position.y -= f * 0.05;
  };
  return g;
}

// ---------------------------------------------------------- equipment modules

const ITEM_BUILDERS = {
  rtg(m) {
    const g = new THREE.Group();
    g.add(cyl(0.25, 0.25, 1.0, m.darkMetal, 0, 0, 0, 22));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const fin = box(0.025, 0.92, 0.3, m.metal, Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
      fin.rotation.y = Math.PI / 2 - a;
      g.add(fin);
    }
    g.add(cyl(0.2, 0.2, 0.07, glow(0xff6a1a, 3), 0, 0.53, 0));
    g.add(cyl(0.2, 0.2, 0.07, glow(0xff6a1a, 3), 0, -0.53, 0));
    for (const y of [-0.3, 0, 0.3]) {
      const t = mesh(new THREE.TorusGeometry(0.27, 0.022, 8, 28), glow(0xff8a3c, 1.2), 0, y, 0);
      t.rotation.x = Math.PI / 2;
      g.add(t);
    }
    g.rotation.z = 0.25;
    return g;
  },
  solar(m) {
    const g = new THREE.Group();
    const fan = new THREE.Group();
    const disc = mesh(new THREE.CircleGeometry(0.64, 10), m.solar);
    fan.add(disc);
    const rim = mesh(new THREE.TorusGeometry(0.64, 0.016, 6, 10), m.foil);
    fan.add(rim);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      fan.add(strut([0, 0, -0.012], [Math.cos(a) * 0.64, Math.sin(a) * 0.64, -0.012], 0.01, m.metal));
    }
    fan.add(cyl(0.07, 0.07, 0.05, m.foil, 0, 0, -0.03).rotateX(Math.PI / 2));
    fan.rotation.x = -0.6;
    fan.position.y = 0.12;
    g.add(fan);
    g.add(strut([0, 0.1, -0.05], [0, -0.55, -0.25], 0.03, m.metal));
    g.add(box(0.3, 0.1, 0.3, m.darkMetal, 0, -0.58, -0.25));
    return g;
  },
  shield(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const slab = box(1.0 - (i % 2) * 0.06, 0.17, 0.7, i % 2 ? m.polyBlue : m.white, (i % 2) * 0.03, -0.42 + i * 0.19, 0);
      slab.rotation.y = (i % 2 ? 1 : -1) * 0.03;
      g.add(slab);
    }
    for (const x of [-0.3, 0.3]) g.add(box(0.06, 0.98, 0.73, m.black, x, -0.04, 0));
    g.add(box(0.26, 0.14, 0.02, glow(0x9a5bff, 1.6), 0, 0.2, 0.37));
    return g;
  },
  dish(m) {
    const g = new THREE.Group();
    const head = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const r = (i / 12) * 0.62;
      pts.push(new THREE.Vector2(r, r * r * 0.62));
    }
    head.add(mesh(new THREE.LatheGeometry(pts, 36), m.whiteDS));
    head.add(cyl(0.05, 0.035, 0.1, m.darkMetal, 0, 0.44, 0));
    head.add(sph(0.035, glow(0xffb020, 3), 0, 0.37, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      head.add(strut([Math.cos(a) * 0.58, 0.21, Math.sin(a) * 0.58], [0, 0.45, 0], 0.012, m.metal));
    }
    head.rotation.x = 0.75;
    head.position.set(0, 0, -0.1);
    g.add(head);
    g.add(cyl(0.07, 0.07, 0.16, m.darkMetal, 0, -0.12, -0.14));
    g.add(cyl(0.04, 0.04, 0.4, m.metal, 0, -0.38, -0.14));
    g.add(cyl(0.22, 0.26, 0.08, m.darkMetal, 0, -0.6, -0.14));
    return g;
  },
  brush(m) {
    const g = new THREE.Group();
    const tool = new THREE.Group();
    tool.add(cyl(0.035, 0.035, 0.95, m.metal, 0, 0.1, 0, 12));
    tool.add(cyl(0.05, 0.05, 0.3, m.rubber, 0, 0.45, 0, 12));
    tool.add(box(0.12, 0.2, 0.09, m.darkMetal, 0, 0.12, 0.06));
    tool.add(box(0.06, 0.04, 0.02, glow(0x35d6ff, 3), 0, 0.17, 0.11));
    tool.add(box(0.6, 0.09, 0.17, m.darkMetal, 0, -0.42, 0));
    for (let i = 0; i < 7; i++) tool.add(box(0.045, 0.14, 0.15, glow(0x35d6ff, 2.2), -0.24 + i * 0.08, -0.53, 0));
    const coil = mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 20), m.foil, 0, -0.33, 0);
    coil.rotation.x = Math.PI / 2;
    tool.add(coil);
    tool.rotation.z = 0.5;
    g.add(tool);
    return g;
  },
  libs(m) {
    const g = new THREE.Group();
    g.add(box(0.5, 0.42, 0.72, m.white, 0, 0, 0));
    g.add(box(0.52, 0.06, 0.74, m.foil, 0, -0.2, 0));
    const barrel = cyl(0.16, 0.16, 0.26, m.darkMetal, 0, 0.02, 0.46, 24);
    barrel.rotation.x = Math.PI / 2;
    g.add(barrel);
    const lens = cyl(0.125, 0.125, 0.03, m.glass, 0, 0.02, 0.595, 24);
    lens.rotation.x = Math.PI / 2;
    g.add(lens);
    const beam = cyl(0.012, 0.012, 0.9, glow(0xff2030, 6), 0, 0.02, 1.05, 8);
    beam.rotation.x = Math.PI / 2;
    beam.castShadow = false;
    g.add(beam);
    g.add(sph(0.04, glow(0xff5060, 6), 0, 0.02, 1.5));
    for (let i = 0; i < 5; i++) g.add(box(0.42, 0.1, 0.02, m.metal, 0, 0.26, -0.26 + i * 0.1));
    g.add(cyl(0.05, 0.05, 0.3, m.metal, 0, -0.38, 0));
    g.add(cyl(0.2, 0.22, 0.06, m.darkMetal, 0, -0.56, 0));
    return g;
  },
  eclss(m) {
    const g = new THREE.Group();
    g.add(box(0.95, 1.05, 0.42, m.darkMetal, 0, 0, -0.1));
    g.add(cyl(0.15, 0.15, 0.8, m.white, -0.24, 0, 0.22, 20));
    g.add(sph(0.15, m.white, -0.24, 0.4, 0.22));
    g.add(cyl(0.15, 0.15, 0.8, m.polyBlue, 0.24, 0, 0.22, 20));
    g.add(sph(0.15, m.polyBlue, 0.24, 0.4, 0.22));
    const pipe = mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 24, Math.PI), m.foil, 0, 0.52, 0.22);
    g.add(pipe);
    g.add(cyl(0.07, 0.07, 0.02, glow(0x3dff8a, 3), 0, -0.25, 0.12).rotateX(Math.PI / 2));
    g.add(box(0.2, 0.08, 0.02, glow(0x35d6ff, 2.5), 0, 0.05, 0.12));
    g.add(box(1.0, 0.06, 0.5, m.metal, 0, -0.55, 0));
    return g;
  },
  aerogel(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const slab = box(0.9, 0.16, 0.6, m.aerogel, 0, -0.42 + i * 0.2, 0);
      slab.castShadow = false;
      g.add(slab);
      g.add(box(0.92, 0.015, 0.62, m.metal, 0, -0.5 + i * 0.2, 0));
    }
    const liner = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.62, 20, 1, true, 0, Math.PI), m.aerogel, 0, 0.36, 0);
    liner.rotation.y = -Math.PI / 2;
    liner.castShadow = false;
    g.add(liner);
    const collar = mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 24, Math.PI), m.metal, 0, 0.67, 0);
    collar.rotation.x = -Math.PI / 2;
    collar.rotation.z = Math.PI;
    g.add(collar);
    return g;
  },
  moxie(m) {
    const g = new THREE.Group();
    g.add(box(0.62, 0.62, 0.52, m.foil, 0, -0.05, 0));
    g.add(cyl(0.13, 0.13, 0.2, m.white, -0.14, 0.36, 0.05, 20));
    g.add(cyl(0.1, 0.13, 0.05, m.darkMetal, -0.14, 0.48, 0.05, 20));
    g.add(strut([0.16, 0.26, 0.1], [0.16, 0.5, 0.1], 0.03, m.metal));
    g.add(strut([0.16, 0.5, 0.1], [0.4, 0.5, 0.1], 0.03, m.metal));
    g.add(strut([0.4, 0.5, 0.1], [0.4, -0.1, 0.1], 0.03, m.metal));
    g.add(box(0.2, 0.1, 0.02, glow(0x35a0ff, 3), 0, 0.05, 0.265));
    g.add(box(0.06, 0.06, 0.02, glow(0x3dff8a, 3), 0.2, -0.2, 0.265));
    g.add(box(0.7, 0.06, 0.6, m.darkMetal, 0, -0.4, 0));
    for (const [x, z] of [
      [-0.3, -0.25],
      [0.3, -0.25],
      [-0.3, 0.25],
      [0.3, 0.25],
    ])
      g.add(cyl(0.03, 0.03, 0.18, m.metal, x, -0.52, z, 8));
    return g;
  },
  lidar(m) {
    const g = new THREE.Group();
    g.add(box(0.44, 0.22, 0.44, m.darkMetal, 0, -0.45, 0));
    g.add(cyl(0.05, 0.05, 0.4, m.metal, 0, -0.15, 0));
    const headG = new THREE.Group();
    headG.position.y = 0.2;
    headG.add(cyl(0.2, 0.2, 0.3, m.glass, 0, 0, 0, 28));
    headG.add(cyl(0.205, 0.205, 0.04, glow(0x3dff8a, 3.5), 0, 0, 0, 28));
    headG.add(cyl(0.21, 0.21, 0.03, m.metal, 0, 0.16, 0, 28));
    headG.add(cyl(0.21, 0.21, 0.03, m.metal, 0, -0.16, 0, 28));
    headG.add(box(0.06, 0.2, 0.02, glow(0x3dff8a, 5), 0, 0, 0.2));
    g.add(headG);
    g.userData.spin = headG;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const fan = mesh(new THREE.CircleGeometry(0.9, 12, a - 0.08, 0.16), glow(0x3dff8a, 1.2), 0, 0.2, 0);
      fan.material = fan.material.clone();
      fan.material.transparent = true;
      fan.material.opacity = 0.16;
      fan.material.side = THREE.DoubleSide;
      fan.material.depthWrite = false;
      fan.rotation.x = -Math.PI / 2;
      fan.castShadow = false;
      headG.add(fan);
    }
    return g;
  },
  drill(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      g.add(strut([0, 0.42, 0], [Math.cos(a) * 0.5, -0.6, Math.sin(a) * 0.5], 0.025, m.metal));
      g.add(cyl(0.07, 0.07, 0.03, m.darkMetal, Math.cos(a) * 0.5, -0.6, Math.sin(a) * 0.5, 12));
    }
    g.add(box(0.26, 0.3, 0.26, m.suitOrange, 0, 0.5, 0));
    g.add(box(0.1, 0.06, 0.02, glow(0xffb020, 3), 0, 0.52, 0.135));
    g.add(cyl(0.045, 0.045, 0.9, m.darkMetal, 0, -0.08, 0, 12));
    for (let i = 0; i < 9; i++) {
      const t = mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 16), m.metal, 0, 0.3 - i * 0.095, 0);
      t.rotation.x = Math.PI / 2 + 0.35;
      t.rotation.z = i * 0.7;
      g.add(t);
    }
    const bit = mesh(new THREE.ConeGeometry(0.07, 0.16, 12), m.metal, 0, -0.6, 0);
    bit.rotation.x = Math.PI;
    g.add(bit);
    return g;
  },
  medkit(m) {
    const g = new THREE.Group();
    g.add(box(0.82, 0.54, 0.34, m.white, 0, -0.1, 0));
    g.add(box(0.84, 0.05, 0.36, m.suitGrey, 0, 0.02, 0));
    g.add(box(0.3, 0.09, 0.02, m.red, 0, -0.12, 0.175));
    g.add(box(0.09, 0.3, 0.02, m.red, 0, -0.12, 0.175));
    const handle = mesh(new THREE.TorusGeometry(0.13, 0.022, 8, 20, Math.PI), m.darkMetal, 0, 0.17, 0);
    g.add(handle);
    for (let i = 0; i < 3; i++) {
      g.add(cyl(0.045, 0.045, 0.26, glow(i === 1 ? 0x35d6ff : 0x3dff8a, 2.6), -0.2 + i * 0.2, -0.45, 0.3, 12));
      g.add(cyl(0.05, 0.05, 0.05, m.metal, -0.2 + i * 0.2, -0.3, 0.3, 12));
    }
    g.add(box(0.7, 0.04, 0.2, m.darkMetal, 0, -0.6, 0.3));
    return g;
  },
};

export function createItemModel(id) {
  const g = ITEM_BUILDERS[id](M());
  const wrap = new THREE.Group();
  wrap.add(g);
  if (g.userData.spin) wrap.userData.spin = g.userData.spin;
  return wrap;
}

// ---------------------------------------------------------- descent stage

export function createDescentStage() {
  const m = M();
  const g = new THREE.Group();
  g.add(cyl(3.3, 3.55, 0.55, m.foil, 0, 1.0, 0, 6));
  g.add(cyl(3.25, 3.25, 0.08, m.metal, 0, 1.31, 0, 6));
  g.add(cyl(3.6, 3.6, 0.1, m.darkMetal, 0, 0.7, 0, 6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    g.add(strut([cx * 3.1, 0.95, cz * 3.1], [cx * 4.3, 0.12, cz * 4.3], 0.07, m.metal));
    g.add(strut([cx * 2.2, 0.75, cz * 2.2], [cx * 4.3, 0.12, cz * 4.3], 0.045, m.darkMetal));
    g.add(cyl(0.34, 0.4, 0.1, m.darkMetal, cx * 4.3, 0.06, cz * 4.3, 16));
    // propellant tanks
    const tank = sph(0.5, m.white, cx * 2.35, 0.55, cz * 2.35);
    tank.scale.y = 0.75;
    g.add(tank);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const noz = mesh(new THREE.ConeGeometry(0.36, 0.5, 18, 1, true), m.darkMetal, Math.cos(a) * 1.2, 0.42, Math.sin(a) * 1.2);
    noz.material = m.darkMetal;
    g.add(noz);
  }
  return g;
}

// ---------------------------------------------------------------- MER rover

export function createRover({ dusty = true, buried = false } = {}) {
  const m = M();
  const g = new THREE.Group();
  const r = new THREE.Group();
  g.add(r);
  const panelMat = (dusty ? m.solarDusty : m.solar).clone();
  const panels = [];
  const panel = (w, d, x, z, ry = 0) => {
    const p = box(w, 0.035, d, panelMat, x, 0.97, z);
    p.rotation.y = ry;
    panels.push(p);
    r.add(p);
    return p;
  };

  // Warm Electronics Box
  const web = box(1.05, 0.36, 0.82, m.foil, 0, 0.74, 0);
  r.add(web);
  const hatch = box(0.5, 0.3, 0.03, m.foil, -0.1, 0.74, 0.425);
  r.add(hatch);
  // equipment deck and the four solar wings
  panel(1.3, 0.95, 0, 0);
  panel(0.85, 0.62, -0.05, 0.78, 0.1).rotation.z = 0;
  panel(0.85, 0.62, -0.05, -0.78, -0.1);
  panel(0.55, 1.35, -0.92, 0);
  panel(0.4, 0.7, 0.82, 0);

  // rocker-bogie suspension
  const wheels = [];
  for (const side of [-1, 1]) {
    const z = side * 0.66;
    for (const x of [0.62, 0, -0.62]) {
      const w = cyl(0.26, 0.26, 0.17, m.darkMetal, x, 0.26, z, 22);
      w.rotation.x = Math.PI / 2;
      wheels.push(w);
      r.add(w);
      const hub = cyl(0.1, 0.1, 0.19, m.metal, x, 0.26, z, 12);
      hub.rotation.x = Math.PI / 2;
      r.add(hub);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const cleat = box(0.03, 0.03, 0.18, m.black, x + Math.cos(a) * 0.265, 0.26 + Math.sin(a) * 0.265, z);
        cleat.rotation.z = a;
        r.add(cleat);
      }
    }
    r.add(strut([0.62, 0.3, z], [0.15, 0.68, z * 0.85], 0.03, m.metal));
    r.add(strut([0.15, 0.68, z * 0.85], [-0.3, 0.42, z], 0.03, m.metal));
    r.add(strut([-0.3, 0.42, z], [0, 0.3, z], 0.025, m.metal));
    r.add(strut([-0.3, 0.42, z], [-0.62, 0.3, z], 0.025, m.metal));
    r.add(strut([0.15, 0.68, z * 0.85], [0.15, 0.7, z * 0.6], 0.035, m.darkMetal));
  }

  // Pancam mast assembly
  r.add(cyl(0.035, 0.04, 0.95, m.white, 0.42, 1.45, 0.18, 12));
  const headBar = box(0.1, 0.11, 0.42, m.white, 0.42, 1.95, 0.18);
  r.add(headBar);
  for (const dz of [-0.15, -0.05, 0.05, 0.15]) {
    const eye = cyl(0.035, 0.035, 0.05, m.glass, 0.48, 1.95, 0.18 + dz, 12);
    eye.rotation.z = Math.PI / 2;
    r.add(eye);
  }
  // high-gain antenna, low-gain mast, UHF stub
  const hga = cyl(0.17, 0.17, 0.02, m.metal, -0.3, 1.32, -0.22, 24);
  hga.rotation.set(0.5, 0, 0.5);
  r.add(hga);
  r.add(cyl(0.02, 0.02, 0.32, m.metal, -0.3, 1.14, -0.22, 8));
  r.add(cyl(0.015, 0.015, 0.5, m.metal, -0.42, 1.24, 0.22, 8));
  r.add(cyl(0.012, 0.012, 0.22, m.darkMetal, -0.1, 1.1, 0.32, 8));
  // sundial calibration target
  r.add(cyl(0.05, 0.05, 0.01, m.white, -0.55, 0.995, -0.3, 16));
  r.add(cyl(0.006, 0.006, 0.06, m.black, -0.55, 1.03, -0.3, 6));
  // instrument deployment device (arm), folded forward
  r.add(strut([0.55, 0.62, 0], [0.95, 0.68, 0.05], 0.03, m.metal));
  r.add(strut([0.95, 0.68, 0.05], [1.12, 0.38, 0.08], 0.028, m.metal));
  r.add(cyl(0.08, 0.08, 0.1, m.darkMetal, 1.12, 0.33, 0.08, 12));

  // status beacon above the mast
  const beaconMat = glow(0x35d6ff, 3).clone();
  const beacon = sph(0.05, beaconMat, 0.42, 2.12, 0.18);
  beacon.castShadow = false;
  r.add(beacon);

  if (buried) {
    r.position.y = -0.2;
    r.rotation.z = 0.05;
    r.rotation.x = -0.06;
    for (const side of [-1, 1]) {
      for (const x of [0.62, 0, -0.62]) {
        const mound = sph(0.5, m.dust, x, 0.02, side * 0.68);
        mound.scale.set(1.1, 0.34, 0.9);
        g.add(mound);
      }
    }
  } else {
    r.rotation.z = -0.1;
    r.rotation.x = 0.07;
    r.position.y = -0.02;
    const drift = sph(0.9, m.dust, -0.3, -0.05, -0.75);
    drift.scale.set(1.4, 0.22, 0.7);
    g.add(drift);
  }

  g.userData.setState = (state) => {
    if (state === 'preserve') {
      beaconMat.emissive.set(0x3dff8a);
      panels.forEach((p) => (p.material = m.solar));
    } else {
      beaconMat.emissive.set(0xffb020);
      hatch.rotation.x = 1.2;
      hatch.position.set(-0.1, 0.62, 0.58);
    }
  };
  return g;
}

// ---------------------------------------------------------------- InSight

export function createInSight() {
  const m = M();
  const g = new THREE.Group();
  g.add(cyl(0.98, 0.98, 0.24, m.foil, 0, 0.96, 0, 28));
  g.add(cyl(0.99, 0.99, 0.03, m.white, 0, 1.09, 0, 28));
  g.add(cyl(0.7, 0.9, 0.14, m.darkMetal, 0, 0.78, 0, 20));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    g.add(strut([cx * 0.85, 0.86, cz * 0.85], [cx * 1.5, 0.06, cz * 1.5], 0.04, m.metal));
    g.add(strut([cx * 0.45, 0.74, cz * 0.45], [cx * 1.5, 0.06, cz * 1.5], 0.025, m.darkMetal));
    g.add(cyl(0.2, 0.22, 0.05, m.metal, cx * 1.5, 0.03, cz * 1.5, 16));
  }
  // twin decagonal UltraFlex arrays
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const disc = mesh(new THREE.CircleGeometry(1.08, 10), m.solarDusty);
    disc.rotation.x = -Math.PI / 2;
    wing.add(disc);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      wing.add(strut([0, -0.015, 0], [Math.cos(a) * 1.08, -0.015, Math.sin(a) * 1.08], 0.012, m.metal));
    }
    wing.add(strut([-side * 1.08, -0.02, 0], [-side * 1.25, -0.02, 0], 0.03, m.metal));
    wing.position.set(side * 2.2, 1.06, 0);
    wing.rotation.z = side * -0.03;
    wings.push(wing);
    g.add(wing);
  }
  // deck furniture: UHF helix, medium-gain horns, TWINS booms, pressure inlet
  g.add(cyl(0.04, 0.04, 0.4, m.metal, -0.3, 1.3, -0.5, 10));
  for (const x of [-0.55, 0.55]) {
    const horn = mesh(new THREE.ConeGeometry(0.1, 0.2, 14, 1, true), m.whiteDS, x, 1.22, -0.55);
    horn.rotation.x = Math.PI;
    g.add(horn);
  }
  g.add(strut([0.5, 1.1, 0.5], [0.8, 1.36, 0.7], 0.012, m.metal));
  g.add(strut([-0.5, 1.1, 0.5], [-0.8, 1.36, 0.7], 0.012, m.metal));
  g.add(cyl(0.07, 0.07, 0.1, m.white, 0.1, 1.15, -0.1, 14));
  // robotic arm reaching toward the instruments
  g.add(strut([0.25, 1.12, 0.6], [0.35, 1.7, 1.1], 0.03, m.metal));
  g.add(strut([0.35, 1.7, 1.1], [0.4, 0.95, 1.75], 0.028, m.metal));
  g.add(box(0.1, 0.12, 0.1, m.darkMetal, 0.4, 0.9, 1.75));
  // SEIS under its wind and thermal shield
  const dome = mesh(new THREE.SphereGeometry(0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.white, 0.45, 0.14, 2.35);
  g.add(dome);
  g.add(cyl(0.42, 0.46, 0.16, m.foil, 0.45, 0.08, 2.35, 24));
  const tether = box(0.06, 0.01, 1.5, m.foil, 0.38, 0.03, 1.6);
  tether.rotation.y = 0.05;
  g.add(tether);
  // HP3 heat probe
  g.add(box(0.26, 0.3, 0.2, m.darkMetal, -0.55, 0.2, 2.1));
  g.add(cyl(0.02, 0.02, 0.35, m.metal, -0.55, 0.3, 2.3, 8));

  const beaconMat = glow(0x35d6ff, 3).clone();
  const beacon = sph(0.05, beaconMat, -0.3, 1.56, -0.5);
  beacon.castShadow = false;
  g.add(beacon);

  g.userData.setState = (state) => {
    if (state === 'preserve') beaconMat.emissive.set(0x3dff8a);
    else {
      beaconMat.emissive.set(0xffb020);
      wings[1].visible = false;
    }
  };
  return g;
}

// ---------------------------------------------------------------- Ingenuity

export function createIngenuity() {
  const m = M();
  const g = new THREE.Group();
  const h = new THREE.Group();
  g.add(h);
  h.add(box(0.42, 0.45, 0.42, m.foil, 0, 0.62, 0));
  h.add(cyl(0.05, 0.05, 0.03, m.glass, 0, 0.385, 0, 12));
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    h.add(strut([sx * 0.2, 0.78, sz * 0.2], [sx * 0.78, 0.02, sz * 0.78], 0.014, m.carbon));
    h.add(sph(0.035, m.black, sx * 0.78, 0.03, sz * 0.78));
  }
  h.add(cyl(0.022, 0.022, 0.85, m.darkMetal, 0, 1.26, 0, 8));
  // coaxial counter-rotating rotors, 1.2 m span at flight scale
  const lower = new THREE.Group();
  lower.position.y = 1.18;
  const bladeA = box(1.35, 0.016, 0.13, m.carbon, 0.68, 0, 0);
  const bladeB = box(0.85, 0.016, 0.13, m.carbon, -0.43, 0, 0); // snapped tip, Flight 72
  bladeA.rotation.x = 0.12;
  bladeB.rotation.x = -0.12;
  lower.add(bladeA, bladeB, cyl(0.05, 0.05, 0.06, m.darkMetal, 0, 0, 0, 12));
  lower.rotation.y = 0.4;
  h.add(lower);
  const upper = new THREE.Group();
  upper.position.y = 1.38;
  const bladeC = box(2.7, 0.016, 0.13, m.carbon, 0, 0, 0);
  bladeC.rotation.x = 0.1;
  upper.add(bladeC, cyl(0.05, 0.05, 0.06, m.darkMetal, 0, 0, 0, 12));
  upper.rotation.y = 1.9;
  h.add(upper);
  h.add(box(0.44, 0.02, 0.32, m.solarDusty, 0, 1.7, 0));
  h.add(cyl(0.008, 0.008, 0.22, m.metal, 0.1, 1.82, 0, 6));
  // broken blade tip lying in the sand
  const tip = box(0.5, 0.016, 0.13, m.carbon, 1.6, 0.03, 0.9);
  tip.rotation.y = 0.8;
  g.add(tip);
  const dune = sph(1.3, m.dust, 0, -0.2, 0);
  dune.scale.set(1.5, 0.2, 1.1);
  g.add(dune);
  h.rotation.z = 0.12;
  h.rotation.x = -0.05;
  h.position.y = 0.04;

  const beaconMat = glow(0x35d6ff, 3).clone();
  const beacon = sph(0.04, beaconMat, 0.1, 1.95, 0);
  beacon.castShadow = false;
  h.add(beacon);

  g.userData.setState = (state) => {
    if (state === 'preserve') beaconMat.emissive.set(0x3dff8a);
    else {
      beaconMat.emissive.set(0xffb020);
      upper.visible = false;
    }
  };
  return g;
}

export function createHardware(id) {
  if (id === 'opportunity') return createRover({ dusty: true, buried: false });
  if (id === 'spirit') return createRover({ dusty: true, buried: true });
  if (id === 'insight') return createInSight();
  return createIngenuity();
}

// Faceted boulder geometry for instancing.
export function rockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  let a = seed * 9973;
  const r = () => {
    a = (a * 1664525 + 1013904223) | 0;
    return ((a >>> 0) / 4294967296) * 2 - 1;
  };
  // Displace by direction so shared corners of the non-indexed mesh stay welded.
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 1 + r() * 0.28);
    const k = seen.get(key);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.72, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}
