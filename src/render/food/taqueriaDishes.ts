import * as THREE from 'three';
import { C, Kit, dice, ellipsoid, lathe, lerp, noise3, ramp, rng, smooth, squircle, sweep, type Vec } from './kit';
import { plate } from './dishes';
import { FILLING_COLOR } from './taqueria';

/**
 * The Taquería's other dishes, made the taco way (a container and its fillings) but plated their
 * own way: a quesadilla cut in wedges, a flat crisp tostada heaped high, enchiladas under red sauce.
 * Same rules as dishes.ts: base at y = 0, inside x, z ∈ [-0.8, 0.8], at most 1.0 tall.
 */

const TAU = Math.PI * 2;
const TORT = C('#efc874'), TORT_TOAST = C('#c98a3c'), CHAR = C('#8a4c1c'), GRILLED = C('#e4a64e');
const CHEESE = C('#f9c23a'), CHEESE_LIGHT = C('#ffe07a'), CREMA = C('#fbf6ea');
const SALSA = C('#d6402e'), SALSA_DARK = C('#a8261b'), CILANTRO = C('#3f9c3a');

function dollop(k: Kit, x: number, y: number, z: number, r: number, h: number, lo: THREE.Color, hi: THREE.Color, seed: number): void {
  const g = lathe([[1, 0], [0.85, 0.45], [0.5, 0.85], [0, 1]], 16, {
    radial: (th) => 1 + 0.18 * noise3(Math.cos(th) * 1.6, Math.sin(th) * 1.6, seed, 3),
    color: (_th, t, _y, out) => out.copy(lo).lerp(hi, t),
  });
  g.scale(r, h, r);
  g.translate(x, y, z);
  k.add(g, undefined, 'gloss');
}

function flecks(k: Kit, rnd: () => number, n: number, r: number, y: (x: number, z: number) => number, color: THREE.Color, x0 = 0, z0 = 0): void {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = r * Math.sqrt(rnd());
    const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
    const f = ellipsoid(0.018, 0.005, 0.012, 5, 2);
    f.rotateY(rnd() * 3);
    f.translate(x, y(x, z), z);
    k.add(f, color, 'matte');
  }
}

// ------------------------------------------------------------------ quesadilla

/** A grilled quesadilla cut in three wedges, cheese oozing at the cuts, salsa and crema beside it. */
export function quesadilla(k: Kit): void {
  const well = plate(k, 0.74, C('#e0923a'), 28);
  const R = 0.5, H = 0.085;
  const chickenC = FILLING_COLOR.chicken ?? C('#e9b46c');
  const wedges: [number, number][] = [[0.15, 1.15], [1.2, 2.2], [2.25, 3.25]];
  wedges.forEach(([a0, a1], i) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(R * Math.cos(a0), R * Math.sin(a0));
    shape.absarc(0, 0, R, a0, a1, false);
    shape.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: H, steps: 4, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    // fanned out a little, the wedges' points towards the middle
    const mid = (a0 + a1) / 2;
    const ox = Math.cos(mid) * 0.05 - 0.02, oz = -Math.sin(mid) * 0.05 + 0.12;
    g.translate(ox, well + 0.016, oz);
    const y0 = well + 0.016;
    k.add(g, (p, n, out) => {
      const y = p.y - y0;
      if (Math.abs(n.y) < 0.6 && y > H * 0.25 && y < H * 0.75) {
        // the cut faces: melted cheese with bits of chicken
        out.copy(CHEESE).lerp(chickenC, smooth(0.2, 0.6, noise3(p.x * 30, p.y * 30, p.z * 30, i)) * 0.7);
        return;
      }
      ramp(out, [[-1, TORT_TOAST], [0, GRILLED], [1, TORT]], n.y);
    }, 'matte');
    // grill marks across the top
    for (const d of [-0.12, 0.02, 0.16]) {
      const ca = Math.cos(mid), sa = Math.sin(mid);
      const cx = ca * (0.25 + d * 0.3), cz = sa * (0.25 + d * 0.3);
      const pts: Vec[] = [-0.07, 0.07].map((u): Vec => [ox + cx - sa * u + ca * d * 0.4, y0 + H + 0.014, oz - (cz + ca * u - sa * d * 0.4)]);
      k.add(sweep(pts, 0.011, 1, 5, { caps: 'round', up: [0, 1, 0], section: (phi) => [Math.sin(phi) * 0.4, Math.cos(phi)] }), CHAR, 'matte');
    }
    // cheese oozing out along the cut edges
    for (const a of [a0, a1]) {
      const pts: Vec[] = [0.12, 0.28, 0.42].map((r, j): Vec => [ox + Math.cos(a) * r, y0 + H * 0.4 - j * 0.006, oz - Math.sin(a) * r]);
      k.add(sweep(pts, (t) => 0.016 + 0.01 * Math.sin(t * 9 + i), 6, 5), (_p, n, out) => out.copy(CHEESE).lerp(CHEESE_LIGHT, smooth(0, 1, n.y) * 0.5), 'gloss');
    }
  });
  // salsa and crema at the front
  dollop(k, 0.3, well + 0.004, 0.38, 0.12, 0.06, SALSA_DARK, SALSA, 3);
  dollop(k, 0.07, well + 0.004, 0.48, 0.1, 0.06, CREMA.clone().multiplyScalar(0.9), CREMA, 5);
  flecks(k, rng(9), 6, 0.08, () => well + 0.07, CILANTRO, 0.3, 0.38);
}

// ------------------------------------------------------------------ tostada

/** A flat crisp tortilla heaped with refried beans, shredded lettuce and guacamole. */
export function tostada(k: Kit): void {
  const well = plate(k, 0.74, C('#3a64b8'), 28);
  const R = 0.56, T = 0.035;
  const y0 = well + 0.004;
  // the crisp tortilla, slightly wavy at the rim
  k.add(lathe([[0, 0], [R - 0.02, 0], [R, 0.015], [R - 0.01, T], [R * 0.6, T + 0.002], [0, T + 0.003]], 36, {
    radial: (th) => 1 + 0.02 * Math.sin(5 * th + 1),
    color: (th, _t, y, out, r) => {
      out.copy(TORT).lerp(TORT_TOAST, smooth(R * 0.75, R, r) * 0.7 + (y < T * 0.5 ? 0.3 : 0));
      out.lerp(CHAR, smooth(0.45, 0.8, noise3(Math.cos(th) * 4, r * 6, Math.sin(th) * 4, 5)) * 0.35);
    },
  }).translate(0, y0, 0), undefined, 'matte');
  // refried beans spread almost to the edge
  const bean = FILLING_COLOR.beans ?? C('#7b3f2c');
  k.add(lathe([[R * 0.86, 0], [R * 0.8, 0.03], [R * 0.5, 0.042], [0, 0.046]], 30, {
    radial: (th) => 1 + 0.05 * noise3(Math.cos(th) * 2, Math.sin(th) * 2, 7, 3),
    color: (_th, t, _y, out) => out.copy(bean).multiplyScalar(0.8 + 0.3 * t),
  }).translate(0, y0 + T, 0), undefined, 'gloss');
  const top = y0 + T + 0.046;
  // shredded lettuce
  const rnd = rng(21);
  const lettuce = C('#8ed45a'), lettuceDark = C('#4ea83a');
  for (let i = 0; i < 18; i++) {
    const a = rnd() * TAU, d = 0.38 * Math.sqrt(rnd());
    const x = Math.cos(a) * d, z = Math.sin(a) * d, yaw = rnd() * TAU, L = 0.07 + rnd() * 0.05;
    const pts: Vec[] = [[x - Math.cos(yaw) * L, top + 0.012, z - Math.sin(yaw) * L], [x, top + 0.03, z], [x + Math.cos(yaw) * L, top + 0.014, z + Math.sin(yaw) * L]];
    k.add(sweep(pts, 0.012, 4, 4, { caps: 'flat', up: [0, 1, 0], section: (phi) => [Math.sin(phi) * 0.4, Math.cos(phi)] }), i % 3 ? lettuce : lettuceDark, 'matte');
  }
  // a scoop of guacamole, tomato and crumbled cheese
  const guac = FILLING_COLOR.guacamole ?? C('#8bbd45');
  dollop(k, 0.02, top + 0.02, 0.0, 0.17, 0.11, guac.clone().multiplyScalar(0.75), guac, 2);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.4, d = 0.24 + 0.05 * (i % 2);
    const c = dice(0.06, 0.05, 0.06, 0.012);
    c.rotateY(rnd() * 3);
    c.translate(Math.cos(a) * d, top + 0.04, Math.sin(a) * d);
    k.add(c, SALSA, 'gloss');
  }
  flecks(k, rnd, 10, 0.34, () => top + 0.05, CREMA);
}

// ------------------------------------------------------------------ enchiladas

/** Three rolled tortillas baked in red sauce with melted cheese, in an oval dish. */
export function enchiladas(k: Kit): void {
  const terra = C('#c8663a'), terraDark = C('#9c4626'), glaze = C('#f4e6d0');
  const H = 0.16;
  const sec = squircle(2.6, 0.76, 0.56);
  k.add(lathe([[0, 0.012], [0.85, 0.012], [0.88, 0], [0.94, 0.02], [1, H], [0.98, H + 0.012], [0.94, H * 0.9], [0.9, H * 0.3], [0, H * 0.25]], 30, {
    section: sec,
    color: (_th, t, y, out) => {
      if (t > 0.62) out.copy(glaze).lerp(terra, smooth(H * 0.95, H, y) * 0.5);
      else out.copy(terraDark).lerp(terra, smooth(0, H, y));
    },
  }), undefined, 'gloss');
  const base = H * 0.25;
  // a pool of red sauce under the rolls
  k.add(lathe([[0.86, 0.004], [0.6, 0.012], [0, 0.016]], 28, { section: sec }).translate(0, base, 0), SALSA_DARK, 'gloss');
  const rnd = rng(13);
  for (const z of [-0.22, 0, 0.22]) {
    const r = 0.1;
    const pts: Vec[] = [[-0.52, base + r * 0.9, z + 0.01], [0, base + r, z - 0.01], [0.52, base + r * 0.9, z]];
    // rolled tortilla, its top coated in sauce; the ends show the roll
    k.add(sweep(pts, r, 14, 12, {
      caps: 'flat',
      color: (t, phi, out) => {
        const up = Math.sin(phi);
        out.copy(TORT_TOAST).lerp(TORT, smooth(-1, 0, up));
        const sauce = smooth(-0.3, 0.1, up) * (1 - smooth(0.88, 0.98, Math.abs(t - 0.5) * 2));
        out.lerp(SALSA, sauce * (0.85 + 0.15 * noise3(t * 12, phi, z * 9, 2)));
      },
    }), undefined, 'gloss');
    // melted cheese across the roll
    for (let j = 0; j < 3; j++) {
      const x = -0.32 + j * 0.3 + (rnd() - 0.5) * 0.08;
      const g = ellipsoid(0.085, 0.022, 0.07, 10, 4);
      g.rotateY(rnd() * 3);
      g.translate(x, base + 2 * r - 0.004, z);
      k.add(g, (_p, n, out) => out.copy(CHEESE).lerp(CHEESE_LIGHT, smooth(0.3, 1, n.y) * 0.6), 'gloss');
    }
  }
  // a crema drizzle and cilantro
  const zig: Vec[] = [];
  for (let i = 0; i <= 8; i++) zig.push([-0.45 + i * 0.11, base + 0.215, (i % 2 ? 0.16 : -0.16) + lerp(-0.04, 0.04, i / 8)]);
  k.add(sweep(zig, 0.011, 32, 5), CREMA, 'gloss');
  flecks(k, rnd, 14, 0.42, () => base + 0.225, CILANTRO);
}
