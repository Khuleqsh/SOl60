// SOL 60: RED HORIZON — minimalist HUD, tactical radar minimap (drawn straight from the sim loop),
// NASA Codex, and the Stage 4 post-mission debrief (What-If simulator, Captain's Log, citations, selfie).

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { WORLD, OLYMPUS, TRAIL, CODEX, CITATIONS, ENDINGS, LEGACY_ENDINGS, BACKPACKS, byId } from '../data/nasaData.js';
import { LOADOUT_ITEMS, MASS_LIMIT, BUDGET_LIMIT, loadoutEffects, loadoutTotals } from '../data/scienceData.js';
import { buildPioneerModel } from '../engine/archiveModels.js';
import { getTerrainHeight } from '../engine/terrainPhysics.js';
import { KeyCap, keyLabel, ScaleNotice, SourceLink } from '../ui/common.jsx';
import { codexSource } from '../data/nasaDatasets.js';

// ---------------------------------------------------------------- minimap
/** Pre-render a shaded elevation image of the whole world (once per mission). */
export function buildMinimapBase(size = 384) {
  const W = WORLD.maxX - WORLD.minX;
  const D = WORLD.maxZ - WORLD.minZ;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = Math.round((size * D) / W);
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const step = W / c.width;
  const gw = c.width + 1;
  const hs = new Float32Array(gw * (c.height + 1));
  for (let j = 0; j <= c.height; j++)
    for (let i = 0; i <= c.width; i++) hs[j * gw + i] = getTerrainHeight(WORLD.minX + i * step, WORLD.minZ + j * step);
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const h = hs[j * gw + i];
      const hx = hs[j * gw + i + 1];
      const hz = hs[(j + 1) * gw + i];
      const shade = Math.max(-1, Math.min(1, ((h - hx) + (h - hz)) * 0.35));
      const e = Math.max(0, Math.min(1, (h + 15) / (OLYMPUS.h + 25)));
      let r = 70 + e * 120 + shade * 40;
      let gg = 34 + e * 70 + shade * 26;
      let b = 22 + e * 50 + shade * 18;
      // contour lines every 12 m
      if (Math.abs(((h % 12) + 12) % 12) < 0.9) {
        r += 18;
        gg += 12;
        b += 10;
      }
      const k = (j * c.width + i) * 4;
      img.data[k] = r;
      img.data[k + 1] = gg;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // switchback trail
  g.strokeStyle = 'rgba(255,230,180,0.55)';
  g.lineWidth = 1.2;
  g.setLineDash([3, 2]);
  g.beginPath();
  TRAIL.forEach(([x, z], i) => {
    const px = (x - WORLD.minX) / step;
    const pz = (z - WORLD.minZ) / step;
    if (i === 0) g.moveTo(px, pz);
    else g.lineTo(px, pz);
  });
  g.stroke();
  return c;
}

/**
 * Draws the radar minimap. info: { cx, cz, yaw, range, items[], objective, boulders[], wall, storm, flare, quake, t }.
 * items: { x, z, kind: 'shelter' | 'device' | 'done' | 'rover' | 'planter' | 'echo' | 'lander' | 'rocket' }.
 */
export function drawMinimap(canvas, base, info) {
  if (!canvas || !base) return;
  const g = canvas.getContext('2d');
  const S = canvas.width;
  const R = S / 2;
  const k = (R - 4) / info.range; // px per metre
  const cos = Math.cos(info.yaw);
  const sin = Math.sin(info.yaw);
  const toS = (x, z) => {
    const dx = (x - info.cx) * k;
    const dz = (z - info.cz) * k;
    return [R + dx * cos - dz * sin, R + dx * sin + dz * cos];
  };
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#120a08';
  g.fillRect(0, 0, S, S);
  g.save();
  g.translate(R, R);
  g.rotate(info.yaw);
  g.scale(k, k);
  g.translate(-info.cx, -info.cz);
  const step = (WORLD.maxX - WORLD.minX) / base.width;
  g.globalAlpha = 0.95;
  g.drawImage(base, WORLD.minX, WORLD.minZ, base.width * step, base.height * step);
  g.globalAlpha = 1;
  // hazards in world space
  if (info.wall) {
    const w = info.wall;
    g.save();
    g.translate(w.x, w.z);
    g.rotate(Math.atan2(w.dz, w.dx));
    g.fillStyle = 'rgba(255,60,40,0.35)';
    g.fillRect(-w.thick / 2, -900, w.thick, 1800);
    g.fillStyle = 'rgba(255,120,60,0.18)';
    g.fillRect(w.thick / 2, -900, 60, 1800);
    g.restore();
  }
  if (info.storm !== null && info.storm !== undefined) {
    g.fillStyle = 'rgba(255,60,40,0.3)';
    g.fillRect(WORLD.minX, info.storm, WORLD.maxX - WORLD.minX, WORLD.maxZ - info.storm);
  }
  if (info.quake) {
    g.strokeStyle = `rgba(255,60,40,${0.4 + Math.sin(info.t * 10) * 0.2})`;
    g.lineWidth = 3 / k;
    g.beginPath();
    g.arc(info.cx, info.cz, 55, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  // items
  for (const it of info.items) {
    const [sx, sy] = toS(it.x, it.z);
    if (sx < -8 || sy < -8 || sx > S + 8 || sy > S + 8) continue;
    if (it.kind === 'shelter') {
      g.fillStyle = '#3dff8a';
      g.beginPath();
      g.arc(sx, sy, 4.5, Math.PI, 0);
      g.lineTo(sx + 4.5, sy + 2);
      g.lineTo(sx - 4.5, sy + 2);
      g.fill();
    } else if (it.kind === 'device' || it.kind === 'rover') {
      g.fillStyle = '#ffb020';
      g.save();
      g.translate(sx, sy);
      g.rotate(Math.PI / 4);
      g.fillRect(-3.5, -3.5, 7, 7);
      g.restore();
    } else if (it.kind === 'done') {
      g.strokeStyle = '#7ad7ff';
      g.lineWidth = 1.5;
      g.strokeRect(sx - 3, sy - 3, 6, 6);
    } else if (it.kind === 'planter') {
      g.fillStyle = '#9be36a';
      g.fillRect(sx - 2, sy - 2, 4, 4);
    } else if (it.kind === 'echo') {
      g.fillStyle = '#58e1ff';
      g.beginPath();
      g.arc(sx, sy, 2.5, 0, Math.PI * 2);
      g.fill();
    } else if (it.kind === 'sci') {
      g.fillStyle = '#b46bff';
      g.beginPath();
      g.moveTo(sx, sy - 4);
      g.lineTo(sx + 3.5, sy);
      g.lineTo(sx, sy + 4);
      g.lineTo(sx - 3.5, sy);
      g.closePath();
      g.fill();
    } else if (it.kind === 'lander' || it.kind === 'rocket') {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(sx, sy - 5);
      g.lineTo(sx + 3, sy + 3);
      g.lineTo(sx - 3, sy + 3);
      g.fill();
    }
  }
  for (const b of info.boulders) {
    const [sx, sy] = toS(b.x, b.z);
    g.fillStyle = '#ff3b30';
    g.beginPath();
    g.arc(sx, sy, 2 + b.r, 0, Math.PI * 2);
    g.fill();
  }
  // view cone + player
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.moveTo(R, R);
  g.arc(R, R, R * 0.55, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
  g.closePath();
  g.fill();
  g.save();
  g.translate(R, R);
  g.rotate(info.yaw + Math.PI - info.facing);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(4.5, 5);
  g.lineTo(0, 2.5);
  g.lineTo(-4.5, 5);
  g.closePath();
  g.fill();
  g.restore();
  // objective waypoint (pulsing) or edge arrow
  if (info.objective) {
    const [ox, oy] = toS(info.objective.x, info.objective.z);
    const dx = ox - R;
    const dy = oy - R;
    const d = Math.hypot(dx, dy);
    const pulse = 0.5 + 0.5 * Math.sin(info.t * 5);
    if (d < R - 10) {
      g.strokeStyle = `rgba(255,204,51,${0.5 + pulse * 0.5})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ox, oy, 5 + pulse * 4, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#ffcc33';
      g.beginPath();
      g.arc(ox, oy, 3, 0, Math.PI * 2);
      g.fill();
    } else {
      const a = Math.atan2(dy, dx);
      const ex = R + Math.cos(a) * (R - 12);
      const ey = R + Math.sin(a) * (R - 12);
      g.save();
      g.translate(ex, ey);
      g.rotate(a);
      g.fillStyle = `rgba(255,204,51,${0.7 + pulse * 0.3})`;
      g.beginPath();
      g.moveTo(8, 0);
      g.lineTo(-5, 6);
      g.lineTo(-2, 0);
      g.lineTo(-5, -6);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  g.restore();
  // rim + north marker
  g.strokeStyle = info.flare ? `rgba(255,60,40,${0.6 + Math.sin(info.t * 8) * 0.3})` : 'rgba(150,200,230,0.45)';
  g.lineWidth = info.flare ? 4 : 2;
  g.beginPath();
  g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.stroke();
  const [nx, ny] = [R + Math.sin(-info.yaw) * -(R - 10), R - Math.cos(-info.yaw) * (R - 10)];
  g.fillStyle = '#ff6a3d';
  g.font = `bold ${Math.round(S * 0.06)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N', nx, ny);
}

// ---------------------------------------------------------------- compass ribbon
const wrapPi = (a) => {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const CARDINALS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/**
 * Draws the top Compass Ribbon. info: { yaw, x, z, markers: [{ x, z, label, color, dim, kind }], t }.
 * Heading is measured clockwise from north (-Z). Pioneers show their Morse callsign and distance.
 */
export function drawCompass(canvas, info) {
  if (!canvas || !info) return;
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  g.clearRect(0, 0, W, H);
  const span = Math.PI * 0.95;
  const ppr = W / span;
  const heading = -info.yaw;
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(6,12,20,0)');
  grad.addColorStop(0.12, 'rgba(6,12,20,0.6)');
  grad.addColorStop(0.88, 'rgba(6,12,20,0.6)');
  grad.addColorStop(1, 'rgba(6,12,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 6, W, H - 12);
  g.font = '600 11px ui-monospace, Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 5) {
    const rel = wrapPi((deg * Math.PI) / 180 - heading);
    if (Math.abs(rel) > span / 2) continue;
    const x = W / 2 + rel * ppr;
    const fade = 1 - Math.pow(Math.abs(rel) / (span / 2), 3);
    const major = deg % 45 === 0;
    g.strokeStyle = `rgba(200,225,245,${(major ? 0.9 : 0.4) * fade})`;
    g.lineWidth = major ? 2 : 1;
    g.beginPath();
    g.moveTo(x, H - 8);
    g.lineTo(x, H - (major ? 18 : 13));
    g.stroke();
    if (major) {
      g.fillStyle = deg === 0 ? `rgba(255,106,61,${fade})` : `rgba(225,240,255,${fade})`;
      g.fillText(CARDINALS[deg], x, H - 27);
    }
  }
  // markers: diamonds with a label and distance; clamped to the ribbon edge with a chevron when off-screen
  const ordered = [...info.markers].sort((a, b) => Number(!!b.dim) - Number(!!a.dim));
  for (const m of ordered) {
    const dx = m.x - info.x;
    const dz = m.z - info.z;
    const rel = wrapPi(Math.atan2(dx, -dz) - heading);
    const dist = Math.hypot(dx, dz);
    const off = Math.abs(rel) > span / 2 - 0.05;
    const x = W / 2 + Math.max(-span / 2 + 0.05, Math.min(span / 2 - 0.05, rel)) * ppr;
    const a = m.dim ? 0.45 : off ? 0.7 : 1;
    const y = 15;
    g.save();
    g.translate(x, y);
    g.fillStyle = m.color;
    g.globalAlpha = a;
    if (m.kind === 'shelter') {
      g.beginPath();
      g.arc(0, 2, 4, Math.PI, 0);
      g.fill();
    } else if (off) {
      g.rotate(rel > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(5, 4);
      g.lineTo(-5, 4);
      g.closePath();
      g.fill();
    } else {
      const pulse = m.active ? 1 + Math.sin(info.t * 8) * 0.15 : 1;
      g.rotate(Math.PI / 4);
      g.scale(pulse, pulse);
      g.fillRect(-4.5, -4.5, 9, 9);
      if (m.kind === 'pioneer' && !m.dim) {
        g.strokeStyle = m.color;
        g.lineWidth = 1;
        g.strokeRect(-7.5, -7.5, 15, 15);
      }
    }
    g.restore();
    if (m.label && !off) {
      g.globalAlpha = m.dim ? 0.55 : 1;
      g.fillStyle = m.color;
      g.fillText(m.label, x, 30);
      if (m.kind === 'pioneer' && !m.dim) {
        g.fillStyle = 'rgba(220,235,250,0.8)';
        g.font = '10px ui-monospace, Consolas, monospace';
        g.fillText(`${Math.round(dist)}m`, x, H - 2);
        g.font = '600 11px ui-monospace, Consolas, monospace';
      }
    }
    g.globalAlpha = 1;
  }
  // centre caret
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(W / 2 - 5, 0);
  g.lineTo(W / 2 + 5, 0);
  g.lineTo(W / 2, 8);
  g.closePath();
  g.fill();
}

// ---------------------------------------------------------------- small pieces
function Bar({ label, value, max = 100, color, warn = 25, invert = false }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = invert ? pct > 100 - warn : pct < warn;
  return (
    <div className="flex items-center gap-2 text-[11px] leading-none" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <span className={`w-11 font-mono tracking-wider ${low ? 'text-red-400 animate-pulse' : 'text-slate-300/80'}`}>{label}</span>
      <div className="h-[5px] w-28 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: low ? '#ff3b30' : color }} />
      </div>
      <span className="w-8 text-right font-mono text-slate-300/70">{Math.round(value)}</span>
    </div>
  );
}

export { KeyCap, keyLabel };

// ---------------------------------------------------------------- 2D world markers
/** A screen-space marker. The loop writes `${prefix}El` transform, `${prefix}Arrow` rotation and `${prefix}Text`. */
export function MarkerChip({ dom, prefix, color }) {
  return (
    <div ref={(el) => (dom[`${prefix}El`] = el)} className="pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform">
      <div className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <div className="relative h-7 w-7">
          <div ref={(el) => (dom[`${prefix}Ring`] = el)} className="absolute inset-0 rotate-45 border-2" style={{ borderColor: color, boxShadow: `0 0 10px ${color}` }} />
          <div ref={(el) => (dom[`${prefix}Arrow`] = el)} className="absolute inset-0 hidden" style={{ color }}>
            <svg viewBox="0 0 24 24" className="h-full w-full">
              <path d="M22 12 L8 4 L11 12 L8 20 Z" fill="currentColor" />
            </svg>
          </div>
        </div>
        <div ref={(el) => (dom[`${prefix}Text`] = el)} className="mt-1 whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 font-mono text-[11px]" style={{ color }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- HUD
export function Hud({ hud, dom, keys, onOpenSettings, onToggleCodex }) {
  if (!hud) return null;
  const v = hud.vitals;
  const hidden = hud.hudHidden;
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-slate-100">
      {/* damage / cold / dust vignette written directly by the loop */}
      <div ref={(el) => (dom.vignette = el)} className="absolute inset-0 opacity-0" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(255,40,20,0.55) 100%)' }} />
      {/* helmet visor: orange dust creeps in from the rim during storms; frost forms when the suit is cold */}
      <div ref={(el) => (dom.visorDust = el)} className="absolute inset-0 opacity-0" style={{ background: 'radial-gradient(ellipse at center, transparent 48%, rgba(196,110,48,0.35) 78%, rgba(150,78,30,0.75) 100%)' }} />
      <div ref={(el) => (dom.visorFrost = el)} className="absolute inset-0 opacity-0" style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(205,230,255,0.4) 72%, rgba(235,246,255,0.8) 100%)' }} />
      <div ref={(el) => (dom.fade = el)} className="absolute inset-0 bg-black opacity-0" />

      {!hidden && (
        <>
          {/* objective */}
          <div className="absolute left-4 top-4 max-w-[340px] rounded-lg border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-sm">
            <div className="font-mono text-[10px] tracking-[0.2em] text-amber-300">
              {hud.headline}
            </div>
            <div className="mt-1 text-[13px] font-semibold leading-snug">{hud.objective?.label}</div>
            {hud.checklist?.length > 0 && (
              <ul className="mt-1 list-none space-y-0.5 pl-0 text-[11px]">
                {hud.checklist.map((c) => (
                  <li key={c.label} className={c.done ? 'text-emerald-300/80 line-through' : 'text-slate-300'}>
                    {c.done ? '✔' : '○'} {c.label}
                  </li>
                ))}
              </ul>
            )}
            {hud.science && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[10px]">
                {hud.science.pioneers.map((pn) => (
                  <span
                    key={pn.id}
                    title={pn.name}
                    className={`rounded border px-1 ${pn.state === 'preserved' ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-200' : pn.state === 'salvaged' ? 'border-slate-400/40 text-slate-400' : pn.state === 'unfound' ? 'border-amber-300/50 text-amber-200' : 'animate-pulse border-white/60 text-white'}`}
                  >
                    {pn.code}
                  </span>
                ))}
                <span className={`rounded border px-1 ${hud.science.sherloc ? 'border-violet-300/60 bg-violet-400/15 text-violet-200' : 'border-violet-300/30 text-violet-300/70'}`}>SHERLOC</span>
                {hud.escapade && <span className="rounded border border-emerald-300/50 px-1 text-emerald-200">ESCAPADE</span>}
              </div>
            )}
          </div>

          {/* top compass ribbon (pioneer Morse beacons, objective, shelters) */}
          <canvas
            ref={(el) => (dom.compass = el)}
            width={640}
            height={46}
            className="absolute left-1/2 top-2 -translate-x-1/2"
            style={{ width: 'clamp(220px, calc(100vw - 600px), 560px)', height: 'auto' }}
          />

          {/* NASA Discovery Insight card (2 sentences + cited source) */}
          {hud.insight && (
            <div className="absolute right-4 top-[136px] w-[min(320px,38vw)] rounded-lg border border-cyan-300/30 bg-[#06121c]/85 px-3 py-2 backdrop-blur-sm">
              <div className="font-mono text-[9px] tracking-[0.25em] text-cyan-300">NASA DISCOVERY INSIGHT</div>
              <div className="mt-0.5 text-[13px] font-bold text-white">{hud.insight.title}</div>
              <p className="mt-1 text-[11.5px] leading-snug text-slate-200">{hud.insight.text}</p>
              <div className="mt-1.5 inline-block rounded bg-cyan-400/15 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-cyan-200">SOURCE: {hud.insight.source}</div>
            </div>
          )}

          {/* 2D markers: projected from 3D every frame, clamped to the screen edge, never buried in terrain */}
          <MarkerChip dom={dom} prefix="obj" color="#ffcc33" />
          <MarkerChip dom={dom} prefix="o2" color="#35f0ff" />

          {/* clock & environment */}
          <div className="absolute right-4 top-4 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-right font-mono text-[11px] leading-tight backdrop-blur-sm">
            <div className="text-[13px] font-semibold text-white">
              SOL {hud.sol} · {hud.clock}
            </div>
            <div className="text-slate-300/80">
              {hud.tempC}°C · ALT {hud.alt} m
            </div>
            {hud.inShelter && <div className="text-emerald-300">⌂ {hud.inShelter}</div>}
            <div className="mt-1 flex justify-end gap-1 text-[10px]">
              {hud.flashlight && <span className="rounded bg-amber-400/20 px-1 text-amber-200">LIGHT</span>}
              {hud.shield && <span className="rounded bg-violet-400/25 px-1 text-violet-200">SHIELD</span>}
              {hud.xray && <span className="rounded bg-sky-400/25 px-1 text-sky-200">X-RAY</span>}
            </div>
          </div>

          {/* hazard banner */}
          {hud.hazard && (
            <div role="alert" className={`absolute left-1/2 top-20 -translate-x-1/2 rounded-md border px-4 py-1.5 text-center font-mono text-[12px] font-bold tracking-wider ${hud.hazard.active ? 'border-red-400/70 bg-red-600/40 text-white' : 'border-amber-300/60 bg-amber-500/25 text-amber-100'} animate-pulse`}>
              ⚠ {hud.hazard.text}
            </div>
          )}

          {/* vitals */}
          <div className="absolute bottom-4 left-4 space-y-1 rounded-lg border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-sm">
            <Bar label="O2" value={v.o2} max={v.o2Cap} color="#35d6ff" />
            <Bar label="SUIT" value={v.health} color="#3dff8a" />
            <Bar label="WARM" value={v.warmth} color="#ff9f43" />
            <Bar label="FOOD" value={v.food} color="#d4e157" />
            <Bar label="STAM" value={v.stamina} color="#ffffff" warn={10} />
            <Bar label="FILTR" value={100 - v.filter} color="#c08a5a" />
            {hud.climb && (hud.climb.climbing || v.grip < 99) && <Bar label="GRIP" value={v.grip} color="#f6d365" warn={30} />}
            {hud.climb && (hud.climb.climbing || hud.climb.pitons > 0) && (
              <div className="flex justify-between pt-0.5 font-mono text-[10px] text-amber-200/90">
                <span>PITONS {hud.climb.pitons}</span>
                {hud.climb.anchored && <span className="text-emerald-300">ANCHORED</span>}
                {hud.climb.gloveDust > 0.3 && <span className="text-red-300">GLOVES DUSTY · E brush</span>}
              </div>
            )}
            <div className="flex justify-between pt-0.5 font-mono text-[10px] text-slate-300/70">
              <span>RAD {v.rad.toFixed(1)} mSv</span>
              <span>BAT {Math.round(v.battery)}%</span>
              <span>FOCUS {Math.round(v.focus)}</span>
            </div>
          </div>

          {/* minimap */}
          <div className="absolute bottom-4 right-4 flex flex-col items-end">
            <canvas ref={(el) => (dom.minimap = el)} width={220} height={220} className="h-[190px] w-[190px] rounded-full shadow-[0_0_20px_rgba(0,0,0,0.6)]" />
            <div className="mt-1 flex gap-2 font-mono text-[9px] text-slate-300/80">
              <span className="text-emerald-300">▲ shelter</span>
              <span className="text-amber-300">◆ repair</span>
              <span className="text-red-400">● hazard</span>
              <span className="text-yellow-300">◎ objective</span>
            </div>
          </div>

          {/* radio */}
          {hud.radio && (
            <div aria-live="polite" className="absolute bottom-24 left-1/2 w-[min(640px,90vw)] -translate-x-1/2 rounded-lg border border-cyan-300/20 bg-black/55 px-4 py-2 text-[13px] backdrop-blur-sm">
              <span className="mr-2 font-mono text-[11px] font-bold tracking-widest text-cyan-300">{hud.radio.speaker} ›</span>
              {hud.radio.text}
            </div>
          )}

          {/* build mode */}
          {hud.build?.active && (
            <div className="absolute bottom-44 left-1/2 -translate-x-1/2 rounded-lg border border-white/15 bg-black/60 px-4 py-2 text-center text-[12px] backdrop-blur-sm">
              <div className="font-mono text-[10px] tracking-[0.2em] text-slate-300">BUILD MODE</div>
              <div className="mt-1 flex gap-3">
                {hud.build.items.map((it, i) => (
                  <span key={it.id} className={`rounded px-2 py-0.5 ${hud.build.item === it.id ? 'bg-white/20 text-white' : 'text-slate-400'}`}>
                    <KeyCap>{i + 1}</KeyCap> {it.name} ×{it.kits}
                  </span>
                ))}
              </div>
              <div className={`mt-1 font-semibold ${hud.build.ok ? 'text-emerald-300' : 'text-red-400'}`}>{hud.build.reason}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                <KeyCap>{keyLabel(keys.interact)}</KeyCap>/click place · <KeyCap>{keyLabel(keys.rotate)}</KeyCap> rotate · <KeyCap>{keyLabel(keys.build)}</KeyCap> exit
              </div>
            </div>
          )}

          {/* rover energy economy */}
          {hud.roverEnergy && (
            <div className="absolute bottom-[214px] right-4 w-[190px] rounded-lg border border-white/10 bg-black/55 px-3 py-2 font-mono text-[10px] backdrop-blur-sm" role="group" aria-label="Rover energy">
              <div className="flex justify-between text-slate-300">
                <span>ROVER BATTERY</span>
                <span className={hud.roverEnergy.pct < 15 ? 'text-red-300' : 'text-white'}>{Math.round(hud.roverEnergy.pct)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Rover battery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.roverEnergy.pct)}>
                <div className="h-full rounded-full" style={{ width: `${hud.roverEnergy.pct}%`, background: hud.roverEnergy.pct < 15 ? '#ff3b30' : '#ffd23f' }} />
              </div>
              <div className="mt-1 flex justify-between text-slate-400">
                <span>{hud.roverEnergy.wh} Wh</span>
                <span className="text-red-300">−{hud.roverEnergy.drain.toFixed(2)}%/s</span>
                <span className="text-emerald-300">+{hud.roverEnergy.charge.toFixed(2)}%/s</span>
              </div>
              <div className="mt-0.5 text-slate-400">
                panels {Math.round(hud.roverEnergy.dust * 100)}% dusty{hud.roverEnergy.array ? ' · array aimed' : ''}{hud.roverEnergy.station ? ' · station' : ''}
              </div>
            </div>
          )}

          {/* NASA data overlay [N]: simulated readings beside published mission ranges, each with a source */}
          {hud.dataOverlay && (
            <section aria-label="NASA data overlay" className="pointer-events-auto absolute left-4 top-[186px] w-[300px] rounded-lg border border-cyan-300/30 bg-[#06121c]/85 px-3 py-2 text-[11px] backdrop-blur-sm">
              <div className="font-mono text-[9px] tracking-[0.25em] text-cyan-300">LIVE SIM vs. NASA DATA [{keyLabel(keys.data)}]</div>
              <table className="mt-1 w-full">
                <tbody>
                  {hud.dataOverlay.map((r) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="py-0.5 text-slate-300">{r.label}</td>
                      <td className="py-0.5 font-mono text-white">{r.game}</td>
                      <td className="py-0.5 text-slate-400">
                        <SourceLink source={r.source}>{r.ref}</SourceLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* rover */}
          {hud.rover?.driving && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-white/15 bg-black/55 px-4 py-1.5 font-mono text-[12px]">
              ROVER · {hud.rover.speed} km/h {hud.rover.steep && <span className="text-red-400"> · TOO STEEP</span>}
            </div>
          )}

          {/* transmission countdown */}
          {hud.transmit && (
            <div className="absolute left-1/2 top-28 -translate-x-1/2 rounded-md border border-cyan-300/40 bg-cyan-900/40 px-4 py-1.5 text-center font-mono text-[12px] text-cyan-100">
              SIGNAL IN FLIGHT · Earth light-time 14:22 · reply in {hud.transmit}s
            </div>
          )}

          {/* bottom hint */}
          <div className="absolute bottom-1 left-1/2 hidden -translate-x-1/2 gap-2 font-mono text-[10px] text-slate-400/80 md:flex">
            <span>
              <KeyCap>{keyLabel(keys.interact)}</KeyCap> interact
            </span>
            <span>
              <KeyCap>{keyLabel(keys.build)}</KeyCap> build
            </span>
            <span>
              <KeyCap>{keyLabel(keys.codex)}</KeyCap> codex
            </span>
            <span>
              <KeyCap>Esc</KeyCap> settings
            </span>
          </div>
        </>
      )}

      {/* centre: crosshair, prompt, progress ring, tuning meter (always visible) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="64" height="64" viewBox="0 0 64 64" className="absolute -left-8 -top-8">
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" ref={(el) => (dom.ringBg = el)} opacity="0" />
          <circle
            ref={(el) => (dom.ring = el)}
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="#ffcc33"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="163.4"
            strokeDashoffset="163.4"
            transform="rotate(-90 32 32)"
          />
        </svg>
        {!hidden && <div className="h-1 w-1 rounded-full bg-white/70" />}
      </div>
      {hud.prompt && (
        <div className="absolute left-1/2 top-[58%] -translate-x-1/2 rounded-md bg-black/55 px-3 py-1 text-[13px] backdrop-blur-sm">
          {hud.prompt.key && <KeyCap>{keyLabel(keys[hud.prompt.key] || hud.prompt.key)}</KeyCap>} {hud.prompt.text}
        </div>
      )}
      {hud.tune?.active && (
        <div className="absolute left-1/2 top-[38%] w-80 -translate-x-1/2 rounded-lg border border-cyan-300/40 bg-black/70 p-3 text-center">
          <div className="font-mono text-[11px] tracking-widest text-cyan-200">HIGH-GAIN SIGNAL LOCK {hud.tune.locks}/3</div>
          <div className="relative mt-2 h-4 rounded bg-white/10">
            <div className="absolute top-0 h-full rounded bg-emerald-400/40" style={{ left: `${hud.tune.band[0] * 100}%`, width: `${(hud.tune.band[1] - hud.tune.band[0]) * 100}%` }} />
            <div ref={(el) => (dom.needle = el)} className="absolute -top-1 h-6 w-1 rounded bg-amber-300" />
          </div>
          <div className="mt-1 text-[11px] text-slate-300">
            Press <KeyCap>{keyLabel(keys.interact)}</KeyCap> when the needle is in the green band
          </div>
        </div>
      )}
      {hud.toast && (
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 rounded-md border border-emerald-300/40 bg-emerald-900/50 px-4 py-1.5 font-mono text-[13px] text-emerald-100">{hud.toast}</div>
      )}
      {hud.photo && (
        <>
          <div className="absolute inset-x-0 top-0 h-[9%] bg-black/85" />
          <div className="absolute inset-x-0 bottom-0 h-[9%] bg-black/85" />
          <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-widest text-amber-200">
            MASTCAM-Z · <KeyCap>{keyLabel(keys.selfie)}</KeyCap> capture · <KeyCap>{keyLabel(keys.mastcam)}</KeyCap> exit
          </div>
        </>
      )}
      {/* cutscene subtitles (briefing) + free-look hint */}
      {hud.cineSub && (
        <div aria-live="polite" className="absolute bottom-24 left-1/2 w-[min(720px,92vw)] -translate-x-1/2 rounded-xl border border-amber-300/30 bg-black/70 px-5 py-3 text-center backdrop-blur">
          <div className="font-mono text-[11px] tracking-[0.3em] text-amber-300">{hud.cineSub.title}</div>
          <div className="mt-1 text-[15px] leading-snug text-white">{hud.cineSub.text}</div>
        </div>
      )}
      {hud.cineActive && <div className="absolute left-1/2 top-24 -translate-x-1/2 rounded bg-black/40 px-3 py-1 font-mono text-[11px] text-slate-300">Drag to look around 360° · Space to skip</div>}

      {/* visual beacon HUD + live Morse captions (Deaf / hard-of-hearing support) */}
      {!hidden && hud.captions !== false && (
        <div className="absolute left-1/2 top-[54px] flex -translate-x-1/2 flex-col items-center" aria-hidden="true">
          <canvas ref={(el) => (dom.beacon = el)} width={320} height={64} className="h-[64px] w-[320px]" />
          <div ref={(el) => (dom.beaconText = el)} className="-mt-1 rounded bg-black/50 px-2 font-mono text-[11px] text-amber-100 empty:hidden" />
        </div>
      )}

      {hud.cinematic && (
        <div className="absolute bottom-8 right-8 rounded bg-black/50 px-3 py-1 font-mono text-[11px] text-slate-300">
          {hud.cinematic} · <KeyCap>Space</KeyCap> skip
        </div>
      )}

      <div className="pointer-events-auto absolute right-4 top-[96px] flex gap-1">
        <button className="rounded border border-white/15 bg-black/40 px-2 py-1 text-[11px] hover:bg-white/10" onClick={onToggleCodex} title="NASA Codex">
          ⓘ Codex
        </button>
        <button className="rounded border border-white/15 bg-black/40 px-2 py-1 text-[11px] hover:bg-white/10" onClick={onOpenSettings} title="Settings">
          ⚙
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Codex + Moon-to-Mars 3D Archive
const ARCHIVE_MODELS = [
  { id: 'mer', name: 'Opportunity / Spirit (MER)', mission: 'Mars 2004', note: 'Twin rovers built for 90 sols; Opportunity lasted almost 15 years.', source: 'NASA/JPL MER' },
  { id: 'insight', name: 'InSight Lander', mission: 'Mars 2018', note: 'First seismometer on Mars: 1,300+ marsquakes, liquid core revealed.', source: 'NASA InSight / SEIS' },
  { id: 'heli', name: 'Ingenuity Helicopter', mission: 'Mars 2021', note: 'First powered flight on another planet; 72 flights.', source: 'NASA/JPL Mars Helicopter' },
  { id: 'alsep', name: 'Apollo 12 ALSEP', mission: 'Moon 1969', note: 'Nuclear-powered station with seismometer and magnetometer.', source: 'NASA Apollo Program' },
  { id: 'surveyor', name: 'Surveyor 3', mission: 'Moon 1967', note: 'Soft-lander whose camera and scoop were retrieved by Apollo 12.', source: 'NASA Surveyor Program' },
];

/** Turntable preview of a procedural archive model, rendered by its own tiny WebGL context while the tab is open. */
function ArchiveViewer({ model }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }
    const w = el.clientWidth || 300;
    const h = 220;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    scene.add(new THREE.HemisphereLight('#ffe7d0', '#3a2218', 1.7));
    const sun = new THREE.DirectionalLight('#fff1dd', 2.6);
    sun.position.set(4, 6, 3);
    scene.add(sun);
    const m = buildPioneerModel(model);
    const box3 = new THREE.Box3().setFromObject(m.group);
    const size = box3.getSize(new THREE.Vector3());
    const ctr = box3.getCenter(new THREE.Vector3());
    m.group.position.sub(ctr);
    const pivot = new THREE.Group();
    pivot.add(m.group);
    scene.add(pivot);
    const R = Math.max(size.x, size.y, size.z) * 1.35 + 0.8;
    cam.position.set(R * 0.9, R * 0.55, R * 1.1);
    cam.lookAt(0, 0, 0);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      pivot.rotation.y += 0.01;
      if (m.rotors) m.rotors.forEach((r, i) => (r.rotation.y += (i ? -1 : 1) * 0.3));
      renderer.render(scene, cam);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    };
  }, [model]);
  return <div ref={box} className="h-[220px] w-full overflow-hidden rounded-lg bg-black/40" />;
}

export function CodexPanel({ open, onClose, seen }) {
  const [sel, setSel] = useState(CODEX[0].id);
  const [tab, setTab] = useState('codex');
  const [arch, setArch] = useState('mer');
  const [collapsed, setCollapsed] = useState(false);
  if (!open) return null;
  const entry = CODEX.find((c) => c.id === sel) || CODEX[0];
  const am = ARCHIVE_MODELS.find((a) => a.id === arch) || ARCHIVE_MODELS[0];
  return (
    <div className="pointer-events-auto absolute right-4 top-36 z-20 w-[min(580px,92vw)] overflow-hidden rounded-xl border border-white/15 bg-[#081018]/95 text-slate-100 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-left font-mono text-[11px] tracking-wider text-cyan-200" aria-expanded={!collapsed}>
          <span>{collapsed ? '▸' : '▾'}</span>
          <span>[I] NASA CODEX &amp; MOON-TO-MARS 3D ARCHIVE</span>
        </button>
        <button onClick={onClose} className="rounded px-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close codex">
          ✕
        </button>
      </div>
      {!collapsed && <ScaleNotice compact className="mx-3 mt-2" />}
      {!collapsed && (
        <>
          <div className="flex gap-1 px-3 pt-2 text-[12px]">
            {[
              ['codex', 'Codex'],
              ['archive', '3D Archive'],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-t px-3 py-1 ${tab === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'codex' ? (
            <div className="flex max-h-[58vh]">
              <div className="w-48 shrink-0 overflow-y-auto border-r border-white/10 py-2">
                {CODEX.map((c) => (
                  <button key={c.id} onClick={() => setSel(c.id)} className={`block w-full px-3 py-1.5 text-left text-[12px] ${sel === c.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>
                    {seen?.has(c.id) && <span className="mr-1 text-amber-300">●</span>}
                    {c.title}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <h2 className="text-lg">{entry.title}</h2>
                <div className="mt-1 inline-block rounded bg-cyan-400/15 px-2 py-0.5 font-mono text-[10px] tracking-wider text-cyan-200">SOURCE: {entry.source}</div>
                <div className="mt-1 text-[11px]">
                  <SourceLink source={codexSource(entry)} />
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-slate-200">{entry.text}</p>
                {entry.model && (
                  <button onClick={() => { setArch(entry.model); setTab('archive'); }} className="mt-3 rounded border border-cyan-300/40 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-400/10">
                    View 3D model →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-h-[62vh] overflow-y-auto p-3">
              <ArchiveViewer key={arch} model={arch} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ARCHIVE_MODELS.map((a) => (
                  <button key={a.id} onClick={() => setArch(a.id)} className={`rounded border px-2 py-1 text-[11px] ${arch === a.id ? 'border-cyan-300 bg-cyan-400/10 text-white' : 'border-white/15 text-slate-300 hover:border-white/40'}`}>
                    {a.name}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[13px] font-bold">{am.name} <span className="font-mono text-[10px] text-amber-300">{am.mission}</span></div>
              <p className="mt-1 text-[12px] text-slate-300">{am.note}</p>
              <div className="mt-1 inline-block rounded bg-cyan-400/15 px-2 py-0.5 font-mono text-[10px] text-cyan-200">SOURCE: {am.source}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

