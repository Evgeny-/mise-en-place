import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Phones/tablets get a lighter render path (pixel ratio, shadow map size). */
export const LOW_END =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4);

/** The renderer settings every scene in the game uses (game, shop previews, review pages). */
export function createRenderer(container: HTMLElement, opts: { alpha?: boolean } = {}): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: !!opts.alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_END ? 1.6 : 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(r.domElement);
  return r;
}

export interface StudioLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

/** Warm kitchen daylight: soft sky fill, a sun from the upper left with soft shadows, a room environment map. */
export function addStudioLights(renderer: THREE.WebGLRenderer, scene: THREE.Scene): StudioLights {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();
  const hemi = new THREE.HemisphereLight('#fffaf0', '#a08a6a', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW_END ? 1024 : 2048, LOW_END ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  sun.position.set(-8, 22, -10);
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

/** Camera tilt used in play: 0 = straight down, PI/2 = horizontal. */
export const PLAY_TILT = 0.62;
