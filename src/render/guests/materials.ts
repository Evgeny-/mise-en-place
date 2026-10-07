import * as THREE from 'three';

/**
 * Three materials for every guest at the table: all colour lives in vertex colours, so a full row of
 * animals costs three shader programs and no textures.
 */
export interface GuestMaterials {
  /** Soft fur, cloth and skin. */
  fur: THREE.MeshStandardMaterial;
  /** Glossy beads: eyes and the happy-eye arcs. */
  gloss: THREE.MeshStandardMaterial;
  /** Unlit catch-lights, so eyes sparkle even in the shade of the head. */
  glint: THREE.MeshBasicMaterial;
}

let shared: GuestMaterials | null = null;

export function guestMaterials(): GuestMaterials {
  if (!shared) {
    shared = {
      fur: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, envMapIntensity: 0.85 }),
      gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, envMapIntensity: 1.5 }),
      glint: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    shared.fur.name = 'guest-fur';
    shared.gloss.name = 'guest-gloss';
    shared.glint.name = 'guest-glint';
  }
  return shared;
}

/** Release the shared materials (e.g. when leaving the game screen). Guests built later recreate them. */
export function disposeGuestMaterials(): void {
  if (!shared) return;
  shared.fur.dispose();
  shared.gloss.dispose();
  shared.glint.dispose();
  shared = null;
}
