import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

/**
 * Small procedural modelling kit for the food models. Every part is a closed, smooth-shaded
 * BufferGeometry with its own vertex colours; a Kit collects the parts of one model and bakes
 * them into at most two merged geometries (matte and glossy), which share two materials across
 * every food in the game.
 */

export type Finish = 'matte' | 'gloss';
export type Vec = readonly [number, number, number];
export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;
export type Paint = string | THREE.Color | ColorFn;

export interface FoodGeometry {
  matte: THREE.BufferGeometry | null;
  gloss: THREE.BufferGeometry | null;
}

const TAU = Math.PI * 2;
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

// ---------------------------------------------------------------- maths

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Deterministic PRNG (mulberry32) so every model is identical on every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Smooth value noise in [-1, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
    v += w * hash3(ix + dx, iy + dy, iz + dz, seed);
  }
  return v * 2 - 1;
}

// ---------------------------------------------------------------- colour

/** A colour from an sRGB hex string, converted to the linear working space used by vertex colours. */
export const C = (hex: string): THREE.Color => new THREE.Color(hex);

/** Piecewise-linear colour ramp over sorted stops. */
export function ramp(out: THREE.Color, stops: ReadonlyArray<readonly [number, THREE.Color]>, x: number): THREE.Color {
  if (x <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1], [x1, c1] = stops[i];
      return out.copy(c0).lerp(c1, (x - x0) / (x1 - x0 || 1));
    }
  }
  return out.copy(stops[stops.length - 1][1]);
}

/** Matrix from a translation, an XYZ Euler rotation and a uniform or per-axis scale. */
export function mat(t: Vec = [0, 0, 0], r: Vec = [0, 0, 0], s: number | Vec = 1): THREE.Matrix4 {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(...t), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), sc);
}

/** Rotate a part built along +X so that +X follows `dir` while its +Y stays as close to `up` as possible. */
export function alignX(geo: THREE.BufferGeometry, dir: Vec, at: Vec = [0, 0, 0], up: Vec = [0, 1, 0], roll = 0): THREE.BufferGeometry {
  const x = new THREE.Vector3(...dir).normalize();
  let z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(...up));
  if (z.lengthSq() < 1e-8) z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(0, 0, 1));
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  if (roll) geo.rotateX(roll);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  geo.translate(at[0], at[1], at[2]);
  return geo;
}

/** Height of the upper surface of a lathe profile at radius `rho`, walking down from its top pole. */
export function topHeight(profile: ReadonlyArray<readonly [number, number]>, rho: number): number {
  for (let i = profile.length - 1; i > 0; i--) {
    const [r1, y1] = profile[i], [r0, y0] = profile[i - 1];
    if (r1 <= rho && r0 >= rho) {
      const t = r0 === r1 ? 0 : (rho - r1) / (r0 - r1);
      return y1 + (y0 - y1) * t;
    }
  }
  return profile[0][1];
}

/** Superellipse cross-section (rounded rectangle) with half-axes ax (x) and az (z). */
export function squircle(n: number, ax: number, az: number): (theta: number) => [number, number] {
  return (th) => {
    const c = Math.cos(th), s = Math.sin(th);
    const k = Math.pow(Math.pow(Math.abs(c) / ax, n) + Math.pow(Math.abs(s) / az, n), -1 / n);
    return [c * k, s * k];
  };
}

/** Paint a part: a flat colour or a function of position and normal. Returns the geometry. */
export function paint(geo: THREE.BufferGeometry, how: Paint): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const nor = geo.getAttribute('normal');
  const out = new Float32Array(pos.count * 3);
  if (typeof how === 'function') {
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
      _c.setRGB(1, 1, 1);
      how(_p, _n, _c);
      _c.toArray(out, i * 3);
    }
  } else {
    const c = typeof how === 'string' ? new THREE.Color(how) : how;
    for (let i = 0; i < pos.count; i++) c.toArray(out, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

/** Multiply existing vertex colours by a factor (soft contact shading, painted occlusion). */
export function shade(geo: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3) => number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nor, i);
    const k = f(_p, _n);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return geo;
}

/** Move vertices and recompute smooth normals (the geometry must be welded/indexed to stay smooth). */
export function deform(geo: THREE.BufferGeometry, f: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    f(_p);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Rotate a part so its local +Y axis points along `dir`, then move it to `at`. */
export function orient(geo: THREE.BufferGeometry, dir: Vec, at: Vec = [0, 0, 0], spin = 0): THREE.BufferGeometry {
  if (spin) geo.rotateY(spin);
  const d = new THREE.Vector3(...dir).normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  geo.translate(at[0], at[1], at[2]);
  return geo;
}

// ---------------------------------------------------------------- primitives

export interface LatheOptions {
  phase?: number;
  /** Connect the last profile point back to the first (rings, tori). */
  closed?: boolean;
  /** Radius multiplier by angle, profile fraction (0..1 along the profile) and height. */
  radial?: (theta: number, t: number, y: number) => number;
  /** Cross-section for unit radius (x, z); defaults to a circle. */
  section?: (theta: number) => readonly [number, number];
  /** Vertex colour by angle, profile fraction, height and profile radius (before `radial`). */
  color?: (theta: number, t: number, y: number, out: THREE.Color, r: number) => void;
}

/** Arc-length fraction (0..1) of every point of a profile, to colour lathes by region. */
export function fractions(profile: ReadonlyArray<readonly [number, number]>): number[] {
  const acc = [0];
  for (let i = 1; i < profile.length; i++) acc.push(acc[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = acc[acc.length - 1] || 1;
  return acc.map((a) => a / total);
}

/**
 * Surface of revolution around +Y from a [radius, height] profile. Points with radius 0 become
 * single pole vertices, the seam is welded so shading is smooth all round, and two consecutive
 * identical points make a crisp crease (no faces between them, separate normals on each side).
 * Walking along the profile, the outside of the surface is on the right.
 */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, segments: number, o: LatheOptions = {}): THREE.BufferGeometry {
  const n = profile.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = acc[n - 1] || 1;
  const c = new THREE.Color();
  const vert = (x: number, y: number, z: number, theta: number, t: number, r: number): number => {
    pos.push(x, y, z);
    if (o.color) {
      c.setRGB(1, 1, 1);
      o.color(theta, t, y, c, r);
      col.push(c.r, c.g, c.b);
    }
    return pos.length / 3 - 1;
  };
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    const t = acc[i] / total;
    if (r <= 1e-6) {
      rows.push([vert(0, y, 0, 0, t, 0)]);
      continue;
    }
    const row: number[] = [];
    for (let j = 0; j < segments; j++) {
      const th = (o.phase ?? 0) + (j / segments) * TAU;
      const m = o.radial ? o.radial(th, t, y) : 1;
      const [sx, sz] = o.section ? o.section(th) : [Math.cos(th), Math.sin(th)];
      row.push(vert(r * m * sx, y, r * m * sz, th, t, r));
    }
    rows.push(row);
  }
  const S = segments;
  const pairs = o.closed ? n : n - 1;
  for (let i = 0; i < pairs; i++) {
    const i2 = (i + 1) % n;
    const a = rows[i], b = rows[i2];
    if (a.length === 1 && b.length === 1) continue;
    if (Math.abs(profile[i][0] - profile[i2][0]) < 1e-7 && Math.abs(profile[i][1] - profile[i2][1]) < 1e-7) continue;
    if (a.length === 1) for (let j = 0; j < S; j++) idx.push(a[0], b[j], b[(j + 1) % S]);
    else if (b.length === 1) for (let j = 0; j < S; j++) idx.push(a[j], b[0], a[(j + 1) % S]);
    else {
      for (let j = 0; j < S; j++) {
        const A = a[j], B = a[(j + 1) % S], Cc = b[(j + 1) % S], D = b[j];
        idx.push(A, D, B, B, D, Cc);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Quarter/partial circle points for profiles: centre, radius, start and end angle (radians). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** A smooth profile through control points (Catmull-Rom), with exact poles kept at the ends. */
export function spline2(ctrl: ReadonlyArray<readonly [number, number]>, samples: number): [number, number][] {
  const curve = new THREE.SplineCurve(ctrl.map(([x, y]) => new THREE.Vector2(x, y)));
  const pts = curve.getSpacedPoints(samples).map((v): [number, number] => [Math.max(0, v.x), v.y]);
  pts[0] = [ctrl[0][0], ctrl[0][1]];
  pts[pts.length - 1] = [ctrl[ctrl.length - 1][0], ctrl[ctrl.length - 1][1]];
  return pts;
}

/** Rounded puck: flat bottom and top, soft bevels; `bevelTop` may differ from the bottom one. */
export function puck(r: number, h: number, bevel: number, segments: number, o: LatheOptions & { bevelTop?: number } = {}): THREE.BufferGeometry {
  const bt = o.bevelTop ?? bevel;
  const prof: [number, number][] = [[0, 0], [r - bevel, 0], ...arc(r - bevel, bevel, bevel, -Math.PI / 2, 0, 3).slice(1),
    ...arc(r - bt, h - bt, bt, 0, Math.PI / 2, 3).slice(0, -1), [r - bt, h], [0, h]];
  return lathe(prof, segments, o);
}

/** Ellipsoid made by a welded lathe (no seams, single poles). */
export function ellipsoid(rx: number, ry: number, rz: number, segments = 16, rings = 10): THREE.BufferGeometry {
  const prof: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * Math.PI;
    prof.push([i === 0 || i === rings ? 0 : Math.cos(a), Math.sin(a)]);
  }
  const g = lathe(prof, segments);
  g.scale(rx, ry, rz);
  return g;
}

export interface SweepOptions {
  closed?: boolean;
  caps?: 'round' | 'flat' | 'none';
  /** Cross-section for unit radius in the (normal, binormal) frame. */
  section?: (phi: number) => readonly [number, number];
  /** Radius multiplier by path fraction and angle. */
  radial?: (t: number, phi: number) => number;
  color?: (t: number, phi: number, out: THREE.Color) => void;
  /** Rotate the section along the path (radians at the end). */
  twist?: number;
  /** Fixed "up" for the section frame instead of parallel transport (flat ribbons). */
  up?: Vec;
}

/** A tube along a smooth path with a varying radius and rounded or flat end caps. */
export function sweep(points: ReadonlyArray<Vec>, radius: number | ((t: number) => number), steps: number, radial: number, o: SweepOptions = {}): THREE.BufferGeometry {
  const closed = !!o.closed;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const frames = curve.computeFrenetFrames(steps, closed);
  const R = typeof radius === 'number' ? () => radius : radius;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const up = o.up ? new THREE.Vector3(...o.up).normalize() : null;
  const N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(), T = new THREE.Vector3();
  const vert = (v: THREE.Vector3, t: number, phi: number): number => {
    pos.push(v.x, v.y, v.z);
    if (o.color) {
      c.setRGB(1, 1, 1);
      o.color(t, phi, c);
      col.push(c.r, c.g, c.b);
    }
    return pos.length / 3 - 1;
  };
  const rings = closed ? steps : steps + 1;
  const rows: number[][] = [];
  const frameAt = (i: number) => {
    const t = i / steps;
    curve.getPointAt(Math.min(1, t), P);
    T.copy(frames.tangents[i]);
    if (up) {
      B.crossVectors(T, up).normalize();
      N.crossVectors(B, T).normalize();
      // keep (T, N, B) right-handed with N = up-ish, B = side
      B.crossVectors(T, N);
    } else {
      N.copy(frames.normals[i]);
      B.copy(frames.binormals[i]);
    }
    const tw = (o.twist ?? 0) * t;
    if (tw) {
      const n2 = N.clone().multiplyScalar(Math.cos(tw)).addScaledVector(B, Math.sin(tw));
      const b2 = B.clone().multiplyScalar(Math.cos(tw)).addScaledVector(N, -Math.sin(tw));
      N.copy(n2);
      B.copy(b2);
    }
    return t;
  };
  const ringAt = (i: number, scale = 1, offset = 0): number[] => {
    const t = frameAt(i);
    const r = R(Math.min(1, t)) * scale;
    const centre = P.clone().addScaledVector(T, offset);
    if (r <= 1e-6) return [vert(centre, t, 0)];
    const row: number[] = [];
    for (let j = 0; j < radial; j++) {
      const phi = (j / radial) * TAU;
      const m = o.radial ? o.radial(t, phi) : 1;
      const [a, b] = o.section ? o.section(phi) : [Math.cos(phi), Math.sin(phi)];
      const v = centre.clone().addScaledVector(N, a * r * m).addScaledVector(B, b * r * m);
      row.push(vert(v, t, phi));
    }
    return row;
  };
  for (let i = 0; i < rings; i++) rows.push(ringAt(i));
  const S = radial;
  const quad = (a: number[], b: number[]) => {
    if (a.length === 1 && b.length === 1) return;
    if (a.length === 1) for (let j = 0; j < S; j++) idx.push(a[0], b[(j + 1) % S], b[j]);
    else if (b.length === 1) for (let j = 0; j < S; j++) idx.push(a[j], a[(j + 1) % S], b[0]);
    else {
      for (let j = 0; j < S; j++) {
        const A = a[j], Bq = a[(j + 1) % S], Cq = b[(j + 1) % S], D = b[j];
        idx.push(A, Bq, D, Bq, Cq, D);
      }
    }
  };
  for (let i = 0; i < rings - 1; i++) quad(rows[i], rows[i + 1]);
  if (closed) quad(rows[rings - 1], rows[0]);
  else {
    const caps = o.caps ?? 'round';
    const r0 = R(0), r1 = R(1);
    if (caps === 'round') {
      if (r0 > 1e-6 && rows[0].length > 1) {
        const mid = ringAt(0, 0.8, -r0 * 0.6);
        frameAt(0);
        const tip = vert(P.clone().addScaledVector(T, -r0 * 0.95), 0, 0);
        quad(mid, rows[0]);
        quad([tip], mid);
      }
      if (r1 > 1e-6 && rows[rings - 1].length > 1) {
        const mid = ringAt(steps, 0.8, r1 * 0.6);
        frameAt(steps);
        const tip = vert(P.clone().addScaledVector(T, r1 * 0.95), 1, 0);
        quad(rows[rings - 1], mid);
        quad(mid, [tip]);
      }
    } else if (caps === 'flat') {
      if (r0 > 1e-6 && rows[0].length > 1) {
        const rim = ringAt(0);
        frameAt(0);
        quad([vert(P.clone(), 0, 0)], rim);
      }
      if (r1 > 1e-6 && rows[rings - 1].length > 1) {
        const rim = ringAt(steps);
        frameAt(steps);
        quad(rim, [vert(P.clone(), 1, 0)]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface LeafOptions {
  nu?: number;
  nv?: number;
  thickness?: number;
  /** Lift of the leaf halves along the midrib (positive = cupped up). */
  fold?: number;
  /** Height added along the length (u in 0..1); default droops the tip slightly. */
  lift?: (u: number) => number;
  /** Half-width profile along the length, peak ≈ 1. */
  width?: (u: number) => number;
  /** Extra height by position (u, v in -1..1): ruffles, waves. */
  ruffle?: (u: number, v: number) => number;
  /** Bend the leaf sideways (z offset along the length). */
  sway?: (u: number) => number;
  color?: (u: number, v: number, top: boolean, out: THREE.Color) => void;
}

/** A thin closed leaf along +X (base at the origin, tip at x = length), cupped and curled. */
export function leaf(length: number, width: number, o: LeafOptions = {}): THREE.BufferGeometry {
  const nu = o.nu ?? 8, nv = o.nv ?? 4;
  const th = o.thickness ?? 0.012;
  const wf = o.width ?? ((u: number) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.85));
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const grid = (top: boolean): number[][] => {
    const rows: number[][] = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const w = wf(u) * width * 0.5;
      const row: number[] = [];
      for (let j = 0; j <= nv; j++) {
        const v = -1 + (2 * j) / nv;
        const x = u * length;
        const z = v * w + (o.sway ? o.sway(u) : 0);
        let y = (o.fold ?? 0) * Math.abs(v) * (w / (width * 0.5 || 1)) + (o.lift ? o.lift(u) : -0.04 * u * u * length);
        if (o.ruffle) y += o.ruffle(u, v);
        const half = th * 0.5 * (1 - v * v) * Math.min(1, wf(u) * 2.5);
        y += top ? half : -half;
        pos.push(x, y, z);
        if (o.color) {
          c.setRGB(1, 1, 1);
          o.color(u, v, top, c);
          col.push(c.r, c.g, c.b);
        }
        row.push(pos.length / 3 - 1);
      }
      rows.push(row);
    }
    return rows;
  };
  const t = grid(true), b = grid(false);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      idx.push(t[i][j], t[i][j + 1], t[i + 1][j], t[i][j + 1], t[i + 1][j + 1], t[i + 1][j]);
      idx.push(b[i][j], b[i + 1][j], b[i][j + 1], b[i][j + 1], b[i + 1][j], b[i + 1][j + 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Skin through cross-sections along a path. Each section is a closed ring of points (all the same
 * count) or a single point (a pole at either end). Rings must turn counter-clockwise when seen
 * from further along the path looking back, so the faces point outwards.
 */
export function loft(sections: ReadonlyArray<ReadonlyArray<Vec>>, color?: (i: number, j: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const rows = sections.map((ring, i) => ring.map((p, j) => {
    pos.push(p[0], p[1], p[2]);
    if (color) {
      c.setRGB(1, 1, 1);
      color(i, j, c);
      col.push(c.r, c.g, c.b);
    }
    return pos.length / 3 - 1;
  }));
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const S = Math.max(a.length, b.length);
    if (a.length === 1) for (let j = 0; j < S; j++) idx.push(a[0], b[(j + 1) % S], b[j]);
    else if (b.length === 1) for (let j = 0; j < S; j++) idx.push(a[j], a[(j + 1) % S], b[0]);
    else {
      for (let j = 0; j < S; j++) {
        const A = a[j], B = a[(j + 1) % S], Cc = b[(j + 1) % S], D = b[j];
        idx.push(A, B, D, B, Cc, D);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A thin disc on a polar grid: wavy outline `radius(θ)`, height `height(f, θ)` (f = 0 at the centre,
 * 1 at the rim) and a thickness that tapers to a closed edge. With `topOnly` it is a single upward
 * surface (for cut faces lying on top of another part). Colour by (f, θ, top).
 */
export function disc(rings: number, segments: number, radius: (th: number) => number, height: (f: number, th: number) => number,
  thick: number, color?: (f: number, th: number, top: boolean, out: THREE.Color) => void, topOnly = false): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  const surface = (top: boolean) => {
    const centre = pos.length / 3;
    pos.push(0, height(0, 0) + (top ? thick / 2 : -thick / 2), 0);
    c.setRGB(1, 1, 1);
    color?.(0, 0, top, c);
    col.push(c.r, c.g, c.b);
    const rows: number[][] = [];
    for (let i = 1; i <= rings; i++) {
      const f = i / rings;
      const row: number[] = [];
      for (let j = 0; j < segments; j++) {
        const th = (j / segments) * TAU;
        const R = radius(th) * f;
        const half = (thick / 2) * (1 - f * f);
        pos.push(Math.cos(th) * R, height(f, th) + (top ? half : -half), Math.sin(th) * R);
        c.setRGB(1, 1, 1);
        color?.(f, th, top, c);
        col.push(c.r, c.g, c.b);
        row.push(pos.length / 3 - 1);
      }
      rows.push(row);
    }
    for (let j = 0; j < segments; j++) {
      const a = rows[0][j], b = rows[0][(j + 1) % segments];
      if (top) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < segments; j++) {
        const A = rows[i][j], B = rows[i][(j + 1) % segments], Cc = rows[i + 1][(j + 1) % segments], D = rows[i + 1][j];
        if (top) idx.push(A, B, D, B, Cc, D);
        else idx.push(A, D, B, B, D, Cc);
      }
    }
  };
  surface(true);
  if (!topOnly) surface(false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A chamfered cube (44 triangles, crisp facets) for diced vegetables. */
export function dice(sx: number, sy: number, sz: number, chamfer: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  for (const X of [-1, 1]) for (const Y of [-1, 1]) for (const Z of [-1, 1]) {
    pts.push(new THREE.Vector3(X * hx, Y * (hy - chamfer), Z * (hz - chamfer)));
    pts.push(new THREE.Vector3(X * (hx - chamfer), Y * hy, Z * (hz - chamfer)));
    pts.push(new THREE.Vector3(X * (hx - chamfer), Y * (hy - chamfer), Z * hz));
  }
  const g = new ConvexGeometry(pts);
  g.deleteAttribute('uv');
  return g;
}

/**
 * A thin rectangular plate with a fine top/bottom grid (so it can be bent and draped), soft
 * rounded corners in plan and closed rims. Centred on the origin, thickness along Y.
 */
export function plate2(w: number, d: number, thick: number, n: number, corner = 0.06): THREE.BufferGeometry {
  // Build the outline as a rounded rectangle sampled as a polar-free grid: map a square grid
  // onto the rounded rectangle by pulling the corners in.
  const pos: number[] = [];
  const idx: number[] = [];
  const hw = w / 2, hd = d / 2;
  const roundCorner = (x: number, z: number): [number, number] => {
    // pull points that fall outside the rounded corner back onto it
    const cx = hw - corner, cz = hd - corner;
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax > cx && az > cz) {
      const dx = ax - cx, dz = az - cz;
      const l = Math.hypot(dx, dz);
      const k = l > corner ? corner / l : 1;
      return [Math.sign(x) * (cx + dx * k), Math.sign(z) * (cz + dz * k)];
    }
    return [x, z];
  };
  const layer = (y: number): number[][] => {
    const rows: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const row: number[] = [];
      for (let j = 0; j <= n; j++) {
        const [x, z] = roundCorner(-hw + (w * i) / n, -hd + (d * j) / n);
        pos.push(x, y, z);
        row.push(pos.length / 3 - 1);
      }
      rows.push(row);
    }
    return rows;
  };
  const top = layer(thick / 2), bot = layer(-thick / 2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      idx.push(top[i][j], top[i][j + 1], top[i + 1][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]);
      idx.push(bot[i][j], bot[i + 1][j], bot[i][j + 1], bot[i][j + 1], bot[i + 1][j], bot[i + 1][j + 1]);
    }
  }
  // rim: walk the boundary of the grid
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) ring.push([i, 0]);
  for (let j = 0; j < n; j++) ring.push([n, j]);
  for (let i = n; i > 0; i--) ring.push([i, n]);
  for (let j = n; j > 0; j--) ring.push([0, j]);
  for (let k = 0; k < ring.length; k++) {
    const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % ring.length];
    const a = top[i0][j0], b = top[i1][j1], c = bot[i1][j1], dd = bot[i0][j0];
    idx.push(a, b, dd, b, c, dd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- assembly

const KEEP = new Set(['position', 'normal', 'color']);

function prepare(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.index) {
    const count = g.getAttribute('position').count;
    const index = new Array<number>(count);
    for (let i = 0; i < count; i++) index[i] = i;
    g.setIndex(index);
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

function finalize(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const prepared = parts.map(prepare);
  const merged = mergeGeometries(prepared, false);
  for (const p of prepared) p.dispose();
  if (!merged) throw new Error('food: could not merge parts');
  const welded = mergeVertices(merged, 1e-5);
  merged.dispose();
  welded.computeBoundingBox();
  welded.computeBoundingSphere();
  return welded;
}

/** Collects painted parts of one model and bakes them into one geometry per finish. */
export class Kit {
  private parts: Record<Finish, THREE.BufferGeometry[]> = { matte: [], gloss: [] };
  private xf: THREE.Matrix4 | null = null;

  /** Add a part. It is painted in its own (local) coordinates, then the current transform applies. */
  add(geo: THREE.BufferGeometry, how?: Paint, finish: Finish = 'matte'): this {
    if (how !== undefined) paint(geo, how);
    else if (!geo.getAttribute('color')) throw new Error('food: unpainted part');
    if (this.xf) geo.applyMatrix4(this.xf);
    this.parts[finish].push(geo);
    return this;
  }

  /** Add the parts created in `fn` under an extra transform (nested calls compose). */
  within(m: THREE.Matrix4, fn: () => void): this {
    const prev = this.xf;
    this.xf = prev ? prev.clone().multiply(m) : m.clone();
    try {
      fn();
    } finally {
      this.xf = prev;
    }
    return this;
  }

  /** Add the baked geometry of another model, transformed (used to assemble dishes). */
  addBaked(geo: FoodGeometry, matrix: THREE.Matrix4): this {
    const m = this.xf ? this.xf.clone().multiply(matrix) : matrix;
    for (const finish of ['matte', 'gloss'] as const) {
      const g = geo[finish];
      if (g) this.parts[finish].push(g.clone().applyMatrix4(m));
    }
    return this;
  }

  /** Bounding box of everything added so far. */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const finish of ['matte', 'gloss'] as const) {
      for (const g of this.parts[finish]) {
        g.computeBoundingBox();
        box.union(g.boundingBox!);
      }
    }
    return box;
  }

  /** Move everything added so far so its footprint is centred on the origin (x and z). */
  centerXZ(): this {
    const box = this.bounds();
    const dx = -(box.min.x + box.max.x) / 2, dz = -(box.min.z + box.max.z) / 2;
    for (const finish of ['matte', 'gloss'] as const) for (const g of this.parts[finish]) g.translate(dx, 0, dz);
    return this;
  }

  bake(ground = true): FoodGeometry {
    const out: FoodGeometry = { matte: finalize(this.parts.matte), gloss: finalize(this.parts.gloss) };
    this.parts.matte = [];
    this.parts.gloss = [];
    if (ground) {
      let minY = Infinity;
      for (const g of [out.matte, out.gloss]) if (g) minY = Math.min(minY, g.boundingBox!.min.y);
      if (Number.isFinite(minY) && Math.abs(minY) > 1e-7) {
        for (const g of [out.matte, out.gloss]) {
          if (!g) continue;
          g.translate(0, -minY, 0);
          g.computeBoundingBox();
          g.computeBoundingSphere();
        }
      }
    }
    return out;
  }
}

export function triangles(geo: FoodGeometry): number {
  let n = 0;
  for (const g of [geo.matte, geo.gloss]) if (g) n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  return n;
}
