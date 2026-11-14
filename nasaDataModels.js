// 3D builders for the NASA-resource-linked features: ESCAPADE twin orbiters,
// Apollo 12 ALSEP and Surveyor 3 (Lunar Heritage tab), and HiRISE dust aging.

import * as THREE from 'three';
import { M, glow } from '../three/models.js';
import { getTextures } from '../three/textures.js';
import { xrayCore } from '../three/engine.js';

const UP = new THREE.Vector3(0, 1, 0);
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function strut(a, b, r, mat) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, vb.clone().sub(va).normalize());
  return m;
}

// ------------------------------------------------------------ ESCAPADE

export function createEscapade(color) {
  const m = M();
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), m.foil));
  for (const s of [-1, 1]) {
    const wing = mesh(new THREE.BoxGeometry(1.6, 0.04, 0.7), m.solar, s * 1.25, 0, 0);
    g.add(wing);
  }
  const boom = strut([0, 0.3, 0], [0, 1.4, 0], 0.03, m.metal);
  g.add(boom);
  const tag = mesh(new THREE.SphereGeometry(0.16, 12, 8), glow(color, 5), 0, 1.45, 0);
  tag.castShadow = false;
  g.add(tag);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: getTextures().dot, color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  halo.scale.setScalar(2.2);
  g.add(halo);
  return g;
}

export class EscapadePair {
  constructor(scene, { radius = 70, height = 34, center = new THREE.Vector3() } = {}) {
    this.blue = createEscapade(0x4aa3ff);
    this.gold = createEscapade(0xffc247);
    this.radius = radius;
    this.height = height;
    this.center = center;
    this.t = 0;
    this.synced = false;
    const lineMat = new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, fog: false });
    this.link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
    this.link.frustumCulled = false;
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 97 }, (_, i) => {
        const a = (i / 96) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      }),
    );
    this.orbit = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.2, fog: false }));
    this.orbit.position.copy(center);
    this.orbit.position.y += height;
    this.orbit.rotation.z = 0.25;
    scene.add(this.blue, this.gold, this.link, this.orbit);
  }
  update(dt) {
    this.t += dt * 0.25;
    const place = (o, a) => {
      const p = new THREE.Vector3(Math.cos(a) * this.radius, 0, Math.sin(a) * this.radius);
      p.applyEuler(this.orbit.rotation);
      o.position.copy(p).add(this.center);
      o.position.y += this.height;
      o.rotation.y += dt * 0.6;
    };
    place(this.blue, this.t);
    place(this.gold, this.t + 0.55);
    const pos = this.link.geometry.attributes.position;
    pos.setXYZ(0, this.blue.position.x, this.blue.position.y, this.blue.position.z);
    pos.setXYZ(1, this.gold.position.x, this.gold.position.y, this.gold.position.z);
    pos.needsUpdate = true;
    this.link.material.opacity = this.synced ? 0.5 + 0.3 * Math.sin(this.t * 20) : 0;
  }
}

// ------------------------------------------------------------ Apollo 12 ALSEP

export function createALSEP() {
  const m = M();
  const g = new THREE.Group();
  // Central Station with sunshade
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), m.foil, 0, 0.3, 0));
  const shade = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.7), m.white, 0, 0.75, 0);
  g.add(shade);
  for (const [x, z] of [
    [-0.4, -0.3],
    [0.4, -0.3],
    [-0.4, 0.3],
    [0.4, 0.3],
  ])
    g.add(strut([x, 0.45, z], [x, 0.75, z], 0.012, m.metal));
  g.add(strut([0.2, 0.75, 0], [0.5, 1.4, 0.1], 0.015, m.metal));
  const ant = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 10), m.white, 0.52, 1.55, 0.1);
  g.add(ant);
  // SNAP-27 RTG with fins
  const rtg = new THREE.Group();
  rtg.position.set(-1.6, 0, 0.6);
  rtg.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 18), m.darkMetal, 0, 0.35, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fin = mesh(new THREE.BoxGeometry(0.02, 0.45, 0.22), m.metal, Math.cos(a) * 0.28, 0.35, Math.sin(a) * 0.28);
    fin.rotation.y = Math.PI / 2 - a;
    rtg.add(fin);
  }
  const core = xrayCore(0xff6a1a, 0.1, 0.36);
  core.position.y = 0.35;
  rtg.add(core);
  g.add(rtg);
  // Passive Seismic Experiment under its thermal shroud
  const pse = mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.3, 18), m.foil, 1.5, 0.15, -0.4);
  g.add(pse);
  const skirt = mesh(new THREE.CircleGeometry(0.7, 24), m.foil, 1.5, 0.01, -0.4);
  skirt.rotation.x = -Math.PI / 2;
  g.add(skirt);
  // Magnetometer: three arms with sensor heads
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(strut([0.2, 0.3, 1.4], [0.2 + Math.cos(a) * 0.6, 0.6, 1.4 + Math.sin(a) * 0.6], 0.012, m.white));
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), m.white, 0.2 + Math.cos(a) * 0.6, 0.6, 1.4 + Math.sin(a) * 0.6));
  }
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), m.foil, 0.2, 0.15, 1.4));
  // Dust Detector: three tiny solar cells on the central station
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.08, 0.01, 0.08), m.solar, -0.2 + i * 0.1, 0.49, 0.2));
  // cables
  g.add(strut([-1.6, 0.05, 0.6], [-0.35, 0.05, 0.1], 0.008, m.black));
  g.add(strut([1.5, 0.05, -0.4], [0.35, 0.05, -0.1], 0.008, m.black));
  return g;
}

// ------------------------------------------------------------ Surveyor 3

export function createSurveyor() {
  const m = M();
  const g = new THREE.Group();
  // Triangular spaceframe
  const top = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    top.push([Math.cos(a) * 0.5, 1.6, Math.sin(a) * 0.5]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = [Math.cos(a) * 1.55, 0.08, Math.sin(a) * 1.55];
    g.add(strut(top[i], foot, 0.03, m.metal));
    g.add(strut([Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5], foot, 0.025, m.metal));
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 16), m.white, foot[0], 0.05, foot[2]));
    g.add(strut(top[i], top[(i + 1) % 3], 0.025, m.metal));
  }
  g.add(mesh(new THREE.SphereGeometry(0.32, 16, 12), m.white, 0, 1.1, 0));
  // mast with planar array and high-gain antenna
  g.add(strut([0, 1.6, 0], [0, 3.0, 0], 0.03, m.metal));
  const array = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.6), m.solar, 0.4, 3.0, 0);
  array.rotation.z = 0.3;
  g.add(array);
  const hga = mesh(new THREE.BoxGeometry(0.7, 0.03, 0.7), m.white, -0.4, 2.8, 0);
  hga.rotation.z = -0.5;
  g.add(hga);
  // TV camera (returned by Apollo 12) with mirror hood
  const cam = new THREE.Group();
  cam.position.set(0.55, 1.2, 0.35);
  cam.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 14), m.white, 0, 0, 0));
  const hood = mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), m.glass, 0, 0.28, 0.04);
  hood.rotation.x = 0.5;
  cam.add(hood);
  const optics = xrayCore(0x35d6ff, 0.05);
  optics.position.y = 0.2;
  cam.add(optics);
  g.add(cam);
  // surface sampler scoop arm
  g.add(strut([-0.4, 1.0, 0.3], [-1.2, 0.5, 0.9], 0.02, m.metal));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), m.darkMetal, -1.22, 0.45, 0.92));
  // trench it dug in 1967
  const trench = mesh(new THREE.BoxGeometry(0.2, 0.02, 0.9), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 }), -1.3, 0.01, 1.4);
  g.add(trench);
  return g;
}

// ------------------------------------------------------------ HiRISE dust aging

const DUST = new THREE.Color(0xc98556);
const MOON_DUST = new THREE.Color(0x9a9a96);

// k: 0 = landing day, 1 = final sol. Works on any model; restores exactly at k = 0.
export function applyDustAge(root, k, lunar = false) {
  const dust = lunar ? MOON_DUST : DUST;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.xrayCore || o.userData.noDust) return;
    if (!o.userData.dustMat) {
      o.userData.baseMat = o.material;
      o.userData.dustMat = Array.isArray(o.material) ? o.material.map((mm) => mm.clone()) : o.material.clone();
    }
    const mats = Array.isArray(o.userData.dustMat) ? o.userData.dustMat : [o.userData.dustMat];
    const base = Array.isArray(o.userData.baseMat) ? o.userData.baseMat : [o.userData.baseMat];
    mats.forEach((mm, i) => {
      const b = base[i];
      if (!mm.color || !b.color) return;
      mm.color.copy(b.color).lerp(dust, Math.min(1, k * 0.85));
      if ('roughness' in mm) mm.roughness = b.roughness + (1 - b.roughness) * k;
      if ('metalness' in mm) mm.metalness = b.metalness * (1 - 0.85 * k);
      if (mm.emissive && b.emissive) mm.emissiveIntensity = b.emissiveIntensity * (1 - 0.6 * k);
    });
    o.material = Array.isArray(o.userData.dustMat) ? o.userData.dustMat : o.userData.dustMat;
  });
}
