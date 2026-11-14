// Every texture in the game is painted here on an HTML5 canvas at load time.
// No image files are fetched.

import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(canvas, { repeat = [1, 1], srgb = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const sm = (t) => t * t * (3 - 2 * t);

// Tileable fractal value noise: lattice wraps at the texture edge.
function periodicFbm(size, basePeriod, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const p = basePeriod << o;
    const grid = new Float32Array(p * p);
    const r = rng(seed + o * 101);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    const sc = p / size;
    for (let y = 0; y < size; y++) {
      const fy = y * sc;
      const iy = Math.floor(fy);
      const ty = sm(fy - iy);
      const y0 = (iy % p) * p;
      const y1 = ((iy + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x * sc;
        const ix = Math.floor(fx);
        const tx = sm(fx - ix);
        const x0 = ix % p;
        const x1 = (ix + 1) % p;
        const a = grid[y0 + x0];
        const b = grid[y0 + x1];
        const c = grid[y1 + x0];
        const d = grid[y1 + x1];
        out[y * size + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function regolith() {
  const S = 512;
  const broad = periodicFbm(S, 4, 6, 7);
  const grain = periodicFbm(S, 64, 2, 91);
  const height = new Float32Array(S * S);
  const pebble = new Float32Array(S * S);
  for (let i = 0; i < height.length; i++) height[i] = broad[i] * 0.62 + grain[i] * 0.38;

  const r = rng(424242);
  for (let n = 0; n < 620; n++) {
    const px = r() * S;
    const py = r() * S;
    const rad = 1.2 + r() * r() * 7;
    const hgt = 0.12 + r() * 0.3;
    const x0 = Math.floor(px - rad);
    const x1 = Math.ceil(px + rad);
    const y0 = Math.floor(py - rad);
    const y1 = Math.ceil(py + rad);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - px, y - py) / rad;
        if (d >= 1) continue;
        const k = (((y % S) + S) % S) * S + (((x % S) + S) % S);
        const dome = Math.sqrt(1 - d * d);
        height[k] += dome * hgt;
        pebble[k] = Math.max(pebble[k], dome);
      }
    }
  }

  const albedo = makeCanvas(S, S);
  const bump = makeCanvas(S, S);
  const rough = makeCanvas(S, S);
  const actx = albedo.getContext('2d');
  const bctx = bump.getContext('2d');
  const rctx = rough.getContext('2d');
  const aimg = actx.createImageData(S, S);
  const bimg = bctx.createImageData(S, S);
  const rimg = rctx.createImageData(S, S);
  for (let i = 0; i < height.length; i++) {
    const h = Math.min(1, height[i]);
    const b = broad[i];
    const g = grain[i];
    // Iron-oxide dust: ochre in the lows, rust on the highs, basalt-grey pebbles.
    let cr = 122 + b * 96 + g * 30;
    let cg = 62 + b * 58 + g * 20;
    let cb = 36 + b * 34 + g * 12;
    const p = pebble[i];
    if (p > 0) {
      const w = Math.min(1, p * 1.4) * 0.75;
      cr = cr * (1 - w) + (88 + g * 40) * w;
      cg = cg * (1 - w) + (60 + g * 30) * w;
      cb = cb * (1 - w) + (52 + g * 24) * w;
    }
    const j = i * 4;
    aimg.data[j] = cr;
    aimg.data[j + 1] = cg;
    aimg.data[j + 2] = cb;
    aimg.data[j + 3] = 255;
    const hv = h * 255;
    bimg.data[j] = bimg.data[j + 1] = bimg.data[j + 2] = hv;
    bimg.data[j + 3] = 255;
    const rv = 205 + g * 50 - p * 60;
    rimg.data[j] = rimg.data[j + 1] = rimg.data[j + 2] = rv;
    rimg.data[j + 3] = 255;
  }
  actx.putImageData(aimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return { map: tex(albedo, { srgb: true }), bump: tex(bump), rough: tex(rough) };
}

function brushedMetal() {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(0, 0, S, S);
  const r = rng(11);
  for (let i = 0; i < 1600; i++) {
    const y = r() * S;
    const v = r() > 0.5 ? 255 : 30;
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.08})`;
    ctx.lineWidth = 0.5 + r();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + (r() - 0.5) * 2);
    ctx.stroke();
  }
  const rc = makeCanvas(S, S);
  const rx = rc.getContext('2d');
  rx.fillStyle = '#7c7c7c';
  rx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const y = r() * S;
    const v = 60 + r() * 150;
    rx.strokeStyle = `rgba(${v},${v},${v},0.25)`;
    rx.beginPath();
    rx.moveTo(0, y);
    rx.lineTo(S, y);
    rx.stroke();
  }
  return { map: tex(c, { srgb: true }), rough: tex(rc) };
}

function kaptonFoil() {
  const S = 256;
  const c = makeCanvas(S, S);
  const b = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const bx = b.getContext('2d');
  ctx.fillStyle = '#c8922a';
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#808080';
  bx.fillRect(0, 0, S, S);
  const r = rng(77);
  const golds = ['#f6cf6a', '#e2ac3c', '#a8741a', '#8a5c12', '#ffe39a', '#c4882a'];
  for (let i = 0; i < 420; i++) {
    const x = r() * S;
    const y = r() * S;
    const s = 10 + r() * 46;
    const pts = [0, 1, 2].map(() => [x + (r() - 0.5) * s, y + (r() - 0.5) * s]);
    // Draw each crinkle facet nine times so it wraps across the tile edges.
    for (let ox = -S; ox <= S; ox += S) {
      for (let oy = -S; oy <= S; oy += S) {
        ctx.beginPath();
        bx.beginPath();
        pts.forEach(([px, py], k) => {
          if (k === 0) {
            ctx.moveTo(px + ox, py + oy);
            bx.moveTo(px + ox, py + oy);
          } else {
            ctx.lineTo(px + ox, py + oy);
            bx.lineTo(px + ox, py + oy);
          }
        });
        ctx.closePath();
        bx.closePath();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = golds[i % golds.length];
        ctx.fill();
        const v = Math.floor(40 + ((i * 53) % 180));
        bx.globalAlpha = 0.6;
        bx.fillStyle = `rgb(${v},${v},${v})`;
        bx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  return { map: tex(c, { srgb: true }), bump: tex(b) };
}

function solarCells(dusty) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b9bcc4';
  ctx.fillRect(0, 0, S, S);
  const n = 8;
  const cell = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const g = ctx.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
      g.addColorStop(0, '#0d2452');
      g.addColorStop(0.5, '#16388a');
      g.addColorStop(1, '#0a1b3e');
      ctx.fillStyle = g;
      ctx.fillRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3);
      ctx.strokeStyle = 'rgba(190,200,220,0.35)';
      ctx.lineWidth = 0.6;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x * cell + 2, y * cell + (k * cell) / 4);
        ctx.lineTo((x + 1) * cell - 2, y * cell + (k * cell) / 4);
        ctx.stroke();
      }
    }
  }
  if (dusty) {
    ctx.fillStyle = 'rgba(176,112,66,0.72)';
    ctx.fillRect(0, 0, S, S);
    const r = rng(5);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${150 + r() * 70},${90 + r() * 50},${50 + r() * 30},${0.1 + r() * 0.3})`;
      const s = 1 + r() * 5;
      ctx.fillRect(r() * S, r() * S, s, s);
    }
  }
  return tex(c, { srgb: true });
}

function floorPlate() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20252c';
  ctx.fillRect(0, 0, S, S);
  const r = rng(3);
  for (let i = 0; i < 5000; i++) {
    const v = 20 + r() * 40;
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 8},0.35)`;
    ctx.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2);
  }
  const n = 2;
  const p = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.strokeStyle = '#0b0d10';
      ctx.lineWidth = 6;
      ctx.strokeRect(x * p + 3, y * p + 3, p - 6, p - 6);
      ctx.strokeStyle = 'rgba(120,135,150,0.25)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * p + 8, y * p + 8, p - 16, p - 16);
      ctx.fillStyle = '#596270';
      for (const [bx, by] of [
        [18, 18],
        [p - 18, 18],
        [18, p - 18],
        [p - 18, p - 18],
      ]) {
        ctx.beginPath();
        ctx.arc(x * p + bx, y * p + by, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // anti-slip tread
      ctx.strokeStyle = 'rgba(150,165,180,0.10)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 9; k++) {
        for (let m = 0; m < 9; m++) {
          const cx = x * p + 36 + k * 23;
          const cy = y * p + 36 + m * 23;
          const flip = (k + m) % 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(cx - 6, cy - 6 * flip);
          ctx.lineTo(cx + 6, cy + 6 * flip);
          ctx.stroke();
        }
      }
    }
  }
  return tex(c, { srgb: true });
}

function wallPanel() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#252c35';
  ctx.fillRect(0, 0, S, S);
  const r = rng(19);
  for (let i = 0; i < 3000; i++) {
    const v = 25 + r() * 35;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 10},0.3)`;
    ctx.fillRect(r() * S, r() * S, 1 + r() * 4, 1 + r() * 14);
  }
  ctx.strokeStyle = '#0d1014';
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, S - 4, S - 4);
  ctx.beginPath();
  ctx.moveTo(S / 2, 0);
  ctx.lineTo(S / 2, S);
  ctx.stroke();
  // ribs
  for (let y = 60; y < S; y += 90) {
    ctx.fillStyle = '#1a1f26';
    ctx.fillRect(0, y, S, 12);
    ctx.fillStyle = 'rgba(160,175,190,0.16)';
    ctx.fillRect(0, y, S, 2);
  }
  // rivets
  ctx.fillStyle = '#6a7482';
  for (let x = 20; x < S; x += 40) {
    for (const y of [14, S - 14]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // hazard band
  for (let x = -40; x < S; x += 40) {
    ctx.fillStyle = '#c9a21a';
    ctx.beginPath();
    ctx.moveTo(x, S - 40);
    ctx.lineTo(x + 20, S - 40);
    ctx.lineTo(x + 40, S - 24);
    ctx.lineTo(x + 20, S - 24);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(210,220,230,0.5)';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('ASSEMBLY BAY 04', 22, 210);
  ctx.font = '13px monospace';
  ctx.fillStyle = 'rgba(210,220,230,0.35)';
  ctx.fillText('CLASS 100K CLEAN ROOM', 22, 230);
  ctx.fillText('PLANETARY PROTECTION IVa', 280, 320);
  return tex(c, { srgb: true });
}

function hazardStripes() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#15130c';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#e0b21c';
  for (let x = -S; x < S * 2; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 32 + S, S);
    ctx.lineTo(x + S, S);
    ctx.closePath();
    ctx.fill();
  }
  return tex(c, { srgb: true });
}

function softDot() {
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function coneAlpha() {
  const c = makeCanvas(4, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#6a6a6a');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

let cache = null;
export function getTextures() {
  if (cache) return cache;
  const reg = regolith();
  const metal = brushedMetal();
  const foil = kaptonFoil();
  cache = {
    regolith: reg.map,
    regolithBump: reg.bump,
    regolithRough: reg.rough,
    metal: metal.map,
    metalRough: metal.rough,
    foil: foil.map,
    foilBump: foil.bump,
    solar: solarCells(false),
    solarDusty: solarCells(true),
    floor: floorPlate(),
    wall: wallPanel(),
    hazard: hazardStripes(),
    dot: softDot(),
    cone: coneAlpha(),
  };
  return cache;
}

// Copy of a texture with its own tiling.
export function tiled(texture, rx, ry) {
  const t = texture.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", Menlo, monospace';

// Multi-line text panel, used for rack placards and map labels.
export function labelTexture(lines, { w = 512, h = 192, bg = 'rgba(5,10,18,0.86)', border = '#35d6ff', pad = 22 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  if (bg) {
    roundRect(ctx, 3, 3, w - 6, h - 6, 12);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  let y = pad;
  for (const l of lines) {
    const size = l.size || 28;
    ctx.font = `${l.weight || 'bold'} ${size}px ${MONO}`;
    ctx.fillStyle = l.color || '#e8f4ff';
    ctx.textBaseline = 'top';
    ctx.textAlign = l.align || 'left';
    const x = l.align === 'center' ? w / 2 : pad;
    ctx.fillText(l.text, x, y, w - pad * 2);
    y += size * 1.3;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function labelSprite(text, { color = '#7fe9ff', scale = 1, sub = null } = {}) {
  const lines = [{ text, size: 40, color, align: 'center' }];
  if (sub) lines.push({ text: sub, size: 24, color: '#cbd5e1', weight: 'normal', align: 'center' });
  const t = labelTexture(lines, { w: 512, h: sub ? 128 : 84, bg: 'rgba(4,8,14,0.72)', border: color, pad: 16 });
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(8 * scale, (sub ? 2 : 1.31) * scale, 1);
  s.renderOrder = 20;
  return s;
}
