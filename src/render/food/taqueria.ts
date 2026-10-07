import * as THREE from 'three';
import type { FoodId } from '../../core/content';
import {
  C, Kit, alignX, deform, dice, disc, ellipsoid, fractions, lathe, leaf, noise3, orient, ramp, rng, smooth, spline2,
  sweep, type Vec,
} from './kit';
import { greenLeafColor, pointyLeaf } from './produce';

/**
 * Taquería ingredients (pantry tiles, same footprint and budget as the Trattoria ones) and the
 * small filling pieces that sit on an open tortilla or wrap and fill the folded tacos.
 */

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ shared colours

export const FILLING_COLOR: Partial<Record<FoodId, THREE.Color>> = {
  beans: C('#6e2f22'), pork: C('#b8673c'), chicken: C('#e6b670'), cheese: C('#f7c12d'),
  lettuce: C('#7cc84f'), corn: C('#f6cf36'), salsa: C('#d23a2a'), guacamole: C('#8bbd45'),
};

const CORN_T = C('#efc874'), CORN_T_LIGHT = C('#f8dc98'), CORN_T_EDGE = C('#dcab58'), CHAR = C('#9c5a24');
const FLOUR = C('#f6e9cc'), FLOUR_LIGHT = C('#fdf6e7'), FLOUR_EDGE = C('#e8d3a8'), BLISTER = C('#cf9a52');

/** Toasted spots: soft-edged discs that blend into the bread colour at their rim. */
function spot(base: THREE.Color, dark: THREE.Color, rx: number, rz: number, up = true): THREE.BufferGeometry {
  const prof: [number, number][] = up ? [[1, 0], [0.5, 0.18], [0, 0.22]] : [[0, -0.22], [0.5, -0.18], [1, 0]];
  const g = lathe(prof, 8, { color: (_th, t, _y, out) => out.copy(base).lerp(dark, smooth(0, 0.85, up ? t : 1 - t)) });
  g.scale(rx, 0.02, rz);
  return g;
}

// ------------------------------------------------------------------ tortillas

export const TORTILLA_R = 0.4;
export const WRAP_R = 0.435;
/** Height of the top surface of an open tortilla or wrap near its centre (where fillings sit). */
export const TORTILLA_TOP = 0.021;

function flatTortilla(k: Kit, R: number, flourType: boolean, seed: number): void {
  const base = flourType ? FLOUR : CORN_T, light = flourType ? FLOUR_LIGHT : CORN_T_LIGHT, edge = flourType ? FLOUR_EDGE : CORN_T_EDGE;
  const thick = 0.018;
  const radius = (th: number) => R * (1 + 0.016 * Math.sin(6 * th + seed) + 0.01 * Math.sin(11 * th + 2 * seed));
  const height = (f: number, th: number) => 0.012 + 0.016 * f ** 3 * (0.6 + 0.4 * Math.sin(3 * th + seed)) + 0.005 * f * f * Math.sin(5 * th + 1);
  k.add(disc(6, 44, radius, height, thick, (f, th, top, out) => {
    ramp(out, [[0, light], [0.6, base], [1, edge]], f);
    out.multiplyScalar(0.94 + 0.06 * noise3(Math.cos(th) * 3 * f, Math.sin(th) * 3 * f, seed, 4));
    if (!top) out.multiplyScalar(0.86);
  }), undefined, 'matte');
  const rnd = rng(seed);
  const n = flourType ? 9 : 15;
  for (let i = 0; i < n; i++) {
    const f = 0.12 + 0.75 * Math.sqrt(rnd()), a = rnd() * TAU;
    const s = flourType ? 0.035 + rnd() * 0.035 : 0.014 + rnd() * 0.02;
    const g = spot(base, flourType ? BLISTER : CHAR, s, s * (0.6 + rnd() * 0.4));
    g.rotateY(rnd() * 3);
    g.translate(Math.cos(a) * f * R, height(f, a) + (thick / 2) * (1 - f * f) + 0.0012, Math.sin(a) * f * R);
    k.add(g, undefined, 'matte');
  }
}

/** A flat, slightly floppy corn tortilla (0.8 wide, ~0.05 tall): fillings sit on top of it. */
export function tortilla(k: Kit): void {
  flatTortilla(k, TORTILLA_R, false, 3);
}

/** A bigger, paler flour tortilla with golden blisters, for burritos. */
export function wrap(k: Kit): void {
  flatTortilla(k, WRAP_R, true, 5);
}

export interface FillingSlot { x: number; y: number; z: number; yaw: number }

/** Where the 3 (tortilla) or 4 (wrap) filling pieces sit on an open container, in its local space. */
export function fillingSlots(container: FoodId): FillingSlot[] {
  const n = container === 'wrap' ? 4 : 3;
  const r = container === 'wrap' ? 0.19 : 0.155;
  const out: FillingSlot[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU + (n === 4 ? Math.PI / 4 : 0);
    out.push({ x: Math.cos(a) * r, y: TORTILLA_TOP, z: Math.sin(a) * r, yaw: i * 2.1 });
  }
  return out;
}

// ------------------------------------------------------------------ beans

const BEAN = C('#6a2b1f'), BEAN_LIGHT = C('#a54f37');

function bean(len: number, seg = 7): THREE.BufferGeometry {
  const g = ellipsoid(len, len * 0.56, len * 0.62, seg, 5);
  deform(g, (p) => {
    p.z += 0.34 * len * (1 - (p.x / len) ** 2);
  });
  return g;
}

function beanColor(_p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color): void {
  out.copy(BEAN).lerp(BEAN_LIGHT, smooth(-0.2, 0.9, n.y) * 0.55);
}

/** A heap of beans on the origin; `rings` of beans around a centre one. */
function beanHeap(k: Kit, counts: number[], spacing: number, size: number, seed: number, baseY = 0): void {
  const rnd = rng(seed);
  counts.forEach((count, ring) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + ring * 0.7 + rnd() * 0.3, r = ring * spacing;
      const b = bean(size * (0.9 + rnd() * 0.2));
      b.rotateZ((rnd() - 0.5) * 0.5).rotateY(rnd() * TAU);
      b.translate(Math.cos(a) * r, baseY + size * 0.5 + (counts.length - 1 - ring) * size * 0.75, Math.sin(a) * r);
      k.add(b, beanColor, 'gloss');
    }
  });
}

/** A terracotta cazuela heaped with glossy beans. */
export function beans(k: Kit): void {
  const clay = C('#c9693a'), clayDark = C('#93451f'), clayLight = C('#e48d57'), inner = C('#7b331d'), bed = C('#552218');
  const prof: [number, number][] = [[0, 0.01], [0.2, 0.01], [0.215, 0], [0.255, 0], [0.275, 0.02], [0.315, 0.09], [0.335, 0.16],
    [0.345, 0.195], [0.338, 0.212], [0.316, 0.208], [0.3, 0.18]];
  const tf = fractions(prof);
  k.add(lathe(prof, 26, {
    color: (_th, t, y, out) => {
      if (t > tf[8]) out.copy(inner);
      else if (t > tf[6]) out.copy(clayLight);
      else ramp(out, [[0, clayDark], [0.06, clayDark], [0.15, clay]], y);
    },
  }), undefined, 'matte');
  for (const s of [-1, 1]) {
    const lug = ellipsoid(0.05, 0.022, 0.035, 7, 4);
    lug.translate(s * 0.35, 0.17, 0);
    k.add(lug, clay, 'matte');
  }
  k.add(lathe([[0.31, 0.175], [0.2, 0.19], [0, 0.197]], 26), bed, 'gloss');
  beanHeap(k, [1, 5, 6], 0.1, 0.05, 2, 0.17);
}

// ------------------------------------------------------------------ pork (carnitas)

const PORK = C('#c27242'), PORK_CRISP = C('#7f3c1b'), PORK_LIGHT = C('#e7a873');

function porkChunk(size: number, seed: number, seg = 11): THREE.BufferGeometry {
  const g = ellipsoid(size * 1.25, size * 0.58, size * 0.7, seg, 7);
  deform(g, (p) => {
    p.multiplyScalar(1 + 0.2 * noise3(p.x * 13 + seed, p.y * 13, p.z * 13, 3));
    if (p.y < 0) p.y *= 0.55;
  });
  return g;
}

function porkColor(seed: number) {
  return (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color): void => {
    // pulled fibres: light and dark streaks along the chunk, crisp caramelised tops
    out.copy(PORK).lerp(PORK_LIGHT, 0.6 * smooth(0.1, 0.9, Math.sin(p.z * 70 + p.y * 30 + seed) * 0.5 + 0.5));
    out.lerp(PORK_CRISP, 0.8 * smooth(0.05, 0.55, noise3(p.x * 11 + seed, p.y * 11, p.z * 11, 9)) * smooth(-0.1, 0.7, n.y));
  };
}

function porkShred(k: Kit, a: Vec, b: Vec, r: number): void {
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.015, (a[2] + b[2]) / 2];
  k.add(sweep([a, mid, b], (t) => r * (1 - 0.5 * t), 4, 4), (_p, _n, out) => out.copy(PORK_LIGHT).lerp(PORK, 0.4), 'gloss');
}

/** Caramelised pulled-pork chunks heaped on a little wooden board. */
export function pork(k: Kit): void {
  const wood = C('#cf9a5f'), woodLight = C('#e3b47b'), woodDark = C('#a06e3a');
  const h = 0.05;
  k.add(lathe([[0, 0], [0.37, 0], [0.39, 0.018], [0.39, h - 0.012], [0.375, h], [0.25, h], [0, h]], 30, {
    radial: (th) => 1 + 0.012 * Math.sin(3 * th),
    color: (_th, _t, y, out, r) => {
      if (y < h - 0.001) out.copy(woodDark).lerp(wood, smooth(0, h, y));
      else out.copy(r > 0.3 ? wood : woodLight);
    },
  }), undefined, 'matte');
  const chunks: [number, number, number, number][] = [[-0.12, -0.08, 0.13, 1], [0.12, -0.1, 0.12, 2], [0.0, 0.11, 0.125, 3], [-0.15, 0.14, 0.1, 4], [0.17, 0.12, 0.1, 5]];
  for (const [x, z, s, seed] of chunks) {
    const g = porkChunk(s, seed);
    g.rotateY(seed * 1.3);
    g.translate(x, h + s * 0.35, z);
    k.add(g, porkColor(seed), 'gloss');
  }
  porkShred(k, [-0.05, h + 0.13, -0.02], [0.08, h + 0.1, 0.05], 0.016);
  porkShred(k, [0.02, h + 0.12, -0.12], [-0.1, h + 0.1, 0.02], 0.014);
}

// ------------------------------------------------------------------ chicken

const ROAST = C('#dc903c'), ROAST_LIGHT = C('#f4bd67'), ROAST_DARK = C('#a65b20'), BONE = C('#f6eedd'), CHICKEN_PALE = C('#fff1d6');

function drumstickParts(seed: number): THREE.BufferGeometry[] {
  const meatProf = spline2([[0, 0], [0.075, 0.008], [0.12, 0.045], [0.138, 0.11], [0.128, 0.18], [0.098, 0.25], [0.062, 0.31],
    [0.04, 0.35], [0.033, 0.375], [0, 0.382]], 11);
  const meat = lathe(meatProf, 18, {
    radial: (th, t) => 1 + 0.04 * noise3(Math.cos(th) * 2, Math.sin(th) * 2, t * 4 + seed, 6),
    color: (th, t, _y, out) => {
      ramp(out, [[0, ROAST_DARK], [0.15, ROAST], [0.55, ROAST_LIGHT], [0.85, ROAST], [1, ROAST_DARK]], t);
      out.lerp(ROAST_DARK, 0.6 * smooth(0.2, 0.6, noise3(Math.cos(th) * 3, Math.sin(th) * 3, t * 6 + seed, 2)));
    },
  });
  const bone = lathe([[0, 0.34], [0.024, 0.345], [0.021, 0.43], [0.026, 0.45], [0, 0.455]], 10);
  const knobA = ellipsoid(0.034, 0.03, 0.03, 8, 5).translate(0.022, 0.465, 0);
  const knobB = ellipsoid(0.034, 0.03, 0.03, 8, 5).translate(-0.022, 0.465, 0);
  for (const g of [bone, knobA, knobB]) {
    const c = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < c.length; i += 3) BONE.toArray(c, i);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return [meat, bone, knobA, knobB];
}

function lay(k: Kit, parts: THREE.BufferGeometry[], axis: Vec, at: Vec, finishes: ('matte' | 'gloss')[]): void {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...axis).normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(1, 1, 1));
  let minY = Infinity;
  for (const g of parts) {
    g.applyMatrix4(m);
    g.computeBoundingBox();
    minY = Math.min(minY, g.boundingBox!.min.y);
  }
  parts.forEach((g, i) => k.add(g.translate(0, -minY, 0), undefined, finishes[i] ?? 'matte'));
}

/** Two roasted drumsticks crossed, bones up — the classic chicken icon. */
export function chicken(k: Kit): void {
  const big = (parts: THREE.BufferGeometry[]) => parts.map((g) => g.scale(1.15, 1.15, 1.15));
  lay(k, big(drumstickParts(1)), [0.72, 0.24, -0.42], [-0.26, 0, 0.2], ['gloss', 'matte', 'matte', 'matte']);
  lay(k, big(drumstickParts(2)), [0.5, 0.24, -0.62], [-0.04, 0, -0.06], ['gloss', 'matte', 'matte', 'matte']);
  k.centerXZ();
}

// ------------------------------------------------------------------ corn

const KERNEL = C('#f7cf38'), KERNEL_LIGHT = C('#fde68a'), KERNEL_GAP = C('#cf9a1c');
const HUSK = C('#a9cc6a'), HUSK_LIGHT = C('#e4e2a2');

/** A corn cob lying across the tile, husks peeled back at its stem end. */
export function corn(k: Kit): void {
  const L = 0.68, R = 0.125, rings = 22, along = 11;
  const prof: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // flat stem end, a long even cob, tapering to a rounded tip
    const r = i === 0 || i === rings ? 0
      : R * Math.sqrt(smooth(0, 0.08, t)) * (1 - 0.35 * smooth(0.6, 1, t) ** 2) * (t > 0.95 ? Math.sqrt((1 - t) / 0.05) : 1);
    prof.push([r, t * L]);
  }
  const kernel = (th: number, t: number) => (0.5 + 0.5 * Math.cos(12 * th)) * (0.5 + 0.5 * Math.cos(TAU * along * t));
  const cob = lathe(prof, 24, {
    radial: (th, t) => 1 + 0.07 * kernel(th, t) * smooth(0.04, 0.1, t),
    color: (th, t, _y, out) => out.copy(KERNEL_GAP).lerp(KERNEL, smooth(0, 0.35, kernel(th, t))).lerp(KERNEL_LIGHT, smooth(0.6, 1, kernel(th, t)) * 0.6),
  });
  const dir = new THREE.Vector3(-0.78, 0, 0.6).normalize();
  const base = new THREE.Vector3(0.27, R, -0.21);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  cob.applyQuaternion(q).translate(base.x, base.y, base.z);
  k.add(cob, undefined, 'gloss');
  // Stalk stub and three husk leaves wrapping the lower cob and flaring out.
  const stub = sweep([base.clone().addScaledVector(dir, 0.02).toArray(), base.clone().addScaledVector(dir, -0.07).toArray()], 0.04, 1, 7, { caps: 'flat' });
  k.add(stub, HUSK_LIGHT, 'matte');
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  for (const [s, drop, len] of [[-1, 0.0, 0.36], [1, 0.0, 0.34], [0, -1, 0.3]] as const) {
    const g = leaf(len, 0.17, {
      nu: 7, nv: 3, thickness: 0.012, fold: -0.05,
      width: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.8),
      lift: (u) => 0.05 * u * u,
      color: (u, _v, top, out) => { out.copy(HUSK).lerp(HUSK_LIGHT, smooth(0.3, 1, u)); if (!top) out.multiplyScalar(0.85); },
    });
    const at = base.clone().addScaledVector(dir, 0.01).addScaledVector(side, s * R * 0.85).add(new THREE.Vector3(0, drop * R * 0.8 + (s ? 0.01 : 0), 0));
    const d = dir.clone().addScaledVector(side, s * 0.28);
    alignX(g, d.toArray(), at.toArray(), [side.x * s * 0.6, 1, side.z * s * 0.6]);
    k.add(g, undefined, 'matte');
  }
  k.centerXZ();
}

// ------------------------------------------------------------------ avocado

const AVO_SKIN = C('#2e4818'), AVO_SKIN_LIGHT = C('#4f6e26'), AVO_RIM = C('#5f8f2a'), AVO_FLESH = C('#a9cf55');
const AVO_PALE = C('#e6ee9c'), PIT = C('#8a5330'), PIT_LIGHT = C('#b9804f');

/** Half an avocado, cut face up, pit in. */
export function avocado(k: Kit): void {
  const S = 36, h = 0.17;
  const outline = (th: number) => 0.24 + 0.17 * Math.max(0, Math.cos(th)) ** 2.2;
  const face = disc(6, S, outline, () => h, 0, (f, _th, _top, out) => {
    ramp(out, [[0, AVO_PALE], [0.45, AVO_PALE], [0.8, AVO_FLESH], [0.93, AVO_RIM], [0.97, AVO_SKIN], [1, AVO_SKIN]], f);
  }, true);
  const skin = lathe([[0, 0], [0.4, h * 0.05], [0.7, h * 0.22], [0.9, h * 0.5], [0.98, h * 0.78], [1, h]], S, {
    radial: (th, t) => outline(th) * (1 + 0.035 * noise3(Math.cos(th) * 4, t * 5, Math.sin(th) * 4, 8) * (1 - smooth(0.8, 1, t))),
    color: (th, t, _y, out) => out.copy(AVO_SKIN).lerp(AVO_SKIN_LIGHT, 0.6 * smooth(0, 0.7, noise3(Math.cos(th) * 7, t * 9, Math.sin(th) * 7, 2))),
  });
  const pit = ellipsoid(0.108, 0.1, 0.108, 16, 10);
  pit.translate(-0.01, h - 0.012, 0);
  const tilt = new THREE.Matrix4().compose(new THREE.Vector3(-0.07, 0, 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.62, 0)), new THREE.Vector3(1, 1, 1));
  k.within(tilt, () => {
    k.add(skin, undefined, 'matte');
    k.add(face, undefined, 'gloss');
    k.add(pit, (_p, n, out) => out.copy(PIT).lerp(PIT_LIGHT, smooth(0.2, 1, n.y) * 0.6), 'gloss');
  });
}

// ------------------------------------------------------------------ lime

const LIME = C('#5fae25'), LIME_LIGHT = C('#9fd447'), LIME_DARK = C('#3f7d18');
const LIME_FLESH = C('#cfe98a'), LIME_FLESH_DARK = C('#b2d862'), PITH = C('#f3f7df');

/** Half a lime, cut face up: rind, white pith ring and the segment star. */
export function halfLime(k: Kit, R: number, lite = false): void {
  const S = lite ? 24 : 40, h = R * 0.8;
  const segs = 9;
  k.add(disc(lite ? 4 : 6, S, () => R, () => h, 0, (f, th, _top, out) => {
    const div = Math.pow(0.5 + 0.5 * Math.cos(segs * th), 14);
    ramp(out, [[0, PITH], [0.12, LIME_FLESH], [0.8, LIME_FLESH_DARK], [0.86, PITH], [0.93, PITH], [0.95, LIME], [1, LIME]], f);
    if (f > 0.1 && f < 0.85) out.lerp(PITH, 0.75 * div);
  }, true), undefined, 'gloss');
  k.add(lathe([[0, 0], [0.55, h * 0.12], [0.85, h * 0.45], [1, h]], S, {
    color: (_th, t, _y, out) => out.copy(LIME_DARK).lerp(LIME, smooth(0.1, 0.8, t)),
  }).scale(R, 1, R), undefined, 'gloss');
}

/** A whole lime and a half lime showing its segments. */
export function lime(k: Kit): void {
  const whole = ellipsoid(0.19, 0.155, 0.16, 20, 12);
  deform(whole, (p) => {
    const tip = Math.max(0, p.x / 0.19);
    p.x += 0.02 * tip ** 8;
  });
  whole.rotateY(0.5);
  whole.translate(-0.13, 0.155, -0.13);
  k.add(whole, (p, n, out) => {
    ramp(out, [[-1, LIME_DARK], [0, LIME], [1, LIME_LIGHT]], n.y);
    out.multiplyScalar(0.95 + 0.08 * noise3(p.x * 30, p.y * 30, p.z * 30, 3));
  }, 'gloss');
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0.14, 0.01, 0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, -0.08)), new THREE.Vector3(1, 1, 1));
  k.within(m, () => halfLime(k, 0.2));
}

// ------------------------------------------------------------------ salsa (molcajete)

const STONE = C('#4b4a4d'), STONE_LIGHT = C('#7d7a78'), STONE_DARK = C('#2f2e31');
const SALSA = C('#d23a2a'), SALSA_DARK = C('#9c2016'), SALSA_LIGHT = C('#ec5a3d');
const TOMATO_BIT = C('#f0583a'), ONION_BIT = C('#fbf7f4'), CILANTRO = C('#3a9d36');

/** Tomato chunks, onion bits and cilantro scattered within radius `rx`; `y(f)` is the surface height at radius fraction f. */
function salsaTopping(k: Kit, rx: number, cx: number, cz: number, y: (f: number) => number, seed: number, counts: [number, number, number], size = 1): void {
  const rnd = rng(seed);
  const at = () => {
    const a = rnd() * TAU, r = rx * Math.sqrt(rnd()) * 0.85;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, r / rx] as const;
  };
  for (let i = 0; i < counts[0]; i++) {
    const [x, z, f] = at();
    const d = dice(0.05 * size, 0.036 * size, 0.045 * size, 0.011 * size);
    d.rotateX(rnd() - 0.5).rotateY(rnd() * 3);
    d.translate(x, y(f), z);
    k.add(d, TOMATO_BIT, 'gloss');
  }
  for (let i = 0; i < counts[1]; i++) {
    const [x, z, f] = at();
    const d = dice(0.034 * size, 0.022 * size, 0.03 * size, 0.007 * size);
    d.rotateX(rnd() - 0.5).rotateY(rnd() * 3);
    d.translate(x, y(f) + 0.004, z);
    k.add(d, ONION_BIT, 'matte');
  }
  for (let i = 0; i < counts[2]; i++) {
    const [x, z, f] = at();
    const g = leaf(0.065 * size, 0.05 * size, { nu: 3, nv: 2, thickness: 0.008, fold: 0.01, width: pointyLeaf });
    g.rotateY(rnd() * TAU);
    g.translate(x, y(f) + 0.008, z);
    k.add(g, CILANTRO, 'matte');
  }
}

/** Chunky tomato salsa with onion and cilantro, in a three-legged stone molcajete. */
export function salsa(k: Kit): void {
  const prof: [number, number][] = [[0, 0.07], [0.17, 0.068], [0.26, 0.095], [0.315, 0.15], [0.338, 0.205], [0.336, 0.24],
    [0.318, 0.255], [0.292, 0.248], [0.275, 0.22], [0.26, 0.19]];
  const bowl = lathe(prof, 26);
  deform(bowl, (p) => {
    const n = noise3(p.x * 18, p.y * 18, p.z * 18, 12);
    const r = Math.hypot(p.x, p.z);
    if (r > 0.02) {
      p.x *= 1 + 0.025 * n;
      p.z *= 1 + 0.025 * n;
    }
  });
  k.add(bowl, (p, n, out) => {
    ramp(out, [[0, STONE_DARK], [0.12, STONE], [0.24, STONE]], p.y);
    out.lerp(STONE_LIGHT, 0.55 * smooth(0.3, 0.8, noise3(p.x * 40, p.y * 40, p.z * 40, 7)) + 0.15 * smooth(0.3, 1, n.y));
  }, 'matte');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const leg = lathe([[0, 0], [0.045, 0], [0.055, 0.03], [0.06, 0.08], [0, 0.085]], 9);
    leg.translate(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
    k.add(leg, STONE, 'matte');
  }
  const top = (f: number) => 0.27 - 0.035 * f * f;
  const surf = lathe([[0.3, 0.232], [0.22, 0.258], [0.12, 0.268], [0, 0.272]], 26, {
    color: (_th, t, _y, out) => ramp(out, [[0, SALSA_DARK], [0.25, SALSA], [1, SALSA_LIGHT]], t),
  });
  deform(surf, (p) => { p.y += 0.02 * noise3(p.x * 16, 0, p.z * 16, 5) * smooth(0.3, 0.2, Math.hypot(p.x, p.z)); });
  k.add(surf, undefined, 'gloss');
  salsaTopping(k, 0.25, 0, 0, top, 21, [7, 5, 3], 1.15);
}

// ------------------------------------------------------------------ guacamole

const GLAZE = C('#f7f0e2'), GLAZE_SHADE = C('#e2d6c2'), COBALT = C('#2f62b8');
const GUAC = C('#84b23f'), GUAC_DARK = C('#4f7a25'), GUAC_LIGHT = C('#c6df7a');
export const CHIP = C('#f2c25a'), CHIP_DARK = C('#d39a34');

function guacMound(k: Kit, R: number, H: number, y0: number, seed: number, seg: number): void {
  const g = lathe([[R, y0], [R * 0.78, y0 + H * 0.55], [R * 0.45, y0 + H * 0.9], [0, y0 + H]], seg, {
    color: (_th, t, _y, out) => ramp(out, [[0, GUAC_DARK], [0.35, GUAC], [1, GUAC_LIGHT]], t),
  });
  deform(g, (p) => {
    const n = noise3(p.x * 16 / R * 0.3, p.y * 10, p.z * 16 / R * 0.3, seed);
    if (p.y > y0 + 0.002) p.y += H * 0.18 * n;
    p.x *= 1 + 0.05 * n;
    p.z *= 1 + 0.05 * n;
  });
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const pos = g.getAttribute('position');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const v = noise3(pos.getX(i) * 30, pos.getY(i) * 30, pos.getZ(i) * 30, seed + 4);
    c.fromBufferAttribute(col, i).lerp(v > 0 ? GUAC_LIGHT : GUAC_DARK, Math.abs(v) * 0.5);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  k.add(g, undefined, 'gloss');
}

/** A tortilla chip: a puffy rounded triangle, lying in the XY plane. */
export function chip(size: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const pts = [0, 1, 2].map((i) => new THREE.Vector2(Math.cos(Math.PI / 2 + (i * TAU) / 3) * size, Math.sin(Math.PI / 2 + (i * TAU) / 3) * size));
  s.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= 3; i++) {
    const p = pts[i % 3], prev = pts[i - 1];
    s.quadraticCurveTo((prev.x + p.x) / 2 + (prev.x + p.x) * 0.08, (prev.y + p.y) / 2 + (prev.y + p.y) * 0.08, p.x, p.y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 3 });
  g.translate(0, 0, -0.005);
  return g;
}

/** Guacamole in a cobalt-banded glazed bowl, with tortilla chips stuck in it. */
export function guacamole(k: Kit): void {
  const prof: [number, number][] = [[0, 0.012], [0.14, 0.012], [0.15, 0], [0.19, 0], [0.205, 0.02], [0.28, 0.1], [0.325, 0.185],
    [0.342, 0.222], [0.338, 0.236], [0.32, 0.232], [0.3, 0.2]];
  const tf = fractions(prof);
  k.add(lathe(prof, 28, {
    color: (_th, t, y, out) => {
      if (t >= tf[6] && t <= tf[8]) out.copy(COBALT);
      else if (t < tf[3]) out.copy(COBALT);
      else out.copy(GLAZE_SHADE).lerp(GLAZE, smooth(0.02, 0.15, y));
    },
  }), undefined, 'gloss');
  // Cobalt dots around the belly.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const d = lathe([[1, 0], [0, 0.25]], 7).scale(0.024, 0.02, 0.024);
    orient(d, [Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8], [Math.cos(a) * 0.3, 0.13, Math.sin(a) * 0.3]);
    k.add(d, COBALT, 'gloss');
  }
  guacMound(k, 0.3, 0.085, 0.19, 7, 28);
  salsaTopping(k, 0.17, 0.02, 0.02, () => 0.27, 33, [2, 2, 2], 0.9);
  for (const [a, tiltA, h] of [[-1.2, 0.3, 0.0], [0.9, 0.35, 0.01], [3.0, 0.3, -0.01]] as const) {
    const g = chip(0.13);
    g.rotateX(-tiltA);
    g.rotateY(-a + Math.PI / 2);
    g.translate(Math.cos(a) * 0.13, 0.35 + h, Math.sin(a) * 0.13);
    k.add(g, (p, _n, out) => out.copy(CHIP).lerp(CHIP_DARK, smooth(0.25, 0.75, noise3(p.x * 30, p.y * 30, p.z * 30, 2)) * 0.6), 'matte');
  }
}

// ------------------------------------------------------------------ filling pieces

const CHEESE_LIGHT = C('#fdd95c');
const SHRED_COLOR = greenLeafColor(C('#4cae3c'), C('#b6e477'));

/**
 * A small portion (~0.35 wide, base at y = 0) of a taco filling, to sit on an open tortilla or
 * inside a folded taco. `lite` drops detail for the small counter tacos.
 */
export function fillingPiece(k: Kit, id: FoodId, lite = false): boolean {
  const rnd = rng(id.length * 31 + 7);
  switch (id) {
    case 'beans':
      beanHeap(k, lite ? [1, 4] : [1, 6, 3], 0.085, 0.048, 4);
      return true;
    case 'pork': {
      const chunks: [number, number, number][] = lite ? [[-0.06, 0, 0.1], [0.07, 0.03, 0.095]] : [[-0.07, -0.03, 0.1], [0.08, -0.04, 0.095], [0.0, 0.08, 0.09]];
      chunks.forEach(([x, z, s], i) => {
        const g = porkChunk(s, i + 2, lite ? 9 : 11);
        g.rotateY(i * 1.7);
        g.translate(x, s * 0.35, z);
        k.add(g, porkColor(i), 'gloss');
      });
      if (!lite) porkShred(k, [-0.08, 0.1, 0.04], [0.07, 0.09, 0.0], 0.014);
      return true;
    }
    case 'chicken': {
      const n = lite ? 4 : 6;
      for (let i = 0; i < n; i++) {
        const g = ellipsoid(0.1, 0.03, 0.038, lite ? 7 : 9, 5);
        deform(g, (p) => {
          p.multiplyScalar(1 + 0.15 * noise3(p.x * 25 + i, p.y * 25, p.z * 25, 6));
          p.y += 0.25 * (p.x / 0.085) ** 2 * 0.03;
        });
        const a = (i / n) * TAU + rnd() * 0.5, r = i === 0 ? 0 : 0.085;
        g.rotateZ(0.2).rotateY(rnd() * TAU);
        g.translate(Math.cos(a) * r, 0.028 + (i === 0 ? 0.04 : 0), Math.sin(a) * r);
        k.add(g, (p, nn, out) => {
          out.copy(FILLING_COLOR.chicken!).lerp(ROAST, 0.8 * smooth(-0.1, 0.5, noise3(p.x * 20, p.y * 20, p.z * 20, 3)));
          out.lerp(CHICKEN_PALE, 0.25 * smooth(0.3, 1, nn.y));
        }, 'gloss');
      }
      return true;
    }
    case 'cheese': {
      const n = lite ? 8 : 13;
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, r = 0.11 * Math.sqrt(rnd()), yaw = rnd() * TAU, len = 0.05 + rnd() * 0.03;
        const y = 0.012 + (1 - r / 0.11) * 0.04 + rnd() * 0.01;
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r, dx = Math.cos(yaw) * len, dz = Math.sin(yaw) * len;
        k.add(sweep([[cx - dx, y, cz - dz], [cx, y + 0.008, cz], [cx + dx, y - 0.004, cz + dz]], 0.011, 2, 4, { caps: 'flat' }),
          i % 3 ? FILLING_COLOR.cheese! : CHEESE_LIGHT, 'matte');
      }
      return true;
    }
    case 'lettuce': {
      const n = lite ? 5 : 8;
      for (let i = 0; i < n; i++) {
        const g = leaf(0.13, 0.055, {
          nu: 4, nv: 1, thickness: 0.01, fold: 0.012, lift: (u) => 0.02 * Math.sin(Math.PI * u),
          ruffle: (u, v) => 0.008 * Math.sin(u * 14) * v, color: SHRED_COLOR,
        });
        const a = (i / n) * TAU + rnd(), r = 0.05 + rnd() * 0.05;
        g.translate(-0.065, 0, 0);
        g.rotateZ((rnd() - 0.5) * 0.4).rotateY(rnd() * TAU);
        g.translate(Math.cos(a) * r, 0.015 + (i % 3) * 0.018, Math.sin(a) * r);
        k.add(g, undefined, 'gloss');
      }
      return true;
    }
    case 'corn': {
      const counts = lite ? [1, 6] : [1, 6, 7];
      counts.forEach((count, ring) => {
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + ring * 0.5, r = ring * 0.055;
          const g = ellipsoid(0.03, 0.022, 0.027, 6, 4);
          g.rotateZ(rnd() - 0.5).rotateY(rnd() * TAU);
          g.translate(Math.cos(a) * r, 0.02 + (counts.length - 1 - ring) * 0.028, Math.sin(a) * r);
          k.add(g, (_p, n, out) => out.copy(KERNEL).lerp(KERNEL_LIGHT, smooth(0, 1, n.y) * 0.6), 'gloss');
        }
      });
      return true;
    }
    case 'salsa': {
      const blob = lathe([[1, 0], [0.85, 0.55], [0.5, 0.9], [0, 1]], lite ? 14 : 18, {
        radial: (th) => 1 + 0.26 * noise3(Math.cos(th) * 1.6, Math.sin(th) * 1.6, 3, 7),
        color: (_th, t, _y, out) => ramp(out, [[0, SALSA_DARK], [0.5, SALSA_DARK], [1, SALSA]], t),
      });
      // A flat, spreading spoonful (not a round blob, which would read as a tomato), studded with chunks.
      blob.scale(0.165, 0.034, 0.165);
      deform(blob, (p) => { p.y += 0.008 * noise3(p.x * 30, 0, p.z * 30, 4); });
      k.add(blob, undefined, 'gloss');
      salsaTopping(k, 0.12, 0, 0, (f) => 0.03 - 0.02 * f * f, 9, lite ? [3, 2, 1] : [4, 3, 2], 1.25);
      return true;
    }
    case 'guacamole':
      guacMound(k, 0.16, 0.055, 0, 3, lite ? 14 : 18);
      salsaTopping(k, 0.1, 0, 0, () => 0.045, 12, lite ? [1, 2, 1] : [2, 2, 1], 0.75);
      return true;
    default:
      return false;
  }
}

