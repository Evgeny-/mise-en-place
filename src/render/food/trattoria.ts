import * as THREE from 'three';
import {
  C, Kit, alignX, deform, ellipsoid, fractions, lathe, leaf, lerp, mat, noise3, orient, paint, ramp, rng, smooth,
  sweep, type Vec,
} from './kit';
import { basil } from './preps';
import { greenLeafColor, pointyLeaf } from './produce';

/**
 * The Trattoria's second menu: bread, basil, mozzarella, rice, bacon, mascarpone and coffee; the
 * preps pesto (basil + cheese), gnocchi (potato + flour) and mascarpone cream (mascarpone + egg).
 * Same rules as produce.ts and preps.ts: base at y = 0, inside x, z ∈ [-0.45, 0.45], at most 0.85
 * tall, built for the game camera looking down at the counter. Their dishes are in trattoriaDishes.ts.
 */

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ bread

/** Radius of the loaf along its axis (x from -L to the cut at XC). */
const LOAF_L = 0.43, LOAF_R = 0.215, LOAF_CUT = 0.33;
const loafR = (x: number) => LOAF_R * Math.pow(Math.max(0, 1 - (x / LOAF_L) ** 2), 0.42);

/** A rustic loaf with three pale scores and a cut end showing the crumb. */
export function bread(k: Kit): void {
  const crustDark = C('#9a5521'), crust = C('#c97a2f'), crustLight = C('#e4a656'), crumb = C('#f6e3bb'), crumbEdge = C('#e9c88c');
  const flat = 0.78;
  const prof: [number, number][] = [[0, -LOAF_L]];
  for (let i = 1; i <= 12; i++) {
    const x = -LOAF_L + ((LOAF_CUT + LOAF_L) * i) / 12;
    prof.push([loafR(x), x]);
  }
  const rc = loafR(LOAF_CUT);
  prof.push([rc * 0.96, LOAF_CUT + 0.004], [rc * 0.5, LOAF_CUT + 0.006], [0, LOAF_CUT + 0.006]);
  const g = lathe(prof, 28, {
    section: (th) => [Math.cos(th) * flat, Math.sin(th)],
    color: (th, _t, y, out, r) => {
      if (y > LOAF_CUT + 0.003) {
        out.copy(crumb).lerp(crumbEdge, smooth(rc * 0.55, rc * 0.95, r));
        return;
      }
      // lathe axis is the loaf's length; cos(th) < 0 ends up on top once laid down
      const up = -Math.cos(th);
      ramp(out, [[-1, crustDark], [-0.2, crust], [0.6, crustLight], [1, crust]], up);
      out.multiplyScalar(0.9 + 0.12 * noise3(th * 2, y * 9, 0.5, 4));
    },
  });
  // lay it along +x, then flatten the bottom onto the counter
  g.rotateZ(-Math.PI / 2);
  deform(g, (p) => {
    const floor = -LOAF_R * flat * 0.62;
    if (p.y < floor) p.y = floor + (p.y - floor) * 0.25;
  });
  const top = (x: number, z: number) => {
    const r = loafR(x);
    return r * flat * Math.sqrt(Math.max(0, 1 - (z / r) ** 2));
  };
  k.within(mat([0.0, 0, 0.02], [0, 0.38, 0]), () => {
    k.add(g, undefined, 'matte');
    // Scores: the crust opened into pale ridges across the top.
    const ridge = C('#f2d39a'), ridgeEdge = C('#d99b4d');
    for (const x0 of [-0.24, -0.07, 0.1]) {
      const pts: Vec[] = [];
      for (let i = 0; i <= 4; i++) {
        const f = i / 4;
        const x = x0 - 0.05 + f * 0.1, z = -0.11 + f * 0.22;
        pts.push([x, top(x, z) - 0.006, z]);
      }
      k.add(sweep(pts, (t) => 0.024 * Math.sin(Math.PI * (0.15 + 0.7 * t)), 6, 6, {
        up: [0, 1, 0], section: (phi) => [Math.cos(phi), Math.sin(phi) * 0.45],
        color: (_t, phi, out) => out.copy(ridgeEdge).lerp(ridge, smooth(0, 0.8, Math.sin(phi))),
      }), undefined, 'matte');
    }
    // A dusting of flour.
    const dust = C('#f8f1e2');
    const rnd = rng(8);
    for (let i = 0; i < 6; i++) {
      const x = -0.3 + rnd() * 0.55, z = (rnd() - 0.5) * 0.22;
      const d = ellipsoid(0.03 + rnd() * 0.02, 0.004, 0.022, 7, 3);
      d.rotateY(rnd() * 3);
      d.translate(x, top(x, z) + 0.001, z);
      k.add(d, dust, 'matte');
    }
  });
}

// ------------------------------------------------------------------ basil

/** A bunch of basil: four stems tied with twine, glossy leaves in opposite pairs. */
export function basilBunch(k: Kit): void {
  const stemC = C('#4f8a30'), twine = C('#cfa86a');
  const leafColor = greenLeafColor(C('#1f7a2c'), C('#46ad3c'), C('#8fd468'));
  const base = new THREE.Vector3(-0.3, 0.035, 0.24);
  const tips: Vec[] = [[0.28, 0.09, -0.22], [0.04, 0.1, -0.3], [0.32, 0.07, 0.04], [0.16, 0.13, -0.06]];
  const UP = new THREE.Vector3(0, 1, 0);
  tips.forEach((tip, s) => {
    const T = new THREE.Vector3(...tip);
    const mid = base.clone().lerp(T, 0.5).add(new THREE.Vector3(0, 0.025, 0));
    k.add(sweep([base.toArray(), mid.toArray(), tip], (t) => lerp(0.016, 0.009, t), 6, 5), stemC, 'matte');
    const dir = T.clone().sub(base).normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    // opposite pairs along the stem, the top pair small and pointing on
    const pairs = s === 3 ? [0.55, 0.95] : [0.4, 0.72, 0.98];
    pairs.forEach((u, i) => {
      const at = base.clone().lerp(T, u).add(new THREE.Vector3(0, 0.02 * Math.sin(Math.PI * u), 0));
      const size = i === pairs.length - 1 ? 0.7 : 1;
      for (const sgn of i === pairs.length - 1 ? [0] : [-1, 1]) {
        const d = sgn === 0 ? dir.clone() : dir.clone().multiplyScalar(0.55).addScaledVector(side, sgn).normalize();
        d.y = 0.12;
        const lf = leaf(0.24 * size, 0.165 * size, {
          nu: 5, nv: 2, thickness: 0.012, fold: 0.03, width: pointyLeaf,
          lift: (v) => 0.03 * Math.sin(Math.PI * v) - 0.01 * v, color: leafColor,
        });
        alignX(lf, d.toArray(), at.toArray());
        k.add(lf, undefined, 'gloss');
      }
    });
  });
  // twine around the stems near their base
  const ring = lathe([[0.034, -0.012], [0.046, -0.012], [0.046, 0.012], [0.034, 0.012]], 10, { closed: true });
  const knot = base.clone().lerp(new THREE.Vector3(0.1, 0.08, -0.1), 0.18);
  orient(ring, [0.62, 0.05, -0.55], knot.toArray());
  k.add(ring, twine, 'matte');
  k.centerXZ();
}

// ------------------------------------------------------------------ mozzarella

const MOZZ = C('#fcfcf7'), MOZZ_SHADE = C('#dfe4dc'), MOZZ_INNER = C('#f3f1e6');

/** A mozzarella ball with a soft pinched top, a slice leaning on it, in a little blue dish of whey. */
export function mozzarella(k: Kit): void {
  const dishBlue = C('#5b8fcc'), dishIn = C('#eef3f6'), whey = C('#f4f6ee');
  const R = 0.4, H = 0.07;
  k.add(lathe([[0, 0.01], [R * 0.6, 0.01], [R * 0.64, 0], [R * 0.72, 0], [R * 0.9, H * 0.6], [R, H], [R * 0.97, H * 1.08],
    [R * 0.92, H * 0.95], [R * 0.75, H * 0.55], [0, H * 0.5]], 32, {
    color: (_th, _t, y, out, r) => out.copy(r > R * 0.93 || y < H * 0.4 ? dishBlue : dishIn),
  }), undefined, 'gloss');
  k.add(lathe([[R * 0.86, H * 0.78], [R * 0.5, H * 0.82], [0, H * 0.83]], 28), whey, 'gloss');
  const B = 0.24, BH = 0.4;
  const prof: [number, number][] = [[0, H * 0.6], [B * 0.55, H * 0.62], [B * 0.88, H * 0.6 + BH * 0.12], [B, H * 0.6 + BH * 0.35],
    [B * 0.94, H * 0.6 + BH * 0.62], [B * 0.66, H * 0.6 + BH * 0.86], [B * 0.32, H * 0.6 + BH * 0.95], [0.04, H * 0.6 + BH * 0.99], [0, H * 0.6 + BH]];
  k.within(mat([-0.06, 0, -0.05]), () => {
    const ball = lathe(prof, 30, {
      radial: (th, t) => 1 + 0.03 * Math.sin(3 * th + 0.4) * smooth(0.3, 0.8, t),
      color: (_th, t, _y, out) => out.copy(MOZZ_SHADE).lerp(MOZZ, smooth(0.05, 0.4, t)),
    });
    k.add(ball, undefined, 'gloss');
    // the pinched knot where the ball was closed
    const top = H * 0.6 + BH;
    k.add(sweep([[0, top - 0.03, 0], [0.012, top + 0.012, 0.004], [0.03, top + 0.03, 0.01]], (t) => lerp(0.032, 0.012, t), 5, 7, { twist: 1.2 }),
      MOZZ, 'gloss');
  });
  // a thick slice leaning against the ball, showing the softer inside
  const slice = lathe([[0, 0], [0.13, 0], [0.145, 0.012], [0.145, 0.04], [0.13, 0.052], [0, 0.052]], 24, {
    color: (_th, _t, y, out, r) => out.copy(r > 0.135 ? MOZZ_SHADE : y > 0.03 ? MOZZ_INNER : MOZZ),
  });
  orient(slice, [0.35, 0.45, 0.82], [0.17, H * 0.6 + 0.11, 0.17]);
  k.add(slice, undefined, 'gloss');
}

// ------------------------------------------------------------------ rice

/** A small wooden bowl heaped with risotto rice, a few grains spilled in front. */
export function rice(k: Kit): void {
  const wood = C('#9c6232'), woodLight = C('#c48a52'), woodDark = C('#704020');
  const grainC = C('#fffcf2'), grainShade = C('#ddd0ae'), heapC = C('#dccfac'), heapLight = C('#ebe2c8');
  const R = 0.36, H = 0.2;
  const prof: [number, number][] = [[0, 0.012], [R * 0.5, 0.012], [R * 0.55, 0], [R * 0.66, 0], [R * 0.84, H * 0.35], [R * 0.97, H * 0.8],
    [R, H], [R * 0.95, H * 1.02], [R * 0.9, H * 0.85]];
  const tf = fractions(prof);
  k.add(lathe(prof, 30, {
    color: (_th, t, y, out) => {
      if (t > tf[6]) out.copy(woodLight);
      else ramp(out, [[0, woodDark], [H * 0.5, wood], [H, woodLight]], y);
    },
  }), undefined, 'matte');
  const heap = lathe([[R * 0.9, H * 0.84], [R * 0.72, H * 1.18], [R * 0.45, H * 1.45], [R * 0.2, H * 1.56], [0, H * 1.58]], 28, {
    radial: (th) => 1 + 0.05 * noise3(Math.cos(th) * 2, Math.sin(th) * 2, 3, 5),
    color: (_th, t, _y, out) => out.copy(heapC).lerp(heapLight, smooth(0.2, 0.9, t)),
  });
  k.add(heap, undefined, 'matte');
  const height = (r: number) => H * 1.58 - (H * 0.74) * (r / (R * 0.9)) ** 2;
  const rnd = rng(14);
  const grain = (x: number, y: number, z: number, yaw: number, tilt: number) => {
    const g = ellipsoid(0.038, 0.016, 0.019, 6, 3);
    g.rotateZ(tilt).rotateY(yaw);
    g.translate(x, y, z);
    k.add(g, (_p, n, out) => out.copy(grainShade).lerp(grainC, smooth(-0.2, 0.7, n.y)), 'gloss');
  };
  for (let i = 0; i < 26; i++) {
    const r = R * 0.84 * Math.sqrt((i + 0.5) / 26), a = i * 2.39996 + rnd() * 0.4;
    grain(Math.cos(a) * r, height(r) + 0.004, Math.sin(a) * r, rnd() * TAU, (rnd() - 0.5) * 0.5);
  }
  for (let i = 0; i < 4; i++) grain(0.1 + i * 0.07 + rnd() * 0.03, 0.013, 0.36 + rnd() * 0.05, rnd() * TAU, 0);
}

// ------------------------------------------------------------------ bacon

const BACON_MEAT = C('#c94b45'), BACON_DEEP = C('#a8342f'), BACON_FAT = C('#f7dccf'), BACON_FAT_SHADE = C('#eab9a6');

/** Colour of a bacon strip across its width (u in -1..1): meat with a fat seam and fat edges. */
export function baconColor(u: number, out: THREE.Color): THREE.Color {
  const a = Math.abs(u);
  if (a > 0.82) return out.copy(BACON_FAT_SHADE).lerp(BACON_FAT, smooth(0.82, 0.95, a));
  if (Math.abs(u - 0.1) < 0.16) return out.copy(BACON_FAT);
  return out.copy(BACON_MEAT).lerp(BACON_DEEP, smooth(0.3, 0.75, a) * 0.6);
}

/** One wavy strip of bacon along `pts` (flat ribbon, width 2 * w). */
export function baconStrip(k: Kit, pts: Vec[], w = 0.075, finish: 'matte' | 'gloss' = 'gloss'): void {
  k.add(sweep(pts, w, 18, 12, {
    // with a fixed up the section's first axis is vertical: thin that way, wide across
    up: [0, 1, 0], caps: 'flat', section: (phi) => [Math.sin(phi) * 0.17, Math.cos(phi)],
    color: (_t, phi, out) => baconColor(Math.cos(phi), out),
  }), undefined, finish);
}

/** Three crisp wavy rashers, overlapping. */
export function bacon(k: Kit): void {
  const strip = (z: number, yaw: number, y0: number, phase: number) => {
    const pts: Vec[] = [];
    for (let i = 0; i <= 6; i++) {
      const f = i / 6, x = -0.36 + f * 0.72;
      pts.push([x, y0 + 0.022 + 0.022 * Math.sin(f * TAU * 1.5 + phase), z + 0.03 * Math.sin(f * 3 + phase)]);
    }
    k.within(mat([0, 0, 0], [0, yaw, 0]), () => baconStrip(k, pts));
  };
  strip(-0.16, 0.25, 0, 0);
  strip(0.0, 0.05, 0.02, 1.7);
  strip(0.16, -0.18, 0.042, 3.1);
}

// ------------------------------------------------------------------ mascarpone

/** A tub of mascarpone with a pale blue band, its lid leaning behind, a swirl of cream on top. */
export function mascarpone(k: Kit): void {
  const tub = C('#fbf8f1'), tubShade = C('#e3ddd0'), band = C('#5f9dd2'), creamC = C('#fffdf6'), creamShade = C('#eee6d2');
  const R = 0.3, H = 0.25;
  const wall = (y: number): [number, number] => [R * (0.93 + 0.07 * (y / (H * 0.92))), y];
  const prof: [number, number][] = [[0, 0], [R * 0.88, 0], wall(0.01), wall(H * 0.24), wall(H * 0.26), wall(H * 0.69), wall(H * 0.71),
    wall(H * 0.92), [R * 1.04, H], [R * 1.0, H * 1.04], [R * 0.94, H * 0.98], [R * 0.9, H * 0.8]];
  const tf = fractions(prof);
  k.within(mat([0.04, 0, 0.06]), () => {
    k.add(lathe(prof, 32, {
      color: (_th, t, y, out) => {
        if (t > tf[8]) out.copy(tubShade);
        else if (y > H * 0.25 && y < H * 0.7) out.copy(band);
        else out.copy(tubShade).lerp(tub, smooth(0, H * 0.4, y));
      },
    }), undefined, 'gloss');
    const top = lathe([[R * 0.93, H * 0.86], [R * 0.7, H * 0.95], [R * 0.3, H * 1.02], [0, H * 1.05]], 30, {
      color: (_th, t, _y, out) => out.copy(creamShade).lerp(creamC, smooth(0, 0.5, t)),
    });
    k.add(top, undefined, 'gloss');
    // the spoon's swirl through the cream
    const swirl: Vec[] = [];
    for (let i = 0; i <= 16; i++) {
      const f = i / 16, a = f * TAU * 1.6, r = 0.2 * (1 - f) + 0.02;
      swirl.push([Math.cos(a) * r, H * 1.0 + 0.04 * (1 - r / 0.22), Math.sin(a) * r]);
    }
    k.add(sweep(swirl, (t) => lerp(0.03, 0.016, t), 26, 6), (_p, n, out) => out.copy(creamShade).lerp(creamC, smooth(-0.2, 0.8, n.y)), 'gloss');
  });
  // a little wooden spoon resting on the rim
  const spoonWood = C('#d9a86c');
  k.add(sweep([[0.02, H * 1.06, 0.1], [0.2, H * 1.12, 0.0], [0.42, H * 1.2, -0.12]], 0.018, 6, 6), spoonWood, 'matte');
  const bowlOfSpoon = ellipsoid(0.07, 0.022, 0.05, 10, 5);
  bowlOfSpoon.rotateY(0.5);
  bowlOfSpoon.translate(0.04, H * 1.06, 0.12);
  k.add(bowlOfSpoon, spoonWood, 'matte');
}

// ------------------------------------------------------------------ coffee

/** An espresso on its saucer, with coffee beans beside the cup. */
export function coffee(k: Kit): void {
  const china = C('#fbf8f2'), chinaShade = C('#ddd6ca'), espresso = C('#3b2114'), crema = C('#b37a45'), cremaLight = C('#d9a46a');
  const bean = C('#5a3220'), beanLight = C('#7a4a2e'), seam = C('#2c160c');
  const SR = 0.42;
  k.add(lathe([[0, 0.006], [SR * 0.5, 0.006], [SR * 0.54, 0], [SR * 0.62, 0], [SR * 0.9, 0.032], [SR, 0.05], [SR * 0.97, 0.058],
    [SR * 0.88, 0.044], [SR * 0.6, 0.03], [0, 0.03]], 34, {
    color: (_th, _t, y, out) => out.copy(chinaShade).lerp(china, smooth(0, 0.04, y)),
  }), undefined, 'gloss');
  const R = 0.18, H = 0.24, y0 = 0.03;
  const prof: [number, number][] = [[0, y0], [R * 0.55, y0], [R * 0.62, y0 + 0.02], [R * 0.86, y0 + H * 0.4], [R, y0 + H * 0.9], [R * 1.02, y0 + H],
    [R * 0.96, y0 + H * 1.01], [R * 0.9, y0 + H * 0.9], [R * 0.84, y0 + H * 0.82]];
  const tf = fractions(prof);
  k.within(mat([-0.04, 0, -0.03]), () => {
    k.add(lathe(prof, 30, {
      color: (_th, t, y, out) => {
        if (t > tf[6]) out.copy(chinaShade);
        else out.copy(chinaShade).lerp(china, smooth(y0, y0 + H * 0.5, y));
      },
    }), undefined, 'gloss');
    k.add(lathe([[R * 0.86, y0 + H * 0.84], [R * 0.6, y0 + H * 0.85], [0, y0 + H * 0.86]], 28, {
      color: (_th, _t, _y, out, r) => {
        out.copy(espresso).lerp(crema, smooth(R * 0.66, R * 0.84, r) * 0.85).lerp(cremaLight, 0.25 * Math.exp(-(((r - R * 0.3) / 0.03) ** 2)));
      },
    }), undefined, 'gloss');
    // handle on the right
    const hp: Vec[] = [[R * 0.92, y0 + H * 0.78, 0], [R + 0.07, y0 + H * 0.82, 0], [R + 0.1, y0 + H * 0.55, 0], [R + 0.05, y0 + H * 0.3, 0], [R * 0.9, y0 + H * 0.3, 0]];
    const handle = sweep(hp, 0.018, 10, 6);
    handle.rotateY(-0.5);
    k.add(handle, china, 'gloss');
  });
  // three coffee beans in front
  for (const [x, z, a] of [[0.17, 0.28, 0.6], [0.27, 0.17, 2.0], [0.06, 0.33, 3.0]] as const) {
    const b = ellipsoid(0.05, 0.026, 0.036, 10, 5);
    b.rotateY(a);
    b.translate(x, 0.05 + 0.02, z);
    k.add(b, (p, n, out) => {
      out.copy(bean).lerp(beanLight, smooth(0, 1, n.y) * 0.5);
      const local = new THREE.Vector3(p.x - x, 0, p.z - z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      if (n.y > 0.5 && Math.abs(local.z) < 0.006) out.copy(seam);
    }, 'gloss');
  }
}

// ------------------------------------------------------------------ pesto

/** A marble mortar of bright pesto with a wooden pestle and a basil leaf. */
export function pesto(k: Kit): void {
  const marble = C('#e4e1da'), marbleShade = C('#b9b4aa'), vein = C('#9d978c');
  const green = C('#4f9a2c'), greenLight = C('#7cc244'), greenDark = C('#2f7020'), nut = C('#f1e2b8');
  const R = 0.33, H = 0.27;
  const prof: [number, number][] = [[0, 0], [R * 0.7, 0], [R * 0.8, 0.012], [R * 0.82, 0.04], [R * 0.9, H * 0.45], [R, H * 0.9], [R * 0.99, H],
    [R * 0.9, H * 1.01], [R * 0.8, H * 0.9], [R * 0.6, H * 0.6]];
  const tf = fractions(prof);
  k.within(mat([-0.03, 0, 0.04]), () => {
    k.add(lathe(prof, 32, {
      color: (th, t, y, out) => {
        out.copy(marbleShade).lerp(marble, t > tf[6] ? 0.7 : smooth(0, H, y));
        const v = Math.abs(noise3(Math.cos(th) * 3, y * 6, Math.sin(th) * 3, 21));
        out.lerp(vein, smooth(0.06, 0, v) * 0.5);
      },
    }), undefined, 'gloss');
    const surf = lathe([[R * 0.86, H * 0.84], [R * 0.6, H * 0.88], [R * 0.3, H * 0.9], [0, H * 0.91]], 30, {
      color: (_th, t, _y, out) => ramp(out, [[0, greenDark], [0.3, green], [1, greenLight]], t),
    });
    deform(surf, (p) => {
      p.y += 0.008 * noise3(p.x * 10, 0, p.z * 10, 7);
    });
    k.add(surf, undefined, 'gloss');
    const rnd = rng(5);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, r = 0.04 + rnd() * 0.17;
      const p = ellipsoid(0.02, 0.008, 0.012, 6, 3);
      p.rotateY(rnd() * 3);
      p.translate(Math.cos(a) * r, H * 0.91 + 0.004, Math.sin(a) * r);
      k.add(p, nut, 'matte');
    }
    basil(k, 0.06, H * 0.92, -0.06, 2.4, 0.15, 0.1);
  });
  // the pestle, resting in the pesto and on the rim
  const wood = C('#d6a66c'), woodDark = C('#a8763f');
  const pestle = lathe([[0, 0], [0.05, 0.004], [0.062, 0.03], [0.06, 0.08], [0.042, 0.2], [0.036, 0.36], [0.04, 0.4], [0.03, 0.42], [0, 0.425]], 14, {
    color: (_th, _t, y, out) => out.copy(woodDark).lerp(wood, smooth(0, 0.12, y)),
  });
  orient(pestle, [0.62, 0.62, -0.25], [-0.12, 0.17, 0.02]);
  k.add(pestle, undefined, 'matte');
}

// ------------------------------------------------------------------ gnocchi dough

const GNOCCHI = C('#efc25a'), GNOCCHI_LIGHT = C('#fde3a0'), GNOCCHI_GROOVE = C('#a26c24'), FLOUR = C('#fdfaf2');

/**
 * One gnocco: a plump pillow lying along x (base at y = 0) with fork ridges across its back,
 * built around its long axis so the ridges have vertices to sit on.
 */
export function gnocchoPiece(s = 1, seg = 9): THREE.BufferGeometry {
  const L = 0.078 * s, R = 0.056 * s;
  const prof: [number, number][] = [[0, -L]];
  for (let i = 1; i < 11; i++) {
    const x = -L + (2 * L * i) / 11;
    const env = Math.pow(Math.max(0, 1 - (x / L) ** 2), 0.4);
    prof.push([R * env * (1 - 0.14 * Math.max(0, Math.cos((x / L) * 4.5 * Math.PI))), x]);
  }
  prof.push([0, L]);
  const g = lathe(prof, seg, { section: (th) => [Math.cos(th), Math.sin(th) * 1.15] });
  g.rotateZ(-Math.PI / 2);
  deform(g, (p) => {
    if (p.y < 0) p.y *= 0.45;
    // a soft thumb dent on the back
    p.y -= 0.008 * s * Math.exp(-((p.x / (0.035 * s)) ** 2)) * smooth(0, R * 0.5, p.y);
  });
  g.translate(0, R * 0.45, 0);
  return g;
}

/** Gnocco colours: pale gold, darker in the fork grooves, a little flour on top. */
export function gnocchoPaint(p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color, s = 1): void {
  out.copy(GNOCCHI).lerp(GNOCCHI_LIGHT, smooth(0.1, 1, n.y) * 0.55);
  const lx = p.x / (0.078 * s);
  out.lerp(GNOCCHI_GROOVE, smooth(0.55, 0.95, Math.cos(lx * 4.5 * Math.PI)) * smooth(0.2, 0.8, n.y) * 0.75);
  out.lerp(FLOUR, smooth(0.55, 0.85, noise3(p.x * 40, p.y * 40, p.z * 40, 3)) * smooth(0.6, 1, n.y) * 0.6);
}

/** A heap of fresh ridged gnocchi on a floured board. */
export function gnocchiDough(k: Kit): void {
  const wood = C('#c98a4c'), woodLight = C('#d9a466'), woodDark = C('#9a6232'), dust = C('#fbf8f0');
  const bH = 0.05;
  const board = lathe([[0, 0], [0.95, 0], [1, 0.02], [1, bH - 0.014], [0.97, bH], [0, bH]], 24, {
    color: (_th, _t, y, out, r) => {
      if (y < bH - 0.001) out.copy(woodDark).lerp(wood, smooth(0, bH, y));
      else out.copy(wood).lerp(woodLight, r < 0.9 ? 0.6 : 0.1);
    },
  });
  board.scale(0.44, 1, 0.42);
  k.add(board, undefined, 'matte');
  // a wide drift of flour under the heap
  const patch = lathe([[1, 0], [0.6, 0.003], [0, 0.004]], 12, {
    radial: (th) => 1 + 0.25 * noise3(Math.cos(th) * 1.7, Math.sin(th) * 1.7, 4, 9),
    color: (_th, t, _y, out) => out.copy(dust).lerp(woodLight, smooth(0.35, 0, t)),
  });
  patch.scale(0.3, 1, 0.24);
  patch.translate(0, bH + 0.001, 0.01);
  k.add(patch, undefined, 'matte');
  const s = 1.25;
  const spots: [number, number, number, number][] = [
    [-0.2, 0, -0.12, 0.3], [0.0, 0, -0.17, -0.2], [0.2, 0, -0.1, 0.4], [-0.16, 0, 0.12, -0.3], [0.06, 0, 0.1, 0.15], [0.24, 0, 0.14, -0.5],
    [-0.05, 0.075, -0.03, 0.9],
  ];
  for (const [x, lift, z, yaw] of spots) {
    // painted along its own axis first, then turned and placed
    const g = paint(gnocchoPiece(s), (p, n, out) => gnocchoPaint(p, n, out, s));
    if (lift) g.rotateX(0.2);
    g.rotateY(yaw);
    g.translate(x, bH + 0.002 + lift, z);
    k.add(g, undefined, 'matte');
  }
}

// ------------------------------------------------------------------ mascarpone cream

/** A mixing bowl of whipped mascarpone cream in soft peaks, a whisk resting on the rim. */
export function cream(k: Kit): void {
  const bowl = C('#f1b8a4'), bowlDark = C('#d58f79'), inside = C('#fbf3ec');
  const creamC = C('#fbefcc'), creamLight = C('#fffaea'), creamShade = C('#ecd9a8');
  const R = 0.36, H = 0.22;
  const prof: [number, number][] = [[0, 0.01], [R * 0.45, 0.01], [R * 0.5, 0], [R * 0.6, 0], [R * 0.82, H * 0.35], [R * 0.97, H * 0.85],
    [R, H], [R * 0.95, H * 1.01], [R * 0.9, H * 0.86]];
  const tf = fractions(prof);
  k.add(lathe(prof, 32, {
    color: (_th, t, y, out) => {
      if (t > tf[6]) out.copy(inside);
      else out.copy(bowlDark).lerp(bowl, smooth(0, H * 0.6, y));
    },
  }), undefined, 'gloss');
  // a cloud of peaks: a mound whose top is pulled into little curls
  const mound = lathe([[R * 0.9, H * 0.86], [R * 0.75, H * 1.22], [R * 0.5, H * 1.5], [R * 0.25, H * 1.66], [0, H * 1.72]], 28, {
    radial: (th, t) => 1 + 0.1 * Math.sin(5 * th + t * 4) * smooth(0.2, 0.7, t),
    color: (_th, t, _y, out) => ramp(out, [[0, creamShade], [0.35, creamC], [1, creamLight]], t),
  });
  deform(mound, (p) => {
    const a = Math.atan2(p.z, p.x);
    p.y += 0.025 * Math.max(0, Math.sin(6 * a)) * smooth(0.18, 0.05, Math.hypot(p.x, p.z));
  });
  k.add(mound, undefined, 'gloss');
  const peak = sweep([[0.01, H * 1.66, 0], [0.0, H * 1.84, 0.01], [-0.04, H * 1.92, 0.03]], (t) => lerp(0.05, 0.008, t), 6, 8);
  k.add(peak, (_p, n, out) => out.copy(creamC).lerp(creamLight, smooth(0, 1, n.y) * 0.6), 'gloss');
  // the whisk: four wire loops and a handle, leaning out to the right
  const steel = C('#c9d1da'), steelDark = C('#8d98a6'), handleC = C('#e9c48a');
  k.within(mat([0.02, H * 1.95, 0.04], [0.25, 0, -1.05]), () => {
    for (let i = 0; i < 4; i++) {
      // a teardrop loop through the handle's axis: narrow at the handle, round at the bottom
      const a = (i / 4) * Math.PI;
      const pts: Vec[] = [];
      for (let j = 0; j < 12; j++) {
        const phi = (j / 12) * TAU, down = (1 - Math.cos(phi)) / 2;
        const u = 0.085 * Math.sin(phi) * (0.35 + 0.65 * down);
        pts.push([Math.cos(a) * u, 0.1 - 0.3 * down, Math.sin(a) * u]);
      }
      k.add(sweep(pts, 0.007, 16, 4, { closed: true, caps: 'none' }), (_p, n, out) => out.copy(steelDark).lerp(steel, smooth(-0.5, 0.8, n.y)), 'gloss');
    }
    k.add(lathe([[0, 0.1], [0.022, 0.11], [0.03, 0.18], [0.032, 0.3], [0.024, 0.34], [0, 0.345]], 10), handleC, 'gloss');
  });
}
