// SOL 60 — post-mission debrief: outcome, stats with NASA sources, What-If simulator, Captain's Log, citations.

import { useMemo, useState } from 'react';
import { CITATIONS, ENDINGS, LEGACY_ENDINGS, BACKPACKS, byId } from '../data/nasaData.js';
import { LOADOUT_ITEMS, MASS_LIMIT, BUDGET_LIMIT, loadoutEffects, loadoutTotals } from '../data/scienceData.js';
import { SOURCES } from '../data/nasaDatasets.js';
import { ScaleNotice, SourceLink } from './common.jsx';

// ---------------------------------------------------------------- Debrief
function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function whatIf(stats, p, fx) {
  const ascent = Math.max(180, stats.ascentTime || 360);
  const seg = ascent / 3; // base -> ledge C -> ledge D -> summit
  const drain = 0.2 * 1.45 * p.storm * (p.rover ? 0.92 : 1);
  // the cargo loadout feeds the model: Endurance adds oxygen, net Power keeps the suit heaters running
  const o2Cap = p.o2Cap * (1 + fx.o2Bonus / 100);
  const insulation = p.insulation * (1 + Math.max(0, fx.totals.power) * 0.05);
  const o2Start = Math.min(o2Cap, o2Cap * 0.7 + p.crops * 6);
  const o2Margin = o2Start - seg * drain;
  const warmMargin = 100 - (seg * 0.16 * p.storm) / insulation;
  const worst = Math.min(o2Margin, warmMargin);
  const survival = 1 / (1 + Math.exp(-worst / 9));
  return { o2Margin, warmMargin, survival, seg };
}

export default function Debrief({ result, onRestart, onTitle }) {
  const s = result.stats;
  const bp = byId(BACKPACKS, result.custom?.backpack || 'plss');
  const [p, setP] = useState({ o2Cap: bp.o2Cap, insulation: 1, crops: s.harvests || 0, rover: !!s.roverRepaired, storm: 1 });
  const [swap, setSwap] = useState(result.loadout || []);
  const [copied, setCopied] = useState('');
  const swapFx = useMemo(() => loadoutEffects(swap), [swap]);
  const baseFx = useMemo(() => loadoutEffects(result.loadout || []), [result.loadout]);
  const sim = useMemo(() => whatIf(s, p, swapFx), [s, p, swapFx]);
  const actual = useMemo(() => whatIf(s, { o2Cap: bp.o2Cap, insulation: 1, crops: s.harvests || 0, rover: !!s.roverRepaired, storm: 1 }, baseFx), [s, bp.o2Cap, baseFx]);
  const swapTotals = loadoutTotals(swap);
  const toggleSwap = (id) => {
    if (swap.includes(id)) return setSwap(swap.filter((x) => x !== id));
    const it = LOADOUT_ITEMS.find((i) => i.id === id);
    if (swapTotals.mass + it.mass > MASS_LIMIT || swapTotals.cost + it.cost > BUDGET_LIMIT) return;
    setSwap([...swap, id]);
  };
  const sci = result.science || { preserved: 0, salvaged: 0, sherloc: false, pioneers: 0 };
  const legacy = sci.preserved + sci.salvaged === 0 ? LEGACY_ENDINGS.none : sci.salvaged === 0 ? LEGACY_ENDINGS.mesh : sci.preserved === 0 ? LEGACY_ENDINGS.salvage : LEGACY_ENDINGS.mixed;
  const end = ENDINGS[result.outcome] || ENDINGS.lost;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const cites = CITATIONS.map((c, i) => `[${i + 1}] ${c.text} ${c.url}`).join('\n');
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#2a1208,#05070c_70%)] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="font-mono text-[11px] tracking-[0.3em] text-amber-300">STAGE 4 · POST-MISSION DEBRIEF</div>
        <h1 className={`mt-1 text-4xl font-black tracking-tight ${result.outcome === 'lost' ? 'text-red-400' : 'text-white'}`}>{end.title}</h1>
        <p className="mt-2 max-w-2xl text-slate-300">{end.text}</p>
        <p className="mt-2 max-w-2xl rounded-lg border border-cyan-300/25 bg-cyan-400/5 px-3 py-2 text-[13px] text-cyan-100">{legacy}</p>
        <ScaleNotice className="mt-4" />

        <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="mb-2 font-mono text-[11px] tracking-widest text-slate-400">MARS SELFIE</div>
            {result.selfie ? (
              <>
                <img src={result.selfie} alt="Mars selfie captured at the end of the mission" className="w-full rounded-lg" />
                <a href={result.selfie} download="sol60-mars-selfie.png" className="mt-2 inline-block rounded bg-amber-400 px-3 py-1.5 text-[12px] font-bold text-black hover:bg-amber-300">
                  Download PNG
                </a>
              </>
            ) : (
              <div className="grid h-40 place-items-center text-slate-500">No selfie captured.</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 self-start">
            {[
              ['Mission time', fmt(s.time)],
              ['Sols survived', s.sols],
              ['Distance', `${(s.distance / 1000).toFixed(2)} km`],
              ['Max altitude', `${Math.round(s.maxAlt)} m`, SOURCES.molaOlympus],
              ['Repairs', s.repairs],
              ['Crops harvested', s.harvests],
              ['Hazards survived', s.hazards, SOURCES.insight],
              ['Radiation dose', `${s.rad.toFixed(1)} mSv`, SOURCES.curiosity],
              ['Structures built', s.built],
              ['Pioneers found', `${s.echoes}/4`],
              ['Ghost Mesh nodes', sci.preserved],
              ['Pioneers salvaged', sci.salvaged],
              ['Bright Angel scan', sci.sherloc ? 'Organics found' : 'Not scanned'],
              ['Science score', Math.round(s.sciScore || 0)],
              ['Puzzles solved', s.puzzles || 0],
              ['Cliff bands climbed', s.climbs || 0],
            ].map(([k, v, src]) => (
              <div key={k} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <div className="font-mono text-[10px] tracking-wider text-slate-400">{k.toUpperCase()}</div>
                <div className="text-lg font-bold">{v}</div>
                {src && <SourceLink source={src} className="text-[10px]">NASA reference</SourceLink>}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="font-mono text-[11px] tracking-widest text-slate-400">CAPTAIN'S LOG</div>
            <ol className="mt-2 max-h-80 list-none space-y-1.5 overflow-y-auto pl-0 text-[12px]">
              {result.log.map((l, i) => (
                <li key={i} className="flex gap-2 border-l-2 border-amber-400/40 pl-2">
                  <span className="shrink-0 font-mono text-amber-200/80">SOL {l.sol} {l.clock}</span>
                  <span className="text-slate-200">{l.text}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="font-mono text-[11px] tracking-widest text-slate-400">WHAT-IF SIMULATOR · OLYMPUS ASCENT</div>
            <p className="mt-1 text-[11px] text-slate-400">A simplified life-support model using your recorded ascent pace ({fmt(s.ascentTime || 360)}). Change the loadout and see the survival margin on the longest leg between ledge shelters.</p>
            <div className="mt-3 space-y-2 text-[12px]">
              {[
                ['O2 tank capacity', 'o2Cap', 80, 140, 5, (v) => `${v}%`],
                ['Suit insulation', 'insulation', 0.6, 1.6, 0.1, (v) => `×${v.toFixed(1)}`],
                ['Crops harvested', 'crops', 0, 8, 1, (v) => v],
                ['Storm severity', 'storm', 0.5, 2, 0.1, (v) => `×${v.toFixed(1)}`],
              ].map(([label, key, min, max, step, f]) => (
                <label key={key} className="flex items-center gap-2">
                  <span className="w-32 text-slate-300">{label}</span>
                  <input type="range" min={min} max={max} step={step} value={p[key]} onChange={(e) => setP({ ...p, [key]: Number(e.target.value) })} className="flex-1 accent-amber-400" />
                  <span className="w-12 text-right font-mono">{f(p[key])}</span>
                </label>
              ))}
              <div>
                <div className="mb-1 flex items-center justify-between text-slate-300">
                  <span>Swap loadout items</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {swapTotals.mass}/{MASS_LIMIT} kg · ${swapTotals.cost}/{BUDGET_LIMIT}M
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {LOADOUT_ITEMS.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => toggleSwap(it.id)}
                      title={it.note}
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${swap.includes(it.id) ? 'border-amber-300 bg-amber-300/15 text-amber-100' : 'border-white/15 text-slate-400 hover:border-white/40'}`}
                    >
                      {it.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={p.rover} onChange={(e) => setP({ ...p, rover: e.target.checked })} className="accent-amber-400" />
                <span className="text-slate-300">Rover repaired (arrive at the base fresher)</span>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ['O2 margin', `${Math.round(sim.o2Margin)}%`, sim.o2Margin - actual.o2Margin],
                ['Warmth margin', `${Math.round(sim.warmMargin)}%`, sim.warmMargin - actual.warmMargin],
                ['Survival', `${Math.round(sim.survival * 100)}%`, (sim.survival - actual.survival) * 100],
              ].map(([k, v, d]) => (
                <div key={k} className="rounded-lg bg-white/5 p-2">
                  <div className="font-mono text-[10px] text-slate-400">{k.toUpperCase()}</div>
                  <div className="text-lg font-bold">{v}</div>
                  <div className={`font-mono text-[10px] ${d >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {d >= 0 ? '+' : ''}
                    {Math.round(d)} vs. your run
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[11px] tracking-widest text-slate-400">NASA SOURCES & CITATIONS</div>
            <button
              className="rounded bg-cyan-400 px-3 py-1.5 text-[12px] font-bold text-black hover:bg-cyan-300"
              onClick={() => copyText(cites).then((ok) => setCopied(ok ? 'Copied!' : 'Copy failed'))}
            >
              {copied || 'Copy NASA Citations'}
            </button>
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] text-slate-300">
            {CITATIONS.map((c) => (
              <li key={c.text}>
                {c.text}{' '}
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">
                  source ↗
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-slate-500">Terrain, weather and hazards are procedural models shaped by these sources, not raw mission data. Olympus Mons and Gale Crater are scaled and placed together for gameplay.</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={onRestart} className="rounded-lg bg-amber-400 px-5 py-2.5 font-bold text-black hover:bg-amber-300">
            Fly again
          </button>
          <button onClick={onTitle} className="rounded-lg border border-white/20 px-5 py-2.5 font-semibold hover:bg-white/10">
            Title screen
          </button>
        </div>
      </div>
    </div>
  );
}
