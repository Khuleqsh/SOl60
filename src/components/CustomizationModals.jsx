// SOL 60: RED HORIZON — title screen (game modes), pre-launch hangar customization with a live 3D
// preview + 60 s countdown + boarding/launch sequence, and the [Esc] settings modal.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GAME_MODES,
  SUIT_COLORS,
  ACCENT_TRIMS,
  VISOR_TINTS,
  BACKPACKS,
  PATCHES,
  HULL_SCHEMES,
  THRUSTER_BELLS,
  HULL_DECALS,
  FLAG_LAYOUTS,
  FLAG_COLORS,
  FLAG_EMBLEMS,
  DEFAULT_KEYS,
  KEY_LABELS,
  DEFAULT_SETTINGS,
  DEFAULT_CUSTOM,
  GRAPHICS,
  MARS,
} from '../data/nasaData.js';
import { LOADOUT_ITEMS, MASS_LIMIT, BUDGET_LIMIT, loadoutTotals, loadoutEffects, sanitizeLoadout } from '../data/scienceData.js';
import { createHangarScene, makePatchCanvas, makeFlagCanvas } from '../engine/characterAndVehicles.js';
import { audio } from '../engine/audioSynth.js';
import { ScaleNotice } from '../ui/common.jsx';

// ---------------------------------------------------------------- hangar customization
function Swatches({ list, value, onChange, field = 'hex' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.name}
          className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[12px] ${value === o.id ? 'border-amber-300 bg-amber-300/10' : 'border-white/15 hover:border-white/40'}`}
        >
          <span className="h-4 w-4 rounded-full border border-black/30" style={{ background: o[field] }} />
          {o.name}
        </button>
      ))}
    </div>
  );
}
function Choices({ list, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.desc || o.name}
          className={`rounded-lg border px-2.5 py-1 text-[12px] ${value === o.id ? 'border-amber-300 bg-amber-300/10 text-white' : 'border-white/15 text-slate-300 hover:border-white/40'}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 font-mono text-[10px] tracking-[0.2em] text-slate-400">{title}</div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- cargo loadout (12 authentic NASA items)
const STAT_COLORS = { power: '#ffd23f', comms: '#58e1ff', endurance: '#9be36a', science: '#b46bff' };
function LoadoutPanel({ loadout, onChange }) {
  const t = loadoutTotals(loadout);
  const fx = loadoutEffects(loadout);
  const toggle = (it) => {
    if (loadout.includes(it.id)) return onChange(loadout.filter((x) => x !== it.id));
    if (t.mass + it.mass > MASS_LIMIT) return audio.beep(260);
    if (t.cost + it.cost > BUDGET_LIMIT) return audio.beep(260);
    audio.ui();
    onChange([...loadout, it.id]);
  };
  const Meter = ({ label, value, max, color, unit }) => (
    <div>
      <div className="flex justify-between font-mono text-[10px] text-slate-300">
        <span>{label}</span>
        <span>
          {value}
          {unit} / {max}
          {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: value > max * 0.92 ? '#ff6a3d' : color }} />
      </div>
    </div>
  );
  return (
    <>
      <div className="mb-3 space-y-1.5 rounded-lg bg-white/5 p-2">
        <Meter label="MASS" value={t.mass} max={MASS_LIMIT} color="#9aa4b2" unit=" kg" />
        <Meter label="CREDITS" value={t.cost} max={BUDGET_LIMIT} color="#f2c230" unit=" cr" />
        <div className="grid grid-cols-4 gap-1 pt-1 text-center font-mono text-[10px]">
          {[
            ['POWER', t.power, 'power'],
            ['COMMS', t.comms, 'comms'],
            ['ENDUR.', t.endurance, 'endurance'],
            ['SCIENCE ×', fx.sciMul.toFixed(1), 'science'],
          ].map(([k, v, c]) => (
            <div key={k} className="rounded bg-black/40 py-1">
              <div className="text-slate-400">{k}</div>
              <div className="text-[13px] font-bold" style={{ color: STAT_COLORS[c] }}>
                {v}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[10px] leading-snug text-slate-400">
          Endurance adds O2 (+{fx.o2Bonus.toFixed(0)}%), net Power cuts battery drain, Comms widens the relay lock and shortens the Earth uplink, Science multiplies focus rewards.
        </div>
      </div>
      <div className="mb-2 flex gap-2">
        <button onClick={() => onChange(sanitizeLoadout(DEFAULT_CUSTOM.loadout))} className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10">
          Recommended
        </button>
        <button onClick={() => onChange([])} className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/10">
          Clear
        </button>
      </div>
      <div className="grid gap-1.5">
        {LOADOUT_ITEMS.map((it) => {
          const on = loadout.includes(it.id);
          const blocked = !on && (t.mass + it.mass > MASS_LIMIT || t.cost + it.cost > BUDGET_LIMIT);
          return (
            <button
              key={it.id}
              onClick={() => toggle(it)}
              className={`rounded-lg border px-2.5 py-1.5 text-left ${on ? 'border-amber-300 bg-amber-300/10' : blocked ? 'border-white/10 opacity-45' : 'border-white/15 hover:border-white/40'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-white">{it.name}</span>
                <span className="font-mono text-[10px] text-slate-400">
                  {it.mass} kg · {it.cost} cr
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                Solves: {it.solves} · {it.note} <span className="text-slate-500">({it.heritage})</span>
              </div>
              <div className="mt-0.5 flex gap-2 font-mono text-[10px]">
                {['power', 'comms', 'endurance', 'science'].map((k) =>
                  it[k] ? (
                    <span key={k} style={{ color: STAT_COLORS[k] }}>
                      {k.slice(0, 4).toUpperCase()} {it[k] > 0 ? '+' : ''}
                      {it[k]}
                    </span>
                  ) : null,
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function HangarStage({ custom, setCustom, onLaunched, onBack }) {
  const box = useRef(null);
  const sceneRef = useRef(null);
  const [tab, setTab] = useState('loadout');
  const [left, setLeft] = useState(60);
  const [boarding, setBoarding] = useState(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    let sc = null;
    try {
      sc = createHangarScene(box.current, custom);
    } catch (err) {
      console.warn('Hangar preview unavailable', err);
    }
    sceneRef.current = sc;
    return () => {
      sc?.dispose();
      sceneRef.current = null;
    };
    // the scene is created once; customization changes are pushed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lastVisual = useRef('');
  useEffect(() => {
    // the 3D preview only rebuilds when a visual option changes (not when cargo is toggled)
    const { loadout, ...visual } = custom;
    const key = JSON.stringify(visual);
    if (key === lastVisual.current) return;
    lastVisual.current = key;
    sceneRef.current?.setCustom(custom);
  }, [custom]);
  useEffect(() => {
    sceneRef.current?.setView(tab);
  }, [tab]);

  const launch = () => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    audio.init();
    audio.hatch();
    setBoarding('Commander boarding the Ares-7 lander…');
    const sc = sceneRef.current;
    if (!sc) {
      onLaunched();
      return;
    }
    sc.startBoarding(
      () => onLaunched(),
      (ev) => {
        if (ev === 'sealed') {
          audio.hatch();
          setBoarding('Hatch sealed. Cabin pressure nominal.');
        }
        if (ev === 'ignition') {
          audio.thud(2);
          setBoarding('Ignition… liftoff! Next stop: Gale Crater, Mars.');
        }
      },
    );
  };

  useEffect(() => {
    if (boarding) return undefined;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [boarding]);
  useEffect(() => {
    if (left === 0) launch();
    else if (left <= 5) audio.beep(900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const set = (k) => (v) => {
    audio.ui();
    setCustom({ ...custom, [k]: v });
  };
  const patchUrls = useMemo(() => {
    const accent = ACCENT_TRIMS.find((a) => a.id === custom.accent)?.hex || '#d62b2b';
    return Object.fromEntries(PATCHES.map((p) => [p.id, makePatchCanvas(p.id, accent, 96).toDataURL()]));
  }, [custom.accent]);
  const flagUrl = useMemo(() => makeFlagCanvas(custom, 192, 120).toDataURL(), [custom]);

  return (
    <div className="absolute inset-0 bg-black text-slate-100">
      <div ref={box} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="rounded-lg bg-black/50 px-3 py-2 backdrop-blur">
          <div className="font-mono text-[10px] tracking-[0.3em] text-amber-300">STAGE 1 · EARTH BUNKER HANGAR</div>
          <div className="text-lg font-bold">Pre-launch bunker: buy your mission loadout</div>
        </div>
        <div className={`rounded-lg px-4 py-2 text-right font-mono backdrop-blur ${left <= 10 ? 'bg-red-600/50' : 'bg-black/50'}`}>
          <div className="text-[10px] tracking-[0.3em] text-slate-300">T-MINUS</div>
          <div className="text-3xl font-black tabular-nums">00:{String(left).padStart(2, '0')}</div>
        </div>
      </div>

      {boarding ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center">
          <div className="rounded-lg bg-black/60 px-5 py-2 font-mono text-[14px] tracking-wide text-amber-100 backdrop-blur">{boarding}</div>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 top-24 flex w-[min(420px,100vw)] flex-col p-4">
          <div className="flex gap-1">
            {[
              ['astronaut', 'Astronaut'],
              ['lander', 'Lander'],
              ['flag', 'Mission Flag'],
              ['loadout', 'Bunker Loadout'],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`flex-1 rounded-t-lg px-3 py-2 text-[13px] font-semibold ${tab === id ? 'bg-black/75 text-amber-200' : 'bg-black/40 text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto rounded-b-lg rounded-tr-lg bg-black/75 p-4 backdrop-blur">
            {tab === 'astronaut' && (
              <>
                <Section title="SUIT PRIMARY COLOR">
                  <Swatches list={SUIT_COLORS} value={custom.suit} onChange={set('suit')} />
                </Section>
                <Section title="ACCENT TRIM">
                  <Swatches list={ACCENT_TRIMS} value={custom.accent} onChange={set('accent')} />
                </Section>
                <Section title="REFLECTIVE VISOR TINT">
                  <Swatches list={VISOR_TINTS} value={custom.visor} onChange={set('visor')} />
                </Section>
                <Section title="BACKPACK MODULE">
                  <Choices list={BACKPACKS} value={custom.backpack} onChange={set('backpack')} />
                  <div className="mt-1 text-[11px] text-slate-400">{BACKPACKS.find((b) => b.id === custom.backpack)?.desc}</div>
                </Section>
                <Section title="MISSION PATCH">
                  <div className="flex flex-wrap gap-2">
                    {PATCHES.map((p) => (
                      <button key={p.id} onClick={() => set('patch')(p.id)} title={p.name} className={`rounded-full border-2 p-0.5 ${custom.patch === p.id ? 'border-amber-300' : 'border-transparent hover:border-white/30'}`}>
                        <img src={patchUrls[p.id]} alt={p.name} className="h-14 w-14 rounded-full" />
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            )}
            {tab === 'lander' && (
              <>
                <Section title="HULL PAINT SCHEME">
                  <Swatches list={HULL_SCHEMES} value={custom.hull} onChange={set('hull')} field="band" />
                </Section>
                <Section title="THRUSTER BELL DESIGN">
                  <Choices list={THRUSTER_BELLS} value={custom.bell} onChange={set('bell')} />
                </Section>
                <Section title="HULL DECALS">
                  <Choices list={HULL_DECALS} value={custom.decal} onChange={set('decal')} />
                </Section>
              </>
            )}
            {tab === 'loadout' && (
              <>
                <div className="mb-2 text-[11px] text-slate-300"><b className="text-amber-200">60 seconds, 100 credits.</b> Every item fixes one painful mission problem, and you cannot afford them all. Choose before the countdown ends.</div>
                <ScaleNotice compact className="mb-2" />
                <LoadoutPanel loadout={sanitizeLoadout(custom.loadout)} onChange={(l) => setCustom({ ...custom, loadout: l })} />
              </>
            )}
            {tab === 'flag' && (
              <>
                <img src={flagUrl} alt="Mission flag preview" className="mb-3 w-full max-w-[240px] rounded shadow-lg" />
                <Section title="STRIPE LAYOUT">
                  <Choices list={FLAG_LAYOUTS} value={custom.flagLayout} onChange={set('flagLayout')} />
                </Section>
                {['Primary', 'Field', 'Secondary'].map((label, i) => (
                  <Section key={label} title={`${label.toUpperCase()} COLOR`}>
                    <div className="flex flex-wrap gap-1.5">
                      {FLAG_COLORS.map((c) => (
                        <button
                          key={c}
                          aria-label={`${label} ${c}`}
                          onClick={() => {
                            const fc = [...custom.flagColors];
                            fc[i] = c;
                            set('flagColors')(fc);
                          }}
                          className={`h-7 w-7 rounded-md border-2 ${custom.flagColors[i] === c ? 'border-amber-300' : 'border-white/15'}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </Section>
                ))}
                <Section title="EMBLEM ICON">
                  <Choices list={FLAG_EMBLEMS} value={custom.flagEmblem} onChange={set('flagEmblem')} />
                </Section>
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={onBack} className="rounded-lg border border-white/20 bg-black/50 px-4 py-2.5 text-[13px] hover:bg-white/10">
              ← Back
            </button>
            <button onClick={launch} className="flex-1 rounded-lg bg-amber-400 px-4 py-2.5 text-[14px] font-black tracking-wide text-black hover:bg-amber-300">
              BOARD & LAUNCH NOW
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

