// 15-second interactive Entry, Descent & Landing: plasma entry, the binary-coded
// "DARE MIGHTY THINGS" parachute, then a player-throttled sky-crane descent.

import * as THREE from 'three';
import { createRenderer, makeEnvironment, watchResize, runLoop, disposeScene } from './engine.js';
import { getTextures } from './textures.js';
import { M, glow, createRover } from './models.js';
import { heightAt } from '../game/terrain.js';
import { LZ } from '../game/data.js';

export const EDL_TIMES = { entry: 3.5, chute: 7, total: 15 };
const G = 3.71;

// Perseverance's canopy encoded "DARE MIGHTY THINGS" in 10-bit codes (A=1) on three inner
// rings, plus the JPL coordinates on the outer ring. We render the same scheme.
function parachuteTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');
  const cx = 512;
  const cy = 512;
  const words = ['DARE', 'MIGHTY', 'THINGS'];
  const rings = [
    { r0: 90, r1: 210, bits: [] },
    { r0: 210, r1: 330, bits: [] },
    { r0: 330, r1: 450, bits: [] },
  ];
  words.forEach((w, i) => {
    const bits = [];
    for (const ch of w) {
      const code = ch.charCodeAt(0) - 64;
      const b = code.toString(2).padStart(7, '0');
      for (const d of b) bits.push(d === '1');
      bits.push(false, false, false);
    }
    rings[i].bits = bits;
  });
  const gores = 80;
  ctx.fillStyle = '#f5f5f2';
  ctx.beginPath();
  ctx.arc(cx, cy, 500, 0, Math.PI * 2);
  ctx.fill();
  rings.forEach((ring) => {
    for (let k = 0; k < gores; k++) {
      const on = ring.bits[k % ring.bits.length];
      if (!on) continue;
      const a0 = (k / gores) * Math.PI * 2;
      const a1 = ((k + 1) / gores) * Math.PI * 2;
      ctx.fillStyle = '#e8622a';
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r1, a0, a1);
      ctx.arc(cx, cy, ring.r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
  });
  // outer band: alternating, with a gap band (disk-gap-band design)
  for (let k = 0; k < gores; k++) {
    if (k % 3 === 0) continue;
    const a0 = (k / gores) * Math.PI * 2;
    const a1 = ((k + 1) / gores) * Math.PI * 2;
    ctx.fillStyle = k % 2 ? '#e8622a' : '#f5f5f2';
    ctx.beginPath();
    ctx.arc(cx, cy, 500, a0, a1);
    ctx.arc(cx, cy, 462, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let k = 0; k < gores; k++) {
    const a = (k / gores) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 500, cy + Math.sin(a) * 500);
    ctx.stroke();
  }
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(cx, cy, 40, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class SkyCraneScene {
  constructor(container, cb, { mass = 150, heavy = false, auto = false } = {}) {
    this.cb = cb;
    this.container = container;
    this.mass = mass;
    this.auto = auto;
    this.renderer = createRenderer(container);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x120604);
    this.scene.fog = new THREE.FogExp2(0xb7764a, 0.004);
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.3;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this.t = 0;
    this.thrust = false;
    this.fuel = 8;
    // Heavier payloads in thin air: weaker deceleration per unit thrust.
    this.thrustAcc = 10 * Math.sqrt(200 / Math.max(200, mass)) * (heavy ? 0.94 : 1);
    this.h = 70;
    this.v = -16;
    this.landed = false;
    this.result = null;

    const T = getTextures();
    const m = M();
    // ground
    const gy = heightAt(LZ.x, LZ.z);
    this.gy = gy;
    const geo = new THREE.PlaneGeometry(600, 600, 120, 120);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * 0.25 + LZ.x;
      const z = p.getZ(i) * 0.25 + LZ.z;
      p.setY(i, (heightAt(x, z) - gy) * 4);
    }
    geo.computeVertexNormals();
    const reg = T.regolith.clone();
    reg.wrapS = reg.wrapT = THREE.RepeatWrapping;
    reg.repeat.set(30, 30);
    reg.needsUpdate = true;
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: reg, color: 0xd08a5a, roughness: 1 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    const zone = new THREE.Mesh(new THREE.RingGeometry(4, 4.6, 48), new THREE.MeshBasicMaterial({ color: 0x3dff8a, transparent: true, opacity: 0.8 }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.15;
    this.scene.add(zone);
    this.zone = zone;

    this.scene.add(new THREE.HemisphereLight(0xffd2a6, 0x3a1a0c, 0.9));
    const sun = new THREE.DirectionalLight(0xffe2c0, 3);
    sun.position.set(-40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -20;
    sc.right = sc.top = 20;
    this.scene.add(sun);

    // capsule (aeroshell + backshell)
    this.capsule = new THREE.Group();
    const heat = new THREE.Mesh(new THREE.SphereGeometry(4.5, 32, 12, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.7, emissive: 0xff5a14, emissiveIntensity: 2 }));
    heat.position.y = 3.2;
    this.heatMat = heat.material;
    const back = new THREE.Mesh(new THREE.ConeGeometry(4.2, 4.2, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6, side: THREE.DoubleSide }));
    back.position.y = 1.6;
    this.capsule.add(heat, back);
    this.scene.add(this.capsule);
    // plasma sheath
    this.plasma = new THREE.Mesh(
      new THREE.ConeGeometry(6, 18, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.plasma.position.y = 9;
    this.capsule.add(this.plasma);
    const sparkGeo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(500 * 3);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffb36b, size: 0.6, map: T.dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sparks.frustumCulled = false;
    this.capsule.add(this.sparks);

    // parachute
    this.chute = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(9, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.32),
      new THREE.MeshStandardMaterial({ map: parachuteTexture(), side: THREE.DoubleSide, roughness: 0.85 }),
    );
    // planar UV projection so the binary rings read correctly from below
    const cp = canopy.geometry.attributes.position;
    const uv = canopy.geometry.attributes.uv;
    for (let i = 0; i < cp.count; i++) uv.setXY(i, 0.5 + cp.getX(i) / 18, 0.5 + cp.getZ(i) / 18);
    canopy.position.y = 14;
    this.chute.add(canopy);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const pts = [new THREE.Vector3(Math.cos(a) * 7.6, 18.6, Math.sin(a) * 7.6), new THREE.Vector3(0, 3.2, 0)];
      this.chute.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xdddddd })));
    }
    this.chute.visible = false;
    this.scene.add(this.chute);

    // sky crane descent stage + rover on bridles
    this.crane = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.6, 8), m.foil);
    deck.position.y = 3.4;
    this.crane.add(deck);
    this.flames = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const noz = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 12, 1, true), m.darkMetal);
      noz.position.set(Math.cos(a) * 1.9, 3.0, Math.sin(a) * 1.9);
      this.crane.add(noz);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 2.4, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      );
      flame.rotation.x = Math.PI;
      flame.position.set(Math.cos(a) * 1.9, 1.6, Math.sin(a) * 1.9);
      this.crane.add(flame);
      this.flames.push(flame);
    }
    this.rover = createRover({ dusty: false, buried: false });
    this.rover.children.forEach((c) => {
      if (c.isMesh && c.geometry.type === 'SphereGeometry') c.visible = false;
    });
    this.rover.children[0].rotation.set(0, 0, 0);
    this.rover.scale.setScalar(1.2);
    this.crane.add(this.rover);
    this.bridles = [];
    for (const [x, z] of [
      [0.6, 0.5],
      [-0.6, 0.5],
      [0, -0.6],
    ]) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 3.1, z), new THREE.Vector3(x, 1.3, z)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
      this.crane.add(l);
      this.bridles.push(l);
    }
    this.crane.visible = false;
    this.scene.add(this.crane);

    // dust kicked up near the ground
    const dustGeo = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(600 * 3);
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xc98556, size: 1.2, map: T.dot, transparent: true, opacity: 0, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.dustSeed = Array.from({ length: 600 }, () => [Math.random() * Math.PI * 2, Math.random()]);

    this.stopResize = watchResize(container, this.renderer, this.camera);
    this.stopLoop = runLoop((dt) => this.update(dt));
  }

  setThrust(on) {
    this.thrust = !!on;
  }

  phase() {
    if (this.t < EDL_TIMES.entry) return 'entry';
    if (this.t < EDL_TIMES.chute) return 'chute';
    return this.landed ? 'landed' : 'powered';
  }

  update(dt) {
    this.t += dt;
    const ph = this.phase();
    const shake = ph === 'entry' ? 0.6 : ph === 'chute' ? 0.15 : 0.05;

    if (ph === 'entry') {
      const k = this.t / EDL_TIMES.entry;
      const alt = 900 - k * 500;
      this.capsule.position.set(0, alt, 0);
      this.capsule.rotation.set(0.25, this.t * 0.2, 0);
      this.heatMat.emissiveIntensity = 3 * (1 - k * 0.6);
      this.plasma.material.opacity = 0.6 * (1 - k * 0.5) * (0.8 + Math.random() * 0.2);
      for (let i = 0; i < 500; i++) {
        const a = i * 2.399 + this.t * 3;
        const r = 4 + ((i * 13) % 30) / 10;
        this.sparkPos[i * 3] = Math.cos(a) * r;
        this.sparkPos[i * 3 + 1] = 3 + (((i * 7 + this.t * 60) % 40) / 40) * 20;
        this.sparkPos[i * 3 + 2] = Math.sin(a) * r;
      }
      this.sparks.geometry.attributes.position.needsUpdate = true;
      this.camera.position.set(14, alt - 10, 22);
      this.camera.lookAt(0, alt + 2, 0);
      this.scene.background.setRGB(0.3 * (1 - k) + 0.1, 0.08, 0.03);
    } else if (ph === 'chute') {
      const k = (this.t - EDL_TIMES.entry) / (EDL_TIMES.chute - EDL_TIMES.entry);
      const alt = 400 - k * 280;
      this.chute.visible = true;
      this.plasma.visible = false;
      this.sparks.visible = false;
      this.capsule.position.set(Math.sin(this.t * 1.3) * 0.6, alt, 0);
      this.capsule.rotation.set(Math.sin(this.t * 2) * 0.05, 0, Math.cos(this.t * 1.7) * 0.05);
      this.chute.position.copy(this.capsule.position);
      this.chute.scale.setScalar(Math.min(1, k * 4 + 0.2));
      this.heatMat.emissiveIntensity = 0.3;
      this.camera.position.set(0, alt - 22, 26);
      this.camera.lookAt(0, alt + 10, 0);
      this.scene.background.lerp(new THREE.Color(0xc98a5e), 0.03);
    } else if (ph === 'powered') {
      if (!this.crane.visible) {
        this.crane.visible = true;
        this.capsule.visible = false;
        this.chute.visible = false;
        this.cb.onPhase?.('powered');
      }
      // Autopilot (Judge demo): follow a constant-deceleration braking profile.
      if (this.auto) {
        const an = this.thrustAcc - G;
        const vd = -Math.sqrt(2 * an * 0.75 * Math.max(0, this.h) + 1.44);
        this.thrust = this.v < vd;
      }
      const firing = this.thrust && this.fuel > 0;
      if (firing) this.fuel = Math.max(0, this.fuel - dt);
      const a = (firing ? this.thrustAcc : 0) - G;
      this.v += a * dt;
      this.h += this.v * dt;
      this.flames.forEach((f) => {
        f.visible = firing;
        f.scale.y = 0.8 + Math.random() * 0.5;
      });
      // force touchdown at the 15 s mark
      if (this.t >= EDL_TIMES.total && this.h > 0) {
        this.v = Math.min(this.v, -4.5);
        this.h = 0;
      }
      if (this.h <= 0) {
        this.h = 0;
        this.landed = true;
        const speed = Math.abs(this.v);
        this.result = { speed, soft: speed <= 2.5, crash: speed > 6, fuel: this.fuel };
        this.cb.onDone?.(this.result);
        this.cutT = 0;
      }
      this.crane.position.set(0, this.h + 0.2, 0);
      // dust plume as thrusters near the ground
      const near = Math.max(0, 1 - this.h / 30) * (firing ? 1 : 0.4);
      this.dust.material.opacity = near * 0.7;
      for (let i = 0; i < 600; i++) {
        const [ang, r] = this.dustSeed[i];
        const rr = (r * 18 + this.t * 6) % 18;
        this.dustPos[i * 3] = Math.cos(ang) * rr;
        this.dustPos[i * 3 + 1] = 0.3 + (r * 3) * (1 - rr / 18);
        this.dustPos[i * 3 + 2] = Math.sin(ang) * rr;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
      this.camera.position.set(10, this.h * 0.6 + 4, 14);
      this.camera.lookAt(0, this.h * 0.8 + 1, 0);
      this.cb.onTelemetry?.({ h: this.h, v: this.v, fuel: this.fuel, t: this.t, firing });
    } else {
      // cut bridles, crane flies away
      this.cutT += dt;
      this.bridles.forEach((b) => (b.visible = false));
      const fly = this.cutT;
      this.flames.forEach((f) => (f.visible = true));
      const deckOnly = this.crane.children.filter((c) => c !== this.rover);
      deckOnly.forEach((c) => {
        c.position.y += dt * (4 + fly * 6);
        c.position.x += dt * fly * 5;
      });
      this.camera.position.lerp(new THREE.Vector3(9, 4, 12), dt);
      this.camera.lookAt(0, 1.5, 0);
    }

    if (ph !== 'landed') {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    this.zone.material.opacity = 0.5 + 0.4 * Math.sin(this.t * 5);
    if (ph === 'entry' || ph === 'chute') this.cb.onTelemetry?.({ h: ph === 'entry' ? 125000 * (1 - this.t / EDL_TIMES.entry) + 11000 : 11000 * (1 - (this.t - EDL_TIMES.entry) / (EDL_TIMES.chute - EDL_TIMES.entry)) + 110, v: ph === 'entry' ? -5800 * (1 - this.t / EDL_TIMES.entry) - 400 : -400 + (this.t - EDL_TIMES.entry) * 54, fuel: this.fuel, t: this.t, firing: false });
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stopLoop();
    this.stopResize();
    disposeScene(this.scene, this.renderer);
  }
}
