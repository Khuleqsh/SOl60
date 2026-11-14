// Stage 2: NASA Mars Trek-style tactical map of Gale Crater with six orbital data layers.

import * as THREE from 'three';
import { createRenderer, makeEnvironment, watchResize, runLoop, disposeScene } from './engine.js';
import { getTextures, labelSprite } from './textures.js';
import { glow } from './models.js';
import { heightAt, layersAt, naturalColor, rampColor } from '../game/terrain.js';
import { HARDWARE, CRATERS, LZ, SUMMIT, ENCOUNTER_RADIUS, LANDMARKS, COSPAR_ZONE, GEYSERS } from '../game/data.js';
import { EscapadePair } from '../systems/nasaDataModels.js';

const SIZE = 100;
const SEG = 160;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class MapScene {
  constructor(container, cb) {
    this.container = container;
    this.cb = cb;
    this.renderer = createRenderer(container);
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.scene.fog = new THREE.FogExp2(0x02040a, 0.004);
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.25;
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 600);
    this.cam = { yaw: 0.55, pitch: 0.95, dist: 122, tx: 0, tz: 2 };
    this.pointer = { down: false, x: 0, y: 0, moved: 0 };
    this.raycaster = new THREE.Raycaster();
    this.layers = [];
    this.time = 0;
    this.shake = 0;

    this.buildTerrain();
    this.buildMarkers();
    this.buildLights();
    this.escapade = new EscapadePair(this.scene, { radius: 66, height: 40, center: new THREE.Vector3(0, 0, 0) });
    this.routeGroup = new THREE.Group();
    this.scene.add(this.routeGroup);
    this.wpGroup = new THREE.Group();
    this.scene.add(this.wpGroup);

    this.bind();
    this.stopResize = watchResize(container, this.renderer, this.camera);
    this.stopLoop = runLoop((dt) => this.update(dt));
  }

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const n = pos.count;
    this.cache = { slope: new Float32Array(n), rad: new Float32Array(n), freeze: new Float32Array(n), tau: new Float32Array(n), crism: new Float32Array(n), sharad: new Float32Array(n) };
    this.natural = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const L = layersAt(x, z);
      pos.setY(i, L.h);
      this.cache.slope[i] = L.slope;
      this.cache.rad[i] = L.rad;
      this.cache.freeze[i] = L.freeze;
      this.cache.tau[i] = L.tau;
      this.cache.crism[i] = L.crism;
      this.cache.sharad[i] = L.sharad;
      const c = naturalColor(x, z, L.h, L.slope);
      this.natural[i * 3] = c[0];
      this.natural[i * 3 + 1] = c[1];
      this.natural[i * 3 + 2] = c[2];
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const T = getTextures();
    const reg = T.regolithBump.clone();
    reg.wrapS = reg.wrapT = THREE.RepeatWrapping;
    reg.repeat.set(14, 14);
    reg.needsUpdate = true;
    this.terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, bumpMap: reg, bumpScale: 1.2 }),
    );
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
    this.scene.add(this.terrain);
    this.recolor();

    // holographic orbital grid
    const grid = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.13, fog: false });
    for (let k = -50; k <= 50; k += 5) {
      for (const axis of [0, 1]) {
        const pts = [];
        for (let t = -50; t <= 50; t += 2) {
          const x = axis ? k : t;
          const z = axis ? t : k;
          pts.push(new THREE.Vector3(x, heightAt(x, z) + 0.25, z));
        }
        grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      }
    }
    this.scene.add(grid);
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE, 30, SIZE)),
      new THREE.LineBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.22, fog: false }),
    );
    frame.position.y = 8;
    this.scene.add(frame);
  }

  recolor() {
    const col = this.terrain.geometry.attributes.color;
    const n = col.count;
    const act = this.layers;
    for (let i = 0; i < n; i++) {
      let r = this.natural[i * 3];
      let g = this.natural[i * 3 + 1];
      let b = this.natural[i * 3 + 2];
      if (act.length) {
        let ar = 0;
        let ag = 0;
        let ab = 0;
        for (const id of act) {
          const c = rampColor(id, this.cache[id === 'thermal' ? 'freeze' : id][i]);
          ar += c[0];
          ag += c[1];
          ab += c[2];
        }
        const k = 0.86;
        r = r * (1 - k) + (ar / act.length) * k;
        g = g * (1 - k) + (ag / act.length) * k;
        b = b * (1 - k) + (ab / act.length) * k;
      }
      col.setXYZ(i, r, g, b);
    }
    col.needsUpdate = true;
  }

  marker(x, z, color, r = 1, h = 6) {
    const y = heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h, 6), glow(color, 2.5));
    pole.position.y = h / 2;
    g.add(pole);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45 * r, 14, 10), glow(color, 4));
    ball.position.y = h;
    g.add(ball);
    this.scene.add(g);
    return g;
  }

  ringAt(x, z, radius, color, opacity = 0.7, width = 0.35) {
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const px = x + Math.cos(a) * radius;
      const pz = z + Math.sin(a) * radius;
      pts.push(new THREE.Vector3(px, heightAt(px, pz) + 0.35, pz));
    }
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, width, 5, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }),
    );
    this.scene.add(tube);
    return tube;
  }

  buildMarkers() {
    this.rings = {};
    for (const hw of HARDWARE) {
      this.marker(hw.pos.x, hw.pos.z, 0x35d6ff, 1, 5);
      this.rings[hw.id] = this.ringAt(hw.pos.x, hw.pos.z, ENCOUNTER_RADIUS, 0x35d6ff, 0.45, 0.22);
      const l = labelSprite(hw.name, { color: '#7fe9ff', scale: 0.9, sub: hw.status });
      l.position.set(hw.pos.x, heightAt(hw.pos.x, hw.pos.z) + 8.5, hw.pos.z);
      this.scene.add(l);
    }
    for (const c of CRATERS) {
      const l = labelSprite(c.name, { color: '#fbbf24', scale: 0.6 });
      l.position.set(c.x, heightAt(c.x, c.z) + 3, c.z);
      this.scene.add(l);
    }
    this.marker(LZ.x, LZ.z, 0x3dff8a, 1.4, 7);
    const lzL = labelSprite('BRADBURY LZ', { color: '#86efac', scale: 0.9, sub: 'MOLA −4.5 km · EDL ellipse' });
    lzL.position.set(LZ.x, heightAt(LZ.x, LZ.z) + 10, LZ.z);
    this.scene.add(lzL);
    this.ringAt(LZ.x, LZ.z, 5, 0x3dff8a, 0.6, 0.2);
    this.marker(SUMMIT.x, SUMMIT.z, 0xffb020, 1.4, 7);
    const sL = labelSprite('MOUNT SHARP SUMMIT', { color: '#fcd34d', scale: 0.9, sub: 'MAV ascent site' });
    sL.position.set(SUMMIT.x, heightAt(SUMMIT.x, SUMMIT.z) + 10, SUMMIT.z);
    this.scene.add(sL);
    // COSPAR special region
    this.cospar = this.ringAt(COSPAR_ZONE.x, COSPAR_ZONE.z, COSPAR_ZONE.r, 0xff4fd8, 0.75, 0.3);
    const cL = labelSprite('COSPAR SPECIAL REGION', { color: '#ff8be8', scale: 0.75, sub: 'Subsurface ice · sterilize first' });
    cL.position.set(COSPAR_ZONE.x, heightAt(COSPAR_ZONE.x, COSPAR_ZONE.z) + 5, COSPAR_ZONE.z);
    this.scene.add(cL);
    for (const lm of LANDMARKS) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), glow(lm.kind === 'edl' ? 0xffb020 : 0xa78bfa, 3));
      m.position.set(lm.x, heightAt(lm.x, lm.z) + 1.4, lm.z);
      this.scene.add(m);
    }
    for (const g of GEYSERS) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), glow(0x6b4a3a, 2));
      m.position.set(g.x, heightAt(g.x, g.z) + 0.8, g.z);
      this.scene.add(m);
    }
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x2a140c, 0.7));
    const sun = new THREE.DirectionalLight(0xffe2c0, 2.6);
    sun.position.set(-60, 80, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 10;
    sc.far = 250;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 0.6);
    rim.position.set(60, 30, -60);
    this.scene.add(rim);
  }

  // ---------------------------------------------------------------- API

  setLayers(ids) {
    this.layers = [...ids];
    this.recolor();
  }

  setEscapade(on) {
    this.escapade.synced = on;
  }

  setShake(v) {
    this.shake = v;
  }

  setWaypoints(wps, selected = -1) {
    this.wpGroup.clear();
    wps.forEach((w, i) => {
      if (!w) return;
      const y = heightAt(w.x, w.z);
      const g = new THREE.Group();
      g.position.set(w.x, y, w.z);
      const col = i === selected ? 0xffffff : 0xff7a2a;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), glow(col, 3));
      pole.position.y = 2.5;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 4), glow(col, 4));
      flag.position.y = 5.6;
      flag.rotation.x = Math.PI;
      g.add(pole, flag);
      const l = labelSprite(`WP ${i + 1}`, { color: '#ffb27a', scale: 0.55 });
      l.position.y = 8;
      g.add(l);
      this.wpGroup.add(g);
    });
  }

  setRoute(route) {
    this.routeGroup.clear();
    for (const r of Object.values(this.rings)) r.material.color.set(0x35d6ff);
    if (!route) return;
    const pts = route.samples.map((p) => new THREE.Vector3(p.x, p.h + 0.55, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 360, 0.32, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.95, fog: false }),
    );
    this.routeGroup.add(tube);
    this.routeTube = tube;
    route.camps.forEach((c) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), glow(c.freeze > 0.45 ? 0x4aa3ff : 0xffffff, 3));
      m.position.set(c.x, c.h + 1.2, c.z);
      this.routeGroup.add(m);
      const l = labelSprite(`CAMP ${c.sol}`, { color: c.freeze > 0.45 ? '#93c5fd' : '#e2e8f0', scale: 0.5 });
      l.position.set(c.x, c.h + 3.2, c.z);
      this.routeGroup.add(l);
    });
    for (const e of route.encounters) this.rings[e.id]?.material.color.set(0x3dff8a);
  }

  // ---------------------------------------------------------------- input

  bind() {
    const el = this.renderer.domElement;
    el.style.cursor = 'crosshair';
    this.onDown = (e) => {
      this.pointer.down = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.moved = 0;
      el.setPointerCapture?.(e.pointerId);
    };
    this.onMove = (e) => {
      if (!this.pointer.down) {
        const hit = this.pickGround(e);
        this.cb.onHover?.(hit ? { x: hit.x, z: hit.z, L: layersAt(hit.x, hit.z) } : null);
        return;
      }
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.moved += Math.abs(dx) + Math.abs(dy);
      this.cam.yaw -= dx * 0.005;
      this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, 0.35, 1.45);
    };
    this.onUp = (e) => {
      const click = this.pointer.down && this.pointer.moved < 6;
      this.pointer.down = false;
      el.releasePointerCapture?.(e.pointerId);
      if (click) {
        const hit = this.pickGround(e);
        if (hit) this.cb.onPick?.({ x: clamp(hit.x, -48, 48), z: clamp(hit.z, -48, 48) });
      }
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.cam.dist = clamp(this.cam.dist + e.deltaY * 0.08, 45, 170);
    };
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  pickGround(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    return hit ? hit.point : null;
  }

  update(dt) {
    this.time += dt;
    const { yaw, pitch, dist, tx, tz } = this.cam;
    const target = new THREE.Vector3(
      tx + Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      tz + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.position.lerp(target, Math.min(1, dt * 6));
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(tx, 2, tz);
    this.escapade.update(dt);
    if (this.routeTube) this.routeTube.material.opacity = 0.75 + 0.25 * Math.sin(this.time * 4);
    if (this.cospar) this.cospar.material.opacity = 0.45 + 0.35 * Math.sin(this.time * 3);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stopLoop();
    this.stopResize();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('wheel', this.onWheel);
    disposeScene(this.scene, this.renderer);
  }
}
