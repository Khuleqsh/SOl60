import { useEffect, useMemo, useRef, useState } from 'react';
import { BunkerScene } from '../three/BunkerScene.js';
import { ITEMS, ITEM_BY_ID, VEHICLES, WINDOWS, CONTRACTS, CADET_HINTS, MODES, EDL_HEAVY_KG, applyWindow, engineeringStats } from '../game/data.js';
import { advisorOnToggle, advisorBunkerTip } from '../game/advisors.js';
import { audio } from '../audio/audio.js';
import { Btn, Gauge, Panel, Tag, Tooltip, AdvisorRadio, useRadio, useInterval } from './common.jsx';

// ---------------------------------------------------------------- briefing

function OrbitDiagram({ windowId }) {
  const fast = windowId === 'fast';
  return (
    <svg viewBox="0 0 220 180" className="orbit-diagram" role="img" aria-label="Earth to Mars transfer orbit">
      <circle cx="110" cy="90" r="50" fill="none" stroke="#38bdf8" strokeOpacity="0.5" strokeDasharray="3 3" />
      <circle cx="110" cy="90" r="76" fill="none" stroke="#f97316" strokeOpacity="0.5" strokeDasharray="3 3" />
      <circle cx="110" cy="90" r="7" fill="#fde047" />
      {fast ? (
        <path d="M160 90 Q 150 10 61 32" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
      ) : (
        <path d="M160 90 A 63 60 0 0 0 34 90" fill="none" stroke="#3dff8a" strokeWidth="2.5" />
      )}
      <circle cx="160" cy="90" r="5" fill="#38bdf8" />
      <text x="168" y="94" className="svg-label">
        Earth
      </text>
      {fast ? <circle cx="61" cy="32" r="4.5" fill="#f97316" /> : <circle cx="34" cy="90" r="4.5" fill="#f97316" />}
      <text x={fast ? 20 : 4} y={fast ? 26 : 108} className="svg-label">
        Mars
      </text>
      <text x="110" y="172" textAnchor="middle" className="svg-label">
        {fast ? 'High-energy arc · arrives early' : 'Hohmann half-ellipse · 180° transfer'}
      </text>
    </svg>
  );
}

export function BriefingStage({ mode, contractId, setContractId, windowId, setWindowId, vehicleId, setVehicleId, onConfirm, onBack }) {
  const v = applyWindow(VEHICLES[vehicleId], windowId);
  const caps = MODES[mode].caps;
  return (
    <div className="briefing">
      <Tooltip text="Pick a mission contract, a launch window and a launch vehicle. Then you have the bunker clock." />
      <div className="briefing-grid">
        <Panel title="1 · Mission Objective Contract">
          <div className="card-list">
            {CONTRACTS.map((c) => (
              <button type="button" key={c.id} className={`pick-card ${contractId === c.id ? 'on' : ''}`} onClick={() => setContractId(c.id)}>
                <span className="mode-tag">+{c.bonus} SCORE</span>
                <strong>{c.name}</strong>
                <span>{c.blurb}</span>
                <em>{c.goal}</em>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="2 · Launch Window" tag="eyes">
          <OrbitDiagram windowId={windowId} />
          <div className="card-list">
            {Object.values(WINDOWS).map((w) => (
              <button type="button" key={w.id} className={`pick-card ${windowId === w.id ? 'on' : ''}`} onClick={() => setWindowId(w.id)}>
                <span className="mode-tag">{w.tag}</span>
                <strong>{w.name}</strong>
                <span>{w.blurb}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="3 · Launch Vehicle">
          <div className="card-list">
            {Object.values(VEHICLES).map((veh) => {
              const a = applyWindow(veh, windowId);
              return (
                <button type="button" key={veh.id} className={`pick-card ${vehicleId === veh.id ? 'on' : ''}`} onClick={() => setVehicleId(veh.id)}>
                  <span className="mode-tag">{veh.tag}</span>
                  <strong>{veh.name}</strong>
                  <span className="mono">
                    {caps ? `${a.maxMass} kg · $${a.budget}M` : 'UNLIMITED (Sandbox)'} · {a.transitDays} d cruise
                  </span>
                  <span>{veh.blurb}</span>
                  {veh.id === 'sls' && <em>Payloads over {EDL_HEAVY_KG} kg raise EDL risk in thin air.</em>}
                </button>
              );
            })}
          </div>
          <div className="brief-summary mono">
            {v.name} · cruise dose {v.transitRad}% · thermal drift {v.thermalDrift} °C
          </div>
        </Panel>
      </div>
      <div className="briefing-actions">
        <Btn tone="ghost" onClick={onBack}>
          Back
        </Btn>
        <Btn tone="amber" className="btn-xl" disabled={!contractId} onClick={onConfirm}>
          {contractId ? `Enter the Bunker · ${MODES[mode].timer} s on the clock` : 'Select a contract first'}
        </Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bunker

export function BunkerStage({ mode, judge, vehicle, contract, xray, preset, onLaunch }) {
  const box = useRef(null);
  const scene = useRef(null);
  const [packed, setPacked] = useState([]);
  const packedRef = useRef(packed);
  packedRef.current = packed;
  const total = judge ? 8 : MODES[mode].timer;
  const [time, setTime] = useState(total);
  const [phase, setPhase] = useState('play');
  const [hover, setHover] = useState(null);
  const [near, setNear] = useState(null);
  const [flash, setFlash] = useState('');
  const radio = useRadio(6500);
  const caps = MODES[mode].caps;
  const veh = useMemo(() => (caps ? vehicle : { ...vehicle, maxMass: 9999, budget: 99999 }), [vehicle, caps]);
  const stats = engineeringStats(veh, packed);
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const hints = useMemo(() => new Set([...CADET_HINTS.base, ...(CADET_HINTS[contract?.id] || [])]), [contract]);

  const toggle = (id) => {
    if (phaseRef.current !== 'play') return;
    const cur = packedRef.current;
    const on = cur.includes(id);
    if (!on) {
      const next = engineeringStats(veh, [...cur, id]);
      if (next.overBudget) {
        audio.deny();
        setFlash(`OVER BUDGET: ${ITEM_BY_ID[id].short} needs $${next.cost - veh.budget}M more`);
        setTimeout(() => setFlash(''), 1800);
        return;
      }
      audio.grab();
    } else audio.drop();
    const np = on ? cur.filter((i) => i !== id) : [...cur, id];
    packedRef.current = np;
    setPacked(np);
    if (!judge) radio.push(advisorOnToggle(id, !on));
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const sc = new BunkerScene(box.current, {
      onToggle: (id) => toggleRef.current(id),
      onHover: setHover,
      onNear: setNear,
    });
    sc.setMode('play');
    scene.current = sc;
    audio.init();
    audio.startDrone();
    audio.startAlarm();
    if (!judge) radio.push({ who: 'sato', text: `Clock is running. ${veh.maxMass < 9000 ? `${veh.maxMass} kg and $${veh.budget}M, not a gram more.` : 'Sandbox rules: no caps.'}` });
    return () => {
      audio.stopAlarm();
      audio.stopDrone();
      sc.dispose();
      scene.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scene.current?.setPacked(packed);
    scene.current?.setOverload(stats.overload);
  }, [packed, stats.overload]);
  useEffect(() => {
    scene.current?.setXRay(xray);
  }, [xray, packed]);

  const launch = () => {
    if (phaseRef.current !== 'play') return;
    let ids = [...packedRef.current];
    // Out of time while overloaded: ground crew pulls the last items loaded.
    while (ids.length && engineeringStats(veh, ids).overload) ids.pop();
    packedRef.current = ids;
    setPacked(ids);
    setPhase('launch');
    phaseRef.current = 'launch';
    audio.stopAlarm();
    audio.launch();
    scene.current?.setMode('launch');
    setTimeout(() => onLaunch(ids), judge ? 2600 : 4600);
  };

  // countdown
  useInterval(
    () => {
      if (phaseRef.current !== 'play') return;
      setTime((t) => {
        const n = Math.max(0, t - 1);
        audio.pulse(n <= 10);
        scene.current?.setUrgency(1 - n / total);
        if (n === 0) setTimeout(launch, 0);
        return n;
      });
    },
    1000,
    [],
  );
  // advisor tips
  useInterval(
    () => {
      if (phaseRef.current === 'play' && !judge) radio.push(advisorBunkerTip({ ...statsRef.current, maxMass: veh.maxMass }, packedRef.current, contract));
    },
    9000,
    [],
  );
  // autopack: Judge Quick-Tour preset, or a loaded Mission Blueprint
  useEffect(() => {
    const list = judge ? ['rtg', 'solar', 'aerogel', 'eclss', 'dish', 'brush', 'libs', 'lidar'] : preset;
    if (!list || !list.length) return undefined;
    const timers = list.map((id, i) => setTimeout(() => toggleRef.current(id), 500 + i * 650));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focus = hover || near;
  const fi = focus ? ITEM_BY_ID[focus] : null;
  const locked = stats.overload;

  return (
    <div className="stage">
      <div ref={box} className="viewport" />
      <Tooltip text="Click a module (or walk with WASD and press E) to load or unload it. Launch before the clock hits zero." />
      <div className={`timer ${time <= 10 ? 'urgent' : ''}`}>
        <span>T-MINUS</span>
        <strong className="mono">{String(time).padStart(2, '0')}</strong>
        <span>{contract?.short}</span>
      </div>
      {locked && phase === 'play' && <div className="overload">PAYLOAD OVERLOAD · {stats.mass - veh.maxMass} kg OVER · LAUNCH LOCKED</div>}
      {flash && <div className="flashmsg">{flash}</div>}

      <div className="hud-left">
        <Panel title="Engineering HUD" tag="pds">
          <Gauge label="Mass" value={stats.mass} max={caps ? veh.maxMass : 400} unit={caps ? ` / ${veh.maxMass} kg` : ' kg'} tone={stats.overload ? 'crimson' : stats.mass > veh.maxMass * 0.9 ? 'amber' : 'cyan'} />
          <Gauge label="Budget" value={stats.cost} max={caps ? veh.budget : 1100} unit={caps ? ` / $${veh.budget}M` : ' $M'} tone={stats.cost > veh.budget * 0.92 ? 'amber' : 'cyan'} />
          <Gauge
            label="Power balance"
            value={Math.max(0, stats.powerClear + 40)}
            max={130}
            tone={stats.powerStorm < 0 ? (stats.powerClear < 0 ? 'crimson' : 'amber') : 'cyan'}
            fmt={() => `${stats.powerClear >= 0 ? '+' : ''}${stats.powerClear} W clear / ${stats.powerStorm >= 0 ? '+' : ''}${stats.powerStorm} W storm`}
          />
          <Gauge label="Communications" value={stats.comms} max={182} unit=" kbps" tone={stats.comms > 100 ? 'cyan' : 'amber'} tag="dsn" />
          <Gauge label="Time / life support" value={stats.endurance} max={12} tone={stats.endurance >= 6 ? 'cyan' : stats.endurance >= 4 ? 'amber' : 'crimson'} fmt={(v) => `${v >= 20 ? '20+' : v.toFixed(1)} sols`} />
          <Gauge label="Science multiplier" value={stats.sciMult} max={2.5} tone={stats.sciMult > 1 ? 'cyan' : 'amber'} fmt={(v) => `${v.toFixed(1)}x${stats.drill ? ' + cores' : ''}`} />
          {stats.mass > EDL_HEAVY_KG && <div className="warn-line">EDL: over {EDL_HEAVY_KG} kg in thin air. Harder landing.</div>}
        </Panel>
      </div>

      <div className="hud-right">
        <Panel title={`Manifest · ${packed.length}/12`}>
          <div className="item-list">
            {ITEMS.map((it) => {
              const on = packed.includes(it.id);
              return (
                <button
                  type="button"
                  key={it.id}
                  className={`item-row ${on ? 'on' : ''}`}
                  onMouseEnter={() => setHover(it.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => toggle(it.id)}
                >
                  <span className="item-name">
                    {it.short}
                    {MODES[mode].badges && hints.has(it.id) && <i className="badge">{CADET_HINTS.base.includes(it.id) ? 'SURVIVAL' : 'CONTRACT'}</i>}
                  </span>
                  <span className="mono">
                    {it.mass} kg · ${it.cost}M
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
        <Btn tone={locked ? 'crimson' : 'amber'} className="btn-xl" disabled={locked || phase !== 'play'} onClick={launch}>
          {phase !== 'play' ? 'LAUNCHING…' : locked ? 'LAUNCH LOCKED' : 'SEAL AEROSHELL & LAUNCH'}
        </Btn>
      </div>

      {fi && (
        <div className="item-card">
          <strong>{fi.name}</strong>
          <span className="mono">
            {fi.mass} kg · ${fi.cost}M
          </span>
          <span className="cy">{fi.stat}</span>
          <span>{fi.detail}</span>
          <Tag k={fi.id === 'moxie' ? 'moxie' : 'pds'} />
          {near === fi.id && <span className="keyhint">[E] {packed.includes(fi.id) ? 'unload' : 'load'}</span>}
        </div>
      )}
      <AdvisorRadio queue={radio.queue} onDismiss={radio.dismiss} />
    </div>
  );
}
