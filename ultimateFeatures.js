// Ultimate features: NASA Mission Patch designer (offscreen canvas), persistent instanced
// bootprints, sublimating CO2 dry-ice geysers, and the Sol 6 orbital docking mini-game.
// (The InSight wind infrasound synthesiser lives in audio/audio.js.)

import * as THREE from 'three';

export const PATCH_ICONS = ['rocket', 'rover', 'atom', 'mars'];
export const PATCH_RIMS = ['#e8622a', '#35d6ff', '#fbbf24', '#a78bfa', '#3dff8a', '#f1f5f9'];

function drawIcon(ctx, icon, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (icon === 'rocket') {
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.42, -s * 0.4, s * 0.3, s * 0.5);
    ctx.lineTo(-s * 0.3, s * 0.5);
    ctx.quadraticCurveTo(-s * 0.42, -s * 0.4, 0, -s);
    ctx.fill();
    ctx.fillStyle = '#e8622a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.2);
    ctx.lineTo(-s * 0.58, s * 0.66);
    ctx.lineTo(-s * 0.26, s * 0.5);
    ctx.moveTo(s * 0.3, s * 0.2);
    ctx.lineTo(s * 0.58, s * 0.66);
    ctx.lineTo(s * 0.26, s * 0.5);
    ctx.fill();
    ctx.fillStyle = '#35d6ff';
    ctx.beginPath();
    ctx.arc(0, -s * 0.25, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.55);
    ctx.lineTo(0, s * 1.0);
    ctx.lineTo(s * 0.2, s * 0.55);
    ctx.fill();
  } else if (icon === 'rover') {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-s * 0.7, -s * 0.15, s * 1.4, s * 0.38);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-s * 0.85, -s * 0.28, s * 1.7, s * 0.12);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(s * 0.3, -s * 0.8, s * 0.08, s * 0.55);
    ctx.fillRect(s * 0.18, -s * 0.9, s * 0.34, s * 0.14);
    ctx.fillStyle = '#111827';
    for (const x of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.arc(x * s, s * 0.42, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = s * 0.05;
    for (const x of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.arc(x * s, s * 0.42, s * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (icon === 'atom') {
    ctx.strokeStyle = '#35d6ff';
    ctx.lineWidth = s * 0.08;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.95, s * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.1, 0, 0, s);
    g.addColorStop(0, '#f6a36b');
    g.addColorStop(0.6, '#c1440e');
    g.addColorStop(1, '#5a1a06');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,20,8,0.55)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.15, s * 0.05, s * 0.5, s * 0.08, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.78, s * 0.24, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function textOnArc(ctx, text, cx, cy, r, start, dir) {
  const chars = [...text];
  const step = (0.13 * 30) / Math.max(18, r / 4);
  let a = start - (dir * (chars.length - 1) * step) / 2;
  for (const ch of chars) {
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += dir * step;
  }
}

export function drawPatch(canvas, { icon = 'rocket', rim = '#e8622a', motto = 'DARE MIGHTY THINGS', team = '' } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 4;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b1220';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.8, 0, Math.PI * 2);
  ctx.fill();
  const sky = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R * 0.8);
  sky.addColorStop(0, '#1e293b');
  sky.addColorStop(1, '#020617');
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.77, 0, Math.PI * 2);
  ctx.fill();
  // stars
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399;
    const rr = (R * 0.7 * ((i * 37) % 100)) / 100;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + (i % 3) * 0.2})`;
    ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.5, 1.5);
  }
  // Mars horizon
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.77, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#b4471c';
  ctx.beginPath();
  ctx.ellipse(cx, cy + R * 0.95, R * 1.2, R * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawIcon(ctx, icon, cx, cy - R * 0.06, R * 0.36);
  ctx.fillStyle = '#0b1220';
  ctx.font = `bold ${Math.round(R * 0.13)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = String(motto).trim().toUpperCase().split(/\s+/).slice(0, 3).join(' ') || 'DARE MIGHTY THINGS';
  textOnArc(ctx, words, cx, cy, R * 0.9, -Math.PI / 2, 1);
  textOnArc(ctx, team ? String(team).toUpperCase().slice(0, 18) : 'SOL 60 · RED HORIZON', cx, cy, R * 0.9, Math.PI / 2, -1);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

export function makePatchCanvas(opts, size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return drawPatch(c, opts);
}

// ------------------------------------------------------------ bootprints

export class Footprints {
  constructor(scene, heightAt, max = 900) {
    this.heightAt = heightAt;
    this.max = max;
    const shape = new THREE.Shape();
    shape.absellipse(0, 0.06, 0.07, 0.12, 0, Math.PI * 2);
    const geo = new THREE.ShapeGeometry(shape, 10);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a1d10,
      roughness: 1,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noXray = true;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.count = 0;
    this.left = true;
    this.last = null;
    this.dummy = new THREE.Object3D();
    this.stride = 0.55;
  }
  track(x, z, heading) {
    if (!this.last) {
      this.last = { x, z };
      return;
    }
    const d = Math.hypot(x - this.last.x, z - this.last.z);
    if (d < this.stride) return;
    this.last = { x, z };
    const side = this.left ? 1 : -1;
    this.left = !this.left;
    const px = x + Math.cos(heading) * 0.14 * side;
    const pz = z - Math.sin(heading) * 0.14 * side;
    const i = this.count % this.max;
    this.dummy.position.set(px, this.heightAt(px, pz) + 0.03, pz);
    this.dummy.rotation.set(0, heading, 0);
    this.dummy.scale.set(side, 1, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.count++;
    this.mesh.count = Math.min(this.count, this.max);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------ CO2 geysers

export class Geysers {
  constructor(scene, list, heightAt, dotTexture) {
    this.items = [];
    const per = 260;
    for (const g of list) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(per * 3);
      const life = new Float32Array(per);
      for (let i = 0; i < per; i++) life[i] = Math.random();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.55,
        map: dotTexture,
        color: 0x2a1a12,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      const y0 = heightAt(g.x, g.z);
      pts.position.set(g.x, y0, g.z);
      pts.frustumCulled = false;
      pts.userData.noXray = true;
      scene.add(pts);
      // dark fan deposit
      const fan = new THREE.Mesh(
        new THREE.CircleGeometry(2.2, 24),
        new THREE.MeshBasicMaterial({ color: 0x1b0f0a, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      fan.rotation.x = -Math.PI / 2;
      fan.scale.set(1, 1.8, 1);
      fan.position.set(g.x + 0.8, y0 + 0.04, g.z);
      scene.add(fan);
      this.items.push({ ...g, pts, pos, life, per, y0, wind: Math.random() * 6 });
    }
  }
  update(dt, windK = 0.3) {
    for (const it of this.items) {
      for (let i = 0; i < it.per; i++) {
        it.life[i] += dt * (0.35 + (i % 7) * 0.04);
        if (it.life[i] > 1) it.life[i] -= 1;
        const l = it.life[i];
        const a = i * 2.399;
        const spread = 0.15 + l * 1.4;
        it.pos[i * 3] = Math.cos(a) * spread * 0.4 + l * l * 3 * windK;
        it.pos[i * 3 + 1] = l * 7 * (1 - l * 0.35);
        it.pos[i * 3 + 2] = Math.sin(a) * spread * 0.4;
      }
      it.pts.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------ orbital docking (2D canvas)

export class DockingGame {
  constructor(canvas, { duration = 10, onDone }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.duration = duration;
    this.onDone = onDone;
    this.t = 0;
    this.done = false;
    this.locked = false;
    this.stars = Array.from({ length: 160 }, (_, i) => ({ x: ((i * 97) % 997) / 997, y: ((i * 61) % 991) / 991, b: (i % 5) / 5 }));
    this.offset = { x: 0, y: 0 };
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  frame = (now) => {
    if (this.done) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const k = Math.max(0, 1 - this.t / this.duration);
    // Reticle wanders in a decaying Lissajous; you must click when it is centred.
    this.offset.x = Math.sin(this.t * 1.7) * 0.28 * (0.35 + 0.65 * k);
    this.offset.y = Math.sin(this.t * 2.3 + 1) * 0.2 * (0.35 + 0.65 * k);
    this.draw();
    if (this.t >= this.duration) this.finish(false, true);
    else this.raf = requestAnimationFrame(this.frame);
  };
  error() {
    return Math.hypot(this.offset.x, this.offset.y);
  }
  centered() {
    return this.error() < 0.06;
  }
  tryLock() {
    if (this.done) return false;
    if (this.centered()) {
      this.finish(true, false);
      return true;
    }
    return false;
  }
  finish(ok, timeout) {
    this.done = true;
    this.locked = ok;
    cancelAnimationFrame(this.raf);
    this.draw();
    this.onDone?.({ ok, timeout, t: this.t });
  }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#01030a';
    ctx.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + s.b * 0.6})`;
      ctx.fillRect(s.x * w, s.y * h, 1.4, 1.4);
    }
    // Mars limb
    const g = ctx.createRadialGradient(w * 0.5, h * 1.9, h * 0.8, w * 0.5, h * 1.9, h * 1.25);
    g.addColorStop(0, '#c1440e');
    g.addColorStop(0.92, '#7a2a0a');
    g.addColorStop(1, 'rgba(255,160,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 1.9, h * 1.25, 0, Math.PI * 2);
    ctx.fill();
    // Earth Return Orbiter, growing as it approaches
    const scale = 0.6 + 0.6 * Math.min(1, this.t / this.duration);
    const ox = w / 2 + this.offset.x * w;
    const oy = h / 2 + this.offset.y * h;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-150, -14, 100, 28);
    ctx.fillRect(50, -14, 100, 28);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.strokeRect(-150 + i * 16.6, -14, 16.6, 28);
      ctx.strokeRect(50 + i * 16.6, -14, 16.6, 28);
    }
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(-50, -32, 100, 64);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-46, -28, 92, 20);
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(0, 8, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.locked ? '#3dff8a' : '#35d6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 8, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // fixed reticle
    const c = this.centered();
    ctx.strokeStyle = this.locked ? '#3dff8a' : c ? '#3dff8a' : '#ffb020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - 60, h / 2);
    ctx.lineTo(w / 2 - 40, h / 2);
    ctx.moveTo(w / 2 + 40, h / 2);
    ctx.lineTo(w / 2 + 60, h / 2);
    ctx.moveTo(w / 2, h / 2 - 60);
    ctx.lineTo(w / 2, h / 2 - 40);
    ctx.moveTo(w / 2, h / 2 + 40);
    ctx.lineTo(w / 2, h / 2 + 60);
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '13px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`RANGE ${Math.max(0, 40 - this.t * 4).toFixed(1)} m   CLOSING 0.40 m/s`, 16, 24);
    ctx.fillText(`ALIGN ERR ${(this.error() * 100).toFixed(1)} cm`, 16, 44);
    ctx.textAlign = 'right';
    ctx.fillText(`T-${Math.max(0, this.duration - this.t).toFixed(1)} s`, w - 16, 24);
  }
  dispose() {
    this.done = true;
    cancelAnimationFrame(this.raf);
  }
}
