// SOL 60: RED HORIZON — sculpted NASA heritage models (rounded boxes, lathes, tubes, capsules; no crude primitives):
// MER rover (Opportunity / Spirit), InSight lander, Ingenuity helicopter, Apollo 12 ALSEP, Surveyor 3, the REMS / MEDA
// weather station and the Bright Angel outcrop. Each builder returns { group, ...animatable parts }.
// Used by the world (dormant pioneers + holographic replays) and by the Moon-to-Mars 3D Archive viewer.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;

const std = (color, rough = 0.6, metal = 0.2, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const tube = (pts, r = 0.03, seg = 24, radial = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)), false, 'centripetal'), seg, r, radial, false);

/** Shallow parabolic dish profile (radius R, depth D) as a lathe, concave side up. */
const dishGeo = (R, D, seg = 28) => {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const r = (i / 8) * R;
    pts.push([r, D * (r / R) * (r / R)]);
  }
  for (let i = 8; i >= 0; i--) {
    const r = (i / 8) * R;
    pts.push([r, D * (r / R) * (r / R) - 0.012]);
  }
  return lathe(pts, seg);
};

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- MER (Opportunity / Spirit)
export function buildMer() {
  const g = new THREE.Group();
  const gold = std('#c9a24a', 0.35, 0.75);
  const white = std('#dcd9d2', 0.55, 0.2);
  const dark = std('#2a2d33', 0.6, 0.4);
  const panel = std('#17214b', 0.28, 0.6);
  const steel = std('#aab0b9', 0.4, 0.8);
  const rubber = std('#8d9096', 0.5, 0.7);
  // warm electronics box with gold insulation
  add(g, rbox(1.05, 0.36, 1.35, 0.1), gold, 0, 0.74, 0);
  // fan-fold solar deck: centre plate + two hinged wings
  add(g, rbox(1.45, 0.05, 1.45, 0.02), panel, 0, 0.96, 0);
  add(g, rbox(0.55, 0.04, 1.3, 0.015), panel, -0.98, 0.99, 0, 0, 0, 0.12);
  add(g, rbox(0.55, 0.04, 1.3, 0.015), panel, 0.98, 0.99, 0, 0, 0, -0.12);
  // six wheels with rocker-bogie struts
  const wheels = [];
  const hub = lathe([[0.0, 0.09], [0.08, 0.09], [0.2, 0.05], [0.2, -0.05], [0.08, -0.09], [0.0, -0.09]], 20).rotateZ(Math.PI / 2);
  for (const sx of [-1, 1])
    for (const z of [-0.6, 0, 0.6]) {
      const w = new THREE.Group();
      w.position.set(sx * 0.7, 0.2, z);
      add(w, hub, rubber, 0, 0, 0);
      add(w, new THREE.TorusGeometry(0.2, 0.03, 8, 22).rotateY(Math.PI / 2), dark, sx * 0.05, 0, 0);
      add(w, new THREE.TorusGeometry(0.2, 0.03, 8, 22).rotateY(Math.PI / 2), dark, -sx * 0.05, 0, 0);
      for (let k = 0; k < 6; k++) add(w, new THREE.CapsuleGeometry(0.012, 0.36, 3, 6), steel, 0, 0, 0, (k / 6) * Math.PI, 0, 0);
      g.add(w);
      wheels.push(w);
      add(g, tube([[sx * 0.52, 0.72, z * 0.4], [sx * 0.62, 0.45, z * 0.75], [sx * 0.7, 0.2, z]], 0.028, 12, 6), steel);
    }
  // mast with Pancam bar, HGA dish, whip antenna, front arm
  add(g, new THREE.CapsuleGeometry(0.028, 0.55, 4, 10), steel, 0.45, 1.3, 0.5);
  add(g, rbox(0.4, 0.11, 0.11, 0.04), white, 0.45, 1.62, 0.5);
  for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12).rotateX(Math.PI / 2), dark, 0.45 + sx * 0.12, 1.62, 0.57);
  const hga = add(g, dishGeo(0.25, 0.06), white, -0.45, 1.06, -0.45, -0.5, 0.4, 0);
  add(g, new THREE.CapsuleGeometry(0.02, 0.28, 3, 8), steel, -0.45, 0.92, -0.45);
  add(g, new THREE.CapsuleGeometry(0.01, 0.9, 3, 6), steel, 0.6, 1.4, -0.55, 0.1, 0, -0.08);
  add(g, tube([[-0.2, 0.7, 0.68], [-0.25, 0.52, 0.95], [-0.05, 0.38, 1.1], [0.1, 0.45, 1.18]], 0.035, 16, 8), steel);
  add(g, rbox(0.2, 0.16, 0.16, 0.05), gold, 0.1, 0.45, 1.2);
  return { group: g, wheels, hga };
}

// ---------------------------------------------------------------- InSight
export function buildInsight() {
  const g = new THREE.Group();
  const white = std('#e2dfd8', 0.5, 0.25);
  const gold = std('#c9a24a', 0.3, 0.8);
  const dark = std('#222630', 0.6, 0.4);
  const panel = std('#1a2652', 0.25, 0.6);
  const steel = std('#aab0b9', 0.4, 0.8);
  // hexagonal deck
  add(g, new THREE.CylinderGeometry(0.95, 0.95, 0.16, 6), white, 0, 1.0, 0);
  add(g, lathe([[0, 0], [0.7, 0], [0.82, 0.12], [0.5, 0.3], [0, 0.34]], 20), gold, 0, 1.08, 0);
  // two circular solar arrays with outer ring and struts
  const arrays = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(sx * 1.9, 1.25, 0);
    add(a, new THREE.CylinderGeometry(1.5, 1.5, 0.045, 36), panel, 0, 0, 0);
    add(a, new THREE.TorusGeometry(1.5, 0.035, 8, 40).rotateX(Math.PI / 2), steel, 0, 0, 0);
    add(a, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16), dark, 0, 0.03, 0);
    a.rotation.z = sx * -0.06;
    g.add(a);
    arrays.push(a);
    add(g, tube([[sx * 0.8, 1.05, 0], [sx * 1.2, 1.15, 0], [sx * 1.6, 1.22, 0]], 0.03, 8, 6), steel);
  }
  // landing legs (tripod)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a);
    const z = Math.sin(a);
    add(g, tube([[x * 0.6, 1.0, z * 0.6], [x * 1.0, 0.5, z * 1.0], [x * 1.25, 0.08, z * 1.25]], 0.04, 12, 6), steel);
    add(g, lathe([[0, 0], [0.2, 0], [0.22, 0.03], [0.12, 0.08], [0, 0.09]], 14), dark, x * 1.25, 0, z * 1.25);
  }
  // instrument deck: SEIS dome, HP3, robotic arm, antennas
  const seis = add(g, lathe([[0, 0], [0.42, 0], [0.46, 0.08], [0.4, 0.26], [0.26, 0.4], [0.1, 0.45], [0, 0.46]], 24), gold, 0.9, 0, 1.55);
  add(g, new THREE.TorusGeometry(0.44, 0.025, 8, 28).rotateX(Math.PI / 2), steel, 0.9, 0.03, 1.55);
  add(g, new THREE.CapsuleGeometry(0.09, 0.5, 4, 10), white, -0.95, 0.2, 1.5, 0, 0, 1.2);
  const arm = add(g, tube([[0, 1.0, 0.7], [0.25, 1.15, 1.05], [0.65, 0.9, 1.4], [0.9, 0.55, 1.5]], 0.04, 20, 8), steel);
  add(g, new THREE.CapsuleGeometry(0.018, 0.9, 3, 8), steel, -0.5, 1.5, -0.2);
  add(g, dishGeo(0.17, 0.04), white, 0.5, 1.32, -0.3, -0.7, 0, 0);
  return { group: g, arrays, seis, arm };
}

// ---------------------------------------------------------------- Ingenuity helicopter
export function buildIngenuity() {
  const g = new THREE.Group();
  const gold = std('#c9a24a', 0.35, 0.7);
  const carbon = std('#1d2026', 0.4, 0.5);
  const panel = std('#17214b', 0.28, 0.6);
  const white = std('#e6e3dc', 0.5, 0.2);
  // landing legs: four carbon-fibre struts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a);
    const z = Math.sin(a);
    add(g, tube([[x * 0.06, 0.5, z * 0.06], [x * 0.2, 0.28, z * 0.2], [x * 0.3, 0.02, z * 0.3]], 0.008, 10, 6), carbon);
    add(g, new THREE.SphereGeometry(0.018, 8, 6), white, x * 0.3, 0.02, z * 0.3);
  }
  // fuselage: gold-foil cube with a camera lens
  add(g, rbox(0.2, 0.2, 0.2, 0.04), gold, 0, 0.58, 0);
  add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10).rotateX(Math.PI / 2), carbon, 0.04, 0.5, 0.1);
  // mast, solar panel and two co-axial counter-rotating rotors
  add(g, new THREE.CapsuleGeometry(0.012, 0.55, 3, 8), carbon, 0, 0.98, 0);
  add(g, rbox(0.5, 0.015, 0.3, 0.006), panel, 0, 1.32, 0);
  const rotorLo = new THREE.Group();
  rotorLo.position.set(0, 0.85, 0);
  const rotorHi = new THREE.Group();
  rotorHi.position.set(0, 1.0, 0);
  for (const [r, dir] of [[rotorLo, 1], [rotorHi, -1]]) {
    add(r, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), white, 0, 0, 0);
    for (const s of [-1, 1]) {
      const blade = add(r, new THREE.CapsuleGeometry(0.018, 0.52, 3, 8), carbon, s * 0.3, 0, 0, 0, 0, Math.PI / 2);
      blade.scale.set(1, 1, 0.35);
      blade.rotation.x = dir * 0.12;
    }
    g.add(r);
  }
  return { group: g, rotors: [rotorLo, rotorHi] };
}

// ---------------------------------------------------------------- Apollo 12 ALSEP
export function buildAlsep() {
  const g = new THREE.Group();
  const gold = std('#d0a84e', 0.3, 0.85);
  const white = std('#dcdad4', 0.5, 0.25);
  const steel = std('#aab0b9', 0.4, 0.8);
  const dark = std('#2a2d33', 0.55, 0.5);
  // central station on a pallet
  add(g, rbox(1.1, 0.12, 0.8, 0.03), dark, 0, 0.06, 0);
  add(g, rbox(0.95, 0.42, 0.65, 0.07), gold, 0, 0.33, 0);
  add(g, rbox(0.9, 0.04, 0.6, 0.01), std('#2c3a66', 0.35, 0.4), 0, 0.56, 0);
  // antenna tripod + dish
  add(g, new THREE.CapsuleGeometry(0.02, 1.2, 3, 8), steel, -0.6, 0.7, -0.4);
  add(g, dishGeo(0.45, 0.1), white, -0.6, 1.4, -0.4, -0.9, 0.5, 0);
  // SNAP-27 RTG: finned cylinder connected by cable
  const rtg = new THREE.Group();
  rtg.position.set(2.1, 0, 0.3);
  add(rtg, new THREE.CylinderGeometry(0.17, 0.17, 0.5, 18), dark, 0, 0.32, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(rtg, rbox(0.03, 0.46, 0.24, 0.01), steel, Math.cos(a) * 0.24, 0.32, Math.sin(a) * 0.24, 0, -a, 0);
  }
  add(rtg, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18), steel, 0, 0.58, 0);
  g.add(rtg);
  add(g, tube([[0.5, 0.2, 0.1], [1.1, 0.04, 0.4], [1.6, 0.05, 0.25], [1.95, 0.15, 0.3]], 0.012, 20, 5), dark);
  // passive seismometer dome, magnetometer and solar-wind sensor on tripods
  add(g, lathe([[0, 0], [0.28, 0], [0.3, 0.07], [0.24, 0.2], [0.12, 0.27], [0, 0.29]], 20), gold, 0.4, 0, 1.3);
  for (const [x, z, h] of [[-1.2, 0.9, 0.6], [1.4, -1.0, 0.45]]) {
    add(g, new THREE.CapsuleGeometry(0.015, h, 3, 6), steel, x, h / 2 + 0.05, z);
    add(g, rbox(0.22, 0.12, 0.14, 0.03), gold, x, h + 0.12, z);
  }
  return { group: g, rtg };
}

// ---------------------------------------------------------------- Surveyor 3
export function buildSurveyor() {
  const g = new THREE.Group();
  const steel = std('#b0b5bc', 0.4, 0.8);
  const white = std('#dcdad4', 0.5, 0.25);
  const dark = std('#2a2d33', 0.55, 0.5);
  const panel = std('#1c2a58', 0.3, 0.5);
  // triangular tubular frame with crushable legs and footpads
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    add(g, tube([[x * 0.2, 1.05, z * 0.2], [x * 0.65, 0.55, z * 0.65], [x * 1.2, 0.05, z * 1.2]], 0.03, 12, 6), steel);
    add(g, lathe([[0, 0], [0.18, 0], [0.2, 0.025], [0.1, 0.06], [0, 0.07]], 14), dark, x * 1.2, 0, z * 1.2);
    add(g, tube([[x * 0.2, 1.05, z * 0.2], [x * 0.45, 0.85, z * 0.45], [x * 0.55, 0.6, z * 0.55]], 0.015, 10, 5), steel);
  }
  add(g, rbox(0.55, 0.28, 0.45, 0.06), white, 0, 0.85, 0);
  add(g, new THREE.CapsuleGeometry(0.03, 0.55, 3, 8), steel, 0, 1.4, 0);
  add(g, rbox(0.9, 0.035, 0.7, 0.012), panel, 0, 1.78, 0);
  add(g, new THREE.CapsuleGeometry(0.012, 0.8, 3, 6), steel, 0.45, 1.5, 0.15, 0.2, 0, -0.4);
  // television camera and surface sampler scoop arm
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.3, 14), dark, -0.1, 1.2, 0.1, 0, 0, 0.3);
  add(g, tube([[0.28, 0.8, 0.15], [0.7, 0.6, 0.45], [1.0, 0.25, 0.75], [1.1, 0.12, 0.9]], 0.02, 18, 6), steel);
  add(g, rbox(0.14, 0.08, 0.14, 0.03), steel, 1.12, 0.1, 0.92);
  return { group: g };
}

// ---------------------------------------------------------------- REMS / MEDA weather station (repairable device)
export function buildWeatherStation() {
  const g = new THREE.Group();
  const white = std('#e2dfd8', 0.5, 0.25);
  const steel = std('#aab0b9', 0.4, 0.8);
  const dark = std('#23262d', 0.55, 0.5);
  const panel = std('#1a2652', 0.28, 0.6);
  add(g, lathe([[0, 0], [1.2, 0], [1.28, 0.05], [1.15, 0.14], [0.5, 0.2], [0, 0.22]], 24), std('#6d6f73', 0.8, 0.3), 0, 0, 0);
  const mast = new THREE.Group();
  g.add(mast);
  add(mast, new THREE.CylinderGeometry(0.07, 0.1, 3.6, 12), steel, 0, 2.0, 0);
  // two sensor booms: wind (REMS) and air temperature / humidity (MEDA)
  add(mast, tube([[0, 3.0, 0], [0.6, 3.05, 0.2], [1.3, 3.0, 0.35]], 0.025, 12, 6), steel);
  add(mast, tube([[0, 2.5, 0], [-0.55, 2.55, -0.25], [-1.1, 2.5, -0.4]], 0.025, 12, 6), steel);
  add(mast, rbox(0.16, 0.1, 0.1, 0.03), white, 1.35, 3.0, 0.36);
  add(mast, lathe([[0, 0], [0.05, 0], [0.06, 0.08], [0.03, 0.14], [0, 0.15]], 10), white, -1.1, 2.5, -0.4);
  // anemometer cups
  const cups = new THREE.Group();
  cups.position.set(0, 3.7, 0);
  mast.add(cups);
  add(cups, new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), steel, 0, 0.04, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(cups, new THREE.CapsuleGeometry(0.01, 0.26, 3, 6), steel, Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14, Math.PI / 2, 0, -a + Math.PI / 2);
    add(cups, new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), white, Math.cos(a) * 0.28, 0.1, Math.sin(a) * 0.28);
  }
  // pressure + electronics cabinet and a small solar panel
  add(g, rbox(1.1, 1.0, 0.7, 0.08), white, 1.7, 0.55, 0.2);
  add(g, rbox(0.9, 0.04, 0.6, 0.015), panel, 1.7, 1.2, 0.2, 0, 0, -0.3);
  add(g, new THREE.CapsuleGeometry(0.015, 0.6, 3, 6), steel, 2.05, 1.5, 0.1);
  const led = add(g, new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: '#ff2e3e' }), 0, 3.95, 0);
  led.castShadow = false;
  let spinning = false;
  cups.onBeforeRender = () => {
    if (spinning) cups.rotation.y += 0.07;
  };
  return {
    group: g,
    sparkLocal: new V3(1.7, 1.0, 0.7),
    setRepaired(r) {
      spinning = r;
      mast.rotation.set(r ? 0 : 0.16, 0, r ? 0 : -0.1);
      cups.rotation.y = 0;
      led.material.color.set(r ? '#3dff8a' : '#ff2e3e');
    },
  };
}

// ---------------------------------------------------------------- Bright Angel outcrop (SHERLOC / PIXL target)
function leopardTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  gr.addColorStop(0, '#d6cdbd');
  gr.addColorStop(1, '#a8805e');
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const px = 30 + rnd() * 196;
    const py = 30 + rnd() * 196;
    const r = 4 + rnd() * 9;
    x.fillStyle = 'rgba(210,225,205,0.9)';
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(40,28,24,0.85)';
    x.beginPath();
    x.arc(px, py, r * 0.45, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSherlocRock() {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1.5, 4);
  const pos = geo.attributes.position;
  const v = new V3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 2.3 + 1.7) * Math.cos(v.z * 2.1) * 0.12 + Math.sin(v.x * 6.1 + v.y * 4.3) * 0.04;
    v.multiplyScalar(1 + n);
    v.y *= 0.5;
    v.x *= 1.25;
    pos.setXYZ(i, v.x, Math.max(v.y, -0.15), v.z);
  }
  geo.computeVertexNormals();
  add(g, geo, std('#8a5c44', 0.95, 0.05, { flatShading: false }), 0, 0.2, 0);
  // abraded patch showing the pale, spotted interior ("leopard spots")
  const tex = leopardTexture();
  const patch = add(g, new THREE.CircleGeometry(0.62, 28), std('#ffffff', 0.7, 0.05, { map: tex }), 0.1, 0.78, 0.05, -Math.PI / 2, 0, 0);
  patch.castShadow = false;
  // UV laser scan beam and fluorescence halo (animated by setScan)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#b46bff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = add(g, new THREE.CylinderGeometry(0.02, 0.2, 1.8, 14, 1, true), beamMat, 0.1, 1.7, 0.05);
  beam.castShadow = false;
  const haloMat = new THREE.MeshBasicMaterial({ color: '#7dffcf', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const halo = add(g, new THREE.RingGeometry(0.45, 0.85, 36), haloMat, 0.1, 0.8, 0.05, -Math.PI / 2, 0, 0);
  halo.castShadow = false;
  const light = new THREE.PointLight('#9e7bff', 0, 7, 2);
  light.position.set(0.1, 1.2, 0.05);
  g.add(light);
  return {
    group: g,
    /** k in [0,1] while abrading; `done` leaves a gentle teal fluorescence glow. */
    setScan(k, done, t = 0) {
      beamMat.opacity = k > 0 && !done ? 0.35 + Math.sin(t * 40) * 0.15 : 0;
      haloMat.opacity = done ? 0.35 + Math.sin(t * 2.4) * 0.12 : k * 0.35;
      light.intensity = done ? 2 : k * 6;
      halo.scale.setScalar(1 + (done ? Math.sin(t * 2.4) * 0.06 : k * 0.2));
    },
  };
}

// ---------------------------------------------------------------- shared helpers
const HOLO_WIRE = new THREE.MeshBasicMaterial({ color: '#58e1ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
const HOLO_SOLID = new THREE.MeshBasicMaterial({ color: '#58e1ff', transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });

/** Convert a model to a cyan holographic "prime-state ghost": every mesh is drawn as wireframe + a faint solid shell. */
export function toHologram(group) {
  const meshes = [];
  group.traverse((o) => {
    if (o.isMesh) meshes.push(o);
    if (o.isLight) o.intensity = 0;
  });
  for (const m of meshes) {
    m.castShadow = false;
    m.receiveShadow = false;
    const shell = new THREE.Mesh(m.geometry, HOLO_SOLID);
    shell.renderOrder = 4;
    m.material = HOLO_WIRE;
    m.renderOrder = 5;
    m.add(shell);
  }
  return group;
}

/** Fade a dormant machine toward dust and rust (weathered look) without touching shared materials. */
export function weather(group, amount = 0.45) {
  const dust = new THREE.Color('#9b6a4b');
  group.traverse((o) => {
    if (o.isMesh && o.material?.color && o.material.isMeshStandardMaterial) {
      o.material = o.material.clone();
      o.material.color.lerp(dust, amount);
      o.material.roughness = Math.min(1, o.material.roughness + 0.25);
    }
  });
  return group;
}

export function buildPioneerModel(kind) {
  if (kind === 'mer') return buildMer();
  if (kind === 'insight') return buildInsight();
  if (kind === 'heli') return buildIngenuity();
  if (kind === 'alsep') return buildAlsep();
  if (kind === 'surveyor') return buildSurveyor();
  return buildMer();
}
