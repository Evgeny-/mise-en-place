import * as THREE from 'three';
import { C, Kit, deform, ellipsoid, fractions, lathe, noise3, ramp, rng, smooth } from './kit';
import { plate } from './dishes';

/**
 * Generic stand-ins for ids that have no dedicated model yet (new worlds land in content.ts
 * before their art). They follow the same footprint, budget and material rules and are tinted by
 * the identity colours, so the game never breaks and items stay told apart by colour.
 */

const GLAZE = C('#f8f0e1');
const GLAZE_SHADE = C('#e3d6c2');

/** A small glazed bowl heaped with something in `color`. */
export function fallbackFood(k: Kit, color: string, seed: number): void {
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.72);
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.28);
  const R = 0.36, H = 0.22;
  const prof: [number, number][] = [[0, 0.012], [R * 0.45, 0.012], [R * 0.48, 0], [R * 0.56, 0], [R * 0.6, 0.02], [R * 0.8, H * 0.38],
    [R * 0.95, H * 0.78], [R, H * 0.97], [R * 0.985, H], [R * 0.95, H * 0.98], [R * 0.9, H * 0.82]];
  const tf = fractions(prof);
  k.add(lathe(prof, 30, {
    color: (_th, t, y, out) => {
      if (t >= tf[7] && t <= tf[9]) out.copy(base).lerp(dark, 0.15);
      else out.copy(GLAZE_SHADE).lerp(GLAZE, smooth(0, H, y));
    },
  }), undefined, 'gloss');
  // The heaped filling, slightly lumpy, with a few loose pieces on top.
  const heap = lathe([[R * 0.93, H * 0.8], [R * 0.75, H * 1.05], [R * 0.45, H * 1.3], [0, H * 1.42]], 30, {
    radial: (th) => 1 + 0.06 * noise3(Math.cos(th) * 2, Math.sin(th) * 2, seed, 3),
    color: (_th, t, _y, out) => ramp(out, [[0, dark], [0.5, base], [1, light]], t),
  });
  deform(heap, (p) => {
    p.y += 0.02 * noise3(p.x * 9, 0, p.z * 9, seed + 1) * smooth(H * 0.85, H * 1.1, p.y);
  });
  k.add(heap, undefined, 'gloss');
  const rnd = rng(seed);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd(), r = 0.06 + rnd() * 0.12;
    const lump = ellipsoid(0.05, 0.035, 0.042, 8, 5);
    lump.rotateY(rnd() * 3);
    const y = H * 1.42 - (r / (R * 0.93)) ** 2 * H * 0.55;
    lump.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    k.add(lump, i % 2 ? light : base, 'gloss');
  }
}

/** A plate with the container part as a flat base and the other parts heaped on it. */
export function fallbackDish(k: Kit, colors: string[], seed: number): void {
  const well = plate(k, 0.72, C('#d98a3a'));
  const [container, ...fillings] = colors.length ? colors : ['#f0cf7a'];
  const baseC = new THREE.Color(container);
  k.add(lathe([[0, well], [0.5, well], [0.54, well + 0.02], [0.52, well + 0.04], [0.45, well + 0.045], [0, well + 0.045]], 32, {
    radial: (th) => 1 + 0.04 * noise3(Math.cos(th) * 2, Math.sin(th) * 2, seed, 5),
    color: (_th, t, _y, out) => out.copy(baseC).multiplyScalar(0.85 + 0.15 * t),
  }), undefined, 'matte');
  const rnd = rng(seed + 7);
  const n = Math.max(1, fillings.length);
  fillings.forEach((hex, i) => {
    const c = new THREE.Color(hex);
    for (let j = 0; j < 3; j++) {
      const a = ((i + j / 3) / n) * Math.PI * 2 + rnd() * 0.4, r = 0.12 + rnd() * 0.22;
      const lump = ellipsoid(0.08, 0.05, 0.07, 10, 6);
      lump.rotateY(rnd() * 3);
      lump.translate(Math.cos(a) * r, well + 0.07 + rnd() * 0.02, Math.sin(a) * r);
      k.add(lump, c, 'gloss');
    }
  });
}
