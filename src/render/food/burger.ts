import * as THREE from 'three';
import type { FoodId } from '../../core/content';
import { DINER_LAYERS, DINER_THICKNESS, buildDinerLayer, isDinerLayer } from './diner';
import {
  C, Kit, alignX, deform, disc, ellipsoid, lathe, leaf, mat, noise3, orient, plate2, ramp, rng, smooth, sweep, topHeight, type Vec,
} from './kit';

/**
 * Burger Joint pieces. Each layer is built around the origin with its base at y = 0 and the same
 * footprint as a raw item; `LAYER_THICKNESS` says how far up the next layer starts, so stacking
 * them in any order makes a burger. Draping parts (cheese corners, lettuce frills) may hang a
 * little below their own base, over the layer underneath. The `lite` variants drop details that
 * are hidden once the layers are stacked inside the finished burger dish.
 */

const TAU = Math.PI * 2;

/** Every stackable layer of the Burger Joint: the burger's own, then the other dishes' (diner.ts). */
export const BURGER_LAYERS = ['bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'tomato_slice', 'onion_rings', 'bun_top', ...DINER_LAYERS] as const;
export type BurgerLayerId = (typeof BURGER_LAYERS)[number];

export function isBurgerLayer(id: FoodId): id is BurgerLayerId {
  return (BURGER_LAYERS as readonly string[]).includes(id);
}

export const LAYER_THICKNESS: Record<BurgerLayerId, number> = {
  bun_bottom: 0.16, patty: 0.13, cheese_slice: 0.022, lettuce: 0.035, tomato_slice: 0.062, onion_rings: 0.045, bun_top: 0.31,
  ...DINER_THICKNESS,
};

/** How far a layer may reach above the next layer's base: a glass or a bun holds it, a scoop or a cherry crowns it. */
export const LAYER_REACH: Partial<Record<BurgerLayerId, number>> = { cup: 0.1, hotdog_bun: 0.13, ice_cream: 0.12, chocolate: 0.12, cherry: 0.16 };

// ------------------------------------------------------------------ buns

function bunBottom(k: Kit, lite: boolean): void {
  const crustDark = C('#b8732a'), crust = C('#d38d3a'), crustLight = C('#eab364');
  const crumb = C('#f9e9c6'), crumbEdge = C('#f0d39e'), pore = C('#dfc08a');
  const prof: [number, number][] = lite
    ? [[0, 0.004], [0.3, 0], [0.37, 0.016], [0.403, 0.07], [0.398, 0.125], [0.37, 0.158], [0.34, 0.165], [0, 0.166]]
    : [[0, 0.004], [0.3, 0], [0.36, 0.012], [0.395, 0.045], [0.405, 0.085], [0.398, 0.125], [0.385, 0.15], [0.368, 0.162],
      [0.352, 0.165], [0.345, 0.1655], [0.25, 0.166], [0.12, 0.167], [0, 0.167]];
  k.add(lathe(prof, lite ? 26 : 34, {
    radial: (th) => 1 + 0.008 * Math.sin(5 * th + 1),
    color: (_th, _t, y, out, r) => {
      if (y < 0.16 || r > 0.348) ramp(out, [[0, crustDark], [0.05, crust], [0.12, crustLight], [0.17, crustLight]], y);
      else ramp(out, [[0, crumb], [0.27, crumb], [0.345, crumbEdge]], r);
    },
  }), undefined, 'matte');
  if (lite) return;
  // Little pores in the soft crumb of the cut face.
  const rnd = rng(19);
  for (let i = 0; i < 14; i++) {
    const r = 0.29 * Math.sqrt((i + 0.5) / 14), a = i * 2.39996 + rnd();
    const p = ellipsoid(0.013 + rnd() * 0.008, 0.003, 0.009 + rnd() * 0.005, 5, 3);
    p.rotateY(rnd() * 3);
    p.translate(Math.cos(a) * r, 0.1665, Math.sin(a) * r);
    k.add(p, pore, 'matte');
  }
}

function bunTop(k: Kit, lite: boolean): void {
  const crumb = C('#f2d8a7'), sideLight = C('#f2c27a'), golden = C('#d78a32'), topDark = C('#b8661e'), sesame = C('#fcf2d6');
  const prof: [number, number][] = [[0, 0], [0.36, 0], [0.392, 0.012], [0.408, 0.04], [0.412, 0.075], [0.4, 0.125], [0.365, 0.185],
    [0.3, 0.24], [0.21, 0.278], [0.11, 0.3], [0, 0.307]];
  k.add(lathe(prof, lite ? 26 : 34, {
    radial: (th) => 1 + 0.008 * Math.sin(4 * th),
    color: (_th, _t, y, out) => {
      if (y < 0.002) out.copy(crumb);
      else ramp(out, [[0, sideLight], [0.045, sideLight], [0.14, golden], [0.31, topDark]], y);
    },
  }), undefined, 'gloss');
  const n = lite ? 10 : 18;
  for (let i = 0; i < n; i++) {
    const rho = 0.31 * Math.sqrt((i + 0.6) / n), a = i * 2.39996 + 0.3;
    const y = topHeight(prof, rho);
    const s = (topHeight(prof, rho + 0.01) - topHeight(prof, Math.max(0, rho - 0.01))) / 0.02;
    const seed = ellipsoid(0.022, 0.008, 0.012, lite ? 5 : 6, 3);
    orient(seed, [-s * Math.cos(a), 1, -s * Math.sin(a)], [Math.cos(a) * rho, y + 0.002, Math.sin(a) * rho], a * 3.7);
    k.add(seed, sesame, 'matte');
  }
}

// ------------------------------------------------------------------ patty

function patty(k: Kit, lite: boolean): void {
  const meat = C('#6d3a21'), meatTop = C('#7e4528'), sear = C('#4a2313'), bits = C('#9a5a36'), mark = C('#2a1309');
  const prof: [number, number][] = lite
    ? [[0, 0], [0.34, 0], [0.395, 0.015], [0.42, 0.05], [0.424, 0.08], [0.41, 0.112], [0.38, 0.13], [0.2, 0.14], [0, 0.141]]
    : [[0, 0], [0.34, 0], [0.395, 0.015], [0.42, 0.05], [0.424, 0.08], [0.41, 0.112], [0.38, 0.13], [0.32, 0.137], [0.25, 0.14],
      [0.17, 0.142], [0.09, 0.143], [0, 0.143]];
  const g = lathe(prof, lite ? 26 : 34, {
    radial: (th) => 1 + 0.025 * noise3(Math.cos(th) * 2.5, Math.sin(th) * 2.5, 0.5, 5),
    color: (th, _t, y, out) => {
      ramp(out, [[0, sear], [0.04, meat], [0.1, meat], [0.135, meatTop]], y);
      out.multiplyScalar(0.88 + 0.24 * (0.5 + 0.5 * noise3(Math.cos(th) * 6, y * 30, Math.sin(th) * 6, 3)));
    },
  });
  if (!lite) {
    // Coarse ground-meat texture: bumps and lighter crumbs over the top and sides.
    deform(g, (p) => {
      const n = noise3(p.x * 16, p.y * 16, p.z * 16, 8);
      p.addScaledVector(p.clone().setY(0).normalize(), 0.005 * n * smooth(0.02, 0.06, p.y));
      if (p.y > 0.12) p.y += 0.006 * n;
    });
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    const pos = g.getAttribute('position');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const crumb = smooth(0.35, 0.75, noise3(pos.getX(i) * 22, pos.getY(i) * 22, pos.getZ(i) * 22, 4));
      c.fromBufferAttribute(col, i).lerp(bits, crumb * 0.5);
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  k.add(g, undefined, 'matte');
  if (lite) return;
  // Grill marks across the top.
  const ang = 0.6, dx = Math.cos(ang), dz = Math.sin(ang);
  for (const o of [-0.16, 0, 0.16]) {
    const half = Math.sqrt(0.34 ** 2 - o ** 2) - 0.04;
    const A: Vec = [-dz * o - dx * half, 0.148, dx * o - dz * half];
    const B: Vec = [-dz * o + dx * half, 0.148, dx * o + dz * half];
    k.add(sweep([A, B], 0.019, 1, 6, { up: [0, 1, 0], section: (phi) => [Math.cos(phi) * 0.45, Math.sin(phi) * 1.25] }), mark, 'gloss');
  }
}

// ------------------------------------------------------------------ cheese slice

const CHEESE = C('#f9b62a');
const CHEESE_LIGHT = C('#ffd35a');

function cheeseLayer(k: Kit, lite: boolean): void {
  const g = plate2(0.64, 0.64, 0.022, lite ? 8 : 12, 0.035);
  g.rotateY(Math.PI / 4);
  deform(g, (p) => {
    const d = Math.hypot(p.x, p.z);
    if (d > 0.28) {
      const s = (0.28 + (d - 0.28) * 0.92) / d;
      p.x *= s;
      p.z *= s;
    }
    p.y -= Math.max(0, Math.hypot(p.x, p.z) - 0.35) ** 2 * 9;
  });
  g.translate(0, 0.011, 0);
  k.add(g, (p, _n, out) => out.copy(CHEESE).lerp(CHEESE_LIGHT, 0.5 * smooth(0.3, 0, Math.hypot(p.x, p.z))), 'gloss');
}

/** Two square slices, the top one with a corner peeling up so it reads as a thin slice. */
function cheesePantry(k: Kit): void {
  const slice = (curl: boolean) => {
    const g = plate2(0.56, 0.56, 0.028, 10, 0.03);
    if (curl) {
      deform(g, (p) => {
        const s = (p.x + p.z) / Math.SQRT2;
        const lift = Math.max(0, s - 0.12);
        p.y += lift * lift * 3.2;
        const pull = lift * lift * 0.9;
        p.x -= pull;
        p.z -= pull;
      });
    }
    return g;
  };
  const lower = slice(false);
  lower.rotateY(0.32);
  lower.translate(0.02, 0.014, -0.01);
  k.add(lower, (p, _n, out) => out.copy(CHEESE).multiplyScalar(0.92).lerp(CHEESE_LIGHT, 0.2 * smooth(0.3, 0, Math.hypot(p.x, p.z))), 'gloss');
  const upper = slice(true);
  upper.rotateY(-0.12);
  upper.translate(-0.03, 0.044, 0.02);
  k.add(upper, (p, _n, out) => out.copy(CHEESE).lerp(CHEESE_LIGHT, 0.45 * smooth(0.32, 0, Math.hypot(p.x, p.z))), 'gloss');
}

// ------------------------------------------------------------------ lettuce

const LETTUCE_PALE = C('#dcf2a2');
const LETTUCE_MID = C('#8ed45a');
const LETTUCE_RIM = C('#46a83a');
const LETTUCE_VEIN = C('#eaf8c4');

function lettuceLayer(k: Kit, lite: boolean): void {
  k.add(disc(lite ? 4 : 5, lite ? 36 : 48,
    (th) => 0.42 * (1 + 0.035 * Math.sin(7 * th + 1) + 0.025 * Math.sin(12 * th)),
    (f, th) => 0.024 - 0.042 * f ** 3 + 0.01 * f * f * Math.sin(5 * th + 2) + 0.024 * f ** 4 * Math.sin(11 * th + 0.8 * Math.sin(3 * th)),
    0.014,
    (f, th, top, out) => {
      ramp(out, [[0, LETTUCE_PALE], [0.55, LETTUCE_MID], [1, LETTUCE_RIM]], f);
      out.lerp(LETTUCE_VEIN, 0.35 * Math.pow(0.5 + 0.5 * Math.cos(9 * th), 10) * (1 - f));
      if (!top) out.multiplyScalar(0.8);
    }), undefined, 'gloss');
}

/** Two frilly leaves, one tucked under the other, each with a pale midrib. */
function lettucePantry(k: Kit): void {
  const leafOf = (L: number, W: number, dir: Vec, at: Vec, shade: number, seed: number) => {
    const lift = (u: number) => 0.06 * Math.sin(Math.PI * u) + 0.02;
    const g = leaf(L, W, {
      nu: 12, nv: 8, thickness: 0.02, fold: 0.09,
      width: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.55),
      lift,
      ruffle: (u, v) => 0.036 * Math.pow(Math.abs(v), 2.4) * Math.sin(u * 26 + v * 2 + seed),
      color: (u, v, top, out) => {
        ramp(out, [[0, LETTUCE_PALE], [0.6, LETTUCE_MID], [1, LETTUCE_RIM]], Math.abs(v) * 0.85 + u * 0.15);
        out.lerp(LETTUCE_VEIN, 0.6 * Math.exp(-((v / 0.12) ** 2)) * (1 - u * 0.8));
        out.multiplyScalar(top ? shade : shade * 0.8);
      },
    });
    alignX(g, dir, at);
    k.add(g, undefined, 'gloss');
    const rib = sweep([0, 0.25, 0.5, 0.75, 0.9].map((u): Vec => [u * L, lift(u) + 0.012, 0]), (t) => 0.022 * (1 - 0.7 * t), 8, 6);
    alignX(rib, dir, at);
    k.add(rib, LETTUCE_VEIN, 'gloss');
  };
  leafOf(0.7, 0.5, [0.95, 0, 0.3], [-0.36, -0.012, -0.12], 0.86, 1.3);
  leafOf(0.8, 0.62, [0.78, 0, -0.62], [-0.31, 0.02, 0.25], 1, 0);
}

// ------------------------------------------------------------------ tomato slice

const SKIN = C('#d22d22');
const WALL = C('#e8402f');
const FLESH = C('#f45a47');
const CORE = C('#f88d76');
const GEL = C('#ff8762');
const GEL_LIGHT = C('#ffbf93');
const SEED = C('#fff0b0');

export function tomatoSlice(k: Kit, lite: boolean, R = 0.36): void {
  const h = 0.06;
  const prof: [number, number][] = lite
    ? [[0, 0], [R - 0.02, 0], [R, 0.02], [R, h - 0.016], [R - 0.016, h], [R * 0.6, h + 0.002], [0, h + 0.003]]
    : [[0, 0], [R - 0.02, 0], [R, 0.018], [R, h - 0.016], [R - 0.012, h], [R - 0.02, h + 0.001], [R * 0.8, h + 0.002],
      [R * 0.5, h + 0.003], [R * 0.18, h + 0.003], [0, h + 0.003]];
  k.add(lathe(prof, lite ? 26 : 36, {
    color: (_th, _t, y, out, r) => {
      if (y < h - 0.0005 || r > R - 0.015) out.copy(SKIN);
      else ramp(out, [[0, CORE], [R * 0.25, FLESH], [R * 0.72, FLESH], [R * 0.8, WALL], [R, WALL]], r);
    },
  }), undefined, 'gloss');
  if (lite) return;
  const rnd = rng(3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const len = R * 0.56, wid = R * 0.46;
    const chamber = leaf(len, wid, {
      nu: 6, nv: 4, thickness: 0.012, lift: () => 0, width: (u) => Math.pow(Math.sin(Math.PI * u), 0.55),
      color: (u, v, _top, out) => out.copy(GEL).lerp(GEL_LIGHT, (1 - Math.abs(v)) * Math.sin(Math.PI * u) * 0.6),
    });
    chamber.rotateY(-a);
    chamber.translate(Math.cos(a) * R * 0.2, h + 0.003, Math.sin(a) * R * 0.2);
    k.add(chamber, undefined, 'gloss');
    for (const u of [0.3, 0.52, 0.74]) {
      const seed = ellipsoid(0.017, 0.006, 0.011, 6, 3);
      const off = (rnd() - 0.5) * 0.2 * wid;
      seed.rotateY(-a + (rnd() - 0.5) * 0.8);
      const rr = R * 0.2 + u * len;
      seed.translate(Math.cos(a) * rr - Math.sin(a) * off, h + 0.009, Math.sin(a) * rr + Math.cos(a) * off);
      k.add(seed, SEED, 'matte');
    }
  }
}

// ------------------------------------------------------------------ onion rings

const ONION_SKIN = C('#94409f');
const ONION_FLESH = C('#f3e6f6');
const ONION_TINT = C('#d9b3e3');

function onionRing(R: number, w: number, h: number, seg: number): THREE.BufferGeometry {
  const ri = R - w / 2, ro = R + w / 2, b = Math.min(w, h) * 0.4;
  return lathe([[ri, 0], [ro - b, 0], [ro, b], [ro, h - b], [ro - b, h], [ri, h]], seg, {
    closed: true,
    color: (_th, _t, y, out, r) => {
      if (r > ro - b * 0.5) out.copy(ONION_SKIN);
      else out.copy(ONION_FLESH).lerp(ONION_TINT, smooth(ri, ro, r) * (y > h * 0.5 ? 0.8 : 0.3));
    },
  });
}

function onionLayer(k: Kit, lite: boolean): void {
  const seg = lite ? 24 : 30;
  k.add(onionRing(0.3, 0.052, 0.036, seg), undefined, 'gloss');
  k.add(onionRing(0.2, 0.046, 0.034, seg).translate(0.07, 0.006, -0.06), undefined, 'gloss');
  k.add(onionRing(0.12, 0.04, 0.032, seg).translate(-0.08, 0.004, 0.08), undefined, 'gloss');
}

/** A slice of concentric rings with one ring slipped out and leaning on it. */
function onionPantry(k: Kit): void {
  const h = 0.05;
  k.within(mat([-0.06, 0, 0.05]), () => {
    k.add(onionRing(0.3, 0.06, h, 30), undefined, 'gloss');
    k.add(onionRing(0.21, 0.055, h, 26), undefined, 'gloss');
    k.add(onionRing(0.125, 0.05, h, 22), undefined, 'gloss');
  });
  const loose = onionRing(0.2, 0.055, h, 26);
  loose.rotateX(-0.42);
  loose.rotateY(0.5);
  loose.translate(0.2, 0.075, -0.17);
  k.add(loose, undefined, 'gloss');
}

// ------------------------------------------------------------------ public builders

export function buildLayer(k: Kit, id: BurgerLayerId, lite = false): void {
  if (isDinerLayer(id)) return buildDinerLayer(k, id, lite);
  switch (id) {
    case 'bun_bottom': return bunBottom(k, lite);
    case 'patty': return patty(k, lite);
    case 'cheese_slice': return cheeseLayer(k, lite);
    case 'lettuce': return lettuceLayer(k, lite);
    case 'tomato_slice': return tomatoSlice(k, lite);
    case 'onion_rings': return onionLayer(k, lite);
    case 'bun_top': return bunTop(k, lite);
  }
}

/** The pantry-tile version of a Burger Joint ingredient (reads well on its own). */
export function buildPantryLayer(k: Kit, id: BurgerLayerId): void {
  if (isDinerLayer(id)) return buildDinerLayer(k, id, false, true);
  switch (id) {
    case 'cheese_slice': return cheesePantry(k);
    case 'lettuce': return lettucePantry(k);
    case 'onion_rings': return onionPantry(k);
    default: return buildLayer(k, id, false);
  }
}
