import { useEffect, useState } from 'react';
import { DEFAULT_KEYS, KEY_LABELS, GRAPHICS } from '../data/nasaData.js';
import { KeyCap, keyLabel } from './common.jsx';

// ---------------------------------------------------------------- settings
export function SettingsModal({ settings, setSettings, keys, setKeys, onClose, onQuit }) {
  const [tab, setTab] = useState('controls');
  const [listening, setListening] = useState(null);

  useEffect(() => {
    if (!listening) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      const next = { ...keys };
      const clash = Object.keys(next).find((k) => next[k] === e.code && k !== listening);
      if (clash) next[clash] = keys[listening];
      next[listening] = e.code;
      setKeys(next);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, keys, setKeys]);

  useEffect(() => {
    const onEsc = (e) => {
      if (e.code === 'Escape' && !listening) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [listening, onClose]);

  const s = settings;
  const upd = (k, v) => setSettings({ ...s, [k]: v });
  return (
    <div role="dialog" aria-modal="true" aria-label="Settings" className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-[min(680px,100%)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0a1119] text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-lg">Settings</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close settings">
            ✕
          </button>
        </div>
        <div className="flex gap-1 border-b border-white/10 px-4 pt-2">
          {[
            ['controls', 'Keybinds'],
            ['graphics', 'Graphics'],
            ['audio', 'Audio'],
            ['access', 'Accessibility'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-t-md px-3 py-1.5 text-[13px] ${tab === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-[13px]">
          {tab === 'controls' && (
            <>
              <div className="grid gap-1 sm:grid-cols-2">
                {Object.keys(DEFAULT_KEYS).map((k) => (
                  <button
                    key={k}
                    onClick={() => setListening(k)}
                    className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-left ${listening === k ? 'border-amber-300 bg-amber-300/10' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <span className="text-slate-300">{KEY_LABELS[k]}</span>
                    {listening === k ? <span className="font-mono text-[11px] text-amber-200">press a key…</span> : <KeyCap>{keyLabel(keys[k])}</KeyCap>}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-[12px] text-slate-400">
                <span>Mouse: click the view to capture, move to look, wheel to zoom. Digits 1/2 pick build items.</span>
                <button onClick={() => setKeys({ ...DEFAULT_KEYS })} className="rounded border border-white/20 px-2 py-1 hover:bg-white/10">
                  Reset
                </button>
              </div>
              <label className="mt-4 flex items-center gap-3">
                <span className="w-36 text-slate-300">Mouse sensitivity</span>
                <input type="range" min="0.3" max="2" step="0.1" value={s.sensitivity} onChange={(e) => upd('sensitivity', Number(e.target.value))} className="flex-1 accent-amber-400" />
                <span className="w-10 text-right font-mono">{s.sensitivity.toFixed(1)}</span>
              </label>
            </>
          )}
          {tab === 'graphics' && (
            <>
              <div className="mb-1 font-mono text-[10px] tracking-[0.2em] text-slate-400">GRAPHICS PRESET</div>
              <div className="flex gap-2">
                {Object.entries(GRAPHICS).map(([id, g]) => (
                  <button key={id} onClick={() => upd('graphics', id)} className={`flex-1 rounded-lg border px-3 py-2 ${s.graphics === id ? 'border-amber-300 bg-amber-300/10' : 'border-white/15 hover:border-white/40'}`}>
                    <div className="font-bold">{g.label}</div>
                    <div className="text-[11px] text-slate-400">
                      {g.shadows ? `${g.shadowSize}px shadows` : 'no shadows'} · {g.rocks} rocks
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Terrain detail and rock count apply on the next mission; resolution, shadows and FOV apply now.</p>
              <label className="mt-4 flex items-center gap-3">
                <span className="w-36 text-slate-300">Resolution scale</span>
                <input type="range" min="0.5" max="1" step="0.05" value={s.resScale} onChange={(e) => upd('resScale', Number(e.target.value))} className="flex-1 accent-amber-400" />
                <span className="w-12 text-right font-mono">{Math.round(s.resScale * 100)}%</span>
              </label>
              <label className="mt-3 flex items-center gap-3">
                <span className="w-36 text-slate-300">Field of view</span>
                <input type="range" min="50" max="90" step="1" value={s.fov} onChange={(e) => upd('fov', Number(e.target.value))} className="flex-1 accent-amber-400" />
                <span className="w-12 text-right font-mono">{s.fov}°</span>
              </label>
            </>
          )}
          {tab === 'access' && (
            <div className="space-y-3">
              {[
                ['reducedMotion', 'Reduced motion', 'Damps camera shake during sandstorms, marsquakes, launches and the sky-crane descent to about 12%, and stops pulsing HUD animations. Follows your OS setting by default.'],
                ['captions', 'Visual beacon HUD + Morse captions', 'Shows a bearing arc to each pioneer beacon, a waveform that pulses with every dit and dah, and the decoded callsign as live text, so the beacons never depend on sound.'],
                ['touchControls', 'On-screen touch controls', 'Virtual thumbstick, Jump / Use / Sprint / Piton / Let-go buttons, and drag-to-look for tablets and touch laptops.'],
              ].map(([k, label, desc]) => (
                <label key={k} className="flex items-start gap-3">
                  <input type="checkbox" checked={!!s[k]} onChange={(e) => upd(k, e.target.checked)} className="mt-1 h-4 w-4 accent-amber-400" />
                  <span>
                    <span className="font-semibold">{label}</span>
                    <span className="block text-[12px] text-slate-400">{desc}</span>
                  </span>
                </label>
              ))}
              <p className="text-[12px] text-slate-400">Every puzzle works with mouse, trackpad, touch or keyboard (Tab, arrows). No control needs a middle mouse button: drag or click to look, wheel or + / − to zoom.</p>
            </div>
          )}
          {tab === 'audio' && (
            <>
              <label className="flex items-center gap-3">
                <span className="w-36 text-slate-300">Master volume</span>
                <input type="range" min="0" max="1" step="0.05" value={s.volume} onChange={(e) => upd('volume', Number(e.target.value))} className="flex-1 accent-amber-400" />
                <span className="w-12 text-right font-mono">{Math.round(s.volume * 100)}%</span>
              </label>
              <label className="mt-4 flex items-start gap-3">
                <input type="checkbox" checked={s.marsFilter} onChange={(e) => upd('marsFilter', e.target.checked)} className="mt-1 accent-amber-400" />
                <span>
                  <span className="font-semibold">Martian CO₂ atmosphere filter</span>
                  <span className="block text-[12px] text-slate-400">Mars' thin CO₂ air damps high frequencies, as Perseverance's microphones recorded. Muffles the soundscape accordingly.</span>
                </span>
              </label>
            </>
          )}
        </div>
        <div className="flex justify-between border-t border-white/10 px-5 py-3">
          {onQuit ? (
            <button onClick={onQuit} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-[13px] text-red-300 hover:bg-red-500/10">
              Abort to title
            </button>
          ) : (
            <span />
          )}
          <button onClick={onClose} className="rounded-lg bg-amber-400 px-4 py-1.5 text-[13px] font-bold text-black hover:bg-amber-300">
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}
