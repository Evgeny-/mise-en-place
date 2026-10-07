import * as THREE from 'three';
import {
  C, Kit, deform, dice, ellipsoid, fractions, lathe, leaf, lerp, loft, noise3, orient, ramp, rng, smooth, squircle, sweep, type Vec,
} from './kit';
import { basil } from './preps';
import { buildLayer, LAYER_THICKNESS, type BurgerLayerId } from './burger';

/** Finished dishes: base at y = 0, inside x, z ∈ [-0.8, 0.8], at most 1.0 tall. */

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ tableware

const PLATE_WHITE = C('#fbf7ef');
const PLATE_UNDER = C('#e3dbcc');

/** Height of a plate's upper surface (made by `plate`) at distance r from its centre. */
export function plateTop(R: number, r: number): number {
  const pts: [number, number][] = [[0, 0.036], [R * 0.64, 0.036], [R * 0.8, 0.054], [R * 0.925, 0.075], [R * 0.94, 0.077], [R * 0.985, 0.08]];
  if (r >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (r <= pts[i][0]) {
      const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
      return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0);
    }
  }
  return pts[0][1];
}

/** A glazed plate with a coloured band on the rim. Returns the height of its well. */
export function plate(k: Kit, R: number, band: THREE.Color, seg = 34): number {
  const well = 0.036;
  const prof: [number, number][] = [
    [0, 0.012], [R * 0.53, 0.012], [R * 0.56, 0], [R * 0.62, 0.014], [R * 0.86, 0.034], [R * 0.97, 0.058],
    [R, 0.07], [R * 0.985, 0.08], [R * 0.94, 0.077], [R * 0.925, 0.075], [R * 0.8, 0.054], [R * 0.64, well], [0, well],
  ];
  const tf = fractions(prof);
  k.add(lathe(prof, seg, {
    color: (_th, t, _y, out, r) => {
      if (t < tf[5]) out.copy(PLATE_UNDER);
      else out.copy(r >= R * 0.935 ? band : PLATE_WHITE);
    },
  }), undefined, 'gloss');
  return well;
}

/** A round wooden board with soft growth rings. Returns its height. */
export function board(k: Kit, R: number, h: number, seg: number): number {
  const wood = C('#bf8249'), woodLight = C('#d39a5e'), woodDark = C('#8f5629');
  k.add(lathe([[0, 0], [R - 0.02, 0], [R, 0.02], [R, h - 0.016], [R - 0.016, h], [R * 0.72, h], [R * 0.45, h], [0, h]], seg, {
    radial: (th) => 1 + 0.006 * Math.sin(3 * th + 0.5),
    color: (_th, _t, y, out, r) => {
      if (y < h - 0.001) out.copy(woodDark).lerp(wood, smooth(0, h, y));
      else out.copy(r > R * 0.6 && r < R * 0.8 ? wood : woodLight).lerp(wood, r > R * 0.9 ? 0.6 : 0);
    },
  }), undefined, 'matte');
  return h;
}

// ------------------------------------------------------------------ pizza

export function pizza(k: Kit): void {
  const bh = board(k, 0.78, 0.05, 40);
  const crust = C('#eaa94f'), crustDark = C('#c4762c'), char = C('#8e4c1f'), under = C('#d9a35c');
  const sauceC = C('#cc3528'), sauceDark = C('#a4241b');
  const y0 = bh;
  const prof: [number, number][] = [[0, y0], [0.6, y0], [0.66, y0 + 0.008], [0.69, y0 + 0.035], [0.682, y0 + 0.068], [0.652, y0 + 0.088],
    [0.612, y0 + 0.083], [0.58, y0 + 0.062], [0.565, y0 + 0.045], [0.552, y0 + 0.038], [0.54, y0 + 0.036], [0.3, y0 + 0.034], [0, y0 + 0.036]];
  const g = lathe(prof, 48, {
    radial: (th) => 1 + 0.012 * noise3(Math.cos(th) * 3, Math.sin(th) * 3, 1, 2),
    color: (th, _t, y, out, r) => {
      if (r >= 0.552 || y < y0 + 0.006) {
        ramp(out, [[y0, under], [y0 + 0.03, crustDark], [y0 + 0.07, crust]], y);
        const spot = noise3(Math.cos(th) * 9, Math.sin(th) * 9, y * 25, 6);
        out.lerp(char, smooth(0.15, 0.55, spot) * smooth(y0 + 0.045, y0 + 0.08, y) * 0.85);
      } else {
        out.copy(sauceC).lerp(sauceDark, smooth(0.45, 0.55, r) * 0.6);
      }
    },
  });
  deform(g, (p) => {
    const r = Math.hypot(p.x, p.z);
    if (r > 0.57) p.y += 0.012 * noise3(p.x * 7, 0, p.z * 7, 3) * smooth(y0 + 0.04, y0 + 0.08, p.y);
  });
  k.add(g, undefined, 'matte');

  // Melted mozzarella blobs.
  const mozz = C('#fdf8ec'), mozzEdge = C('#f1d797');
  const rnd = rng(5);
  const spots: [number, number][] = [[0.02, 0.02], [0.3, 0.14], [-0.26, 0.24], [0.12, -0.33], [-0.31, -0.18], [0.36, -0.2], [-0.04, 0.4], [0.06, -0.08]];
  spots.forEach(([x, z], i) => {
    const r = i === 7 ? 0.07 : 0.09 + rnd() * 0.035;
    const blob = lathe([[1, 0], [0.92, 0.45], [0.62, 0.88], [0, 1]], 16, {
      radial: (th) => 1 + 0.2 * noise3(Math.cos(th) * 1.4, Math.sin(th) * 1.4, i * 3.1, 4),
      color: (_th, t, _y, out) => out.copy(mozzEdge).lerp(mozz, smooth(0.0, 0.45, t)),
    });
    blob.scale(r, 0.03, r);
    blob.translate(x, y0 + 0.034, z);
    k.add(blob, undefined, 'gloss');
  });
  // Basil leaves.
  for (const [x, z, a] of [[0.17, 0.3, 0.4], [-0.2, -0.02, 2.2], [0.22, -0.12, 4.1], [-0.12, 0.25, 5.3], [-0.05, -0.33, 1.2]] as const) {
    basil(k, x, y0 + 0.05, z, a, 0.15, 0.095);
  }
}

// ------------------------------------------------------------------ spaghetti

export function spaghetti(k: Kit): void {
  const well = plate(k, 0.74, C('#4a83c8'), 30);
  const gold = C('#f7d36f'), goldDark = C('#d6a23c');
  const R0 = 0.43, Hm = 0.3;
  const mound = (rho: number) => well + 0.02 + Hm * Math.sqrt(Math.max(0, 1 - (rho / (R0 * 1.1)) ** 2));
  // Three strands twirled into a messy nest, each coil tipped a little differently.
  const rnd = rng(12);
  for (let s = 0; s < 3; s++) {
    const pts: Vec[] = [];
    const M = 52, turns = 3.4 + s * 0.45;
    const tiltA = rnd() * TAU, tiltK = 0.07 + rnd() * 0.06;
    for (let i = 0; i <= M; i++) {
      const f = i / M;
      const th = (s * TAU) / 3 + f * turns * TAU;
      const tuck = smooth(0, 0.07, f);
      const rho = ((R0 - s * 0.035) * Math.pow(1 - f, 0.72) + 0.035 + 0.025 * Math.sin(th * 2 + s)) * (0.9 + 0.1 * tuck);
      const y = lerp(well + 0.03, mound(rho) + tiltK * rho * Math.cos(th - tiltA) + 0.014 * Math.sin(f * 31 + s * 2), tuck);
      pts.push([Math.cos(th) * rho, y, Math.sin(th) * rho]);
    }
    k.add(sweep(pts, 0.027, 84, 4), (p, n, out) => {
      out.copy(goldDark).lerp(gold, smooth(-0.6, 0.8, n.y) * 0.75 + 0.25 * smooth(well, well + Hm, p.y));
    }, 'matte');
  }
  // A generous ladle of tomato sauce on top, running down in a few drips.
  const sauceC = C('#cf3227'), sauceDark = C('#981a13'), sauceLight = C('#f0603f');
  const top = mound(0);
  const blob = lathe([[1, 0], [0.9, 0.42], [0.62, 0.82], [0.3, 0.97], [0, 1]], 24, {
    radial: (th) => 1 + 0.2 * noise3(Math.cos(th) * 1.6, Math.sin(th) * 1.6, 2, 7),
    color: (_th, t, _y, out) => ramp(out, [[0, sauceDark], [0.28, sauceC], [1, sauceLight]], t),
  });
  blob.scale(0.27, 0.1, 0.27);
  blob.translate(0.0, top - 0.055, 0.01);
  k.add(blob, undefined, 'gloss');
  for (const [a, r, sz] of [[0.6, 0.25, 0.055], [2.3, 0.27, 0.045], [3.9, 0.24, 0.05], [5.2, 0.26, 0.04]] as const) {
    const d = ellipsoid(sz, sz * 0.5, sz * 0.75, 8, 4);
    d.rotateY(-a);
    d.translate(Math.cos(a) * r, mound(r) + 0.01, Math.sin(a) * r);
    k.add(d, sauceC, 'gloss');
  }
  // Parmesan flakes and basil.
  const parm = C('#fbf0c8');
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU, r = 0.04 + rnd() * 0.1;
    const f = dice(0.034, 0.012, 0.026, 0.005);
    f.rotateY(rnd() * 3);
    f.translate(Math.cos(a) * r, top + 0.04 - r * 0.15, Math.sin(a) * r);
    k.add(f, parm, 'matte');
  }
  basil(k, -0.03, top + 0.045, 0.04, 0.9, 0.17, 0.105);
  basil(k, 0.0, top + 0.04, 0.0, 2.6, 0.14, 0.09);
}

// ------------------------------------------------------------------ minestrone

export function minestrone(k: Kit): void {
  const R = 0.66, H = 0.36;
  const outer = C('#3e84c4'), outerDark = C('#2b5f93'), glaze = C('#f8f0e0'), glazeShade = C('#e6dccb');
  const prof: [number, number][] = [[0, 0.016], [R * 0.4, 0.016], [R * 0.43, 0], [R * 0.5, 0], [R * 0.54, 0.025], [R * 0.76, H * 0.3],
    [R * 0.93, H * 0.66], [R, H * 0.93], [R * 0.99, H], [R * 0.955, H * 0.985], [R * 0.93, H * 0.9], [R * 0.86, H * 0.65]];
  const tf = fractions(prof);
  k.add(lathe(prof, 36, {
    color: (_th, t, y, out) => {
      if (t >= tf[9]) out.copy(glaze).lerp(glazeShade, smooth(H * 0.95, H * 0.7, y));
      else ramp(out, [[0, outerDark], [H * 0.45, outer], [H, outer]], y);
    },
  }), undefined, 'gloss');
  const level = H * 0.8;
  const broth = C('#d6552a'), brothDark = C('#ad3a19'), brothLight = C('#ec7e44');
  const soup = lathe([[R * 0.912, level - 0.004], [R * 0.7, level + 0.003], [R * 0.35, level + 0.006], [0, level + 0.007]], 36, {
    color: (_th, t, _y, out) => ramp(out, [[0, brothDark], [0.25, broth], [1, brothLight]], t),
  });
  deform(soup, (p) => {
    p.y += 0.004 * noise3(p.x * 8, 0, p.z * 8, 13) * smooth(0.55, 0.4, Math.hypot(p.x, p.z));
  });
  k.add(soup, undefined, 'gloss');

  // Vegetable chunks, beans, peas and little pasta tubes bobbing in the broth.
  const rnd = rng(77);
  const spots: [number, number][] = [];
  for (let i = 0; i < 18; i++) {
    const r = 0.46 * Math.sqrt((i + 0.5) / 18), a = i * 2.39996 + 0.4;
    spots.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const carrotC = [C('#f7932f'), C('#ea7a22')], potatoC = C('#f3dda6'), greenC = C('#6cbf45'), peaC = C('#86cb4e');
  const pastaC = C('#f4d47c'), tomatoC = C('#d63a2b');
  spots.forEach(([x, z], i) => {
    const kind = ['carrot', 'potato', 'pea', 'bean', 'pasta', 'carrot', 'potato', 'pea', 'tomato', 'pasta', 'bean'][i % 11];
    const yaw = rnd() * TAU;
    const y = level + 0.004;
    if (kind === 'carrot' || kind === 'potato' || kind === 'tomato') {
      const s = kind === 'potato' ? 0.1 : 0.088;
      const d = dice(s, s * 0.8, s, kind === 'potato' ? 0.022 : 0.015);
      d.rotateX((rnd() - 0.5) * 0.5).rotateZ((rnd() - 0.5) * 0.5).rotateY(yaw);
      d.translate(x, y + s * 0.12, z);
      k.add(d, kind === 'carrot' ? carrotC[i % 2] : kind === 'potato' ? potatoC : tomatoC, kind === 'tomato' ? 'gloss' : 'matte');
    } else if (kind === 'pea') {
      for (let j = 0; j < 2; j++) {
        const pea = ellipsoid(0.04, 0.036, 0.04, 8, 5);
        pea.translate(x + j * 0.07 * Math.cos(yaw), y + 0.006, z + j * 0.07 * Math.sin(yaw));
        k.add(pea, peaC, 'gloss');
      }
    } else if (kind === 'bean') {
      const dx = Math.cos(yaw) * 0.07, dz = Math.sin(yaw) * 0.07;
      k.add(sweep([[x - dx, y + 0.01, z - dz], [x + dx, y + 0.01, z + dz]], 0.03, 2, 6), greenC, 'matte');
    } else {
      const tube = lathe([[0.022, -0.032], [0.041, -0.032], [0.041, 0.032], [0.022, 0.032]], 10, { closed: true });
      tube.rotateZ(Math.PI / 2);
      tube.rotateY(yaw);
      tube.translate(x, y + 0.016, z);
      k.add(tube, pastaC, 'matte');
    }
  });
  basil(k, 0.06, level + 0.03, -0.04, 0.7, 0.17, 0.11);
}

// ------------------------------------------------------------------ omelette

export function omelette(k: Kit): void {
  const well = plate(k, 0.74, C('#3fa58c'));
  const egg = C('#f7c843'), eggLight = C('#fde17a'), browned = C('#d0872c'), pale = C('#f2d27a');
  const Lx = 0.5, W0 = 0.62, H0 = 0.2, zBack = -0.27, NS = 18, NR = 16;
  const shape = (x: number) => {
    const e = Math.sqrt(Math.max(0, 1 - (x / Lx) ** 2));
    return { W: W0 * Math.pow(e, 0.8), Hh: H0 * (0.35 + 0.65 * e) };
  };
  const ringPoint = (x: number, psi: number): Vec => {
    const { W, Hh } = shape(x);
    const sn = Math.sin(psi), cs = Math.cos(psi);
    const g = 1 - 0.6 * Math.max(0, sn);
    const yy = cs >= 0 ? Hh * 0.8 * cs * g : Hh * 0.2 * cs;
    return [x, well + Hh * 0.2 + yy, zBack + W / 2 + (W / 2) * sn];
  };
  const sections: Vec[][] = [];
  const xs: number[] = [];
  for (let i = 0; i <= NS; i++) xs.push(-Lx * Math.cos((Math.PI * i) / NS));
  xs.forEach((x, i) => {
    if (i === 0 || i === NS) {
      sections.push([[x * 1.01, well + H0 * 0.12, zBack + 0.012]]);
      return;
    }
    const ring: Vec[] = [];
    for (let j = 0; j < NR; j++) ring.push(ringPoint(x, (j / NR) * TAU));
    sections.push(ring);
  });
  k.add(loft(sections, (i, j, out) => {
    const x = xs[i];
    const psi = (j / NR) * TAU;
    const top = Math.cos(psi);
    ramp(out, [[-1, pale], [0, egg], [1, eggLight]], top);
    const spot = noise3(x * 7, psi * 1.3, 0.5, 19);
    out.lerp(browned, smooth(0.05, 0.5, spot) * smooth(-0.2, 0.4, top) * 0.85);
  }), undefined, 'gloss');

  // Height of the top surface at (x, z), for laying garnish on it.
  const topAt = (x: number, z: number) => {
    const { W, Hh } = shape(x);
    const sn = Math.max(-1, Math.min(1, (z - (zBack + W / 2)) / (W / 2 || 1)));
    const psi = Math.asin(sn);
    const cs = Math.cos(psi);
    return well + Hh * 0.2 + Hh * 0.8 * cs * (1 - 0.6 * Math.max(0, sn));
  };
  const normalAt = (x: number, z: number): Vec => {
    const e = 0.02;
    const dx = (topAt(x + e, z) - topAt(x - e, z)) / (2 * e), dz = (topAt(x, z + e) - topAt(x, z - e)) / (2 * e);
    return [-dx, 1, -dz];
  };

  // Mushroom slices: the classic cap-and-stem cross-section, brown rim and creamy inside.
  const capShape = new THREE.Shape();
  capShape.moveTo(-0.026, 0);
  capShape.lineTo(0.026, 0);
  capShape.lineTo(0.024, 0.045);
  capShape.quadraticCurveTo(0.078, 0.045, 0.082, 0.072);
  capShape.quadraticCurveTo(0.074, 0.13, 0, 0.135);
  capShape.quadraticCurveTo(-0.074, 0.13, -0.082, 0.072);
  capShape.quadraticCurveTo(-0.078, 0.045, -0.024, 0.045);
  capShape.lineTo(-0.026, 0);
  const sliceInside = C('#efdcb8'), sliceRim = C('#8b5532');
  for (const [x, z, yaw] of [[-0.22, -0.06, 0.5], [0.04, -0.02, -0.35], [0.27, -0.1, 0.9]] as const) {
    const g = new THREE.ExtrudeGeometry(capShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, -0.065, 0);
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    const up = new THREE.Vector3(...normalAt(x, z)).normalize();
    orient(g, up.toArray(), [x, topAt(x, z) + 0.004, z], yaw);
    k.add(g, (_p, n, out) => {
      out.copy(n.dot(up) > 0.85 ? sliceInside : sliceRim);
    }, 'matte');
  }

  // Melted cheese oozing out all along the open edge, swelling into drips here and there.
  const cheeseC = C('#f9b22c');
  const edge: Vec[] = [-0.42, -0.32, -0.18, -0.04, 0.1, 0.24, 0.35, 0.43].map((x) => [x, well + 0.018, zBack + shape(x).W + 0.012]);
  k.add(sweep(edge, (t) => 0.026 + 0.014 * Math.max(0, Math.sin(t * 17 + 1)) ** 2, 30, 6, {
    up: [0, 1, 0], section: (phi) => [Math.cos(phi) * 0.6, Math.sin(phi)],
  }), cheeseC, 'gloss');
  // Chives and a little parsley.
  const chive = C('#3f9b3a');
  const rnd = rng(13);
  for (let i = 0; i < 10; i++) {
    const x = (rnd() - 0.5) * 0.7, z = zBack + 0.08 + rnd() * shape(x).W * 0.6;
    const y = topAt(x, z) + 0.008;
    const a = rnd() * TAU;
    const dx = Math.cos(a) * 0.024, dz = Math.sin(a) * 0.024;
    k.add(sweep([[x - dx, y, z - dz], [x + dx, y, z + dz]], 0.009, 1, 5, { caps: 'flat' }), chive, 'matte');
  }
  for (const [a, l] of [[0.3, 0.15], [1.5, 0.14], [2.6, 0.13]] as const) {
    basil(k, 0.44, well + 0.014, 0.32, a, l, 0.09);
  }
}

// ------------------------------------------------------------------ burger

const BURGER_STACK: BurgerLayerId[] = ['bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'tomato_slice', 'bun_top'];

/** Stack lite layers from height y (each layer turned by its yaw); returns the height of the top. */
function stack(k: Kit, ids: BurgerLayerId[], y: number, yaw: number[] = []): number {
  ids.forEach((id, i) => {
    const sub = new Kit();
    buildLayer(sub, id, true);
    const geo = sub.bake(false);
    k.addBaked(geo, new THREE.Matrix4().makeRotationY(yaw[i] ?? 0).setPosition(0, y, 0));
    geo.matte?.dispose();
    geo.gloss?.dispose();
    y += LAYER_THICKNESS[id];
  });
  return y;
}

/** A hot dog on a small paper tray: bun, sausage and pickles. */
export function hotdog(k: Kit): void {
  const tray = C('#f3e3c4'), trayEdge = C('#d84a3c');
  const g = lathe([[0, 0], [0.9, 0], [1, 0.05], [1.02, 0.1], [0.97, 0.1], [0.92, 0.04], [0, 0.03]], 32, {
    section: squircle(4, 0.62, 0.34),
    color: (_th, _t, y, out, r) => out.copy(r > 0.95 && y > 0.04 ? trayEdge : tray),
  });
  k.add(g, undefined, 'matte');
  stack(k, ['hotdog_bun', 'sausage', 'pickles'], 0.03);
}

/** A stack of three pancakes with berries and a melting pat of butter, on a plate. */
export function pancakes(k: Kit): void {
  const well = plate(k, 0.72, C('#e98fae'));
  stack(k, ['pancake', 'pancake', 'pancake', 'berries', 'butter'], well, [0, 0.9, 2.1, 0, 0]);
}

/** A club sandwich on a board: toast, bacon, lettuce, tomato, cheese, toast. */
export function sandwich(k: Kit): void {
  const y = board(k, 0.66, 0.05, 30);
  const top = stack(k, ['toast', 'bacon', 'lettuce', 'tomato_slice', 'cheese_slice', 'toast'], y, [0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
  // a cocktail pick through the middle
  k.add(sweep([[0.0, top - 0.25, 0.0], [0.01, top + 0.12, 0.01]], 0.009, 1, 5, { caps: 'round' }), C('#e9c58f'), 'matte');
  const olive = ellipsoid(0.04, 0.035, 0.04, 10, 6);
  olive.translate(0.01, top + 0.06, 0.01);
  k.add(olive, C('#6e8f2a'), 'gloss');
}

/** A sundae in its glass: vanilla and chocolate scoops, berries, a cherry on top. */
export function sundae(k: Kit): void {
  stack(k, ['cup', 'ice_cream', 'chocolate', 'berries', 'cherry'], 0);
}

export function burger(k: Kit): void {
  const y = stack(k, BURGER_STACK, board(k, 0.62, 0.06, 32));
  // A cocktail pick with a little flag.
  const top = y - LAYER_THICKNESS.bun_top + 0.307;
  const pickWood = C('#e9c58f'), flagRed = C('#e2483b');
  k.add(sweep([[0.02, top - 0.1, 0.0], [0.03, top + 0.15, 0.01]], 0.009, 1, 5, { caps: 'round' }), pickWood, 'matte');
  const flag = leaf(0.13, 0.09, { nu: 4, nv: 2, thickness: 0.008, lift: (u) => 0.01 * Math.sin(u * 6), width: (u) => 1 - u * 0.85 });
  flag.rotateX(Math.PI / 2);
  flag.translate(0.032, top + 0.11, 0.012);
  k.add(flag, flagRed, 'matte');
}
