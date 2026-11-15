// SOL 60 — layered, cloudy haboob (replaces the old flat dust-wall planes).
//
// A storm front is drawn as hundreds of soft, camera-facing cloud puffs in one instanced draw call:
//   - a tall billowing wall (puffs rise, swell and roll forward, then recycle at the base),
//   - a dense, ground-hugging rolling layer at the leading edge,
//   - a thinner trailing body behind the front.
// Each puff samples the terrain once per recycle so the front drapes over ridges and craters. Exponential fog
// (FogExp2) and the sky shader's warm Mie-scattering tint (driven by the same dust amount) do the rest.

import * as THREE from 'three';
import { getTerrainHeight } from './terrainPhysics.js';

const VERT = `
  attribute vec3 iOffset;
  attribute vec4 iData; // x = size, y = rotation, z = alpha, w = seed
  uniform float uTime;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  varying float vHeight;
  void main() {
    vUv = uv;
    vAlpha = iData.z;
    vSeed = iData.w;
    vec4 mv = viewMatrix * vec4(iOffset, 1.0);
    float r = iData.y + uTime * (0.05 + fract(iData.w * 7.3) * 0.08);
    vec2 p = position.xy * iData.x;
    p = mat2(cos(r), -sin(r), sin(r), cos(r)) * p;
    mv.xy += p;
    vHeight = position.y + 0.5;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uLit;
  uniform vec3 uShade;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  varying float vHeight;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.07; a *= 0.5; } return s; }
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    float billow = fbm(vUv * 3.2 + vec2(vSeed * 13.1, uTime * 0.07 + vSeed));
    float edge = smoothstep(1.0, 0.25 + billow * 0.35, d);
    float a = edge * (0.55 + billow * 0.6) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    vec3 col = mix(uShade, uLit, clamp(vHeight * 0.7 + billow * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, a);
  }
`;

export function createStormClouds(scene, count = 240) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  const offs = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const aOff = new THREE.InstancedBufferAttribute(offs, 3);
  const aData = new THREE.InstancedBufferAttribute(data, 4);
  aOff.setUsage(THREE.DynamicDrawUsage);
  aData.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iOffset', aOff);
  geo.setAttribute('iData', aData);
  geo.instanceCount = count;
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uLit: { value: new THREE.Color('#d9965c') },
    uShade: { value: new THREE.Color('#5a2e18') },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  scene.add(mesh);

  // per-puff state in front space: u = along the front, w = depth behind the leading edge, y = height, life 0..1
  let seed = 9871;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const P = Array.from({ length: count }, (_, i) => ({ layer: i < count * 0.32 ? 'ground' : i < count * 0.82 ? 'wall' : 'body', u: 0, w: 0, y: 0, life: rnd(), speed: 0, size: 0, seed: rnd(), gy: 0 }));
  const respawn = (p, cx, cz, tx, tz, nx, nz) => {
    p.u = (rnd() - 0.5) * 900;
    p.life = 0;
    p.seed = rnd();
    if (p.layer === 'ground') {
      p.w = rnd() * 22;
      p.y = rnd() * 6;
      p.size = 26 + rnd() * 26;
      p.speed = 0.08 + rnd() * 0.05;
    } else if (p.layer === 'wall') {
      p.w = 8 + rnd() * 40;
      p.y = 4 + rnd() * 20;
      p.size = 45 + rnd() * 55;
      p.speed = 0.035 + rnd() * 0.035;
    } else {
      p.w = 40 + rnd() * 160;
      p.y = 10 + rnd() * 90;
      p.size = 70 + rnd() * 70;
      p.speed = 0.02 + rnd() * 0.02;
    }
    const x = cx + tx * p.u - nx * p.w;
    const z = cz + tz * p.u - nz * p.w;
    p.gy = getTerrainHeight(x, z);
  };
  let inited = false;

  /**
   * front: { x, z, nx, nz } = a point on the leading edge and the unit direction it travels; null hides the storm.
   * player: { x, y, z } keeps the visible slice of the front centred on the player. intensity 0..1.
   */
  function update(dt, t, front, player, intensity) {
    uniforms.uTime.value = t;
    const target = front ? Math.min(1, intensity) : 0;
    uniforms.uOpacity.value += (target - uniforms.uOpacity.value) * Math.min(1, dt * 1.5);
    mesh.visible = uniforms.uOpacity.value > 0.01 && !!front;
    if (!mesh.visible) {
      inited = false;
      return;
    }
    const { nx, nz } = front;
    const tx = -nz;
    const tz = nx;
    // centre the slice on the player's projection onto the front line
    const along = (player.x - front.x) * tx + (player.z - front.z) * tz;
    const cx = front.x + tx * along;
    const cz = front.z + tz * along;
    for (let i = 0; i < count; i++) {
      const p = P[i];
      if (!inited) respawn(p, cx, cz, tx, tz, nx, nz), (p.life = rnd());
      p.life += dt * p.speed;
      if (p.life >= 1) respawn(p, cx, cz, tx, tz, nx, nz);
      // roll: puffs climb and swell as they age; the ground layer tumbles forward at the leading edge
      const k = p.life;
      const rise = p.layer === 'ground' ? k * 10 : p.layer === 'wall' ? k * 95 : k * 40;
      const roll = p.layer === 'ground' ? Math.sin(k * Math.PI) * 6 : 0;
      let u = p.u;
      if (u - along < -460) u += 900;
      if (u - along > 460) u -= 900;
      const x = front.x + tx * u - nx * (p.w - roll);
      const z = front.z + tz * u - nz * (p.w - roll);
      offs[i * 3] = x;
      offs[i * 3 + 1] = p.gy + p.y + rise;
      offs[i * 3 + 2] = z;
      const fadeIn = Math.min(1, k * 6);
      const fadeOut = Math.min(1, (1 - k) * 4);
      data[i * 4] = p.size * (0.7 + k * 0.6);
      data[i * 4 + 1] = p.seed * 6.28;
      data[i * 4 + 2] = fadeIn * fadeOut * (p.layer === 'ground' ? 0.85 : p.layer === 'wall' ? 0.6 : 0.35);
      data[i * 4 + 3] = p.seed;
    }
    inited = true;
    aOff.needsUpdate = true;
    aData.needsUpdate = true;
  }

  /** Light the storm with the current sky: brighter tops at noon, deep rust at dusk. */
  function setLight(day) {
    uniforms.uLit.value.setRGB(0.5 + day * 0.4, 0.3 + day * 0.3, 0.18 + day * 0.18);
    uniforms.uShade.value.setRGB(0.18 + day * 0.18, 0.09 + day * 0.09, 0.05 + day * 0.05);
  }

  function dispose() {
    geo.dispose();
    base.dispose();
    mat.dispose();
    scene.remove(mesh);
  }
  return { mesh, update, setLight, dispose };
}
