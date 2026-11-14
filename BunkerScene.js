// Stage 1: the Earth-side spacecraft assembly bunker.

import * as THREE from 'three';
import { createRenderer, makeEnvironment, watchResize, runLoop, disposeScene, lightCone, setXRay, xrayCore } from './engine.js';
import { getTextures, tiled, labelTexture } from './textures.js';
import { createAstronaut, createItemModel, createDescentStage, M, glow } from './models.js';
import { ITEMS, ITEM_BY_ID } from '../game/data.js';

const ROOM = { w: 30, d: 22, h: 8 };
const RACKS = {
  back: ['rtg', 'solar', 'eclss', 'moxie', 'shield', 'dish'],
  left: ['aerogel', 'medkit', 'brush'],
  right: ['libs', 'drill', 'lidar'],
};
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BunkerScene {
  constructor(container, cb) {
    this.container = container;
    this.cb = cb;
    this.renderer = createRenderer(container);
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040507);
    this.scene.fog = new THREE.FogExp2(0x120707, 0.02);
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.28;
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 200);

    this.mode = 'attract';
    this.time = 0;
    this.launchT = 0;
    this.urgency = 0;
    this.keys = {};
    this.items = {};
    this.hoverId = null;
    this.nearId = null;
    this.cam = { yaw: 0, pitch: 0.3, dist: 9.5 };
    this.pointer = { down: false, x: 0, y: 0, moved: 0 };
    this.raycaster = new THREE.Raycaster();
    this.proxies = [];

    this.buildRoom();
    this.buildPallet();
    this.buildRacks();
    this.buildLights();

    this.astro = createAstronaut();
    this.astro.position.set(0, 0, 7.6);
    this.astro.rotation.y = Math.PI;
    this.heading = Math.PI;
    this.scene.add(this.astro);

    this.bind();
    this.stopResize = watchResize(container, this.renderer, this.camera);
    this.stopLoop = runLoop((dt) => this.update(dt));
  }

  buildRoom() {
    const T = getTextures();
    const m = M();
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const plane = (w, h, mat) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p.receiveShadow = true;
      this.scene.add(p);
      return p;
    };
    const floor = plane(ROOM.w, ROOM.d, std({ map: tiled(T.floor, ROOM.w / 4, ROOM.d / 4), roughness: 0.5, metalness: 0.65, color: 0xb4bac2 }));
    floor.rotation.x = -Math.PI / 2;

    const wallA = std({ map: tiled(T.wall, ROOM.w / 6, 1.6), roughness: 0.8, metalness: 0.35 });
    const wallB = std({ map: tiled(T.wall, ROOM.d / 6, 1.6), roughness: 0.8, metalness: 0.35 });
    plane(ROOM.w, ROOM.h, wallA).position.set(0, ROOM.h / 2, -ROOM.d / 2);
    const front = plane(ROOM.w, ROOM.h, wallA);
    front.position.set(0, ROOM.h / 2, ROOM.d / 2);
    front.rotation.y = Math.PI;
    const left = plane(ROOM.d, ROOM.h, wallB);
    left.position.set(-ROOM.w / 2, ROOM.h / 2, 0);
    left.rotation.y = Math.PI / 2;
    const right = plane(ROOM.d, ROOM.h, wallB);
    right.position.set(ROOM.w / 2, ROOM.h / 2, 0);
    right.rotation.y = -Math.PI / 2;
    const ceil = plane(ROOM.w, ROOM.d, std({ color: 0x0c0e12, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ROOM.h;

    const add = (geo, mat, x, y, z) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      this.scene.add(o);
      return o;
    };
    // roof trusses and strip lamps
    for (const z of [-8, -4, 0, 4, 8]) {
      add(new THREE.BoxGeometry(ROOM.w, 0.35, 0.3), m.darkMetal, 0, 7.6, z);
      for (const x of [-9, 9]) add(new THREE.BoxGeometry(2.6, 0.06, 0.4), glow(0xbcd9ff, 1.6), x, 7.4, z).castShadow = false;
    }
    for (const x of [-10, -5, 5, 10]) add(new THREE.BoxGeometry(0.3, 0.3, ROOM.d), m.darkMetal, x, 7.75, 0);
    // conduit runs along the back wall
    for (const [y, r] of [
      [6.3, 0.14],
      [6.75, 0.09],
      [5.9, 0.06],
    ]) {
      const pipe = add(new THREE.CylinderGeometry(r, r, ROOM.w, 12), y === 6.3 ? m.foil : m.metal, 0, y, -ROOM.d / 2 + 0.25);
      pipe.rotation.z = Math.PI / 2;
    }
    // blast door on the front wall
    add(new THREE.BoxGeometry(9, 6.4, 0.3), m.darkMetal, 0, 3.2, ROOM.d / 2 - 0.16);
    add(new THREE.BoxGeometry(0.12, 6.2, 0.36), m.black, 0, 3.1, ROOM.d / 2 - 0.2);
    const hz = std({ map: tiled(T.hazard, 10, 0.5), roughness: 0.7 });
    add(new THREE.BoxGeometry(9.6, 0.4, 0.4), hz, 0, 6.6, ROOM.d / 2 - 0.2);
    const hzv = std({ map: tiled(T.hazard, 0.5, 7), roughness: 0.7 });
    add(new THREE.BoxGeometry(0.4, 6.4, 0.4), hzv, -4.7, 3.2, ROOM.d / 2 - 0.2);
    add(new THREE.BoxGeometry(0.4, 6.4, 0.4), hzv, 4.7, 3.2, ROOM.d / 2 - 0.2);
    // hazard ring around the integration stand
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.75, 5.3, 72), std({ map: tiled(T.hazard, 7, 7), roughness: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    ring.receiveShadow = true;
    this.scene.add(ring);
    const glowRing = new THREE.Mesh(
      new THREE.RingGeometry(4.62, 4.72, 72),
      new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0.8 }),
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.014;
    this.scene.add(glowRing);
    this.glowRing = glowRing;
    // tool carts for scale
    for (const [x, z] of [
      [-8.5, 7.5],
      [9, 6.8],
    ]) {
      add(new THREE.BoxGeometry(1.3, 0.9, 0.8), m.red, x, 0.6, z);
      add(new THREE.BoxGeometry(1.4, 0.06, 0.9), m.metal, x, 1.08, z);
    }
  }

  buildPallet() {
    const m = M();
    this.stage = createDescentStage();
    this.scene.add(this.stage);
    this.slots = ITEMS.map((_, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      return new THREE.Vector3(-1.8 + col * 1.2, 1.92, -1.2 + row * 1.2);
    });
    // slot markers on the deck
    this.slots.forEach((s) => {
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.35 }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(s.x, 1.36, s.z);
      this.scene.add(mark);
    });
    // aeroshell hanging from the gantry, lowered at launch
    const shell = new THREE.Mesh(
      new THREE.ConeGeometry(4.3, 2.5, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide }),
    );
    shell.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.07, 8, 64), glow(0xffb020, 1.6));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -1.25;
    const capm = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), m.foil);
    capm.position.y = 1.2;
    this.fairing = new THREE.Group();
    this.fairing.add(shell, rim, capm);
    this.fairing.position.set(0, 6.55, 0);
    this.scene.add(this.fairing);
  }

  buildRacks() {
    const m = M();
    const place = [];
    RACKS.back.forEach((id, i) => place.push({ id, x: -11.25 + i * 4.5, z: -9.4, ry: 0 }));
    RACKS.left.forEach((id, i) => place.push({ id, x: -13.5, z: -3.6 + i * 4.5, ry: Math.PI / 2 }));
    RACKS.right.forEach((id, i) => place.push({ id, x: 13.5, z: -3.6 + i * 4.5, ry: -Math.PI / 2 }));

    for (const p of place) {
      const item = ITEM_BY_ID[p.id];
      const rack = new THREE.Group();
      rack.position.set(p.x, 0, p.z);
      rack.rotation.y = p.ry;
      const addTo = (geo, mat, x, y, z) => {
        const o = new THREE.Mesh(geo, mat);
        o.position.set(x, y, z);
        o.castShadow = true;
        o.receiveShadow = true;
        rack.add(o);
        return o;
      };
      addTo(new THREE.BoxGeometry(2.4, 0.9, 1.5), m.darkMetal, 0, 0.45, 0);
      addTo(new THREE.BoxGeometry(2.5, 0.06, 1.6), m.metal, 0, 0.93, 0);
      const ringMat = glow(0x35d6ff, 2.2).clone();
      const ring = addTo(new THREE.TorusGeometry(0.74, 0.03, 8, 40), ringMat, 0, 0.98, 0.05);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = false;
      for (const x of [-1.15, 1.15]) addTo(new THREE.BoxGeometry(0.12, 3.1, 0.12), m.metal, x, 2.45, -0.62);
      addTo(new THREE.BoxGeometry(2.5, 0.22, 0.6), m.darkMetal, 0, 4.05, -0.4);
      addTo(new THREE.BoxGeometry(2.1, 0.04, 0.34), glow(0xdcecff, 3.2), 0, 3.92, -0.36).castShadow = false;
      addTo(new THREE.BoxGeometry(2.2, 2.2, 0.05), m.black, 0, 2.1, -0.68);
      const ledMat = glow(0x3dff8a, 3).clone();
      addTo(new THREE.BoxGeometry(0.5, 0.07, 0.03), ledMat, 0, 0.6, 0.76).castShadow = false;

      const placard = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 0.86),
        new THREE.MeshBasicMaterial({
          map: labelTexture(
            [
              { text: item.short.toUpperCase(), size: 44, color: '#f1f5f9' },
              { text: `${item.mass} kg   $${item.cost}M`, size: 34, color: '#fbbf24' },
              { text: item.stat, size: 22, color: '#67e8f9', weight: 'normal' },
            ],
            { w: 512, h: 192 },
          ),
          transparent: true,
          fog: false,
        }),
      );
      placard.position.set(0, 3.35, -0.6);
      placard.rotation.x = -0.08;
      rack.add(placard);
      this.scene.add(rack);
      rack.updateMatrixWorld(true);

      const holder = new THREE.Group();
      const model = createItemModel(p.id);
      model.scale.setScalar(1.2);
      // X-ray internals: glowing cores, tanks and optics.
      const coreSpec = {
        rtg: [0xff6a1a, 0.16, 0.8],
        eclss: [0x35d6ff, 0.18, 0.6],
        moxie: [0xff8a2a, 0.14, 0.4],
        libs: [0x5ff2ff, 0.08, 0],
        medkit: [0x3dff8a, 0.12, 0],
        shield: [0xa78bfa, 0.25, 0],
        lidar: [0x5ff2ff, 0.1, 0],
        dish: [0xfbbf24, 0.1, 0],
      }[p.id];
      if (coreSpec) model.add(xrayCore(coreSpec[0], coreSpec[1], coreSpec[2]));
      holder.add(model);
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.0, 1.9), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.userData.id = p.id;
      holder.add(proxy);
      this.proxies.push(proxy);
      const rest = rack.localToWorld(new THREE.Vector3(0, 1.95, 0.1));
      holder.position.copy(rest);
      this.scene.add(holder);

      this.items[p.id] = {
        id: p.id,
        holder,
        model,
        rest,
        slot: this.slots[ITEMS.findIndex((i) => i.id === p.id)],
        floor: new THREE.Vector3(p.x, 0, p.z),
        p: 0,
        target: 0,
        hover: 0,
        ringMat,
        ledMat,
        phase: Math.random() * 6,
      };
    }
  }

  buildLights() {
    const T = getTextures();
    this.scene.add(new THREE.HemisphereLight(0x8fa3c8, 0x1a0d0a, 0.55));

    const key = new THREE.SpotLight(0xfff0dc, 520, 34, 0.72, 0.6, 1.5);
    key.position.set(0, 7.85, 3.5);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    this.scene.add(key, key.target);
    this.key = key;
    const keyCone = lightCone(0xcfe2ff, 5.6, 8, 0.07, T.cone);
    keyCone.position.set(0, 7.9, 0.6);
    this.scene.add(keyCone);

    for (const [x, y, z, i] of [
      [-9, 3.7, -7.2, 26],
      [0, 3.7, -7.2, 26],
      [9, 3.7, -7.2, 26],
      [-11.3, 3.7, 1, 26],
      [11.3, 3.7, 1, 26],
      [0, 4.5, 9, 14],
    ]) {
      const p = new THREE.PointLight(0xbfe0ff, i, 12, 1.8);
      p.position.set(x, y, z);
      this.scene.add(p);
    }

    // rotating red emergency beacons with visible beams
    this.beacons = [];
    for (const [x, z] of [
      [-9.5, -3],
      [9.5, -3],
      [-9.5, 6],
      [9.5, 6],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 7.2, z);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.34, 16), glow(0xff2414, 5));
      pivot.add(lamp);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16), M().darkMetal);
      base.position.y = 0.22;
      pivot.add(base);
      const dir = new THREE.Vector3(1, -0.62, 0).normalize();
      const spot = new THREE.SpotLight(0xff2a14, 620, 26, 0.5, 0.7, 1.4);
      spot.target.position.copy(dir).multiplyScalar(6);
      pivot.add(spot, spot.target);
      const cone = lightCone(0xff2a14, 4.4, 12, 0.2, T.cone);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      pivot.add(cone);
      const dir2 = new THREE.Vector3(-1, -0.62, 0).normalize();
      const cone2 = lightCone(0xff2a14, 4.4, 12, 0.2, T.cone);
      cone2.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir2);
      pivot.add(cone2);
      pivot.rotation.y = Math.random() * 6;
      this.scene.add(pivot);
      this.beacons.push({ pivot, lamp, cones: [cone, cone2], spot });
    }

    this.alarm = new THREE.PointLight(0xff2010, 0, 40, 1.4);
    this.alarm.position.set(0, 6.4, 1);
    this.scene.add(this.alarm);
  }

  // ---------------------------------------------------------------- input

  bind() {
    const el = this.renderer.domElement;
    this.onKeyDown = (e) => {
      if (this.mode !== 'play') return;
      this.keys[e.code] = true;
      if (e.code === 'KeyE' && !e.repeat && this.nearId) this.cb.onToggle?.(this.nearId);
    };
    this.onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    this.onDown = (e) => {
      this.pointer.down = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.moved = 0;
      el.setPointerCapture?.(e.pointerId);
    };
    this.onMove = (e) => {
      if (this.pointer.down) {
        const dx = e.clientX - this.pointer.x;
        const dy = e.clientY - this.pointer.y;
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        this.pointer.moved += Math.abs(dx) + Math.abs(dy);
        if (this.mode === 'play') {
          this.cam.yaw -= dx * 0.0055;
          this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, 0.05, 1.15);
        }
      } else if (this.mode === 'play') {
        this.setHover(this.pick(e));
      }
    };
    this.onUp = (e) => {
      const wasClick = this.pointer.down && this.pointer.moved < 7;
      this.pointer.down = false;
      el.releasePointerCapture?.(e.pointerId);
      if (wasClick && this.mode === 'play') {
        const id = this.pick(e);
        if (id) this.cb.onToggle?.(id);
      }
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.cam.dist = clamp(this.cam.dist + e.deltaY * 0.008, 4.5, 14);
    };
    this.onLeave = () => this.setHover(null);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.proxies, false)[0];
    return hit ? hit.object.userData.id : null;
  }

  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    this.cb.onHover?.(id);
  }

  // ---------------------------------------------------------------- API

  setMode(mode) {
    this.mode = mode;
    this.keys = {};
    if (mode === 'launch') {
      this.launchT = 0;
      this.setHover(null);
    }
    if (mode === 'play') this.renderer.domElement.style.cursor = 'grab';
  }

  setPacked(ids) {
    for (const it of Object.values(this.items)) {
      it.target = ids.includes(it.id) ? 1 : 0;
      it.ledMat.emissive.set(it.target ? 0xffb020 : 0x3dff8a);
    }
  }

  setUrgency(u) {
    this.urgency = u;
  }

  setOverload(on) {
    this.overload = on;
  }

  setXRay(on) {
    setXRay(this.astro, on);
    for (const it of Object.values(this.items)) setXRay(it.model, on);
    setXRay(this.stage, on);
  }

  setShake(v) {
    this.extraShake = v;
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    this.time += dt;
    const t = this.time;

    // beacons sweep faster as the clock runs down
    const speed = 1.6 + this.urgency * 3.2 + (this.mode === 'launch' ? 5 : 0);
    this.beacons.forEach((b, i) => {
      b.pivot.rotation.y += dt * speed * (i % 2 ? -1 : 1);
    });
    const beat = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2), 3);
    this.alarm.intensity = (30 + this.urgency * 260 + (this.overload ? 240 : 0)) * beat;
    this.glowRing.material.opacity = 0.35 + 0.65 * beat;
    this.glowRing.material.color.set(this.overload ? 0xff2010 : 0xff7a2a);

    // items
    for (const it of Object.values(this.items)) {
      const d = it.target - it.p;
      if (d !== 0) it.p = clamp(it.p + (Math.sign(d) * dt) / 0.62, 0, 1);
      const e = ease(it.p);
      it.hover += ((this.hoverId === it.id || this.nearId === it.id ? 1 : 0) - it.hover) * Math.min(1, dt * 10);
      it.holder.position.lerpVectors(it.rest, it.slot, e);
      it.holder.position.y += Math.sin(Math.PI * e) * 2.8;
      if (it.p === 0) {
        it.holder.position.y += Math.sin(t * 1.6 + it.phase) * 0.06;
        it.holder.rotation.y += dt * (0.5 + it.hover * 1.6);
      } else if (it.p === 1) {
        it.holder.rotation.y += (0 - (it.holder.rotation.y % (Math.PI * 2))) * Math.min(1, dt * 5);
      } else {
        it.holder.rotation.y += dt * 7;
      }
      it.holder.scale.setScalar((1 - 0.48 * e) * (1 + it.hover * 0.13));
      if (it.model.userData.spin) it.model.userData.spin.rotation.y += dt * 4;
      it.ringMat.emissiveIntensity = it.target ? 0.35 : 2.2 + it.hover * 4;
      it.ringMat.emissive.set(it.target ? 0xffb020 : 0x35d6ff);
    }

    const astro = this.astro;
    let moving = false;

    if (this.mode === 'play') {
      const k = this.keys;
      const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      if (f || r) {
        const yaw = this.cam.yaw;
        let vx = -Math.sin(yaw) * f + Math.cos(yaw) * r;
        let vz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
        const len = Math.hypot(vx, vz) || 1;
        vx /= len;
        vz /= len;
        const sp = 5.2;
        let nx = astro.position.x + vx * sp * dt;
        let nz = astro.position.z + vz * sp * dt;
        nx = clamp(nx, -11.6, 11.6);
        nz = clamp(nz, -7.3, 9.6);
        const pd = Math.hypot(nx, nz);
        if (pd < 5.0) {
          nx = (nx / (pd || 1)) * 5.0;
          nz = (nz / (pd || 1)) * 5.0;
        }
        astro.position.x = nx;
        astro.position.z = nz;
        this.heading = Math.atan2(vx, vz);
        moving = true;
      }
      let dh = this.heading - astro.rotation.y;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      astro.rotation.y += dh * Math.min(1, dt * 10);

      // nearest rack for the [E] prompt
      let near = null;
      let best = 3.6;
      for (const it of Object.values(this.items)) {
        const d = Math.hypot(it.floor.x - astro.position.x, it.floor.z - astro.position.z);
        if (d < best) {
          best = d;
          near = it.id;
        }
      }
      if (near !== this.nearId) {
        this.nearId = near;
        this.cb.onNear?.(near);
      }

      const { yaw, pitch, dist } = this.cam;
      const tx = astro.position.x;
      const ty = 1.75;
      const tz = astro.position.z;
      let cx = tx + Math.sin(yaw) * Math.cos(pitch) * dist;
      let cy = ty + Math.sin(pitch) * dist;
      let cz = tz + Math.cos(yaw) * Math.cos(pitch) * dist;
      cx = clamp(cx, -ROOM.w / 2 + 0.6, ROOM.w / 2 - 0.6);
      cz = clamp(cz, -ROOM.d / 2 + 0.6, ROOM.d / 2 - 0.6);
      cy = clamp(cy, 0.5, ROOM.h - 0.9);
      this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 9));
      this.camera.lookAt(tx, ty, tz);
    } else if (this.mode === 'attract') {
      const a = t * 0.13 + 0.6;
      this.camera.position.set(Math.sin(a) * 9.6, 3.6 + Math.sin(t * 0.21) * 0.5, Math.cos(a) * 9.2);
      this.camera.lookAt(0, 2.2, 0);
    } else {
      // launch: aeroshell drops over the payload, the room shakes
      this.launchT += dt;
      const lt = this.launchT;
      this.fairing.position.y = 6.55 - (6.55 - 2.62) * ease(clamp(lt / 1.7, 0, 1));
      const shake = clamp((lt - 1.2) / 2.2, 0, 1) * 0.16;
      const target = new THREE.Vector3(8.2, 3.1, 9.4);
      this.camera.position.lerp(target, Math.min(1, dt * 2.2));
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.camera.lookAt(0, 2.4 + (Math.random() - 0.5) * shake, 0);
      this.key.intensity = 520 + clamp((lt - 1.6) / 2, 0, 1) * 5000 * (0.7 + Math.random() * 0.3);
      this.stage.position.y = clamp((lt - 2.6) / 1.6, 0, 1) ** 2 * 0.25;
    }

    astro.userData.update(dt, moving ? 1 : 0, 1.15);
    if (this.extraShake) {
      this.camera.position.x += (Math.random() - 0.5) * this.extraShake;
      this.camera.position.y += (Math.random() - 0.5) * this.extraShake;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stopLoop();
    this.stopResize();
    const el = this.renderer.domElement;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('wheel', this.onWheel);
    setXRay(this.astro, false);
    disposeScene(this.scene, this.renderer);
  }
}
