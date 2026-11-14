import { useEffect, useRef, useState } from 'react';
import { SurfaceScene } from '../three/SurfaceScene.js';
import {
  createMission,
  stepMission,
  eventCard,
  resolveChoice,
  scanTargets,
  scan,
  resolveAbrasion,
  canBuildBerm,
  buildBerm,
  canGaze,
  gazeEarth,
  brushVisor,
  setContained,
  forecastFor,
  SOL_SECONDS,
  OWLT,
} from '../game/sim.js';
import { FAMILY, HARDWARE_BY_ID } from '../game/data.js';
import { advisorOnSurface } from '../game/advisors.js';
import { drawSeismograph, quakeSample } from '../systems/marsEnhancements.js';
import { DockingGame } from '../systems/ultimateFeatures.js';
import { ABRASION } from '../systems/nasaDataIntegrations.js';
import { audio } from '../audio/audio.js';
import { Btn, Gauge, Panel, Tag, Tooltip, AdvisorRadio, useRadio, PatchImg, useInterval } from './common.jsx';

const DSN = ['GOLDSTONE DSS-14 (70 m)', 'MADRID DSS-63 (70 m)', 'CANBERRA DSS-43 (70 m)'];
const DRIVE_RECORD = [
  { name: 'Perseverance (2021– )', km: 45.22, tone: '#3dff8a' },
  { name: 'Opportunity (2004–2018)', km: 45.16, tone: '#35d6ff' },
  { name: 'Lunokhod 2 (1973)', km: 39, tone: '#94a3b8' },
  { name: 'Curiosity (2012– )', km: 38.07, tone: '#fbbf24' },
  { name: 'Spirit (2004–2010)', km: 7.7, tone: '#94a3b8' },
];

function snapshot(scene) {
  const src = scene.capture();
  const c = document.createElement('canvas');
  c.width = src.width || 1280;
  c.height = src.height || 720;
  try {
    c.getContext('2d').drawImage(src, 0, 0);
  } catch {
    /* leave blank */
  }
  return c;
}

function hudOf(s) {
  const v = s.view;
  return {
    sol: v.sol,
    clock: v.clock,
    isDay: v.isDay,
    dusk: v.dusk,
    mro: v.mro,
    mroIn: v.mroIn,
    eclipse: v.eclipse,
    wx: v.wx,
    ambient: v.ambient,
    power: s.power,
    netW: v.netW ?? 0,
    o2: (s.o2 / s.o2Cap) * 100,
    rad: s.rad,
    thermal: s.thermal,
    focus: s.focus,
    science: s.science,
    comms: s.comms,
    visorDust: s.visorDust,
    panelDust: s.flags.panelDust,
    progress: v.progress,
    km: v.progress * s.route.km,
    family: { ...s.family },
    mesh: s.meshLinks.length,
    canBerm: canBuildBerm(s),
    berm: s.flags.berm,
    tube: !!v.tube,
    canGaze: canGaze(s),
    scans: scanTargets(s).filter((t) => !(t.needs && !s.has[t.needs])),
    petRock: s.flags.petRock,
    forecast: s.flags.forecast,
    log: s.log.slice(-4),
    L: v.L,
  };
}

export function SurfaceStage({ judge, params, contract, patchUrl, patchCanvas, xray, onEnd }) {
  const box = useRef(null);
  const scene = useRef(null);
  const sim = useRef(null);
  const paused = useRef(false);
  const speed = useRef(judge ? 7 : 1);
  const [speedUi, setSpeedUi] = useState(judge ? 7 : 1);
  const [userPause, setUserPause] = useState(false);
  const [hud, setHud] = useState(null);
  const [card, setCard] = useState(null);
  const [tuner, setTuner] = useState(null);
  const [info, setInfo] = useState(null);
  const [abrade, setAbrade] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [finale, setFinale] = useState(null);
  const [team, setTeam] = useState('');
  const [message, setMessage] = useState('');
  const [plaqued, setPlaqued] = useState(false);
  const [contained, setContainedUi] = useState(false);
  const [dockMsg, setDockMsg] = useState('');
  const radio = useRadio(7500);
  const quakeAt = useRef(0);
  const seisCanvas = useRef(null);
  const seisHist = useRef(Array(160).fill(0));
  const [seisOn, setSeisOn] = useState(false);
  const dockCanvas = useRef(null);
  const dockGame = useRef(null);
  const frame = useRef(null);
  const ended = useRef(false);
  const warned = useRef({});
  const toastId = useRef(1);
  const handlers = useRef({});

  const toast = (text, tone = 'cyan') => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  const say = (ev) => !judge && radio.push(advisorOnSurface(ev, sim.current));
  const userPauseRef = useRef(false);
  userPauseRef.current = userPause;
  const cardRef = useRef(null);
  cardRef.current = card;
  const tunerRef = useRef(null);
  tunerRef.current = tuner;
  const abradeRef = useRef(null);
  abradeRef.current = abrade;
  const resume = () => {
    paused.current = userPauseRef.current;
  };

  const finish = (docked) => {
    if (ended.current) return;
    ended.current = true;
    onEnd({ s: sim.current, frame: frame.current, docked, team, message });
  };

  // ------------------------------------------------------------ sim outputs
  handlers.current.handle = (out) => {
    const s = sim.current;
    for (const o of out) {
      if (o.type === 'sol') {
        audio.telemetry();
        toast(`SOL ${o.sol} · ${s.weather[o.sol - 1].label}`, s.weather[o.sol - 1].storm > 0 ? 'amber' : 'cyan');
        if (o.sol % 2 === 0) say('mro');
        if (o.sol === 1) say('start');
      } else if (o.type === 'event') {
        paused.current = true;
        audio.alert();
        if (o.id === 'quake') {
          scene.current?.quake(7);
          audio.quake();
          quakeAt.current = performance.now();
          setSeisOn(true);
          say('quake');
        }
        if (o.id === 'storm') say('storm');
        setCard({ trig: o, card: eventCard(s, o), result: null });
      } else if (o.type === 'encounter') {
        paused.current = true;
        audio.chime();
        setTuner({ trig: o, target: 20 + Math.random() * 60, val: 50, left: 5, start: performance.now() });
        audio.lockStart();
      } else if (o.type === 'toast') {
        toast(o.text, o.tone);
        audio.telemetry();
      } else if (o.type === 'banner') {
        setBanner({ text: o.text, tone: o.tone });
        audio.alert();
        setTimeout(() => setBanner(null), 9000);
      } else if (o.type === 'fx') {
        if (o.id === 'knockback') {
          scene.current?.knockback();
          audio.deny();
        } else if (o.id === 'eclipse' && o.on) say('eclipse');
      } else if (o.type === 'end') {
        if (s.alive) {
          audio.success();
          setTimeout(() => setFinale('plaque'), 900);
        } else {
          scene.current?.setDead();
          audio.failure();
          setTimeout(() => {
            if (scene.current) frame.current = snapshot(scene.current);
            finish(false);
          }, 3400);
        }
      }
    }
  };

  // ------------------------------------------------------------ mount
  useEffect(() => {
    const s = createMission(params);
    sim.current = s;
    const sc = new SurfaceScene(
      box.current,
      {
        step: (dt) => {
          const m = sim.current;
          if (!m) return null;
          if (!paused.current && m.alive && !m.done) {
            let scale = speed.current;
            const v = m.view;
            if (!judge) {
              if (v.eclipse > 0) scale = 0.125;
              else if (v.dusk) scale = Math.min(scale, 0.35);
            }
            let left = (dt * scale) / SOL_SECONDS;
            while (left > 0 && !paused.current && m.alive && !m.done) {
              const h = Math.min(0.004, left);
              left -= h;
              handlers.current.handle(stepMission(m, h));
            }
          }
          return m;
        },
      },
      { route: params.route, escapade: params.escapade, has: s.has },
    );
    scene.current = sc;
    audio.init();
    audio.startWind();
    audio.startInfrasound();
    setHud(hudOf(s));
    return () => {
      audio.stopAll();
      dockGame.current?.dispose();
      sc.dispose();
      scene.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scene.current?.setXRay(xray);
  }, [xray]);

  // ------------------------------------------------------------ HUD refresh
  useInterval(
    () => {
      const s = sim.current;
      if (!s || !s.view) return;
      const h = hudOf(s);
      setHud(h);
      const sheltered = h.tube || (h.berm && !h.isDay);
      audio.setWind(Math.min(1, 0.12 + h.wx.storm * 0.9) * (sheltered ? 0.3 : 1));
      audio.setInfrasound(h.wx.wind, sheltered);
      audio.setGeiger(s.alive && !s.done ? (s.view.radRate || 0) / 4 : 0);
      if (h.o2 < 25 && !warned.current.o2) {
        warned.current.o2 = true;
        say('lowO2');
      }
      if (h.power < 20 && !warned.current.pw) {
        warned.current.pw = true;
        say('lowPower');
      }
      if (h.focus < 35 && !warned.current.fc) {
        warned.current.fc = true;
        say('focus');
      }
      if (judge && !paused.current && h.scans.length && s.alive && !s.done) doScan(h.scans[0], true);
      if (judge && h.canBerm && !h.isDay) doBerm();
      if (judge && h.canGaze) doGaze();
    },
    150,
    [],
  );

  // seismograph trace
  useInterval(
    () => {
      if (!seisOn) return;
      const t = (performance.now() - quakeAt.current) / 1000;
      seisHist.current.push(quakeSample(t));
      seisHist.current.shift();
      if (seisCanvas.current) drawSeismograph(seisCanvas.current, seisHist.current, t < 9);
      if (t > 16) setSeisOn(false);
    },
    50,
    [seisOn],
  );

  // ------------------------------------------------------------ tuner
  useInterval(
    () => {
      const t = tunerRef.current;
      if (!t) return;
      const left = 5 - (performance.now() - t.start) / 1000;
      audio.lockUpdate((t.val - t.target) / 40);
      if (left <= 0 || (judge && left < 4)) lockSignal(judge ? t.target : undefined);
      else setTuner((x) => x && { ...x, left });
    },
    100,
    [],
  );

  const lockSignal = (forceVal) => {
    const t = tunerRef.current;
    if (!t) return;
    tunerRef.current = null;
    const val = forceVal ?? t.val;
    const q = Math.max(0, 1 - Math.abs(val - t.target) / 40);
    audio.lockStop(q > 0.6);
    scene.current?.spawnHologram(t.trig.id);
    scene.current?.fireLaserAt(t.trig.id);
    audio.laser();
    setTuner(null);
    setCard({ trig: t.trig, card: eventCard(sim.current, t.trig), result: null, lock: q });
  };

  // ------------------------------------------------------------ choices
  const choose = (idx) => {
    const c = cardRef.current;
    if (!c || c.result || idx < 0) return;
    const res = resolveChoice(sim.current, c.trig, idx, { lock: c.lock });
    if (c.trig.type === 'encounter') {
      scene.current?.setHardwareState(c.trig.id, res.preserve ? 'preserve' : 'salvage');
      if (res.preserve) audio.success();
      setTimeout(() => say(res.preserve ? 'preserve' : 'salvage'), 600);
    } else if (res.tone === 'crimson') audio.deny();
    else audio.chime();
    const next = { ...c, result: res };
    cardRef.current = next;
    setCard(next);
  };
  const closeCard = () => {
    setCard(null);
    resume();
  };
  useEffect(() => {
    if (!judge || !card) return undefined;
    const t = card.result
      ? setTimeout(closeCard, 1000)
      : setTimeout(() => choose(card.card.choices.findIndex((c) => !c.disabled)), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judge, card]);

  // ------------------------------------------------------------ actions
  function doScan(target, silent) {
    const s = sim.current;
    scene.current?.fireLaserAt(target.id);
    audio.laser();
    const res = scan(s, target.id);
    if (!res) return;
    if (!res.ok) {
      toast(res.text, 'amber');
      return;
    }
    toast(`SCAN: +${res.sci} SCIENCE DATA`, 'cyan');
    const canAbrade = (target.id === 'percache' || target.id === 'boxwork') && (s.has.libs || s.has.drill);
    if (silent) {
      if (canAbrade) resolveAbrasion(s, target.id, 50);
      return;
    }
    paused.current = true;
    setInfo({ ...target, text: res.text, sci: res.sci, canAbrade });
  }
  function doBerm() {
    const msg = buildBerm(sim.current);
    if (!msg) return;
    scene.current?.buildBerm();
    audio.grab();
    toast('ISRU REGOLITH BERM PRINTED: −50% STORM & RADIATION AT CAMP', 'cyan');
  }
  function doGaze() {
    const msg = gazeEarth(sim.current);
    if (!msg) return;
    scene.current?.gaze(6);
    audio.harmonic();
    toast('PALE BLUE DOT · CREW FOCUS +35', 'cyan');
  }
  const doBrush = () => {
    toast(brushVisor(sim.current), 'cyan');
    audio.noise({ dur: 0.4, vol: 0.2, type: 'highpass', freq: 3000 });
  };

  // abrasion gauge
  useInterval(
    () => {
      const a = abradeRef.current;
      if (!a || a.result) return;
      const depth = Math.min(ABRASION.maxDepth, ((performance.now() - a.start) / 1000 / ABRASION.duration) * ABRASION.maxDepth);
      if (depth >= ABRASION.maxDepth) stopAbrade(ABRASION.maxDepth);
      else setAbrade((x) => (x && !x.result ? { ...x, depth } : x));
    },
    30,
    [],
  );
  const stopAbrade = (forced) => {
    const a = abradeRef.current;
    if (!a || a.result) return;
    const depth = forced ?? Math.min(ABRASION.maxDepth, ((performance.now() - a.start) / 1000 / ABRASION.duration) * ABRASION.maxDepth);
    const res = resolveAbrasion(sim.current, a.id, depth) || { inZone: false, gain: 0 };
    if (res.inZone) audio.success();
    else audio.deny();
    const next = { ...a, depth, result: res };
    abradeRef.current = next;
    setAbrade(next);
  };

  // ------------------------------------------------------------ finale
  const placePlaque = () => {
    scene.current?.placePlaque({ team: team || 'TEAM ARES', message: message || 'We came in peace for all humankind.', patchCanvas, sol: 6 });
    audio.clamp();
    setPlaqued(true);
  };
  const toDocking = (force) => {
    setContained(sim.current, force === true || contained || !sim.current.has.rtg);
    scene.current?.setSelfie(true);
    setFinale('pose');
    setTimeout(() => {
      if (scene.current) frame.current = snapshot(scene.current);
      audio.shutter();
      setFinale('dock');
    }, 1600);
  };
  useEffect(() => {
    if (finale !== 'dock' || !dockCanvas.current) return undefined;
    const g = new DockingGame(dockCanvas.current, {
      duration: 10,
      onDone: ({ ok }) => {
        if (ok) audio.clamp();
        else audio.deny();
        setDockMsg(ok ? 'HARD DOCK CONFIRMED · SAMPLES TRANSFERRED' : 'AUTOPILOT DOCKED LATE · CERTIFICATION PENALTY');
        setTimeout(() => finish(ok), 1500);
      },
    });
    dockGame.current = g;
    const auto = judge ? setInterval(() => g.centered() && g.t > 1.5 && g.tryLock(), 60) : null;
    return () => {
      if (auto) clearInterval(auto);
      g.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finale]);
  useEffect(() => {
    if (!judge || finale !== 'plaque') return undefined;
    setTeam('JUDGE DEMO');
    setContainedUi(true);
    const a = setTimeout(placePlaque, 700);
    const b = setTimeout(() => toDocking(true), 2000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judge, finale]);

  if (!hud) return <div className="stage"><div ref={box} className="viewport" /></div>;
  const s = sim.current;
  const utc = new Date().toISOString().slice(11, 19);
  const dsn = DSN[Math.floor(Date.now() / 9000) % 3];
  const mroTxt = hud.mro ? 'MRO OVERHEAD · 2x DATA' : `MRO PASS IN ${(hud.mroIn * 24.66).toFixed(1)} h`;
  const hw = card?.trig.type === 'encounter' ? HARDWARE_BY_ID[card.trig.id] : null;

  return (
    <div className="stage">
      <div ref={box} className="viewport" />
      <div className="visor-dust" style={{ opacity: Math.min(0.8, hud.visorDust * 0.85) }} />
      {hud.eclipse > 0 && <div className="eclipse-dim" style={{ opacity: hud.eclipse * 0.25 }} />}
      <Tooltip text="Your astronaut walks the route. Answer hazards, scan landmarks, shelter at camp, and decide: preserve or salvage the silent machines." />

      <div className="clockbar mono">
        <PatchImg src={patchUrl} size={34} />
        <span className="sol">SOL {hud.sol}/6</span>
        <span title="Local Mean Solar Time. A sol lasts 24 h 39 m 35 s.">LMST {hud.clock}</span>
        <span>UTC {utc}</span>
        <span className="owlt" title="One-way light time to Earth. A question and its answer take almost half an hour, so every survival decision is yours.">
          OWLT {OWLT}
        </span>
        <span className={hud.mro ? 'mro on' : 'mro'}>{mroTxt}</span>
        <span>{hud.isDay ? (hud.dusk ? 'BLUE SUNSET' : hud.wx.label) : 'NIGHT · CAMP'}</span>
        <Tag k="rems" inline />
      </div>
      {banner && <div className={`banner tone-${banner.tone}`}>{banner.text} <Tag k="escapade" inline /></div>}
      {hud.eclipse > 0 && <div className="banner tone-cyan">PHOBOS SOLAR TRANSIT · SOLAR POWER −{Math.round(hud.eclipse * 45)}%</div>}

      <div className="hud-left">
        <Panel title="Suit Telemetry">
          <Gauge label="Power" value={hud.power} unit="%" sub={`${hud.netW >= 0 ? '+' : ''}${hud.netW.toFixed(0)} W net${hud.panelDust > 0.05 ? ` · arrays ${Math.round(hud.panelDust * 100)}% dusty` : ''}`} />
          <Gauge label="Oxygen" value={hud.o2} unit="%" tag="moxie" />
          <Gauge label="Radiation dose" value={hud.rad} unit="%" invert warn={0.4} crit={0.2} tag="rad" />
          <Gauge label="Core temp margin" value={hud.thermal} unit="%" sub={`ambient ${Math.round(hud.ambient)} °C`} tag="themis" />
          <Gauge label="Crew focus" value={hud.focus} unit="%" />
          <div className="sci mono">
            SCIENCE <b>{Math.round(hud.science)}</b> · COMMS <b>{hud.comms} kbps</b>
            {hud.mesh > 0 && <i> · MESH x{hud.mesh}</i>}
          </div>
        </Panel>
        <Panel title="REMS Weather" tag="rems">
          <div className="wx mono">
            <span>{hud.wx.dayT} / {hud.wx.nightT} °C</span>
            <span>{hud.wx.pressure} Pa</span>
            <span>tau {hud.wx.tau.toFixed(1)}</span>
            <span>wind {hud.wx.wind} m/s</span>
            <span>UV {hud.wx.uv}</span>
          </div>
          {hud.forecast && (
            <div className="forecast">
              {forecastFor(s).map((f) => (
                <span key={f.sol} className={f.storm > 0 ? 'st' : ''} title={f.label}>
                  S{f.sol}
                  <br />
                  τ{f.tau.toFixed(1)}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="hud-right">
        <Panel title="Mars Family Portrait" tag="pds">
          <div className="family">
            {FAMILY.map((f) => (
              <div key={f.id} className={`fam ${hud.family[f.id] ? 'lit' : ''}`} title={`${f.name} (${f.year}) · ${f.how}`}>
                <svg viewBox="0 0 32 24" width="38" height="28" aria-hidden="true">
                  {f.id === 'ingenuity' ? (
                    <g fill="currentColor">
                      <rect x="2" y="4" width="28" height="2" />
                      <rect x="6" y="8" width="20" height="2" />
                      <rect x="15" y="3" width="2" height="9" />
                      <rect x="12" y="12" width="8" height="6" />
                      <path d="M12 18l-5 5h2l4-4zM20 18l5 5h-2l-4-4z" />
                    </g>
                  ) : (
                    <g fill="currentColor">
                      <rect x={f.id === 'sojourner' ? 8 : 4} y="10" width={f.id === 'sojourner' ? 16 : 24} height="6" />
                      <rect x={f.id === 'sojourner' ? 9 : 2} y="7" width={f.id === 'sojourner' ? 14 : 28} height="2" />
                      {f.id !== 'sojourner' && <rect x="22" y="1" width="2" height="7" />}
                      {f.id !== 'sojourner' && <rect x="20" y="0" width="7" height="3" />}
                      <circle cx="8" cy="19" r="3.5" />
                      <circle cx="16" cy="19" r="3.5" />
                      <circle cx="24" cy="19" r="3.5" />
                    </g>
                  )}
                </svg>
                <span>{f.name}</span>
              </div>
            ))}
          </div>
          {hud.petRock && <div className="pet">🪨 Adopted a Mars Pet Rock</div>}
        </Panel>
        <Panel title="Actions">
          <div className="action-grid">
            <Btn small disabled={!hud.scans.length || !!card || !!tuner} onClick={() => doScan(hud.scans[0])} title="Fire the scan laser at the nearest landmark">
              Scan{hud.scans.length ? ` · ${hud.scans[0].name.split(' ').slice(0, 3).join(' ')}` : ' (nothing in range)'}
            </Btn>
            <Btn small disabled={!hud.canBerm} onClick={doBerm} title="Needs the Seismic Drill, LiDAR, or 250 Science Data">
              {hud.berm ? 'Regolith Shield built' : 'Build Regolith Shield'}
            </Btn>
            <Btn small disabled={!hud.canGaze} onClick={doGaze} title="Available at the blue sunset, once per sol">
              Gaze at Pale Blue Dot
            </Btn>
            <Btn small disabled={hud.visorDust < 0.08} onClick={doBrush}>
              {s.has.brush ? 'Electrostatic Dust Brush' : 'Wipe visor'}
            </Btn>
          </div>
          <div className="speed">
            <Btn small tone={userPause ? 'amber' : 'ghost'} onClick={() => { const p = !userPause; setUserPause(p); if (!card && !tuner && !info && !abrade) paused.current = p; }}>
              {userPause ? 'Resume' : 'Pause'}
            </Btn>
            {[1, 2, 4].map((k) => (
              <Btn small key={k} tone={speedUi === k ? 'cyan' : 'ghost'} onClick={() => { speed.current = k; setSpeedUi(k); }}>
                {k}x
              </Btn>
            ))}
          </div>
        </Panel>
        <Panel title="Mission Log">
          <div className="log">
            {hud.log.map((l, i) => (
              <div key={i} className={`tone-${l.tone}`}>
                <b>S{l.sol}</b> {l.text}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="progress-bar">
        <i style={{ width: `${hud.progress * 100}%` }} />
        <span className="mono">
          {hud.km.toFixed(1)} / {s.route.km.toFixed(1)} km · {contract?.short || 'NO CONTRACT'}
        </span>
      </div>

      {seisOn && (
        <div className="seis">
          <div className="panel-head">
            SEISMOGRAPH · CERBERUS FOSSAE <Tag k="seis" inline />
          </div>
          <canvas ref={seisCanvas} width={320} height={90} />
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast tone-${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>

      <div className="ticker mono" title="Simulated Deep Space Network status">
        <div className="ticker-run">
          {[0, 1].map((k) => (
            <span key={k}>
              ◉ DSN LOCK: {dsn} · X-BAND 8.4 GHz · {hud.comms} kbps &nbsp;│&nbsp; REMS AIR {Math.round(hud.ambient)} °C · {hud.wx.pressure} Pa · TAU {hud.wx.tau.toFixed(2)} &nbsp;│&nbsp; {mroTxt} &nbsp;│&nbsp; OWLT {OWLT} · RTLT 28m 44s &nbsp;│&nbsp; ESCAPADE {params.escapade ? 'SYNCED' : 'NO LINK'} &nbsp;│&nbsp; SEED {params.seedText || 'RANDOM'} &nbsp;│&nbsp;
            </span>
          ))}
        </div>
      </div>

      {tuner && (
        <div className="modal-backdrop">
          <div className="modal tone-cyan">
            <div className="eyebrow">UHF SIGNAL ACQUISITION · {HARDWARE_BY_ID[tuner.trig.id].name}</div>
            <h2>Align the carrier frequency</h2>
            <p>Slide until the two tones merge into one, then lock. A cleaner lock returns more of the archive.</p>
            <div className="tuner">
              <div className="tuner-scope">
                <i className="tgt" style={{ left: `${tuner.target}%` }} />
                <i className="cur" style={{ left: `${tuner.val}%` }} />
              </div>
              <input type="range" min="0" max="100" step="0.5" value={tuner.val} onChange={(e) => setTuner((t) => t && { ...t, val: +e.target.value })} />
              <div className="mono tuner-read">
                401.{String(Math.round(500 + tuner.val * 0.9)).padStart(3, '0')} MHz · offset {Math.abs(tuner.val - tuner.target).toFixed(1)} · T-{Math.max(0, tuner.left).toFixed(1)} s
              </div>
            </div>
            <Btn tone="amber" onClick={() => lockSignal()}>
              LOCK SIGNAL
            </Btn>
          </div>
        </div>
      )}

      {card && (
        <div className="modal-backdrop">
          <div className={`modal wide tone-${card.card.tone}`}>
            <div className="eyebrow">{card.card.eyebrow}</div>
            <h2>{card.card.title}</h2>
            <div className="sub mono">
              {card.card.subtitle}
              {card.lock != null && ` · SIGNAL LOCK ${Math.round(card.lock * 100)}%`}
            </div>
            {card.card.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {card.card.quote && (
              <blockquote>
                {card.card.quote}
                <small>{card.card.quoteNote}</small>
              </blockquote>
            )}
            {hw && <div className="holo-note">◈ Holographic prime-state replay is projecting above the hardware. <Tag k="pds" inline /></div>}
            {!card.result ? (
              <div className="choice-list">
                {card.card.choices.map((c, i) => (
                  <button type="button" key={c.label} className="choice" disabled={c.disabled} onClick={() => choose(i)}>
                    <strong>{hw ? (i === 0 ? 'PRESERVE & TRANSMIT · ' : 'SALVAGE · ') : ''}{c.label}</strong>
                    <span>{c.disabled ? c.why : c.detail}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={`result tone-${card.result.tone}`}>
                <p>{card.result.text}</p>
                <Btn tone="amber" onClick={closeCard}>
                  Continue
                </Btn>
              </div>
            )}
          </div>
        </div>
      )}

      {info && (
        <div className="modal-backdrop">
          <div className="modal tone-cyan">
            <div className="eyebrow">LASER SCAN COMPLETE · +{info.sci} SCIENCE DATA</div>
            <h2>{info.name}</h2>
            <p>{info.text}</p>
            {info.id === 'percache' && (
              <div className="record">
                <div className="panel-head">
                  Off-world driving record <Tag k="m2020" inline />
                </div>
                {DRIVE_RECORD.map((r) => (
                  <div key={r.name} className="rec-row">
                    <span>{r.name}</span>
                    <div className="gauge-bar">
                      <div style={{ width: `${(r.km / 46) * 100}%`, background: r.tone }} />
                    </div>
                    <b className="mono">{r.km.toFixed(2)} km</b>
                  </div>
                ))}
                <small>On 11 October 2026 (Sol 2006) Perseverance passed Opportunity's 45.16 km record.</small>
              </div>
            )}
            <div className="choice-list">
              {info.canAbrade && (
                <Btn tone="amber" onClick={() => { setAbrade({ id: info.id, name: info.name, start: performance.now(), depth: 0 }); setInfo(null); }}>
                  Abrade a 50-micron patch
                </Btn>
              )}
              <Btn onClick={() => { setInfo(null); resume(); }}>Continue</Btn>
            </div>
          </div>
        </div>
      )}

      {abrade && (
        <div className="modal-backdrop">
          <div className="modal tone-amber">
            <div className="eyebrow">ABRASION TOOL · {abrade.name}</div>
            <h2>Stop inside the 50-micron zone</h2>
            <p>Organic carbon survives just under the oxidised rind. Too shallow and you read rust; too deep and the bit cooks the organics.</p>
            <div className="micron">
              <i className="zone" style={{ left: `${(ABRASION.zone[0] / ABRASION.maxDepth) * 100}%`, width: `${((ABRASION.zone[1] - ABRASION.zone[0]) / ABRASION.maxDepth) * 100}%` }} />
              <b style={{ width: `${(abrade.depth / ABRASION.maxDepth) * 100}%` }} />
            </div>
            <div className="mono">{Math.round(abrade.depth)} µm</div>
            {!abrade.result ? (
              <Btn tone="amber" onClick={() => stopAbrade()}>
                STOP
              </Btn>
            ) : (
              <div className={`result tone-${abrade.result.inZone ? 'cyan' : 'amber'}`}>
                <p>{abrade.result.inZone ? `Perfect. +${abrade.result.gain} Organic Carbon Science Data.` : `Missed the zone. +${abrade.result.gain} Science Data.`}</p>
                <Btn onClick={() => { setAbrade(null); resume(); }}>Continue</Btn>
              </div>
            )}
          </div>
        </div>
      )}

      {finale === 'plaque' && (
        <div className="finale">
          <div className="eyebrow">SOL 6 · MOUNT SHARP SUMMIT</div>
          <h2>Leave your mark</h2>
          <label className="field">
            <span>Team name</span>
            <input value={team} maxLength={22} onChange={(e) => setTeam(e.target.value)} placeholder="TEAM ARES" />
          </label>
          <label className="field">
            <span>Plaque message</span>
            <input value={message} maxLength={90} onChange={(e) => setMessage(e.target.value)} placeholder="We came in peace for all humankind." />
          </label>
          <Btn tone="amber" onClick={placePlaque}>
            {plaqued ? 'Update Titanium Plaque' : 'Place Titanium Plaque'}
          </Btn>
          {s.has.rtg && (
            <label className="check">
              <input type="checkbox" checked={contained} onChange={(e) => setContainedUi(e.target.checked)} />
              <span>
                Safe MMRTG Containment <small>COSPAR disposal protocol: cask the Pu-238 source before ascent</small>
              </span>
            </label>
          )}
          <Tag k="cospar" />
          <Btn className="btn-xl" disabled={!plaqued} onClick={() => toDocking()}>
            Board the MAV · Orbital Docking
          </Btn>
        </div>
      )}
      {finale === 'dock' && (
        <div className="modal-backdrop solid">
          <div className="modal wide tone-cyan dock">
            <div className="eyebrow">MARS SAMPLE RETURN · EARTH RETURN ORBITER RENDEZVOUS</div>
            <canvas ref={dockCanvas} width={720} height={380} />
            {dockMsg ? (
              <div className="result tone-cyan"><p>{dockMsg}</p></div>
            ) : (
              <Btn tone="amber" className="btn-xl" onClick={() => { if (!dockGame.current?.tryLock()) audio.deny(); }}>
                LOCK DOCKING CLAMPS
              </Btn>
            )}
            <small>Click when the orbiter's docking ring sits inside the reticle (it turns green).</small>
          </div>
        </div>
      )}
      <AdvisorRadio queue={radio.queue} onDismiss={radio.dismiss} />
    </div>
  );
}
