import { useEffect, useMemo, useRef, useState } from 'react';
import { MapScene } from '../three/MapScene.js';
import { SkyCraneScene, EDL_TIMES } from '../three/SkyCraneScene.js';
import { LAYERS, HARDWARE_BY_ID, ITEM_BY_ID, EDL_HEAVY_KG, engineeringStats } from '../game/data.js';
import { buildRoute, assessRoute } from '../game/terrain.js';
import { advisorOnRoute } from '../game/advisors.js';
import { escapadeSync } from '../systems/nasaDataIntegrations.js';
import { audio } from '../audio/audio.js';
import { Btn, Panel, Tag, Toggle, Tooltip, AdvisorRadio, useRadio } from './common.jsx';

const LAYER_TAG = { slope: 'mola', rad: 'rad', thermal: 'themis', tau: 'tau', crism: 'crism', sharad: 'sharad' };
export const JUDGE_WAYPOINTS = [
  { x: -28, z: 13 },
  { x: -4, z: 21 },
  { x: 22, z: 6 },
];

export function MapStage({ judge, vehicle, packed, initialWaypoints, onConfirm }) {
  const box = useRef(null);
  const scene = useRef(null);
  const [layers, setLayers] = useState(['slope']);
  const [wps, setWps] = useState(initialWaypoints || []);
  const [sel, setSel] = useState(-1);
  const [hover, setHover] = useState(null);
  const [escapade, setEscapade] = useState(false);
  const [sterilized, setSterilized] = useState(false);
  const radio = useRadio(8000);
  const has = useMemo(() => Object.fromEntries(packed.map((i) => [i, true])), [packed]);
  const stats = engineeringStats(vehicle, packed);
  const wpsRef = useRef(wps);
  wpsRef.current = wps;
  const selRef = useRef(sel);
  selRef.current = sel;

  const route = useMemo(() => (wps.length === 3 ? buildRoute(wps) : null), [wps]);
  const assess = useMemo(() => (route ? assessRoute(route, has, vehicle) : null), [route, has, vehicle]);

  useEffect(() => {
    const sc = new MapScene(box.current, {
      onPick: (p) => {
        audio.click();
        const cur = wpsRef.current;
        const s = selRef.current;
        if (s >= 0 && s < cur.length) {
          setWps(cur.map((w, i) => (i === s ? p : w)));
          setSel(-1);
        } else if (cur.length < 3) setWps([...cur, p]);
        else {
          // replace the nearest waypoint
          let bi = 0;
          let bd = Infinity;
          cur.forEach((w, i) => {
            const d = Math.hypot(w.x - p.x, w.z - p.z);
            if (d < bd) {
              bd = d;
              bi = i;
            }
          });
          setWps(cur.map((w, i) => (i === bi ? p : w)));
        }
      },
      onHover: setHover,
    });
    scene.current = sc;
    audio.init();
    audio.startDrone();
    return () => {
      audio.stopDrone();
      sc.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => scene.current?.setLayers(layers), [layers]);
  useEffect(() => {
    scene.current?.setWaypoints(wps, sel);
    scene.current?.setRoute(route);
  }, [wps, sel, route]);
  useEffect(() => scene.current?.setEscapade(escapade), [escapade]);
  useEffect(() => {
    if (assess && !judge) advisorOnRoute(assess, has).slice(0, 2).forEach((m, i) => setTimeout(() => radio.push(m), i * 900));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assess]);
  useEffect(() => {
    if (!judge) return undefined;
    setEscapade(true);
    setLayers(['slope', 'crism']);
    const t = setTimeout(() => onConfirm({ waypoints: JUDGE_WAYPOINTS, route: buildRoute(JUDGE_WAYPOINTS), escapade: true, sterilized: true, layers: ['slope', 'crism', 'sharad'] }), 6500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judge]);

  const sync = escapadeSync(stats.comms);
  const heavy = stats.mass > EDL_HEAVY_KG;

  return (
    <div className="stage">
      <div ref={box} className="viewport" />
      <Tooltip text="Toggle NASA data layers, then click the terrain to place 3 waypoints from Bradbury to the summit. Drag to orbit, scroll to zoom." />
      <div className="hud-left">
        <Panel title="NASA Mars Trek · Data Layers" tag="mola">
          {LAYERS.map((l) => {
            const on = layers.includes(l.id);
            return (
              <div key={l.id} className="layer-row">
                <Toggle on={on} onClick={() => setLayers(on ? layers.filter((x) => x !== l.id) : [...layers, l.id])} title={l.instrument}>
                  {l.name}
                </Toggle>
                {on && (
                  <div className="ramp">
                    <span>{l.lo}</span>
                    <i style={{ background: `linear-gradient(90deg, ${l.stops.join(',')})` }} />
                    <span>{l.hi}</span>
                  </div>
                )}
                {on && <div className="layer-note">{l.hazard}</div>}
                <Tag k={LAYER_TAG[l.id]} />
              </div>
            );
          })}
        </Panel>
        <Panel title="Orbital Assets" tag="escapade">
          <Btn small tone={escapade ? 'green' : 'cyan'} disabled={escapade || !sync.ok} onClick={() => { setEscapade(true); audio.chime(); }}>
            {escapade ? 'ESCAPADE Blue + Gold synced' : 'Sync ESCAPADE twin orbiters'}
          </Btn>
          <div className="layer-note">{escapade ? '1-sol early warning before solar particle storms.' : 'Twin orbiters watch the solar wind. Sync for storm warnings.'}</div>
          <Toggle on={sterilized} onClick={() => setSterilized(!sterilized)} title="Dry-heat and UV sterilization of drill and boots">
            Thermal / UV sterilization (−6% battery)
          </Toggle>
          <Tag k="cospar" />
        </Panel>
      </div>

      <div className="hud-right">
        <Panel title="Waypoints">
          <div className="wp-row">
            {[0, 1, 2].map((i) => (
              <button type="button" key={i} className={`chip ${sel === i ? 'on' : ''} ${wps[i] ? 'set' : ''}`} disabled={!wps[i]} onClick={() => setSel(sel === i ? -1 : i)}>
                WP {i + 1}
                {wps[i] ? ` (${Math.round(wps[i].x)}, ${Math.round(wps[i].z)})` : ' · empty'}
              </button>
            ))}
          </div>
          <div className="layer-note">{sel >= 0 ? `Click the map to move WP ${sel + 1}.` : wps.length < 3 ? `Click the map to place WP ${wps.length + 1}.` : 'Select a WP chip to move it.'}</div>
          <Btn small tone="ghost" onClick={() => { setWps([]); setSel(-1); }}>
            Clear route
          </Btn>
        </Panel>
        {assess && (
          <Panel title={`Route Risk · ${assess.overall}`} className={`risk-${assess.overall.toLowerCase()}`}>
            <div className="mono risk-km">
              {assess.km.toFixed(1)} km · pace x{assess.pace.toFixed(2)}
            </div>
            {assess.hazards.map((h) => (
              <div key={h.id} className={`risk-row r-${h.label.toLowerCase()}`}>
                <div className="risk-head">
                  <span>{h.name}</span>
                  <b>{h.label}</b>
                </div>
                <div className="gauge-bar">
                  <div style={{ width: `${h.value * 100}%` }} />
                </div>
                <small>
                  {h.note} · {h.detail}
                </small>
              </div>
            ))}
            <div className="risk-list">
              <div>
                Ghost hardware on route: <b>{assess.hardware.length ? assess.hardware.map((id) => HARDWARE_BY_ID[id].name.replace(/^MER-. /, '')).join(', ') : 'none'}</b>
              </div>
              <div>
                Crater floors: <b>{assess.craters.length}</b> · CRISM clay exposure <b>{Math.round(assess.crism * 100)}%</b> · SHARAD ice <b>{assess.sharad > 0.6 ? 'YES' : 'no'}</b>
              </div>
              {assess.cospar && (
                <div className={sterilized ? 'ok' : 'bad'}>COSPAR Special Region on route: {sterilized ? 'hardware sterilized' : 'NOT STERILIZED (certification penalty)'}</div>
              )}
              {heavy && (
                <div className="bad">
                  EDL WARNING: {stats.mass} kg payload. Mars air is ~1% of Earth's: parachutes and thrusters brake less. Expect a harder landing. <Tag k="mola" inline />
                </div>
              )}
            </div>
          </Panel>
        )}
        <Btn tone="amber" className="btn-xl" disabled={!route} onClick={() => onConfirm({ waypoints: wps, route, escapade, sterilized, layers })}>
          {route ? 'Commit Route · Begin EDL' : `Place ${3 - wps.length} more waypoint${3 - wps.length === 1 ? '' : 's'}`}
        </Btn>
      </div>

      {hover && (
        <div className="probe mono">
          <b>
            ({hover.x.toFixed(0)}, {hover.z.toFixed(0)})
          </b>
          <span>elev {(hover.L.h * 0.25 - 4.5).toFixed(2)} km</span>
          <span>slope {Math.round((Math.atan(hover.L.grade) * 180) / Math.PI)}°</span>
          <span>rad {Math.round(hover.L.rad * 100)}%</span>
          <span>freeze {Math.round(hover.L.freeze * 100)}%</span>
          <span>tau {Math.round(hover.L.tau * 100)}%</span>
          <span>clay {Math.round(hover.L.crism * 100)}%</span>
          <span>ice {Math.round(hover.L.sharad * 100)}%</span>
        </div>
      )}
      <AdvisorRadio queue={radio.queue} onDismiss={radio.dismiss} />
    </div>
  );
}

// ---------------------------------------------------------------- EDL

export function EdlStage({ judge, packed, mass, seedNum, onDone }) {
  const box = useRef(null);
  const scene = useRef(null);
  const [tel, setTel] = useState({ h: 125000, v: -5800, fuel: 8, t: 0, firing: false });
  const [phase, setPhase] = useState('entry');
  const [result, setResult] = useState(null);
  const telRef = useRef(tel);

  useEffect(() => {
    const sc = new SkyCraneScene(
      box.current,
      {
        onTelemetry: (t) => (telRef.current = t),
        onPhase: (p) => {
          setPhase(p);
          audio.alert();
        },
        onDone: (r) => {
          audio.thruster(false);
          const damaged = !r.soft && packed.length ? packed[(seedNum >>> 3) % packed.length] : null;
          if (r.soft) audio.success();
          else audio.deny();
          setResult({ ...r, damaged });
          setPhase('landed');
        },
      },
      { mass, heavy: mass > EDL_HEAVY_KG, auto: judge },
    );
    scene.current = sc;
    audio.init();
    audio.launch();
    const iv = setInterval(() => {
      setTel({ ...telRef.current });
      if (sc.phase() === 'chute') setPhase('chute');
    }, 80);
    return () => {
      clearInterval(iv);
      audio.thruster(false);
      sc.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fire = (on) => {
    if (phase !== 'powered' || judge) return;
    scene.current?.setThrust(on);
    audio.thruster(on);
  };
  useEffect(() => {
    const d = (e) => e.code === 'Space' && !e.repeat && fire(true);
    const u = (e) => e.code === 'Space' && fire(false);
    window.addEventListener('keydown', d);
    window.addEventListener('keyup', u);
    return () => {
      window.removeEventListener('keydown', d);
      window.removeEventListener('keyup', u);
    };
  });
  useEffect(() => {
    if (judge && result) {
      const t = setTimeout(() => onDone({ damaged: result.damaged, repaired: !!result.damaged, soft: result.soft }), 1800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [judge, result, onDone]);

  const speed = Math.abs(tel.v);
  const vTone = phase !== 'powered' ? 'cyan' : speed <= 2.5 ? 'green' : speed <= 6 ? 'amber' : 'crimson';
  return (
    <div className="stage">
      <div ref={box} className="viewport" />
      <Tooltip text="Seven minutes of terror in 15 seconds. When the sky crane ignites, hold FIRE RETRO-THRUSTERS (or Space) to touch down under 2.5 m/s." />
      <div className="edl-phase">
        {phase === 'entry' && 'ATMOSPHERIC ENTRY · PEAK HEATING 1,300 °C'}
        {phase === 'chute' && 'SUPERSONIC PARACHUTE · "DARE MIGHTY THINGS"'}
        {phase === 'powered' && 'SKY CRANE · POWERED DESCENT'}
        {phase === 'landed' && (result?.soft ? 'TOUCHDOWN CONFIRMED' : 'HARD LANDING')}
      </div>
      <div className="edl-tel">
        <Panel title="EDL Telemetry" tag="m2020">
          <div className="tel-row">
            <span>ALTITUDE</span>
            <b className="mono">{tel.h > 1000 ? `${(tel.h / 1000).toFixed(1)} km` : `${tel.h.toFixed(1)} m`}</b>
          </div>
          <div className={`tel-row tone-${vTone}`}>
            <span>VERTICAL SPEED</span>
            <b className="mono">{speed > 100 ? `${Math.round(speed)} m/s` : `${speed.toFixed(1)} m/s`}</b>
          </div>
          <div className="tel-row">
            <span>FUEL</span>
            <b className="mono">{tel.fuel.toFixed(1)} s</b>
          </div>
          <div className="vbar">
            <i className="safe" />
            <b style={{ left: `${Math.min(100, (speed / 25) * 100)}%` }} />
          </div>
          <small>Green zone: under 2.5 m/s at touchdown · T+{Math.min(EDL_TIMES.total, tel.t).toFixed(1)} s</small>
          {mass > EDL_HEAVY_KG && <div className="warn-line">Heavy payload ({mass} kg): thrust authority reduced.</div>}
        </Panel>
      </div>
      {phase === 'powered' && !judge && (
        <button
          type="button"
          className={`fire-btn ${tel.firing ? 'on' : ''}`}
          onPointerDown={() => fire(true)}
          onPointerUp={() => fire(false)}
          onPointerLeave={() => fire(false)}
        >
          FIRE RETRO-THRUSTERS
          <small>hold · or Space</small>
        </button>
      )}
      {result && !judge && (
        <div className="modal-backdrop">
          <div className={`modal tone-${result.soft ? 'cyan' : 'amber'}`}>
            <div className="eyebrow">EDL REPORT</div>
            <h2>{result.soft ? 'Soft landing' : result.crash ? 'Crash landing' : 'Rough landing'}</h2>
            <p className="mono">Touchdown at {result.speed.toFixed(1)} m/s · fuel left {result.fuel.toFixed(1)} s</p>
            {result.soft ? (
              <p>Bridles cut, descent stage flown clear. All cargo intact. Sojourner would be proud: Family Portrait +1.</p>
            ) : (
              <p>
                The pallet hit hard. <b>{ITEM_BY_ID[result.damaged]?.name || 'No cargo'}</b> is damaged.
              </p>
            )}
            <div className="choice-list">
              {!result.soft && result.damaged && (
                <Btn tone="amber" onClick={() => onDone({ damaged: result.damaged, repaired: true, soft: false })}>
                  Field-repair it (−12% battery)
                </Btn>
              )}
              <Btn onClick={() => onDone({ damaged: result.damaged, repaired: false, soft: result.soft })}>{result.soft ? 'Step onto Mars' : result.damaged ? 'Leave it and go' : 'Step onto Mars'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
