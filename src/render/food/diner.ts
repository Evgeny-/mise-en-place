import * as THREE from 'three';
import { C, Kit, deform, ellipsoid, fractions, lathe, lerp, noise3, orient, plate2, ramp, rng, smooth, squircle, sweep, type Vec } from './kit';
import { baconStrip } from './trattoria';

/**
 * The Burger Joint's other stacked dishes: hot dog, pancakes, club sandwich and sundae layers.
 * Like burger.ts, every layer is built around the origin with its base at y = 0 inside the raw-item
 * footprint; DINER_THICKNESS says where the next layer starts (a sausage sits down in its bun, a
 * scoop sinks into its glass). `pantry` variants read better on their own in a pantry tile.
 */

const TAU = Math.PI * 2;

export const DINER_LAYERS = ['pickles', 'bacon', 'toast', 'hotdog_bun', 'sausage', 'pancake', 'butter', 'berries', 'cup', 'ice_cream', 'chocolate', 'cherry'] as const;
export type DinerLayerId = (typeof DINER_LAYERS)[number];

export const DINER_THICKNESS: Record<DinerLayerId, number> = {
  pickles: 0.03, bacon: 0.035, toast: 0.08, hotdog_bun: 0.085, sausage: 0.095, pancake: 0.075, butter: 0.05,
  berries: 0.06, cup: 0.25, ice_cream: 0.17, chocolate: 0.17, cherry: 0.1,
};

// ------------------------------------------------------------------ pickles

const PICKLE = C('#6f9e2e'), PICKLE_SKIN = C('#3f6e1c'), PICKLE_SEEDS = C('#d8e49a');

function pickleSlice(R: number, h: number): THREE.BufferGeometry {
  return lathe([[0, 0], [R - 0.01, 0], [R, 0.01], [R, h - 0.008], [R - 0.01, h], [R * 0.5, h + 0.002], [0, h + 0.002]], 16, {
    radial: (th) => 1 + 0.06 * Math.max(0, Math.sin(9 * th)),
    color: (_th, _t, y, out, r) => {
      if (y < h - 0.002 || r > R * 0.9) out.copy(PICKLE_SKIN);
      else out.copy(PICKLE_SEEDS).lerp(PICKLE, smooth(R * 0.3, R * 0.8, r));
    },
  });
}

function pickles(k: Kit, pantry: boolean): void {
  const spots: [number, number, number][] = pantry
    ? [[-0.2, -0.12, 0], [0.04, -0.2, 0.01], [0.22, -0.04, 0], [-0.1, 0.12, 0.012], [0.14, 0.16, 0.004], [-0.02, -0.02, 0.03]]
    : [[-0.22, -0.05, 0], [-0.07, 0.06, 0.004], [0.08, -0.06, 0.002], [0.23, 0.05, 0.006]];
  for (const [x, z, y] of spots) {
    const g = pickleSlice(pantry ? 0.13 : 0.1, 0.026);
    g.rotateX((x * 3 + z) * 0.4).rotateZ(z * 0.8);
    g.translate(x, y, z);
    k.add(g, undefined, 'gloss');
  }
  if (pantry) {
    // a whole gherkin behind the slices
    const pts: Vec[] = [[-0.3, 0.06, -0.3], [0, 0.07, -0.33], [0.3, 0.06, -0.27]];
    k.add(sweep(pts, (t) => 0.065 * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * t)), 0.5), 12, 10, {
      radial: (t, phi) => 1 + 0.07 * noise3(t * 12, Math.cos(phi) * 2, Math.sin(phi) * 2, 4),
      color: (t, phi, out) => out.copy(PICKLE_SKIN).lerp(PICKLE, 0.35 + 0.3 * Math.sin(phi) + 0.2 * noise3(t * 20, phi, 1, 2)),
    }), undefined, 'gloss');
  }
}

// ------------------------------------------------------------------ toast

const TOAST_CRUST = C('#b9732e'), TOAST_FACE = C('#efc679'), TOAST_LIGHT = C('#f8dfa6');

/** A slice of sandwich bread: square with a domed top, toasted golden. */
function toastSlice(T: number, lite: boolean): THREE.BufferGeometry {
  const sec = (th: number): [number, number] => {
    const [x, z] = squircle(6, 0.3, 0.29)(th);
    // the domed top edge of a loaf slice, at the back
    return [x * (1 + (z < 0 ? 0.12 * (-z / 0.29) ** 2 : 0)), z * (z < 0 ? 1.08 : 1)];
  };
  return lathe([[0, 0], [0.92, 0], [1, 0.012], [1, T - 0.012], [0.93, T], [0.6, T + 0.003], [0, T + 0.004]], lite ? 28 : 40, {
    section: sec,
    color: (th, _t, y, out, r) => {
      if (y < T - 0.002 || r > 0.94) out.copy(TOAST_CRUST);
      else {
        out.copy(TOAST_LIGHT).lerp(TOAST_FACE, smooth(0.3, 0.92, r));
        if (!lite) out.lerp(TOAST_CRUST, smooth(0.4, 0.75, noise3(Math.cos(th) * r * 5, 0, Math.sin(th) * r * 5, 8)) * 0.25);
      }
    },
  });
}

function toast(k: Kit, lite: boolean, pantry: boolean): void {
  const T = 0.07;
  if (!pantry) {
    k.add(toastSlice(T, lite), undefined, 'matte');
    return;
  }
  const a = toastSlice(T, false);
  a.rotateY(0.25);
  a.translate(-0.06, 0, 0.06);
  k.add(a, undefined, 'matte');
  const b = toastSlice(T, false);
  b.rotateX(-0.35);
  b.rotateY(-0.2);
  b.translate(0.06, 0.12, -0.08);
  k.add(b, undefined, 'matte');
}

// ------------------------------------------------------------------ hot dog bun and sausage

const BUN = C('#df9440'), BUN_DARK = C('#a85f22'), BUN_LIGHT = C('#efb766'), BUN_CRUMB = C('#f9e4b8');

/** A long soft roll, split along the top so a sausage lies in it. */
function hotdogBun(k: Kit, lite: boolean, pantry = false): void {
  const L = pantry ? 0.4 : 0.42, W = 0.2, H = 0.2;
  const g = ellipsoid(L, H, W, lite ? 20 : 28, lite ? 10 : 14);
  deform(g, (p) => {
    p.y = p.y < 0 ? p.y * 0.25 : p.y;
    const along = Math.max(0, 1 - (p.x / L) ** 2);
    // the split: press the middle of the top down into a groove
    const groove = Math.exp(-((p.z / (W * 0.32)) ** 2)) * along;
    if (p.y > 0) p.y -= 0.12 * groove * smooth(0, H * 0.5, p.y);
  });
  g.translate(0, 0.04, 0);
  if (pantry) g.rotateY(0.6);
  k.add(g, (p, n, out) => {
    const inside = n.y > 0.35 && Math.abs(n.z) > 0.25 && p.y > 0.09 && Math.abs(p.z) < W * 0.5;
    if (inside) out.copy(BUN_CRUMB);
    else ramp(out, [[-1, BUN_DARK], [0, BUN], [1, BUN_LIGHT]], n.y);
  }, 'matte');
}

const SAUSAGE = C('#b54d2b'), SAUSAGE_DARK = C('#7e2e17'), SAUSAGE_LIGHT = C('#d8774a'), GRILL = C('#4a1c0e');

function sausagePart(len: number, R: number, lite: boolean): THREE.BufferGeometry {
  const pts: Vec[] = [[-len / 2, R, 0], [-len / 6, R + 0.008, 0.01], [len / 6, R + 0.008, -0.01], [len / 2, R, 0]];
  return sweep(pts, R, lite ? 12 : 18, lite ? 8 : 10, {
    color: (t, phi, out) => {
      out.copy(SAUSAGE_DARK).lerp(SAUSAGE, 0.5 + 0.5 * Math.sin(phi)).lerp(SAUSAGE_LIGHT, smooth(0.6, 1, Math.sin(phi)) * 0.5);
      if (!lite) out.lerp(GRILL, smooth(0.75, 0.95, Math.cos(t * 30)) * smooth(0.2, 0.7, Math.sin(phi)) * 0.8);
    },
  });
}

function sausage(k: Kit, lite: boolean, pantry: boolean): void {
  if (!pantry) {
    k.add(sausagePart(0.76, 0.058, lite), undefined, 'gloss');
    return;
  }
  for (const [z, yaw] of [[-0.1, 0.62], [0.1, 0.5]] as const) {
    const g = sausagePart(0.7, 0.075, false);
    g.rotateY(yaw);
    g.translate(0, 0, z);
    k.add(g, undefined, 'gloss');
  }
}

// ------------------------------------------------------------------ pancakes and butter

const PANCAKE = C('#e3a253'), PANCAKE_TOP = C('#c98236'), PANCAKE_RIM = C('#f2cc8c');

function pancakeDisc(R: number, T: number, lite: boolean): THREE.BufferGeometry {
  return lathe([[0, 0], [R - 0.03, 0], [R, 0.02], [R + 0.004, T * 0.55], [R - 0.02, T], [R * 0.6, T + 0.006], [0, T + 0.008]], lite ? 26 : 34, {
    radial: (th) => 1 + 0.02 * noise3(Math.cos(th) * 2, Math.sin(th) * 2, 3, 6),
    color: (th, _t, y, out, r) => {
      if (y < T * 0.85 && r > R * 0.9) out.copy(PANCAKE_RIM).lerp(PANCAKE, smooth(0, T, Math.abs(y - T * 0.5)) * 1.5);
      else {
        out.copy(PANCAKE_TOP).lerp(PANCAKE, smooth(R * 0.3, R, r) * 0.6);
        if (!lite) out.lerp(PANCAKE_RIM, smooth(0.45, 0.8, noise3(Math.cos(th) * r * 9, 0, Math.sin(th) * r * 9, 2)) * 0.3);
      }
    },
  });
}

function pancake(k: Kit, lite: boolean, pantry: boolean): void {
  k.add(pancakeDisc(0.38, 0.068, lite), undefined, 'matte');
  if (pantry) {
    const g = pancakeDisc(0.36, 0.068, false);
    g.rotateY(0.6);
    g.translate(0.03, 0.072, -0.02);
    k.add(g, undefined, 'matte');
  }
}

const BUTTER = C('#fbe28c'), BUTTER_SHADE = C('#eec85a'), BUTTER_MELT = C('#fff0b0');

function butterPat(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = plate2(w, d, h, 4, 0.02);
  g.translate(0, h / 2, 0);
  return g;
}

function butter(k: Kit, pantry: boolean): void {
  if (!pantry) {
    // a melting pat: a soft puddle with the pat on top
    k.add(lathe([[0.15, 0], [0.12, 0.01], [0.05, 0.014], [0, 0.015]], 16, { radial: (th) => 1 + 0.2 * Math.sin(3 * th + 1) }), BUTTER_MELT, 'gloss');
    const p = butterPat(0.17, 0.05, 0.13);
    p.rotateY(0.5);
    k.add(p, (_p, n, out) => out.copy(BUTTER_SHADE).lerp(BUTTER, smooth(-0.2, 0.8, n.y)), 'gloss');
    return;
  }
  // a block of butter on its paper, a slice cut off
  const paper = C('#f6f1e4'), paperShade = C('#dcd3c0');
  const sheet = plate2(0.8, 0.62, 0.01, 6, 0.04);
  sheet.translate(0, 0.005, 0);
  sheet.rotateY(-0.25);
  k.add(sheet, (_p, n, out) => out.copy(n.y > 0.5 ? paper : paperShade), 'matte');
  const block = butterPat(0.46, 0.2, 0.3);
  block.rotateY(-0.25);
  block.translate(-0.05, 0.01, -0.02);
  k.add(block, (_p, n, out) => out.copy(BUTTER_SHADE).lerp(BUTTER, smooth(-0.2, 0.8, n.y)), 'gloss');
  const cut = butterPat(0.1, 0.18, 0.28);
  cut.rotateZ(-0.35);
  cut.rotateY(-0.25);
  cut.translate(0.26, 0.04, 0.08);
  k.add(cut, (_p, n, out) => out.copy(BUTTER_SHADE).lerp(BUTTER, smooth(-0.2, 0.8, n.y)), 'gloss');
}

// ------------------------------------------------------------------ berries

const BLUE = C('#3d3f8c'), BLUE_BLOOM = C('#7d86c4'), RASP = C('#d82f4a'), RASP_LIGHT = C('#f05a6a'), STRAW = C('#e2353a');

function berries(k: Kit, pantry: boolean): void {
  const rnd = rng(pantry ? 4 : 9);
  const n = pantry ? 13 : 7;
  for (let i = 0; i < n; i++) {
    const r = (pantry ? 0.3 : 0.2) * Math.sqrt((i + 0.5) / n), a = i * 2.39996 + rnd() * 0.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = pantry ? 0.05 * (1 - r / 0.3) : 0;
    if (i % 3 === 2) {
      // a raspberry: a cone of little drupelets, shown as a bumpy dome
      const g = ellipsoid(0.055, 0.05, 0.055, 10, 6);
      deform(g, (p) => p.multiplyScalar(1 + 0.08 * Math.abs(Math.sin(p.x * 120) * Math.sin(p.z * 120))));
      g.translate(x, y + 0.045, z);
      k.add(g, (p, _n, out) => out.copy(RASP).lerp(RASP_LIGHT, smooth(0, 0.08, p.y - y)), 'gloss');
    } else {
      const g = ellipsoid(0.045, 0.04, 0.045, 10, 6);
      g.translate(x, y + 0.038, z);
      k.add(g, (p, nn, out) => {
        out.copy(BLUE).lerp(BLUE_BLOOM, smooth(0.4, 1, nn.y) * 0.45);
        if (nn.y > 0.9) out.copy(BLUE).multiplyScalar(0.6);
      }, 'gloss');
    }
  }
  // a halved strawberry on top (pantry) or at the side
  const s = ellipsoid(0.08, 0.06, 0.07, 12, 7);
  deform(s, (p) => {
    p.x *= 1 - 0.35 * smooth(-0.06, 0.06, p.x);
  });
  s.rotateY(0.6);
  s.translate(pantry ? 0.05 : 0.18, pantry ? 0.11 : 0.05, pantry ? 0.02 : -0.12);
  k.add(s, (_p, nn, out) => out.copy(STRAW).lerp(C('#ff7a70'), smooth(0.5, 1, nn.y) * 0.4), 'gloss');
}

// ------------------------------------------------------------------ sundae glass, scoops, cherry

const GLASS = C('#d7ecf6'), GLASS_LIGHT = C('#f6fbff'), GLASS_DEEP = C('#9fc7dd');

/** A footed tulip glass. The scoop resting in it starts at DINER_THICKNESS.cup. */
function cup(k: Kit, lite: boolean): void {
  const prof: [number, number][] = [[0, 0], [0.16, 0], [0.17, 0.015], [0.14, 0.025], [0.04, 0.04], [0.03, 0.1], [0.06, 0.14], [0.2, 0.2],
    [0.28, 0.27], [0.3, 0.33], [0.285, 0.336], [0.27, 0.31], [0.18, 0.22], [0, 0.17]];
  const tf = fractions(prof);
  k.add(lathe(prof, lite ? 24 : 32, {
    color: (th, t, _y, out) => {
      out.copy(GLASS_DEEP).lerp(GLASS, t < tf[10] ? 0.7 : 0.4);
      out.lerp(GLASS_LIGHT, smooth(0.85, 1, Math.cos(th + 2.2)) * 0.8);
    },
  }), undefined, 'gloss');
}

const VANILLA = C('#fbf2d8'), VANILLA_SHADE = C('#e8d6a6'), CHOC = C('#6a3a20'), CHOC_LIGHT = C('#8d5532'), VANILLA_BEAN = C('#5a4430');

/** A round scoop with the scooper's ruffled edge at its foot. */
function scoop(k: Kit, choc: boolean, lite: boolean, y = 0, R = 0.19): void {
  const base = choc ? CHOC : VANILLA, shade = choc ? C('#4a2614') : VANILLA_SHADE, light = choc ? CHOC_LIGHT : C('#fffaf0');
  const prof: [number, number][] = [[0, 0], [R * 0.7, 0.005], [R * 0.95, R * 0.25], [R * 1.02, R * 0.45]];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    prof.push([i === 6 ? 0 : R * Math.cos(a) * 1.0, R * 0.45 + R * 0.95 * Math.sin(a)]);
  }
  const g = lathe(prof, lite ? 18 : 26, {
    radial: (th, t) => 1 + 0.07 * Math.max(0, Math.sin(11 * th)) * smooth(0.35, 0.15, t) + 0.03 * noise3(Math.cos(th) * 2, t * 3, Math.sin(th) * 2, choc ? 3 : 5),
    color: (_th, t, _y, out) => ramp(out, [[0, shade], [0.3, base], [1, light]], t),
  });
  g.translate(0, y, 0);
  k.add(g, undefined, 'gloss');
  if (!choc && !lite) {
    const rnd = rng(12);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, e = 0.3 + rnd() * 0.9;
      const p = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(R * 0.98);
      const d = ellipsoid(0.007, 0.003, 0.007, 4, 2);
      orient(d, p.clone().normalize().toArray(), [p.x, y + R * 0.45 + p.y, p.z]);
      k.add(d, VANILLA_BEAN, 'matte');
    }
  }
}

function iceCream(k: Kit, choc: boolean, lite: boolean, pantry: boolean): void {
  if (!pantry) {
    scoop(k, choc, lite);
    return;
  }
  // a paper tub with a scoop on top, striped in the flavour's colour
  const stripe = choc ? C('#8a5532') : C('#f2a0b2'), paper = C('#fdf8ee');
  const R = 0.28, H = 0.24;
  k.add(lathe([[0, 0], [R * 0.82, 0], [R * 0.86, 0.01], [R, H], [R * 1.03, H + 0.01], [R * 0.96, H + 0.02], [R * 0.9, H * 0.85], [0, H * 0.8]], 32, {
    color: (th, _t, y, out) => out.copy(y > H * 0.98 ? paper : Math.sin(th * 8) > 0 ? stripe : paper),
  }), undefined, 'matte');
  scoop(k, choc, false, H * 0.72, 0.22);
}

const CHERRY = C('#d21f36'), CHERRY_DARK = C('#8e1022'), CHERRY_LIGHT = C('#ff5a6a'), STEM = C('#5c7a2a');

function cherryOne(k: Kit, x: number, z: number, R: number, stemTo: Vec): void {
  const g = lathe([[0, 0.01], [R * 0.6, 0], [R * 0.95, R * 0.5], [R, R], [R * 0.85, R * 1.55], [R * 0.4, R * 1.85], [0.01, R * 1.72], [0, R * 1.7]], 16, {
    color: (_th, t, _y, out) => ramp(out, [[0, CHERRY_DARK], [0.5, CHERRY], [0.8, CHERRY_LIGHT], [1, CHERRY]], t),
  });
  g.translate(x, 0, z);
  k.add(g, undefined, 'gloss');
  const top: Vec = [x, R * 1.72, z];
  const mid: Vec = [lerp(top[0], stemTo[0], 0.5) + 0.02, lerp(top[1], stemTo[1], 0.5) + 0.05, lerp(top[2], stemTo[2], 0.5)];
  k.add(sweep([top, mid, stemTo], 0.009, 8, 5), STEM, 'matte');
}

function cherry(k: Kit, pantry: boolean): void {
  if (!pantry) {
    cherryOne(k, 0, 0, 0.065, [0.05, 0.24, -0.03]);
    return;
  }
  // a pair joined at the stems, with a leaf
  cherryOne(k, -0.17, 0.06, 0.13, [0.02, 0.62, -0.05]);
  cherryOne(k, 0.18, 0.1, 0.12, [0.02, 0.62, -0.05]);
  const leafC = C('#4f9a36');
  const lf = ellipsoid(0.11, 0.012, 0.05, 10, 4);
  lf.rotateZ(0.5).rotateY(0.4);
  lf.translate(0.1, 0.6, -0.08);
  k.add(lf, leafC, 'matte');
}

// ------------------------------------------------------------------ bacon layer

function baconLayer(k: Kit): void {
  for (const [z, yaw, ph] of [[-0.07, 0.25, 0], [0.08, -0.15, 1.9]] as const) {
    const pts: Vec[] = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6, x = -0.36 + f * 0.72;
      pts.push([x, 0.016 + 0.012 * Math.sin(f * TAU * 1.5 + ph), z]);
    }
    k.within(new THREE.Matrix4().makeRotationY(yaw), () => baconStrip(k, pts, 0.07));
  }
}

// ------------------------------------------------------------------ dispatch

export function isDinerLayer(id: string): id is DinerLayerId {
  return (DINER_LAYERS as readonly string[]).includes(id);
}

/** A layer as it sits in a stack (`lite`: hidden details dropped) or its pantry version. */
export function buildDinerLayer(k: Kit, id: DinerLayerId, lite = false, pantry = false): void {
  switch (id) {
    case 'pickles': return pickles(k, pantry);
    case 'bacon': return baconLayer(k);
    case 'toast': return toast(k, lite, pantry);
    case 'hotdog_bun': return hotdogBun(k, lite, pantry);
    case 'sausage': return sausage(k, lite, pantry);
    case 'pancake': return pancake(k, lite, pantry);
    case 'butter': return butter(k, pantry);
    case 'berries': return berries(k, pantry);
    case 'cup': return cup(k, lite);
    case 'ice_cream': return iceCream(k, false, lite, pantry);
    case 'chocolate': return iceCream(k, true, lite, pantry);
    case 'cherry': return cherry(k, pantry);
  }
}
