// Stage 3: the Gale Crater surface. Reads the simulation every frame and renders the
// astronaut, ghost hardware, landmarks and the full Martian sky cycle (amber day,
// blue sunset, starlit night), plus storms, Phobos, Earth, quakes and the selfie camera.

import * as THREE from 'three';
import { createRenderer, makeEnvironment, watchResize, runLoop, disposeScene, setXRay, xrayCore } from './engine.js';
import { getTextures, labelSprite } from './textures.js';
import { M, glow, createAstronaut, createHardware, createDescentStage, rockGeometry } from './models.js';
import { heightAt, naturalColor, slopeAt, fbm } from '../game/terrain.js';
import { HARDWARE, LZ, SUMMIT, CRATERS, LANDMARKS, GEYSERS } from '../game/data.js';
import {
  createEdlDebris,
  GhostMesh,
  createBerm,
  createPlaque,
  createHologram,
  createHeatShieldSite,
  createSampleCache,
  createBoxwork,
  createLavaTube,
  createEarthPinpoint,
  LaserPulses,
} from '../systems/marsEnhancements.js';
import { Footprints, Geysers } from '../systems/ultimateFeatures.js';
import { EscapadePair } from '../systems/nasaDataModels.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const C = (h) => new THREE.Color(h);

// Sky palettes. The Martian sky is butterscotch by day; at sunset fine dust forward-scatters
// blue light, so a cold blue glow surrounds the Sun while the rest of the sky darkens.
const PAL = {
  day: { top: C('#b98a62'), hor: C('#e2b993'), glow: C('#fff0d6'), sun: C('#fff1dc'), fog: C('#c99a72') },
  dusk: { top: C('#2a2024'), hor: C('#7a5a52'), glow: C('#5fa8ff'), sun: C('#bcd8ff'), fog: C('#4a3c44') },
  night: { top: C('#020308'), hor: C('#0c0b14'), glow: C('#101830'), sun: C('#1a2540'), fog: C('#07070c') },
  storm: { top: C('#6a4026'), hor: C('#9a6238'), glow: C('#d49a62'), sun: C('#e0a874'), fog: C('#8a5634') },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHor;
uniform vec3 uGlow;
uniform vec3 uSunDir;
uniform float uGlowK;
uniform float uSunK;
varying vec3 vDir;
void main() {
  float h = max(vDir.y, 0.0);
  vec3 col = mix(uHor, uTop, pow(h, 0.55));
  float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  col += uGlow * (pow(d, 6.0) * 0.55 + pow(d, 40.0) * 0.9) * uGlowK;
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9997, d) * uSunK;
  if (vDir.y < 0.0) col = mix(col, uHor * 0.6, clamp(-vDir.y * 6.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class SurfaceScene {
  constructor(container, cb, opts) {
    this.container = container;
    this.cb = cb;
    this.opts = opts;
    this.renderer = createRenderer(container);
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc99a72, 0.012);
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.22;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
    this.cam = { yaw: 0, pitch: 0.32, dist: 7.5, userT: 0 };
    this.pointer = { down: false, x: 0, y: 0, moved: 0 };
    this.time = 0;
    this.shake = 0;
    this.quakeT = 0;
    this.knock = 0;
    this.gazeT = 0;
    this.selfie = false;
    this.xray = false;
    this.holos = {};
    this.hwState = {};
    this.heading = 0;
    this.last = null;
    this.tmp = new THREE.Vector3();

    this.buildSky();
    this.buildTerrain();
    this.buildRocks();
    this.buildLights();
    this.buildHardware();
    this.buildLandmarks();
    this.buildParticles();

    this.astro = createAstronaut();
    this.scene.add(this.astro);
    this.astroBody = this.astro.children[0];
    this.footprints = new Footprints(this.scene, heightAt);
    this.mesh = new GhostMesh(this.scene);
    this.lasers = new LaserPulses(this.scene);
    this.escapade = new EscapadePair(this.scene, { radius: 260, height: 170, center: new THREE.Vector3(0, 0, 0) });
    this.escapade.synced = !!opts.escapade;
    this.berm = null;
    this.plaque = null;

    this.bind();
    this.stopResize = watchResize(container, this.renderer, this.camera);
    this.stopLoop = runLoop((dt) => this.update(dt));
  }

  // ---------------------------------------------------------------- build

  buildSky() {
    this.skyU = {
      uTop: { value: PAL.day.top.clone() },
      uHor: { value: PAL.day.hor.clone() },
      uGlow: { value: PAL.day.glow.clone() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uGlowK: { value: 1 },
      uSunK: { value: 1 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 48, 24),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    sky.userData.noXray = true;
    sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);
    // stars
    const n = 1800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random() * 0.95 + 0.05;
      const th = u * Math.PI * 2;
      const ph = Math.acos(1 - v);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 560;
      pos[i * 3 + 1] = Math.cos(ph) * 560;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 560;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.userData.noXray = true;
    this.scene.add(this.stars);
    // Phobos silhouette
    this.phobos = new THREE.Mesh(rockGeometry(11), new THREE.MeshBasicMaterial({ color: 0x050403, fog: false }));
    this.phobos.scale.set(5.2, 3.6, 4.2);
    this.phobos.visible = false;
    this.phobos.userData.noXray = true;
    this.scene.add(this.phobos);
    this.earth = createEarthPinpoint();
    this.earth.visible = false;
    this.scene.add(this.earth);
  }

  buildTerrain() {
    const T = getTextures();
    const geo = new THREE.PlaneGeometry(130, 130, 300, 300);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const c = naturalColor(x, z, h, Math.min(1, slopeAt(x, z) / 0.85));
      col[i * 3] = c[0] * 1.6;
      col[i * 3 + 1] = c[1] * 1.6;
      col[i * 3 + 2] = c[2] * 1.6;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const map = T.regolith.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(40, 40);
    map.needsUpdate = true;
    const bump = T.regolithBump.clone();
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(40, 40);
    bump.needsUpdate = true;
    this.terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, vertexColors: true, roughness: 0.97, metalness: 0 }),
    );
    this.terrain.receiveShadow = true;
    this.terrain.userData.noXray = true;
    this.scene.add(this.terrain);

    // Low-resolution apron so the world never ends at a visible edge.
    const far = new THREE.PlaneGeometry(520, 520, 110, 110);
    far.rotateX(-Math.PI / 2);
    const fp = far.attributes.position;
    const fcol = new Float32Array(fp.count * 3);
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      const z = fp.getZ(i);
      const inside = Math.abs(x) < 60 && Math.abs(z) < 60;
      const h = heightAt(x, z);
      fp.setY(i, inside ? h - 4 : h - 0.15);
      const c = naturalColor(x, z, h, 0.2);
      fcol[i * 3] = c[0] * 1.6;
      fcol[i * 3 + 1] = c[1] * 1.6;
      fcol[i * 3 + 2] = c[2] * 1.6;
    }
    far.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    far.computeVertexNormals();
    const farMap = T.regolith.clone();
    farMap.wrapS = farMap.wrapT = THREE.RepeatWrapping;
    farMap.repeat.set(120, 120);
    farMap.needsUpdate = true;
    const apron = new THREE.Mesh(far, new THREE.MeshStandardMaterial({ map: farMap, vertexColors: true, roughness: 1 }));
    apron.receiveShadow = true;
    apron.userData.noXray = true;
    this.scene.add(apron);

    // Far crater rim silhouette ring.
    const ring = new THREE.CylinderGeometry(260, 260, 1, 160, 8, true);
    const rp = ring.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i);
      const z = rp.getZ(i);
      const y = rp.getY(i);
      const a = Math.atan2(z, x);
      const hgt = 14 + fbm(Math.cos(a) * 6 + 10, Math.sin(a) * 6 + 10, 4, 5) * 34;
      rp.setY(i, (y + 0.5) * hgt - 6);
    }
    ring.computeVertexNormals();
    const rim = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ color: 0x8a5634, roughness: 1, side: THREE.BackSide }));
    rim.userData.noXray = true;
    this.rim = rim;
    this.scene.add(rim);
  }

  buildRocks() {
    const m = M();
    const r = (() => {
      let a = 99;
      return () => {
        a = (a * 1664525 + 1013904223) | 0;
        return (a >>> 0) / 4294967296;
      };
    })();
    const route = this.opts.route;
    const nearRoute = (x, z) => route.samples.some((p) => Math.abs(p.x - x) < 1.6 && Math.abs(p.z - z) < 1.6);
    const mat = new THREE.MeshStandardMaterial({ map: getTextures().regolith, color: 0x9a6a4a, roughness: 0.95 });
    for (let k = 0; k < 3; k++) {
      const geo = rockGeometry(k + 3);
      const count = 260;
      const inst = new THREE.InstancedMesh(geo, mat, count);
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.userData.noXray = true;
      const d = new THREE.Object3D();
      let n = 0;
      for (let i = 0; i < count * 3 && n < count; i++) {
        const x = (r() - 0.5) * 120;
        const z = (r() - 0.5) * 120;
        if (nearRoute(x, z)) continue;
        const s = 0.12 + Math.pow(r(), 4) * 1.2;
        d.position.set(x, heightAt(x, z) + s * 0.25, z);
        d.rotation.set(r() * 3, r() * 6, r() * 3);
        d.scale.set(s, s * (0.6 + r() * 0.6), s);
        d.updateMatrix();
        inst.setMatrixAt(n++, d.matrix);
      }
      inst.count = n;
      this.scene.add(inst);
    }
    void m;
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xe0b48a, 0x3a1d10, 0.7);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 22;
    sc.bottom = -22;
    sc.near = 1;
    sc.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0x8fb8ff, 0.35);
    rim.position.set(30, 20, -30);
    this.scene.add(rim);
    this.rimLight = rim;
  }

  buildHardware() {
    this.hw = {};
    for (const h of HARDWARE) {
      const model = createHardware(h.id);
      const y = heightAt(h.pos.x, h.pos.z);
      model.position.set(h.pos.x, y, h.pos.z);
      model.rotation.y = h.pos.x * 0.37;
      // X-ray internals
      const core =
        h.id === 'insight' ? xrayCore(0x35d6ff, 0.22) : h.id === 'ingenuity' ? xrayCore(0x3dff8a, 0.1, 0.2) : xrayCore(0xff6a1a, 0.18, 0.2);
      core.position.y = h.id === 'insight' ? 0.96 : h.id === 'ingenuity' ? 0.62 : 0.74;
      model.add(core);
      this.scene.add(model);
      const label = labelSprite(h.name, { color: '#7fe9ff', scale: 0.4, sub: h.status });
      label.position.set(h.pos.x, y + 3.4, h.pos.z);
      label.visible = false;
      this.scene.add(label);
      this.hw[h.id] = { model, label, pos: new THREE.Vector3(h.pos.x, y, h.pos.z) };
    }
    const lander = createDescentStage();
    lander.scale.setScalar(0.42);
    const ly = heightAt(LZ.x + 2.2, LZ.z - 1.5);
    lander.position.set(LZ.x + 2.2, ly, LZ.z - 1.5);
    if (this.opts.has?.rtg) {
      const core = xrayCore(0xff6a1a, 0.4, 1.1);
      core.position.y = 1.4;
      lander.add(core);
    }
    this.scene.add(lander);
    this.lander = lander;
  }

  buildLandmarks() {
    this.lm = {};
    for (const l of LANDMARKS) {
      let obj;
      if (l.kind === 'edl') obj = createEdlDebris(l.id);
      else if (l.kind === 'heritage') obj = createHeatShieldSite();
      else if (l.kind === 'perseverance') obj = createSampleCache();
      else obj = createBoxwork();
      obj.position.set(l.x, heightAt(l.x, l.z), l.z);
      obj.scale.setScalar(l.kind === 'boxwork' ? 1 : 0.8);
      this.scene.add(obj);
      const label = labelSprite(l.name, { color: l.kind === 'edl' ? '#fcd34d' : '#c4b5fd', scale: 0.38 });
      label.position.set(l.x, heightAt(l.x, l.z) + 2.6, l.z);
      label.visible = false;
      this.scene.add(label);
      this.lm[l.id] = { obj, label, pos: new THREE.Vector3(l.x, heightAt(l.x, l.z) + 0.6, l.z) };
    }
    this.geysers = new Geysers(this.scene, GEYSERS, heightAt, getTextures().dot);
    for (const g of GEYSERS) this.lm[g.id] = { pos: new THREE.Vector3(g.x, heightAt(g.x, g.z) + 1.5, g.z) };
    // lava tube skylight beside the first crater the route crosses
    const c0 = this.opts.route.craters[0];
    if (c0) {
      const c = CRATERS.find((k) => k.id === c0.id);
      const tube = createLavaTube();
      const x = c.x + c.r * 0.55;
      const z = c.z - c.r * 0.3;
      tube.position.set(x, heightAt(x, z), z);
      this.scene.add(tube);
      this.tube = tube;
    }
    // summit beacon
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 60, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    beacon.position.set(SUMMIT.x, heightAt(SUMMIT.x, SUMMIT.z) + 30, SUMMIT.z);
    beacon.userData.noXray = true;
    this.scene.add(beacon);
  }

  buildParticles() {
    const n = 2200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xd9a070, size: 0.14, map: getTextures().dot, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.dust.frustumCulled = false;
    this.dust.userData.noXray = true;
    this.scene.add(this.dust);
  }

  // ---------------------------------------------------------------- API

  setXRay(on) {
    this.xray = on;
    setXRay(this.astro, on);
    for (const h of Object.values(this.hw)) setXRay(h.model, on);
    setXRay(this.lander, on);
  }

  setHardwareState(id, state) {
    this.hwState[id] = state;
    this.hw[id]?.model.userData.setState?.(state);
    this.refreshMesh();
  }

  refreshMesh() {
    const nodes = Object.entries(this.hwState)
      .filter(([id, st]) => st === 'preserve' && id !== 'ingenuity')
      .map(([id]) => ({ id, v: this.hw[id].pos.clone().add(new THREE.Vector3(0, 2.2, 0)) }));
    if (nodes.length) nodes.unshift({ id: 'lander', v: this.lander.position.clone().add(new THREE.Vector3(0, 2.5, 0)) });
    this.mesh.setNodes(nodes);
  }

  spawnHologram(id) {
    if (this.holos[id]) return;
    const h = createHologram(id);
    const p = this.hw[id].pos;
    h.position.set(p.x, p.y + 2.6, p.z);
    this.scene.add(h);
    this.holos[id] = h;
  }

  fireLaserAt(id) {
    const target = this.hw[id]?.pos || this.lm[id]?.pos;
    if (!target) return;
    const from = this.astro.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const to = target.clone().add(new THREE.Vector3(0, this.hw[id] ? 0.9 : 0.2, 0));
    this.lasers.fire(from, to);
  }

  quake(seconds = 6) {
    this.quakeT = seconds;
  }

  knockback() {
    this.knock = 1;
  }

  gaze(seconds = 5) {
    this.gazeT = seconds;
  }

  buildBerm() {
    if (this.berm) return;
    this.berm = createBerm();
    this.berm.position.copy(this.astro.position);
    this.scene.add(this.berm);
    if (this.xray) setXRay(this.berm, true);
  }

  placePlaque(opts) {
    if (this.plaque) {
      this.plaque.userData.setContent(opts);
      return;
    }
    this.plaque = createPlaque(opts);
    const a = this.heading + Math.PI / 2;
    const x = this.astro.position.x + Math.sin(a) * 1.6;
    const z = this.astro.position.z + Math.cos(a) * 1.6;
    this.plaque.position.set(x, heightAt(x, z), z);
    this.plaque.rotation.y = this.heading + 0.3;
    this.scene.add(this.plaque);
  }

  setSelfie(on) {
    this.selfie = on;
    if (on) this.astro.userData.state.pose = 'cheer';
  }

  setDead() {
    this.astro.userData.state.pose = 'dead';
  }

  capture() {
    this.renderFrame();
    return this.renderer.domElement;
  }

  // ---------------------------------------------------------------- input

  bind() {
    const el = this.renderer.domElement;
    el.style.cursor = 'grab';
    this.onDown = (e) => {
      this.pointer.down = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    };
    this.onMove = (e) => {
      if (!this.pointer.down) return;
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.cam.yaw -= dx * 0.006;
      this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, 0.05, 1.2);
      this.cam.userT = 4;
    };
    this.onUp = (e) => {
      this.pointer.down = false;
      el.releasePointerCapture?.(e.pointerId);
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.cam.dist = clamp(this.cam.dist + e.deltaY * 0.01, 3.5, 30);
    };
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  // ---------------------------------------------------------------- frame

  sunDirection(v) {
    // Sun rises in the east (+x), sets in the west (-x), tilted south (+z).
    const tSol = v.tSol;
    let ang;
    if (v.isDay) ang = (tSol / 0.55) * Math.PI;
    else ang = Math.PI + ((tSol - 0.55) / 0.45) * Math.PI;
    const elev = Math.sin(ang);
    return new THREE.Vector3(Math.cos(ang), elev * 0.92, 0.38).normalize();
  }

  applyLighting(v, s) {
    const storm = v.wx ? v.wx.storm : 0;
    const e = v.sunElev ?? 1;
    // Day weight, dusk weight (blue sunset), night weight.
    const dayW = clamp((e - 0.06) / 0.3, 0, 1);
    const nightW = clamp((-e - 0.02) / 0.22, 0, 1);
    const duskW = clamp(1 - dayW - nightW, 0, 1);
    const mix = (key) => {
      const c = PAL.day[key].clone().multiplyScalar(dayW);
      c.add(PAL.dusk[key].clone().multiplyScalar(duskW));
      c.add(PAL.night[key].clone().multiplyScalar(nightW));
      const st = Math.min(1, storm * 1.1) * (1 - nightW * 0.75);
      return c.lerp(PAL.storm[key].clone().multiplyScalar(0.35 + 0.65 * (1 - nightW)), st * 0.85);
    };
    const dir = this.sunDirection(v);
    this.skyU.uTop.value.copy(mix('top'));
    this.skyU.uHor.value.copy(mix('hor'));
    this.skyU.uGlow.value.copy(mix('glow'));
    this.skyU.uSunDir.value.copy(dir);
    const ecl = v.eclipse || 0;
    this.skyU.uGlowK.value = (dayW * 0.6 + duskW * 1.8 + nightW * 0.1) * (1 - storm * 0.6) * (1 - ecl * 0.35);
    this.skyU.uSunK.value = (e > -0.02 ? 1 : 0) * (1 - storm * 0.9);
    const fog = mix('fog');
    this.scene.fog.color.copy(fog);
    this.scene.fog.density = 0.011 + storm * 0.05 + nightW * 0.004 + duskW * 0.003;
    this.scene.background = fog;
    const sunCol = mix('sun');
    this.sun.color.copy(sunCol);
    this.sun.intensity = Math.max(0, (dayW * 3.1 + duskW * 0.9) * (1 - storm * 0.75) * (1 - ecl * 0.45));
    this.hemi.color.copy(mix('hor'));
    this.hemi.intensity = 0.25 + dayW * 0.55 + duskW * 0.3 - storm * 0.1;
    this.rimLight.intensity = 0.15 + nightW * 0.35;
    this.stars.material.opacity = nightW * (1 - storm * 0.9) + duskW * 0.25;
    this.astro.userData.lamp.intensity = (nightW + duskW * 0.4) * 320;
    this.renderer.toneMappingExposure = 1.0 + nightW * 0.35;
    const p = this.astro.position;
    this.sun.position.copy(p).addScaledVector(dir, 70);
    if (this.sun.position.y < p.y + 3) this.sun.position.y = p.y + 3;
    this.sun.target.position.copy(p);
    this.rim.material.color.copy(mix('hor')).multiplyScalar(0.85);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);

    // Phobos transit across the solar disk.
    if (ecl > 0 && v.isDay) {
      const k = s && s.view ? clamp((s.T - 2.2) / 0.096, 0, 1) : 0.5;
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      this.phobos.visible = true;
      this.phobos.position.copy(this.camera.position).addScaledVector(dir, 520).addScaledVector(side, (k - 0.5) * 34);
      this.phobos.rotation.y += 0.002;
    } else this.phobos.visible = false;

    // Earth as an evening star just above the western horizon after sunset.
    const showEarth = duskW > 0.2 || this.gazeT > 0;
    this.earth.visible = showEarth && storm < 0.6;
    if (this.earth.visible) {
      const ed = new THREE.Vector3(-0.95, 0.2, 0.3).normalize();
      this.earthDir = ed;
      this.earth.position.copy(this.camera.position).addScaledVector(ed, 480);
      this.earth.scale.setScalar(1 + (this.gazeT > 0 ? 0.6 : 0));
    }
  }

  update(dt) {
    this.time += dt;
    const s = this.cb.step?.(dt) || null;
    const v = s?.view;
    if (!v) {
      this.renderFrame();
      return;
    }
    const pos = v.pos;
    const kx = this.knock > 0 ? -Math.sin(this.heading) * this.knock * 1.6 : 0;
    const kz = this.knock > 0 ? -Math.cos(this.heading) * this.knock * 1.6 : 0;
    this.knock = Math.max(0, this.knock - dt * 0.9);
    const x = pos.x + kx;
    const z = pos.z + kz;
    const y = heightAt(x, z);
    const moving = this.last ? Math.hypot(x - this.last.x, z - this.last.z) > 1e-4 && v.isDay && !s.done : false;
    if (pos.hx || pos.hz) {
      const target = Math.atan2(pos.hx, pos.hz);
      let dh = target - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 4);
    }
    this.astro.position.set(x, y, z);
    this.astro.rotation.y = this.heading;
    this.astro.userData.update(dt, moving ? 1 : 0, 1);
    if (!s.alive) this.astro.userData.state.pose = 'dead';
    this.astro.userData.setTelemetry(s.o2 / s.o2Cap, s.power / 100, s.has.brush ? s.visorDust * 0.3 : Math.max(s.visorDust, s.flags.panelDust * 1.4));
    // suit dust tint
    const suit = this.astro.userData.suitMats[0];
    if (!this.suitBase) this.suitBase = suit.color.clone();
    suit.color.copy(this.suitBase).lerp(new THREE.Color(0xd08a5a), Math.min(0.75, s.visorDust * 0.8));
    if (moving) this.footprints.track(x, z, this.heading);
    this.last = { x, z };

    this.applyLighting(v, s);

    // hardware labels and holograms
    for (const [id, h] of Object.entries(this.hw)) {
      const d = Math.hypot(h.pos.x - x, h.pos.z - z);
      h.label.visible = d < 16 && !this.selfie;
    }
    for (const [id, l] of Object.entries(this.lm)) {
      if (!l.label) continue;
      const d = Math.hypot(l.pos.x - x, l.pos.z - z);
      l.label.visible = d < 9 && !this.selfie;
      void id;
    }
    Object.values(this.holos).forEach((hg) => hg.userData.update(dt));
    this.mesh.update(dt, this.time);
    this.lasers.update(dt);
    this.geysers.update(dt, 0.25 + (v.wx?.storm || 0));
    this.escapade.update(dt);
    if (this.tube) this.tube.userData.ring.material.emissiveIntensity = 1.5 + Math.sin(this.time * 3);

    // berm follows camp each night and grows when printed
    if (this.berm) {
      if (!v.isDay && this.bermCampSol !== v.sol) {
        this.bermCampSol = v.sol;
        this.berm.position.set(x, y, z);
        this.berm.userData.grow = 0;
      }
      this.berm.userData.grow = Math.min(1, this.berm.userData.grow + dt * 0.5);
      this.berm.scale.y = Math.max(0.01, this.berm.userData.grow);
      this.berm.userData.head.rotation.y += dt * 2;
      this.berm.userData.head.visible = this.berm.userData.grow < 1;
    }

    // dust motes / storm wall
    const storm = v.wx?.storm || 0;
    this.dust.position.set(this.camera.position.x, y - 2, this.camera.position.z);
    this.dust.material.opacity = 0.18 + storm * 0.6;
    this.dust.material.size = 0.12 + storm * 0.25;
    const dp = this.dust.geometry.attributes.position;
    const wind = (2 + storm * 16) * dt;
    for (let i = 0; i < dp.count; i++) {
      let px = dp.getX(i) + wind;
      if (px > 30) px -= 60;
      dp.setX(i, px);
      dp.setY(i, (dp.getY(i) + Math.sin(this.time + i) * dt * 0.3 + 14) % 14);
    }
    dp.needsUpdate = true;

    // ---------------- camera
    this.cam.userT = Math.max(0, this.cam.userT - dt);
    if (this.cam.userT === 0 && !this.selfie) {
      let dy = this.heading + Math.PI - this.cam.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.cam.yaw += dy * Math.min(1, dt * 0.8);
    }
    let camPos;
    let look;
    if (this.selfie) {
      const a = this.heading + 0.5;
      camPos = new THREE.Vector3(x + Math.sin(a) * 4.6, y + 1.9, z + Math.cos(a) * 4.6);
      look = new THREE.Vector3(x, y + 1.3, z);
    } else if (v.eclipse > 0 && v.isDay) {
      // Look up past the astronaut at the Phobos transit.
      const sd = this.sunDirection(v);
      const flat = new THREE.Vector3(sd.x, 0, sd.z).normalize();
      camPos = new THREE.Vector3(x, y + 0.9, z).addScaledVector(flat, -5.5);
      look = new THREE.Vector3(x, y + 1.6, z).addScaledVector(sd, 14);
    } else if (this.gazeT > 0 && this.earthDir) {
      this.gazeT -= dt;
      camPos = new THREE.Vector3(x, y + 1.2, z).addScaledVector(this.earthDir, -4.5);
      camPos.y = y + 1.4;
      look = this.camera.position.clone().addScaledVector(this.earthDir, 50);
    } else {
      const { yaw, pitch, dist } = this.cam;
      camPos = new THREE.Vector3(x - Math.sin(yaw) * Math.cos(pitch) * -dist, y + 1.7 + Math.sin(pitch) * dist, z - Math.cos(yaw) * Math.cos(pitch) * -dist);
      const gy = heightAt(camPos.x, camPos.z) + 0.8;
      if (camPos.y < gy) camPos.y = gy;
      look = new THREE.Vector3(x, y + 1.4, z);
    }
    this.camera.position.lerp(camPos, Math.min(1, dt * (this.gazeT > 0 ? 2 : 5)));
    // shake: dust storms, quakes, knockback
    this.quakeT = Math.max(0, this.quakeT - dt);
    const sh = storm * 0.05 + (this.quakeT > 0 ? Math.min(1, this.quakeT / 2) * 0.35 : 0) + this.knock * 0.3 + this.shake;
    if (sh > 0) {
      this.camera.position.x += (Math.random() - 0.5) * sh;
      this.camera.position.y += (Math.random() - 0.5) * sh;
      this.camera.position.z += (Math.random() - 0.5) * sh;
    }
    this.lookTarget = this.lookTarget ? this.lookTarget.lerp(look, Math.min(1, dt * 6)) : look.clone();
    this.camera.lookAt(this.lookTarget);
    this.renderFrame();
  }

  renderFrame() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stopLoop();
    this.stopResize();
    if (this.suitBase) this.astro.userData.suitMats[0].color.copy(this.suitBase);
    setXRay(this.astro, false);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('wheel', this.onWheel);
    disposeScene(this.scene, this.renderer);
  }
}

export { glow, lerp };
