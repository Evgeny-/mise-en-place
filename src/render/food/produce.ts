import * as THREE from 'three';
import {
  C, Kit, alignX, deform, ellipsoid, fractions, lathe, leaf, lerp, mat, noise3, orient, ramp, rng, smooth, spline2,
  squircle, sweep, topHeight, type Vec,
} from './kit';

/**
 * Raw Trattoria ingredients. Every model stands on y = 0 inside x, z ∈ [-0.45, 0.45] (a pantry
 * tile is about 1.0 wide) and is designed for an orthographic camera tilted 0.62 rad from
 * vertical: the top silhouette and hue carry recognition, front faces add volume.
 */

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** Basil-like leaf outline: widest near the base, pointed tip. */
export const pointyLeaf = (u: number): number => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.85);

export function greenLeafColor(dark: THREE.Color, light: THREE.Color, rib?: THREE.Color) {
  return (u: number, v: number, top: boolean, out: THREE.Color): void => {
    ramp(out, [[0, dark], [1, light]], u * 0.8 + 0.2 * Math.abs(v));
    if (rib && top) out.lerp(rib, 0.55 * Math.exp(-((v / 0.22) ** 2)) * (1 - u));
    if (!top) out.multiplyScalar(0.78);
  };
}

// ------------------------------------------------------------------ tomato

export function tomato(k: Kit): void {
  const deep = C('#b0221a'), red = C('#e2382a'), bright = C('#ff5b40'), shoulder = C('#f57a3a');
  const R = 0.375, H = 0.53, N = 16;
  const prof: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    const s = Math.sin(a), c = Math.cos(a);
    const r = i === 0 || i === N ? 0 : R * Math.pow(s, 0.8) * (1 + 0.035 * s);
    const p = c > 0 ? 0.75 : 1.05;
    const y = H * 0.5 * (1 - Math.sign(c) * Math.pow(Math.abs(c), p)) - 0.075 * Math.exp(-(((Math.PI - a) / 0.45) ** 2));
    prof.push([r, y]);
  }
  const lobe = (th: number) => Math.cos(5 * (th - 0.3));
  k.add(lathe(prof, 30, {
    radial: (th, t) => 1 + 0.032 * lobe(th) * smooth(0.25, 0.8, t),
    color: (th, t, _y, out) => {
      ramp(out, [[0, deep], [0.32, red], [0.66, bright], [0.86, bright], [1, shoulder]], t);
      out.multiplyScalar(1 - 0.14 * (0.5 - 0.5 * lobe(th)) * smooth(0.45, 0.85, t));
    },
  }), undefined, 'gloss');

  // Five-pointed calyx in the lobe valleys, hugging the top and curling up at the tips.
  const y0 = prof[N][1];
  const rnd = rng(11);
  const leafColor = greenLeafColor(C('#2b8530'), C('#69c44c'));
  for (let i = 0; i < 5; i++) {
    const L = 0.19 + rnd() * 0.05;
    const th = 0.3 + Math.PI / 5 + (i / 5) * TAU + (rnd() - 0.5) * 0.2;
    const sepal = leaf(L, 0.09, {
      nu: 6, nv: 2, thickness: 0.018, fold: 0.01, width: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 0.9),
      lift: (u) => topHeight(prof, u * L * 0.95) - y0 + 0.016 + 0.035 * smooth(0.55, 1, u) * u,
      color: leafColor,
    });
    sepal.rotateY(-th);
    sepal.translate(0, y0, 0);
    k.add(sepal, undefined, 'matte');
  }
  const stem = C('#4a8a2c'), stemTop = C('#78b244');
  k.add(sweep([[0, y0 - 0.02, 0], [0.004, y0 + 0.045, 0.002], [0.03, y0 + 0.095, 0.014]], (t) => lerp(0.03, 0.021, t), 4, 7),
    (p, _n, out) => out.copy(stem).lerp(stemTop, smooth(y0, y0 + 0.1, p.y)), 'matte');
}

// ------------------------------------------------------------------ onion

export function onion(k: Kit): void {
  const purple = C('#9a3aae'), deep = C('#7a2591'), line = C('#e6b0ee'), root = C('#ecd9c0'), neck = C('#c79aa3');
  // Round below, drawn up into a pointed neck: the teardrop that says "onion", not "fig".
  const prof = spline2([[0, 0.02], [0.11, 0.022], [0.23, 0.062], [0.315, 0.14], [0.346, 0.225], [0.33, 0.305], [0.28, 0.385],
    [0.205, 0.46], [0.13, 0.525], [0.075, 0.585], [0.046, 0.635], [0.032, 0.675], [0, 0.69]], 16);
  k.within(mat([0.01, 0, 0], [0.05, 0, -0.07]), () => {
    k.add(lathe(prof, 40, {
      color: (th, t, _y, out) => {
        ramp(out, [[0, root], [0.09, purple], [0.5, purple], [0.8, deep], [1, neck]], t);
        // Fine pale lines running from root to tip, as on a red onion's papery skin.
        const l = 0.5 + 0.5 * Math.cos(10 * th + 0.35 * Math.sin(5 * t));
        out.lerp(line, 0.55 * l ** 8 * smooth(0.04, 0.2, t) * (1 - smooth(0.9, 0.99, t)));
      },
    }), undefined, 'gloss');
    // The dry papery tip, twisted and bent over, fraying at the end.
    const tan = C('#b48452'), pale = C('#ecd3a4');
    const tipColor = (t: number, _phi: number, out: THREE.Color) => { out.copy(tan).lerp(pale, smooth(0.25, 1, t)); };
    k.add(sweep([[0, 0.63, 0], [0.004, 0.7, 0], [0.018, 0.76, 0.004], [0.055, 0.8, 0.01], [0.115, 0.812, 0.018]],
      (t) => lerp(0.05, 0.01, Math.pow(t, 0.65)), 9, 6, {
        radial: (_t, phi) => 1 + 0.18 * Math.cos(3 * phi), twist: 1.6, color: tipColor,
      }), undefined, 'matte');
    for (const [dz, dy] of [[0.035, -0.012], [-0.03, 0.006]] as const) {
      k.add(sweep([[0.04, 0.795, 0.008], [0.08, 0.805 + dy * 0.5, 0.012 + dz * 0.5], [0.11, 0.8 + dy, 0.014 + dz]],
        (t) => lerp(0.009, 0.004, t), 4, 4, { color: (t, phi, out) => tipColor(0.6 + 0.4 * t, phi, out) }), undefined, 'matte');
    }
  });
}

// ------------------------------------------------------------------ carrot

export function carrot(k: Kit): void {
  const orange = C('#f7892a'), dark = C('#cf5d18'), tipC = C('#ffa850'), crown = C('#d2701f');
  const P: Vec[] = [[0.18, 0.132, -0.15], [0.03, 0.092, -0.005], [-0.14, 0.053, 0.155], [-0.32, 0.017, 0.3]];
  const r = (t: number) => 0.014 + 0.118 * Math.pow(1 - t, 1.05);
  const ridgeT = [0.16, 0.29, 0.41, 0.53, 0.64, 0.75, 0.86];
  const ridge = (t: number, phi: number) => {
    let s = 0;
    ridgeT.forEach((t0, i) => {
      s += Math.exp(-(((t - t0) / 0.024) ** 2)) * (0.55 + 0.45 * Math.cos(phi + i * 2.1));
    });
    return s;
  };
  k.add(sweep(P, r, 40, 10, {
    radial: (t, phi) => 1 - 0.1 * ridge(t, phi),
    color: (t, phi, out) => {
      ramp(out, [[0, crown], [0.06, orange], [0.8, orange], [1, tipC]], t);
      out.lerp(dark, Math.min(1, 0.75 * ridge(t, phi)));
    },
  }), undefined, 'matte');

  // Three feathery stalks fanning up and back from the crown.
  const crownP = new THREE.Vector3(...P[0]);
  const back = crownP.clone().sub(new THREE.Vector3(...P[1])).setY(0).normalize();
  const side = new THREE.Vector3().crossVectors(back, UP).normalize();
  const stalkC = C('#4f9a36');
  const leafColor = greenLeafColor(C('#33923a'), C('#86d65c'));
  for (const f of [-1, 0, 1]) {
    const dir = back.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 1, 0)).addScaledVector(side, f * 0.6).normalize();
    const base = crownP.clone().addScaledVector(back, 0.05);
    const len = f === 0 ? 0.24 : 0.2;
    const mid = base.clone().addScaledVector(dir, len * 0.5).addScaledVector(back, 0.02);
    const end = base.clone().addScaledVector(dir, len).addScaledVector(back, 0.05).add(new THREE.Vector3(0, -0.015, 0));
    k.add(sweep([base.toArray(), mid.toArray(), end.toArray()], (t) => lerp(0.02, 0.012, t), 5, 5), stalkC, 'matte');
    const tipDir = end.clone().sub(mid).normalize();
    for (const a of [-0.65, 0, 0.65]) {
      const d = tipDir.clone().applyAxisAngle(UP, a + f * 0.1);
      d.y = Math.max(d.y, 0.1);
      const lf = leaf(0.165, 0.105, {
        nu: 5, nv: 2, thickness: 0.016, fold: 0.016,
        ruffle: (u, v) => 0.009 * Math.sin(u * 17) * Math.abs(v), color: leafColor,
      });
      alignX(lf, d.toArray(), end.toArray());
      k.add(lf, undefined, 'matte');
    }
  }
  k.centerXZ();
}

// ------------------------------------------------------------------ potato

export function potato(k: Kit): void {
  const base = C('#d29f5d'), light = C('#e8c487'), dark = C('#a0703a'), blotch = C('#b9874b');
  const g = ellipsoid(0.36, 0.215, 0.27, 30, 16);
  deform(g, (p) => {
    const n1 = noise3(p.x * 3.4 + 3.1, p.y * 3.4, p.z * 3.4, 7);
    const n2 = noise3(p.x * 8 + 1, p.y * 8, p.z * 8 + 5, 3);
    p.multiplyScalar(1 + 0.075 * n1 + 0.025 * n2);
    p.z += 0.055 * (p.x / 0.36) ** 2 - 0.025;
    if (p.x > 0) {
      p.y *= 1 + 0.12 * (p.x / 0.36);
      p.z *= 1 + 0.08 * (p.x / 0.36);
    }
    if (p.y < 0) p.y *= 0.7;
  });
  g.rotateY(0.5);
  k.add(g, (p, n, out) => {
    ramp(out, [[0, dark], [0.38, base], [1, light]], (p.y + 0.15) / 0.39 + 0.08 * n.y);
    out.lerp(blotch, 0.55 * smooth(0.15, 0.6, noise3(p.x * 6 + 9, p.y * 6, p.z * 6, 21)));
  }, 'matte');

  // Eyes and specks sit on the upper surface, flattened against it.
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const rnd = rng(31);
  const eyeC = C('#7a502c'), speckC = C('#94683b');
  const used: THREE.Vector3[] = [];
  for (let tries = 0, placed = 0; tries < 600 && placed < 13; tries++) {
    const i = Math.floor(rnd() * pos.count);
    const n = new THREE.Vector3().fromBufferAttribute(nor, i);
    if (n.y < 0.1) continue;
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    if (used.some((u) => u.distanceTo(p) < 0.085)) continue;
    used.push(p);
    const eye = placed < 5;
    const s = eye ? 0.03 : 0.014;
    const e = ellipsoid(s, s * 0.3, s * (eye ? 0.5 : 1), 6, 3);
    orient(e, n.toArray(), p.clone().addScaledVector(n, -s * 0.06).toArray(), rnd() * Math.PI);
    k.add(e, eye ? eyeC : speckC, 'matte');
    placed++;
  }
}

// ------------------------------------------------------------------ cheese wedge

export function cheese(k: Kit): void {
  const topC = C('#f9cf48'), topLight = C('#fde27e'), faceC = C('#f6c13a'), holeDeep = C('#d4921a'), holeRim = C('#f0b934');
  const rindC = C('#eda22b'), rindDark = C('#cd8121');
  const A = new THREE.Vector2(-0.38, 0.33);
  const R = 0.76, T = 0.34;
  const ta = (-62 * Math.PI) / 180, tb = (-8 * Math.PI) / 180;
  const at = (rho: number, th: number) => new THREE.Vector2(A.x + rho * Math.cos(th), A.y + rho * Math.sin(th));
  const arcN = 12, rows = 4, SEG = 14;
  const bulge = (i: number) => 0.018 * Math.sin((Math.PI * i) / rows);
  const rim: THREE.Vector2[] = [];
  for (let j = 0; j <= arcN; j++) rim.push(at(R, ta + ((tb - ta) * j) / arcN));

  const cup = (r: number) => {
    const prof: [number, number][] = [];
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      prof.push([i === 4 ? 0 : r * Math.cos(a), -0.8 * r * Math.sin(a)]);
    }
    return lathe(prof, SEG, { color: (_th, t, _y, out) => out.copy(holeRim).lerp(holeDeep, smooth(0, 0.7, t)) });
  };
  const circle = (cx: number, cy: number, r: number, sy: number) => {
    const pts: THREE.Vector2[] = [];
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * TAU;
      pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + sy * r * Math.sin(a)));
    }
    return new THREE.Path(pts);
  };

  // Top face with holes (shape space is (x, -z)).
  const topHoles = ([[0.52, -32, 0.085], [0.3, -27, 0.05], [0.64, -52, 0.06], [0.4, -47, 0.042]] as const).map(([rho, deg, r]) => {
    const p = at(rho, (deg * Math.PI) / 180);
    return { x: p.x, z: p.y, r };
  });
  const topShape = new THREE.Shape([A, ...rim].map((p) => new THREE.Vector2(p.x, -p.y)));
  for (const h of topHoles) topShape.holes.push(circle(h.x, -h.z, h.r, -1));
  const top = new THREE.ShapeGeometry(topShape);
  top.rotateX(-Math.PI / 2);
  top.translate(0, T, 0);
  k.add(top, (p, _n, out) => out.copy(topC).lerp(topLight, 0.5 * smooth(0.1, -0.35, p.x)), 'matte');
  for (const h of topHoles) k.add(cup(h.r).translate(h.x, T, h.z), undefined, 'matte');

  // Rind: a slightly bulging band around the arc.
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cc = new THREE.Color();
  for (let i = 0; i <= rows; i++) {
    const y = (T * i) / rows;
    for (let j = 0; j <= arcN; j++) {
      const p = at(R + bulge(i), ta + ((tb - ta) * j) / arcN);
      pos.push(p.x, y, p.y);
      cc.copy(rindDark).lerp(rindC, smooth(0, T * 0.6, y));
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < arcN; j++) {
      const a = i * (arcN + 1) + j, b = a + 1, d = a + arcN + 1, c = d + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const rind = new THREE.BufferGeometry();
  rind.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rind.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  rind.setIndex(idx);
  rind.computeVertexNormals();
  k.add(rind, undefined, 'matte');

  // The cut faces: the front one (towards the camera) shows more holes.
  const side = (u: number, sign: number) => {
    const pts = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= rows; i++) pts.push(new THREE.Vector2(sign * (R + bulge(i)), (T * i) / rows));
    pts.push(new THREE.Vector2(0, T));
    return sign > 0 ? pts : pts.reverse();
  };
  const eb = new THREE.Vector3(Math.cos(tb), 0, Math.sin(tb));
  const nb = new THREE.Vector3(-Math.sin(tb), 0, Math.cos(tb));
  const frontHoles = [[0.47, 0.15, 0.066], [0.2, 0.19, 0.042], [0.66, 0.255, 0.04]] as const;
  const fShape = new THREE.Shape(side(0, 1));
  for (const [u, v, r] of frontHoles) fShape.holes.push(circle(u, v, r, 1));
  const front = new THREE.ShapeGeometry(fShape);
  front.applyMatrix4(new THREE.Matrix4().makeBasis(eb, UP, nb).setPosition(A.x, 0, A.y));
  k.add(front, faceC, 'matte');
  for (const [u, v, r] of frontHoles) {
    k.add(orient(cup(r), nb.toArray(), [A.x + eb.x * u, v, A.y + eb.z * u]), undefined, 'matte');
  }
  const xa = new THREE.Vector3(-Math.cos(ta), 0, -Math.sin(ta));
  const na = new THREE.Vector3(Math.sin(ta), 0, -Math.cos(ta));
  const back = new THREE.ShapeGeometry(new THREE.Shape(side(0, -1)));
  back.applyMatrix4(new THREE.Matrix4().makeBasis(xa, UP, na).setPosition(A.x, 0, A.y));
  k.add(back, faceC, 'matte');
  const bottom = new THREE.ShapeGeometry(new THREE.Shape([A, ...rim].map((p) => new THREE.Vector2(p.x, p.y))));
  bottom.rotateX(Math.PI / 2);
  k.add(bottom, rindDark, 'matte');
}

// ------------------------------------------------------------------ egg

export function egg(k: Kit): void {
  const shell = C('#f6e9d2'), top = C('#fffaf2'), under = C('#c4ab86'), warm = C('#ecd6b2');
  const sun = new THREE.Vector3(-0.35, 0.9, -0.3).normalize();
  const L = 0.74, R = 0.27, N = 18;
  const prof: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    prof.push([i === 0 || i === N ? 0 : R * Math.sin(a) * (1 - 0.15 * Math.cos(a)), -0.5 * L * Math.cos(a)]);
  }
  const g = lathe(prof, 28);
  g.rotateZ(Math.PI / 2 + 0.22);
  g.rotateY(0.62);
  // Creamy shell, darker underneath, brightest where the kitchen sun hits it.
  k.add(g, (_p, n, out) => {
    ramp(out, [[-1, under], [-0.25, warm], [0.4, shell], [1, shell]], n.y);
    out.lerp(top, smooth(0.55, 0.95, n.dot(sun)));
  }, 'gloss');
}

// ------------------------------------------------------------------ flour sack

export function flour(k: Kit): void {
  const sack = C('#dcc39a'), sackDark = C('#b39567'), cuff = C('#c9aa79'), cuffLight = C('#e9d6b2');
  const white = C('#fcfaf5'), whiteShade = C('#e7e2d7'), print = C('#b8772c');
  const hx = 0.33, hz = 0.27;
  const sec = squircle(3, hx, hz);
  const prof: [number, number][] = [
    [0, 0], [0.78, 0], [0.92, 0.012], [0.99, 0.05], [1.02, 0.12], [1.04, 0.22], [1.02, 0.32], [0.98, 0.41],
    [0.98, 0.45], [1.05, 0.48], [1.07, 0.52], [1.03, 0.56], [0.96, 0.575], [0.9, 0.55], [0.88, 0.5],
  ];
  k.add(lathe(prof, 28, {
    section: sec,
    radial: (th, _t, y) => 1 + 0.012 * Math.sin(th * 6 + y * 20) * smooth(0.3, 0.45, y),
    color: (_th, _t, y, out) => {
      if (y > 0.435) out.copy(cuff).lerp(cuffLight, smooth(0.47, 0.56, y));
      else ramp(out, [[0, sackDark], [0.12, sack], [0.43, sack]], y);
    },
  }), undefined, 'matte');

  // Heaped flour filling the open top.
  const heap = lathe([[0.94, 0.5], [0.86, 0.565], [0.7, 0.62], [0.45, 0.668], [0.2, 0.69], [0, 0.696]], 28, {
    section: sec, color: (_th, t, _y, out) => out.copy(whiteShade).lerp(white, smooth(0, 0.4, t)),
  });
  deform(heap, (p) => {
    p.y += 0.018 * noise3(p.x * 9, 1, p.z * 9, 5) * smooth(0.55, 0.62, p.y);
  });
  k.add(heap, undefined, 'matte');

  // A printed wheat ear on the front of the sack.
  const front = (y: number) => {
    for (let i = 1; i < 8; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      if (y >= y0 && y <= y1) return (r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)) * hz;
    }
    return hz;
  };
  k.add(sweep([0.1, 0.2, 0.3, 0.37].map((y, i): Vec => [[0, 0.004, 0, -0.004][i], y, front(y) + 0.006]), 0.009, 6, 5), print, 'matte');
  for (const [y, sx] of [[0.19, -1], [0.19, 1], [0.25, -1], [0.25, 1], [0.31, -1], [0.31, 1], [0.375, 0]] as const) {
    const grain = ellipsoid(0.019, 0.036, 0.007, 5, 4);
    grain.rotateZ(-sx * 0.6);
    grain.translate(sx * 0.03, y + 0.012, front(y + 0.012) + 0.006);
    k.add(grain, print, 'matte');
  }
  // A little pinch of spilled flour on the tile.
  const pinch = lathe([[1, 0], [0.75, 0.25], [0.4, 0.75], [0, 1]], 12, {
    radial: (th) => 1 + 0.2 * noise3(Math.cos(th) * 1.5, Math.sin(th) * 1.5, 3, 2),
  });
  pinch.scale(0.075, 0.032, 0.06);
  pinch.translate(0.23, 0, 0.35);
  k.add(pinch, white, 'matte');
}

// ------------------------------------------------------------------ pasta bundle

export function pasta(k: Kit): void {
  const gold = C('#f3c65a'), goldDark = C('#dda83e'), goldLight = C('#fbe29a');
  const green = C('#2f9a4a'), white = C('#f8f4ea'), red = C('#d9403a');
  const N = 30, L = 0.84, Rend = 0.13, delta = THREE.MathUtils.degToRad(116), sr = 0.0165;
  const rnd = rng(17);
  const yc = Rend + sr;
  k.within(mat([0, 0, 0.02], [0, 0.62, 0]), () => {
    for (let i = 0; i < N; i++) {
      const rho = Rend * Math.sqrt((i + 0.5) / N);
      const phi = i * 2.39996;
      const len = L * (0.96 + rnd() * 0.06);
      const off = (rnd() - 0.5) * 0.02;
      const a0 = phi - delta / 2, a1 = phi + delta / 2;
      const A: Vec = [-len / 2 + off, yc + rho * Math.cos(a0), rho * Math.sin(a0)];
      const B: Vec = [len / 2 + off, yc + rho * Math.cos(a1), rho * Math.sin(a1)];
      const dir = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).normalize();
      const tone = goldDark.clone().lerp(gold, 0.35 + rnd() * 0.65);
      k.add(sweep([A, B], sr, 1, 6, { caps: 'flat' }),
        (_p, n, out) => out.copy(tone).lerp(goldLight, Math.abs(n.dot(dir)) > 0.8 ? 0.7 : 0), 'matte');
    }
    // A paper band in Italian colours around the waist.
    const wR = Rend * Math.cos(delta / 2) + sr;
    const hw = 0.055, ri = wR - 0.004, ro = wR + 0.014, b = 0.005;
    const prof: [number, number][] = [[ri, -hw], [ro - b, -hw], [ro, -hw + b], [ro, -hw / 3 - 0.002], [ro, -hw / 3 + 0.002],
      [ro, hw / 3 - 0.002], [ro, hw / 3 + 0.002], [ro, hw - b], [ro - b, hw], [ri, hw]];
    const band = lathe(prof, 26, { closed: true, color: (_th, _t, y, out) => out.copy(y < -hw / 3 ? green : y > hw / 3 ? red : white) });
    band.rotateZ(-Math.PI / 2);
    band.translate(0, yc, 0);
    k.add(band, undefined, 'matte');
  });
}

// ------------------------------------------------------------------ mushroom

const CAP = C('#86512e'), CAP_TOP = C('#b27c4e'), CAP_RIM = C('#5a321c');
const GILL = C('#ecd6b0'), GILL_LINE = C('#a8815a'), STEM = C('#f3e7cf'), STEM_DARK = C('#cdb38a');

/** One brown culinary mushroom, base at the origin, axis along +Y. */
function mushroomParts(stemH: number): THREE.BufferGeometry[] {
  const capProf: [number, number][] = [[0, 0.045], [0.07, 0.045], [0.16, 0.035], [0.215, 0.017], [0.24, 0.012], [0.255, 0.035],
    [0.262, 0.07], [0.248, 0.115], [0.21, 0.165], [0.15, 0.2], [0.075, 0.222], [0, 0.228]];
  const tf = fractions(capProf);
  const tRim = tf[4];
  const cap = lathe(capProf, 22, {
    color: (th, t, _y, out) => {
      if (t < tRim) out.copy(GILL).lerp(GILL_LINE, 0.45 * Math.pow(0.5 + 0.5 * Math.cos(11 * th), 3) + 0.3 * smooth(0.35, 0, t / tRim));
      else ramp(out, [[tRim, CAP_RIM], [tf[6], CAP], [tf[9], CAP_TOP], [1, CAP_TOP]], t);
    },
  }).translate(0, stemH - 0.03, 0);
  const stem = lathe([[0, 0], [0.074, 0], [0.086, 0.012], [0.084, 0.04], [0.072, stemH * 0.5], [0.066, stemH * 0.8], [0.068, stemH], [0, stemH]], 10, {
    color: (_th, _t, y, out) => out.copy(STEM_DARK).lerp(STEM, smooth(0, 0.06, y)),
  });
  return [cap, stem];
}

/** Transform the parts of one sub-model together and drop them onto the ground. */
function placeOnGround(k: Kit, parts: THREE.BufferGeometry[], m: THREE.Matrix4): void {
  let minY = Infinity;
  for (const g of parts) {
    g.applyMatrix4(m);
    g.computeBoundingBox();
    minY = Math.min(minY, g.boundingBox!.min.y);
  }
  for (const g of parts) k.add(g.translate(0, -minY, 0), undefined, 'matte');
}

export function mushroom(k: Kit): void {
  // A small upright mushroom behind, and a big one lying on its side in front so the classic
  // cap-and-stem profile reads from above: cap to the right, cream stem pointing left.
  placeOnGround(k, mushroomParts(0.2), mat([0.15, 0, -0.17], [-0.15, 0, 0.12], 0.84));
  const axis = new THREE.Vector3(0.81, 0.58, -0.28).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, axis);
  placeOnGround(k, mushroomParts(0.24), new THREE.Matrix4().compose(new THREE.Vector3(-0.2, 0, 0.11), q, new THREE.Vector3(1, 1, 1)));
}
