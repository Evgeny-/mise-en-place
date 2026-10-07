import * as THREE from 'three';
import { lathe, merge, paint } from './geometry';
import { guestMaterials } from './materials';

/**
 * A diner stool for one seat (part of the room, not the guest: it stays when a guest leaves).
 * The cushion top is at y = 0, matching a guest's origin; the foot rests on the floor at -height.
 */
export function createStool(height = 0.9, cushion = '#e05a4f'): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const seat = lathe([[0, -0.13], [0.3, -0.13], [0.335, -0.1], [0.34, -0.05], [0.32, -0.012], [0.25, 0], [0, 0]], 24);
  parts.push(paint(seat, cushion));
  const rim = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24, 1, true);
  rim.translate(0, -0.15, 0);
  parts.push(paint(rim, '#d8dde3'));
  const post = new THREE.CylinderGeometry(0.05, 0.06, height - 0.17, 12, 1, true);
  post.translate(0, -0.15 - (height - 0.17) / 2, 0);
  parts.push(paint(post, '#c9ced6'));
  const ring = new THREE.TorusGeometry(0.2, 0.022, 6, 20);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, -height * 0.62, 0);
  parts.push(paint(ring, '#c9ced6'));
  const foot = lathe([[0, -height], [0.24, -height], [0.25, -height + 0.025], [0.08, -height + 0.06], [0, -height + 0.06]], 24);
  parts.push(paint(foot, '#b6bcc6'));
  const mesh = new THREE.Mesh(merge(parts), guestMaterials().fur);
  mesh.name = 'stool';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
