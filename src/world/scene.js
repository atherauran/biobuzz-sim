import * as THREE from 'three';
import { IN, FIELD } from '../config.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161b);
  scene.fog = new THREE.Fog(0x14161b, 9, 22);

  const hemi = new THREE.HemisphereLight(0xdfe6f5, 0x2a2620, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.position.set(-2.5, 7, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = FIELD.half * IN + 0.6;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 16 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc8d6ff, 0.5);
  fill.position.set(3, 4, -4);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(56, container.clientWidth / container.clientHeight, 0.05, 60);

  const onResize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);
  return { renderer, scene, camera };
}

/**
 * Fixed driver viewpoint: standing toward the audience end of an ALLIANCE AREA (red)
 * or the rear end (blue), ~60" behind the perimeter wall, looking diagonally across
 * the FIELD so the two HIVEs don't line up behind each other.
 */
export function placeDriverCamera(camera, side, eyeHeight) {
  const sgn = side === 'red' ? -1 : 1;
  camera.position.set(sgn * (FIELD.half + 60) * IN, eyeHeight, -sgn * 18 * IN);
  camera.lookAt(-sgn * 8 * IN, 0.1, sgn * 3 * IN);
  camera.updateMatrixWorld();
  // field-centric drive basis (screen forward/right projected on the floor)
  const fwd = new THREE.Vector3(-sgn, 0, 0);
  const right = new THREE.Vector3(0, 0, -sgn);
  return { fwd, right };
}
