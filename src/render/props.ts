import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { stripeTexture } from './painter';

/**
 * Kitchen things standing on the chef's worktop. They are not part of the puzzle: they give the
 * counter its scale, so it reads as a table top and not as a floor. None of them may look like an
 * ingredient of its kitchen (no tomatoes, limes or salsa bowls).
 */
export type PropKind =
  | 'oil' | 'pepperMill' | 'rollingPin' | 'candle'
  | 'sauces' | 'shakers' | 'spatula' | 'napkins'
  | 'jug' | 'hotSauce' | 'sarape' | 'chilies';

type Track = <T extends { dispose(): void }>(x: T) => T;

const v2 = (pts: number[][]) => pts.map(([r, y]) => new THREE.Vector2(r, y));

/** A prop with its base at the origin, standing on y = 0. Geometries and materials go to `track`. */
export function propModel(kind: PropKind, track: Track): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    track(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(track(geo), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const lathe = (pts: number[][], segs = 28) => new THREE.LatheGeometry(v2(pts), segs);

  switch (kind) {
    case 'oil': {
      // olive-oil bottle: green glass, cream label, cork
      add(lathe([[0, 0], [0.15, 0], [0.165, 0.03], [0.165, 0.42], [0.14, 0.52], [0.065, 0.62], [0.055, 0.78], [0, 0.78]]), mat('#5e7d22', 0.12, 0.05, { emissive: '#1d2a08' }));
      add(new THREE.CylinderGeometry(0.168, 0.168, 0.18, 28, 1, true), mat('#f3e3bd', 0.7, 0, { side: THREE.DoubleSide }), 0, 0.24);
      add(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 14), mat('#c9a06a', 0.9), 0, 0.82);
      break;
    }
    case 'pepperMill': {
      const wood = mat('#7a4527', 0.45);
      add(lathe([[0, 0], [0.12, 0], [0.13, 0.04], [0.1, 0.16], [0.085, 0.3], [0.1, 0.38], [0.12, 0.42], [0.1, 0.47], [0, 0.47]]), wood);
      add(new THREE.SphereGeometry(0.05, 14, 10), wood, 0, 0.5);
      add(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 24), mat('#cfd4d6', 0.25, 0.8), 0, 0.33);
      break;
    }
    case 'rollingPin': {
      const wood = mat('#e2bf86', 0.55);
      add(new THREE.CylinderGeometry(0.1, 0.1, 1.05, 24).rotateZ(Math.PI / 2), wood, 0, 0.1);
      for (const s of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12).rotateZ(Math.PI / 2), wood, s * 0.6, 0.1);
        add(new THREE.SphereGeometry(0.05, 12, 8), wood, s * 0.7, 0.1);
      }
      break;
    }
    case 'candle': {
      // the trattoria classic: a candle in an empty Chianti bottle, wax running down its neck
      add(lathe([[0, 0], [0.13, 0], [0.19, 0.08], [0.2, 0.18], [0.16, 0.3], [0.06, 0.38], [0.05, 0.56], [0, 0.56]], 28), mat('#3f6b33', 0.12, 0.05, { emissive: '#132410' }));
      add(lathe([[0, 0], [0.14, 0], [0.2, 0.08], [0.205, 0.18], [0.17, 0.24], [0, 0.24]], 28), mat('#d8b46a', 0.95));
      add(new THREE.CylinderGeometry(0.05, 0.052, 0.26, 16), mat('#fbf1dc', 0.6), 0, 0.69);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        add(new THREE.CapsuleGeometry(0.018, 0.08 + (i % 2) * 0.06, 4, 8), mat('#fbf1dc', 0.6), Math.cos(a) * 0.055, 0.55, Math.sin(a) * 0.055);
      }
      add(new THREE.ConeGeometry(0.022, 0.07, 10), mat('#ffb347', 0.4, 0, { emissive: '#ff9a2e', emissiveIntensity: 1.2 }), 0, 0.86);
      break;
    }
    case 'sauces': {
      // ketchup and mustard squeeze bottles
      const bottle = (color: string, x: number, z: number) => {
        add(lathe([[0, 0], [0.095, 0], [0.105, 0.03], [0.105, 0.3], [0.085, 0.36], [0.045, 0.39], [0, 0.39]]), mat(color, 0.35), x, 0, z);
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 14), mat(color, 0.35), x, 0.41, z);
        add(new THREE.ConeGeometry(0.03, 0.14, 12), mat(color, 0.35), x, 0.5, z);
      };
      bottle('#d8322c', -0.12, 0.02);
      bottle('#f2bb1d', 0.13, -0.04);
      break;
    }
    case 'shakers': {
      const chrome = mat('#dfe4e7', 0.2, 0.85);
      const shaker = (fill: string, x: number, z: number) => {
        add(lathe([[0, 0], [0.07, 0], [0.078, 0.02], [0.07, 0.2], [0, 0.2]], 20), mat('#eef4f6', 0.08, 0, { transparent: true, opacity: 0.55 }), x, 0, z);
        add(new THREE.CylinderGeometry(0.06, 0.064, 0.15, 18), mat(fill, 0.8), x, 0.085, z);
        add(new THREE.SphereGeometry(0.072, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), chrome, x, 0.2, z);
      };
      shaker('#fbfbf8', -0.09, 0);
      shaker('#4e4744', 0.09, 0.03);
      break;
    }
    case 'spatula': {
      const steel = mat('#cfd5d8', 0.3, 0.75);
      const blade = add(new RoundedBoxGeometry(0.34, 0.016, 0.3, 2, 0.006), steel, 0, 0.012, 0);
      blade.rotation.y = 0;
      add(new THREE.BoxGeometry(0.03, 0.012, 0.28), steel, 0, 0.03, 0.27).rotation.x = -0.12;
      add(new RoundedBoxGeometry(0.075, 0.06, 0.42, 2, 0.025), mat('#2b2b2f', 0.5), 0, 0.055, 0.6);
      break;
    }
    case 'napkins': {
      // chrome napkin dispenser with a napkin sticking out
      add(new RoundedBoxGeometry(0.42, 0.3, 0.2, 3, 0.04), mat('#dfe4e7', 0.18, 0.85), 0, 0.15, 0);
      add(new THREE.BoxGeometry(0.3, 0.12, 0.012), mat('#ffffff', 0.9), 0, 0.33, 0.0);
      add(new THREE.BoxGeometry(0.3, 0.2, 0.01), mat('#e8484a', 0.6), 0, 0.15, 0.101);
      break;
    }
    case 'jug': {
      // a glazed clay jug of agua fresca, with a painted band
      add(lathe([[0, 0], [0.16, 0], [0.21, 0.08], [0.23, 0.2], [0.2, 0.34], [0.13, 0.44], [0.12, 0.5], [0.14, 0.54], [0, 0.54]], 28), mat('#b85a32', 0.55));
      add(new THREE.CylinderGeometry(0.226, 0.231, 0.06, 28, 1, true), mat('#f2e3c6', 0.6, 0, { side: THREE.DoubleSide }), 0, 0.2);
      add(new THREE.CylinderGeometry(0.115, 0.115, 0.01, 20), mat('#e9a0b6', 0.3), 0, 0.535);
      const handle = add(new THREE.TorusGeometry(0.11, 0.025, 8, 16, Math.PI), mat('#b85a32', 0.55), 0.2, 0.3, 0);
      handle.rotation.z = -Math.PI / 2;
      break;
    }
    case 'hotSauce': {
      add(lathe([[0, 0], [0.075, 0], [0.08, 0.02], [0.08, 0.3], [0.04, 0.38], [0.03, 0.46], [0, 0.46]], 20), mat('#b8261c', 0.15, 0.05, { emissive: '#3a0703' }));
      add(new THREE.CylinderGeometry(0.083, 0.083, 0.13, 20, 1, true), mat('#f6e7c1', 0.7, 0, { side: THREE.DoubleSide }), 0, 0.15);
      add(new THREE.CylinderGeometry(0.034, 0.034, 0.07, 12), mat('#f2c12e', 0.4), 0, 0.49);
      break;
    }
    case 'sarape': {
      // a folded striped kitchen cloth
      const tex = track(stripeTexture(['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#e76f51']).clone());
      tex.needsUpdate = true;
      add(new RoundedBoxGeometry(0.95, 0.06, 0.52, 3, 0.025), mat('#ffffff', 0.95, 0, { map: tex }), 0, 0.03, 0);
      add(new RoundedBoxGeometry(0.95, 0.05, 0.3, 3, 0.022), mat('#ffffff', 0.95, 0, { map: tex }), 0, 0.085, 0.09);
      break;
    }
    case 'chilies': {
      // a bunch of dried red chillies tied with string
      const chili = mat('#9e1b14', 0.45);
      const stem = mat('#5d6b2a', 0.7);
      for (let i = 0; i < 6; i++) {
        const a = -0.5 + i * 0.2;
        const c = add(new THREE.ConeGeometry(0.045, 0.42, 10).rotateZ(-Math.PI / 2), chili, Math.cos(a) * 0.25, 0.045, Math.sin(a) * 0.25);
        c.rotation.y = -a;
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6).rotateZ(Math.PI / 2), stem, Math.cos(a) * 0.03, 0.045, Math.sin(a) * 0.03);
      }
      add(new THREE.TorusGeometry(0.05, 0.012, 6, 14), mat('#d8c39a', 0.9), 0.02, 0.05, 0).rotation.y = Math.PI / 2;
      break;
    }
  }
  return g;
}
