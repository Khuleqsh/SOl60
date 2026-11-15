// SOL 60: RED HORIZON — NASA Pioneers, Bright Angel SHERLOC scan and the UHF Ghost Mesh.
//  createScienceWorld: 3D objects (dormant pioneers, holographic prime-state replays, beacon pillars, mesh arcs, outcrop).
//  createScienceGame:  per-frame logic (Morse beacon tracking, 5 s dish lock, replay -> Preserve / Salvage, 2 s abrasion scan).
// Everything real-time lives in the shared mutable `sim` object; React only sees snapshot() at 5 Hz.

import * as THREE from 'three';
import { PIONEERS, PIONEER_LOCK_SECONDS, SCIENCE_SITES, INSIGHTS, RADIO_SCIENCE, BEACON_RANGE } from '../data/scienceData.js';
import { SHELTERS } from '../data/nasaData.js';
import { getTerrainHeight, getTerrainNormal, clamp } from './terrainPhysics.js';
import { buildPioneerModel, buildSherlocRock, toHologram, weather } from './archiveModels.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const REPLAY_SECONDS = 9;
const MODEL_SCALE = { mer: 1.5, insight: 1.0, heli: 2.2 };
const COLLIDER_R = { mer: 1.7, insight: 2.1, heli: 0.9 };

// ---------------------------------------------------------------- 3D world objects
export function createScienceWorld(scene, collision) {
  const nrm = { x: 0, y: 1, z: 0 };
  const pioneers = PIONEERS.map((def, idx) => {
    const y = getTerrainHeight(def.x, def.z);
    const root = new THREE.Group();
    root.position.set(def.x, y, def.z);
    scene.add(root);
    const scale = MODEL_SCALE[def.kind] || 1;

    // dormant, dust-weathered machine settled into the regolith (tilted to the local slope)
    const model = buildPioneerModel(def.kind);
    weather(model.group, 0.5);
    getTerrainNormal(def.x, def.z, undefined, nrm);
    const tilt = new THREE.Group();
    tilt.quaternion.setFromUnitVectors(UP, new V3(nrm.x, nrm.y, nrm.z));
    tilt.add(model.group);
    model.group.scale.setScalar(scale);
    model.group.rotation.y = idx * 1.9 + 0.6;
    if (def.kind === 'mer') model.group.rotation.z = 0.08; // wheel dug into soft sand
    if (def.kind === 'heli') model.group.position.y = -0.02;
    root.add(tilt);

    // holographic prime-state ghost (hidden until the dish is locked)
    const ghost = buildPioneerModel(def.kind);
    toHologram(ghost.group);
    ghost.group.scale.setScalar(scale);
    ghost.group.visible = false;
    root.add(ghost.group);

    // ground ring + beacon pillar (colour: amber = unfound, cyan = preserved, grey = salvaged)
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.9, 44), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    root.add(ring);
    const pillarMat = new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.45, 46, 10, 1, true), pillarMat);
    pillar.position.y = 23;
    root.add(pillar);

    // marsquake ripples for the InSight replay
    const ripples = [];
    if (def.kind === 'insight') {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.MeshBasicMaterial({ color: '#58e1ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const r = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), m);
        r.rotation.x = -Math.PI / 2;
        r.position.y = 0.12;
        r.visible = false;
        root.add(r);
        ripples.push(r);
      }
    }
    collision.addStatic({ x: def.x, z: def.z, r: COLLIDER_R[def.kind] || 1.5, tag: 'pioneer' });
    return { def, root, model, ghost, scale, ring, ringMat, pillar, pillarMat, ripples, baseY: y, link: null };
  });

  // Bright Angel outcrop
  const sd = SCIENCE_SITES.sherloc;
  const sy = getTerrainHeight(sd.x, sd.z);
  const rock = buildSherlocRock();
  rock.group.position.set(sd.x, sy, sd.z);
  rock.group.scale.setScalar(1.25);
  scene.add(rock.group);
  collision.addStatic({ x: sd.x, z: sd.z, r: 1.9, tag: 'rock' });
  const sherlocRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 2.65, 40),
    new THREE.MeshBasicMaterial({ color: '#b46bff', transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  sherlocRing.rotation.x = -Math.PI / 2;
  sherlocRing.position.set(sd.x, sy + 0.08, sd.z);
  scene.add(sherlocRing);

  // UHF Ghost Mesh: cyan relay arcs with travelling data packets
  const links = [];
  const arcMat = new THREE.MeshBasicMaterial({ color: '#4be3ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const packetGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const packetMat = new THREE.MeshBasicMaterial({ color: '#c8fbff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  function addLink(a, b) {
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    const lift = 5 + dist * 0.14;
    const mid = new V3((a.x + b.x) / 2, Math.max(a.y, b.y) + lift, (a.z + b.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new V3(a.x, a.y, a.z), mid, new V3(b.x, b.y, b.z));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.09, 6, false), arcMat);
    scene.add(mesh);
    const packets = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(packetGeo, packetMat);
      scene.add(p);
      packets.push({ mesh: p, k: i / 3 });
    }
    links.push({ curve, mesh, packets });
  }

  const _p = new V3();
  function animate(t, dt) {
    for (const link of links) {
      for (const p of link.packets) {
        p.k = (p.k + dt * 0.28) % 1;
        link.curve.getPoint(p.k, _p);
        p.mesh.position.copy(_p);
      }
    }
    arcMat.opacity = 0.4 + Math.sin(t * 3) * 0.12;
    sherlocRing.material.opacity = 0.35 + Math.sin(t * 3) * 0.2;
  }

  return { pioneers, rock, sherlocRing, sherlocBaseY: sy, addLink, animate, links };
}

// ---------------------------------------------------------------- per-frame logic
/**
 * ctx: { sim, world, V, P, audio, say, log, toast, codex, dist2, camForward, endMission, showInsight }
 * Adds sim.sci and returns the interaction / update / HUD helpers used by App.jsx.
 */
export function createScienceGame(ctx) {
  const { sim, world, V, P, audio, say, log, toast, codex, dist2, camForward, endMission, showInsight, requestPuzzle } = ctx;
  const sw = world.science;
  const fx = sim.fx;
  const sciMul = fx.sciMul;
  const st = {
    pioneers: Object.fromEntries(PIONEERS.map((p) => [p.id, { state: 'unfound', replayT: 0 }])),
    hold: { id: null, t: 0, need: 1 },
    sherloc: { done: false },
    preserved: 0,
    salvaged: 0,
    beaconSaid: false,
    meshInsight: false,
    expeditionDone: false,
  };
  sim.sci = st;
  const byId = Object.fromEntries(sw.pioneers.map((p) => [p.def.id, p]));
  const hab = SHELTERS[0];
  const habAnchor = { x: hab.x, y: getTerrainHeight(hab.x, hab.z) + 4.2, z: hab.z };

  const resolved = (id) => st.pioneers[id].state === 'preserved' || st.pioneers[id].state === 'salvaged';
  const resolvedCount = () => PIONEERS.filter((p) => resolved(p.id)).length;

  // -------- interaction scan (called from scanInteract, before device checks)
  function scan() {
    if (sim.build.active || sim.phase !== 'play') return null;
    for (const p of PIONEERS) {
      const s = st.pioneers[p.id];
      const d = dist2(P.x, P.z, p.x, p.z);
      if (s.state === 'unfound' && d < 6.5) {
        return { pr: { key: 'interact', text: `Hold to lock the dish on ${p.code} · ${p.name}` }, act: 'science', id: `pioneer:${p.id}` };
      }
      if (s.state === 'replay' && d < 14) return { pr: { key: null, text: `${p.name} · holographic prime-state replay…` }, act: null };
      if (s.state === 'choice' && d < 12) {
        return {
          pr: { key: 'interact', text: `Preserve & link UHF Ghost Mesh   ·   [Q] Salvage parts` },
          act: () => decide(p.id, 'preserve'),
        };
      }
    }
    const sd = SCIENCE_SITES.sherloc;
    if (!st.sherloc.done && dist2(P.x, P.z, sd.x, sd.z) < 4.6) {
      return { pr: { key: 'interact', text: 'Hold to abrade & scan the Bright Angel outcrop (SHERLOC)' }, act: 'science', id: 'sherloc' };
    }
    return null;
  }

  /** The rotate key (Q) salvages when a pioneer is waiting for its decision. Returns true if it handled the key. */
  function salvageKey() {
    for (const p of PIONEERS) {
      if (st.pioneers[p.id].state === 'choice' && dist2(P.x, P.z, p.x, p.z) < 12) {
        decide(p.id, 'salvage');
        return true;
      }
    }
    return false;
  }

  // -------- hold-to-complete tasks (lock = 5 s, abrasion = 2 s)
  function tickHold(id, held, dt) {
    const h = st.hold;
    sim.sciHolding = false;
    if (!id || !held) {
      h.t = Math.max(0, h.t - dt * 2.5);
      if (h.t === 0) h.id = null;
      sim.sciProg = h.t / h.need;
      return false;
    }
    if (h.id !== id) {
      h.id = id;
      h.t = 0;
      h.need = id === 'sherloc' ? SCIENCE_SITES.sherloc.scanSeconds : PIONEER_LOCK_SECONDS;
    }
    h.t += dt * (sim.tour ? 3 : 1);
    sim.sciHolding = true;
    sim.sciProg = clamp(h.t / h.need, 0, 1);
    if (id === 'sherloc') {
      const sd = SCIENCE_SITES.sherloc;
      P.facing = Math.atan2(sd.x - P.x, sd.z - P.z);
      sim.audioState = { ...(sim.audioState || {}), laser: 1 };
    } else {
      const p = PIONEERS.find((k) => `pioneer:${k.id}` === id);
      if (p) P.facing = Math.atan2(p.x - P.x, p.z - P.z);
      if (((h.t * 8) | 0) !== (((h.t - dt) * 8) | 0)) audio.beep(500 + (h.t / h.need) * 900);
    }
    if (h.t >= h.need) {
      h.t = 0;
      h.id = null;
      sim.sciProg = 0;
      // abrasion done: now match the laser bands to the mineral's absorption features (spectroscopy puzzle)
      if (id === 'sherloc') {
        if (requestPuzzle && !sim.tour) requestPuzzle('spectro', 'sherloc', { tol: fx.spectroTol, mineral: 'smectite' }, completeSherloc);
        else completeSherloc();
      }
      else completeLock(id.slice(8));
      return false;
    }
    return true;
  }

  function completeLock(pid) {
    const def = PIONEERS.find((p) => p.id === pid);
    const s = st.pioneers[pid];
    s.state = 'replay';
    s.replayT = 0;
    byId[pid].ghost.group.visible = true;
    audio.success();
    log(`Locked the dish on ${def.name} (${def.code}). Holographic prime-state replay started.`);
    showInsight(def.insight, 20);
    codex(def.codex);
    sim.stats.echoes++;
    V.focus = Math.min(100, V.focus + 8 * sciMul);
    if (pid === 'opportunity') codex('meda');
    if (pid === 'insight') codex('seis');
  }

  function decide(pid, how) {
    const def = PIONEERS.find((p) => p.id === pid);
    const s = st.pioneers[pid];
    const o = byId[pid];
    if (s.state !== 'choice') return;
    if (how === 'preserve') {
      s.state = 'preserved';
      st.preserved++;
      // chain to the nearest node: Ridgeback Hab or any previously preserved pioneer
      let best = habAnchor;
      let bd = dist2(def.x, def.z, habAnchor.x, habAnchor.z);
      for (const q of PIONEERS) {
        if (st.pioneers[q.id].state !== 'preserved' || q.id === pid) continue;
        const d = dist2(def.x, def.z, q.x, q.z);
        if (d < bd) {
          bd = d;
          best = { x: q.x, y: byId[q.id].baseY + 3.2, z: q.z };
        }
      }
      sw.addLink({ x: def.x, y: o.baseY + 3.2, z: def.z }, best);
      o.ringMat.color.set('#4be3ff');
      o.pillarMat.color.set('#4be3ff');
      V.focus = Math.min(100, V.focus + 14 * sciMul);
      say(RADIO_SCIENCE.preserved);
      log(`Preserved ${def.name}: linked to the UHF Ghost Mesh (${st.preserved} node${st.preserved > 1 ? 's' : ''}). Each link shortens the Earth uplink.`);
      toast(`Ghost Mesh node linked · ${def.name}`, 3);
      if (!st.meshInsight) {
        st.meshInsight = true;
        codex('cospar');
        showInsight(INSIGHTS.mesh, 14);
      }
    } else {
      s.state = 'salvaged';
      st.salvaged++;
      o.model.group.scale.y *= 0.45;
      o.model.group.rotation.x += 0.25;
      o.ringMat.color.set('#6b6f76');
      o.pillarMat.opacity = 0;
      V.battery = Math.min(100, V.battery + 40);
      V.o2 = Math.min(V.o2Cap, V.o2 + 25);
      V.health = Math.min(100, V.health + 20);
      sim.kits.planter += sim.sandbox ? 0 : 1;
      say(RADIO_SCIENCE.salvaged);
      log(`Salvaged ${def.name}: +40 battery, +25 O2, +20 suit integrity, +1 planter kit.`);
      toast(`Salvaged ${def.name}: battery, oxygen, suit patch`, 3);
    }
    audio.success();
    if (sim.insight && sim.insight.choice) sim.insight.t = Math.min(sim.insight.t, 6);
  }

  function completeSherloc() {
    st.sherloc.done = true;
    sim.stats.sherloc = true;
    audio.success();
    say(RADIO_SCIENCE.sherlocDone);
    log('SHERLOC scan of Bright Angel: complex organic carbon detected microns beneath the UV-scorched surface.');
    showInsight(INSIGHTS.sherloc, 18);
    codex('sherloc');
    V.focus = Math.min(100, V.focus + 15 * sciMul);
    sim.stats.sciScore = (sim.stats.sciScore || 0) + Math.round(150 * sciMul);
  }

  // -------- per-frame state update (gameplay clock)
  function tick(dt) {
    if (!st.beaconSaid && sim.t > 8 && sim.phase === 'play') {
      st.beaconSaid = true;
      say(RADIO_SCIENCE.beacon);
    }
    // replay countdown -> choice
    for (const p of PIONEERS) {
      const s = st.pioneers[p.id];
      if (s.state === 'replay') {
        s.replayT += dt * (sim.tour ? 2.6 : 1);
        if (s.replayT >= REPLAY_SECONDS) {
          s.state = 'choice';
          byId[p.id].ghost.group.visible = false;
          if (sim.tour) decide(p.id, p.id === 'ingenuity' ? 'salvage' : 'preserve');
          else toast(`${p.name}: Preserve (${'E'}) or Salvage (Q)?`, 3);
        }
      }
    }
    // stereo Morse beacons: the two nearest unfound pioneers
    const list = [];
    if (sim.phase === 'play' && !sim.sleep) {
      const f = camForward();
      const rx = -f.z;
      const rz = f.x;
      for (const p of PIONEERS) {
        if (st.pioneers[p.id].state !== 'unfound') continue;
        const dx = p.x - P.x;
        const dz = p.z - P.z;
        const d = Math.hypot(dx, dz);
        const range = BEACON_RANGE * (fx.beaconMul || 1);
        if (d > range) continue;
        const k = 1 - d / range;
        list.push({ id: p.id, code: p.code, freq: p.freq, d, gain: 0.025 + 0.3 * k * k, pan: clamp(((dx * rx + dz * rz) / Math.max(d, 1)) * 1.15, -1, 1) });
      }
      list.sort((a, b) => a.d - b.d);
    }
    audio.setBeacons(list.slice(0, 2));
    sim.beacons = list.slice(0, 2);
    sim.sciNearest = list.length ? list[0] : null;

    // Bright Angel scan visuals + science expedition completion
    if (sim.mode === 'expedition' && !st.expeditionDone && expeditionChecklist().every((c) => c.done)) {
      st.expeditionDone = true;
      say(RADIO_SCIENCE.expeditionDone);
      log('Expedition objectives complete.');
      sim.expeditionT = sim.t;
    }
    if (st.expeditionDone && sim.t - sim.expeditionT > 5) endMission('expedition');
  }

  // -------- render-time visuals (ghost replays, rings, pillars, mesh arcs)
  function animate(t, dt) {
    sw.animate(t, dt);
    for (const o of sw.pioneers) {
      const s = st.pioneers[o.def.id];
      const near = dist2(P.x, P.z, o.def.x, o.def.z);
      o.pillar.visible = s.state === 'unfound' || s.state === 'preserved';
      o.pillarMat.opacity = (s.state === 'unfound' ? 0.2 + Math.sin(t * 6 + o.def.x) * 0.08 : 0.12) * clamp(near / 40, 0.2, 1);
      o.ringMat.opacity = 0.45 + Math.sin(t * 3 + o.def.x) * 0.25;
      if (s.state === 'replay') animateGhost(o, s.replayT, dt);
    }
    const rs = st.sherloc;
    const holding = st.hold.id === 'sherloc' ? st.hold.t / st.hold.need : 0;
    sw.rock.setScan(holding, rs.done, t);
    sw.sherlocRing.visible = !rs.done;
  }

  function animateGhost(o, t, dt) {
    const g = o.ghost;
    const intro = clamp(t / 0.9, 0, 1);
    const outro = clamp((REPLAY_SECONDS - t) / 0.9, 0, 1);
    const k = Math.min(intro, outro);
    g.group.scale.setScalar(o.scale * (0.02 + 0.98 * k));
    const kind = o.def.kind;
    if (kind === 'mer') {
      const a = t * 0.42;
      const R = 5.5;
      const x = Math.cos(a) * R - R;
      const z = Math.sin(a) * R;
      g.group.position.set(x, getTerrainHeight(o.def.x + x, o.def.z + z) - o.baseY + 0.05, z);
      g.group.rotation.y = Math.atan2(-Math.sin(a) * R, Math.cos(a) * R); // heading along the circular path
      for (const w of g.wheels) w.rotation.x = -t * 3.2;
    } else if (kind === 'insight') {
      const lower = clamp((t - 1.2) / 2.4, 0, 1);
      g.seis.position.y = (1 - lower) * 1.0;
      g.arm.rotation.y = Math.sin(t * 0.8) * 0.12;
      g.arrays.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * (0.06 + Math.sin(t * 1.5) * 0.02)));
      o.ripples.forEach((r, i) => {
        const kk = ((t - 3.2 - i * 1.4) / 3.2);
        r.visible = kk > 0 && kk < 1;
        if (r.visible) {
          r.scale.setScalar(1 + kk * 16);
          r.material.opacity = (1 - kk) * 0.7;
        }
      });
    } else if (kind === 'heli') {
      const up = clamp((t - 1.2) / 1.8, 0, 1) * clamp((REPLAY_SECONDS - 1.2 - t) / 1.8, 0, 1);
      g.group.position.y = up * 3.2 + Math.sin(t * 2) * 0.06 * up;
      g.rotors[0].rotation.y += dt * 38 * (0.2 + up);
      g.rotors[1].rotation.y -= dt * 38 * (0.2 + up);
    }
  }

  // -------- helpers for HUD / minimap / compass / objective
  function expeditionChecklist() {
    const d = sim.devices;
    return [
      { label: 'Repair the broken rover', done: d.rover.done },
      { label: 'Drive the rover 400 m', done: (sim.stats.roverDist || 0) >= 400 },
      { label: 'Resolve all 4 NASA pioneers (OPPY · SPRT · INST · INGN)', done: resolvedCount() >= 4 },
      { label: 'SHERLOC scan of Bright Angel', done: st.sherloc.done },
      { label: 'Calibrate the REMS / MEDA weather station', done: d.weather.done },
      { label: 'Repair the Solar and RTG substations', done: d.sub1.done && d.sub2.done },
    ];
  }

  /** Nearest unfinished science target for the objective marker. */
  function nextTarget() {
    let best = null;
    let bd = 1e9;
    const consider = (x, z, label) => {
      const d = dist2(P.x, P.z, x, z);
      if (d < bd) {
        bd = d;
        best = { x, z, label };
      }
    };
    for (const p of PIONEERS) if (!resolved(p.id)) consider(p.x, p.z, `Track ${p.code}: ${p.name} (follow the Morse beacon)`);
    if (!st.sherloc.done) consider(SCIENCE_SITES.sherloc.x, SCIENCE_SITES.sherloc.z, 'Scan the Bright Angel outcrop (hold E for 2 s)');
    return best;
  }

  function compassMarkers() {
    const out = [];
    for (const p of PIONEERS) {
      const s = st.pioneers[p.id];
      out.push({ x: p.x, z: p.z, label: p.code, color: resolved(p.id) ? '#4be3ff' : '#ffb020', dim: resolved(p.id), kind: 'pioneer', active: s.state !== 'unfound' && !resolved(p.id) });
    }
    if (!st.sherloc.done) out.push({ x: SCIENCE_SITES.sherloc.x, z: SCIENCE_SITES.sherloc.z, label: 'BA', color: '#b46bff', kind: 'science' });
    return out;
  }

  function snapshot() {
    return {
      pioneers: PIONEERS.map((p) => ({ id: p.id, code: p.code, name: p.name, state: st.pioneers[p.id].state })),
      preserved: st.preserved,
      salvaged: st.salvaged,
      sherloc: st.sherloc.done,
    };
  }

  function summary() {
    return { preserved: st.preserved, salvaged: st.salvaged, sherloc: st.sherloc.done, pioneers: resolvedCount() };
  }

  return {
    scan,
    salvageKey,
    tickHold,
    tick,
    animate,
    expeditionChecklist,
    nextTarget,
    compassMarkers,
    snapshot,
    summary,
    state: st,
    resolvedCount,
    forceLock: completeLock, // used by the Judge Quick-Tour
    forceScan: completeSherloc,
  };
}
