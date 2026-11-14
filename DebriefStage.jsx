import { useEffect, useMemo, useRef, useState } from 'react';
import { ITEMS, ITEM_BY_ID, LAYERS, MODES } from '../game/data.js';
import { simulate } from '../game/sim.js';
import { buildDebrief } from '../game/debrief.js';
import { MSR_CLASSES, citationsText } from '../systems/nasaDataIntegrations.js';
import { audio } from '../audio/audio.js';
import { Btn, Panel, Tag, CopyButton, PatchImg } from './common.jsx';

const SERIES = [
  { k: 'power', name: 'Power', color: '#fbbf24' },
  { k: 'o2', name: 'Oxygen', color: '#35d6ff' },
  { k: 'rad', name: 'Radiation', color: '#e23bd0' },
  { k: 'focus', name: 'Crew Focus', color: '#a78bfa' },
  { k: 'science', name: 'Science Data', color: '#3dff8a' },
];

function TelemetryChart({ a, b }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const pad = { l: 40, r: 46, t: 14, b: 26 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const X = (T) => pad.l + (T / 6) * pw;
    const sciMax = Math.max(500, ...a.history.map((h) => h.science), ...(b ? b.history.map((h) => h.science) : [0]));
    const Y = (k, v) => pad.t + ph - (Math.max(0, Math.min(1, k === 'science' ? v / sciMax : v / 100))) * ph;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, 0, W, H);
    // storm shading
    a.weather.forEach((w) => {
      if (w.storm > 0) {
        ctx.fillStyle = `rgba(224,154,69,${0.1 + w.storm * 0.14})`;
        ctx.fillRect(X(w.sol - 1), pad.t, pw / 6, ph);
      }
    });
    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(X(i), pad.t);
      ctx.lineTo(X(i), pad.t + ph);
      ctx.stroke();
      if (i < 6) ctx.fillText(`SOL ${i + 1}`, X(i) + 6, H - 8);
    }
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
      ctx.fillText(`${100 - i * 25}%`, 6, y + 4);
      ctx.fillText(`${Math.round(sciMax * (1 - i / 4))}`, W - pad.r + 6, y + 4);
    }
    const draw = (run, dashed) => {
      for (const s of SERIES) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = dashed ? 1.5 : 2;
        ctx.setLineDash(dashed ? [5, 4] : []);
        ctx.globalAlpha = dashed ? 0.95 : b ? 0.45 : 1;
        ctx.beginPath();
        run.history.forEach((h, i) => {
          const x = X(h.T);
          const y = Y(s.k, h[s.k] ?? 0);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };
    draw(a, false);
    if (b) draw(b, true);
    // event marks for the primary run
    ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
    (b || a).marks.forEach((m, i) => {
      const x = X(m.T);
      ctx.strokeStyle = m.tone === 'crimson' ? '#ff2e3e' : m.tone === 'amber' ? '#ffb020' : '#35d6ff';
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + 8 + (i % 6) * 10);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(m.label, x + 2, pad.t + 9 + (i % 6) * 10);
    });
    const end = (b || a).endT;
    if (end < 5.5) {
      ctx.strokeStyle = '#ff2e3e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(end), pad.t);
      ctx.lineTo(X(end), pad.t + ph);
      ctx.stroke();
    }
  }, [a, b]);
  return (
    <div className="chart">
      <canvas ref={ref} width={860} height={300} />
      <div className="legend">
        {SERIES.map((s) => (
          <span key={s.k}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        {b && <span className="dash">- - - What-If run · solid = actual</span>}
      </div>
    </div>
  );
}

function composeSelfie(frame, { patchCanvas, d, team }) {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a0d08';
  ctx.fillRect(0, 0, c.width, c.height);
  if (frame && frame.width) {
    const k = Math.max(c.width / frame.width, c.height / frame.height);
    const w = frame.width * k;
    const h = frame.height * k;
    ctx.drawImage(frame, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }
  const g = ctx.createLinearGradient(0, c.height - 190, 0, c.height);
  g.addColorStop(0, 'rgba(2,6,14,0)');
  g.addColorStop(1, 'rgba(2,6,14,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, c.height - 190, c.width, 190);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, c.width - 10, c.height - 10);
  if (patchCanvas) ctx.drawImage(patchCanvas, 34, c.height - 176, 150, 150);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('GREETINGS FROM MOUNT SHARP, MARS', 206, c.height - 128);
  ctx.font = 'bold 22px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = '#fbbf24';
  const sols = d.win ? 6 : d.deathSol;
  ctx.fillText(`SOL SURVIVED ${sols}/6   ·   SCIENCE SCORE ${d.score}   ·   MSR GRADE ${d.msr.grade}`, 206, c.height - 90);
  ctx.fillStyle = '#7fe9ff';
  ctx.font = '16px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(d.blueprint.slice(0, 96), 206, c.height - 58);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`${(team || 'TEAM ARES').toUpperCase()} · SOL 60: RED HORIZON · NASA SPACE APPS 2026`, 206, c.height - 32);
  return c;
}

export function DebriefStage({ d, params, record, contained, ctx, frame, patchCanvas, patchUrl, team, onRelaunch, onTitle, onArchive }) {
  const [tab, setTab] = useState('analysis');
  const [out, setOut] = useState(null);
  const [inn, setInn] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const caps = MODES[params.mode].caps;

  useEffect(() => {
    if (d.win) audio.success();
  }, [d.win]);

  const whatIf = useMemo(() => {
    if (!out || !inn) return null;
    const packed = params.packed.map((id) => (id === out ? inn : id));
    const s2 = simulate({ ...params, packed, damaged: packed.includes(params.damaged) ? params.damaged : null }, record, { contained });
    const d2 = buildDebrief(s2, ctx);
    return { d: d2, over: caps && (d2.mass > params.vehicle.maxMass || d2.cost > params.vehicle.budget) };
  }, [out, inn, params, record, contained, ctx, caps]);

  const left = ITEMS.filter((i) => !params.packed.includes(i.id));
  const citeText = citationsText(d.citations, { blueprint: d.blueprint });
  const takeSelfie = () => {
    const c = composeSelfie(frame, { patchCanvas, d, team });
    let url = '';
    try {
      url = c.toDataURL('image/png');
    } catch {
      url = '';
    }
    setSelfie(url);
    audio.shutter();
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sol60-mars-selfie.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <div className={`debrief ${d.win ? 'win' : 'loss'}`}>
      <header className="debrief-head">
        <PatchImg src={patchUrl} size={72} />
        <div>
          <div className="eyebrow">NASA MISSION CONTROL · POST-MISSION ENGINEERING ANALYSIS</div>
          <h1>{d.headline}</h1>
          <div className="mono sub">
            {d.causeLabel} · {d.rank}
          </div>
        </div>
        <div className="score">
          <span>MISSION SCORE</span>
          <b className="mono">{d.score}</b>
        </div>
      </header>

      <div className="stat-row mono">
        <div><span>Science Data</span><b>{d.stats.science}</b><small>in-situ {d.stats.sciInSitu} · legacy {d.stats.sciLegacy} · cores {d.stats.sciDrill} · bonus {d.stats.sciBonus}</small></div>
        <div><span>Engineering Efficiency</span><b>{d.efficiency.toFixed(2)}</b><small>Science Data per $1M · ${d.cost}M · {d.mass} kg</small></div>
        <div className={`msr g-${d.msr.grade[0]}`}><span>MSR Cost-Efficiency Grade</span><b>{d.msr.grade}</b><small>{d.msr.tier}</small></div>
        <div><span>Engineering Certification</span><b>{d.cert.score}/100</b><small>COSPAR · disposal · docking</small></div>
        <div><span>Final state</span><b>{Math.round(d.stats.power)}% / {Math.round(d.stats.o2)}%</b><small>power / O2 · dose {Math.round(d.stats.rad)}% · {d.stats.comms} kbps</small></div>
      </div>

      <div className="tabs">
        {[
          ['analysis', 'Analysis'],
          ['whatif', 'What-If Lab'],
          ['cites', 'NASA Data Citations'],
          ['log', 'Mission Log'],
        ].map(([k, n]) => (
          <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {n}
          </button>
        ))}
      </div>

      {tab === 'analysis' && (
        <div className="debrief-grid">
          <div>
            <Panel title="Sol-by-Sol Telemetry" tag="rems">
              <TelemetryChart a={d} />
            </Panel>
            <Panel title="Scientific Root-Cause Diagnosis">
              {d.diagnosis.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </Panel>
            <Panel title={d.rec.title || 'Recommendation'} className="rec">
              <p>{d.rec.text}</p>
              {d.rec.item && <div className="mono cy">Stage 1 item: {ITEM_BY_ID[d.rec.item].name}</div>}
              {d.rec.layer && <div className="mono cy">Stage 2 layer: {LAYERS.find((l) => l.id === d.rec.layer)?.name}</div>}
            </Panel>
          </div>
          <div>
            <Panel title="MSR Architecture Certification" tag="pds">
              <div className={`cert-badge g-${d.msr.grade[0]}`}>
                <b>{d.msr.grade}</b>
                <span>{d.msr.tier}</span>
              </div>
              <div className="bench">
                {MSR_CLASSES.map((c) => (
                  <div key={c.id} className={c.id === d.msr.nearest.id ? 'near' : ''}>
                    <span>{c.name}</span>
                    <i className="mono">${c.cost}M · {c.mass} kg · {c.cls}</i>
                  </div>
                ))}
                <div className="you">
                  <span>Your payload</span>
                  <i className="mono">${d.cost}M · {d.mass} kg · closest class: {d.msr.nearest.cls}</i>
                </div>
              </div>
              {d.cert.lines.map((l, i) => (
                <div key={i} className={l.ok ? 'ok' : 'bad'}>
                  {l.ok ? '✓' : '✗'} {l.text}
                </div>
              ))}
            </Panel>
            {d.contract && (
              <Panel title={`Contract · ${d.contract.name}`}>
                <div className={d.contract.ok ? 'ok' : 'bad'}>
                  {d.contract.ok ? `✓ FULFILLED · +${d.contract.bonus}` : '✗ NOT FULFILLED'} · {d.contract.why}
                </div>
              </Panel>
            )}
            <Panel title="Legacy Hardware & Medals">
              {d.encounters.map((e) => (
                <div key={e.id} className={`enc e-${e.result}`}>
                  <span>{e.name}</span>
                  <b>{e.result.toUpperCase()}</b>
                </div>
              ))}
              <div className="family small">
                {d.family.map((f) => (
                  <span key={f.id} className={f.lit ? 'lit' : ''}>{f.name}</span>
                ))}
              </div>
              <div className="medals">
                {d.medals.map((m) => (
                  <span key={m.name} title={m.why}>★ {m.name}</span>
                ))}
              </div>
            </Panel>
            <Panel title="Mission Blueprint Code">
              <code className="blueprint">{d.blueprint}</code>
              <CopyButton text={d.blueprint} label="Copy blueprint" />
            </Panel>
          </div>
        </div>
      )}

      {tab === 'whatif' && (
        <div className="whatif">
          <Panel title='Interactive "What-If" Loadout Swap Simulator'>
            <p>Click one item you packed, then one you left in the bunker. All six sols are re-simulated with the same weather seed and the same decisions.</p>
            <div className="swap-grid">
              <div>
                <div className="panel-head">Packed</div>
                {params.packed.map((id) => (
                  <button type="button" key={id} className={`item-row ${out === id ? 'on' : ''}`} onClick={() => setOut(out === id ? null : id)}>
                    <span>{ITEM_BY_ID[id].short}</span>
                    <span className="mono">{ITEM_BY_ID[id].mass} kg · ${ITEM_BY_ID[id].cost}M</span>
                  </button>
                ))}
              </div>
              <div className="swap-arrow">⇄</div>
              <div>
                <div className="panel-head">Left in the bunker</div>
                {left.map((it) => (
                  <button type="button" key={it.id} className={`item-row ${inn === it.id ? 'on' : ''}`} onClick={() => setInn(inn === it.id ? null : it.id)}>
                    <span>{it.short}</span>
                    <span className="mono">{it.mass} kg · ${it.cost}M</span>
                  </button>
                ))}
                {!left.length && <small>You packed everything.</small>}
              </div>
            </div>
          </Panel>
          {whatIf ? (
            <Panel title={`Result: ${ITEM_BY_ID[out].short} → ${ITEM_BY_ID[inn].short}`}>
              <div className="delta-row mono">
                <div><span>Outcome</span><b className={whatIf.d.win ? 'ok' : 'bad'}>{whatIf.d.win ? 'SURVIVES' : whatIf.d.causeLabel}</b><small>was: {d.win ? 'survived' : d.causeLabel}</small></div>
                <div><span>Science Data</span><b>{whatIf.d.stats.science}</b><small>{whatIf.d.stats.science - d.stats.science >= 0 ? '+' : ''}{whatIf.d.stats.science - d.stats.science} vs actual</small></div>
                <div><span>Score</span><b>{whatIf.d.score}</b><small>{whatIf.d.score - d.score >= 0 ? '+' : ''}{whatIf.d.score - d.score}</small></div>
                <div><span>Payload</span><b>{whatIf.d.mass} kg</b><small>${whatIf.d.cost}M{whatIf.over ? ' · OVER THE VEHICLE CAP' : ''}</small></div>
              </div>
              <TelemetryChart a={d} b={whatIf.d} />
              <p>{whatIf.d.diagnosis[0]}</p>
            </Panel>
          ) : (
            <Panel title="Result">
              <p className="muted">Select one item from each column.</p>
            </Panel>
          )}
        </div>
      )}

      {tab === 'cites' && (
        <Panel title="NASA Data & Compliance Manifest" right={<CopyButton text={citeText} label="Copy NASA Data Citations" />}>
          <p>Every NASA dataset or instrument that drove a system during this playthrough.</p>
          <ol className="cites">
            {d.citations.map((c) => (
              <li key={c.key}>
                <b className="mono">[{c.tag}]</b> {c.cite}
              </li>
            ))}
          </ol>
          <Tag k="pds" />
        </Panel>
      )}

      {tab === 'log' && (
        <Panel title="Mission Log">
          <div className="log full">
            {d.log.map((l, i) => (
              <div key={i} className={`tone-${l.tone}`}>
                <b>SOL {l.sol}</b> {l.text}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <footer className="debrief-actions">
        <Btn tone="amber" className="btn-xl" onClick={onRelaunch}>
          Relaunch Mission
        </Btn>
        <Btn onClick={takeSelfie}>Capture Mars Selfie (PNG)</Btn>
        <Btn tone="ghost" onClick={onArchive}>
          Hardware Archive
        </Btn>
        <Btn tone="ghost" onClick={onTitle}>
          Title Screen
        </Btn>
      </footer>
      {selfie && (
        <div className="selfie">
          <img src={selfie} alt="Mars selfie postcard" />
          <small>Saved as sol60-mars-selfie.png</small>
        </div>
      )}
    </div>
  );
}
