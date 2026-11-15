// SOL 60 — tactile mini-puzzle overlay (mouse, trackpad, touch and keyboard friendly). Rules live in logic/puzzles.js.

import { useEffect, useRef, useState } from 'react';
import * as PZ from '../logic/puzzles.js';
import { SourceLink } from './common.jsx';
import { SOURCES } from '../data/nasaDatasets.js';

const TITLES = {
  triangulation: ['SIGNAL TRIANGULATION', 'Tune both high-gain dishes onto Earth’s carrier. When both needles sit in the green, the link locks.'],
  power: ['POWER ROUTING', 'Tap tiles to rotate the conduits. Carry current from the source (left) to the load (right) without passing an overloaded red relay.'],
  spectro: ['SPECTROSCOPY SAMPLE MATCH', 'Slide each laser band onto a dip in the measured spectrum to identify the mineral.'],
  valves: ['AIRLOCK PRESSURE BALANCE', 'Raise the airlock from Mars ambient to habitat pressure (56.5 kPa). Overshoot 62 kPa and the relief valve dumps it. Hold steady for 2 s.'],
  solar: ['SOLAR ARRAY ALIGNMENT', 'Swing and tilt the portable array until it faces the Sun (output ≥ 96%).'],
};
const SRC = { triangulation: SOURCES.mro, power: SOURCES.curiosity, spectro: SOURCES.mro, valves: SOURCES.m2m, solar: SOURCES.mer };

function create(req) {
  const p = req.params || {};
  if (req.kind === 'triangulation') return PZ.createTriangulation(req.seed, p.tol ?? 0.05);
  if (req.kind === 'power') return PZ.createPowerGrid(req.seed);
  if (req.kind === 'spectro') return PZ.createSpectro(req.seed, p.tol ?? 0.05, p.mineral);
  if (req.kind === 'valves') return PZ.createValves();
  return PZ.createSolarAim(p.sunAz ?? 1, p.sunElev ?? 0.6);
}

function Slider({ label, value, min, max, step = 0.001, onChange, fmt = (v) => v.toFixed(2), accent = 'accent-amber-400' }) {
  return (
    <label className="block">
      <div className="flex justify-between font-mono text-[11px] text-slate-300">
        <span>{label}</span>
        <span>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`h-8 w-full ${accent}`} aria-label={label} />
    </label>
  );
}

export default function PuzzleOverlay({ request, onDone, reducedMotion }) {
  const [state, setState] = useState(() => create(request));
  const [solvedAt, setSolvedAt] = useState(0);
  const stRef = useRef(state);
  stRef.current = state;
  const doneRef = useRef(false);
  const [, force] = useState(0);

  // continuous puzzles (valves physics, autopilot demo) tick on rAF
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = stRef.current;
      if (request.auto) PZ.autoSolveStep(s, dt);
      else if (s.type === 'valves') PZ.stepValves(s, dt);
      if (!doneRef.current && PZ.isSolved(s)) {
        doneRef.current = true;
        setSolvedAt(performance.now());
        setTimeout(() => onDone(true), reducedMotion ? 300 : 900);
      }
      force((n) => (n + 1) % 1e6);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [request.auto, onDone, reducedMotion]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape') {
        e.stopPropagation();
        onDone(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDone]);

  const upd = (fn) => {
    const s = stRef.current;
    fn(s);
    setState({ ...s });
  };
  const s = stRef.current;
  const [title, help] = TITLES[s.type];
  const solved = !!solvedAt;

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-black/45 p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-[min(560px,100%)] rounded-2xl border border-cyan-300/40 bg-[#06121c]/95 p-4 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-[11px] tracking-[0.25em] text-cyan-300">{request.auto ? 'AUTOPILOT DEMO · ' : ''}FIELD PUZZLE</div>
            <h2 className="text-xl font-black">{title}</h2>
          </div>
          <button onClick={() => onDone(false)} className="rounded px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close puzzle">
            ✕
          </button>
        </div>
        <p className="mt-1 text-[13px] text-slate-300">{help}</p>

        <div className="mt-3">
          {s.type === 'triangulation' && <Triangulation s={s} upd={upd} />}
          {s.type === 'power' && <Power s={s} upd={upd} />}
          {s.type === 'spectro' && <Spectro s={s} upd={upd} />}
          {s.type === 'valves' && <Valves s={s} upd={upd} />}
          {s.type === 'solar' && <Solar s={s} upd={upd} />}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
          <SourceLink source={SRC[s.type]}>Science behind this</SourceLink>
          <div role="status" aria-live="polite" className={`rounded px-2 py-1 font-mono font-bold ${solved ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/5 text-slate-300'}`}>
            {solved ? '✔ SOLVED' : 'IN PROGRESS'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Triangulation({ s, upd }) {
  const sig = PZ.triangulationSignal(s);
  const Bar = ({ v, t }) => (
    <div className="relative h-6 rounded bg-white/10">
      <div className="absolute top-0 h-full rounded bg-emerald-400/35" style={{ left: `${(t - s.tol) * 100}%`, width: `${s.tol * 200}%` }} />
      <div className="absolute -top-1 h-8 w-1 rounded bg-amber-300" style={{ left: `calc(${v * 100}% - 2px)` }} />
    </div>
  );
  return (
    <div className="space-y-3">
      <Bar v={s.a} t={s.ta} />
      <Slider label="Dish A frequency offset" value={s.a} min={0} max={1} onChange={(v) => upd((x) => (x.a = v))} />
      <Bar v={s.b} t={s.tb} />
      <Slider label="Dish B frequency offset" value={s.b} min={0} max={1} onChange={(v) => upd((x) => (x.b = v))} />
      <div className="font-mono text-[12px]">
        SIGNAL <span className="inline-block h-2 w-40 rounded bg-white/10 align-middle"><span className="block h-2 rounded bg-cyan-300" style={{ width: `${sig * 100}%` }} /></span> {Math.round(sig * 100)}%
      </div>
    </div>
  );
}

const PIPE = { 1: 'M50 50 L50 0', 2: 'M50 50 L100 50', 4: 'M50 50 L50 100', 8: 'M50 50 L0 50' };
function Power({ s, upd }) {
  const tr = PZ.tracePower(s);
  return (
    <div>
      <div className="mx-auto grid w-[min(300px,100%)] gap-1" style={{ gridTemplateColumns: `repeat(${s.size}, 1fr)` }}>
        {s.tiles.map((t, i) => {
          const lit = tr.lit.has(i);
          const row = Math.floor(i / s.size);
          const col = i % s.size;
          return (
            <button
              key={i}
              onClick={() => upd((x) => PZ.rotateTile(x, i))}
              aria-label={`Rotate tile row ${row + 1} column ${col + 1}${t.hot ? ', overloaded relay' : ''}`}
              className={`relative aspect-square rounded-md border ${t.hot ? 'border-red-400/70 bg-red-900/30' : 'border-white/15 bg-white/5'} hover:bg-white/10`}
            >
              {col === 0 && row === s.srcRow && <span className="absolute -left-3 top-1/2 -translate-y-1/2 text-amber-300">▶</span>}
              {col === s.size - 1 && row === s.sinkRow && <span className="absolute -right-3 top-1/2 -translate-y-1/2 text-emerald-300">▶</span>}
              <svg viewBox="0 0 100 100" className="h-full w-full">
                {[1, 2, 4, 8].map((b) => (t.mask & b ? <path key={b} d={PIPE[b]} stroke={lit ? (t.hot ? '#ff5a4a' : '#5ff2ff') : '#7b8796'} strokeWidth="16" strokeLinecap="round" /> : null))}
                <circle cx="50" cy="50" r="10" fill={lit ? '#5ff2ff' : '#7b8796'} />
              </svg>
            </button>
          );
        })}
      </div>
      <div className={`mt-2 text-center font-mono text-[12px] ${tr.overload ? 'text-red-300' : tr.reached ? 'text-emerald-300' : 'text-slate-400'}`}>
        {tr.overload ? 'OVERLOAD: current is passing a red relay' : tr.reached ? 'LOAD POWERED' : `Current reaches ${tr.lit.size} tile${tr.lit.size === 1 ? '' : 's'}`}
      </div>
    </div>
  );
}

function Spectro({ s, upd }) {
  const W = 480;
  const H = 120;
  const lo = 0.4;
  const hi = 2.5;
  const x = (l) => ((l - lo) / (hi - lo)) * W;
  let d = '';
  for (let i = 0; i <= 200; i++) {
    const l = lo + ((hi - lo) * i) / 200;
    d += `${i ? 'L' : 'M'}${x(l).toFixed(1)} ${(H - 10 - PZ.spectrum(s.mineral, l) * (H - 30)).toFixed(1)} `;
  }
  const ok = (i) => Math.abs(s.sliders[i] - s.mineral.bands[i]) <= s.tol;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-black/40" role="img" aria-label="Measured reflectance spectrum with absorption dips">
        <path d={d} fill="none" stroke="#9fe8ff" strokeWidth="2" />
        {s.sliders.map((v, i) => (
          <line key={i} x1={x(v)} x2={x(v)} y1="4" y2={H - 4} stroke={ok(i) ? '#3dff8a' : '#ffcc33'} strokeWidth="3" />
        ))}
      </svg>
      <div className="mt-2 grid gap-1 sm:grid-cols-3">
        {s.sliders.map((v, i) => (
          <Slider key={i} label={`Laser band ${i + 1}`} value={v} min={lo} max={hi} onChange={(nv) => upd((q) => (q.sliders[i] = nv))} fmt={(val) => `${val.toFixed(2)} µm`} accent={ok(i) ? 'accent-emerald-400' : 'accent-amber-400'} />
        ))}
      </div>
      {PZ.spectroSolved(s) && (
        <p className="mt-1 text-[12px] text-emerald-200">
          Identified: <b>{s.mineral.name}</b>. {s.mineral.meaning}
        </p>
      )}
    </div>
  );
}

function Valves({ s, upd }) {
  const pct = Math.min(1, s.p / 70);
  return (
    <div>
      <div className="relative h-8 rounded bg-white/10">
        <div className="absolute top-0 h-full rounded bg-emerald-400/30" style={{ left: `${((PZ.HAB_KPA - 1.5) / 70) * 100}%`, width: `${(3 / 70) * 100}%` }} />
        <div className="absolute top-0 h-full bg-red-500/40" style={{ left: `${(PZ.RELIEF_KPA / 70) * 100}%`, right: 0 }} />
        <div className="absolute top-0 h-full rounded bg-cyan-300/70" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[12px]">
        <span>Airlock {s.p.toFixed(1)} kPa · {Math.round(s.tempC)} °C</span>
        <span className={s.hold > 0 ? 'text-emerald-300' : 'text-slate-400'}>hold {s.hold.toFixed(1)} / 2.0 s</span>
        {s.trips > 0 && <span className="text-red-300">relief trips: {s.trips}</span>}
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-3">
        <Slider label="Fast supply valve" value={s.fast} min={0} max={1} step={0.01} onChange={(v) => upd((q) => (q.fast = v))} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Trim supply valve" value={s.slow} min={0} max={1} step={0.01} onChange={(v) => upd((q) => (q.slow = v))} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Vent valve" value={s.vent} min={0} max={1} step={0.01} onChange={(v) => upd((q) => (q.vent = v))} fmt={(v) => `${Math.round(v * 100)}%`} accent="accent-red-400" />
      </div>
    </div>
  );
}

function Solar({ s, upd }) {
  const out = PZ.solarOutput(s);
  return (
    <div>
      <div className="font-mono text-[13px]">
        ARRAY OUTPUT <span className="inline-block h-3 w-48 rounded bg-white/10 align-middle"><span className="block h-3 rounded bg-amber-300" style={{ width: `${out * 100}%` }} /></span> {Math.round(out * 100)}%
      </div>
      <Slider label="Azimuth (swing)" value={((s.az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)} min={0} max={Math.PI * 2} step={0.005} onChange={(v) => upd((q) => (q.az = v))} fmt={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
      <Slider label="Tilt from horizontal" value={s.tilt} min={0} max={Math.PI / 2} step={0.005} onChange={(v) => upd((q) => (q.tilt = v))} fmt={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
      <p className="text-[11px] text-slate-400">Hint: the Sun’s shadow points away from it. Dust in the air lowers output even when aligned.</p>
    </div>
  );
}
