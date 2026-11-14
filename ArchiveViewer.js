// 3D viewer for the NASA Hardware Archive modal: orbit a model, age it with
// windblown dust along the HiRISE time-slider, and X-ray its internals.

import * as THREE from 'three';
import { createRenderer, makeEnvironment, watchResize, runLoop, disposeScene, setXRay } from './engine.js';
import { getTextures } from './textures.js';
import { createHardware } from './models.js';
import { createALSEP, createSurveyor, applyDustAge } from '../systems/nasaDataModels.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class ArchiveViewer {
  constructor(container) {
    this.container = container;
    this.renderer = createRenderer(container);
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080f);
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.cam = { yaw: 0.7, pitch: 0.32, dist: 7 };
    this.pointer = { down: false, x: 0, y: 0 };
    this.dust = 0;
    this.lunar = false;
    this.auto = true;

    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a1a10, 0.8));
    const key = new THREE.DirectionalLight(0xfff1dc, 3);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.2);
    rim.position.set(-6, 3, -5);
    this.scene.add(rim);

    const T = getTextures();
    const map = T.regolith.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(4, 4);
    map.needsUpdate = true;
    this.groundMat = new THREE.MeshStandardMaterial({ map, color: 0xc98556, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 48), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // windblown drift that grows with the HiRISE slider
    this.drift = new THREE.Mesh(new THREE.SphereGeometry(4.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map, color: 0xd9a57c, roughness: 1 }));
    this.drift.scale.set(1, 0.001, 1);
    this.drift.receiveShadow = true;
    this.scene.add(this.drift);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.9, 6, 64), new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.bind();
    this.stopResize = watchResize(container, this.renderer, this.camera);
    this.stopLoop = runLoop((dt) => this.update(dt));
  }

  show(id) {
    this.holder.clear();
    this.lunar = id === 'alsep' || id === 'surveyor3';
    const model = id === 'alsep' ? createALSEP() : id === 'surveyor3' ? createSurveyor() : createHardware(id);
    // hide built-in dust drifts so the slider controls all of the dust
    model.children.forEach((c) => {
      if (c.isMesh && c.geometry.type === 'SphereGeometry' && c.scale.y < 0.5) c.visible = false;
    });
    this.model = model;
    this.holder.add(model);
    this.groundMat.color.set(this.lunar ? 0x8e8e8a : 0xc98556);
    this.drift.material.color.set(this.lunar ? 0x9a9a96 : 0xd9a57c);
    this.cam.dist = id === 'surveyor3' ? 8.5 : id === 'insight' ? 8 : 6.5;
    this.setDust(this.dust);
    this.setXRay(this.xray);
  }

  setDust(k) {
    this.dust = clamp(k, 0, 1);
    if (this.model) {
      if (this.xray) setXRay(this.model, false);
      applyDustAge(this.model, this.dust, this.lunar);
      if (this.xray) setXRay(this.model, true);
    }
    this.drift.scale.y = 0.001 + this.dust * 0.09;
  }

  setXRay(on) {
    this.xray = !!on;
    if (this.model) setXRay(this.model, this.xray);
  }

  bind() {
    const el = this.renderer.domElement;
    el.style.cursor = 'grab';
    this.onDown = (e) => {
      this.pointer.down = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.auto = false;
      el.setPointerCapture?.(e.pointerId);
    };
    this.onMove = (e) => {
      if (!this.pointer.down) return;
      this.cam.yaw -= (e.clientX - this.pointer.x) * 0.008;
      this.cam.pitch = clamp(this.cam.pitch + (e.clientY - this.pointer.y) * 0.005, 0.05, 1.3);
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    };
    this.onUp = (e) => {
      this.pointer.down = false;
      el.releasePointerCapture?.(e.pointerId);
    };
    this.onWheel = (e) => {
      e.preventDefault();
      this.cam.dist = clamp(this.cam.dist + e.deltaY * 0.006, 3, 14);
    };
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  update(dt) {
    if (this.auto) this.cam.yaw += dt * 0.25;
    const { yaw, pitch, dist } = this.cam;
    this.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.9 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(0, 0.9, 0);
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
