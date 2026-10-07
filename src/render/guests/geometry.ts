import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A flat colour, or a function of the part's local vertex position (gradients, soft edges). */
export type Paint = THREE.ColorRepresentation | ((p: THREE.Vector3, out: THREE.Color) => void);

const tmpColor = new THREE.Color();
const tmpPoint = new THREE.Vector3();

/**
 * Non-indexed copy holding only position, normal and colour, so any two parts can be merged.
 * Normals are kept from the source geometry: parts stay smoothly shaded after merging.
 */
export function paint(geo: THREE.BufferGeometry, color: Paint): THREE.BufferGeometry {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.clearGroups();
  const position = g.getAttribute('position');
  const values = new Float32Array(position.count * 3);
  if (typeof color === 'function') {
    for (let i = 0; i < position.count; i++) {
      tmpPoint.fromBufferAttribute(position, i);
      color(tmpPoint, tmpColor);
      values[i * 3] = tmpColor.r;
      values[i * 3 + 1] = tmpColor.g;
      values[i * 3 + 2] = tmpColor.b;
    }
  } else {
    tmpColor.set(color);
    for (let i = 0; i < position.count; i++) {
      values[i * 3] = tmpColor.r;
      values[i * 3 + 1] = tmpColor.g;
      values[i * 3 + 2] = tmpColor.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return g;
}

/** Merge painted parts into one geometry and release the parts. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!parts.length) {
    const empty = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) empty.setAttribute(name, new THREE.Float32BufferAttribute([], 3));
    return empty;
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('guest parts could not be merged');
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function triangles(geo: THREE.BufferGeometry): number {
  return (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
}

export function ellipsoid(rx: number, ry: number, rz: number, w = 12, h = 8): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

/** Half an ellipsoid bulging towards +z: eyes, blush, pads. The open side faces -z. */
export function dome(rx: number, ry: number, depth: number, w = 14, h = 5): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  g.scale(rx, ry, depth);
  return g;
}

/** A surface of revolution around +y from (radius, height) pairs. */
export function lathe(profile: number[][], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segments);
}

/** A tube with a varying radius along a smooth curve; rounded ends are optional. */
export function sweep(
  points: THREE.Vector3[],
  radius: (t: number) => number,
  segments = 10,
  radial = 6,
  caps = true,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = radius(t);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      positions.push(p.x + r * (c * n.x + s * b.x), p.y + r * (c * n.y + s * b.y), p.z + r * (c * n.z + s * b.z));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  tube.setIndex(indices);
  tube.computeVertexNormals();
  if (!caps) return tube;
  const parts = [tube];
  for (const t of [0, 1]) {
    const cap = new THREE.SphereGeometry(Math.max(1e-4, radius(t)), radial, 3);
    curve.getPointAt(t, p);
    cap.translate(p.x, p.y, p.z);
    parts.push(cap);
  }
  const flat = parts.map((g) => {
    const f = g.toNonIndexed();
    g.dispose();
    for (const name of Object.keys(f.attributes)) if (name !== 'position' && name !== 'normal') f.deleteAttribute(name);
    return f;
  });
  const merged = mergeGeometries(flat, false)!;
  flat.forEach((g) => g.dispose());
  return merged;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Basis that turns a part built facing +z (up = +y) to face `normal` at `position`. */
export function frameAt(position: THREE.Vector3, normal: THREE.Vector3, roll = 0): THREE.Matrix4 {
  const z = normal.clone().normalize();
  const x = new THREE.Vector3().crossVectors(UP, z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  if (roll) m.multiply(new THREE.Matrix4().makeRotationZ(roll));
  return m.setPosition(position);
}

/** A raised, rounded blob on the head: a muzzle, a cheek, a patch of fur. Offsets are in world units. */
export interface Bump {
  theta: number;
  phi: number;
  /** half sizes along the surface (sideways, up) */
  a: number;
  b: number;
  height: number;
  roll: number;
  /** larger = flatter top and steeper rim */
  power: number;
}

/**
 * The head as a parametric surface: theta = azimuth (0 faces +z, positive towards +x), phi = elevation.
 * Faces and markings are placed in this parameter space so they hug the chubby, non-spherical head
 * exactly, and features on a muzzle (nose, mouth) follow the muzzle's height.
 */
export class HeadShape {
  readonly bumps: Bump[] = [];

  constructor(
    readonly rx: number,
    readonly ry: number,
    readonly rz: number,
    /** extra width of the lower face: chibi cheeks */
    readonly cheek = 0.08,
    /** vertical scale of the lower half: < 1 flattens the chin */
    readonly chin = 0.92,
  ) {}

  point(theta: number, phi: number, out = new THREE.Vector3()): THREE.Vector3 {
    const p = clampPhi(phi);
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    const full = 1 + this.cheek * Math.exp(-(((p + 0.42) / 0.42) ** 2));
    const y = this.ry * sp * (sp < 0 ? this.chin : 1);
    return out.set(this.rx * cp * Math.sin(theta) * full, y, this.rz * cp * Math.cos(theta) * (1 + this.cheek * 0.35 * Math.exp(-(((p + 0.3) / 0.5) ** 2))));
  }

  normal(theta: number, phi: number, out = new THREE.Vector3()): THREE.Vector3 {
    const d = 1e-3;
    const p = clampPhi(phi);
    const a = this.point(theta + d, p, new THREE.Vector3()).sub(this.point(theta - d, p, new THREE.Vector3()));
    const b = this.point(theta, p + d, new THREE.Vector3()).sub(this.point(theta, p - d, new THREE.Vector3()));
    out.crossVectors(a, b).normalize();
    // Keep it pointing out of the head.
    if (out.dot(this.point(theta, p, tmpPoint)) < 0) out.negate();
    return out;
  }

  /** Total height of the bumps at a point, so decals sit on top of muzzles and cheeks. */
  bumpHeight(theta: number, phi: number, only?: Bump[]): number {
    let h = 0;
    for (const bump of only ?? this.bumps) {
      const [u, v] = this.toTangent(bump.theta, bump.phi, theta, phi);
      const c = Math.cos(-bump.roll);
      const s = Math.sin(-bump.roll);
      const x = (u * c - v * s) / bump.a;
      const y = (u * s + v * c) / bump.b;
      const r2 = x * x + y * y;
      if (r2 < 1) h += bump.height * Math.pow(1 - r2, bump.power);
    }
    return h;
  }

  /** Surface point including bumps, lifted by `lift` along the normal. */
  skin(theta: number, phi: number, lift = 0, out = new THREE.Vector3(), only?: Bump[]): THREE.Vector3 {
    const n = this.normal(theta, phi, new THREE.Vector3());
    return this.point(theta, phi, out).addScaledVector(n, lift + this.bumpHeight(theta, phi, only));
  }

  /** Approximate parameter-space position of a point offset (u right, v up, in world units) from (theta0, phi0). */
  fromTangent(theta0: number, phi0: number, u: number, v: number): [number, number] {
    const p = clampPhi(phi0);
    const width = this.rx * Math.max(0.2, Math.cos(p)) * (1 + this.cheek * Math.exp(-(((p + 0.42) / 0.42) ** 2)));
    return [theta0 + u / width, phi0 + v / (this.ry * (phi0 < 0 ? this.chin : 1))];
  }

  toTangent(theta0: number, phi0: number, theta: number, phi: number): [number, number] {
    const p = clampPhi(phi0);
    const width = this.rx * Math.max(0.2, Math.cos(p)) * (1 + this.cheek * Math.exp(-(((p + 0.42) / 0.42) ** 2)));
    return [(theta - theta0) * width, (phi - phi0) * this.ry * (phi0 < 0 ? this.chin : 1)];
  }

  /** Placement matrix at a surface point: +z out of the head, +y up along the face. */
  frame(theta: number, phi: number, lift = 0, roll = 0): THREE.Matrix4 {
    const n = this.normal(theta, phi);
    const pos = this.skin(theta, phi, lift);
    return frameAt(pos, n, roll);
  }

  /** The head itself: a smooth UV-sphere-like blob with a hidden seam at the back. */
  geometry(segments = 24, rings = 14): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const p = new THREE.Vector3();
    for (let j = 0; j <= rings; j++) {
      const phi = -Math.PI / 2 + (j / rings) * Math.PI;
      for (let i = 0; i <= segments; i++) {
        const theta = -Math.PI + (i / segments) * Math.PI * 2;
        this.point(theta, phi, p);
        positions.push(p.x, p.y, p.z);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * (segments + 1) + i;
        const b = a + segments + 1;
        if (j > 0) indices.push(a, a + 1, b);
        if (j < rings - 1) indices.push(a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    // Seam and pole vertices are duplicated: use the analytic normal everywhere instead.
    const normal = g.getAttribute('normal') as THREE.BufferAttribute;
    const n = new THREE.Vector3();
    for (let j = 0; j <= rings; j++) {
      const phi = -Math.PI / 2 + (j / rings) * Math.PI;
      for (let i = 0; i <= segments; i++) {
        const theta = -Math.PI + (i / segments) * Math.PI * 2;
        if (j === 0) n.set(0, -1, 0);
        else if (j === rings) n.set(0, 1, 0);
        else this.normal(theta, phi, n);
        normal.setXYZ(j * (segments + 1) + i, n.x, n.y, n.z);
      }
    }
    return g;
  }

  /**
   * A patch hugging the head: a polar grid around (theta, phi) with half sizes a × b (world units).
   * With `bump` it is that raised blob; otherwise a thin decal lifted above whatever is underneath.
   * `color` receives the radial fraction f (0 centre … 1 rim) for soft-edged markings.
   */
  patch(
    theta: number,
    phi: number,
    a: number,
    b: number,
    color: (f: number, out: THREE.Color) => void,
    opts: { roll?: number; lift?: number; rings?: number; segments?: number; under?: Bump[] } = {},
  ): THREE.BufferGeometry {
    const roll = opts.roll ?? 0;
    const lift = opts.lift ?? 0.004;
    const rings = opts.rings ?? 3;
    const segments = opts.segments ?? 14;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const push = (u: number, v: number, f: number) => {
      const [t, ph] = this.fromTangent(theta, phi, u * cr - v * sr, u * sr + v * cr);
      this.skin(t, ph, lift, p, opts.under);
      positions.push(p.x, p.y, p.z);
      color(f, c);
      colors.push(c.r, c.g, c.b);
    };
    push(0, 0, 0);
    for (let r = 1; r <= rings; r++) {
      const f = r / rings;
      for (let s = 0; s < segments; s++) {
        const ang = (s / segments) * Math.PI * 2;
        push(a * f * Math.cos(ang), b * f * Math.sin(ang), f);
      }
    }
    for (let s = 0; s < segments; s++) indices.push(0, 1 + s, 1 + ((s + 1) % segments));
    for (let r = 1; r < rings; r++) {
      const inner = 1 + (r - 1) * segments;
      const outer = inner + segments;
      for (let s = 0; s < segments; s++) {
        const s1 = (s + 1) % segments;
        indices.push(inner + s, outer + s, outer + s1, inner + s, outer + s1, inner + s1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const flat = g.toNonIndexed();
    g.dispose();
    return flat;
  }

  /** Register a raised blob; later skin() and decals take its height into account. */
  addBump(theta: number, phi: number, a: number, b: number, height: number, roll = 0, power = 1.4): Bump {
    const bump = { theta, phi, a, b, height, roll, power };
    this.bumps.push(bump);
    return bump;
  }

  /** The visible surface of a bump, coloured by radial fraction. */
  bumpGeometry(bump: Bump, color: (f: number, out: THREE.Color) => void, rings = 4, segments = 16): THREE.BufferGeometry {
    return this.patch(bump.theta, bump.phi, bump.a, bump.b, color, { roll: bump.roll, lift: 0.002, rings, segments });
  }

  /**
   * A drawn line on the face (mouth, whisker root, brow): a thin tube through tangent-plane points
   * (u, v) around (theta, phi), lifted just above the skin.
   */
  line(theta: number, phi: number, pts: number[][], radius: number, lift = 0.004, segments = 12, caps = false): THREE.BufferGeometry {
    const points = pts.map(([u, v]) => {
      const [t, ph] = this.fromTangent(theta, phi, u, v);
      return this.skin(t, ph, lift + radius * 0.4);
    });
    return sweep(points, () => radius, segments, 4, caps);
  }
}

function clampPhi(phi: number): number {
  const lim = Math.PI / 2 - 1e-3;
  return phi < -lim ? -lim : phi > lim ? lim : phi;
}

/** Linear blend of two colours by t, written into out. */
export function mix(a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color): THREE.Color {
  return out.copy(a).lerp(b, t);
}
