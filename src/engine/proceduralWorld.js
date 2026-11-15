// SOL 60: RED HORIZON — Three.js world builder: GLSL Martian sky (butterscotch noon -> blue sunset ->
// stars + aurora), Gale Crater / Olympus Mons terrain mesh, instanced rocks, shelters, repairable
// devices, player rig + grounded contact shadow, build ghosts, planters, particles, dust walls,
// falling boulders, waypoint beam, X-ray blueprint mode and full disposal.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
const softBox = (w, h, d, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.max(0.004, Math.min(w, h, d) * 0.3));
import {
  WORLD,
  OLYMPUS,
  SHELTERS,
  DEVICES,
  ECHOES,
  PADS,
  SITES,
  GRAPHICS,
} from '../data/nasaData.js';
import {
  getTerrainHeight,
  getTerrainNormal,
  setTerrainSeed,
  buildHeightfield,
  DUNE_FIELD,
  trailInfo,
  CollisionWorld,
  mulberry32,
  smooth,
  clamp,
} from './terrainPhysics.js';
import {
  createAstronaut,
  AstronautAnimator,
  createLander,
  createRescueRocket,
  createFlag,
  createRover,
  disposeObject,
  addRim,
} from './characterAndVehicles.js';
import { buildWeatherStation } from './archiveModels.js';
import { createScienceWorld } from './science.js';
import { createStormClouds } from './stormClouds.js';

const V3 = THREE.Vector3;
const _perp = new THREE.Vector3();
const _sp = new THREE.Vector3();

// ---------------------------------------------------------------- procedural textures
function noiseCanvas(size, seed, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rnd = mulberry32(seed);
  // tileable value noise via wrapped lattice
  const lat = (n) => {
    const a = new Float32Array(n * n);
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    return a;
  };
  const octs = [8, 16, 32, 64].map((n) => ({ n, a: lat(n) }));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      for (const o of octs) {
        const fx = (x / size) * o.n;
        const fy = (y / size) * o.n;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const i0 = ix % o.n;
        const i1 = (ix + 1) % o.n;
        const j0 = iy % o.n;
        const j1 = (iy + 1) % o.n;
        const a = o.a[j0 * o.n + i0];
        const b = o.a[j0 * o.n + i1];
        const cc = o.a[j1 * o.n + i0];
        const d = o.a[j1 * o.n + i1];
        v += amp * (a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy);
        amp *= 0.5;
      }
      if (opts.pebbles && rnd() < 0.004) v = 0.15;
      const base = opts.lo ?? 0.72;
      const span = opts.span ?? 0.36;
      const k = Math.round(clamp(base + (v - 0.47) * span * 2, 0, 1) * 255);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

function glowTexture(color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color);
  gr.addColorStop(0.25, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- sky shader
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = `
uniform vec3 sunDir;
uniform float dust;
uniform float aurora;
uniform float time;
uniform vec3 dustCol;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float sunH = sunDir.y;
  float sd = max(dot(dir, sunDir), 0.0);
  float day = smoothstep(-0.18, 0.22, sunH);
  // butterscotch day sky
  vec3 zen = vec3(0.50, 0.36, 0.25);
  vec3 hor = vec3(0.86, 0.64, 0.44);
  vec3 col = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.55));
  // blue sunset: forward-scattering dust makes a blue halo around a low Sun
  float dusk = (1.0 - smoothstep(0.02, 0.4, sunH)) * smoothstep(-0.22, 0.0, sunH);
  col = mix(col, col * vec3(0.55, 0.42, 0.42), dusk * 0.85);
  col += vec3(0.32, 0.55, 0.95) * (pow(sd, 6.0) * 0.9 + pow(sd, 40.0) * 0.8) * dusk;
  col *= mix(0.03, 1.0, day);
  // night sky + stars
  vec3 night = vec3(0.012, 0.014, 0.03) + vec3(0.02, 0.012, 0.01) * (1.0 - abs(h));
  col = mix(night, col, day);
  vec3 sp = floor(dir * 320.0);
  float st = hash(sp);
  float star = step(0.9975, st) * (0.5 + 0.5 * sin(time * 2.0 + st * 80.0));
  col += vec3(star) * (1.0 - day) * smoothstep(0.0, 0.15, h) * (1.0 - dust);
  // sun disc + glow
  col += vec3(1.0, 0.93, 0.82) * smoothstep(0.9994, 0.9998, sd) * 2.5 * (1.0 - dust * 0.8);
  col += vec3(1.0, 0.8, 0.6) * pow(sd, 120.0) * 0.6 * day;
  // aurora (diffuse green, from a solar particle event)
  float band = sin(dir.x * 7.0 + time * 0.6) * 0.5 + 0.5;
  band *= smoothstep(0.05, 0.35, h) * (1.0 - smoothstep(0.5, 0.95, h));
  col += vec3(0.15, 0.95, 0.45) * band * aurora * mix(0.9, 0.25, day);
  // dust storm overcast
  col = mix(col, dustCol * mix(0.08, 1.0, day), clamp(dust, 0.0, 1.0));
  // ground below horizon fades to haze
  col = mix(col, hor * mix(0.03, 0.7, day) * (1.0 - dust * 0.3) + dustCol * dust * 0.4, smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- particles
const PART_VERT = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PART_FRAG = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, vAlpha * smoothstep(0.5, 0.1, d));
}`;

class Particles {
  constructor(max, color, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.cursor = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 300 } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.active = 0;
  }
  emit(x, y, z, vx, vy, vz, life, size, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.grav[i] = grav;
  }
  update(dt) {
    let any = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          any++;
        }
        continue;
      }
      any++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = 1 - 0.6 * dt;
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, k * 1.6) * 0.75;
      this.size[i] = this.baseSize[i] * (1.6 - k * 0.6);
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------- rock geometry
function rockGeometry(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const rnd = mulberry32(seed);
  const offs = [];
  for (let i = 0; i < 6; i++) offs.push(new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize());
  const v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let s = 1;
    for (const o of offs) s += Math.max(0, v.dot(o)) * 0.22 - 0.05;
    v.multiplyScalar(s);
    v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- shelters
const faceCenterYaw = (a) => Math.atan2(-Math.cos(a), -Math.sin(a)); // rotation.y that makes +z point at the dome centre
const outwardYaw = (a) => Math.PI / 2 - a; // rotation.y that makes +z point away from the centre at polar angle a

function remsPanelTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#04141a';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#2ee6ff';
  g.lineWidth = 2;
  g.strokeRect(3, 3, 250, 122);
  g.fillStyle = '#2ee6ff';
  g.font = 'bold 15px monospace';
  g.fillText('REMS · GALE CRATER', 12, 26);
  g.fillStyle = '#9ff4ff';
  g.font = '13px monospace';
  g.fillText('AIR     -63 °C   GROUND -41 °C', 12, 52);
  g.fillText('PRESSURE 7.4 hPa   UV 0.31', 12, 72);
  g.fillText('WIND  4.1 m/s   DUST TAU 0.8', 12, 92);
  g.fillStyle = '#4a8a96';
  g.font = '11px monospace';
  g.fillText('SOURCE: MSL CURIOSITY REMS / NASA', 12, 114);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Double-hulled pressurized habitat: glass shell, curved ribs, wall ring with windows, glowing airlock, decorated interior. */
function buildDome(r, doorAngle, prebuilt) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#c9ced4', roughness: 0.42, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#3b4048', roughness: 0.6, metalness: 0.6 });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };
  const polar = (a, rad) => [Math.cos(a) * rad, Math.sin(a) * rad];

  // ---- double hull: outer glass shell + a faint inner liner
  const glass = add(
    new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.3, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    0, 0, 0, group, false,
  );
  glass.renderOrder = 2;
  add(new THREE.SphereGeometry(r - 0.28, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8ecef', transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }), 0, 0, 0, group, false);

  // ---- structural ribs (curved tube meridians) + latitude rings, merged into one mesh
  const ribGeos = [];
  const rr = r + 0.04;
  const nRibs = 12;
  for (let i = 0; i < nRibs; i++) {
    const th = (i / nRibs) * Math.PI * 2;
    const da = Math.abs(((th - doorAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (da < 1.9 / r) continue; // keep the doorway clear
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const e = (k / 12) * (Math.PI / 2);
      pts.push(new THREE.Vector3(rr * Math.cos(e) * Math.cos(th), rr * Math.sin(e), rr * Math.cos(e) * Math.sin(th)));
    }
    ribGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 6, false));
  }
  for (const e of [0.55, 1.05]) {
    const ring = new THREE.TorusGeometry(rr * Math.cos(e), 0.04, 6, 48);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, rr * Math.sin(e), 0);
    ribGeos.push(ring);
  }
  add(mergeGeometries(ribGeos, false), hullMat);
  ribGeos.forEach((g) => g.dispose());

  // ---- opaque lower wall ring with a doorway gap, floor, base ring
  const gap = 1.7 / r;
  const wallProfile = [new THREE.Vector2(r + 0.12, 0), new THREE.Vector2(r + 0.12, 1.25), new THREE.Vector2(r - 0.12, 1.35), new THREE.Vector2(r - 0.12, 0)];
  const wallMat = new THREE.MeshStandardMaterial({ color: '#aeb5bd', roughness: 0.5, metalness: 0.65, side: THREE.DoubleSide });
  add(new THREE.LatheGeometry(wallProfile, 48, Math.PI / 2 - doorAngle + gap, Math.PI * 2 - gap * 2), wallMat);
  const floorMat = new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.55, metalness: 0.5 });
  const floor = add(new THREE.CircleGeometry(r - 0.1, 40), floorMat, 0, 0.06, 0, group, false);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const baseRing = add(new THREE.TorusGeometry(r, 0.18, 8, 48), hullMat, 0, 0.1, 0);
  baseRing.rotation.x = Math.PI / 2;

  // ---- viewport windows (amber glow) and round vents on the wall ring
  const winGeos = [];
  const winFrameGeos = [];
  const ventGeos = [];
  for (let i = 1; i < 6; i++) {
    const a = doorAngle + (i / 6) * Math.PI * 2;
    const [wx, wz] = polar(a, r + 0.13);
    const disc = new THREE.CircleGeometry(0.28, 20);
    disc.rotateY(outwardYaw(a));
    disc.translate(wx, 0.78, wz);
    winGeos.push(disc);
    const fr = new THREE.TorusGeometry(0.3, 0.035, 6, 24);
    fr.rotateY(outwardYaw(a));
    fr.translate(wx, 0.78, wz);
    winFrameGeos.push(fr);
    const [vx, vz] = polar(a + 0.28, r + 0.13);
    const vent = new THREE.CircleGeometry(0.16, 16);
    vent.rotateY(outwardYaw(a + 0.28));
    vent.translate(vx, 0.45, vz);
    ventGeos.push(vent);
  }
  add(mergeGeometries(winGeos, false), new THREE.MeshBasicMaterial({ color: '#ffc872' }), 0, 0, 0, group, false);
  add(mergeGeometries(winFrameGeos, false), hullMat);
  add(mergeGeometries(ventGeos, false), darkMat, 0, 0, 0, group, false);
  [...winGeos, ...winFrameGeos, ...ventGeos].forEach((g) => g.dispose());

  // ---- bunk on the wall opposite the airlock (rounded cushions, tubular frame)
  const bedA = doorAngle + Math.PI;
  const bed = new THREE.Group();
  bed.position.set(Math.cos(bedA) * r * 0.55, 0, Math.sin(bedA) * r * 0.55);
  bed.rotation.y = outwardYaw(bedA);
  const bedPart = (geo, c, x, y, z) => add(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }), x, y, z, bed);
  bedPart(new RoundedBoxGeometry(1.0, 0.3, 2.2, 3, 0.08), '#3a3f48', 0, 0.15, 0);
  bedPart(new RoundedBoxGeometry(0.9, 0.14, 2.0, 3, 0.06), '#2f5fd0', 0, 0.37, 0);
  bedPart(new THREE.CapsuleGeometry(0.1, 0.4, 4, 10).rotateZ(Math.PI / 2), '#e9ecef', 0, 0.5, -0.75);
  bedPart(new RoundedBoxGeometry(0.95, 0.05, 1.2, 3, 0.02), '#c9703a', 0, 0.44, 0.42);
  group.add(bed);

  // ---- interior stations
  const tankMat = new THREE.MeshStandardMaterial({ color: '#d7dde4', roughness: 0.35, metalness: 0.6 });
  const o2Glow = new THREE.MeshStandardMaterial({ color: '#0a2a30', emissive: '#2ee6ff', emissiveIntensity: 1.4 });
  const h2oGlow = new THREE.MeshStandardMaterial({ color: '#0a1a30', emissive: '#4a8cff', emissiveIntensity: 1.2 });
  // O2 + water tanks flanking the airlock inside
  [[-0.5, o2Glow, 'o2'], [0.5, h2oGlow, 'h2o']].forEach(([off, glowMat]) => {
    const [tx, tz] = polar(doorAngle + off, r - 0.7);
    add(new THREE.CapsuleGeometry(0.24, 0.9, 6, 14), tankMat, tx, 0.75, tz);
    const band = add(new THREE.TorusGeometry(0.245, 0.03, 6, 20), glowMat, tx, 0.75, tz, group, false);
    band.rotation.x = Math.PI / 2;
  });
  // tool rack on the wall (round tools on a padded board)
  {
    const a = doorAngle + Math.PI * 0.72;
    const [tx, tz] = polar(a, r - 0.5);
    const rack = new THREE.Group();
    rack.position.set(tx, 1.0, tz);
    rack.rotation.y = faceCenterYaw(a);
    add(new RoundedBoxGeometry(1.5, 0.9, 0.08, 3, 0.03), darkMat, 0, 0, 0, rack);
    for (let i = 0; i < 5; i++) {
      add(new THREE.CapsuleGeometry(0.025, 0.4 + (i % 3) * 0.1, 4, 8), i % 2 ? hullMat : tankMat, -0.55 + i * 0.27, -0.05, 0.07, rack);
      add(new THREE.SphereGeometry(0.05, 10, 8), darkMat, -0.55 + i * 0.27, 0.2 + (i % 3) * 0.04, 0.07, rack);
    }
    group.add(rack);
  }
  // holographic REMS weather + Mars map console
  let holo;
  {
    const a = doorAngle - Math.PI / 2;
    const [cx, cz] = polar(a, r * 0.5);
    const con = new THREE.Group();
    con.position.set(cx, 0, cz);
    con.rotation.y = faceCenterYaw(a);
    const ped = [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.34, 0), new THREE.Vector2(0.3, 0.1), new THREE.Vector2(0.18, 0.5), new THREE.Vector2(0.26, 0.9), new THREE.Vector2(0.0, 0.92)];
    add(new THREE.LatheGeometry(ped, 20), darkMat, 0, 0.06, 0, con);
    const screen = add(new RoundedBoxGeometry(0.7, 0.4, 0.04, 3, 0.015), new THREE.MeshBasicMaterial({ map: remsPanelTexture() }), 0, 1.15, 0.12, con, false);
    screen.rotation.x = -0.35;
    holo = add(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: '#2ee6ff', wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.75, -0.05, con, false);
    const hr = add(new THREE.TorusGeometry(0.36, 0.01, 6, 36), new THREE.MeshBasicMaterial({ color: '#2ee6ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.75, -0.05, con, false);
    hr.rotation.x = Math.PI / 2.4;
    group.add(con);
  }
  // warm amber ceiling ring + glow sprites (a single shared point light is moved to the nearest shelter)
  const ceilR = r * 0.45;
  const ceilY = Math.sqrt(Math.max(0.1, r * r - ceilR * ceilR)) - 0.2;
  const ceil = add(new THREE.TorusGeometry(ceilR, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffc872' }), 0, ceilY, 0, group, false);
  ceil.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const [sx, sz] = polar((i / 3) * Math.PI * 2 + 0.5, ceilR);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffb45a'), color: '#ffb45a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 }));
    sp.position.set(sx, ceilY - 0.1, sz);
    sp.scale.setScalar(2.2);
    group.add(sp);
  }

  // ---- airlock arch: capsule posts, glowing arc, sliding rounded door
  const arch = new THREE.Group();
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.13, 2.1, 6, 12), hullMat, s * 1.25, 1.2, 0, arch);
  const lintel = add(new THREE.CapsuleGeometry(0.14, 2.2, 6, 12), hullMat, 0, 2.5, 0, arch);
  lintel.rotation.z = Math.PI / 2;
  const glowArc = add(new THREE.TorusGeometry(1.2, 0.045, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color: '#3dff8a' }), 0, 1.25, 0.1, arch, false);
  glowArc.position.y = 1.25;
  const stripe = glowArc;
  arch.position.set(Math.cos(doorAngle) * r, 0, Math.sin(doorAngle) * r);
  arch.rotation.y = -doorAngle + Math.PI / 2;
  group.add(arch);
  const doorSlide = new THREE.Group();
  add(new RoundedBoxGeometry(2.3, 2.3, 0.14, 3, 0.06), new THREE.MeshStandardMaterial({ color: '#b7bec7', roughness: 0.35, metalness: 0.75 }), 0, 1.15, 0, doorSlide);
  const lampStrip = add(new THREE.CapsuleGeometry(0.035, 0.8, 4, 8), new THREE.MeshBasicMaterial({ color: '#3dff8a' }), 0, 1.9, 0.085, doorSlide, false);
  lampStrip.rotation.z = Math.PI / 2;
  const wheel = add(new THREE.TorusGeometry(0.2, 0.035, 8, 20), hullMat, 0, 1.15, 0.09, doorSlide, false);
  wheel.castShadow = false;
  arch.add(doorSlide);

  // ---- exterior detail: pipe run, seam ring, wall lights, O2 column
  const pipeMat = new THREE.MeshStandardMaterial({ color: '#6a7078', roughness: 0.55, metalness: 0.7 });
  const pb = doorAngle + 2.3;
  add(new THREE.CylinderGeometry(0.1, 0.1, r * 0.9, 10), pipeMat, Math.cos(pb) * (r + 0.18), 0.4 + r * 0.45, Math.sin(pb) * (r + 0.18));
  const elbow = add(new THREE.TorusGeometry(0.3, 0.07, 6, 12, Math.PI / 2), pipeMat, Math.cos(pb) * (r + 0.18), 0.4, Math.sin(pb) * (r + 0.18));
  elbow.rotation.set(0, -pb, 0);
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffe3b0' });
  for (const la of [doorAngle + 0.75, doorAngle - 0.75, doorAngle + Math.PI]) {
    add(new THREE.SphereGeometry(0.12, 10, 8), lightMat, Math.cos(la) * (r + 0.05), 2.2, Math.sin(la) * (r + 0.05), group, false);
  }
  const o2Beam = add(
    new THREE.CylinderGeometry(0.3, 0.9, 70, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: '#3dff8a', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    0, r + 35, 0, group, false,
  );
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#5dffa0'), color: '#5dffa0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  beacon.position.y = r + 0.6;
  beacon.scale.setScalar(3);
  group.add(beacon);
  add(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#c8ffe0' }), 0, r + 0.25, 0, group, false);
  void prebuilt;
  return {
    group,
    glass,
    beacon,
    stripe,
    doorSlide,
    o2Beam,
    holo,
    ceilY,
    bedLocal: { x: bed.position.x, z: bed.position.z },
  };
}

function domeColliders(x, z, r, doorAngle) {
  const out = [];
  const n = Math.max(12, Math.round((Math.PI * 2 * r) / 2.0));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let da = Math.abs(((a - doorAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (da < 1.6 / r) continue; // doorway gap ~2.2 m
    out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, r: 0.95, tag: 'wall' });
  }
  return out;
}

// ---------------------------------------------------------------- devices
function buildSolarStation() {
  const g = new THREE.Group();
  const panelMat = new THREE.MeshStandardMaterial({ color: '#1b2c5a', roughness: 0.25, metalness: 0.6, emissive: '#000000' });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.5, metalness: 0.7 });
  const panels = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      const p = new THREE.Group();
      p.position.set(-2.4 + i * 2.4, 1.1, -1 + j * 2);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), frameMat);
      post.position.y = -0.55;
      p.add(post);
      const panel = new THREE.Mesh(softBox(2.1, 0.05, 1.6), panelMat);
      panel.castShadow = true;
      p.add(panel);
      g.add(p);
      panels.push(p);
    }
  const cab = new THREE.Mesh(softBox(1.2, 1.4, 0.8), new THREE.MeshStandardMaterial({ color: '#d8d6d0', roughness: 0.6 }));
  cab.position.set(0, 0.7, 2.4);
  cab.castShadow = true;
  g.add(cab);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2e3e' }));
  light.position.set(0, 1.55, 2.4);
  g.add(light);
  return {
    group: g,
    sparkLocal: new V3(0, 1.0, 2.85),
    setRepaired(r) {
      panels.forEach((p, i) => p.rotation.set(r ? -0.35 : i % 3 === 1 ? 0.9 : -0.35, 0, r ? 0 : i === 4 ? 0.5 : 0));
      light.material.color.set(r ? '#3dff8a' : '#ff2e3e');
      panelMat.emissive.set(r ? '#0a1a40' : '#000000');
    },
  };
}

function buildRtgStation() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.3, 20), new THREE.MeshStandardMaterial({ color: '#6d6f73', roughness: 0.8 }));
  base.position.y = 0.15;
  base.receiveShadow = true;
  g.add(base);
  const core = new THREE.Group();
  core.position.y = 0.3;
  g.add(core);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 16), new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.5, metalness: 0.6 }));
  body.position.y = 0.8;
  body.castShadow = true;
  core.add(body);
  for (let i = 0; i < 8; i++) {
    const fin = new THREE.Mesh(softBox(0.06, 1.4, 0.55), new THREE.MeshStandardMaterial({ color: '#55595f', roughness: 0.5, metalness: 0.7 }));
    const a = (i / 8) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.62, 0.8, Math.sin(a) * 0.62);
    fin.rotation.y = -a;
    core.add(fin);
  }
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: '#401010' }));
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 1.62;
  core.add(glow);
  return {
    group: g,
    sparkLocal: new V3(0.5, 1.2, 0.5),
    glow,
    setRepaired(r) {
      core.rotation.z = r ? 0 : 0.35;
      glow.material.color.set(r ? '#ff7a2a' : '#401010');
    },
  };
}

function buildRelay() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.5, metalness: 0.7 });
  const H = 12;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, H, 6), steel);
    leg.position.set(Math.cos(a) * 1.0, H / 2, Math.sin(a) * 1.0);
    leg.rotation.set(Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
    leg.castShadow = true;
    g.add(leg);
  }
  for (let y = 1.5; y < H; y += 2) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.05 - y * 0.03, 0.04, 4, 3), steel);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    g.add(r);
  }
  const head = new THREE.Group();
  head.position.y = H;
  g.add(head);
  const dishPivot = new THREE.Group();
  head.add(dishPivot);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.32),
    new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }),
  );
  dish.rotation.x = Math.PI; // bowl opens upward-forward after pivot tilt
  dish.position.y = 2.6;
  dish.castShadow = true;
  dishPivot.add(dish);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), steel);
  feed.position.y = 0.9;
  dishPivot.add(feed);
  const horn = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0,-0.2),new THREE.Vector2(0.18,-0.2),new THREE.Vector2(0.1,0.05),new THREE.Vector2(0,0.2)],10), steel);
  horn.position.y = 1.85;
  horn.rotation.x = Math.PI;
  dishPivot.add(horn);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2e3e' }));
  light.position.y = -0.4;
  head.add(light);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 2.2, 260, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 131;
  dishPivot.add(beam);
  const cab = new THREE.Mesh(softBox(1.6, 1.4, 1.1), new THREE.MeshStandardMaterial({ color: '#d8d6d0', roughness: 0.6 }));
  cab.position.set(2.2, 0.7, 0.4);
  cab.castShadow = true;
  g.add(cab);
  return {
    group: g,
    dishPivot,
    beam,
    sparkLocal: new V3(2.2, 1.2, 1.0),
    setRepaired(r) {
      dishPivot.rotation.set(r ? -0.5 : 1.1, r ? 0.3 : 0, r ? 0 : 0.3);
      light.material.color.set(r ? '#3dff8a' : '#ff2e3e');
    },
    setAim(k) {
      dishPivot.rotation.x = -0.5 + Math.sin(k) * 0.08;
      dishPivot.rotation.y = 0.3 + Math.cos(k * 0.7) * 0.1;
    },
  };
}

function buildHologram(id) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#58e1ff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
  const solid = new THREE.MeshBasicMaterial({ color: '#58e1ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    const s = new THREE.Mesh(geo, solid);
    s.position.set(x, y, z);
    g.add(s);
    return m;
  };
  if (id === 'insight') {
    add(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12), 0, 1.0, 0);
    add(new THREE.CylinderGeometry(1.05, 1.05, 0.04, 10), 1.9, 1.15, 0);
    add(new THREE.CylinderGeometry(1.05, 1.05, 0.04, 10), -1.9, 1.15, 0);
    add(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.4, 0.0, 1.4);
  } else {
    const big = id === 'perseverance';
    add(softBox(big ? 1.8 : 1.1, 0.4, big ? 2.6 : 1.5), 0, 0.9, 0);
    for (const s of [-1, 1]) for (const z of [-1, 0, 1]) add(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10).rotateZ(Math.PI / 2), s * (big ? 1.1 : 0.75), 0.3, z * (big ? 1.0 : 0.6));
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), 0.4, 1.7, big ? 1.0 : 0.5);
    add(softBox(0.4, 0.2, 0.2), 0.4, 2.35, big ? 1.0 : 0.5);
    if (!big) {
      add(softBox(1.4, 0.03, 0.9), 1.2, 1.1, 0);
      add(softBox(1.4, 0.03, 0.9), -1.2, 1.1, 0);
    }
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.3, 40), new THREE.MeshBasicMaterial({ color: '#58e1ff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  return { group: g, mat, solid };
}

// ---------------------------------------------------------------- planter
function buildPlanter() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(softBox(2.4, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: '#c3c7cc', roughness: 0.5, metalness: 0.5 }));
  frame.position.y = 0.25;
  frame.castShadow = true;
  g.add(frame);
  const soilMat = new THREE.MeshStandardMaterial({ color: '#7a3b22', roughness: 1 });
  const soil = new THREE.Mesh(softBox(2.2, 0.06, 1.0), soilMat);
  soil.position.y = 0.5;
  g.add(soil);
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ff5ad8' });
  for (const x of [-1.1, 1.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), frame.material);
    post.position.set(x, 1.1, 0);
    g.add(post);
  }
  const led = new THREE.Mesh(softBox(2.3, 0.06, 0.25), ledMat);
  led.position.y = 1.75;
  g.add(led);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f9a3a', roughness: 0.7 });
  const tuberMat = new THREE.MeshStandardMaterial({ color: '#b98a55', roughness: 0.9 });
  const plants = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Group();
    p.position.set(-0.8 + (i % 3) * 0.8, 0.53, i < 3 ? -0.25 : 0.25);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.4, 5), leafMat);
    stem.position.y = 0.2;
    p.add(stem);
    for (let k = 0; k < 4; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), leafMat);
      leaf.scale.set(1, 0.35, 0.6);
      const a = (k / 4) * Math.PI * 2 + i;
      leaf.position.set(Math.cos(a) * 0.12, 0.3 + k * 0.05, Math.sin(a) * 0.12);
      p.add(leaf);
    }
    const tuber = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), tuberMat);
    tuber.position.set(0.12, 0.02, 0.05);
    tuber.visible = false;
    p.add(tuber);
    p.userData.tuber = tuber;
    g.add(p);
    plants.push(p);
  }
  const tanks = new THREE.Group();
  const liquidMat = new THREE.MeshStandardMaterial({ color: '#2fae5a', emissive: '#0b3a1a', roughness: 0.3, transparent: true, opacity: 0.85 });
  const liquids = [];
  for (const x of [-0.6, 0, 0.6]) {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set(x, 1.03, 0);
    tanks.add(glass);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 14), liquidMat);
    liq.position.set(x, 0.55, 0);
    tanks.add(liq);
    liquids.push(liq);
  }
  g.add(tanks);
  return { group: g, plants, tanks, liquids, liquidMat, soilMat, ledMat };
}

// ---------------------------------------------------------------- main world
export function createWorld(container, opts) {
  const { seed, custom, settings } = opts;
  const preset = GRAPHICS[settings.graphics] || GRAPHICS.medium;
  setTerrainSeed(seed);
  const rnd = mulberry32((seed >>> 0) ^ 0x9e3779b9);

  const renderer = new THREE.WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'game-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Image-based lighting from a generated studio environment (no external .hdr asset needed).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();
  scene.fog = new THREE.FogExp2('#c49a72', 0.0016);
  const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 2600);

  // sky
  const skyU = {
    sunDir: { value: new V3(0.3, 0.8, 0.3).normalize() },
    dust: { value: 0 },
    aurora: { value: 0 },
    time: { value: 0 },
    dustCol: { value: new THREE.Color('#b8743e') },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2000, 48, 24),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // lights
  const hemi = new THREE.HemisphereLight('#ffd9b0', '#5a3020', 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2c0', 2.4);
  sun.castShadow = preset.shadows;
  if (preset.shadows) {
    sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 240 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun, sun.target);
  const rimLight = new THREE.DirectionalLight('#9cc8ff', 0.35);
  scene.add(rimLight, rimLight.target);

  // ---------------- terrain mesh
  const W = WORLD.maxX - WORLD.minX;
  const D = WORLD.maxZ - WORLD.minZ;
  // Render and physics share ONE heightfield (terrainPhysics.buildHeightfield): every collision query interpolates
  // the exact triangle drawn here, so the Commander never floats above or sinks into the visible ground.
  // Olympus patch cells stay at or under ~2 m on every preset so ramp ledges and cliff bands keep their shape
  const HF = buildHeightfield(preset.terrainSeg, Math.ceil((WORLD.maxX - WORLD.minX) / preset.terrainSeg / 2.0));
  const cPlain = new THREE.Color('#b0613a');
  const cLow = new THREE.Color('#8a4a2e');
  const cDust = new THREE.Color('#c97c4c');
  const cBasalt = new THREE.Color('#4a3530');
  const cCliff = new THREE.Color('#33251f');
  const cTrail = new THREE.Color('#b98a62');
  const cSummit = new THREE.Color('#5e3a2e');
  const cStrataA = new THREE.Color('#c98b5e');
  const cStrataB = new THREE.Color('#7d4a33');
  const cDune = new THREE.Color('#3b2c28');
  const col = new THREE.Color();
  /**
   * Grid mesh from a heightfield grid. Triangles (a, b, d) / (b, c, d) match terrainPhysics.sampleGrid exactly.
   * `skip(i, j)` drops cells (used to cut the hole the high-resolution Olympus patch fills).
   */
  function heightfieldMesh(g, skip) {
    const Wv = g.nx + 1;
    const count = Wv * (g.nz + 1);
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let j = 0; j <= g.nz; j++)
      for (let i = 0; i <= g.nx; i++) {
        const k = j * Wv + i;
        const x = g.x0 + i * g.dx;
        const z = g.z0 + j * g.dx;
        pos[k * 3] = x;
        pos[k * 3 + 1] = g.h[k];
        pos[k * 3 + 2] = z;
        uv[k * 2] = (x - WORLD.minX) / W;
        uv[k * 2 + 1] = (z - WORLD.minZ) / D;
      }
    const idx = [];
    for (let j = 0; j < g.nz; j++)
      for (let i = 0; i < g.nx; i++) {
        if (skip && skip(i, j)) continue;
        const a = j * Wv + i;
        const b = (j + 1) * Wv + i;
        const c = (j + 1) * Wv + i + 1;
        const d = j * Wv + i + 1;
        idx.push(a, b, d, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const tn = geo.attributes.normal;
    const colors = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const x = pos[k * 3];
      const h = pos[k * 3 + 1];
      const z = pos[k * 3 + 2];
      const ny = tn.getY(k);
      const rm = Math.hypot(x - OLYMPUS.x, z - OLYMPUS.z);
      const mMask = smooth(OLYMPUS.r + 20, OLYMPUS.r - 20, rm);
      const vary = Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.031 - z * 0.05) * 0.5;
      col.copy(cPlain).lerp(cLow, clamp(-h / 14, 0, 1) * 0.8).lerp(cDust, clamp(vary * 0.5 + 0.2, 0, 0.5));
      col.lerp(cBasalt, mMask * clamp(0.4 + h / OLYMPUS.h, 0, 1));
      col.lerp(cSummit, smooth(OLYMPUS.calderaR + 20, OLYMPUS.calderaR - 4, rm));
      const steep = smooth(0.85, 0.5, ny);
      // stratified layering shows on every steep face: mesas, Mount Sharp, crater walls and the Olympus cliff bands
      const band = Math.sin(h * 1.35 + Math.sin(x * 0.02) * 1.5) * 0.5 + 0.5;
      col.lerp(cStrataA.clone().lerp(cStrataB, band), steep * (1 - mMask) * 0.8);
      col.lerp(cCliff, steep * mMask * 0.85);
      const dd = Math.hypot(x - DUNE_FIELD.x, z - DUNE_FIELD.z);
      col.lerp(cDune, smooth(DUNE_FIELD.r + 15, DUNE_FIELD.r - 25, dd) * 0.65); // dark basaltic sand
      if (rm < OLYMPUS.r + 40) {
        const ti = trailInfo(x, z);
        col.lerp(cTrail, (1 - smooth(3.0, 5.5, ti.d)) * 0.6);
      }
      colors[k * 3] = col.r;
      colors[k * 3 + 1] = col.g;
      colors[k * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }
  // the world grid skips the Olympus patch (keeping a one-cell overlap so no crack can open along the seam)
  const hc = HF.hi.cells;
  const loGeo = heightfieldMesh(HF.lo, (i, j) => i > hc.i0 && i < hc.i1 - 1 && j > hc.j0 && j < hc.j1 - 1);
  const hiGeo = heightfieldMesh(HF.hi, null);
  const detailTex = new THREE.CanvasTexture(noiseCanvas(256, seed + 7, { pebbles: true, lo: 0.82, span: 0.3 }));
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.repeat.set(W / 6, D / 6);
  detailTex.colorSpace = THREE.SRGBColorSpace;
  detailTex.anisotropy = 8;
  const bumpTex = new THREE.CanvasTexture(noiseCanvas(256, seed + 13, { lo: 0.5, span: 1 }));
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(W / 9, D / 9);
  const roughTex = new THREE.CanvasTexture(noiseCanvas(128, seed + 21, { lo: 0.85, span: 0.3 }));
  roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.repeat.set(W / 14, D / 14);
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detailTex,
    bumpMap: bumpTex,
    bumpScale: 1.6,
    roughnessMap: roughTex,
    roughness: 1,
    metalness: 0,
  });
  const terrain = new THREE.Group();
  const terrainHi = new THREE.Mesh(hiGeo, terrainMat);
  // the coarse grid sits a hair behind in depth, so in the one-cell overlap the fine Olympus patch always wins
  const terrainLoMat = terrainMat.clone();
  terrainLoMat.polygonOffset = true;
  terrainLoMat.polygonOffsetFactor = 1;
  terrainLoMat.polygonOffsetUnits = 2;
  const terrainLo = new THREE.Mesh(loGeo, terrainLoMat);
  for (const m of [terrainLo, terrainHi]) {
    m.receiveShadow = true;
    terrain.add(m);
  }
  scene.add(terrain);

  const collision = new CollisionWorld(16);

  // ---------------- sites to keep clear of scatter
  const clearZones = [
    ...PADS.map((p) => ({ x: p.x, z: p.z, r: p.r + 4 })),
    ...ECHOES.map((e) => ({ x: e.x, z: e.z, r: 6 })),
    { x: SITES.rescuePad.x, z: SITES.rescuePad.z, r: 26 },
  ];
  const isClear = (x, z, r) => {
    for (const c of clearZones) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
    const rm = Math.hypot(x - OLYMPUS.x, z - OLYMPUS.z);
    if (rm < OLYMPUS.r + 40 && trailInfo(x, z).d < 7 + r) return false;
    return true;
  };

  // ---------------- instanced rocks
  const rockGeo = rockGeometry(seed, 1);
  const rockMat = addRim(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0.02, bumpMap: bumpTex, bumpScale: 0.6 }), '#ff9a6a', 0.15);
  const rockCount = preset.rocks + 24;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.castShadow = preset.shadows;
  rocks.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sV = new V3();
  const pV = new V3();
  const rc = new THREE.Color();
  let placed = 0;
  let tries = 0;
  while (placed < rockCount && tries < rockCount * 12) {
    tries++;
    const big = placed < 24;
    // bias toward Olympus slopes and the crater rim
    let x;
    let z;
    if (!big && rnd() < 0.35) {
      const a = rnd() * Math.PI * 2;
      const r = OLYMPUS.calderaR + rnd() * (OLYMPUS.r + 20 - OLYMPUS.calderaR);
      x = OLYMPUS.x + Math.cos(a) * r;
      z = OLYMPUS.z + Math.sin(a) * r;
    } else {
      x = WORLD.minX + 70 + rnd() * (W - 140);
      z = WORLD.minZ + 70 + rnd() * (D - 140);
    }
    const s = big ? 2.4 + rnd() * 2.4 : rnd() < 0.85 ? 0.2 + rnd() * 0.6 : 0.8 + rnd() * 1.3;
    if (!isClear(x, z, s * 1.2)) continue;
    const y = getTerrainHeight(x, z) + s * 0.25;
    e.set(rnd() * 0.6, rnd() * Math.PI * 2, rnd() * 0.6);
    q.setFromEuler(e);
    sV.set(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.5));
    pV.set(x, y, z);
    m4.compose(pV, q, sV);
    rocks.setMatrixAt(placed, m4);
    const rm = Math.hypot(x - OLYMPUS.x, z - OLYMPUS.z);
    rc.set(rm < OLYMPUS.r ? '#4a3a35' : '#8a5a42').offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
    rocks.setColorAt(placed, rc);
    if (s > 0.3) collision.addStatic({ x, z, r: Math.max(sV.x, sV.z) * 0.82, tag: 'rock' });
    placed++;
  }
  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  scene.add(rocks);

  // ---------------- shelters
  const shelters = [];
  const addShelterAt = (def, prebuilt) => {
    const y = getTerrainHeight(def.x, def.z);
    const dome = buildDome(def.r, def.door, prebuilt);
    dome.group.position.set(def.x, y, def.z);
    scene.add(dome.group);
    const cols = domeColliders(def.x, def.z, def.r, def.door).map((c) => collision.addStatic(c));
    // airlock gap: three colliders that exist only while the door is shut
    const d = def.door;
    const radial = [Math.cos(d), Math.sin(d)];
    const tangent = [Math.sin(d), -Math.cos(d)];
    const doorCols = [-1.1, 0, 1.1].map((t) =>
      collision.addStatic({
        x: def.x + radial[0] * def.r + tangent[0] * t,
        z: def.z + radial[1] * def.r + tangent[1] * t,
        r: 0.6,
        tag: 'airlock',
      }),
    );
    const door = { slide: dome.doorSlide, open: 0, target: 0, cols: doorCols, colliders: doorCols };
    const bed = { x: def.x + dome.bedLocal.x, z: def.z + dome.bedLocal.z };
    const s = { ...def, y, prebuilt, dome, colliders: cols, door, bed, doorAngle: def.door };
    shelters.push(s);
    return s;
  };
  SHELTERS.forEach((d) => addShelterAt(d, true));

  // ---------------- devices
  const devices = {};
  const conduits = [];
  for (const def of DEVICES) {
    const y = getTerrainHeight(def.x, def.z);
    if (def.kind === 'rover') continue;
    const built = def.kind === 'solar' ? buildSolarStation() : def.kind === 'rtg' ? buildRtgStation() : def.kind === 'weather' ? buildWeatherStation() : buildRelay();
    built.group.position.set(def.x, y, def.z);
    built.group.rotation.y = def.yaw;
    scene.add(built.group);
    built.setRepaired(false);
    const r = def.kind === 'solar' ? 3.4 : def.kind === 'rtg' ? 1.8 : def.kind === 'weather' ? 1.5 : 2.4;
    if (def.kind === 'solar') {
      collision.addStatic({ x: def.x, z: def.z, r: 3.2, tag: 'device' });
    } else collision.addStatic({ x: def.x, z: def.z, r, tag: 'device' });
    devices[def.id] = { def, ...built, y };
  }
  // power conduits from substations to Ridgeback Hab
  const conduitMat = new THREE.MeshBasicMaterial({ color: '#2a3138' });
  for (const id of ['sub1', 'sub2']) {
    const d = DEVICES.find((x) => x.id === id);
    const h = SHELTERS[0];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = d.x + (h.x - d.x) * t + Math.sin(t * Math.PI) * 8;
      const z = d.z + (h.z - d.z) * t;
      pts.push(new V3(x, getTerrainHeight(x, z) + 0.15, z));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.08, 5), conduitMat.clone());
    scene.add(tube);
    conduits.push({ id, mesh: tube });
  }

  // ---------------- rover
  const roverDef = DEVICES.find((d) => d.kind === 'rover');
  const roverMesh = createRover();
  scene.add(roverMesh.group);
  const roverCollider = collision.addDynamic({ x: roverDef.x, z: roverDef.z, r: 2.0, tag: 'rover' });
  const roverLight = new THREE.SpotLight('#fff3d6', 0, 45, 0.55, 0.5, 1.2);
  roverLight.position.set(0, 1.3, 1.5);
  roverLight.target.position.set(0, 0, 12);
  roverMesh.body.add(roverLight, roverLight.target);
  devices.rover = { def: roverDef, sparkLocal: new V3(-1.2, 0.7, 0), group: roverMesh.group, setRepaired: (r) => roverMesh.setRepaired(r) };

  // ---------------- lander, flag, rescue rocket
  const landerY = getTerrainHeight(SITES.landing.x, SITES.landing.z);
  const lander = createLander(custom);
  lander.group.position.set(SITES.landing.x, landerY, SITES.landing.z);
  scene.add(lander.group);
  collision.addStatic({ x: SITES.landing.x, z: SITES.landing.z, r: 2.6, tag: 'lander' });
  const flag = createFlag(custom);
  const flagPos = { x: SITES.landing.x + 4.2, z: SITES.landing.z + 3.4 };
  flag.group.position.set(flagPos.x, getTerrainHeight(flagPos.x, flagPos.z), flagPos.z);
  flag.group.visible = false;
  scene.add(flag.group);
  const rescue = createRescueRocket();
  const rescueY = getTerrainHeight(SITES.rescuePad.x, SITES.rescuePad.z);
  rescue.group.position.set(SITES.rescuePad.x, rescueY, SITES.rescuePad.z);
  rescue.group.visible = false;
  scene.add(rescue.group);
  const rescueCollider = collision.addDynamic({ x: SITES.rescuePad.x, z: SITES.rescuePad.z, r: 2.8, tag: 'rocket', active: false });
  const padMesh = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 0.25, 6), new THREE.MeshStandardMaterial({ color: '#5a5d63', roughness: 0.8 }));
  padMesh.position.set(SITES.rescuePad.x, rescueY + 0.05, SITES.rescuePad.z);
  padMesh.receiveShadow = true;
  scene.add(padMesh);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(7.4, 8, 6), new THREE.MeshBasicMaterial({ color: '#f2c230', side: THREE.DoubleSide }));
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(SITES.rescuePad.x, rescueY + 0.2, SITES.rescuePad.z);
  scene.add(padRing);

  // ---------------- echoes (holograms)
  const echoes = ECHOES.map((def) => {
    const h = buildHologram(def.id);
    h.group.position.set(def.x, getTerrainHeight(def.x, def.z) + 0.05, def.z);
    h.group.visible = false;
    scene.add(h.group);
    return { def, ...h };
  });

  // ---------------- NASA pioneers, Bright Angel outcrop and the UHF Ghost Mesh
  const science = createScienceWorld(scene, collision);

  // ---------------- player
  let astro = createAstronaut(custom);
  let animator = new AstronautAnimator(astro);
  scene.add(astro.root);
  // rescue-crew NPC: same rig and animator, human face behind a clear canopy, hidden until the ship lands
  const npcAstro = createAstronaut({ suit: 'orange', accent: 'yellow', visor: 'cyan', backpack: 'o2max', patch: 'olympus' }, { npc: true, face: true });
  const npcAnimator = new AstronautAnimator(npcAstro);
  npcAstro.root.visible = false;
  scene.add(npcAstro.root);
  const npcShadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55, color: '#000000', polygonOffset: true, polygonOffsetFactor: -2 });
  const npcShadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), npcShadowMat);
  npcShadow.renderOrder = 1;
  npcShadow.visible = false;
  scene.add(npcShadow);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55, color: '#000000', polygonOffset: true, polygonOffsetFactor: -2 });
  const shadowDecal = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), shadowMat);
  shadowDecal.renderOrder = 1;
  scene.add(shadowDecal);
  const flashlight = new THREE.SpotLight('#fff8e6', 0, 60, 0.42, 0.45, 1.1);
  const flashTarget = new THREE.Object3D();
  const attachFlash = () => {
    astro.joints.head.add(flashlight, flashTarget);
    flashlight.position.set(0.15, 0.27, 0.12);
    flashTarget.position.set(0, -1.5, 12);
    flashlight.target = flashTarget;
  };
  attachFlash();
  const torchLight = new THREE.PointLight('#9fe8ff', 0, 9, 1.6);
  scene.add(torchLight);
  const interiorLight = new THREE.PointLight('#ffb45a', 0, 12, 1.4);
  scene.add(interiorLight);

  // ---------------- build ghosts (cached)
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#10b981', transparent: true, opacity: 0.35, depthWrite: false });
  const ghostWire = new THREE.MeshBasicMaterial({ color: '#34f5b0', wireframe: true, transparent: true, opacity: 0.7 });
  const ghosts = {
    habitat: new THREE.Group(),
    planter: new THREE.Group(),
  };
  ghosts.habitat.add(new THREE.Mesh(new THREE.SphereGeometry(4.6, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), ghostMat));
  ghosts.habitat.add(new THREE.Mesh(new THREE.SphereGeometry(4.65, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), ghostWire));
  const gArch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.4), ghostWire);
  gArch.position.set(0, 1.3, 4.6);
  ghosts.habitat.add(gArch);
  ghosts.planter.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.2).translate(0, 0.25, 0), ghostMat));
  ghosts.planter.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 1.2).translate(0, 0.9, 0), ghostWire));
  for (const g of Object.values(ghosts)) {
    g.visible = false;
    scene.add(g);
  }

  // ---------------- particles
  const dust = new Particles(preset.particles, '#c98a5a', false);
  const sparks = new Particles(220, '#ffc070', true);
  const motes = new Particles(Math.round(preset.particles * 0.6), '#d9a070', false);
  scene.add(dust.points, sparks.points, motes.points);

  // sublimating CO2 dry-ice geysers: dark fans on the plains with white plumes (emitted by the game loop)
  const geyser = new Particles(preset.particles > 400 ? 360 : 160, '#eef5ff', false);
  scene.add(geyser.points);
  const geysers = [];
  for (let i = 0; geysers.length < 5 && i < 80; i++) {
    const gx = -260 + rnd() * 480;
    const gz = 40 + rnd() * 280;
    if (!isClear(gx, gz, 7)) continue;
    geysers.push({ x: gx, z: gz, y: getTerrainHeight(gx, gz) });
  }
  if (geysers.length) {
    const fans = geysers.map((g, i) => {
      const c = new THREE.CircleGeometry(4.5 + (i % 3), 18);
      c.scale(1, 1.8, 1);
      c.rotateX(-Math.PI / 2);
      c.rotateY(i * 1.7);
      c.translate(g.x, g.y + 0.12, g.z);
      return c;
    });
    const fanMesh = new THREE.Mesh(mergeGeometries(fans, false), new THREE.MeshBasicMaterial({ color: '#2a1e1a', transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    fanMesh.renderOrder = 1;
    scene.add(fanMesh);
    fans.forEach((f) => f.dispose());
  }

  // Phobos: a lumpy dark moon that transits the Sun (see setPhobos)
  const phobos = new THREE.Mesh(rockGeometry(seed + 5, 2), new THREE.MeshBasicMaterial({ color: '#2b2724', fog: false }));
  phobos.scale.setScalar(34);
  phobos.visible = false;
  scene.add(phobos);
  const phobosOff = new V3();
  let eclipseK = 1;

  // ---------------- signature touches: persistent prints, shockwave rings, sunbeams
  /** Ring-buffered instanced ground decals (boot prints, tire tracks): one draw call, never freed until overwritten. */
  function makePrintSet(max, sx, sz, color, opacity) {
    const geo = new THREE.CircleGeometry(1, 12);
    geo.rotateX(-Math.PI / 2);
    geo.scale(sx, 1, sz);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    const mm = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qy = new THREE.Quaternion();
    const pp = new V3();
    const ss = new V3(1, 1, 1);
    const upv = new V3(0, 1, 0);
    const nv = new V3();
    const nrm = { x: 0, y: 1, z: 0 };
    let n = 0;
    let cur = 0;
    return {
      mesh,
      add(x, z, yaw) {
        getTerrainNormal(x, z, undefined, nrm);
        nv.set(nrm.x, nrm.y, nrm.z);
        q.setFromUnitVectors(upv, nv);
        qy.setFromAxisAngle(upv, yaw);
        q.multiply(qy);
        pp.set(x, getTerrainHeight(x, z) + 0.05, z);
        mm.compose(pp, q, ss);
        mesh.setMatrixAt(cur, mm);
        cur = (cur + 1) % max;
        n = Math.min(n + 1, max);
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  }
  const bootPrints = makePrintSet(320, 0.075, 0.17, '#3a2418', 0.5);
  const tirePrints = makePrintSet(420, 0.17, 0.4, '#3a2418', 0.4);
  const impactPrints = makePrintSet(60, 1.1, 1.1, '#2a1810', 0.55); // rockfall impact scars

  // expanding shockwave rings for touchdown and ignition
  const shocks = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 56),
      new THREE.MeshBasicMaterial({ color: '#ffd9a8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    return { m, t: 0, life: 0, str: 1 };
  });
  function shockwave(x, y, z, strength = 1) {
    const s = shocks.find((k) => k.life <= 0);
    if (!s) return;
    s.t = 0;
    s.life = 1.7;
    s.str = strength;
    s.m.position.set(x, y + 0.4, z);
    s.m.visible = true;
  }
  function updateShock(dt) {
    for (const s of shocks) {
      if (s.life <= 0) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        s.life = 0;
        s.m.visible = false;
        continue;
      }
      s.m.scale.setScalar(2 + k * 48 * s.str);
      s.m.material.opacity = (1 - k) * (1 - k) * 0.7;
    }
  }

  // sunbeams: a screen-space pass of streaks radiating from the Sun, thicker in dust and at low Sun
  const raysU = { sunPos: { value: new THREE.Vector2(0, 0) }, aspect: { value: 1 }, time: { value: 0 }, intensity: { value: 0 } };
  const rays = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: raysU,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        varying vec2 vP; uniform vec2 sunPos; uniform float aspect; uniform float time; uniform float intensity;
        void main(){
          vec2 d = (vP - sunPos) * vec2(aspect, 1.0);
          float dist = length(d);
          float ang = atan(d.y, d.x);
          float s1 = sin(ang * 23.0 + time * 0.2) * 0.5 + 0.5;
          float s2 = sin(ang * 57.0 - time * 0.13) * 0.5 + 0.5;
          float streak = pow(s1 * s2, 1.5);
          float a = streak * exp(-dist * 1.3) * intensity;
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a, a);
        }`,
    }),
  );
  rays.frustumCulled = false;
  rays.renderOrder = 50;
  rays.visible = false;
  scene.add(rays);
  let rayK = 0;

  // ---------------- falling boulders
  const BOULDER_MAX = 28;
  const boulderMesh = new THREE.InstancedMesh(rockGeometry(seed + 99, 1), new THREE.MeshStandardMaterial({ color: '#4d3a33', roughness: 0.9 }), BOULDER_MAX);
  boulderMesh.castShadow = preset.shadows;
  boulderMesh.count = 0;
  boulderMesh.frustumCulled = false;
  scene.add(boulderMesh);

  // ---------------- layered cloudy dust storms (billowing instanced puffs; see stormClouds.js)
  const storm = createStormClouds(scene, preset.particles > 600 ? 320 : preset.particles > 300 ? 240 : 150);

  // ---------------- field equipment: pitons on rock faces, the portable solar array, rockfall impact scars
  const pitonGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.28, 6).rotateX(Math.PI / 2);
  const pitonMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.8, roughness: 0.3, emissive: '#ffb020', emissiveIntensity: 0.35 });
  function addPiton(x, y, z) {
    const m = new THREE.Mesh(pitonGeo, pitonMat);
    m.position.set(x, y, z);
    m.lookAt(x, y - 0.4, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), pitonMat);
    ring.position.set(0, 0, -0.16);
    m.add(ring);
    scene.add(m);
    return m;
  }
  let solarArray = null;
  function addSolarArray(x, y, z, az, tilt) {
    if (solarArray) scene.remove(solarArray);
    solarArray = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: '#8d96a1', metalness: 0.7, roughness: 0.4 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 8), legMat);
    post.position.y = 0.55;
    const panel = new THREE.Group();
    panel.position.y = 1.1;
    const cells = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 1.6), new THREE.MeshStandardMaterial({ color: '#1b2c5a', metalness: 0.5, roughness: 0.25, emissive: '#0a1430' }));
    panel.add(cells);
    panel.rotation.set(tilt, 0, 0, 'YXZ');
    const yawG = new THREE.Group();
    yawG.rotation.y = -az;
    yawG.add(panel);
    solarArray.add(post, yawG);
    solarArray.position.set(x, y, z);
    solarArray.traverse((o) => (o.castShadow = !!o.isMesh));
    scene.add(solarArray);
    return solarArray;
  }
  // ---------------- waypoint beam
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 260, 12, 1, true), beamMat);
  beam.position.y = 130;
  beacon.add(beam);
  const beaconRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.2;
  beacon.add(beaconRing);
  scene.add(beacon);

  // ---------------- built structures
  const built = [];
  const planters = [];
  function addHabitat(x, z, doorAngle) {
    const def = { id: `built-${built.length}`, name: 'Your Habitat', x, z, r: 4.6, door: doorAngle };
    const s = addShelterAt(def, false);
    built.push(s);
    return s;
  }
  function addPlanter(x, z, rot) {
    const p = buildPlanter();
    const y = getTerrainHeight(x, z);
    p.group.position.set(x, y, z);
    p.group.rotation.y = rot;
    scene.add(p.group);
    const col = collision.addStatic({ x, z, r: 1.35, tag: 'planter' });
    const st = { id: `planter-${planters.length}`, x, z, y, crop: null, growth: 0, water: 0, mesh: p, collider: col, harvested: 0 };
    planters.push(st);
    updatePlanter(st);
    return st;
  }
  function updatePlanter(st) {
    const p = st.mesh;
    const g = st.growth;
    const potato = st.crop === 'potato';
    const spir = st.crop === 'spirulina';
    p.plants.forEach((pl, i) => {
      pl.visible = potato && g > 0.02;
      const s = 0.15 + Math.min(1, g) * 0.95;
      pl.scale.setScalar(s * (0.9 + (i % 3) * 0.08));
      pl.userData.tuber.visible = g >= 0.85;
    });
    p.tanks.visible = spir;
    p.liquids.forEach((l) => {
      const hgt = 0.05 + Math.min(1, g) * 0.92;
      l.scale.y = hgt;
      l.position.y = 0.55 + hgt / 2;
    });
    p.liquidMat.color.setHSL(0.36, 0.6, 0.55 - Math.min(1, g) * 0.3);
    p.soilMat.color.set(st.water > 0.25 ? '#4f2414' : '#7a3b22');
    p.ledMat.color.set(st.crop ? '#ff5ad8' : '#444');
  }

  // Veggie bay: every prebuilt shelter starts with a working hydroponic planter along its side wall
  for (const s of shelters) {
    if (!s.prebuilt) continue;
    const a = s.doorAngle + Math.PI / 2;
    addPlanter(s.x + Math.cos(a) * s.r * 0.5, s.z + Math.sin(a) * s.r * 0.5, Math.atan2(-Math.cos(a), -Math.sin(a)));
  }

  // ---------------- graphics & lifecycle
  let xray = false;
  const xrayMat = new THREE.MeshBasicMaterial({ color: '#4fc3ff', wireframe: true, transparent: true, opacity: 0.35 });
  const fogColor = new THREE.Color();
  function setXray(on) {
    xray = on;
    scene.overrideMaterial = on ? xrayMat : null;
    sky.visible = !on;
    scene.background = on ? new THREE.Color('#041226') : null;
  }
  function applyGraphics(s) {
    const p = GRAPHICS[s.graphics] || GRAPHICS.medium;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio) * clamp(s.resScale ?? 1, 0.4, 1));
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
    const shadowsWanted = p.shadows;
    if (renderer.shadowMap.enabled !== shadowsWanted) {
      renderer.shadowMap.enabled = shadowsWanted;
      sun.castShadow = shadowsWanted;
      if (shadowsWanted && sun.shadow.mapSize.x !== p.shadowSize) {
      sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    if (composer && !p.post) buildComposer();
    else if (!composer && p.post) buildComposer();
      scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => (m.needsUpdate = true));
      });
    }
    resize();
  }
  // High preset: GTAO contact occlusion, light depth of field, SMAA, ACES output via OutputPass.
  let composer = null;
  let bokeh = null;
  let gtao = null;
  function buildComposer() {
    if (composer) {
      composer.dispose();
      composer = null;
    }
    if (!preset.post) return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
    bokeh = new BokehPass(scene, camera, { focus: 6, aperture: 0.00006, maxblur: 0.003 });
    composer.addPass(bokeh);
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
    const ps = renderer.getPixelRatio() * h * 0.5;
    dust.mat.uniforms.uScale.value = ps;
    sparks.mat.uniforms.uScale.value = ps;
    motes.mat.uniforms.uScale.value = ps;
  }
  const focusPoint = new V3();
  applyGraphics(settings);
  buildComposer();
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /** Time of day & weather: f = sol fraction (0 = midnight), dust 0..1, aurora 0..1. */
  const cDay = new THREE.Color('#c79c74');
  const cDusk = new THREE.Color('#6e5c64');
  const cNight = new THREE.Color('#0b0c14');
  const cStorm = new THREE.Color('#9a5a2e');
  const cXray = new THREE.Color('#041226');
  function setEnvironment(f, dustAmt, aurora, focus) {
    const ang = (f - 0.25) * Math.PI * 2;
    const sd = skyU.sunDir.value.set(Math.cos(ang) * 0.9, Math.sin(ang), 0.35).normalize();
    skyU.dust.value = dustAmt;
    skyU.aurora.value = aurora;
    const el = sd.y;
    const day = smooth(-0.18, 0.22, el);
    const dusk = (1 - smooth(0.02, 0.4, el)) * smooth(-0.22, 0, el);
    sun.intensity = Math.max(0, Math.sqrt(Math.max(0, el))) * 2.6 * (1 - dustAmt * 0.65) * eclipseK;
    rayK = day * (0.2 + dustAmt * 0.75) * (0.6 + 0.4 * (1 - smooth(0.1, 0.6, el))) * eclipseK;
    sun.color.setRGB(1, 0.86 - dusk * 0.2, 0.72 - dusk * 0.3);
    hemi.intensity = 0.14 + day * 0.75;
    hemi.color.setRGB(0.6 + day * 0.4, 0.55 + day * 0.3, 0.6 + day * 0.1);
    rimLight.intensity = 0.25 + (1 - day) * 0.25;
    fogColor.copy(cNight).lerp(cDusk, smooth(-0.2, 0.05, el)).lerp(cDay, smooth(0.05, 0.35, el));
    fogColor.lerp(cStorm, dustAmt * 0.85).multiplyScalar(1 - dustAmt * 0.3 * (1 - day));
    if (xray) fogColor.copy(cXray);
    scene.fog.color.copy(fogColor);
    // exponential fog: a few hundred metres of haze normally, collapsing to a few metres inside a dust wall
    scene.fog.density = xray ? 0.0008 : 0.0016 + 0.15 * Math.pow(dustAmt, 1.25);
    renderer.toneMappingExposure = 1.0 + (1 - day) * 0.35 + (focus < 25 ? -0.15 : 0);
    return day;
  }

  function placeSunAround(x, y, z) {
    const sd = skyU.sunDir.value;
    const up = sd.y > 0.02 ? sd : new V3(-sd.x, 0.4, -sd.z).normalize();
    sun.position.set(x + up.x * 120, y + up.y * 120, z + up.z * 120);
    sun.target.position.set(x, y, z);
    rimLight.position.set(x - up.x * 50, y + 30, z - up.z * 50);
    rimLight.target.position.set(x, y, z);
  }

  const _tip = new V3();
  const _n = { x: 0, y: 1, z: 0 };
  const _up = new V3(0, 0, 1);
  const _nv = new V3();
  /** Pin the contact shadow to the ground under the player, oriented to the terrain normal. */
  function updateShadow(px, py, pz) {
    const gy = getTerrainHeight(px, pz);
    getTerrainNormal(px, pz, undefined, _n);
    shadowDecal.position.set(px, gy + 0.03, pz);
    _nv.set(_n.x, _n.y, _n.z);
    shadowDecal.quaternion.setFromUnitVectors(_up, _nv);
    const alt = Math.max(0, py - gy);
    const s = 1 / (1 + alt * 0.35);
    shadowDecal.scale.setScalar(s);
    shadowMat.opacity = 0.55 * clamp(1 - alt / 6, 0.15, 1);
  }

  /** Pin the NPC's contact shadow to the ground (ground = a height function, so it also works on the ship ramp). */
  function updateNpcShadow(px, py, pz, groundFn) {
    const gy = groundFn ? groundFn(px, pz) : getTerrainHeight(px, pz);
    getTerrainNormal(px, pz, undefined, _n);
    npcShadow.position.set(px, gy + 0.03, pz);
    _nv.set(_n.x, _n.y, _n.z);
    npcShadow.quaternion.setFromUnitVectors(_up, _nv);
    npcShadow.scale.setScalar(1 / (1 + Math.max(0, py - gy) * 0.35));
  }

  /** Animate every airlock door and sync its hitbox (colliders off while open). */
  function updateDoors(dt, px = 0, pz = 0) {
    let nearest = null;
    let nd = 1e9;
    for (const s of shelters) {
      const d = s.door;
      if (!d) continue;
      d.open += (d.target - d.open) * Math.min(1, dt * 3.5);
      if (Math.abs(d.target - d.open) < 0.002) d.open = d.target;
      d.slide.position.x = d.open * 2.3;
      const solid = d.open < 0.5;
      for (const c of d.cols) c.active = solid;
      if (s.dome.holo) s.dome.holo.rotation.y += dt * 0.6;
      const dist = Math.hypot(s.x - px, s.z - pz);
      if (dist < nd) {
        nd = dist;
        nearest = s;
      }
    }
    // one shared warm interior light, parked in the nearest habitat while the player is close
    if (nearest) {
      interiorLight.position.set(nearest.x, nearest.y + nearest.dome.ceilY * 0.7, nearest.z);
      const want = nd < nearest.r + 14 ? 14 : 0;
      interiorLight.intensity += (want - interiorLight.intensity) * Math.min(1, dt * 4);
    }
  }

  function setCustom(c) {
    const parent = astro.root.parent;
    const pos = astro.root.position.clone();
    const rot = astro.root.rotation.y;
    parent.remove(astro.root);
    astro.dispose();
    astro = createAstronaut(c);
    animator = new AstronautAnimator(astro);
    astro.root.position.copy(pos);
    astro.root.rotation.y = rot;
    parent.add(astro.root);
    attachFlash();
    api.astro = astro;
    api.animator = animator;
  }

  function captureSelfie() {
    try {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function dispose() {
    ro.disconnect();
    scene.overrideMaterial = null;
    dust.dispose();
    sparks.dispose();
    motes.dispose();
    geyser.dispose();
    storm.dispose();
    impactPrints.mesh.dispose();
    bootPrints.mesh.dispose();
    tirePrints.mesh.dispose();
    lander.dispose();
    rescue.dispose();
    flag.dispose();
    roverMesh.dispose();
    astro.dispose();
    npcAstro.dispose();
    xrayMat.dispose();
    disposeObject(scene);
    detailTex.dispose();
    bumpTex.dispose();
    roughTex.dispose();
    composer?.dispose();
    envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  const api = {
    renderer,
    scene,
    camera,
    collision,
    sky,
    skyU,
    sun,
    terrain,
    shelters,
    devices,
    conduits,
    rover: roverMesh,
    roverCollider,
    roverLight,
    lander,
    landerY,
    flag,
    flagPos,
    rescue,
    rescueY,
    rescueCollider,
    echoes,
    science,
    astro,
    animator,
    npc: { astro: npcAstro, animator: npcAnimator, shadow: npcShadow },
    updateNpcShadow,
    flashlight,
    torchLight,
    shadowDecal,
    ghosts,
    ghostMat,
    ghostWire,
    dust,
    sparks,
    motes,
    geyser,
    geysers,
    boulderMesh,
    BOULDER_MAX,
    storm,
    addPiton,
    addSolarArray,
    impactPrints,
    beacon,
    beamMat,
    planters,
    built,
    addHabitat,
    addPlanter,
    updatePlanter,
    setXray,
    applyGraphics,
    setEnvironment,
    bootPrints,
    tirePrints,
    shockwave,
    updateShock,
    updateDoors,
    placeSunAround,
    updateShadow,
    setCustom,
    captureSelfie,
    resize,
    tip: _tip,
    render() {
      sky.position.copy(camera.position);
      _sp.copy(skyU.sunDir.value).multiplyScalar(1000).add(camera.position).project(camera);
      const rayOn = _sp.z < 1 && !xray && rayK > 0.01;
      rays.visible = rayOn;
      if (rayOn) {
        raysU.sunPos.value.set(_sp.x, _sp.y);
        raysU.aspect.value = camera.aspect;
        raysU.time.value = skyU.time.value;
        raysU.intensity.value = rayK * clamp(1.4 - Math.hypot(_sp.x, _sp.y) * 0.45, 0, 1);
      }
      if (phobos.visible) phobos.position.copy(camera.position).add(phobosOff);
      if (composer) {
        if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(focusPoint);
        composer.render();
      } else renderer.render(scene, camera);
    },
    /** k in [-1, 1] sweeps Phobos across the Sun; null hides it. Dims sunlight near mid-transit. */
    setPhobos(k) {
      if (k === null) {
        phobos.visible = false;
        eclipseK = 1;
        return;
      }
      const sd = skyU.sunDir.value;
      _perp.set(sd.z, 0, -sd.x).normalize();
      phobosOff.copy(sd).multiplyScalar(1800).addScaledVector(_perp, k * 120);
      phobos.visible = sd.y > 0.05;
      eclipseK = 1 - 0.55 * clamp(1 - Math.abs(k) / 0.25, 0, 1);
      phobos.rotation.y += 0.01;
    },
    setFocus(p) {
      focusPoint.copy(p);
    },
    dispose,
  };
  return api;
}
