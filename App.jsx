import { useEffect, useMemo, useRef, useState } from 'react';
import { VEHICLES, CONTRACT_BY_ID, MODES, ITEMS, applyWindow } from './game/data.js';
import { hashSeed } from './game/sim.js';
import { buildDebrief } from './game/debrief.js';
import { parseBlueprint } from './systems/nasaDataIntegrations.js';
import { makePatchCanvas } from './systems/ultimateFeatures.js';
import { BunkerScene } from './three/BunkerScene.js';
import { audio } from './audio/audio.js';
import { UIContext, Toggle, PatchImg, Btn } from './ui/common.jsx';
import { TitleScreen } from './ui/TitleScreen.jsx';
import { BriefingStage, BunkerStage } from './ui/BunkerStage.jsx';
import { MapStage, EdlStage } from './ui/MapStage.jsx';
import { SurfaceStage } from './ui/SurfaceStage.jsx';
import { DebriefStage } from './ui/DebriefStage.jsx';
import { ArchiveModal } from './ui/ArchiveModal.jsx';

const STAGE_NAME = {
  title: 'TITLE',
  brief: 'STAGE 1 · MISSION DESIGN',
  bunker: 'STAGE 1 · EARTH BUNKER',
  map: 'STAGE 2 · MARS TREK PLANNER',
  edl: 'STAGE 3 · ENTRY, DESCENT & LANDING',
  surface: 'STAGE 3 · MARS SURFACE',
  debrief: 'STAGE 4 · ENGINEERING DEBRIEF',
};

// The bunker in slow orbit behind the title screen.
function TitleBackdrop() {
  const box = useRef(null);
  useEffect(() => {
    const sc = new BunkerScene(box.current, {});
    sc.setMode('attract');
    return () => sc.dispose();
  }, []);
  return <div ref={box} className="viewport backdrop" />;
}

export default function App() {
  const [stage, setStage] = useState('title');
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState('director');
  const [judge, setJudge] = useState(false);
  const [seedText, setSeedText] = useState('GALE-2026');
  const [patch, setPatch] = useState({ icon: 'rocket', rim: '#e8622a', motto: 'DARE MIGHTY THINGS' });
  const [contractId, setContractId] = useState(null);
  const [windowId, setWindowId] = useState('hohmann');
  const [vehicleId, setVehicleId] = useState('sls');
  const [packed, setPacked] = useState([]);
  const [preset, setPreset] = useState(null);
  const [plan, setPlan] = useState(null);
  const [edl, setEdl] = useState(null);
  const [seedNum, setSeedNum] = useState(0);
  const [result, setResult] = useState(null);
  const [archive, setArchive] = useState(false);
  const [lunar, setLunar] = useState(false);
  const [dataTags, setDataTags] = useState(false);
  const [xray, setXray] = useState(false);
  const [marsAudio, setMarsAudio] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blueprint, setBlueprint] = useState('');
  const [bpError, setBpError] = useState('');

  const patchCanvas = useMemo(() => makePatchCanvas(patch, 256), [patch]);
  const patchUrl = useMemo(() => {
    try {
      return patchCanvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }, [patchCanvas]);

  const vehicle = useMemo(() => applyWindow(VEHICLES[vehicleId], windowId), [vehicleId, windowId]);
  const effMode = judge ? 'cadet' : mode;
  const contract = contractId ? CONTRACT_BY_ID[contractId] : null;

  useEffect(() => {
    const k = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'KeyX' && !e.repeat) {
        setXray((v) => !v);
        audio.click();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => audio.setMarsFilter(marsAudio), [marsAudio]);
  useEffect(() => audio.setMuted(muted), [muted]);

  const begin = (asJudge) => {
    audio.init();
    setJudge(asJudge);
    setPacked([]);
    setPlan(null);
    setEdl(null);
    setResult(null);
    setRun((r) => r + 1);
    setSeedNum(hashSeed(asJudge ? seedText || 'JUDGE-DEMO' : seedText));
    if (asJudge) {
      setContractId('rescue');
      setWindowId('hohmann');
      setVehicleId('sls');
      setPreset(null);
      setStage('bunker');
    } else setStage('brief');
  };

  const loadBlueprint = () => {
    const b = parseBlueprint(blueprint);
    if (!b) {
      setBpError('Not a valid SOL60 blueprint code.');
      return;
    }
    setBpError('');
    setMode(b.mode);
    setVehicleId(b.vehicleId);
    setWindowId(b.windowId);
    setContractId(b.contractId && CONTRACT_BY_ID[b.contractId] ? b.contractId : null);
    setSeedText(b.seedText === 'RANDOM' ? '' : b.seedText);
    setPreset({ packed: b.packed, waypoints: b.waypoints });
    audio.init();
    setJudge(false);
    setPacked([]);
    setRun((r) => r + 1);
    setSeedNum(hashSeed(b.seedText === 'RANDOM' ? '' : b.seedText));
    setStage('brief');
  };

  const params = useMemo(
    () =>
      plan && edl
        ? {
            vehicle,
            packed,
            route: plan.route,
            seed: seedNum,
            seedText,
            mode: effMode,
            contract: contractId,
            damaged: edl.damaged,
            repaired: edl.repaired,
            escapade: plan.escapade,
            sterilized: plan.sterilized,
            softLanding: edl.soft,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, edl],
  );

  const onEnd = ({ s, frame, docked, team }) => {
    const ctx = { contract, seedText, docked, layers: plan.layers, lunar };
    setResult({ d: buildDebrief(s, ctx), ctx, record: s.record, contained: s.flags.contained, frame, team });
    setStage('debrief');
  };

  return (
    <UIContext.Provider value={{ dataTags }}>
      <div className={`app stage-${stage}`}>
        <div className="topbar">
          <PatchImg src={patchUrl} size={30} />
          <span className="brand">SOL 60: RED HORIZON</span>
          <span className="stage-name mono">
            {STAGE_NAME[stage]}
            {judge && stage !== 'title' ? ' · JUDGE QUICK-TOUR' : ''}
            {stage !== 'title' ? ` · ${MODES[effMode].name.toUpperCase()}` : ''}
          </span>
          <div className="topbar-right">
            <Toggle on={dataTags} onClick={() => setDataTags(!dataTags)} title="Show the NASA dataset or instrument behind each number">
              NASA Data Tags
            </Toggle>
            <Toggle on={xray} onClick={() => setXray(!xray)} title="Systems-engineering X-ray view (shortcut: X)">
              X-Ray View
            </Toggle>
            <Toggle on={marsAudio} onClick={() => setMarsAudio(!marsAudio)} title="Low-pass ~600 Hz and a slight delay: how sound carries in thin CO2">
              Mars CO2 Audio Filter
            </Toggle>
            <Toggle on={muted} onClick={() => setMuted(!muted)}>
              Mute
            </Toggle>
            {stage !== 'title' && stage !== 'debrief' && (
              <Btn small tone="ghost" onClick={() => setStage('title')}>
                Abort
              </Btn>
            )}
          </div>
        </div>

        {stage === 'title' && (
          <>
            <TitleBackdrop />
            <TitleScreen
              mode={mode}
              setMode={setMode}
              seedText={seedText}
              setSeedText={setSeedText}
              patch={patch}
              setPatch={setPatch}
              patchUrl={patchUrl}
              onStart={() => begin(false)}
              onJudge={() => begin(true)}
              onArchive={() => setArchive(true)}
              blueprint={blueprint}
              setBlueprint={setBlueprint}
              onLoadBlueprint={loadBlueprint}
              blueprintError={bpError}
            />
          </>
        )}
        {stage === 'brief' && (
          <BriefingStage
            mode={effMode}
            contractId={contractId}
            setContractId={setContractId}
            windowId={windowId}
            setWindowId={setWindowId}
            vehicleId={vehicleId}
            setVehicleId={setVehicleId}
            onBack={() => setStage('title')}
            onConfirm={() => setStage('bunker')}
          />
        )}
        {stage === 'bunker' && (
          <BunkerStage
            key={run}
            mode={effMode}
            judge={judge}
            vehicle={vehicle}
            contract={contract}
            xray={xray}
            preset={preset?.packed}
            onLaunch={(ids) => {
              setPacked(ids);
              setStage('map');
            }}
          />
        )}
        {stage === 'map' && (
          <MapStage
            key={run}
            judge={judge}
            vehicle={vehicle}
            packed={packed}
            initialWaypoints={preset?.waypoints}
            onConfirm={(p) => {
              setPlan(p);
              setStage('edl');
            }}
          />
        )}
        {stage === 'edl' && (
          <EdlStage
            key={run}
            judge={judge}
            packed={packed}
            mass={packedMass(packed)}
            seedNum={seedNum}
            onDone={(r) => {
              setEdl(r);
              setStage('surface');
            }}
          />
        )}
        {stage === 'surface' && params && (
          <SurfaceStage key={run} judge={judge} params={params} contract={contract} patchUrl={patchUrl} patchCanvas={patchCanvas} xray={xray} onEnd={onEnd} />
        )}
        {stage === 'debrief' && result && (
          <DebriefStage
            d={result.d}
            params={params}
            record={result.record}
            contained={result.contained}
            ctx={result.ctx}
            frame={result.frame}
            patchCanvas={patchCanvas}
            patchUrl={patchUrl}
            team={result.team}
            onRelaunch={() => begin(false)}
            onTitle={() => setStage('title')}
            onArchive={() => setArchive(true)}
          />
        )}
        {archive && <ArchiveModal onClose={() => setArchive(false)} onLunar={() => setLunar(true)} />}
      </div>
    </UIContext.Provider>
  );
}

function packedMass(ids) {
  return ids.reduce((a, id) => a + (ITEM_MASS[id] || 0), 0);
}
const ITEM_MASS = Object.fromEntries(ITEMS.map((i) => [i.id, i.mass]));
