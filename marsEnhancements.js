// Mars Enhancements: EDL debris landmarks, UHF Ghost Mesh relay arcs, ISRU regolith berm,
// Titanium memorial plaque, holographic prime-state replays, heritage landmarks,
// lava tube skylight, Earth-Moon pinpoint, scan laser pulse and the HUD seismograph.
// Everything is procedural geometry or canvas: no external assets.

import * as THREE from 'three';
import { M, glow, createHardware, rockGeometry } from '../three/models.js';
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

function seeded(seed) {
  let a = seed * 2654435761;
  return () => {
    a = (a * 1664525 + 1013904223) | 0;
    return (a >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ EDL debris

export function createEdlDebris(id) {
  const m = M();
  const g = new THREE.Group();
  const r = seeded(id.length * 7 + 3);
  if (id === 'ballast') {
    // Two tungsten balance-mass impact craters with the blocks half-buried.
    for (const dx of [-1.6, 1.6]) {
      const ring = mesh(new THREE.TorusGeometry(1.1, 0.28, 8, 24), m.dust, dx, 0.02, 0);
      ring.rotation.x = Math.PI / 2;
      ring.scale.z = 0.45;
      g.add(ring);
      const pit = mesh(new THREE.CircleGeometry(1.0, 24), new THREE.MeshStandardMaterial({ color: 0x3a2116, roughness: 1 }), dx, 0.03, 0);
      pit.rotation.x = -Math.PI / 2;
      g.add(pit);
      const block = mesh(new THREE.BoxGeometry(0.45, 0.3, 0.32), new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.9, roughness: 0.35 }), dx, 0.05, 0);
      block.rotation.set(0.4, r() * 3, 0.3);
      g.add(block);
    }
  } else if (id === 'chute') {
    // Shredded white-and-orange canopy draped over rocks.
    const geo = new THREE.PlaneGeometry(3.4, 2.4, 18, 12);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 2.1) * 0.12 + Math.cos(y * 3.3) * 0.08 + Math.max(0, 0.5 - Math.hypot(x - 0.6, y + 0.2)) * 0.6);
    }
    geo.computeVertexNormals();
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#f2f2ee' : '#e8622a';
      ctx.fillRect(i * 16, 0, 16, 128);
    }
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc(r() * 128, r() * 128, 4 + r() * 12, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const cloth = mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 }), 0, 0.12, 0);
    cloth.rotation.x = -Math.PI / 2;
    g.add(cloth);
    for (let i = 0; i < 4; i++) {
      const line = strut([r() * 3 - 1.5, 0.05, r() * 2 - 1], [r() * 3 - 1.5, 0.05, r() * 2 - 1], 0.008, m.white);
      g.add(line);
    }
  } else {
    // Sky-crane descent stage wreckage: crumpled deck, bent struts, scorched ground.
    const scorch = mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshStandardMaterial({ color: 0x231510, roughness: 1, transparent: true, opacity: 0.85 }), 0, 0.02, 0);
    scorch.rotation.x = -Math.PI / 2;
    g.add(scorch);
    const deck = mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 6), m.foil, 0, 0.3, 0);
    deck.rotation.set(0.5, 0.3, -0.35);
    g.add(deck);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      g.add(strut([Math.cos(a) * 0.7, 0.4, Math.sin(a) * 0.7], [Math.cos(a) * 1.8, 0.05 + r() * 0.3, Math.sin(a) * 1.8], 0.05, m.metal));
    }
    const noz = mesh(new THREE.ConeGeometry(0.25, 0.4, 14, 1, true), m.darkMetal, 1.4, 0.15, -0.6);
    noz.rotation.z = 1.4;
    g.add(noz);
    const tank = mesh(new THREE.SphereGeometry(0.32, 14, 10), m.white, -1.2, 0.25, 0.8);
    tank.scale.y = 0.7;
    g.add(tank);
  }
  return g;
}

// ------------------------------------------------------------ Ghost Mesh relay arcs

export class GhostMesh {
  constructor(scene) {
    this.scene = scene;
    this.links = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x35d6ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.pulses = [];
  }

  setNodes(points) {
    // points: [{id, v: Vector3}] ; connect consecutive and close the loop when >2.
    this.group.clear();
    this.pulses = [];
    if (points.length < 2) return;
    const pairs = [];
    for (let i = 0; i < points.length - 1; i++) pairs.push([points[i], points[i + 1]]);
    if (points.length > 2) pairs.push([points[points.length - 1], points[0]]);
    for (const [a, b] of pairs) {
      const mid = a.v.clone().add(b.v).multiplyScalar(0.5);
      mid.y += a.v.distanceTo(b.v) * 0.28 + 2;
      const curve = new THREE.QuadraticBezierCurve3(a.v.clone(), mid, b.v.clone());
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.06, 6, false), this.mat);
      tube.userData.noXray = true;
      this.group.add(tube);
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), glow(0x9ff4ff, 6));
      pulse.userData.noXray = true;
      this.group.add(pulse);
      this.pulses.push({ curve, pulse, t: Math.random() });
    }
  }

  update(dt, time) {
    this.mat.opacity = 0.45 + 0.3 * Math.sin(time * 3);
    for (const p of this.pulses) {
      p.t = (p.t + dt * 0.35) % 1;
      p.pulse.position.copy(p.curve.getPoint(p.t));
    }
  }
}

// ------------------------------------------------------------ ISRU regolith berm

export function createBerm() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b3a22';
  ctx.fillRect(0, 0, 128, 64);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const x = col * 26 + (row % 2 ? 13 : 0) - 6;
      ctx.fillStyle = `hsl(${18 + (row * 7 + col * 3) % 8}, 48%, ${30 + ((row + col) % 3) * 4}%)`;
      ctx.fillRect(x + 1, row * 16 + 1, 24, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 1.4);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.05, emissive: 0x220a02, emissiveIntensity: 0.4 });
  const wall = mesh(new THREE.CylinderGeometry(3.1, 3.4, 1.1, 48, 1, true, 0.5, Math.PI * 1.55), mat, 0, 0.55, 0);
  wall.material.side = THREE.DoubleSide;
  g.add(wall);
  const cap = mesh(new THREE.TorusGeometry(3.15, 0.18, 6, 48, Math.PI * 1.55), mat, 0, 1.1, 0);
  // Map the torus arc onto the cylinder's theta range (see three.js CylinderGeometry winding).
  cap.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.5 - Math.PI * 1.55);
  g.add(cap);
  // printer nozzle glow on the newest course
  const head = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), glow(0xff7a2a, 4), 3.1, 1.25, 0);
  head.userData.noXray = true;
  g.add(head);
  g.userData.head = head;
  g.userData.grow = 0;
  g.scale.y = 0.01;
  return g;
}

// ------------------------------------------------------------ titanium plaque

export function plaqueTexture({ team, message, patchCanvas, sol }) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 320);
  grad.addColorStop(0, '#9aa3ad');
  grad.addColorStop(0.5, '#d7dde3');
  grad.addColorStop(1, '#7f8892');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 320);
  for (let i = 0; i < 320; i += 2) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + ((i * 13) % 7) * 0.006})`;
    ctx.fillRect(0, i, 512, 1);
  }
  ctx.strokeStyle = '#3b4148';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 300);
  if (patchCanvas) ctx.drawImage(patchCanvas, 26, 70, 160, 160);
  ctx.fillStyle = '#1d2228';
  ctx.font = 'bold 20px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('SOL 60 · RED HORIZON', 206, 64);
  ctx.font = 'bold 30px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(String(team || 'TEAM ARES').slice(0, 22).toUpperCase(), 206, 112);
  ctx.font = '18px ui-monospace, Menlo, Consolas, monospace';
  const words = String(message || 'We came in peace for all humankind.').slice(0, 90).split(' ');
  let line = '';
  let y = 150;
  for (const w of words) {
    if ((line + w).length > 24) {
      ctx.fillText(line, 206, y);
      line = '';
      y += 26;
    }
    line += w + ' ';
  }
  ctx.fillText(line, 206, y);
  ctx.font = 'bold 16px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`GALE CRATER · MOUNT SHARP · SOL ${sol || 6}`, 206, 282);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createPlaque(opts) {
  const m = M();
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), m.metal, 0, 0.55, 0));
  const face = mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.06),
    [
      m.metal,
      m.metal,
      m.metal,
      m.metal,
      new THREE.MeshStandardMaterial({ map: plaqueTexture(opts), metalness: 0.75, roughness: 0.32, emissive: 0x334455, emissiveIntensity: 0.35 }),
      m.metal,
    ],
    0,
    1.45,
    0,
  );
  face.rotation.x = -0.25;
  g.add(face);
  const halo = new THREE.PointLight(0x9fe8ff, 6, 5, 1.6);
  halo.position.set(0, 1.6, 0.6);
  g.add(halo);
  g.userData.face = face;
  g.userData.setContent = (o) => {
    face.material[4].map?.dispose();
    face.material[4].map = plaqueTexture(o);
    face.material[4].needsUpdate = true;
  };
  return g;
}

// ------------------------------------------------------------ holographic prime-state replay

const HOLO_MAT = new THREE.MeshBasicMaterial({
  color: 0x5ff2ff,
  wireframe: true,
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});

export function createHologram(id) {
  const g = new THREE.Group();
  const model = createHardware(id);
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = HOLO_MAT;
      o.castShadow = false;
      o.receiveShadow = false;
      o.userData.noXray = true;
    }
    if (o.isLight) o.visible = false;
  });
  // Restore prime-state posture: lift buried / tilted parts out of the dust.
  model.children.forEach((c) => {
    if (c.isMesh && c.geometry.type === 'SphereGeometry' && c.scale.y < 0.5) c.visible = false;
  });
  const inner = model.children[0];
  if (inner && inner.isGroup) {
    inner.rotation.set(0, 0, 0);
    inner.position.y = 0;
  }
  g.add(model);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.75, 48), HOLO_MAT);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 0.2, 2.4, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = -1.2;
  beam.userData.noXray = true;
  g.add(beam);

  // Find animatable parts by geometry signature.
  const rotors = [];
  const wheels = [];
  const arms = [];
  model.traverse((o) => {
    if (o.isGroup && o.children.some((c) => c.geometry?.type === 'BoxGeometry' && c.geometry.parameters.width > 0.8 && c.geometry.parameters.height < 0.03)) rotors.push(o);
    if (o.isMesh && o.geometry.type === 'CylinderGeometry' && Math.abs(o.geometry.parameters.radiusTop - 0.26) < 0.001) wheels.push(o);
    if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.phiLength === Math.PI * 2 && o.geometry.parameters.thetaLength === Math.PI / 2) arms.push(o);
  });
  const seis = arms[0];
  const seisHome = seis ? seis.position.clone() : null;
  let t = 0;
  g.userData.update = (dt) => {
    t += dt;
    ring.rotation.z += dt * 0.8;
    HOLO_MAT.opacity = 0.4 + 0.2 * Math.sin(t * 6);
    if (id === 'ingenuity') {
      rotors.forEach((r, i) => (r.rotation.y += dt * (i % 2 ? -38 : 38)));
      model.position.y = 0.6 + Math.sin(t * 1.3) * 0.5 + 0.5;
      model.rotation.y = Math.sin(t * 0.4) * 0.6;
    } else if (id === 'insight' && seis) {
      // Arm deploys SEIS from the deck to the ground and back.
      const k = 0.5 - 0.5 * Math.cos(t * 0.9);
      seis.position.set(seisHome.x * k + 0.1 * (1 - k), seisHome.y * k + 1.25 * (1 - k), seisHome.z * k + 0.6 * (1 - k));
      model.position.y = 0.2;
    } else {
      wheels.forEach((w) => (w.rotation.y += dt * 3));
      model.position.set(Math.sin(t * 0.5) * 1.2, 0.25, 0);
      model.rotation.y = Math.cos(t * 0.5) * 0.4;
    }
  };
  return g;
}

// ------------------------------------------------------------ heritage landmarks

export function createHeatShieldSite() {
  const m = M();
  const g = new THREE.Group();
  // Opportunity's inverted, crumpled heat shield.
  const shell = mesh(new THREE.SphereGeometry(1.3, 28, 10, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide }), 0, 0.1, 0);
  shell.rotation.set(Math.PI - 0.5, 0.2, 0.25);
  shell.scale.set(1, 0.5, 1);
  g.add(shell);
  const torn = mesh(new THREE.BoxGeometry(1.2, 0.04, 0.5), m.foil, 1.6, 0.06, 0.6);
  torn.rotation.set(0.1, 0.8, 0.2);
  g.add(torn);
  // Heat Shield Rock: iron-nickel meteorite with regmaglypt dimples.
  const rock = mesh(rockGeometry(42), new THREE.MeshStandardMaterial({ color: 0x3e3a36, metalness: 0.85, roughness: 0.38 }), -1.7, 0.35, -0.4);
  rock.scale.setScalar(0.42);
  g.add(rock);
  const core = xrayCore(0xffb020, 0.22);
  core.position.copy(rock.position);
  g.add(core);
  return g;
}

export function createSampleCache() {
  const g = new THREE.Group();
  const ti = new THREE.MeshStandardMaterial({ color: 0xd6dbe0, metalness: 1, roughness: 0.22 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x9ea7b0, metalness: 1, roughness: 0.3 });
  for (let i = 0; i < 6; i++) {
    const tube = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 14), ti, -0.5 + i * 0.2, 0.04, (i % 2) * 0.15);
    tube.rotation.z = Math.PI / 2;
    tube.rotation.y = 0.2 * i;
    g.add(tube);
    const cap = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12), capMat, -0.5 + i * 0.2 + 0.22 * Math.cos(0.2 * i), 0.04, (i % 2) * 0.15 - 0.22 * Math.sin(0.2 * i));
    cap.rotation.copy(tube.rotation);
    g.add(cap);
  }
  // Bright Angel / Cheyava Falls: arrowhead-shaped mudstone with "leopard spots".
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a5552f';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#efe4d0';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 20 + i * 24);
    ctx.lineTo(128, 10 + i * 26);
    ctx.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = (i * 37) % 128;
    const y = (i * 53) % 128;
    ctx.fillStyle = '#e9d2a6';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f1410';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const rock = mesh(rockGeometry(7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), 1.2, 0.35, -0.3);
  rock.scale.set(0.9, 0.55, 0.6);
  g.add(rock);
  // abrasion patch target ring
  const patch = mesh(new THREE.RingGeometry(0.12, 0.16, 24), glow(0x3dff8a, 3), 1.2, 0.72, -0.3);
  patch.rotation.x = -Math.PI / 2;
  patch.userData.noXray = true;
  g.add(patch);
  g.userData.rock = rock;
  return g;
}

export function createBoxwork() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8a07a, roughness: 0.92 });
  for (let i = -3; i <= 3; i++) {
    const a = mesh(new THREE.BoxGeometry(6.5, 0.35, 0.18), mat, 0, 0.17, i * 0.9);
    a.rotation.y = 0.15;
    g.add(a);
    const b = mesh(new THREE.BoxGeometry(0.18, 0.3, 6.5), mat, i * 0.9, 0.15, 0);
    b.rotation.y = 0.15;
    g.add(b);
  }
  return g;
}

export function createLavaTube() {
  const g = new THREE.Group();
  const pit = mesh(new THREE.CircleGeometry(1.8, 28), new THREE.MeshBasicMaterial({ color: 0x050302 }), 0, 0.04, 0);
  pit.rotation.x = -Math.PI / 2;
  g.add(pit);
  const lip = mesh(new THREE.TorusGeometry(1.9, 0.35, 8, 28), new THREE.MeshStandardMaterial({ color: 0x4a2a1c, roughness: 1 }), 0, 0.05, 0);
  lip.rotation.x = Math.PI / 2;
  lip.scale.z = 0.4;
  g.add(lip);
  const glowRing = mesh(new THREE.RingGeometry(1.95, 2.1, 36), glow(0x3dff8a, 2), 0, 0.08, 0);
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.userData.noXray = true;
  g.add(glowRing);
  g.userData.ring = glowRing;
  return g;
}

// Earth + Moon as a double star in the twilight sky.
export function createEarthPinpoint() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(150,200,255,0.9)');
  grd.addColorStop(1, 'rgba(60,120,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const earth = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9fd0ff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  earth.scale.setScalar(6);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdddddd, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  moon.scale.setScalar(2.4);
  moon.position.set(3.2, 1.2, 0);
  g.add(earth, moon);
  g.userData.earth = earth;
  g.userData.moon = moon;
  return g;
}

// ------------------------------------------------------------ scan laser pulse

export class LaserPulses {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.mat = new THREE.MeshBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  }
  fire(from, to) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8, 1, true), this.mat.clone());
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(UP, dir.normalize());
    beam.userData.noXray = true;
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), this.mat.clone());
    flash.position.copy(to);
    flash.userData.noXray = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 32), this.mat.clone());
    ring.position.copy(to);
    ring.lookAt(from);
    ring.userData.noXray = true;
    this.scene.add(beam, flash, ring);
    this.list.push({ beam, flash, ring, t: 0, pulses: 0 });
  }
  update(dt) {
    for (const p of this.list) {
      p.t += dt;
      const k = Math.max(0, 1 - p.t / 1.1);
      const strobe = 0.5 + 0.5 * Math.sin(p.t * 40);
      p.beam.material.opacity = k * strobe;
      p.flash.material.opacity = k;
      p.flash.scale.setScalar(1 + p.t * 2);
      p.ring.material.opacity = k;
      p.ring.scale.setScalar(1 + p.t * 6);
    }
    this.list = this.list.filter((p) => {
      if (p.t < 1.1) return true;
      for (const o of [p.beam, p.flash, p.ring]) {
        this.scene.remove(o);
        o.geometry.dispose();
        o.material.dispose();
      }
      return false;
    });
  }
}

// ------------------------------------------------------------ HUD seismograph

export function drawSeismograph(canvas, history, live) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = 'rgba(4,10,18,0.9)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(53,214,255,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.strokeStyle = live ? '#ffb020' : '#35d6ff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  history.forEach((v, i) => {
    const x = (i / Math.max(1, history.length - 1)) * w;
    const y = h / 2 - v * (h * 0.45);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// Synthetic marsquake trace: P arrival, then larger S, then coda.
export function quakeSample(t) {
  if (t < 0) return (Math.random() - 0.5) * 0.04;
  const p = t < 1.2 ? Math.sin(t * 40) * 0.25 * Math.exp(-t * 0.6) : 0;
  const s = t > 1.2 ? Math.sin(t * 22 + Math.sin(t * 5)) * 0.9 * Math.exp(-(t - 1.2) * 0.55) : 0;
  return p + s + (Math.random() - 0.5) * 0.08;
}
