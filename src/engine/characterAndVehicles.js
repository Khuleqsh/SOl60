// SOL 60: RED HORIZON — articulated astronaut rig + procedural animator, descent lander / rescue
// rocket, drivable rover, waving mission flag, canvas textures, and the Earth hangar + boarding scene.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Rounded box (replaces crude BoxGeometry everywhere): soft edges that catch light like machined hardware. */
const softBox = (w, h, d, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.max(0.004, Math.min(w, h, d) * 0.3));
/** Cone / ogive built as a lathe (replaces ConeGeometry): apex at +y, centred like a ConeGeometry. bulge > 1 gives a rounded ogive nose. */
const coneGeo = (r, h, seg = 24, _hs = 1, open = false, bulge = 1) => {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(Math.max(0, r * (1 - Math.pow(t, bulge))), -h / 2 + t * h));
  }
  if (!open) pts.unshift(new THREE.Vector2(0, -h / 2));
  return new THREE.LatheGeometry(pts, seg);
};
import {
  SUIT_COLORS,
  ACCENT_TRIMS,
  VISOR_TINTS,
  BACKPACKS,
  PATCHES,
  HULL_SCHEMES,
  byId,
} from '../data/nasaData.js';

// ---------------------------------------------------------------- shared helpers
export function disposeObject(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of ['map', 'bumpMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'normalMap']) if (m[k]) m[k].dispose();
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) u.value.dispose();
      m.dispose();
    }
  });
}

/** Adds a Fresnel rim light to a MeshStandardMaterial (warm Martian back-scatter). */
export function addRim(mat, color = '#ffb27a', strength = 0.55) {
  const rimColor = new THREE.Color(color).multiplyScalar(strength);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rimColor };
    sh.fragmentShader =
      'uniform vec3 rimColor;\n' +
      sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 rimV = normalize(vViewPosition);
          float rimF = 1.0 - clamp(dot(normal, rimV), 0.0, 1.0);
          totalEmissiveRadiance += rimColor * pow(rimF, 3.0);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'rim-v1';
  return mat;
}

const std = (color, rough = 0.7, metal = 0.05, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function canvasTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- 2D emblems & canvases
function drawEmblem(g, id, cx, cy, s, color) {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = s * 0.08;
  g.translate(cx, cy);
  if (id === 'star') {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.22 : s * 0.5;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (id === 'planet') {
    g.beginPath();
    g.arc(0, 0, s * 0.3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(0, 0, s * 0.55, s * 0.14, -0.35, 0, Math.PI * 2);
    g.stroke();
  } else if (id === 'rocket') {
    g.beginPath();
    g.moveTo(0, -s * 0.5);
    g.quadraticCurveTo(s * 0.2, -s * 0.2, s * 0.16, s * 0.25);
    g.lineTo(s * 0.32, s * 0.45);
    g.lineTo(-s * 0.32, s * 0.45);
    g.lineTo(-s * 0.16, s * 0.25);
    g.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s * 0.5);
    g.fill();
  } else if (id === 'olympus') {
    g.beginPath();
    g.moveTo(-s * 0.55, s * 0.35);
    g.lineTo(-s * 0.15, -s * 0.3);
    g.lineTo(s * 0.15, -s * 0.3);
    g.lineTo(s * 0.55, s * 0.35);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(s * 0.3, -s * 0.42, s * 0.1, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function makePatchCanvas(patchId, accentHex, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const p = byId(PATCHES, patchId);
  const s = size;
  g.fillStyle = accentHex;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.49, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(s * 0.4, s * 0.35, s * 0.05, s / 2, s / 2, s * 0.44);
  grad.addColorStop(0, '#1c2a4a');
  grad.addColorStop(1, '#070b16');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.43, 0, Math.PI * 2);
  g.fill();
  // stars
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996;
    const r = s * 0.12 + ((i * 37) % 100) / 100 * s * 0.28;
    g.fillRect(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 2, 2);
  }
  // Mars
  g.fillStyle = '#c1502e';
  g.beginPath();
  g.arc(s * 0.5, s * 0.62, s * 0.2, 0, Math.PI * 2);
  g.fill();
  const em = { ares7: 'rocket', olympus: 'olympus', pioneer: 'star', redplanet: 'planet' }[p.id];
  drawEmblem(g, em, s * 0.5, s * 0.36, s * 0.34, '#f4f1ea');
  g.fillStyle = '#f4f1ea';
  g.font = `bold ${Math.round(s * 0.085)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText(p.motto, s / 2, s * 0.9);
  return c;
}

export function makeFlagCanvas(custom, w = 256, h = 160) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const [a, b, d] = custom.flagColors;
  g.fillStyle = b;
  g.fillRect(0, 0, w, h);
  switch (custom.flagLayout) {
    case 'v3':
      g.fillStyle = a;
      g.fillRect(0, 0, w / 3, h);
      g.fillStyle = d;
      g.fillRect((2 * w) / 3, 0, w / 3, h);
      break;
    case 'diag':
      g.fillStyle = a;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, 0);
      g.lineTo(0, h);
      g.fill();
      g.fillStyle = d;
      g.beginPath();
      g.moveTo(w, h);
      g.lineTo(w, h * 0.25);
      g.lineTo(w * 0.25, h);
      g.fill();
      break;
    case 'chevron':
      g.fillStyle = a;
      g.fillRect(0, 0, w, h / 2);
      g.fillStyle = d;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w * 0.42, h / 2);
      g.lineTo(0, h);
      g.fill();
      break;
    case 'quarter':
      g.fillStyle = a;
      g.fillRect(0, 0, w / 2, h / 2);
      g.fillRect(w / 2, h / 2, w / 2, h / 2);
      g.fillStyle = d;
      g.fillRect(w / 2, 0, w / 2, h / 2);
      break;
    default:
      g.fillStyle = a;
      g.fillRect(0, 0, w, h / 3);
      g.fillStyle = d;
      g.fillRect(0, (2 * h) / 3, w, h / 3);
  }
  if (custom.flagEmblem !== 'none') {
    const ex = custom.flagLayout === 'chevron' ? w * 0.16 : w / 2;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.arc(ex, h / 2, h * 0.3, 0, Math.PI * 2);
    g.fill();
    drawEmblem(g, custom.flagEmblem, ex, h / 2, h * 0.48, '#ffffff');
  }
  return c;
}

export function makeHullCanvas(custom, label = 'ARES-7') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const sch = byId(HULL_SCHEMES, custom.hull);
  g.fillStyle = sch.base;
  g.fillRect(0, 0, 1024, 512);
  // panel lines
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 2;
  for (let y = 64; y < 512; y += 96) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1024, y);
    g.stroke();
  }
  for (let x = 0; x < 1024; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  g.fillStyle = sch.band;
  g.fillRect(0, 20, 1024, 40);
  g.fillRect(0, 430, 1024, 60);
  const decalAt = (u) => {
    const x = u * 1024;
    if (custom.decal === 'ares') {
      g.save();
      g.translate(x, 250);
      g.rotate(-Math.PI / 2);
      g.fillStyle = sch.band;
      g.font = 'bold 74px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 0, 0);
      g.restore();
    } else if (custom.decal === 'stripes') {
      const cols = custom.flagColors;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = cols[i];
        g.fillRect(x - 60 + i * 40, 110, 40, 280);
      }
    } else if (custom.decal === 'checker') {
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? sch.band : '#111';
          g.fillRect(x - 64 + j * 64, 100 + i * 50, 64, 50);
        }
    }
  };
  decalAt(0.25);
  decalAt(0.75);
  return c;
}

// ---------------------------------------------------------------- astronaut
// Skeleton (metres, feet soles at y = 0, character faces +z, local +x is the character's left):
// hips -> spine -> chest -> head / shoulders -> elbows -> hands, hips -> thighs -> shins -> ankles.
// Each limb is ONE merged vertex-coloured mesh, so a full rig costs about 35 draw calls.
const ANK = 0.085; // ankle joint height above the sole
const L_THIGH = 0.44;
const L_SHIN = 0.43;
const HIP_MAX = 0.975; // pelvis height at near-full leg extension (relative to the sole)
const HIP_W = 0.105;

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Merge many small shapes into one vertex-coloured BufferGeometry. */
function mergeParts(parts) {
  const geos = [];
  for (const p of parts) {
    // RoundedBoxGeometry is non-indexed while lathe/tube/capsule shapes are indexed: normalise before merging
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    if (g !== p.g) p.g.dispose();
    _e.set(p.r ? p.r[0] : 0, p.r ? p.r[1] : 0, p.r ? p.r[2] : 0);
    _q.setFromEuler(_e);
    _v1.set(p.p ? p.p[0] : 0, p.p ? p.p[1] : 0, p.p ? p.p[2] : 0);
    _v2.set(p.s ? p.s[0] : 1, p.s ? p.s[1] : 1, p.s ? p.s[2] : 1);
    _m4.compose(_v1, _q, _v2);
    g.applyMatrix4(_m4);
    _c.set(p.c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

// Rounded-edge slabs (no hard box corners): pads, plates, pouches.
const pBox = (w, h, d, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => ({ g: new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.32), c, p: [x, y, z], r: [rx, ry, rz] });
const pCap = (r, len, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => ({ g: new THREE.CapsuleGeometry(r, len, 4, 12), c, p: [x, y, z], s: [sx, sy, sz] });
const pSph = (r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => ({ g: new THREE.SphereGeometry(r, 16, 12), c, p: [x, y, z], s: [sx, sy, sz] });
const pCyl = (rt, rb, h, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => ({ g: new THREE.CylinderGeometry(rt, rb, h, 12), c, p: [x, y, z], r: [rx, ry, rz] });
const pTor = (r, t, c, x = 0, y = 0, z = 0, sz = 1) => ({ g: new THREE.TorusGeometry(r, t, 6, 18), c, p: [x, y, z], r: [Math.PI / 2, 0, 0], s: [1, sz, 1] });

// Turned (lathe) profiles for the hard upper torso and helmet shell: [radius, height].
const TORSO_PROFILE = [[0.0, -0.06], [0.15, -0.05], [0.19, 0.02], [0.21, 0.14], [0.215, 0.26], [0.2, 0.36], [0.15, 0.42], [0.1, 0.45], [0.0, 0.46]].map(([r, y]) => new THREE.Vector2(r, y));
const HELMET_PROFILE = [[0.0, 0.0], [0.12, 0.0], [0.17, 0.03], [0.2, 0.1], [0.21, 0.19], [0.195, 0.29], [0.14, 0.35], [0.07, 0.375], [0.0, 0.385]].map(([r, y]) => new THREE.Vector2(r, y));

/** Flexible life-support hose: a tube along a curve with ribbed (corrugated) radius. */
function corrugatedTube(points, radius, ribs = 14) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const tub = 56;
  const rad = 8;
  const g = new THREE.TubeGeometry(curve, tub, radius, rad, false);
  const pos = g.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    curve.getPointAt(i / tub, c);
    const k = 1 + 0.3 * Math.sin((i / tub) * Math.PI * 2 * ribs);
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      pos.setXYZ(idx, c.x + (pos.getX(idx) - c.x) * k, c.y + (pos.getY(idx) - c.y) * k, c.z + (pos.getZ(idx) - c.z) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const dampTo = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const sstepN = (a, b, x) => {
  const t = clampN((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const angDiffN = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Angular spring chain for straps, hoses, antennas and cloth flaps. Each segment is a Group nested in the
 * previous one; segments swing from the attach point's acceleration (in the rig's frame) and from wind.
 */
class SpringChain {
  constructor(segs, o = {}) {
    this.segs = segs;
    this.k = o.k ?? 38;
    this.c = o.c ?? 4.2;
    this.gIn = o.gIn ?? 0.04;
    this.hang = o.hang !== false;
    this.windGain = o.wind ?? 0.3;
    this.couple = o.couple ?? 0.5;
    this.limit = o.limit ?? 1.1;
    this.source = o.source || 'chest';
    const n = segs.length;
    this.ax = new Float32Array(n);
    this.az = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vz = new Float32Array(n);
  }

  update(dt, accX, accZ, wx, wz, tiltX, tiltZ, t) {
    const n = this.segs.length;
    const sub = 2;
    const h = dt / sub;
    const sA = this.hang ? 1 : -1;
    const windMag = Math.abs(wx) + Math.abs(wz);
    for (let s = 0; s < sub; s++) {
      let pvx = 0;
      let pvz = 0;
      for (let i = 0; i < n; i++) {
        const restX = this.hang ? -tiltX * 0.85 : 0;
        const restZ = this.hang ? -tiltZ * 0.85 : 0;
        const flut = Math.sin(t * (7 + i * 1.9) + i * 2.3) * this.windGain * 3 * windMag;
        let fx = sA * this.gIn * accZ * 10 - sA * wz * this.windGain * 17 + this.couple * pvx;
        let fz = -sA * this.gIn * accX * 10 + sA * wx * this.windGain * 17 + flut + this.couple * pvz;
        fx += this.k * (restX - this.ax[i]) - this.c * this.vx[i];
        fz += this.k * (restZ - this.az[i]) - this.c * this.vz[i];
        this.vx[i] += fx * h;
        this.vz[i] += fz * h;
        this.ax[i] = clampN(this.ax[i] + this.vx[i] * h, -this.limit, this.limit);
        this.az[i] = clampN(this.az[i] + this.vz[i] * h, -this.limit, this.limit);
        pvx = this.vx[i];
        pvz = this.vz[i];
      }
    }
    for (let i = 0; i < n; i++) {
      this.segs[i].rotation.x = this.ax[i];
      this.segs[i].rotation.z = this.az[i];
    }
  }
}

const hexOf = (c) => `#${c.getHexString()}`;

/**
 * Builds the articulated astronaut. opts.npc picks the rescue-crew look; opts.face shows a human face behind
 * a clear canopy instead of a reflective visor.
 */
export function createAstronaut(custom, opts = {}) {
  const root = new THREE.Group();
  root.name = opts.npc ? 'rescue-crew' : 'astronaut';
  const suitHex = byId(SUIT_COLORS, custom.suit).hex;
  const accentHex = byId(ACCENT_TRIMS, custom.accent).hex;
  const visor = byId(VISOR_TINTS, custom.visor);
  const S = suitHex;
  const D = hexOf(new THREE.Color(suitHex).multiplyScalar(0.5));
  const A = accentHex;
  const M = '#8d96a1';
  const T = '#262a31';
  const G = '#2f343c'; // glove / boot rubber
  const FOIL = '#caa54a';

  const bodyMat = addRim(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.74, metalness: 0.06 }));
  const hardMat = addRim(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.32, metalness: 0.78 }), '#ffd2a0', 0.3);
  // curved reflective visor: clearcoat over a polished metal tint, lit by the scene's environment
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: visor.hex,
    roughness: visor.rough * 0.6,
    metalness: visor.metal,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 2.2,
    emissive: visor.id === 'cyan' ? new THREE.Color('#0a5a66') : new THREE.Color('#000000'),
  });
  const patchTex = canvasTexture(makePatchCanvas(custom.patch, accentHex, 128));
  const patchMat = new THREE.MeshStandardMaterial({ map: patchTex, roughness: 0.8, transparent: true });

  const mk = (parts, parent, mat = bodyMat) => {
    const m = new THREE.Mesh(mergeParts(parts), mat);
    m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  };
  const place = (obj, parent, x = 0, y = 0, z = 0) => {
    obj.position.set(x, y, z);
    if (parent) parent.add(obj);
    return obj;
  };

  // ---- pelvis + belt
  const hips = place(new THREE.Group(), root, 0, HIP_MAX, 0);
  mk(
    [
      pSph(0.19, D, 0, 0, 0, 1, 0.62, 0.78),
      pTor(0.185, 0.03, A, 0, 0.075, 0, 0.78),
      pBox(0.1, 0.1, 0.06, D, 0.17, -0.01, 0.11),
      pBox(0.1, 0.1, 0.06, D, -0.17, -0.01, 0.11),
      pBox(0.2, 0.1, 0.05, D, 0, 0.02, -0.15),
      pBox(0.06, 0.05, 0.03, M, 0, 0.075, 0.18),
      pSph(0.1, S, 0.2, -0.01, 0, 0.55, 1.15, 1.5),
      pSph(0.1, S, -0.2, -0.01, 0, 0.55, 1.15, 1.5),
      pBox(0.045, 0.12, 0.05, T, 0.2, -0.1, 0.12),
    ],
    hips,
  );

  // ---- spine (abdomen bellows) and chest
  const spine = place(new THREE.Group(), hips, 0, 0.07, 0);
  mk([pCap(0.14, 0.02, S, 0, 0.1, 0, 1, 1, 0.85), pTor(0.15, 0.02, D, 0, 0.05, 0, 0.85), pTor(0.15, 0.02, D, 0, 0.13, 0, 0.85)], spine);
  const chest = place(new THREE.Group(), spine, 0, 0.2, 0);
  mk(
    [
      { g: new THREE.LatheGeometry(TORSO_PROFILE, 28), c: S, p: [0, 0, 0], s: [1, 1, 0.8] },
      { g: corrugatedTube([[0.12, 0.3, -0.26], [0.2, 0.2, -0.22], [0.27, 0.14, -0.04], [0.22, 0.12, 0.09]], 0.018), c: '#cfd4da', p: [0, 0, 0] },
      { g: corrugatedTube([[-0.12, 0.3, -0.26], [-0.2, 0.2, -0.22], [-0.27, 0.14, -0.04], [-0.22, 0.12, 0.09]], 0.018), c: '#cfd4da', p: [0, 0, 0] },
      pBox(0.34, 0.22, 0.05, D, 0, 0.22, 0.165),
      pBox(0.3, 0.1, 0.04, D, 0, 0.06, 0.15),
      pBox(0.5, 0.07, 0.24, D, 0, 0.36, 0),
      pTor(0.125, 0.03, A, 0, 0.43, 0, 0.95),
      pBox(0.05, 0.34, 0.02, T, 0.1, 0.2, 0.195),
      pBox(0.05, 0.34, 0.02, T, -0.1, 0.2, 0.195),
      pBox(0.1, 0.04, 0.03, M, 0, 0.18, 0.205),
      pCyl(0.035, 0.035, 0.05, M, 0.21, 0.12, 0.1, 0, 0, Math.PI / 2),
      pCyl(0.035, 0.035, 0.05, M, -0.21, 0.12, 0.1, 0, 0, Math.PI / 2),
      pBox(0.18, 0.1, 0.03, M, 0.06, 0.25, 0.2),
    ],
    chest,
  );
  const dcuLight = new THREE.Mesh(softBox(0.07, 0.025, 0.012), new THREE.MeshBasicMaterial({ color: '#3dff8a' }));
  place(dcuLight, chest, 0.06, 0.27, 0.22);
  const chestPatch = new THREE.Mesh(new THREE.CircleGeometry(0.065, 20), patchMat);
  place(chestPatch, chest, -0.1, 0.27, 0.192);

  // ---- head
  const head = place(new THREE.Group(), chest, 0, 0.44, 0);
  const headParts = [pCyl(0.1, 0.11, 0.07, A), pTor(0.155, 0.035, D, 0, 0.06, 0, 1.05)];
  let visorMesh = null;
  if (opts.face) {
    // clear canopy over a human head
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    );
    place(canopy, head, 0, 0.17, 0);
    visorMesh = canopy;
    const skin = opts.skin || '#d2a07a';
    const skinDark = hexOf(new THREE.Color(skin).multiplyScalar(0.8));
    const hair = opts.hair || '#2a1e18';
    mk(
      [
        pSph(0.105, skin, 0, 0.17, 0, 0.95, 1.12, 1),
        { g: new THREE.SphereGeometry(0.114, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), c: hair, p: [0, 0.18, -0.008] },
        pBox(0.02, 0.032, 0.026, skinDark, 0, 0.16, 0.108),
        pSph(0.012, '#1a1410', 0.035, 0.19, 0.093),
        pSph(0.012, '#1a1410', -0.035, 0.19, 0.093),
        pBox(0.04, 0.008, 0.01, hair, 0.035, 0.208, 0.095),
        pBox(0.04, 0.008, 0.01, hair, -0.035, 0.208, 0.095),
        pBox(0.04, 0.007, 0.008, '#7a3b34', 0, 0.128, 0.098),
        pSph(0.02, skin, 0.105, 0.17, 0, 0.6, 1, 0.8),
        pSph(0.02, skin, -0.105, 0.17, 0, 0.6, 1, 0.8),
      ],
      head,
    );
  } else {
    headParts.push({ g: new THREE.LatheGeometry(HELMET_PROFILE, 32), c: S, p: [0, -0.015, 0], s: [1, 1, 1.05] }, pBox(0.16, 0.12, 0.05, D, 0, 0.15, -0.2));
    headParts.push(pCyl(0.04, 0.04, 0.04, M, 0.2, 0.15, 0, 0, 0, Math.PI / 2), pCyl(0.04, 0.04, 0.04, M, -0.2, 0.15, 0, 0, 0, Math.PI / 2));
    headParts.push(pBox(0.1, 0.02, 0.06, M, 0, 0.37, 0.1));
    // a human inside: head, comm cap ("Snoopy cap") and face silhouette, faintly visible through the gold visor
    headParts.push(
      pSph(0.098, '#c99a78', 0, 0.165, 0.012, 0.95, 1.1, 1),
      { g: new THREE.SphereGeometry(0.106, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), c: '#e8e4dc', p: [0, 0.172, -0.004] },
      pSph(0.03, '#4a4f58', 0.1, 0.15, 0.0, 0.6, 1, 1),
      pSph(0.03, '#4a4f58', -0.1, 0.15, 0.0, 0.6, 1, 1),
      pBox(0.018, 0.028, 0.02, '#a87d60', 0, 0.16, 0.103),
      pSph(0.01, '#1a1410', 0.034, 0.185, 0.09),
      pSph(0.01, '#1a1410', -0.034, 0.185, 0.09),
    );
    visorMat.transparent = true;
    visorMat.opacity = 0.84;
    visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.42), visorMat);
    visorMesh.renderOrder = 2;
    place(visorMesh, head, 0, 0.17, 0.03);
  }
  mk(headParts, head);
  const helmetLamp = new THREE.Mesh(softBox(0.05, 0.04, 0.05), new THREE.MeshBasicMaterial({ color: '#fffbe8' }));
  place(helmetLamp, head, 0.16, 0.29, 0.1);

  // ---- backpack (variants) + harness
  const pack = place(new THREE.Group(), chest, 0, 0.24, -0.21);
  const bp = custom.backpack;
  const packParts = [pBox(0.42, 0.56, 0.2, S, 0, 0, -0.03), pBox(0.43, 0.06, 0.21, A, 0, 0.18, -0.03), pBox(0.2, 0.12, 0.04, D, 0, -0.1, -0.15)];
  if (bp === 'o2max') {
    packParts.push(pCap(0.075, 0.42, M, -0.13, 0, -0.17), pCap(0.075, 0.42, M, 0.13, 0, -0.17));
  } else if (bp === 'rad') {
    for (let i = 0; i < 5; i++) packParts.push(pBox(0.46, 0.04, 0.26, D, 0, -0.22 + i * 0.11, -0.04));
  } else if (bp === 'solar') {
    packParts.push(pBox(0.42, 0.34, 0.015, '#1b2c5a', 0.42, 0.12, -0.12, 0, 0.35, 0), pBox(0.42, 0.34, 0.015, '#1b2c5a', -0.42, 0.12, -0.12, 0, -0.35, 0));
  } else {
    packParts.push(pCyl(0.06, 0.06, 0.5, M, 0.17, 0, -0.15));
  }
  mk(packParts, pack);
  const packLight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: accentHex }));
  place(packLight, pack, 0, 0.24, -0.15);
  // diegetic O2 / power spine bar: glows cyan, shifts to red as oxygen runs low
  const spineBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.38, 4, 10), new THREE.MeshStandardMaterial({ color: '#06161c', emissive: '#2ee6ff', emissiveIntensity: 1.8, roughness: 0.4 }));
  place(spineBar, pack, 0, -0.02, -0.15);

  // ---- arms
  const makeArm = (side) => {
    const sh = place(new THREE.Group(), chest, 0.27 * side, 0.34, 0);
    mk(
      [
        pSph(0.098, S),
        pTor(0.09, 0.02, M, 0, -0.02, 0), // scye (shoulder) bearing
        pBox(0.13, 0.035, 0.15, D, 0, 0.075, 0, 0, 0, side * 0.25),
        pCap(0.07, 0.17, S, 0, -0.155, 0),
        pTor(0.074, 0.016, A, 0, -0.1, 0),
      ],
      sh,
    );
    if (side > 0) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.052, 18), patchMat);
      p.rotation.y = Math.PI / 2;
      place(p, sh, 0.07, -0.13, 0);
    }
    const el = place(new THREE.Group(), sh, 0, -0.3, 0);
    mk(
      [
        pCap(0.06, 0.12, S, 0, -0.14, 0),
        pSph(0.072, D, 0, -0.005, -0.035, 1, 0.85, 1.1),
        pTor(0.062, 0.015, A, 0, -0.2, 0),
        pTor(0.058, 0.02, M, 0, -0.265, 0),
      ],
      el,
    );
    const hd = place(new THREE.Group(), el, 0, -0.28, 0);
    mk([pBox(0.085, 0.1, 0.045, G, 0, -0.055, 0), pBox(0.08, 0.075, 0.04, G, 0, -0.125, 0.012, -0.25, 0, 0), pBox(0.025, 0.05, 0.03, G, -side * 0.05, -0.07, 0.02)], hd);
    return { sh, el, hd };
  };
  const L = makeArm(1);
  const R = makeArm(-1);

  // welding / diagnostic torch in the right hand
  const torch = new THREE.Group();
  place(torch, R.hd, 0, -0.09, 0.04);
  mk([pCyl(0.025, 0.03, 0.22, M, 0, 0, 0.06, Math.PI / 2, 0, 0)], torch, hardMat);
  const torchTip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#9fe8ff' }));
  place(torchTip, torch, 0, 0, 0.19);
  torch.visible = false;

  // ---- legs
  // Every segment overlaps the joint below it (thigh -> knee, shin -> ankle) and each joint carries a bearing
  // sphere, so the leg stays welded together at any bend angle: idle, walk, jump, crouch or climbing.
  const makeLeg = (side) => {
    const hp = place(new THREE.Group(), hips, HIP_W * side, -0.03, 0);
    mk(
      [
        pSph(0.097, D),
        // thigh: hip ball down to (and slightly past) the knee pivot at -L_THIGH
        pCap(0.094, L_THIGH - 0.16, S, 0, -L_THIGH / 2 - 0.01, 0, 1, 1, 0.95),
        pBox(0.05, 0.13, 0.1, D, side * 0.09, -0.2, 0.02),
        pTor(0.096, 0.016, A, 0, -0.32, 0),
      ],
      hp,
    );
    const kn = place(new THREE.Group(), hp, 0, -L_THIGH, 0);
    mk(
      [
        // knee bearing + pleated bellows: fills the joint from every side while it bends
        pSph(0.088, D, 0, 0, 0, 1, 0.95, 1),
        pTor(0.087, 0.018, D, 0, 0.035, 0),
        pTor(0.084, 0.018, D, 0, -0.035, 0),
        pBox(0.13, 0.12, 0.06, D, 0, 0, 0.085),
        // shin: knee pivot all the way down into the boot shaft at the ankle pivot (-L_SHIN)
        pCap(0.079, L_SHIN - 0.15, S, 0, -L_SHIN / 2, 0, 1, 1, 0.95),
        pBox(0.1, 0.24, 0.04, D, 0, -0.2, 0.078),
        pTor(0.081, 0.016, A, 0, -0.3, 0),
      ],
      kn,
    );
    const an = place(new THREE.Group(), kn, 0, -L_SHIN, 0);
    mk(
      [
        // ankle bearing and an EVA boot shaft that sleeves up over the shin
        pSph(0.074, D),
        pCyl(0.086, 0.092, 0.17, D, 0, 0.055, 0),
        pTor(0.088, 0.017, M, 0, 0.13, 0),
        pBox(0.14, 0.085, 0.22, D, 0, -0.04, 0.04),
        pBox(0.14, 0.06, 0.08, D, 0, -0.05, 0.155),
        pBox(0.12, 0.08, 0.06, D, 0, -0.045, -0.07),
        pBox(0.15, 0.022, 0.28, T, 0, -0.074, 0.04),
        pBox(0.145, 0.016, 0.2, A, 0, -0.015, 0.04),
        pTor(0.065, 0.018, M, 0, 0.02, 0),
      ],
      an,
    );
    return { hp, kn, an };
  };
  const LL = makeLeg(1);
  const RL = makeLeg(-1);

  // ---- spring-driven secondary motion: antenna, hose, thermal flap, harness strap tails
  const chains = [];
  const buildChain = (parent, x, y, z, n, segLen, dir, makeSegParts, mat, o) => {
    const segs = [];
    let up = parent;
    for (let i = 0; i < n; i++) {
      const g = place(new THREE.Group(), up, i === 0 ? x : 0, i === 0 ? y : dir * segLen, i === 0 ? z : 0);
      mk(makeSegParts(i, dir * segLen * 0.5), g, mat);
      segs.push(g);
      up = g;
    }
    const ch = new SpringChain(segs, { hang: dir < 0, ...o });
    chains.push(ch);
    return ch;
  };
  const antenna = buildChain(pack, 0.15, 0.3, -0.04, 2, 0.17, 1, (i, mid) => [pCyl(0.006, 0.008, 0.17, M, 0, mid, 0)], hardMat, { k: 55, c: 3.2, gIn: 0.03, wind: 0.22, hang: false });
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff4a3a' }));
  place(antTip, antenna.segs[1], 0, 0.17, 0);
  buildChain(hips, -0.19, -0.04, -0.07, 3, 0.13, -1, (i, mid) => [pCap(0.018, 0.09, T, 0, mid, 0)], bodyMat, { k: 30, c: 3.4, gIn: 0.05, source: 'hips' });
  buildChain(hips, 0, 0.0, -0.16, 2, 0.17, -1, (i) => [pBox(i === 0 ? 0.3 : 0.26, 0.17, 0.012, FOIL, 0, -0.085, 0)], hardMat, { k: 24, c: 3.0, gIn: 0.06, wind: 0.5, source: 'hips' });
  buildChain(chest, 0.1, 0.03, 0.2, 2, 0.08, -1, () => [pBox(0.045, 0.08, 0.01, T, 0, -0.04, 0)], bodyMat, { k: 34, c: 3.4, gIn: 0.05 });
  buildChain(chest, -0.1, 0.03, 0.2, 2, 0.08, -1, () => [pBox(0.045, 0.08, 0.01, T, 0, -0.04, 0)], bodyMat, { k: 34, c: 3.4, gIn: 0.05 });

  // thin secondary-motion parts are too small to matter as shadow casters; skipping them saves draw calls
  for (const ch of chains) for (const g of ch.segs) g.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  const joints = { hips, spine, chest, head, L, R, LL, RL, HIP_Y: HIP_MAX };
  return {
    root,
    joints,
    torch,
    torchTip,
    helmetLamp,
    visorMesh,
    lights: [dcuLight, packLight],
    spineBar,
    chains,
    custom,
    getTorchTip(out) {
      return torchTip.getWorldPosition(out);
    },
    dispose() {
      disposeObject(root);
    },
  };
}

// Reused scratch for the animator's weighted pose blend.
const POSE_KEYS = ['spX', 'spY', 'spZ', 'chX', 'chY', 'chZ', 'hdX', 'hdY', 'hdZ', 'lsx', 'lsz', 'lex', 'lhx', 'rsx', 'rsz', 'rex', 'rhx'];
const zeroPose = () => Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));

/**
 * Procedural animation controller. Locomotion uses stride-matched foot paths solved with two-bone IK against the
 * real terrain (no sliding, weighty steps, pelvis bob from leg reach); the upper body is a damped weighted blend
 * of idle / locomotion / air / repair / beckon with crouch and jump overlays, velocity lean into turns, head
 * look-at, and spring secondary motion.
 *
 * update(dt, s): s = { speed, vx, vz, facing, x, y, z, ground(x,z), slope, grounded, anticip, landT, repairing,
 *   beckon, crouch, vy, lookYaw, lookPitch, windX, windZ }. Only speed/grounded are required.
 * Returns true on the frame a foot strikes the ground.
 */
export class AstronautAnimator {
  constructor(astro) {
    this.a = astro;
    this.t = Math.random() * 10;
    this.w = { idle: 1, walk: 0, jog: 0, sprint: 0, air: 0, repair: 0, crouch: 0, jc: 0, beckon: 0, turn: 0, loco: 0 };
    this.sp = 0;
    this.turn = 0;
    this.phase = 0;
    this.turnPh = 0;
    this.pelvisY = HIP_MAX;
    this.prevFacing = null;
    this.pvx = 0;
    this.pvz = 0;
    this.accX = 0;
    this.accZ = 0;
    this.headYaw = 0;
    this.headPitch = 0;
    this.pose = zeroPose();
    this._tmp = zeroPose();
    this.foot = [0, 1].map(() => ({ gRel: 0, slope: 0, z: 0, zg: 0, y: ANK, u: 0, prevU: 0 }));
  }

  update(dt, s) {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return false;
    this.t += dt;
    const t = this.t;
    const W = this.w;
    const grounded = s.grounded !== false;
    const facing = s.facing;
    this.sp = dampTo(this.sp, s.speed || 0, 9, dt);
    const v = this.sp;

    // turn rate and rig-local acceleration (drive lean and secondary motion)
    let tr = 0;
    if (facing !== undefined) {
      if (this.prevFacing !== null) tr = clampN(angDiffN(facing, this.prevFacing) / dt, -12, 12);
      this.prevFacing = facing;
    }
    this.turn = dampTo(this.turn, tr, 9, dt);
    const fy = facing ?? 0;
    const sn = Math.sin(fy);
    const cs = Math.cos(fy);
    if (s.vx !== undefined) {
      const wax = (s.vx - this.pvx) / dt;
      const waz = (s.vz - this.pvz) / dt;
      this.pvx = s.vx;
      this.pvz = s.vz;
      this.accX = dampTo(this.accX, clampN(wax * cs - waz * sn, -30, 30), 10, dt);
      this.accZ = dampTo(this.accZ, clampN(wax * sn + waz * cs, -30, 30), 10, dt);
    }

    // damped blend weights
    const moving = grounded && v > 0.35 && !s.repairing;
    const targets = {
      air: grounded ? 0 : 1,
      repair: s.repairing && grounded ? 1 : 0,
      beckon: s.beckon && grounded && !s.repairing ? 1 : 0,
      crouch: s.crouch ? 1 : 0,
      jc: s.anticip > 0 ? 1 : s.landT > 0 ? Math.min(1, s.landT / 0.18) : 0,
      loco: moving ? 1 : 0,
      turn: !moving && grounded && Math.abs(this.turn) > 0.7 && !s.repairing && !s.beckon ? 1 : 0,
    };
    const rates = { air: 14, repair: 9, beckon: 7, crouch: 8, jc: 24, loco: 10, turn: 12 };
    for (const k of Object.keys(targets)) W[k] = dampTo(W[k], targets[k], rates[k], dt);
    W.idle = Math.max(0, 1 - Math.max(W.loco, W.air, W.repair, W.beckon));
    const sprintAmt = sstepN(4.0, 6.2, v);
    const jogAmt = sstepN(2.0, 3.4, v) * (1 - sprintAmt);
    W.walk = W.loco * (1 - sstepN(2.0, 3.4, v));
    W.jog = W.loco * jogAmt;
    W.sprint = W.loco * sprintAmt;

    // stride-matched gait: stance foot moves back at exactly ground speed so feet never slide
    const vv = Math.max(v, 0.01);
    const crouchW = W.crouch;
    const A = clampN(0.26 + 0.09 * vv, 0.2, 0.6) * (1 - 0.35 * crouchW) * sstepN(0.05, 0.9, v);
    const duty = clampN(0.66 - 0.05 * vv, 0.36, 0.66);
    const lift = clampN(0.06 + 0.028 * vv, 0.06, 0.25);
    if (W.loco > 0.05 && A > 0.02) this.phase = (this.phase + dt * Math.min(16, (Math.PI * vv * duty) / Math.max(A, 0.05))) % (Math.PI * 2);
    if (W.turn > 0.05) this.turnPh += dt * Math.abs(this.turn) * 2.2;
    const turnSign = Math.sign(this.turn) || 1;

    // foot targets (rig space), sampled against the real terrain
    let stepped = false;
    const ps = Math.sin(this.phase);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const fs = this.foot[i];
      const u = (((this.phase + (i === 0 ? 0 : Math.PI)) / (Math.PI * 2)) % 1 + 1) % 1;
      let gz;
      let gl;
      if (u < duty) {
        gz = A * (1 - (2 * u) / duty);
        gl = 0;
      } else {
        const s2 = (u - duty) / (1 - duty);
        gz = -A + 2 * A * (0.5 - 0.5 * Math.cos(Math.PI * s2));
        gl = lift * Math.sin(Math.PI * s2);
      }
      fs.zg = gz;
      const idleZ = i === 0 ? 0.045 : -0.03;
      const repairZ = i === 0 ? 0.2 : -0.16;
      const beckonZ = i === 0 ? 0.1 : -0.08;
      const wr = clampN(W.repair, 0, 1);
      const wb = clampN(W.beckon, 0, 1);
      const rest = idleZ * (1 - wr - wb) + repairZ * wr + beckonZ * wb;
      const tp = Math.sin(this.turnPh + i * Math.PI);
      let z = rest + (gz - rest) * W.loco + W.turn * 0.07 * tp;
      let l = gl * W.loco + W.turn * 0.05 * Math.max(0, Math.sin(this.turnPh + i * Math.PI + 0.5));
      const airZ = i === 0 ? 0.2 : -0.12;
      const airY = ANK + (i === 0 ? 0.34 : 0.18) - clampN(-(s.vy || 0) * 0.03, 0, 0.12);
      z = z + (airZ - z) * W.air;

      let gRel = 0;
      let slope = s.slope || 0;
      if (s.ground && grounded) {
        const lx = side * HIP_W;
        const wx = s.x + z * sn + lx * cs;
        const wz = s.z + z * cs - lx * sn;
        gRel = s.ground(wx, wz) - s.y;
        const ds = 0.13;
        slope = Math.atan2(s.ground(wx + sn * ds, wz + cs * ds) - s.ground(wx - sn * ds, wz - cs * ds), 2 * ds);
      }
      fs.gRel = dampTo(fs.gRel, clampN(gRel, -0.4, 0.5), 22, dt);
      fs.slope = dampTo(fs.slope, clampN(slope, -0.8, 0.8), 18, dt);
      const yGround = ANK + fs.gRel + l;
      fs.y = yGround + (airY - yGround) * W.air;
      fs.z = z;
      fs.u = u;
      fs.swing = u >= duty ? (u - duty) / (1 - duty) : 0;
      fs.stance = u < duty;
      fs.duty = duty;
      if (fs.prevU > 0.9 && u < 0.1 && W.loco > 0.4 && grounded) stepped = true;
      fs.prevU = u;
    }

    // pelvis: as high as the legs can reach, so bob and knee bend come from the IK itself
    const crouchDrop = 0.2 * crouchW + 0.26 * W.jc + 0.06 * W.repair;
    let hipTarget = HIP_MAX - crouchDrop - 0.1 * W.air - 0.05 * W.loco + Math.sin(t * 1.7) * 0.006 * W.idle;
    const reach = 0.985 * (L_THIGH + L_SHIN);
    for (const fs of this.foot) {
      const gmax = Math.sqrt(Math.max(0.0004, reach * reach - fs.z * fs.z));
      hipTarget = Math.min(hipTarget, fs.y + gmax + 0.03);
    }
    this.pelvisY = dampTo(this.pelvisY, hipTarget, 26, dt);

    // ---- upper body weighted blend
    const P = this.pose;
    for (const k of POSE_KEYS) P[k] = 0;
    let wsum = 0;
    const add = (wt, fn) => {
      if (wt < 0.001) return;
      const o = this._tmp;
      for (const k of POSE_KEYS) o[k] = 0;
      fn(o);
      for (const k of POSE_KEYS) P[k] += o[k] * wt;
      wsum += wt;
    };
    const roll = clampN(-this.turn * v * 0.028, -0.2, 0.2);
    const lean = clampN(0.04 + 0.05 * v, 0.04, 0.34) + clampN(this.accZ * 0.012, -0.1, 0.14);
    const Aref = Math.max(A, 0.15);
    add(W.idle, (o) => {
      const b = Math.sin(t * 1.7);
      o.spX = b * 0.012;
      o.chX = b * 0.02 - 0.02;
      o.chY = Math.sin(t * 0.35) * 0.04;
      o.lsz = 0.12 + Math.sin(t * 0.9) * 0.025;
      o.rsz = -0.12 - Math.sin(t * 0.9 + 1) * 0.025;
      o.lsx = Math.sin(t * 0.7) * 0.05;
      o.rsx = Math.sin(t * 0.7 + 2) * 0.05;
      o.lex = o.rex = -0.22;
      o.lhx = o.rhx = -0.1;
      const cyc = t % 9;
      o.hdY = cyc < 3.4 ? Math.sin((cyc / 3.4) * Math.PI * 2) * 0.5 : 0;
      o.hdX = -0.03;
      o.chZ = Math.sin(t * 0.5) * 0.015;
    });
    add(W.loco, (o) => {
      const B = clampN(0.25 + 0.085 * v, 0.25, 0.8);
      o.lsx = (B * this.foot[0].zg) / Aref;
      o.rsx = (B * this.foot[1].zg) / Aref;
      o.lsz = 0.1 + 0.035 * v;
      o.rsz = -(0.1 + 0.035 * v);
      o.lex = o.rex = -clampN(0.3 + 0.11 * v, 0.3, 1.1);
      o.lhx = o.rhx = -0.15;
      o.spX = lean * 0.4;
      o.chX = lean * 0.6;
      o.chY = (0.1 * (this.foot[0].zg - this.foot[1].zg)) / (2 * Aref) * (0.4 + v * 0.12);
      o.spY = -o.chY * 0.5;
      o.spZ = roll * 0.4;
      o.chZ = roll * 0.6 + ps * 0.02;
      o.hdZ = -roll * 0.5;
      o.hdX = -lean * 0.7;
    });
    add(W.air, (o) => {
      const vy = s.vy || 0;
      o.lsz = 0.95 + Math.sin(t * 3) * 0.1;
      o.rsz = -(0.95 + Math.sin(t * 3 + 1) * 0.1);
      o.lsx = o.rsx = -0.3;
      o.lex = o.rex = -0.5;
      o.spX = 0.1 - clampN(vy * 0.02, -0.15, 0.15);
      o.chX = 0.05;
      o.hdX = vy > 0 ? -0.1 : 0.15;
    });
    add(W.repair, (o) => {
      o.rsx = -1.35;
      o.rsz = -0.15;
      o.rex = -0.55 + Math.sin(t * 22) * 0.03;
      o.lsx = -0.55;
      o.lsz = 0.25;
      o.lex = -0.9;
      o.spX = 0.1;
      o.chX = 0.14;
      o.hdX = 0.22;
      o.rhx = -0.2;
    });
    add(W.beckon, (o) => {
      o.rsx = -1.55;
      o.rsz = -0.3;
      o.rex = -0.9 + Math.sin(t * 7.5) * 0.8;
      o.rhx = Math.sin(t * 7.5 + 0.8) * 0.5;
      o.lsx = 0.1;
      o.lsz = 0.14;
      o.lex = -0.25;
      o.chX = 0.05;
      o.chY = -0.12;
      o.hdZ = 0.08;
      o.hdX = -0.05;
    });
    if (wsum > 0) for (const k of POSE_KEYS) P[k] /= wsum;
    // crouch (held) and jump anticipation / landing overlays
    if (crouchW > 0.001) {
      P.spX += 0.28 * crouchW;
      P.chX += 0.2 * crouchW;
      P.hdX -= 0.2 * crouchW;
      P.lsx += (-0.35 - P.lsx) * crouchW * 0.6;
      P.rsx += (-0.35 - P.rsx) * crouchW * 0.6;
      P.lex += (-0.7 - P.lex) * crouchW * 0.6;
      P.rex += (-0.7 - P.rex) * crouchW * 0.6;
    }
    if (W.jc > 0.001) {
      P.spX += 0.3 * W.jc;
      P.chX += 0.2 * W.jc;
      P.lsx += (0.45 - P.lsx) * W.jc;
      P.rsx += (0.45 - P.rsx) * W.jc;
      P.lex += (-0.5 - P.lex) * W.jc;
      P.rex += (-0.5 - P.rex) * W.jc;
    }
    // head look-at: the head leads the body toward the camera / movement direction, damped
    const ly = clampN(s.lookYaw || 0, -1.1, 1.1);
    const lp = clampN(s.lookPitch || 0, -0.5, 0.5);
    this.headYaw = dampTo(this.headYaw, ly * 0.75, 7, dt);
    this.headPitch = dampTo(this.headPitch, lp * 0.6, 7, dt);
    P.chY += this.headYaw * 0.2;

    this._apply(P, s, dt, ps, duty, turnSign, sn, cs);
    this.a.torch.visible = W.repair > 0.5;
    return stepped;
  }

  _apply(P, s, dt, ps, duty, turnSign, sn, cs) {
    const j = this.a.joints;
    const W = this.w;
    j.hips.position.set(-0.012 * ps * W.loco + Math.sin(this.t * 0.4) * 0.008 * W.idle, this.pelvisY, 0);
    j.hips.rotation.set(0, ps * 0.06 * W.loco * clampN(this.sp / 3, 0.3, 1), Math.sin(this.phase) * 0.03 * W.loco);
    j.spine.rotation.set(P.spX, P.spY, P.spZ);
    j.chest.rotation.set(P.chX, P.chY, P.chZ);
    const breath = Math.sin(this.t * (1.7 + W.loco * 2)) * (0.012 + W.loco * 0.01);
    j.chest.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
    j.head.rotation.set(P.hdX + this.headPitch, P.hdY + this.headYaw, P.hdZ);
    j.L.sh.rotation.set(P.lsx, 0, P.lsz);
    j.L.el.rotation.x = P.lex;
    j.L.hd.rotation.x = P.lhx;
    j.R.sh.rotation.set(P.rsx, 0, P.rsz);
    j.R.el.rotation.x = P.rex;
    j.R.hd.rotation.x = P.rhx;

    // two-bone IK for both legs
    const reach = 0.985 * (L_THIGH + L_SHIN);
    for (let i = 0; i < 2; i++) {
      const leg = i === 0 ? j.LL : j.RL;
      const fs = this.foot[i];
      const dz = fs.z;
      const dy = this.pelvisY - 0.03 - fs.y;
      const d = clampN(Math.hypot(dz, dy), 0.12, reach);
      const knee = Math.PI - Math.acos(clampN((L_THIGH * L_THIGH + L_SHIN * L_SHIN - d * d) / (2 * L_THIGH * L_SHIN), -1, 1));
      const phi = Math.acos(clampN((L_THIGH * L_THIGH + d * d - L_SHIN * L_SHIN) / (2 * L_THIGH * d), -1, 1));
      const thighF = Math.atan2(dz, dy) + phi;
      leg.hp.rotation.x = -thighF;
      leg.kn.rotation.x = knee;
      let ankle = -fs.slope + (thighF - knee);
      if (W.loco > 0.01) {
        const toeOff = fs.stance ? 0.45 * sstepN(duty - 0.14, duty, fs.u) : 0;
        const swingBump = fs.stance ? 0 : Math.sin(Math.PI * fs.swing);
        ankle += W.loco * (toeOff - 0.22 * swingBump);
      }
      ankle += 0.35 * W.air;
      leg.an.rotation.x = ankle;
      const turnYaw = W.turn * 0.3 * turnSign * Math.max(0, Math.sin(this.turnPh + i * Math.PI + 0.5));
      leg.hp.rotation.y = turnYaw;
      leg.hp.rotation.z = (i === 0 ? 1 : -1) * 0.03;
    }

    // secondary motion
    const wxw = s.windX || 0;
    const wzw = s.windZ || 0;
    const wl = wxw * cs - wzw * sn;
    const wf = wxw * sn + wzw * cs;
    const tx = P.spX + P.chX;
    const tz = P.spZ + P.chZ;
    for (const ch of this.a.chains) {
      if (ch.source === 'hips') ch.update(dt, this.accX, this.accZ, wl, wf, 0, 0, this.t);
      else ch.update(dt, this.accX, this.accZ, wl, wf, tx, tz, this.t);
    }
  }
}

// ---------------------------------------------------------------- lander / rocket
function makeBell(type, mat) {
  const g = new THREE.Group();
  const lathe = (r0, r1, len) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 0.7), -t * len));
    }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat);
    m.material.side = THREE.DoubleSide;
    m.castShadow = true;
    return m;
  };
  let exitY = -1.2;
  if (type === 'rl10') {
    g.add(lathe(0.22, 0.62, 1.5));
    exitY = -1.5;
  } else if (type === 'aerospike') {
    const spike = new THREE.Mesh(coneGeo(0.85, 1.1, 24), mat);
    spike.rotation.x = Math.PI;
    spike.position.y = -0.55;
    g.add(spike);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.09, 8, 28), mat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    exitY = -1.1;
  } else if (type === 'quad') {
    for (let i = 0; i < 4; i++) {
      const b = lathe(0.12, 0.36, 0.8);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      g.add(b);
    }
    exitY = -0.8;
  } else {
    g.add(lathe(0.34, 1.0, 1.2));
  }
  return { group: g, exitY };
}

/**
 * Descent lander / rocket. opts: { bodyH, radius, label, fins }.
 * Hatch faces +Z at sill height 2.9 m. setHatch(0..1), setRamp(0..1), setFlame(0..1).
 */
export function createLander(custom, opts = {}) {
  const bodyH = opts.bodyH ?? 5;
  const R = opts.radius ?? 1.7;
  const group = new THREE.Group();
  const hullTex = canvasTexture(makeHullCanvas(custom, opts.label || 'ARES-7'));
  const hull = addRim(new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.45, metalness: 0.25 }), '#ffcf9a', 0.35);
  const dark = std('#2a2d33', 0.6, 0.6);
  const bellMat = std('#55504a', 0.35, 0.85);
  const legMat = std('#8d939b', 0.4, 0.7);
  const baseY = 1.6;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.05, bodyH, 32, 1, true), hull);
  body.position.y = baseY + bodyH / 2;
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 32), dark);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = baseY;
  group.add(bottom);
  const nose = new THREE.Mesh(coneGeo(R, R * 1.5, 32, 1, false, 1.9), hull);
  nose.position.y = baseY + bodyH + R * 0.75;
  nose.castShadow = true;
  group.add(nose);
  const bell = makeBell(custom.bell, bellMat);
  bell.group.position.y = baseY;
  group.add(bell.group);
  // landing legs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const top = new THREE.Vector3(Math.cos(a) * R * 0.9, baseY + 0.8, Math.sin(a) * R * 0.9);
    const foot = new THREE.Vector3(Math.cos(a) * (R + 1.5), 0.1, Math.sin(a) * (R + 1.5));
    const len = top.distanceTo(foot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, len, 8), legMat);
    leg.position.copy(top).add(foot).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    leg.castShadow = true;
    group.add(leg);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.1, 12), legMat);
    pad.position.copy(foot);
    group.add(pad);
  }
  if (opts.fins) {
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(softBox(0.1, 2.4, 1.4), dark);
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * (R + 0.6), baseY + 1.4, Math.sin(a) * (R + 0.6));
      fin.rotation.y = -a;
      fin.castShadow = true;
      group.add(fin);
    }
  }
  // portholes
  const glow = new THREE.MeshBasicMaterial({ color: '#ffd38a' });
  for (const a of [0.9, -0.9]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), glow);
    w.position.set(Math.sin(a) * (R + 0.01), baseY + bodyH - 1.0, Math.cos(a) * (R + 0.01));
    w.rotation.y = a;
    group.add(w);
  }
  // hatch: frame + door hinged on its left edge (swings outward)
  const sill = 2.9;
  const frame = new THREE.Mesh(softBox(1.3, 1.85, 0.1), dark);
  frame.position.set(0, sill + 0.92, R - 0.02);
  group.add(frame);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.6), new THREE.MeshBasicMaterial({ color: '#1a1410' }));
  inner.position.set(0, sill + 0.85, R + 0.035);
  group.add(inner);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.56, sill + 0.85, R + 0.06);
  group.add(doorPivot);
  const door = new THREE.Mesh(softBox(1.12, 1.66, 0.08), hull);
  door.position.x = 0.56;
  door.castShadow = true;
  doorPivot.add(door);
  // deployable ramp hinged at the sill
  const rampPivot = new THREE.Group();
  rampPivot.position.set(0, sill, R + 0.1);
  group.add(rampPivot);
  const rampLen = 4.7;
  const ramp = new THREE.Mesh(softBox(1.1, 0.08, rampLen), legMat);
  ramp.position.z = rampLen / 2;
  ramp.castShadow = ramp.receiveShadow = true;
  rampPivot.add(ramp);
  const rampDeployed = Math.asin(Math.min(1, (sill - 0.05) / rampLen));
  // flame
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(coneGeo(0.75, 4, 18, 1, true), flameMat);
  flame.rotation.x = Math.PI;
  const flameCore = new THREE.Mesh(coneGeo(0.4, 2.2, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flameCore.rotation.x = Math.PI;
  const flameGroup = new THREE.Group();
  flameGroup.position.y = baseY + bell.exitY;
  flame.position.y = -2;
  flameCore.position.y = -1.1;
  flameGroup.add(flame, flameCore);
  flameGroup.visible = false;
  group.add(flameGroup);

  // exterior lighting: nose strobes, hatch flood lamps with soft glow sprites
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 64;
  const gg = glowC.getContext('2d');
  const grad = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,210,1)');
  grad.addColorStop(0.3, 'rgba(255,220,160,0.55)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowC);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const strobeMat = [new THREE.MeshBasicMaterial({ color: '#ff3b30' }), new THREE.MeshBasicMaterial({ color: '#ffffff' })];
  const strobes = [];
  [[-1, 0], [1, 1]].forEach(([sx, mi]) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), strobeMat[mi]);
    s.position.set(sx * (R * 0.98), baseY + bodyH - 0.2, 0);
    group.add(s);
    strobes.push(s);
  });
  const floodMat = new THREE.MeshBasicMaterial({ color: '#fff0c8' });
  const floodSprites = [];
  for (const sx of [-0.95, 0.95]) {
    const f = new THREE.Mesh(softBox(0.16, 0.1, 0.1), floodMat);
    f.position.set(sx, sill + 1.95, R + 0.06);
    group.add(f);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    sp.position.set(sx, sill + 1.95, R + 0.25);
    sp.scale.setScalar(1.6);
    group.add(sp);
    floodSprites.push(sp);
  }

  const api = {
    group,
    sill,
    radius: R,
    rampLen,
    height: baseY + bodyH + R * 1.5,
    setHatch(v) {
      doorPivot.rotation.y = -v * 1.9;
      inner.material.color.setRGB(0.1 + 0.85 * v, 0.08 + 0.68 * v, 0.06 + 0.42 * v);
    },
    /** Blink the strobes and pulse the flood glow. */
    tick(t) {
      const on = Math.sin(t * 7) > 0.6;
      strobes[0].visible = on;
      strobes[1].visible = Math.sin(t * 7 + 1.6) > 0.7;
      const k = 1.5 + Math.sin(t * 3) * 0.1;
      for (const sp of floodSprites) sp.scale.setScalar(k);
    },
    setRamp(v) {
      rampPivot.rotation.x = -Math.PI / 2 + (Math.PI / 2 + rampDeployed) * v;
      ramp.visible = v > 0.01;
    },
    setFlame(v, t = 0) {
      flameGroup.visible = v > 0.01;
      const f = 0.85 + Math.sin(t * 60) * 0.08 + Math.sin(t * 37) * 0.06;
      flameGroup.scale.set(0.6 + v * 0.5, v * f * 1.4, 0.6 + v * 0.5);
    },
    /** Local point at the base of the deployed ramp (for walking on/off). */
    rampFoot() {
      const run = Math.cos(rampDeployed) * rampLen;
      return new THREE.Vector3(0, 0, R + 0.1 + run);
    },
    rampSlope: rampDeployed,
    dispose() {
      disposeObject(group);
    },
  };
  api.setHatch(0);
  api.setRamp(0);
  return api;
}

export function createRescueRocket() {
  return createLander(
    { hull: 'classic', bell: 'quad', decal: 'ares', flagColors: ['#c1272d', '#fff', '#1f3a93'] },
    { bodyH: 11, radius: 2.0, label: 'RESCUE-1', fins: true },
  );
}

// ---------------------------------------------------------------- flag
export function createFlag(custom) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.7, 8), std('#c9ced6', 0.3, 0.8));
  pole.position.y = 1.35;
  pole.castShadow = true;
  group.add(pole);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), std('#c9ced6', 0.3, 0.8));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0.8, 2.62, 0);
  group.add(bar);
  const tex = canvasTexture(makeFlagCanvas(custom));
  const geo = new THREE.PlaneGeometry(1.6, 1.0, 20, 10);
  geo.translate(0.8, 0, 0);
  const base = geo.attributes.position.array.slice();
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
  cloth.position.y = 2.1;
  cloth.castShadow = true;
  group.add(cloth);
  let frame = 0;
  return {
    group,
    update(t, wind = 0.5) {
      const pos = geo.attributes.position.array;
      const amp = 0.05 + wind * 0.12;
      for (let i = 0; i < pos.length; i += 3) {
        const x = base[i];
        const y = base[i + 1];
        const k = x / 1.6;
        pos[i + 2] = Math.sin(x * 4 - t * (3 + wind * 3) + y * 1.5) * amp * k + Math.sin(x * 9 - t * 7) * 0.02 * k;
        pos[i] = x - Math.abs(pos[i + 2]) * 0.15;
      }
      geo.attributes.position.needsUpdate = true;
      if ((frame++ & 3) === 0) geo.computeVertexNormals();
    },
    setCustom(c) {
      const old = cloth.material.map;
      cloth.material.map = canvasTexture(makeFlagCanvas(c));
      cloth.material.needsUpdate = true;
      old.dispose();
    },
    dispose() {
      disposeObject(group);
    },
  };
}

// ---------------------------------------------------------------- rover
export function createRover() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const white = addRim(std('#d9d6cf', 0.6, 0.2), '#ffbf8a', 0.3);
  const dark = std('#2b2e33', 0.7, 0.5);
  const gold = std('#c79a3a', 0.35, 0.9);
  const deck = new THREE.Mesh(softBox(1.9, 0.45, 2.8), white);
  deck.position.y = 1.05;
  deck.castShadow = true;
  body.add(deck);
  const top = new THREE.Mesh(softBox(1.7, 0.08, 2.6), gold);
  top.position.y = 1.31;
  body.add(top);
  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 12), dark);
  rtg.rotation.x = 0.7;
  rtg.position.set(0, 1.25, -1.55);
  body.add(rtg);
  const rtgGlow = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 16), new THREE.MeshBasicMaterial({ color: '#552010' }));
  rtgGlow.rotation.x = 0.7 + Math.PI / 2;
  rtgGlow.position.copy(rtg.position);
  body.add(rtgGlow);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), white);
  mast.position.set(0.55, 1.95, 1.1);
  body.add(mast);
  const headM = new THREE.Mesh(softBox(0.42, 0.22, 0.24), white);
  headM.position.set(0.55, 2.66, 1.12);
  body.add(headM);
  const eye = new THREE.Mesh(softBox(0.3, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: '#1a2230' }));
  eye.position.set(0.55, 2.67, 1.25);
  body.add(eye);
  // seat (crewed rover conversion)
  const seat = new THREE.Mesh(softBox(0.6, 0.15, 0.6), dark);
  seat.position.set(-0.35, 1.42, 0.1);
  body.add(seat);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#333' });
  const lamps = [];
  for (const x of [-0.6, 0.6]) {
    const l = new THREE.Mesh(softBox(0.22, 0.12, 0.05), lampMat);
    l.position.set(x, 1.12, 1.42);
    body.add(l);
    lamps.push(l);
  }
  // rocker-bogie wheels
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = std('#6f7277', 0.55, 0.6);
  const treadMat = std('#3b3d42', 0.8, 0.3);
  for (const side of [-1, 1])
    for (const z of [-1.15, 0, 1.15]) {
      const piv = new THREE.Group();
      piv.position.set(side * 1.18, 0.42, z);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      piv.add(w);
      for (let i = 0; i < 6; i++) {
        const tr = new THREE.Mesh(softBox(0.36, 0.05, 0.1), treadMat);
        const a = (i / 6) * Math.PI * 2;
        tr.position.set(0, Math.cos(a) * 0.42, Math.sin(a) * 0.42);
        tr.rotation.x = a;
        w.add(tr);
      }
      const arm = new THREE.Mesh(softBox(0.08, 0.6, 0.08), dark);
      arm.position.set(-side * 0.18, 0.35, 0);
      piv.add(arm);
      group.add(piv);
      wheels.push({ piv, w, front: z > 0.5, side, z });
    }
  const broken = wheels[1];
  const api = {
    group,
    body,
    wheels,
    lamps,
    rtgGlow,
    setRepaired(r) {
      lampMat.color.set(r ? '#fff6d8' : '#333');
      rtgGlow.material.color.set(r ? '#ff7a2a' : '#552010');
      broken.piv.rotation.set(r ? 0 : 0.5, 0, r ? 0 : 0.7);
      broken.piv.position.y = r ? 0.42 : 0.3;
      body.rotation.z = r ? 0 : 0.08;
    },
    update(rv, dt) {
      for (const wh of wheels) {
        wh.w.rotation.x = rv.wheelRot;
        if (wh.front) wh.piv.rotation.y = rv.steer;
        else if (wh.z < -0.5) wh.piv.rotation.y = -rv.steer * 0.6;
      }
      headM.rotation.y = Math.sin(rv.t * 0.4) * 0.3;
    },
    dispose() {
      disposeObject(group);
    },
  };
  api.setRepaired(false);
  return api;
}

// ---------------------------------------------------------------- Earth hangar + boarding sequence
export function createHangarScene(container, initialCustom) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a2033');
  scene.fog = new THREE.Fog('#2a2a3c', 30, 120);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);

  // dusk sky gradient dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'varying vec3 vP; void main(){ float h = clamp(vP.y*1.4+0.1,0.0,1.0); vec3 low = vec3(0.95,0.52,0.32); vec3 mid = vec3(0.35,0.28,0.45); vec3 top = vec3(0.05,0.07,0.16); vec3 c = mix(low, mid, smoothstep(0.0,0.35,h)); c = mix(c, top, smoothstep(0.3,1.0,h)); gl_FragColor = vec4(c,1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
  scene.add(sky);
  scene.add(new THREE.HemisphereLight('#a7b4ff', '#3a2a20', 0.9));
  const sun = new THREE.DirectionalLight('#ffc89a', 2.4);
  sun.position.set(-20, 18, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
  scene.add(sun);
  const fill = new THREE.PointLight('#7fd6ff', 30, 30);
  fill.position.set(4, 4, 6);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 48), std('#3b3c40', 0.9, 0.05));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const padMat = std('#55585e', 0.8, 0.1);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.3, 40), padMat);
  pad.position.set(0, 0.15, -8);
  pad.receiveShadow = true;
  scene.add(pad);
  const stripes = new THREE.Mesh(new THREE.RingGeometry(6.2, 6.6, 40), new THREE.MeshBasicMaterial({ color: '#f2c230' }));
  stripes.rotation.x = -Math.PI / 2;
  stripes.position.set(0, 0.31, -8);
  scene.add(stripes);

  // gantry tower + boarding ramp
  const steel = std('#b0452a', 0.6, 0.5);
  const tower = new THREE.Group();
  tower.position.set(-4.6, 0.3, -8);
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    const leg = new THREE.Mesh(softBox(0.2, 14, 0.2), steel);
    leg.position.set(x, 7, z);
    leg.castShadow = true;
    tower.add(leg);
  }
  for (let y = 1; y < 14; y += 1.6) {
    const b1 = new THREE.Mesh(softBox(2, 0.1, 0.1), steel);
    b1.position.set(0, y, 0.9);
    const b2 = b1.clone();
    b2.position.z = -0.9;
    const b3 = new THREE.Mesh(softBox(0.1, 0.1, 2), steel);
    b3.position.set(0.9, y, 0);
    tower.add(b1, b2, b3);
  }
  const towerLight = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' }));
  towerLight.position.set(0, 14.2, 0);
  tower.add(towerLight);
  scene.add(tower);

  let custom = initialCustom;
  let lander = createLander(custom);
  lander.group.position.set(0, 0.3, -8);
  scene.add(lander.group);
  lander.setHatch(1);
  const hatchWorld = new THREE.Vector3(0, 0.3 + lander.sill, -8 + lander.radius + 0.1);
  const rampBase = new THREE.Vector3(0, 0.3, -1.6);
  const rampVec = hatchWorld.clone().sub(rampBase);
  const rampLen = rampVec.length();
  const ramp = new THREE.Group();
  const deck = new THREE.Mesh(softBox(1.4, 0.12, rampLen), std('#8d939b', 0.5, 0.6));
  deck.castShadow = deck.receiveShadow = true;
  ramp.add(deck);
  for (const x of [-0.7, 0.7]) {
    const rail = new THREE.Mesh(softBox(0.05, 0.05, rampLen), std('#f2c230', 0.5, 0.3));
    rail.position.set(x, 0.9, 0);
    ramp.add(rail);
    for (let i = 0; i <= 4; i++) {
      const post = new THREE.Mesh(softBox(0.05, 0.9, 0.05), std('#8d939b', 0.5, 0.6));
      post.position.set(x, 0.45, -rampLen / 2 + (i / 4) * rampLen);
      ramp.add(post);
    }
  }
  ramp.position.copy(rampBase).add(hatchWorld).multiplyScalar(0.5);
  ramp.rotation.x = Math.atan2(rampVec.y, -rampVec.z);
  scene.add(ramp);

  // turntable + astronaut + flag stand
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.12, 40), std('#20252e', 0.4, 0.6));
  turntable.position.set(2.6, 0.06, 0.6);
  turntable.receiveShadow = true;
  scene.add(turntable);
  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.02, 6, 48), new THREE.MeshBasicMaterial({ color: '#35d6ff' }));
  ringGlow.rotation.x = Math.PI / 2;
  ringGlow.position.set(2.6, 0.13, 0.6);
  scene.add(ringGlow);
  let astro = createAstronaut(custom);
  let anim = new AstronautAnimator(astro);
  astro.root.position.set(2.6, 0.12, 0.6);
  scene.add(astro.root);
  let flag = createFlag(custom);
  flag.group.position.set(-2.8, 0, 0.8);
  scene.add(flag.group);

  const views = {
    astronaut: { pos: new THREE.Vector3(2.6, 1.45, 4.4), look: new THREE.Vector3(2.6, 1.05, 0.6) },
    lander: { pos: new THREE.Vector3(7.5, 5.5, 6), look: new THREE.Vector3(0, 4, -8) },
    flag: { pos: new THREE.Vector3(-2.2, 2.1, 4.2), look: new THREE.Vector3(-2.0, 2.0, 0.8) },
    wide: { pos: new THREE.Vector3(9, 3.2, 7), look: new THREE.Vector3(0, 2.5, -5) },
  };
  let view = 'astronaut';
  const camPos = views.astronaut.pos.clone();
  const camLook = views.astronaut.look.clone();
  camera.position.copy(camPos);

  let boarding = null;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let disposed = false;
  const smoke = [];
  const smokeGeo = new THREE.SphereGeometry(1, 10, 8);

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  function updateBoarding(dt) {
    const b = boarding;
    b.t += dt;
    const bt = b.t;
    const a = astro.root;
    let speed = 0;
    if (bt < 1.4) {
      // walk from the turntable to the foot of the ramp
      const k = bt / 1.4;
      const from = new THREE.Vector3(2.6, 0.12, 0.6);
      a.position.lerpVectors(from, rampBase, k);
      a.rotation.y = Math.atan2(rampBase.x - from.x, rampBase.z - from.z);
      speed = 3;
    } else if (bt < 4.4) {
      const k = (bt - 1.4) / 3.0;
      a.position.lerpVectors(rampBase, hatchWorld, k);
      a.position.y += 0.06;
      a.rotation.y = Math.PI;
      speed = 2.6;
    } else if (bt < 5.3) {
      const k = (bt - 4.4) / 0.9;
      a.position.set(0, hatchWorld.y, hatchWorld.z - k * 1.5);
      speed = 2;
      if (k > 0.8) a.visible = false;
    } else {
      a.visible = false;
    }
    if (bt > 5.3 && bt < 6.2) {
      lander.setHatch(Math.max(0, 1 - (bt - 5.3) / 0.6));
      if (!b.sealed && bt > 5.9) {
        b.sealed = true;
        b.onEvent?.('sealed');
      }
    }
    if (bt > 6.4 && !b.ignited) {
      b.ignited = true;
      b.onEvent?.('ignition');
    }
    if (bt > 6.4) {
      const ig = Math.min(1, (bt - 6.4) / 0.9);
      lander.setFlame(ig, t);
      if (Math.random() < 0.6) {
        const m = new THREE.Mesh(smokeGeo, new THREE.MeshStandardMaterial({ color: '#d8d2cc', transparent: true, opacity: 0.5, roughness: 1, depthWrite: false }));
        m.position.set(lander.group.position.x + (Math.random() - 0.5) * 3, 0.6, lander.group.position.z + (Math.random() - 0.5) * 3);
        m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 1.5, (Math.random() - 0.5) * 6);
        m.userData.life = 2.5;
        scene.add(m);
        smoke.push(m);
      }
    }
    if (bt > 7.4) {
      const lt = bt - 7.4;
      lander.group.position.y = 0.3 + 0.9 * lt * lt;
      ramp.visible = lt < 0.2;
    }
    anim.update(dt, { speed, grounded: true, anticip: 0, landT: 0, repairing: false, vy: 0 });
    // camera
    if (bt < 5.6) {
      view = 'wide';
    } else {
      const ly = lander.group.position.y;
      views.launch = { pos: new THREE.Vector3(14, 2 + ly * 0.35, 12), look: new THREE.Vector3(0, ly + 4, -8) };
      view = 'launch';
    }
    if (bt > 11.2 && !b.done) {
      b.done = true;
      b.onDone?.();
    }
    return bt > 6.6 ? Math.min(1, (bt - 6.6) * 0.5) * 0.06 : 0;
  }

  function loop(now) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    let shake = 0;
    if (boarding) {
      shake = updateBoarding(dt);
    } else {
      astro.root.rotation.y += dt * 0.5;
      anim.update(dt, { speed: 0, grounded: true, anticip: 0, landT: 0, repairing: false, vy: 0 });
    }
    flag.update(t, 0.6);
    towerLight.material.color.setHSL(0, 1, 0.3 + (Math.sin(t * 4) > 0 ? 0.25 : 0));
    for (let i = smoke.length - 1; i >= 0; i--) {
      const m = smoke[i];
      m.userData.life -= dt;
      m.position.addScaledVector(m.userData.v, dt);
      m.scale.multiplyScalar(1 + dt * 0.9);
      m.material.opacity = Math.max(0, m.userData.life / 2.5) * 0.5;
      if (m.userData.life <= 0) {
        scene.remove(m);
        m.material.dispose();
        smoke.splice(i, 1);
      }
    }
    const v = views[view];
    const k = Math.min(1, dt * (boarding ? 2.5 : 3.5));
    camPos.lerp(v.pos, k);
    camLook.lerp(v.look, k);
    camera.position.copy(camPos);
    if (shake) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);

  return {
    setView(v) {
      if (!boarding && views[v]) view = v;
    },
    setCustom(c) {
      if (boarding) return;
      custom = c;
      const rot = astro.root.rotation.y;
      scene.remove(astro.root);
      astro.dispose();
      astro = createAstronaut(c);
      anim = new AstronautAnimator(astro);
      astro.root.position.set(2.6, 0.12, 0.6);
      astro.root.rotation.y = rot;
      scene.add(astro.root);
      scene.remove(lander.group);
      lander.dispose();
      lander = createLander(c);
      lander.group.position.set(0, 0.3, -8);
      lander.setHatch(1);
      scene.add(lander.group);
      flag.setCustom(c);
    },
    startBoarding(onDone, onEvent) {
      if (boarding) return;
      boarding = { t: 0, onDone, onEvent };
      astro.root.rotation.y = 0;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const m of smoke) m.material.dispose();
      smokeGeo.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
