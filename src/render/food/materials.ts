import * as THREE from 'three';
import type { Finish } from './kit';

/**
 * Two vertex-coloured materials shared by every food, prep and dish: a soft matte one for bread,
 * dough, vegetables and wood, and a glossy one for tomato skin, egg shell, sauce, glaze and pans.
 * A full pantry therefore costs at most two draw calls per visible item and one shader pair.
 */
let shared: Record<Finish, THREE.MeshStandardMaterial> | null = null;

export function foodMaterials(): Record<Finish, THREE.MeshStandardMaterial> {
  if (!shared) {
    shared = {
      matte: new THREE.MeshStandardMaterial({
        name: 'food-matte', vertexColors: true, roughness: 0.68, metalness: 0, envMapIntensity: 0.75,
      }),
      gloss: new THREE.MeshStandardMaterial({
        name: 'food-gloss', vertexColors: true, roughness: 0.26, metalness: 0, envMapIntensity: 1.2,
      }),
    };
  }
  return shared;
}

export function disposeFoodMaterials(): void {
  if (!shared) return;
  shared.matte.dispose();
  shared.gloss.dispose();
  shared = null;
}
