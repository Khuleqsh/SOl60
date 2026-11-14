import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);
  return renderer;
}

// Procedural image-based lighting so metals and gold foil have something to reflect.
export function makeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  room.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return env;
}

export function watchResize(container, renderer, camera) {
  const apply = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(apply);
  ro.observe(container);
  apply();
  return () => ro.disconnect();
}

export function runLoop(fn) {
  let raf = 0;
  let last = performance.now();
  let stopped = false;
  const tick = (now) => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    fn(dt, now / 1000);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export function disposeScene(scene, renderer) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
  if (scene.environment) scene.environment.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
}

// Cone of "volumetric" light: additive, fading away from the apex. Apex sits at the origin.
export function lightCone(color, radius, height, opacity, alphaMap) {
  const geo = new THREE.ConeGeometry(radius, height, 32, 1, true);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    alphaMap,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const cone = new THREE.Mesh(geo, mat);
  cone.renderOrder = 5;
  return cone;
}

// Systems-engineering X-ray view: swaps every mesh under root to a cyan wireframe and
// reveals children flagged userData.xrayCore (RTG cores, O2 tanks, optics).
const XRAY_MAT = new THREE.MeshBasicMaterial({
  color: 0x35d6ff,
  wireframe: true,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
  fog: false,
});
export function setXRay(root, on) {
  if (!root) return;
  root.traverse((o) => {
    if (o.userData.xrayCore) {
      o.visible = on;
      return;
    }
    if (!o.isMesh || o.userData.noXray) return;
    if (on) {
      if (!o.userData.xrayOrig) o.userData.xrayOrig = o.material;
      o.material = XRAY_MAT;
    } else if (o.userData.xrayOrig) {
      o.material = o.userData.xrayOrig;
      delete o.userData.xrayOrig;
    }
  });
}

export function xrayCore(color, radius = 0.12, height = 0) {
  const geo = height ? new THREE.CylinderGeometry(radius, radius, height, 14) : new THREE.SphereGeometry(radius, 16, 12);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, fog: false }),
  );
  m.userData.xrayCore = true;
  m.renderOrder = 30;
  m.visible = false;
  return m;
}
