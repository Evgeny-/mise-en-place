import * as THREE from 'three';
import { DISHES, type DishId, type FoodId } from '../../core/content';
import { C, Kit, deform, disc, ellipsoid, lathe, leaf, noise3, paint, ramp, rng, smooth, sweep, type Vec } from './kit';
import { plate, plateTop } from './dishes';
import { CHIP, CHIP_DARK, FILLING_COLOR, chip, fillingPiece, halfLime } from './taqueria';

/**
 * Folded tacos and wrapped burritos, built from the dish's parts (container first, then the
 * fillings): the fillings show on top of a taco and in the cut end of a burrito, coloured by
 * what is inside. Each has a plate-less counter version (~0.8 wide) and a plated dish version.
 */

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

export function isTaco(id: DishId): boolean {
  return id.startsWith('taco_');
}

export function isBurrito(id: DishId): boolean {
  return id.startsWith('burrito_');
}

function fillingsOf(dish: DishId): FoodId[] {
  return DISHES[dish]?.parts.slice(1) ?? [];
}

function fillingColor(id: FoodId): THREE.Color {
  return FILLING_COLOR[id] ?? C('#c98a4a');
}

/**
 * Each taco and its burrito share a colour, the colour of their paper and foil, so they are told
 * apart at a glance even before the fillings are read: carnitas red, chicken gold, veggie green,
 * bean purple, verde teal.
 */
const FAMILY: Partial<Record<DishId, string>> = {
  taco_carnitas: '#d8453a', burrito_carnitas: '#d8453a',
  taco_pollo: '#eaa625', burrito_pollo: '#eaa625',
  taco_veggie: '#4fa443', burrito_veggie: '#4fa443',
  taco_frijol: '#8c58b4',
  taco_verde: '#22a39b', burrito_verde: '#22a39b',
};

function familyOf(dish: DishId): THREE.Color {
  return C(FAMILY[dish] ?? '#d8453a');
}

// ------------------------------------------------------------------ taco

const CORN_T = C('#efc874'), CORN_T_LIGHT = C('#f8dc98'), CORN_T_TOAST = C('#d9a24f'), CHAR = C('#9c5a24');

/** Corn-tortilla sheet on a (u across the fold, v along it) grid, flat, centred, thickness along Y. */
function sheet(R: number, nAlong: number, nAcross: number, thick: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const layer = (y: number) => {
    const rows: number[][] = [];
    for (let i = 0; i <= nAcross; i++) {
      const z = R * 0.995 * (-1 + (2 * i) / nAcross);
      const c = Math.sqrt(R * R - z * z) * (1 + 0.015 * Math.sin(z * 31));
      const row: number[] = [];
      for (let j = 0; j <= nAlong; j++) {
        pos.push(c * (-1 + (2 * j) / nAlong), y, z);
        row.push(pos.length / 3 - 1);
      }
      rows.push(row);
    }
    return rows;
  };
  const top = layer(thick / 2), bot = layer(-thick / 2);
  for (let i = 0; i < nAcross; i++) {
    for (let j = 0; j < nAlong; j++) {
      idx.push(top[i][j], top[i + 1][j], top[i][j + 1], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]);
      idx.push(bot[i][j], bot[i][j + 1], bot[i + 1][j], bot[i + 1][j], bot[i][j + 1], bot[i + 1][j + 1]);
    }
  }
  const ring: [number, number][] = [];
  for (let j = 0; j < nAlong; j++) ring.push([0, j]);
  for (let i = 0; i < nAcross; i++) ring.push([i, nAlong]);
  for (let j = nAlong; j > 0; j--) ring.push([nAcross, j]);
  for (let i = nAcross; i > 0; i--) ring.push([i, 0]);
  for (let k = 0; k < ring.length; k++) {
    const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % ring.length];
    const a = top[i0][j0], b = top[i1][j1], c = bot[i1][j1], d = bot[i0][j0];
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Fold a flat sheet (y = offset from its mid-surface) into a U along the X axis, walls leaning out. */
function fold(p: THREE.Vector3, rb: number, beta: number): void {
  const s = p.z, as = Math.abs(s), sg = s < 0 ? -1 : 1, off = p.y;
  let mz: number, my: number, nz: number, ny: number;
  if (as <= rb * beta) {
    const a = s / rb;
    mz = rb * Math.sin(a);
    my = rb * (1 - Math.cos(a));
    nz = -Math.sin(a);
    ny = Math.cos(a);
  } else {
    const d = as - rb * beta;
    mz = sg * (rb * Math.sin(beta) + d * Math.cos(beta));
    my = rb * (1 - Math.cos(beta)) + d * Math.sin(beta);
    nz = -sg * Math.sin(beta);
    ny = Math.cos(beta);
  }
  p.set(p.x, my + ny * off, mz + nz * off);
}

const TACO_R = 0.42, TACO_RB = 0.1, TACO_BETA = 1.15, TACO_THICK = 0.018;

/** A folded corn taco along X (opening up), filled; base at y ≈ 0, ~0.84 long. */
function taco(k: Kit, fillings: FoodId[], lite: boolean, fillScale = 0.82): void {
  // Paint the flat tortilla, then fold it (and its toasted spots) before adding: the kit's
  // transform must apply to the folded shape.
  const g = paint(sheet(TACO_R, lite ? 7 : 9, lite ? 12 : 16, TACO_THICK), (p, n, out) => {
    ramp(out, [[0, CORN_T_LIGHT], [0.7, CORN_T], [1, CORN_T_TOAST]], Math.hypot(p.x, p.z) / TACO_R);
    out.multiplyScalar(0.94 + 0.08 * noise3(p.x * 9, p.z * 9, 4, 4));
    if (n.y < 0) out.lerp(CORN_T_TOAST, 0.25);
  });
  k.add(deform(g, (p) => fold(p, TACO_RB, TACO_BETA)));
  const rnd = rng(17);
  for (let i = 0; i < (lite ? 4 : 10); i++) {
    const z = (rnd() * 2 - 1) * TACO_R * 0.8, c = Math.sqrt(TACO_R ** 2 - z * z) * 0.8, x = (rnd() * 2 - 1) * c, s = 0.016 + rnd() * 0.016;
    const sp = lathe([[0, -0.22], [0.5, -0.18], [1, 0]], 7, { color: (_th, t, _y, out) => out.copy(CHAR).lerp(CORN_T, smooth(0.15, 1, t)) });
    sp.scale(s, 0.02, s * 0.75);
    sp.rotateY(rnd() * 3);
    sp.translate(x, -TACO_THICK / 2 - 0.0012, z);
    k.add(deform(sp, (p) => fold(p, TACO_RB, TACO_BETA)));
  }
  // A soft bed of the first filling inside the fold, then a portion of every filling on top.
  const bed = ellipsoid(0.27, 0.085, 0.095, lite ? 12 : 16, 8);
  bed.translate(0, 0.095, 0);
  const bedColor = fillingColor(fillings[0] ?? 'pork').clone().lerp(CORN_T_TOAST, 0.35).multiplyScalar(0.85);
  k.add(bed, (p, _n, out) => out.copy(bedColor).multiplyScalar(0.9 + 0.2 * noise3(p.x * 14, p.y * 14, p.z * 14, 2)), 'gloss');
  const n = fillings.length;
  fillings.forEach((id, i) => {
    const x = n === 1 ? 0 : -0.21 + (0.42 * i) / (n - 1);
    const y = 0.215 - 0.3 * x * x;
    const sub = new Kit();
    fillingPiece(sub, id, lite);
    const geo = sub.bake(false);
    const s = fillScale;
    k.addBaked(geo, new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromAxisAngle(UP, i * 2.2), new THREE.Vector3(s, s, s)));
    geo.matte?.dispose();
    geo.gloss?.dispose();
  });
}

/** Opening tipped towards the game camera so the fillings show; long axis slightly turned. */
const TACO_POSE = new THREE.Euler(0.16, -0.12, 0, 'YXZ');

export function smallTaco(k: Kit, dish: DishId): void {
  k.within(new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion().setFromEuler(TACO_POSE), new THREE.Vector3(0.95, 0.95, 0.95)),
    () => taco(k, fillingsOf(dish), true));
  k.centerXZ();
}

/** Checked paper (the dish's colour and white), draped over the plate's well and slopes. */
function checkedPaper(k: Kit, plateR: number, side: number, n: number, red = C('#d8453a')): void {
  const white = C('#fbf6ee');
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const rot = Math.PI / 4;
  const at = (u: number, v: number): [number, number, number] => {
    const x0 = (u - 0.5) * side, z0 = (v - 0.5) * side;
    const x = x0 * Math.cos(rot) - z0 * Math.sin(rot), z = x0 * Math.sin(rot) + z0 * Math.cos(rot);
    return [x, plateTop(plateR, Math.hypot(x, z)) + 0.005, z];
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = (i + j) % 2 ? red : white;
      const base = pos.length / 3;
      for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        pos.push(...at((i + du) / n, (j + dv) / n));
        col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  k.add(g, undefined, 'matte');
}

export function tacoDish(k: Kit, dish: DishId): void {
  const R = 0.74, fam = familyOf(dish);
  const well = plate(k, R, fam.clone().multiplyScalar(0.8), 26);
  checkedPaper(k, R, 0.98, 7, fam);
  const sub = new Kit();
  sub.within(new THREE.Matrix4().makeRotationFromEuler(TACO_POSE), () => taco(sub, fillingsOf(dish), false, 1.05));
  const geo = sub.bake(true);
  k.addBaked(geo, new THREE.Matrix4().compose(new THREE.Vector3(-0.03, well + 0.004, -0.02), new THREE.Quaternion(), new THREE.Vector3(1.38, 1.38, 1.38)));
  geo.matte?.dispose();
  geo.gloss?.dispose();
  k.within(new THREE.Matrix4().compose(new THREE.Vector3(0.42, well + 0.03, 0.36), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.4, 0)), new THREE.Vector3(1, 1, 1)),
    () => halfLime(k, 0.12, true));
}

// ------------------------------------------------------------------ burrito

const WRAP = C('#f4e5c4'), WRAP_LIGHT = C('#fbf2df'), WRAP_TOAST = C('#d6a65f'), WRAP_SEAM = C('#c9a372');
const FOIL = C('#a3abb7'), FOIL_LIGHT = C('#f4f6f9'), FOIL_DARK = C('#5f6874');

/** A small chunk of a filling for the burrito's cut end, in the face's local space (y = out of it). */
function faceChunk(k: Kit, id: FoodId, x: number, y: number, z: number, seed: number): void {
  const rnd = rng(seed);
  const c = fillingColor(id);
  let g: THREE.BufferGeometry;
  switch (id) {
    case 'beans': g = ellipsoid(0.042, 0.026, 0.028, 7, 4); break;
    case 'corn': g = ellipsoid(0.032, 0.026, 0.03, 6, 4); break;
    case 'lettuce': {
      g = leaf(0.08, 0.045, { nu: 3, nv: 1, thickness: 0.008, lift: (u) => 0.012 * Math.sin(Math.PI * u) });
      g.translate(-0.04, 0, 0);
      break;
    }
    case 'cheese': g = sweep([[-0.035, 0, 0], [0, 0.006, 0.004], [0.035, 0, 0]], 0.01, 2, 4, { caps: 'flat' }); break;
    default: {
      g = ellipsoid(0.055, 0.034, 0.046, 8, 5);
      deform(g, (p) => p.multiplyScalar(1 + 0.15 * noise3(p.x * 30 + seed, p.y * 30, p.z * 30, 5)));
    }
  }
  g.rotateY(rnd() * TAU);
  g.translate(x, y, z);
  k.add(g, (_p, n, out) => out.copy(c).multiplyScalar(0.85 + 0.25 * smooth(-0.3, 1, n.y)), id === 'cheese' || id === 'lettuce' ? 'matte' : 'gloss');
}

/** A wrapped burrito along X (closed end at -X, cut end at +X showing the fillings), foil on its back half. */
function burrito(k: Kit, fillings: FoodId[], lite: boolean, tint?: THREE.Color): void {
  // coloured foil (the dish's colour) or plain foil
  const foil = tint ? FOIL.clone().lerp(tint, 0.75) : FOIL, foilLight = tint ? FOIL_LIGHT.clone().lerp(tint, 0.35) : FOIL_LIGHT;
  const foilDark = tint ? FOIL_DARK.clone().lerp(tint, 0.5).multiplyScalar(0.7) : FOIL_DARK;
  const R = 0.19, flat = 0.86, y0 = R * flat;
  const pts: Vec[] = [[-0.5, y0, 0], [-0.17, y0, 0.025], [0.17, y0, 0.02], [0.5, y0, 0]];
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const radius = (t: number) => R * Math.sqrt(smooth(0, 0.13, t)) * (1 + 0.025 * Math.sin(t * 9));
  const seamAt = (t: number) => 1.1 + t * 2.4;
  const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  k.add(sweep(pts, radius, lite ? 16 : 22, lite ? 12 : 16, {
    caps: 'none', up: [0, 1, 0], section: (phi) => [Math.cos(phi) * flat, Math.sin(phi)],
    radial: (t, phi) => 1 - 0.03 * Math.exp(-((wrapAngle(phi - seamAt(t)) / 0.18) ** 2)),
    color: (t, phi, out) => {
      out.copy(WRAP).lerp(WRAP_LIGHT, 0.5 * smooth(-0.2, 0.9, Math.cos(phi)));
      out.lerp(WRAP_TOAST, 0.85 * smooth(0.1, 0.6, noise3(t * 9, Math.cos(phi) * 2.5, Math.sin(phi) * 2.5, 6)));
      out.lerp(WRAP_SEAM, 0.8 * Math.exp(-((wrapAngle(phi - seamAt(t)) / 0.12) ** 2)));
      out.lerp(WRAP_SEAM, 0.6 * Math.pow(0.5 + 0.5 * Math.cos(6 * phi), 8) * (1 - smooth(0.04, 0.16, t)));
    },
  }), undefined, 'matte');

  // Crinkled foil over the closed half.
  const foilPts: Vec[] = [];
  for (let i = 0; i <= 8; i++) foilPts.push(curve.getPointAt((i / 8) * 0.44).toArray());
  k.add(sweep(foilPts, (u) => 1.07 * radius(u * 0.44) + 0.004, lite ? 8 : 10, lite ? 12 : 16, {
    caps: 'none', up: [0, 1, 0], section: (phi) => [Math.cos(phi) * flat, Math.sin(phi)],
    radial: (u, phi) => 1 + 0.05 * noise3(Math.cos(phi) * 5, Math.sin(phi) * 5, u * 16, 8),
    color: (u, phi, out) => {
      const crinkle = noise3(Math.cos(phi) * 5, Math.sin(phi) * 5, u * 16, 8);
      out.copy(foil).lerp(foilLight, smooth(0.15, 0.8, crinkle)).lerp(foilDark, smooth(-0.15, -0.7, crinkle));
      out.lerp(foilDark, 0.35 * smooth(0.2, -0.8, Math.cos(phi)));
    },
  }), undefined, 'gloss');

  // The cut end: wrap layers round the rim, then the fillings in organic wedges, bulging out.
  const end = curve.getPointAt(1), T = curve.getTangentAt(1).normalize();
  const ex = UP.clone().negate().addScaledVector(T, T.y).normalize();
  const ez = new THREE.Vector3().crossVectors(ex, T).normalize();
  const m = new THREE.Matrix4().makeBasis(ex, T, ez).setPosition(end);
  const rFace = (th: number) => R / Math.sqrt((Math.cos(th) / flat) ** 2 + Math.sin(th) ** 2);
  const dome = (f: number) => 0.055 * (1 - f * f);
  const n = Math.max(1, fillings.length);
  const sectorOf = (f: number, th: number) => {
    const w = th + 0.55 * noise3(Math.cos(th) * 1.5, Math.sin(th) * 1.5, f * 2.5, 5);
    return ((Math.floor(((w / TAU) % 1 + 1) % 1 * n) % n) + n) % n;
  };
  k.within(m, () => {
    k.add(disc(lite ? 4 : 5, lite ? 14 : 18, rFace, dome, 0, (f, th, _top, out) => {
      if (f > 0.86) out.copy(WRAP).lerp(WRAP_SEAM, f > 0.92 && f < 0.97 ? 0.5 : 0);
      else out.copy(fillingColor(fillings[sectorOf(f, th)] ?? 'beans')).multiplyScalar(0.8 + 0.25 * f);
    }, true), undefined, 'gloss');
    fillings.forEach((id, i) => {
      const th = ((i + 0.5) / n) * TAU;
      for (let j = 0; j < (lite ? 1 : 2); j++) {
        const f = j ? 0.6 : 0.3;
        const a = th + (j ? 0.25 : -0.15);
        const r = rFace(a) * f;
        faceChunk(k, id, Math.cos(a) * r, dome(f) + 0.008, Math.sin(a) * r, i * 7 + j);
      }
    });
  });
}

const BURRITO_YAW = -0.95;

export function smallBurrito(k: Kit, dish: DishId): void {
  k.within(new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(UP, BURRITO_YAW), new THREE.Vector3(0.76, 0.76, 0.76)),
    () => burrito(k, fillingsOf(dish), true, familyOf(dish)));
  k.centerXZ();
}

export function burritoDish(k: Kit, dish: DishId): void {
  const R = 0.74, fam = familyOf(dish);
  const well = plate(k, R, fam.clone().multiplyScalar(0.8), 28);
  k.within(new THREE.Matrix4().compose(new THREE.Vector3(0.0, well - 0.004, 0.04), new THREE.Quaternion().setFromAxisAngle(UP, BURRITO_YAW), new THREE.Vector3(1, 1, 1)),
    () => burrito(k, fillingsOf(dish), false, fam));
  // A few tortilla chips on the side.
  for (const [x, z, yaw, tilt] of [[-0.36, 0.3, 0.4, 0.1], [-0.27, 0.4, 2.1, 0.18], [-0.44, 0.17, 3.6, 0.08]] as const) {
    const c = chip(0.1);
    c.rotateX(-Math.PI / 2 + tilt);
    c.rotateY(yaw);
    c.translate(x, plateTop(R, Math.hypot(x, z)) + 0.02, z);
    k.add(c, (p, _n, out) => out.copy(CHIP).lerp(CHIP_DARK, smooth(0.2, 0.8, noise3(p.x * 30, p.y * 30, p.z * 30, 2)) * 0.6), 'matte');
  }
  k.within(new THREE.Matrix4().compose(new THREE.Vector3(0.38, well + 0.03, -0.34), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.2, 0)), new THREE.Vector3(1, 1, 1)),
    () => halfLime(k, 0.11, true));
}
