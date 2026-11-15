// SOL 60 — title screen: 60-Second Judge Path, game modes, supported inputs, WebGL status, scale disclosure.

import { useMemo } from 'react';
import { GAME_MODES, MARS } from '../data/nasaData.js';
import { audio } from '../engine/audioSynth.js';
import { detectWebGL } from '../logic/webgl.js';
import { ScaleNotice } from './common.jsx';

const INPUTS = [
  ['Keyboard', 'WASD move · Space jump / climb-leap · Shift sprint · E interact · T place piton · V crouch / let go · B build · I Codex · N NASA data overlay · Esc settings'],
  ['Mouse / trackpad', 'Click or drag to look (no middle button needed) · wheel or + / − to zoom · left click places builds'],
  ['Touch', 'On-screen thumbstick, Jump / Interact / Sprint buttons, drag anywhere to look (enable in Settings or auto on tablets)'],
  ['Accessibility', 'Visual beacon bearing + live Morse captions · reduced-motion mode (follows your OS) · all puzzles work with mouse or touch'],
];

export function TitleScreen({ onStart, onSettings }) {
  const gl = useMemo(() => detectWebGL(), []);
  const go = (id) => {
    audio.init();
    audio.ui();
    onStart(id);
  };
  return (
    <main className="title-bg absolute inset-0 overflow-y-auto text-slate-100">
      <div className="stars" aria-hidden="true" />
      <div className="mars-disc" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col justify-center px-4 py-8">
        <div className="font-mono text-[11px] tracking-[0.35em] text-amber-300">NASA SPACE APPS CHALLENGE 2026</div>
        <h1 className="mt-2 text-5xl font-black leading-none tracking-tight sm:text-7xl">
          SOL 60
          <span className="block bg-gradient-to-r from-orange-400 via-amber-300 to-sky-300 bg-clip-text text-transparent">RED HORIZON</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] text-slate-300">
          <b className="text-white">Echoes of Ares-7.</b> Year 2034. Stranded alone in Gale Crater, {MARS.earthDelayLabel} from Earth, with a planet-wide storm rising. Restore power,
          keep your rover charged, call home, and climb Olympus Mons to the rescue rocket.
        </p>

        {!gl.ok && (
          <div role="alert" className="mt-4 rounded-lg border border-red-400/60 bg-red-900/40 px-3 py-2 text-[13px] text-red-100">
            <b>3D unavailable:</b> {gl.reason} Enable hardware acceleration or try a current Chrome, Edge, Firefox or Safari. Menus, Codex and citations still work.
          </div>
        )}

        <button
          onClick={() => go('tour')}
          disabled={!gl.ok}
          className="mt-6 flex w-full items-center justify-between gap-4 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-400/30 to-orange-500/20 px-5 py-4 text-left shadow-[0_0_40px_rgba(255,190,60,0.25)] transition hover:from-amber-400/45 disabled:opacity-40"
          aria-describedby="judge-desc"
        >
          <span>
            <span className="block font-mono text-[11px] tracking-[0.3em] text-amber-200">FOR JUDGES · NO SETUP</span>
            <span className="block text-2xl font-black text-white">▶ 60-Second Judge Path (Quick-Tour)</span>
            <span id="judge-desc" className="mt-1 block text-[13px] text-amber-50/90">
              Autopiloted showcase: landing, power-routing and spectroscopy puzzles, rover energy drive, live NASA data overlay, marsquake rockfall, and the Olympus Mons climb.
            </span>
          </span>
          <span className="hidden rounded-full bg-amber-300 px-4 py-2 font-black text-black sm:block">60 s</span>
        </button>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {GAME_MODES.map((m, i) =>
            m.variants ? (
              <div key={m.id} className="rounded-xl border border-white/15 bg-black/40 p-4 text-left backdrop-blur">
                <div className="font-mono text-[11px] tracking-widest text-amber-300">MODE {i + 1}</div>
                <div className="mt-1 text-lg font-bold">{m.name}</div>
                <div className="mt-1 text-[12px] text-slate-400">{m.desc}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.variants.map((v) => (
                    <button key={v.id} disabled={!gl.ok} onClick={() => go(v.id)} className="rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-1.5 text-[12px] font-semibold text-amber-100 hover:bg-amber-400/25 disabled:opacity-40">
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                key={m.id}
                disabled={!gl.ok}
                onClick={() => go(m.id)}
                className="group rounded-xl border border-white/15 bg-black/40 p-4 text-left backdrop-blur transition hover:border-amber-300/70 hover:bg-amber-400/10 disabled:opacity-40"
              >
                <div className="font-mono text-[11px] tracking-widest text-amber-300">MODE {i + 1}</div>
                <div className="mt-1 text-lg font-bold group-hover:text-amber-200">{m.name}</div>
                <div className="mt-1 text-[12px] text-slate-400">{m.desc}</div>
              </button>
            ),
          )}
        </div>

        <ScaleNotice className="mt-5" />

        <section aria-label="Supported inputs" className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3 text-[12px] text-slate-300">
          <div className="mb-1 font-mono text-[10px] tracking-[0.25em] text-slate-400">SUPPORTED INPUTS</div>
          <dl className="grid gap-1 sm:grid-cols-[130px_1fr]">
            {INPUTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-white">{k}</dt>
                <dd className="mb-1 sm:mb-0">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
          <button onClick={onSettings} className="rounded-lg border border-white/20 px-3 py-1.5 text-slate-200 hover:bg-white/10">
            ⚙ Settings, accessibility & keybinds
          </button>
          <span>{gl.ok ? `WebGL ${gl.version} ready` : 'WebGL not detected'} · Mars gravity 3.72 m/s² (0.38 g)</span>
        </div>
      </div>
    </main>
  );
}
