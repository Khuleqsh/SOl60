// SOL 60: RED HORIZON — app shell: stage flow (Title -> Bunker Hangar -> Mars -> Debrief).
// Heavy 3D stages are code-split with React.lazy, so the title screen loads without Three.js.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { audio } from './engine/audioSynth.js';
import { TitleScreen } from './ui/TitleScreen.jsx';
import { SettingsModal } from './ui/SettingsModal.jsx';
import { loadPrefs, savePrefs } from './ui/prefs.js';
import { ErrorBoundary, StageLoading } from './ui/common.jsx';

const HangarStage = lazy(() => import('./components/CustomizationModals.jsx').then((m) => ({ default: m.HangarStage })));
const GameStage = lazy(() => import('./stages/GameStage.jsx'));
const Debrief = lazy(() => import('./ui/Debrief.jsx'));

// ======================================================================= app shell
export default function App() {
  const prefs = useRef(loadPrefs()).current;
  const [settings, setSettings] = useState(prefs.settings);
  const [keys, setKeys] = useState(prefs.keys);
  const [custom, setCustom] = useState(prefs.custom);
  const [stage, setStage] = useState('title');
  const [mode, setMode] = useState('campaign');
  const [run, setRun] = useState(0);
  const [result, setResult] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => savePrefs({ settings, keys, custom }), [settings, keys, custom]);
  useEffect(() => {
    audio.setVolume(settings.volume);
    audio.setMarsFilter(settings.marsFilter);
  }, [settings.volume, settings.marsFilter]);

  const start = (m) => {
    setMode(m);
    setResult(null);
    setRun((r) => r + 1);
    setStage(m === 'campaign' ? 'hangar' : 'game');
  };
  const onEnd = useCallback((res) => {
    setResult(res);
    setStage('debrief');
  }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${settings.reducedMotion ? 'reduce-motion' : ''}`}>
      {stage === 'title' && <TitleScreen onStart={start} onSettings={() => setSettingsOpen(true)} />}
      <ErrorBoundary key={stage + run} onReset={() => setStage('title')}>
      <Suspense fallback={<StageLoading label={stage === 'debrief' ? 'Compiling mission debrief…' : 'Loading 3D mission systems…'} />}>
      {stage === 'hangar' && <HangarStage custom={custom} setCustom={setCustom} onLaunched={() => setStage('game')} onBack={() => setStage('title')} />}
      {stage === 'game' && (
        <GameStage
          key={run}
          mode={mode}
          custom={custom}
          settings={settings}
          keys={keys}
          paused={settingsOpen}
          onEnd={onEnd}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      {stage === 'debrief' && result && <Debrief result={result} onRestart={() => start(mode)} onTitle={() => setStage('title')} />}
      </Suspense>
      </ErrorBoundary>
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          setSettings={setSettings}
          keys={keys}
          setKeys={setKeys}
          onClose={() => setSettingsOpen(false)}
          onQuit={
            stage === 'game'
              ? () => {
                  setSettingsOpen(false);
                  setStage('title');
                }
              : null
          }
        />
      )}
    </div>
  );
}

