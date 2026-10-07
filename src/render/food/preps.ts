import * as THREE from 'three';
import {
  C, Kit, deform, dice, ellipsoid, fractions, lathe, leaf, mat, noise3, orient, ramp, rng, smooth, squircle, sweep, type Vec,
} from './kit';
import { greenLeafColor, pointyLeaf } from './produce';

/** Preps: what appears on the counter when two raw items combine. Same footprint as raw items. */

const TAU = Math.PI * 2;

/** A glossy basil leaf lying on a surface at height y. */
export function basil(k: Kit, x: number, y: number, z: number, yaw: number, len = 0.17, wid = 0.105): void {
  const lf = leaf(len, wid, {
    nu: 6, nv: 2, thickness: 0.012, fold: 0.022, width: pointyLeaf,
    lift: (u) => 0.018 * Math.sin(Math.PI * u) - 0.012 * u,
    color: greenLeafColor(C('#2f8f35'), C('#5cc24a'), C('#a5e07a')),
  });
  lf.rotateY(yaw);
  lf.translate(x, y, z);
  k.add(lf, undefined, 'gloss');
}

/** Long pan handle along `angle` (radians in the ground plane) from `from` to `to` distance. */
function handle(k: Kit, angle: number, from: number, to: number, y: number, rise: number, radius: number, color: THREE.Color | ((t: number, out: THREE.Color) => void), finish: 'matte' | 'gloss'): void {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const pts: Vec[] = [0, 0.3, 0.65, 1].map((f) => {
    const d = from + (to - from) * f;
    return [dx * d, y + rise * f * f, dz * d];
  });
  const g = sweep(pts, radius, 9, 7, {
    up: [0, 1, 0], section: (phi) => [Math.cos(phi) * 0.62, Math.sin(phi)],
    color: typeof color === 'function' ? (t, _phi, out) => color(t, out) : undefined,
  });
  k.add(g, typeof color === 'function' ? undefined : color, finish);
}

// ------------------------------------------------------------------ sauce

export function sauce(k: Kit): void {
  const steel = C('#c6ced8'), steelDark = C('#7f8b99'), steelLight = C('#f1f4f7'), inner = C('#9ba6b3');
  const red = C('#c92b20'), redDark = C('#8e1710'), redLight = C('#e8533b');
  const potProf: [number, number][] = [[0, 0], [0.215, 0], [0.245, 0.01], [0.262, 0.04], [0.268, 0.12], [0.272, 0.215],
    [0.282, 0.245], [0.292, 0.258], [0.287, 0.269], [0.274, 0.266], [0.262, 0.25], [0.255, 0.2], [0.25, 0.16]];
  const tf = fractions(potProf);
  k.within(mat([-0.06, 0, 0.07]), () => {
    k.add(lathe(potProf, 28, {
      color: (_th, t, y, out) => {
        if (t > tf[9]) out.copy(inner);
        else if (t > tf[6]) out.copy(steelLight);
        else ramp(out, [[0, steelDark], [0.05, steelDark], [0.18, steel], [0.26, steelLight]], y);
      },
    }), undefined, 'gloss');

    const surf = lathe([[0.258, 0.214], [0.245, 0.222], [0.2, 0.226], [0.12, 0.229], [0, 0.231]], 28, {
      color: (_th, t, _y, out) => ramp(out, [[0, redDark], [0.14, red], [1, redLight]], t),
    });
    deform(surf, (p) => {
      p.y += 0.007 * noise3(p.x * 9, 0, p.z * 9, 4) * smooth(0.24, 0.18, Math.hypot(p.x, p.z));
    });
    k.add(surf, undefined, 'gloss');

    const rnd = rng(41);
    const chunkA = C('#e04634'), chunkB = C('#a8201a');
    for (let i = 0; i < 3; i++) {
      const a = 1.2 + i * 2 + rnd() * 0.5, rr = 0.09 + rnd() * 0.1;
      const d = dice(0.052, 0.036, 0.046, 0.011);
      d.rotateY(rnd() * 3).rotateX((rnd() - 0.5) * 0.6);
      d.translate(Math.cos(a) * rr, 0.232, Math.sin(a) * rr);
      k.add(d, i % 2 ? chunkA : chunkB, 'gloss');
    }
    // Simmering bubbles and flecks of herbs.
    const bubble = C('#e2503a'), herb = C('#3d7a2a');
    for (const [x, z, r] of [[0.13, 0.06, 0.026], [0.07, 0.15, 0.018], [-0.12, -0.13, 0.022], [0.16, -0.06, 0.016], [-0.15, 0.11, 0.017]] as const) {
      const b = lathe([[1, 0], [0.75, 0.6], [0, 1]], 9);
      b.scale(r, r * 0.55, r);
      b.translate(x, 0.226, z);
      k.add(b, bubble, 'gloss');
    }
    for (let i = 0; i < 7; i++) {
      const a = rnd() * TAU, rr = 0.05 + rnd() * 0.17;
      const f = ellipsoid(0.012, 0.004, 0.008, 4, 2);
      f.rotateY(rnd() * 3);
      f.translate(Math.cos(a) * rr, 0.231, Math.sin(a) * rr);
      k.add(f, herb, 'matte');
    }
    basil(k, -0.04, 0.236, 0.0, 0.5);
    basil(k, -0.02, 0.24, -0.01, 2.1, 0.13, 0.085);
    handle(k, -0.7, 0.2, 0.53, 0.225, 0.05, 0.031, C('#2e2a2a'), 'gloss');
  });
}

// ------------------------------------------------------------------ dough

export function dough(k: Kit): void {
  const wood = C('#d9a466'), woodLight = C('#e8bd83'), woodDark = C('#b07a43'), dust = C('#fbf8f0');
  const doughC = C('#f4dba6'), doughLight = C('#fdf0cf'), doughDark = C('#d2ab72');
  // A rounded-rectangle pastry board, turned a little, so it never reads as a plate.
  const bH = 0.055;
  const board = lathe([[0, 0], [0.95, 0], [1, 0.022], [1, bH - 0.014], [0.97, bH], [0.62, bH], [0, bH]], 32, {
    section: squircle(5, 0.43, 0.35),
    color: (_th, _t, y, out, r) => {
      if (y < bH - 0.001) out.copy(woodDark).lerp(wood, smooth(0, bH, y));
      else out.copy(wood).lerp(woodLight, r < 0.9 ? 0.6 : 0.1);
    },
  });
  board.rotateY(-0.1);
  k.add(board, undefined, 'matte');

  // Soft dusting of flour that fades into the wood at its edges.
  const patch = (rx: number, rz: number, x: number, z: number, seed: number) => {
    const g = lathe([[1, 0], [0.55, 0.003], [0, 0.0035]], 14, {
      radial: (th) => 1 + 0.28 * noise3(Math.cos(th) * 1.7, Math.sin(th) * 1.7, seed, 9),
      color: (_th, t, _y, out) => out.copy(dust).lerp(woodLight, smooth(0.45, 0, t)),
    });
    g.scale(rx, 1, rz);
    g.translate(x, bH + 0.001, z);
    k.add(g, undefined, 'matte');
  };
  patch(0.21, 0.16, 0.13, -0.15, 1);
  patch(0.14, 0.1, -0.27, 0.1, 2);
  patch(0.1, 0.08, 0.27, 0.13, 3);

  const cx = -0.05, cz = -0.06, lift = bH + 0.085;
  const crease = (x: number, z: number) => Math.exp(-(((x * 0.8 + z * 0.6 - 0.03) / 0.035) ** 2));
  const ball = ellipsoid(0.255, 0.17, 0.235, 22, 12);
  deform(ball, (p) => {
    const sag = smooth(0.05, -0.16, p.y);
    p.x *= 1 + 0.13 * sag;
    p.z *= 1 + 0.13 * sag;
    if (p.y < 0) p.y *= 0.55;
    p.multiplyScalar(1 + 0.035 * noise3(p.x * 5, p.y * 5, p.z * 5, 2));
    p.y -= 0.024 * crease(p.x, p.z) * smooth(0.04, 0.15, p.y);
  });
  ball.translate(cx, lift, cz);
  k.add(ball, (p, n, out) => {
    ramp(out, [[-1, doughDark], [0, doughC], [1, doughLight]], n.y);
    out.lerp(doughDark, 0.45 * crease(p.x - cx, p.z - cz) * smooth(lift + 0.06, lift + 0.12, p.y));
  }, 'matte');
  // Floury patches on the dough.
  const rnd = rng(7);
  for (let i = 0; i < 4; i++) {
    const a = 0.6 + i * 1.7 + rnd() * 0.5, r = 0.05 + rnd() * 0.09;
    const s = ellipsoid(0.03, 0.004, 0.022, 8, 3);
    s.rotateY(rnd() * 3);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = lift + 0.17 * Math.sqrt(Math.max(0, 1 - (r / 0.27) ** 2)) - 0.006;
    orient(s, [Math.cos(a) * r * 2.2, 1, Math.sin(a) * r * 2.2], [x, y, z]);
    k.add(s, dust, 'matte');
  }

  // Rolling pin in front.
  const pinWood = C('#eec189'), pinHandle = C('#c98f58');
  const pin = lathe([[0, -0.335], [0.03, -0.33], [0.034, -0.31], [0.019, -0.29], [0.019, -0.255], [0.045, -0.245], [0.05, -0.225],
    [0.05, 0.225], [0.045, 0.245], [0.019, 0.255], [0.019, 0.29], [0.034, 0.31], [0.03, 0.33], [0, 0.335]], 10, {
    color: (_th, _t, y, out) => out.copy(Math.abs(y) > 0.245 ? pinHandle : pinWood),
  });
  pin.rotateZ(Math.PI / 2);
  pin.rotateY(0.42);
  pin.translate(0.05, bH + 0.05, 0.2);
  k.add(pin, undefined, 'matte');
}

// ------------------------------------------------------------------ soffritto

export function soffritto(k: Kit): void {
  const pan = C('#3a3e47'), panRim = C('#6a6f7b'), panIn = C('#4a4e58');
  const panProf: [number, number][] = [[0, 0], [0.2, 0], [0.235, 0.008], [0.255, 0.03], [0.29, 0.082], [0.302, 0.096], [0.3, 0.106],
    [0.288, 0.104], [0.276, 0.094], [0.24, 0.042], [0.215, 0.03], [0, 0.03]];
  const tf = fractions(panProf);
  k.within(mat([-0.07, 0, 0.07]), () => {
    k.add(lathe(panProf, 26, {
      color: (_th, t, _y, out) => out.copy(t < tf[4] ? pan : t < tf[8] ? panRim : panIn),
    }), undefined, 'gloss');

    // A heap of diced carrot, onion and a little celery.
    const carrotA = C('#f7952f'), carrotB = C('#e9781f');
    const onionSkin = C('#8f3aa8'), onionFlesh = C('#dcbbe6'), celery = C('#93c25c');
    const rnd = rng(23);
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const r = 0.2 * Math.sqrt((i + 0.5) / 12), a = i * 2.39996;
      spots.push([Math.cos(a) * r, 0.03, Math.sin(a) * r]);
    }
    for (let i = 0; i < 4; i++) {
      const r = 0.09 * Math.sqrt((i + 0.5) / 4), a = i * 2.39996 + 1;
      spots.push([Math.cos(a) * r, 0.085, Math.sin(a) * r]);
    }
    spots.forEach(([x, y, z], i) => {
      const kind = i % 7 === 3 ? 'celery' : i % 2 ? 'onion' : 'carrot';
      const s = (kind === 'celery' ? 0.052 : 0.064) + rnd() * 0.012;
      const d = dice(s, s * 0.85, s, 0.012);
      const tilt = y > 0.05 ? 0.9 : 0.3;
      d.rotateX((rnd() - 0.5) * tilt).rotateZ((rnd() - 0.5) * tilt).rotateY(rnd() * TAU);
      d.translate(x, y + s * 0.42, z);
      // Onion pieces show their purple skin on whichever face ends up on top.
      const paintCube = kind === 'onion'
        ? (_p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => { out.copy(n.y > 0.6 ? onionSkin : onionFlesh); }
        : kind === 'celery' ? celery : (rnd() > 0.5 ? carrotA : carrotB);
      k.add(d, paintCube, 'gloss');
    });
    const wood = C('#8a5a36'), woodDark = C('#6a4126');
    handle(k, -0.65, 0.27, 0.56, 0.085, 0.07, 0.03, (t, out) => {
      out.copy(t < 0.12 ? panRim : wood).lerp(woodDark, smooth(0.6, 1, t));
    }, 'matte');
  });
}
