import { C, Kit, deform, dice, ellipsoid, lathe, noise3, ramp, rng, smooth, sweep, type Vec } from './kit';
import { plate } from './dishes';

/**
 * The ragù chain: minced beef (raw), the ragù it makes with tomato sauce (a prep), and the two
 * dishes that use it, tagliatelle al ragù and lasagne. Same rules as the other food: raw items
 * and preps stand on y = 0 inside x, z ∈ [-0.45, 0.45]; dishes fit x, z ∈ [-0.8, 0.8].
 */

const TAU = Math.PI * 2;
const MINCE = C('#c2453c'), MINCE_DEEP = C('#8f2a24'), MINCE_FAT = C('#efb3a6');
const RAGU = C('#8a2f1c'), RAGU_DEEP = C('#5c1b10'), RAGU_LIGHT = C('#b4462a');
const PASTA = C('#f3cf6c'), PASTA_DARK = C('#d4a440');

/** A heap of red mince on butcher's paper. */
export function beef(k: Kit): void {
  const paper = dice(0.74, 0.02, 0.62, 0.008);
  paper.rotateY(0.18);
  paper.translate(0, 0.01, 0);
  k.add(paper, C('#efe3cc'), 'matte');
  const heap = ellipsoid(0.27, 0.16, 0.22, 20, 10);
  deform(heap, (p) => {
    const n = noise3(p.x * 14, p.y * 14, p.z * 14, 3);
    const r = 1 + 0.08 * n;
    p.x *= r;
    p.z *= r;
    p.y = Math.max(0, p.y) * (1 + 0.1 * n);
  });
  heap.translate(0, 0.02, 0);
  k.add(heap, (p, _n, out) => out.copy(MINCE_DEEP).lerp(MINCE, smooth(0.0, 0.14, p.y) * 0.8 + 0.2 * (noise3(p.x * 30, p.y * 30, p.z * 30, 9) * 0.5 + 0.5)), 'matte');
  const rnd = rng(5);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU, rr = 0.2 * Math.sqrt(rnd());
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.8;
    const y = 0.02 + 0.16 * Math.sqrt(Math.max(0, 1 - (rr / 0.27) ** 2));
    const bit = dice(0.04, 0.025, 0.035, 0.01);
    bit.rotateY(rnd() * 3);
    bit.translate(x, y, z);
    k.add(bit, i % 3 ? MINCE : MINCE_FAT, 'matte');
  }
}

/** A terracotta pot of dark ragù with crumbles of meat. */
export function ragu(k: Kit): void {
  const clay = C('#b8643c'), clayDark = C('#8a4426'), clayLight = C('#d98a5c'), inner = C('#6e3420');
  const pot: [number, number][] = [[0, 0], [0.22, 0], [0.26, 0.02], [0.28, 0.08], [0.29, 0.18], [0.3, 0.22], [0.31, 0.24], [0.295, 0.25], [0.275, 0.23]];
  k.add(lathe(pot, 28, {
    color: (_th, t, y, out) => (t > 0.86 ? out.copy(inner) : ramp(out, [[0, clayDark], [0.08, clay], [0.22, clayLight]], y)),
  }), undefined, 'matte');
  const surf = lathe([[0.28, 0.2], [0.2, 0.212], [0.1, 0.218], [0, 0.22]], 28, {
    color: (_th, t, _y, out) => ramp(out, [[0, RAGU_DEEP], [0.2, RAGU], [1, RAGU_LIGHT]], t),
  });
  deform(surf, (p) => {
    p.y += 0.012 * noise3(p.x * 12, 0, p.z * 12, 5);
  });
  k.add(surf, undefined, 'gloss');
  const rnd = rng(17);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, rr = 0.22 * Math.sqrt(rnd());
    const bit = dice(0.045, 0.03, 0.04, 0.012);
    bit.rotateY(rnd() * 3);
    bit.translate(Math.cos(a) * rr, 0.225, Math.sin(a) * rr);
    k.add(bit, i % 2 ? C('#6b2a18') : C('#9a4630'), 'matte');
  }
  // a sprig of rosemary-green on top
  const leaf = ellipsoid(0.06, 0.012, 0.022, 8, 4);
  leaf.rotateY(0.6);
  leaf.translate(0.06, 0.235, -0.05);
  k.add(leaf, C('#4f7f2c'), 'matte');
}

/** Ragù ladled on a dish: a glossy dark-red blob with meat crumbles. */
function raguBlob(k: Kit, x: number, y: number, z: number, r: number, seed: number): void {
  const blob = lathe([[1, 0], [0.9, 0.42], [0.62, 0.82], [0.3, 0.97], [0, 1]], 24, {
    radial: (th) => 1 + 0.18 * noise3(Math.cos(th) * 1.6, Math.sin(th) * 1.6, 2, seed),
    color: (_th, t, _y, out) => ramp(out, [[0, RAGU_DEEP], [0.3, RAGU], [1, RAGU_LIGHT]], t),
  });
  blob.scale(r, r * 0.38, r);
  blob.translate(x, y, z);
  k.add(blob, undefined, 'gloss');
  const rnd = rng(seed);
  for (let i = 0; i < 8; i++) {
    const a = rnd() * TAU, rr = r * 0.7 * Math.sqrt(rnd());
    const bit = dice(0.04, 0.026, 0.035, 0.01);
    bit.rotateY(rnd() * 3);
    bit.translate(x + Math.cos(a) * rr, y + r * 0.3 * (1 - rr / r) + 0.01, z + Math.sin(a) * rr);
    k.add(bit, C('#6b2a18'), 'matte');
  }
}

/** Ribbons of tagliatelle in a loose nest, ragù on top, a little parmesan. */
export function tagliatelle(k: Kit): void {
  const well = plate(k, 0.74, C('#b4462a'), 30);
  const rnd = rng(23);
  for (let s = 0; s < 3; s++) {
    const pts: Vec[] = [];
    const M = 30, turns = 2.2 + s * 0.4;
    for (let i = 0; i <= M; i++) {
      const f = i / M;
      const th = (s * TAU) / 3 + f * turns * TAU;
      const rho = (0.42 - s * 0.04) * Math.pow(1 - f, 0.6) + 0.04;
      const y = well + 0.03 + 0.22 * (1 - rho / 0.46) + 0.015 * Math.sin(f * 23 + s);
      pts.push([Math.cos(th) * rho, y, Math.sin(th) * rho]);
    }
    k.add(sweep(pts, 0.055, 44, 6, {
      up: [0, 1, 0], section: (phi) => [Math.sin(phi) * 0.2, Math.cos(phi)],
    }), (p, n, out) => out.copy(PASTA_DARK).lerp(PASTA, smooth(-0.6, 0.8, n.y) * 0.7 + 0.3 * rnd()), 'matte');
  }
  raguBlob(k, 0, well + 0.2, 0.01, 0.25, 31);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU, rr = 0.12 * Math.sqrt(rnd());
    const f = dice(0.034, 0.012, 0.024, 0.005);
    f.rotateY(rnd() * 3);
    f.translate(Math.cos(a) * rr, well + 0.3, Math.sin(a) * rr);
    k.add(f, C('#fbf0c8'), 'matte');
  }
}

/** A square of lasagne: pasta sheets, ragù and béchamel in layers, a browned cheese top. */
export function lasagne(k: Kit): void {
  const well = plate(k, 0.74, C('#4a83c8'), 30);
  const w = 0.62, d = 0.5;
  const layers: [number, ReturnType<typeof C>][] = [
    [0.04, PASTA], [0.05, RAGU], [0.025, C('#f6efe0')], [0.04, PASTA], [0.05, RAGU], [0.025, C('#f6efe0')], [0.04, PASTA],
  ];
  let y = well;
  for (const [h, color] of layers) {
    const g = dice(w, h, d, 0.012);
    g.translate(0, y + h / 2, 0);
    k.add(g, color, color === RAGU ? 'gloss' : 'matte');
    y += h;
  }
  // a bubbly browned cheese top that runs a little over the edge
  const top = dice(w + 0.02, 0.035, d + 0.02, 0.016);
  deform(top, (p) => {
    p.y += 0.008 * noise3(p.x * 16, 0, p.z * 16, 4);
  });
  top.translate(0, y + 0.017, 0);
  k.add(top, (p, _n, out) => out.copy(C('#f2c55c')).lerp(C('#b9772a'), smooth(0.1, 0.9, noise3(p.x * 9, 0, p.z * 9, 6) * 0.5 + 0.5)), 'matte');
  // ragù oozing out at the front, and a basil leaf
  raguBlob(k, 0.12, well, 0.3, 0.12, 9);
  const leaf = ellipsoid(0.08, 0.014, 0.04, 10, 5);
  leaf.rotateY(0.5);
  leaf.translate(-0.12, y + 0.045, -0.05);
  k.add(leaf, C('#3e8f3a'), 'matte');
}
