// SOL 60 — the 3D mission stage: builds the WebGL world, runs the 60 fps loop, routes input, renders the HUD.
// Loaded lazily (React.lazy) so Three.js is not part of the title-screen bundle.

import { useEffect, useRef, useState } from 'react';
import { hashSeed, getTerrainHeight, clamp } from '../engine/terrainPhysics.js';
import { createWorld } from '../engine/proceduralWorld.js';
import { makeSim, createGame } from '../engine/game.js';
import { audio } from '../engine/audioSynth.js';
import { Hud, CodexPanel, buildMinimapBase, drawMinimap, drawCompass } from '../components/HudAndMinimap.jsx';
import { drawBeacons } from '../ui/beaconHud.js';
import PuzzleOverlay from '../ui/PuzzleOverlay.jsx';
import TouchControls from '../ui/TouchControls.jsx';

// ======================================================================= game stage
export default function GameStage({ mode, custom, settings, keys, paused, onEnd, onOpenSettings }) {
  const box = useRef(null);
  const simRef = useRef(null);
  const worldRef = useRef(null);
  const dom = useRef({}).current;
  const keysRef = useRef(keys);
  const settingsRef = useRef(settings);
  const pausedRef = useRef(paused);
  const onEndRef = useRef(onEnd);
  const [hud, setHud] = useState(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [failed, setFailed] = useState(null);
  const gameRef = useRef(null);
  const touchSink = useRef(null);

  keysRef.current = keys;
  pausedRef.current = paused;
  onEndRef.current = onEnd;
  useEffect(() => {
    settingsRef.current = settings;
    worldRef.current?.applyGraphics(settings);
  }, [settings]);
  useEffect(() => {
    if (paused && document.pointerLockElement) document.exitPointerLock?.();
  }, [paused]);

  useEffect(() => {
    const seed = hashSeed(`ARES7-${Date.now()}-${Math.random()}`);
    let world;
    try {
      world = createWorld(box.current, { seed, custom, settings: settingsRef.current, mode });
    } catch (err) {
      console.error(err);
      setFailed(String(err?.message || err));
      return undefined;
    }
    worldRef.current = world;
    const sim = makeSim(mode, custom, seed);
    simRef.current = sim;
    const mmBase = buildMinimapBase(384);
    gameRef.current = null;
    const T = createGame(sim, world, dom, keysRef, settingsRef, setCodexOpen);
    gameRef.current = T;
    if (mode === 'ascent') T.startAscentMode();
    else T.prepareLanding();
    // Opt-in inspection hook for testing: open the game with ?debug in the URL.
    if (/[?&]debug\b/.test(window.location.search)) window.__SOL60__ = { sim, world, game: T, getTerrainHeight };

    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
      last = now;
      if (!pausedRef.current) T.update(dt);
      T.render(dt);
      if ((sim.frame & 1) === 0 && !sim.flags.hudHidden) {
        if (dom.minimap) drawMinimap(dom.minimap, mmBase, T.minimapInfo());
        if (dom.compass) drawCompass(dom.compass, T.compassInfo());
        if (dom.beacon && settingsRef.current.captions !== false) drawBeacons(dom.beacon, dom.beaconText, T.beaconInfo(), sim.t);
      }
    };
    raf = requestAnimationFrame(loop);

    // 5 Hz HUD sync (outside requestAnimationFrame)
    let endSent = false;
    const hudTimer = setInterval(() => {
      setHud(T.snapshot());
      if (sim.ended && !endSent) {
        endSent = true;
        onEndRef.current(sim.ended);
      }
    }, 200);

    // input
    const K = () => keysRef.current;
    const actionOf = (code) => Object.keys(K()).find((a) => K()[a] === code);
    const onKeyDown = (e) => {
      if (pausedRef.current || sim.puzzle) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        // keyboard zoom (trackpads without a scroll wheel)
        sim.cam.dist = clamp(sim.cam.dist + (e.code === 'Equal' || e.code === 'NumpadAdd' ? -0.8 : 0.8), 3, 16);
        return;
      }
      audio.init();
      if (e.code === 'Escape') {
        e.preventDefault();
        onOpenSettings();
        return;
      }
      const a = actionOf(e.code);
      if (a || e.code.startsWith('Digit')) e.preventDefault();
      if (e.repeat && a !== 'forward' && a !== 'back' && a !== 'left' && a !== 'right') return;
      if (e.code === 'Digit1' || e.code === 'Digit2') T.selectBuild(e.code === 'Digit1' ? 'habitat' : 'planter');
      if (!a) return;
      sim.input.keys[a] = true;
      T.onAction(a);
    };
    const onKeyUp = (e) => {
      const a = actionOf(e.code);
      if (a) sim.input.keys[a] = false;
      if (a === 'interact') sim.input.interactHeld = false;
    };
    const onBlur = () => {
      sim.input.keys = {};
      sim.input.interactHeld = false;
      sim.input.mouseDown = false;
    };
    const canvas = world.renderer.domElement;
    const onMouseDown = (e) => {
      audio.init();
      if (pausedRef.current || sim.puzzle) return;
      if (sim.cine) {
        // cutscene: drag to orbit freely (no pointer lock)
        sim.input.mouseDown = true;
        return;
      }
      if (e.button === 0) {
        if (sim.build.active) {
          T.onAction('interact');
          return;
        }
        if (!document.pointerLockElement) {
          try {
            const p = canvas.requestPointerLock?.();
            if (p && p.catch) p.catch(() => {});
          } catch {
            /* pointer lock unsupported: drag-to-look still works */
          }
        }
      }
      sim.input.mouseDown = true;
    };
    const onMouseUp = () => (sim.input.mouseDown = false);
    const onMouseMove = (e) => {
      if (pausedRef.current) return;
      const locked = document.pointerLockElement === canvas;
      if (!locked && !sim.input.mouseDown) return;
      const s = settingsRef.current.sensitivity || 1;
      if (sim.cine) {
        T.cineLook.yaw -= e.movementX * 0.005 * s;
        T.cineLook.pitch = clamp(T.cineLook.pitch + e.movementY * 0.004 * s, -0.9, 1.2);
        return;
      }
      sim.cam.yaw -= e.movementX * 0.0026 * s;
      sim.cam.pitch = clamp(sim.cam.pitch + e.movementY * 0.0022 * s, -0.25, 1.25);
      sim.cam.lastMouse = sim.t;
    };
    const onWheel = (e) => {
      sim.cam.dist = clamp(sim.cam.dist + Math.sign(e.deltaY) * 0.8, 3, 16);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      if (document.pointerLockElement) document.exitPointerLock?.();
      audio.stopAll();
      world.dispose();
      worldRef.current = null;
      simRef.current = null;
    };
    // Mission is built once per mount (the parent remounts with a new key per run).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Touch input adapter: writes straight into the mutable sim, like the keyboard handlers. */
  function getTouchSink() {
    if (touchSink.current) return touchSink.current;
    touchSink.current = {
      move(x, y) {
        const sim = simRef.current;
        if (!sim) return;
        sim.input.keys.forward = y > 0.2;
        sim.input.keys.back = y < -0.2;
        sim.input.keys.right = x > 0.2;
        sim.input.keys.left = x < -0.2;
      },
      press(action, down) {
        const sim = simRef.current;
        const T = gameRef.current;
        if (!sim || !T) return;
        audio.init();
        sim.input.keys[action] = down;
        if (down) T.onAction(action);
        if (!down && action === 'interact') sim.input.interactHeld = false;
      },
      look(dx, dy) {
        const sim = simRef.current;
        const T = gameRef.current;
        if (!sim || !T) return;
        if (sim.cine) {
          T.cineLook.yaw -= dx * 0.006;
          T.cineLook.pitch = clamp(T.cineLook.pitch + dy * 0.005, -0.9, 1.2);
          return;
        }
        sim.cam.yaw -= dx * 0.005;
        sim.cam.pitch = clamp(sim.cam.pitch + dy * 0.004, -0.25, 1.25);
        sim.cam.lastMouse = sim.t;
      },
    };
    return touchSink.current;
  }

  if (failed) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-slate-200">
        <div>
          <h2 className="text-xl text-red-300">3D view unavailable</h2>
          <p className="mt-2 max-w-md text-sm text-slate-400">WebGL could not start on this device ({failed}). Try enabling hardware acceleration or another browser.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0">
      <div ref={box} className="absolute inset-0" />
      <Hud
        hud={hud ? { ...hud, captions: settings.captions !== false } : hud}
        dom={dom}
        keys={keys}
        onOpenSettings={onOpenSettings}
        onToggleCodex={() => {
          setCodexOpen((o) => !o);
          if (simRef.current) simRef.current.codexOpen = !simRef.current.codexOpen;
        }}
      />
      <CodexPanel open={codexOpen} onClose={() => setCodexOpen(false)} seen={hud?.codexSeen} />
      {settings.touchControls && hud && !hud.puzzle && <TouchControls sink={getTouchSink()} />}
      {hud?.puzzle && (
        <PuzzleOverlay
          key={hud.puzzle.id + hud.puzzle.seed}
          request={hud.puzzle}
          reducedMotion={!!settings.reducedMotion}
          onDone={(ok) => {
            gameRef.current?.puzzleDone(hud.puzzle.id, ok);
            setHud((h) => (h ? { ...h, puzzle: null } : h));
          }}
        />
      )}
    </div>
  );
}
