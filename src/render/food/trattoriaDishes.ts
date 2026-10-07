import * as THREE from 'three';
import {
  C, Kit, deform, dice, ellipsoid, fractions, lathe, lerp, loft, mat, noise3, orient, paint, ramp, rng, smooth, squircle, sweep, type Vec,
} from './kit';
import { plate } from './dishes';
import { basil } from './preps';
import { baconColor, gnocchoPaint, gnocchoPiece } from './trattoria';

/**
 * The Trattoria's second-menu dishes: bruschetta, caprese, risotto, pasta al pesto, carbonara,
 * gnocchi, calzone and tiramisu. Same rules as dishes.ts: base at y = 0, inside x, z ∈ [-0.8, 0.8],
 * at most 1.0 tall. Each one is told apart at ticket size by its silhouette and its main colours:
 * toasts on a long board, a red and white ring, a cream mound with mushrooms, green spirals, a
 * golden nest with a yolk, pillows in red sauce, a half-moon pocket, a layered square.
 */

const TAU = Math.PI * 2;

const TOMATO_RED = C('#df3a2c'), TOMATO_LIGHT = C('#f4634a'), TOMATO_DEEP = C('#b4241b');
const PARM = C('#fbf0c8');

function parmesan(k: Kit, rnd: () => number, n: number, x0: number, z0: number, r: number, y: (x: number, z: number) => number): void {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = r * Math.sqrt(rnd());
    const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
    const f = dice(0.036, 0.012, 0.026, 0.005);
    f.rotateY(rnd() * 3);
    f.translate(x, y(x, z) + 0.006, z);
    k.add(f, PARM, 'matte');
  }
}

/** A tomato cut into a little cube. */
function tomatoDice(k: Kit, x: number, y: number, z: number, s: number, rnd: () => number): void {
  const d = dice(s, s * 0.8, s, s * 0.22);
  d.rotateX((rnd() - 0.5) * 0.5).rotateZ((rnd() - 0.5) * 0.5).rotateY(rnd() * TAU);
  d.translate(x, y + s * 0.36, z);
  k.add(d, (_p, n, out) => out.copy(TOMATO_RED).lerp(n.y > 0.7 ? TOMATO_LIGHT : TOMATO_DEEP, 0.5), 'gloss');
}

// ------------------------------------------------------------------ bruschetta

/** Three toasted slices of bread heaped with diced tomato and basil, on a long board. */
export function bruschetta(k: Kit): void {
  const wood = C('#c8894c'), woodLight = C('#dca46a'), woodDark = C('#8f5629');
  const bH = 0.05;
  const brd = lathe([[0, 0], [0.96, 0], [1, 0.02], [1, bH - 0.014], [0.97, bH], [0.6, bH], [0, bH]], 32, {
    section: squircle(5, 0.74, 0.52),
    color: (_th, _t, y, out, r) => {
      if (y < bH - 0.001) out.copy(woodDark).lerp(wood, smooth(0, bH, y));
      else out.copy(r > 0.55 && r < 0.75 ? wood : woodLight).lerp(wood, r > 0.92 ? 0.6 : 0);
    },
  });
  brd.rotateY(-0.12);
  k.add(brd, undefined, 'matte');
  const crust = C('#8a4614'), toast = C('#dd9a44'), toastDark = C('#b06a28'), crumb = C('#f5dca2'), grill = C('#6e3610');
  const rnd = rng(31);
  const slices: [number, number, number][] = [[-0.33, 0.17, 0.3], [0.33, 0.15, -0.25], [0.0, -0.2, 0.08]];
  for (const [x, z, yaw] of slices) {
    const T = 0.1, y0 = bH;
    const ax = 0.33, az = 0.19;
    const slice = lathe([[0, 0], [0.9, 0], [1, 0.025], [1.03, T * 0.55], [0.99, T * 0.9], [0.94, T], [0.8, T + 0.004], [0.62, T + 0.007],
      [0.44, T + 0.008], [0.26, T + 0.009], [0, T + 0.01]], 30, {
      section: (th) => [Math.cos(th) * ax, Math.sin(th) * az],
      color: (th, _t, y, out, r) => {
        if (y < T * 0.88 || r > 0.95) {
          out.copy(crust).lerp(toastDark, smooth(0, T, y) * 0.6);
          return;
        }
        // toasted face: golden, browner towards the crust, with grill stripes across it
        const px = Math.cos(th) * r * ax, pz = Math.sin(th) * r * az;
        out.copy(crumb).lerp(toast, smooth(0.3, 0.92, r));
        out.lerp(toastDark, smooth(0.35, 0.7, noise3(px * 30, 0, pz * 30, x * 7)) * 0.35);
        out.lerp(grill, smooth(0.5, 0.92, Math.cos((px * 0.8 + pz) * 30)) * 0.75 * smooth(0.97, 0.75, r));
      },
    });
    slice.rotateY(yaw);
    slice.translate(x, y0, z);
    k.add(slice, undefined, 'matte');
    const top = y0 + T + 0.006;
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996 + rnd(), r = 0.19 * Math.sqrt((i + 0.5) / 9);
      const dx = Math.cos(a) * r * 1.15, dz = Math.sin(a) * r * 0.8;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      tomatoDice(k, x + dx * c + dz * sn, top + (i > 5 ? 0.04 : 0), z - dx * sn + dz * c, 0.085, rnd);
    }
    basil(k, x - 0.02, top + 0.075, z + 0.01, yaw + 2.1 + rnd(), 0.17, 0.115);
  }
}

// ------------------------------------------------------------------ caprese

const MOZZ = C('#fdfcf6'), MOZZ_RIM = C('#e9ebe2');

/** A plate glazed all over in one colour (white food reads on it). Returns the height of its well. */
function colouredPlate(k: Kit, R: number, glaze: THREE.Color, light: THREE.Color): number {
  const well = 0.036;
  const prof: [number, number][] = [
    [0, 0.012], [R * 0.53, 0.012], [R * 0.56, 0], [R * 0.62, 0.014], [R * 0.86, 0.034], [R * 0.97, 0.058],
    [R, 0.07], [R * 0.985, 0.08], [R * 0.94, 0.077], [R * 0.925, 0.075], [R * 0.8, 0.054], [R * 0.64, well], [0, well],
  ];
  const tf = fractions(prof);
  k.add(lathe(prof, 30, {
    color: (_th, t, _y, out, r) => out.copy(glaze).lerp(light, t > tf[6] ? smooth(R * 0.9, R * 0.5, r) * 0.6 : 0),
  }), undefined, 'gloss');
  return well;
}

/** Slices of mozzarella and tomato overlapping in a ring, basil tucked between them. */
export function caprese(k: Kit): void {
  const well = colouredPlate(k, 0.77, C('#3f7f52'), C('#5d9e6c'));
  const N = 10, ring = 0.43, S = 0.165;
  const mozzSlice = () => lathe([[0, 0], [S - 0.012, 0], [S, 0.012], [S, 0.034], [S - 0.012, 0.046], [0, 0.046]], 20, {
    color: (_th, _t, y, out, r) => out.copy(r > S - 0.008 ? MOZZ_RIM : y > 0.04 ? MOZZ : MOZZ_RIM.clone().lerp(MOZZ, 0.6)),
  });
  const skin = C('#c92a20'), flesh = C('#ec4a37'), gel = C('#ff8f6a'), seed = C('#ffe9a8');
  const tomSlice = () => lathe([[0, 0], [S - 0.012, 0], [S, 0.012], [S, 0.03], [S - 0.01, 0.04], [S * 0.75, 0.041], [S * 0.4, 0.042], [0, 0.042]], 20, {
    color: (th, _t, y, out, r) => {
      if (y < 0.035 || r > S - 0.012) out.copy(skin);
      else {
        // four seed chambers inside the wall
        const ch = Math.pow(Math.max(0, Math.cos(2 * th)), 0.5) * smooth(S * 0.15, S * 0.4, r) * smooth(S * 0.85, S * 0.65, r);
        out.copy(flesh).lerp(gel, ch * 0.8);
      }
    },
  });
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + 0.2;
    const isTomato = i % 2 === 1;
    const g = isTomato ? tomSlice() : mozzSlice();
    // each slice rests on the one before it, like shingles
    const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const dir = new THREE.Vector3(0, 1, 0).addScaledVector(tan, -0.32).normalize();
    orient(g, dir.toArray(), [Math.cos(a) * ring, well + 0.012 + (isTomato ? 0.022 : 0.006), Math.sin(a) * ring], a);
    k.add(g, undefined, 'gloss');
    if (isTomato) {
      for (let j = 0; j < 2; j++) {
        const b = a + (j ? 0.12 : -0.12);
        const sd = ellipsoid(0.014, 0.006, 0.009, 6, 3);
        sd.rotateY(-b);
        sd.translate(Math.cos(b) * (ring - 0.01), well + 0.08, Math.sin(b) * (ring - 0.01));
        k.add(sd, seed, 'matte');
      }
    }
    if (i % 2) basil(k, Math.cos(a + 0.32) * (ring + 0.02), well + 0.09, Math.sin(a + 0.32) * (ring + 0.02), -a + 1.1, 0.14, 0.09);
  }
  // a sprig in the middle and a drizzle of olive oil
  for (const yaw of [0.3, 2.4, 4.4]) basil(k, 0, well + 0.03, 0, yaw, 0.16, 0.11);
  const oil = C('#c7b23a');
  for (const [x, z] of [[0.13, 0.06], [-0.1, 0.12], [-0.05, -0.14]] as const) {
    const d = ellipsoid(0.03, 0.004, 0.022, 8, 3);
    d.translate(x, well + 0.004, z);
    k.add(d, oil, 'gloss');
  }
}

// ------------------------------------------------------------------ risotto

/** Creamy ivory risotto in a wide shallow bowl, every grain showing, mushroom slices and parsley. */
export function risotto(k: Kit): void {
  const R = 0.74, H = 0.17;
  // dark blue stoneware, so the ivory rice stands out
  const stone = C('#3f566e'), stoneLight = C('#58718b'), rimC = C('#e9e1d2');
  const prof: [number, number][] = [[0, 0.012], [R * 0.42, 0.012], [R * 0.45, 0], [R * 0.52, 0], [R * 0.58, 0.03], [R * 0.8, H * 0.5],
    [R * 0.95, H * 0.9], [R, H], [R * 0.98, H * 1.06], [R * 0.93, H * 1.02], [R * 0.84, H * 0.8], [R * 0.6, H * 0.35], [0, H * 0.3]];
  const tf = fractions(prof);
  k.add(lathe(prof, 32, {
    color: (_th, t, y, out) => {
      if (t > tf[7] && t < tf[9]) out.copy(rimC);
      else out.copy(stone).lerp(stoneLight, smooth(0, H, y) * 0.6);
    },
  }), undefined, 'gloss');
  const ivory = C('#f3e1ad'), ivoryLight = C('#fdf3d6'), ivoryShade = C('#d9bd7c');
  const base = H * 0.32, top = base + 0.2;
  const mound = lathe([[R * 0.84, H * 0.8], [R * 0.72, base + 0.1], [R * 0.5, base + 0.16], [R * 0.25, top - 0.01], [0, top]], 32, {
    radial: (th) => 1 + 0.03 * noise3(Math.cos(th) * 2.5, Math.sin(th) * 2.5, 1, 9),
    color: (_th, t, _y, out) => ramp(out, [[0, ivoryShade], [0.3, ivory], [1, ivoryLight]], t),
  });
  k.add(mound, undefined, 'gloss');
  const yAt = (x: number, z: number) => {
    const r = Math.hypot(x, z) / (R * 0.84);
    return top - (top - H * 0.8) * Math.min(1, r) ** 1.6;
  };
  // the grains: plump, glossy, a pale shadow underneath each so they read one by one
  const rnd = rng(19);
  const grainC = C('#fffdf4'), grainShade = C('#e2cfa0');
  for (let i = 0; i < 40; i++) {
    const r = 0.52 * Math.sqrt((i + 0.5) / 40), a = i * 2.39996 + rnd() * 0.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = ellipsoid(0.044, 0.019, 0.022, 6, 3);
    g.rotateZ((rnd() - 0.5) * 0.4).rotateY(rnd() * TAU);
    g.translate(x, yAt(x, z) + 0.006, z);
    k.add(g, (_p, n, out) => out.copy(grainShade).lerp(grainC, smooth(-0.3, 0.7, n.y)), 'gloss');
  }
  // mushroom slices: cap-and-stem profile, brown rim, creamy inside
  const capShape = new THREE.Shape();
  capShape.moveTo(-0.032, 0);
  capShape.lineTo(0.032, 0);
  capShape.lineTo(0.03, 0.055);
  capShape.quadraticCurveTo(0.096, 0.055, 0.1, 0.088);
  capShape.quadraticCurveTo(0.09, 0.16, 0, 0.165);
  capShape.quadraticCurveTo(-0.09, 0.16, -0.1, 0.088);
  capShape.quadraticCurveTo(-0.096, 0.055, -0.03, 0.055);
  capShape.lineTo(-0.032, 0);
  const inside = C('#f0dfbf'), rim = C('#6e3f22');
  for (const [x, z, yaw] of [[-0.22, -0.06, 0.5], [0.1, -0.2, -0.4], [0.24, 0.1, 1.4], [-0.08, 0.22, 2.6], [0.02, 0.0, 3.6]] as const) {
    const g = new THREE.ExtrudeGeometry(capShape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, -0.08, 0);
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    const up = new THREE.Vector3(x * 0.6, 1, z * 0.6).normalize();
    orient(g, up.toArray(), [x, yAt(x, z) + 0.014, z], yaw);
    k.add(g, (_p, n, out) => out.copy(n.dot(up) > 0.85 ? inside : rim), 'matte');
  }
  parmesan(k, rnd, 4, 0, 0, 0.18, (x, z) => yAt(x, z) + 0.008);
  // a sprinkle of chopped parsley
  const parsley = C('#2f9a35'), parsleyLight = C('#5cc04a');
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU, r = 0.4 * Math.sqrt(rnd());
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const f = ellipsoid(0.018, 0.005, 0.013, 5, 2);
    f.rotateY(rnd() * 3);
    f.translate(x, yAt(x, z) + 0.014, z);
    k.add(f, i % 3 ? parsley : parsleyLight, 'matte');
  }
}

// ------------------------------------------------------------------ pasta al pesto

const PESTO = C('#4f9a2a'), PESTO_LIGHT = C('#8cc84c'), PESTO_DARK = C('#2f6e1c'), PASTA_CREAM = C('#f3dc96');

/**
 * Twirled nest of spaghetti (three strands coiled up into a mound) at a plate's well, coloured by
 * `paint` (position, normal, height fraction 0 at the well .. 1 at the top). Returns the mound
 * height at a radius.
 */
export function pastaNest(k: Kit, well: number, seed: number, paint: (p: THREE.Vector3, n: THREE.Vector3, h: number, out: THREE.Color) => void,
  o: { R0?: number; Hm?: number; steps?: number; radius?: number; finish?: 'matte' | 'gloss' } = {}): (rho: number) => number {
  const R0 = o.R0 ?? 0.43, Hm = o.Hm ?? 0.3;
  const mound = (rho: number) => well + 0.02 + Hm * Math.sqrt(Math.max(0, 1 - (rho / (R0 * 1.1)) ** 2));
  const rnd = rng(seed);
  for (let s = 0; s < 3; s++) {
    const pts: Vec[] = [];
    const M = 50, turns = 3.4 + s * 0.45;
    const tiltA = rnd() * TAU, tiltK = 0.07 + rnd() * 0.06;
    for (let i = 0; i <= M; i++) {
      const f = i / M;
      const th = (s * TAU) / 3 + f * turns * TAU;
      const tuck = smooth(0, 0.07, f);
      const rho = ((R0 - s * 0.035) * Math.pow(1 - f, 0.72) + 0.035 + 0.025 * Math.sin(th * 2 + s)) * (0.9 + 0.1 * tuck);
      const y = lerp(well + 0.03, mound(rho) + tiltK * rho * Math.cos(th - tiltA) + 0.014 * Math.sin(f * 31 + s * 2), tuck);
      pts.push([Math.cos(th) * rho, y, Math.sin(th) * rho]);
    }
    k.add(sweep(pts, o.radius ?? 0.028, o.steps ?? 74, 4), (p, n, out) => paint(p, n, smooth(well, well + Hm, p.y), out), o.finish ?? 'matte');
  }
  return mound;
}

/** Spaghetti tossed in bright basil pesto, piled high, with basil, pine nuts and parmesan. */
export function pestoPasta(k: Kit): void {
  const well = plate(k, 0.74, C('#d9824a'), 30);
  const mound = pastaNest(k, well, 29, (p, n, h, out) => {
    // pesto clings to the strands; the pasta shows through underneath and in the gaps
    out.copy(PESTO_DARK).lerp(PESTO, smooth(-0.6, 0.3, n.y)).lerp(PESTO_LIGHT, smooth(0.4, 1, n.y) * 0.6);
    const bare = smooth(0.25, 0.65, noise3(p.x * 9, p.y * 9, p.z * 9, 13)) * (1 - 0.6 * h);
    out.lerp(PASTA_CREAM, bare * 0.75);
  }, { finish: 'gloss' });
  const top = mound(0);
  // a spoonful of pesto melting over the top
  const blob = lathe([[1, 0], [0.88, 0.45], [0.55, 0.85], [0.25, 0.97], [0, 1]], 20, {
    radial: (th) => 1 + 0.2 * noise3(Math.cos(th) * 1.6, Math.sin(th) * 1.6, 4, 3),
    color: (_th, t, _y, out) => ramp(out, [[0, PESTO_DARK], [0.3, PESTO], [1, PESTO_LIGHT]], t),
  });
  blob.scale(0.2, 0.07, 0.2);
  blob.translate(0.0, top - 0.04, 0.01);
  k.add(blob, undefined, 'gloss');
  const rnd = rng(23);
  const nut = C('#f6e4b4');
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU, r = 0.06 + rnd() * 0.24;
    const p = ellipsoid(0.026, 0.011, 0.015, 6, 3);
    p.rotateY(rnd() * 3);
    p.translate(Math.cos(a) * r, mound(r) + 0.03, Math.sin(a) * r);
    k.add(p, nut, 'matte');
  }
  parmesan(k, rnd, 4, 0, 0, 0.2, (x, z) => mound(Math.hypot(x, z)) + 0.022);
  basil(k, -0.03, top + 0.045, 0.04, 0.9, 0.18, 0.115);
  basil(k, 0.0, top + 0.04, 0.0, 2.6, 0.15, 0.1);
}

// ------------------------------------------------------------------ carbonara

/** Spaghetti in a glossy egg-and-cheese sauce, crisp bacon, black pepper and a yolk on top. */
export function carbonara(k: Kit): void {
  const well = plate(k, 0.74, C('#3f3f4a'), 30);
  const gold = C('#f6d97f'), goldDark = C('#dcae4a');
  const mound = pastaNest(k, well, 15, (_p, n, h, out) => {
    out.copy(goldDark).lerp(gold, smooth(-0.6, 0.8, n.y) * 0.75 + 0.25 * h);
  }, { Hm: 0.28, steps: 72, finish: 'gloss' });
  const rnd = rng(15);
  // crisp bacon pieces
  const meat = new THREE.Color(), fat = new THREE.Color();
  baconColor(0.5, meat);
  baconColor(0.1, fat);
  const crisp = meat.clone().lerp(C('#7a2c18'), 0.5);
  for (let i = 0; i < 9; i++) {
    const r = 0.12 + 0.28 * Math.sqrt((i + 0.5) / 9), a = i * 2.39996 + 0.7;
    const d = dice(0.09, 0.05, 0.065, 0.012);
    d.rotateY(rnd() * TAU).rotateX((rnd() - 0.5) * 0.5);
    d.translate(Math.cos(a) * r, mound(r) + 0.03, Math.sin(a) * r);
    k.add(d, (_p, n, out) => out.copy(n.y > 0.7 ? crisp : fat.clone().lerp(meat, 0.4)), 'gloss');
  }
  // the yolk, glossy and bright
  const yolkC = C('#ff9a12'), yolkLight = C('#ffc93d');
  const top = mound(0);
  const yolk = lathe([[0.13, 0], [0.124, 0.03], [0.1, 0.062], [0.055, 0.082], [0, 0.088]], 20, {
    color: (_th, t, _y, out) => out.copy(yolkC).lerp(yolkLight, smooth(0.5, 1, t)),
  });
  yolk.translate(0.0, top + 0.004, 0.02);
  k.add(yolk, undefined, 'gloss');
  // black pepper and pecorino
  const pepper = C('#2a2420');
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU, r = 0.38 * Math.sqrt(rnd());
    const p = ellipsoid(0.009, 0.006, 0.009, 5, 2);
    p.translate(Math.cos(a) * r, mound(r) + 0.026, Math.sin(a) * r);
    k.add(p, pepper, 'matte');
  }
  parmesan(k, rnd, 4, 0, 0, 0.25, (x, z) => mound(Math.hypot(x, z)) + 0.016);
}

// ------------------------------------------------------------------ gnocchi

/** Potato gnocchi in tomato sauce in a terracotta pasta bowl, basil and parmesan on top. */
export function gnocchi(k: Kit): void {
  const R = 0.76, H = 0.2;
  const terra = C('#c8663a'), terraDark = C('#9c4626'), glaze = C('#f6ead6'), glazeShade = C('#e2d3bc');
  const prof: [number, number][] = [[0, 0.012], [R * 0.4, 0.012], [R * 0.43, 0], [R * 0.52, 0], [R * 0.6, 0.04], [R * 0.82, H * 0.55],
    [R * 0.96, H * 0.92], [R, H], [R * 0.98, H * 1.05], [R * 0.93, H * 1.0], [R * 0.82, H * 0.7], [R * 0.58, H * 0.3], [0, H * 0.27]];
  const tf = fractions(prof);
  k.add(lathe(prof, 32, {
    color: (_th, t, y, out) => {
      if (t < tf[9]) out.copy(terraDark).lerp(terra, smooth(0, H * 0.7, y));
      else out.copy(glazeShade).lerp(glaze, smooth(H * 0.4, H, y));
    },
  }), undefined, 'gloss');
  const sauceC = C('#cf3227'), sauceDark = C('#9c1c14'), sauceLight = C('#ee5a3c');
  const level = H * 0.62;
  const sauce = lathe([[R * 0.86, level - 0.006], [R * 0.6, level + 0.004], [R * 0.3, level + 0.01], [0, level + 0.014]], 30, {
    color: (_th, t, _y, out) => ramp(out, [[0, sauceDark], [0.25, sauceC], [1, sauceLight]], t),
  });
  deform(sauce, (p) => {
    p.y += 0.006 * noise3(p.x * 9, 0, p.z * 9, 11);
  });
  k.add(sauce, undefined, 'gloss');
  // a heap of pillows, half in the sauce
  const rnd = rng(41);
  const spots: [number, number, number][] = [];
  for (let i = 0; i < 11; i++) {
    const r = 0.5 * Math.sqrt((i + 0.5) / 11), a = i * 2.39996 + 0.3;
    spots.push([Math.cos(a) * r, level - 0.008, Math.sin(a) * r]);
  }
  for (let i = 0; i < 2; i++) {
    const a = i * 2.1 + 0.5, r = 0.12;
    spots.push([Math.cos(a) * r, level + 0.05, Math.sin(a) * r]);
  }
  const stain = C('#e8603e');
  spots.forEach(([x, y, z], i) => {
    const g = gnocchoPiece(1.4, 7);
    const yaw = rnd() * TAU;
    // paint along the piece's own axis, before it is turned and placed
    paint(g, (p, n, out) => {
      gnocchoPaint(p, n, out, 1.4);
      out.lerp(stain, smooth(0.25, 0.75, noise3(p.x * 12, p.y * 12, p.z * 12, i)) * 0.4);
    });
    g.rotateX((rnd() - 0.5) * 0.3).rotateY(yaw);
    g.translate(x, y, z);
    k.add(g, undefined, 'matte');
  });
  parmesan(k, rnd, 5, 0, 0, 0.3, () => level + 0.07);
  basil(k, 0.05, level + 0.1, -0.02, 0.6, 0.17, 0.11);
  basil(k, 0.02, level + 0.095, 0.02, 2.5, 0.15, 0.1);
}

// ------------------------------------------------------------------ calzone

/** A golden baked calzone with a crimped edge and a little dish of tomato sauce on the side. */
export function calzone(k: Kit): void {
  const bh = plate(k, 0.78, C('#c9433a'), 30);
  const golden = C('#f0b252'), goldenLight = C('#fbd486'), browned = C('#c4762c'), under = C('#d48c38'), char = C('#7e3f16');
  const Lx = 0.55, W0 = 0.66, H0 = 0.25, zBack = -0.36, NS = 16, NR = 14;
  const shape = (x: number) => {
    const e = Math.sqrt(Math.max(0, 1 - (x / Lx) ** 2));
    return { W: W0 * Math.pow(e, 0.75), Hh: H0 * (0.3 + 0.7 * e) };
  };
  const ringPoint = (x: number, psi: number): Vec => {
    const { W, Hh } = shape(x);
    const sn = Math.sin(psi), cs = Math.cos(psi);
    const g = 1 - 0.45 * Math.max(0, sn);
    const yy = cs >= 0 ? Hh * 0.85 * cs * g : Hh * 0.15 * cs;
    return [x - 0.06, bh + Hh * 0.15 + yy, zBack + W / 2 + (W / 2) * sn];
  };
  const xs: number[] = [];
  for (let i = 0; i <= NS; i++) xs.push(-Lx * Math.cos((Math.PI * i) / NS));
  const sections: Vec[][] = xs.map((x, i) => {
    if (i === 0 || i === NS) return [[x * 1.01 - 0.06, bh + H0 * 0.1, zBack + 0.01]];
    const ring: Vec[] = [];
    for (let j = 0; j < NR; j++) ring.push(ringPoint(x, (j / NR) * TAU));
    return ring;
  });
  // egg-washed crust: golden, deeper brown on the shoulders, a few darker blisters
  k.add(loft(sections, (i, j, out) => {
    const x = xs[i], psi = (j / NR) * TAU, top = Math.cos(psi);
    ramp(out, [[-1, under], [-0.1, browned], [0.45, golden], [1, goldenLight]], top);
    out.lerp(char, smooth(0.3, 0.7, noise3(x * 6, psi * 1.4, 0.5, 23)) * smooth(-0.1, 0.5, top) * 0.55);
  }), undefined, 'gloss');
  // the crimped rope along the curved edge
  const rim: Vec[] = [];
  for (let i = 1; i < 16; i++) {
    const x = -Lx * 0.97 * Math.cos((Math.PI * i) / 16);
    const { W } = shape(x);
    rim.push([x - 0.06, bh + 0.035, zBack + W + 0.012]);
  }
  k.add(sweep(rim, (t) => 0.046 * (0.62 + 0.38 * Math.abs(Math.sin(t * 40))), 60, 6, {
    up: [0, 1, 0], section: (phi) => [Math.cos(phi), Math.sin(phi) * 0.85],
    color: (t, _phi, out) => out.copy(browned).lerp(goldenLight, 0.3 + 0.5 * Math.abs(Math.sin(t * 40))),
  }), undefined, 'gloss');
  // steam vents, and basil on top
  const vent = C('#8e4a1a');
  for (const x of [-0.18, 0.02]) {
    const y = bh + H0 - 0.008;
    k.add(sweep([[x - 0.04, y, zBack + 0.31], [x + 0.04, y + 0.002, zBack + 0.33]], 0.013, 2, 5, { caps: 'round' }), vent, 'matte');
  }
  basil(k, -0.1, bh + H0 + 0.004, zBack + 0.36, 0.5, 0.15, 0.1);
  // a little dish of tomato sauce at the front right
  const dish = C('#fbf7ef'), dishShade = C('#e3dbcc');
  k.within(mat([0.48, bh, 0.36]), () => {
    k.add(lathe([[0, 0], [0.13, 0], [0.155, 0.03], [0.165, 0.075], [0.15, 0.08], [0.13, 0.05], [0, 0.045]], 20, {
      color: (_th, _t, y, out) => out.copy(dishShade).lerp(dish, smooth(0, 0.07, y)),
    }), undefined, 'gloss');
    k.add(lathe([[0.135, 0.058], [0.08, 0.063], [0, 0.066]], 18, {
      color: (_th, t, _y, out) => out.copy(TOMATO_DEEP).lerp(TOMATO_LIGHT, t * 0.7),
    }), undefined, 'gloss');
  });
}

// ------------------------------------------------------------------ tiramisu

/** A square slice of tiramisu: soaked biscuit, mascarpone cream, a dusting of cocoa. */
export function tiramisu(k: Kit): void {
  const well = plate(k, 0.72, C('#7a4a2e'), 30);
  const biscuit = C('#a9693a'), biscuitWet = C('#7c4724'), creamC = C('#f8eedb'), creamShade = C('#e8d8b8');
  const cocoa = C('#5b311c'), cocoaLight = C('#7a4529');
  const W = 0.62, D = 0.5;
  const layers: [number, 'b' | 'c'][] = [[0.075, 'b'], [0.09, 'c'], [0.075, 'b'], [0.1, 'c']];
  k.within(mat([0, 0, 0], [0, 0.6, 0]), () => {
    let y = well;
    for (const [h, kind] of layers) {
      const g = dice(W, h + 0.004, D, kind === 'c' ? 0.018 : 0.01);
      g.translate(0, y + h / 2, 0);
      const y0 = y;
      k.add(g, (p, _n, out) => {
        if (kind === 'b') out.copy(biscuitWet).lerp(biscuit, smooth(y0, y0 + h, p.y) * 0.8);
        else out.copy(creamShade).lerp(creamC, smooth(y0, y0 + h * 0.6, p.y));
      }, kind === 'c' ? 'gloss' : 'matte');
      y += h;
    }
    // cocoa on top: a thin dusted layer
    const top = dice(W - 0.012, 0.016, D - 0.012, 0.006);
    top.translate(0, y + 0.006, 0);
    k.add(top, (p, _n, out) => out.copy(cocoa).lerp(cocoaLight, smooth(-0.3, 0.6, noise3(p.x * 30, 0, p.z * 30, 7)) * 0.6), 'matte');
    // two coffee beans on top
    const bean = C('#4a2817');
    for (const [x, z, a] of [[0.1, -0.06, 0.4], [0.18, 0.04, 1.9]] as const) {
      const b = ellipsoid(0.04, 0.022, 0.03, 10, 5);
      b.rotateY(a);
      b.translate(x, y + 0.03, z);
      k.add(b, bean, 'gloss');
    }
  });
  // cocoa dusted over the plate around the slice
  const rnd = rng(6);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, r = 0.46 + rnd() * 0.14;
    const d = ellipsoid(0.02 + rnd() * 0.015, 0.003, 0.016, 6, 2);
    d.translate(Math.cos(a) * r, well + 0.002, Math.sin(a) * r);
    k.add(d, cocoa, 'matte');
  }
}
