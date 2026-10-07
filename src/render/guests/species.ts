import * as THREE from 'three';
import { HeadShape, dome, ellipsoid, frameAt, lathe, merge, paint, sweep, type Bump } from './geometry';
import { SeededRandom, smooth } from './anim';

export type GuestKind = 'bear' | 'cat' | 'fox' | 'bunny' | 'panda' | 'frog' | 'pig' | 'raccoon';
export const GUEST_KINDS: GuestKind[] = ['bear', 'cat', 'fox', 'bunny', 'panda', 'frog', 'pig', 'raccoon'];

/**
 * Where a guest expects the world to be, in its own frame (origin = centre of the seat, +z = towards
 * the chef). The counter in front hides everything below `counterTop`; paws rest on it.
 */
export const GUEST_LAYOUT = Object.freeze({
  /** Height of the counter top the paws rest on. */
  counterTop: 0.55,
  /** The counter's near edge (towards the guest): keep it at or in front of this z. */
  counterEdgeZ: 0.27,
  /** Where a served dish sits; eat() leans in towards it. */
  dishZ: 0.82,
  /** Distance between neighbouring seats. */
  spacing: 1.3,
  /** Top of the head (ears may rise above it). */
  headTop: 1.6,
});

/** Paw centres rest this high: on the counter, slightly sunk in by their own weight. */
export const PAW_REST_Y = GUEST_LAYOUT.counterTop + 0.062;

export interface EarPart {
  geometry: THREE.BufferGeometry;
  /** pivot in the face frame (head centre = origin) */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** twitch axis in the ear's own frame */
  axis: THREE.Vector3;
  /** twitch amplitude (radians) */
  amp: number;
  /** -1 = guest's right (screen left), +1 = guest's left */
  side: number;
}

export interface ArmPart {
  /** along +z from the shoulder pivot */
  geometry: THREE.BufferGeometry;
  shoulder: THREE.Vector3;
  /** shoulder → paw centre */
  length: number;
  side: number;
  /** rest turn of the arm around the vertical (paws a little closer together) */
  yaw: number;
}

export interface GuestModel {
  /** body frame: origin at the seat */
  torso: THREE.BufferGeometry;
  /** face frame: origin at the head centre */
  head: THREE.BufferGeometry;
  headCenter: THREE.Vector3;
  /** nod / tilt pivot, body frame */
  headPivot: THREE.Vector3;
  eyes: THREE.BufferGeometry;
  glints: THREE.BufferGeometry;
  arcs: THREE.BufferGeometry;
  /** face frame; eyes, glints and arcs are built around it (near the lower lid, so blinks close downwards) */
  eyesOrigin: THREE.Vector3;
  /** light arches on dark eye patches: drawn unlit so they stay bright */
  lightArcs: boolean;
  /** face frame; the eyes rotate around it to look around */
  gazePivot: THREE.Vector3;
  gazeRange: number;
  mouth: THREE.BufferGeometry;
  mouthMatrix: THREE.Matrix4;
  /** face frame, origin at the head centre (puffing scales them away from it) */
  cheeks: THREE.BufferGeometry;
  ears: EarPart[];
  arms: ArmPart[];
  /** extra pitch towards the chef at rest (radians, positive = face up) */
  restPitch: number;
}

interface Look {
  coat: string;
  /** muzzle, chest, cheek fluff */
  light: string;
  nose: string;
  mouth: string;
  inner: string;
  blush: string;
  paw: string;
  arm: string;
  /** napkin colours that contrast with the coat; the seed picks one, the first is the classic */
  napkins: string[];
  trim: string;
}

const LOOKS: Record<GuestKind, Look> = {
  bear: { coat: '#b9794b', light: '#f3d3a6', nose: '#3a2925', mouth: '#4a2f2a', inner: '#e8ae84', blush: '#ff8d96', paw: '#b9794b', arm: '#b9794b', napkins: ['#ee5a57', '#4fc3b9', '#ffcd4f', '#71aef2'], trim: '#fff6ea' },
  cat: { coat: '#a9b2cb', light: '#fbf8f4', nose: '#f1849c', mouth: '#5b4d5f', inner: '#f7a9bb', blush: '#ff9bb0', paw: '#fbf8f4', arm: '#a9b2cb', napkins: ['#ffcd4f', '#ee5a57', '#7fd18b', '#ffad45'], trim: '#fff6ea' },
  fox: { coat: '#f07f33', light: '#fff6ea', nose: '#2b2127', mouth: '#4b2b2a', inner: '#ffe0c4', blush: '#ff8f8f', paw: '#4a3433', arm: '#f07f33', napkins: ['#4fc3b9', '#71aef2', '#b98be8', '#7fd18b'], trim: '#fff6ea' },
  bunny: { coat: '#fbf3eb', light: '#ffffff', nose: '#f17d99', mouth: '#7a5560', inner: '#f8adbf', blush: '#ff9fb4', paw: '#fbf3eb', arm: '#fbf3eb', napkins: ['#71aef2', '#ee5a57', '#ffcd4f', '#b98be8'], trim: '#fff6ea' },
  panda: { coat: '#faf8f3', light: '#ffffff', nose: '#2e2a33', mouth: '#2e2a33', inner: '#4a4552', blush: '#ffa3b3', paw: '#2e2a33', arm: '#2e2a33', napkins: ['#ee5a57', '#4fc3b9', '#ffcd4f', '#7fd18b'], trim: '#fff6ea' },
  frog: { coat: '#7fcc5b', light: '#eef6bd', nose: '#3e5e2c', mouth: '#3a5a2a', inner: '#7fcc5b', blush: '#ff99a6', paw: '#7fcc5b', arm: '#7fcc5b', napkins: ['#ffcd4f', '#ee5a57', '#71aef2', '#ffad45'], trim: '#fff6ea' },
  pig: { coat: '#f7b2c0', light: '#f493a9', nose: '#c45b77', mouth: '#a8506a', inner: '#f190a8', blush: '#ff7f9c', paw: '#e88aa0', arm: '#f7b2c0', napkins: ['#64b3ea', '#7fd18b', '#ffcd4f', '#4fc3b9'], trim: '#fff6ea' },
  raccoon: { coat: '#a39ca4', light: '#f8f4ef', nose: '#29252e', mouth: '#2f2a33', inner: '#4a4450', blush: '#ff9eae', paw: '#3b3640', arm: '#a39ca4', napkins: ['#ffad45', '#ee5a57', '#4fc3b9', '#b98be8'], trim: '#fff6ea' },
};

const EYE_DARK = new THREE.Color('#1d1626');
const EYE_DEEP = new THREE.Color('#54344d');

/** Torso cross-sections (radius, height); depth is squashed so the guest sits close to the counter. */
const TORSO: number[][] = [
  [0, 0], [0.2, 0], [0.29, 0.05], [0.34, 0.15], [0.355, 0.28], [0.335, 0.42],
  [0.3, 0.56], [0.258, 0.66], [0.2, 0.75], [0.12, 0.83], [0, 0.865],
];
const TORSO_DEPTH = 0.84;
const TORSO_Z = -0.03;

function torsoRadius(y: number): number {
  for (let i = 1; i < TORSO.length; i++) {
    const [r1, y1] = TORSO[i];
    if (y <= y1) {
      const [r0, y0] = TORSO[i - 1];
      return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
    }
  }
  return 0;
}

/** Shared pieces of colour math. */
const col = (hex: string) => new THREE.Color(hex);
const solid = (hex: string) => {
  const c = col(hex);
  return (_f: number, out: THREE.Color) => out.copy(c);
};
/** Soft-edged marking: `inner` in the middle, fading to `outer` over the outer part of the rim. */
const soft = (inner: string, outer: string, from = 0.45) => {
  const a = col(inner);
  const b = col(outer);
  return (f: number, out: THREE.Color) => out.copy(a).lerp(b, smooth((f - from) / (1 - from)));
};

/** Collects painted parts per mesh while a guest is being assembled. */
class Parts {
  torso: THREE.BufferGeometry[] = [];
  head: THREE.BufferGeometry[] = [];
  eyes: THREE.BufferGeometry[] = [];
  glints: THREE.BufferGeometry[] = [];
  arcs: THREE.BufferGeometry[] = [];
  cheeks: THREE.BufferGeometry[] = [];
  mouth: THREE.BufferGeometry[] = [];
}

interface EyeSpot {
  matrix: THREE.Matrix4;
  rx: number;
  ry: number;
  depth: number;
  /** for happy arcs drawn on the skin */
  theta: number;
  phi: number;
  /** frog eyes sit on their own dome instead of the head skin */
  dome?: { center: THREE.Vector3; radii: THREE.Vector3 };
}

/** Ear shapes in their own frame: base at the origin, rising along +y, front facing +z. */
function earGeometry(
  type: 'round' | 'pointy' | 'long' | 'floppy',
  w: number,
  h: number,
  d: number,
  outer: string,
  inner: string,
  opts: { tip?: string; rim?: string; bend?: number } = {},
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (type === 'round') {
    const o = ellipsoid(w, h, d, 12, 7);
    o.translate(0, h * 0.72, 0);
    parts.push(paint(o, outer));
    const i = ellipsoid(w * 0.6, h * 0.56, d * 0.45, 8, 5);
    i.translate(0, h * 0.74, d * 0.6);
    parts.push(paint(i, inner));
    return merge(parts);
  }
  const profile =
    type === 'long'
      ? [[0, 0], [0.72, 0], [0.95, 0.14], [1, 0.4], [0.93, 0.64], [0.72, 0.84], [0.38, 0.97], [0, 1]]
      : [[0, 0], [1, 0], [0.97, 0.2], [0.76, 0.5], [0.42, 0.8], [0.14, 0.97], [0, 1]];
  const shape = (scaleR: number, scaleY: number, depth: number) => {
    const g = lathe(profile.map(([r, y]) => [r * w * scaleR, y * h * scaleY]), 10);
    g.scale(1, 1, depth / (w * scaleR));
    return g;
  };
  const bend = opts.bend ?? 0;
  const bendGeo = (g: THREE.BufferGeometry) => {
    if (!bend) return g;
    // Curl progressively above the lower third: floppy pig ears and a bunny's folded ear.
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const y0 = h * 0.35;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      if (y <= y0) continue;
      const s = y - y0;
      const a = bend * (s / (h - y0));
      const z = pos.getZ(k);
      pos.setY(k, y0 + s * Math.cos(a) - z * Math.sin(a) * 0.3);
      pos.setZ(k, z * Math.cos(a) + s * Math.sin(a));
    }
    g.computeVertexNormals();
    return g;
  };
  const tipColor = opts.tip ? col(opts.tip) : null;
  const outerColor = col(outer);
  const o = bendGeo(shape(1, 1, d));
  parts.push(
    paint(o, (p, out) => {
      out.copy(outerColor);
      if (tipColor) {
        const k = smooth((p.y - h * 0.7) / (h * 0.12));
        out.lerp(tipColor, k);
      }
    }),
  );
  const i = shape(0.6, 0.78, d * 0.32);
  i.translate(0, h * 0.06, d * 0.62);
  parts.push(paint(bendGeo(i), inner));
  return merge(parts);
}

/**
 * Ear pivot at a point of the head (theta, phi). Its direction is given in the head frame, not by the
 * surface normal: `splay` tilts it outwards, `lean` back. Ears that lean back with the raised head
 * stand clear of the silhouette in the steep game camera instead of pointing straight at it.
 */
function earPart(
  shape: HeadShape,
  theta: number,
  phi: number,
  geometry: THREE.BufferGeometry,
  opts: { sink?: number; splay?: number; lean?: number; yaw?: number; axis?: THREE.Vector3; amp?: number },
): EarPart {
  const side = Math.sign(theta) || 1;
  const n = shape.normal(theta, phi);
  const p = shape.point(theta, phi).addScaledVector(n, -(opts.sink ?? 0.03));
  const splay = opts.splay ?? 0;
  const lean = opts.lean ?? 0;
  const y = new THREE.Vector3(side * Math.sin(splay) * Math.cos(lean), Math.cos(splay) * Math.cos(lean), -Math.sin(lean)).normalize();
  const z = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  if (opts.yaw) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * opts.yaw));
  return { geometry, position: p, quaternion: q, axis: (opts.axis ?? new THREE.Vector3(1, 0, 0)).clone(), amp: opts.amp ?? 0.35, side };
}

/** A dark glossy bead with a soft lower gradient, an optional white rim, and two catch-lights. */
function bead(parts: Parts, e: EyeSpot, ring?: string): void {
  const painted = paint(dome(e.rx, e.ry, e.depth, 14, 4), (p, out) =>
    out.copy(EYE_DARK).lerp(EYE_DEEP, smooth((-p.y / e.ry - 0.15) / 0.85) * 0.85),
  );
  painted.applyMatrix4(e.matrix);
  parts.eyes.push(painted);
  if (ring) {
    const rim = dome(e.rx + 0.01, e.ry + 0.01, e.depth * 0.7, 14, 3);
    rim.translate(0, 0, -0.004);
    const r = paint(rim, ring);
    r.applyMatrix4(e.matrix);
    parts.eyes.push(r);
  }
  // Catch-lights sit on the bead's surface: a big one up and towards the light, a small one opposite.
  for (const [u, v, r] of [[-0.34, 0.36, 0.34], [0.33, -0.34, 0.15]]) {
    const gx = u * e.rx;
    const gy = v * e.ry;
    const gz = e.depth * Math.sqrt(Math.max(0, 1 - u * u - v * v)) + 0.003;
    const disc = new THREE.CircleGeometry(r * e.rx, 10);
    const normal = new THREE.Vector3(gx / (e.rx * e.rx), gy / (e.ry * e.ry), gz / (e.depth * e.depth)).normalize();
    disc.applyMatrix4(frameAt(new THREE.Vector3(gx, gy, gz), normal));
    const g = paint(disc, '#ffffff');
    g.applyMatrix4(e.matrix);
    parts.glints.push(g);
  }
}

/** Points of the ^ arch used for joy and chewing, in the eye's own plane. */
function archPoints(e: EyeSpot): number[][] {
  const pts: number[][] = [];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI * (0.1 + (0.8 * k) / 8);
    pts.push([Math.cos(a) * e.rx * 0.95, Math.sin(a) * e.ry * 0.62 - e.ry * 0.2]);
  }
  return pts;
}

/** Eyes on the head skin: the happy arches are drawn on the skin where each bead sits. */
function addEyes(parts: Parts, shape: HeadShape, spots: EyeSpot[], ring?: string): void {
  for (const e of spots) {
    bead(parts, e, ring);
    // On a dark eye patch the arches are drawn light, or they would vanish into the patch.
    parts.arcs.push(paint(shape.line(e.theta, e.phi, archPoints(e), 0.017, 0.006, 10, true), ring ? '#fff4ea' : '#2a1f2c'));
  }
}

/** Frog beads sit on their own domes, so the arches follow the dome instead of the head. */
function addDomeEyes(parts: Parts, spots: EyeSpot[]): void {
  for (const e of spots) {
    bead(parts, e);
    const d = e.dome!;
    const pts = archPoints(e).map(([u, v]) => {
      const rel = new THREE.Vector3(u, v, 0).applyMatrix4(e.matrix).sub(d.center);
      // Radial projection onto the dome ellipsoid, lifted a hair above it.
      rel.multiplyScalar(1 / Math.hypot(rel.x / d.radii.x, rel.y / d.radii.y, rel.z / d.radii.z));
      return rel.clone().addScaledVector(rel.clone().normalize(), 0.008).add(d.center);
    });
    parts.arcs.push(paint(sweep(pts, () => 0.017, 10, 4, true), '#2a1f2c'));
  }
}

/** Little mitten arm along +z with a round paw and three toe bumps on top. */
function armGeometry(length: number, arm: string, paw: string, opts: { pad?: string; fingers?: boolean } = {}): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shoulder = ellipsoid(0.088, 0.09, 0.09, 6, 4);
  parts.push(paint(shoulder, arm));
  const sleeve = sweep([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.004, length * 0.5), new THREE.Vector3(0, 0, length - 0.03)], (t) => 0.08 - 0.012 * t, 3, 8, false);
  parts.push(paint(sleeve, (p, out) => out.copy(col(arm)).lerp(col(paw), smooth((p.z - (length - 0.12)) / 0.08))));
  const hand = ellipsoid(0.094, 0.074, 0.098, 10, 6);
  hand.translate(0, -0.004, length);
  parts.push(paint(hand, paw));
  if (opts.fingers) {
    for (const x of [-0.05, 0, 0.05]) {
      const tip = ellipsoid(0.03, 0.026, 0.03, 6, 4);
      tip.translate(x, -0.02, length + 0.082 - Math.abs(x) * 0.35);
      parts.push(paint(tip, opts.pad ?? paw));
    }
  } else {
    for (const x of [-0.046, 0, 0.046]) {
      const toe = ellipsoid(0.03, 0.024, 0.028, 6, 3);
      toe.translate(x, 0.032, length + 0.064 - Math.abs(x) * 0.3);
      parts.push(paint(toe, opts.pad ?? paw));
    }
  }
  return merge(parts);
}

/** A napkin tied around the neck: a cloth triangle hugging the chest, with a trimmed collar. */
function napkin(color: string, trim: string, seed: SeededRandom): THREE.BufferGeometry {
  const rows = 6;
  const segs = 8;
  const top = 0.8;
  const bottom = 0.36;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  const cloth = col(color);
  const band = col(trim);
  const skew = seed.range(-0.05, 0.05);
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y = top + (bottom - top) * t;
    // narrow enough to sit on the chest between the arms, not over the shoulders
    const half = 0.8 * Math.pow(1 - t, 0.75) + 0.02;
    const lift = 0.014 + 0.012 * (1 - t) * (1 - t);
    const radius = torsoRadius(y) + lift;
    for (let s = 0; s <= segs; s++) {
      const a = skew * t + half * (s / segs - 0.5) * 2;
      positions.push(Math.sin(a) * radius, y - 0.012 * Math.cos((s / segs - 0.5) * Math.PI) * t, Math.cos(a) * radius * TORSO_DEPTH + TORSO_Z);
      c.copy(t < 0.13 ? band : cloth);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
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

interface Build {
  kind: GuestKind;
  look: Look;
  parts: Parts;
  shape: HeadShape;
  headCenter: THREE.Vector3;
  ears: EarPart[];
  eyes: EyeSpot[];
  eyeRing?: string;
  mouthFrame: THREE.Matrix4;
  rng: SeededRandom;
  /** where the eyes sit on the head (parameter space) */
  eyeTheta: number;
  eyePhi: number;
  gazePivot: THREE.Vector3;
  gazeRange: number;
}

function eyeSpot(shape: HeadShape, theta: number, phi: number, rx: number, ry: number, depth = 0.034, under?: Bump[]): EyeSpot {
  const n = shape.normal(theta, phi);
  const p = shape.skin(theta, phi, -depth * 0.32, new THREE.Vector3(), under);
  return { matrix: frameAt(p, n), rx, ry, depth, theta, phi };
}

/** Standard pair of eyes, a ω mouth on a muzzle, blush on puffable cheeks. */
function standardFace(b: Build, opts: { eyeTheta?: number; eyePhi?: number; rx?: number; ry?: number; cheekColor?: string; cheekTheta?: number; cheekPhi?: number } = {}): void {
  const { shape, parts, look } = b;
  const theta = opts.eyeTheta ?? 0.36;
  const phi = opts.eyePhi ?? -0.04;
  b.eyeTheta = theta;
  b.eyePhi = phi;
  for (const s of [-1, 1]) b.eyes.push(eyeSpot(shape, s * theta, phi, opts.rx ?? 0.078, opts.ry ?? 0.1, 0.036, []));
  // Puffable cheeks with soft blush on top.
  const cheekColor = opts.cheekColor ?? look.coat;
  const ct = opts.cheekTheta ?? 0.6;
  const cp = opts.cheekPhi ?? -0.3;
  for (const s of [-1, 1]) {
    const bump = shape.addBump(s * ct, cp, 0.12, 0.095, 0.03, 0, 1.6);
    parts.cheeks.push(shape.bumpGeometry(bump, solid(cheekColor), 3, 12));
    parts.cheeks.push(shape.patch(s * (ct - 0.02), cp + 0.03, 0.078, 0.05, soft(look.blush, cheekColor, 0.35), { lift: 0.005, rings: 2, segments: 12, under: [bump] }));
  }
}

/**
 * Open mouth: a dark oval with a tongue that hangs from the mouth line at `phi`, so scaling it
 * vertically drops the jaw (the animation hides it when closed).
 */
function mouthAt(b: Build, phi: number, lift = 0, width = 1): void {
  b.mouthFrame = b.shape.frame(0, phi, lift - 0.006);
  const inside = dome(0.068 * width, 0.064, 0.028, 14, 3);
  inside.translate(0, -0.056, 0);
  b.parts.mouth.push(paint(inside, '#6c2630'));
  const tongue = ellipsoid(0.042 * Math.min(width, 1.3), 0.026, 0.018, 8, 4);
  tongue.translate(0, -0.088, 0.014);
  b.parts.mouth.push(paint(tongue, '#f3818e'));
}

/** ω-shaped mouth line with a short philtrum down from the nose. */
function omegaMouth(b: Build, phi: number, color: string, width = 1, philtrum = true): void {
  const w = 0.05 * width;
  const pts = [[-w, 0.01], [-w * 0.72, -0.01], [-w * 0.34, -0.014], [0, 0.004], [w * 0.34, -0.014], [w * 0.72, -0.01], [w, 0.01]];
  b.parts.head.push(paint(b.shape.line(0, phi, pts, 0.0105, 0.003, 12), color));
  if (philtrum) b.parts.head.push(paint(b.shape.line(0, phi, [[0, 0.004], [0, 0.034]], 0.0095, 0.003, 2), color));
}

function noseBall(b: Build, phi: number, rx: number, ry: number, color: string, lift = 0.012): void {
  const m = b.shape.frame(0, phi, lift);
  const nose = ellipsoid(rx, ry, ry * 0.85, 10, 6);
  nose.applyMatrix4(m);
  b.parts.head.push(paint(nose, color));
  const shine = ellipsoid(rx * 0.32, ry * 0.22, 0.008, 6, 3);
  shine.translate(-rx * 0.25, ry * 0.42, ry * 0.75);
  shine.applyMatrix4(m);
  b.parts.head.push(paint(shine, '#ffffff'));
}

function addTail(parts: Parts, points: number[][], radius: (t: number) => number, color: string | ((t: number, out: THREE.Color) => void), segments = 8, radial = 7): void {
  const pts = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const g = sweep(pts, radius, segments, radial, true);
  if (typeof color === 'string') {
    parts.torso.push(paint(g, color));
    return;
  }
  // Colour along the tail by the nearest sample: rings on a raccoon, a white tip on a fox.
  const curve = new THREE.CatmullRomCurve3(pts);
  const samples = Array.from({ length: 41 }, (_, k) => curve.getPointAt(k / 40));
  parts.torso.push(
    paint(g, (p, out) => {
      let best = 0;
      let dist = Infinity;
      for (let k = 0; k < samples.length; k++) {
        const d = samples[k].distanceToSquared(p);
        if (d < dist) {
          dist = d;
          best = k;
        }
      }
      color(best / 40, out);
    }),
  );
}

function speciesHead(kind: GuestKind): { shape: HeadShape; center: THREE.Vector3 } {
  switch (kind) {
    case 'cat':
      return { shape: new HeadShape(0.475, 0.395, 0.405, 0.12, 0.9), center: new THREE.Vector3(0, 1.185, 0.03) };
    case 'fox':
      return { shape: new HeadShape(0.455, 0.405, 0.41, 0.13, 0.9), center: new THREE.Vector3(0, 1.18, 0.03) };
    case 'bunny':
      return { shape: new HeadShape(0.445, 0.405, 0.405, 0.1, 0.92), center: new THREE.Vector3(0, 1.17, 0.03) };
    case 'panda':
      return { shape: new HeadShape(0.48, 0.415, 0.415, 0.1, 0.9), center: new THREE.Vector3(0, 1.175, 0.03) };
    case 'frog':
      return { shape: new HeadShape(0.5, 0.355, 0.4, 0.06, 0.88), center: new THREE.Vector3(0, 1.135, 0.04) };
    case 'pig':
      return { shape: new HeadShape(0.47, 0.41, 0.41, 0.1, 0.92), center: new THREE.Vector3(0, 1.18, 0.03) };
    case 'raccoon':
      return { shape: new HeadShape(0.475, 0.405, 0.41, 0.13, 0.9), center: new THREE.Vector3(0, 1.185, 0.03) };
    default:
      return { shape: new HeadShape(0.47, 0.415, 0.415, 0.08, 0.92), center: new THREE.Vector3(0, 1.175, 0.03) };
  }
}

/** Build every geometry of one guest. Deterministic for a given kind and seed. */
export function buildGuestModel(kind: GuestKind, seed = 1): GuestModel {
  const look = LOOKS[kind];
  const rng = new SeededRandom(seed * 7919 + kind.length * 104729);
  const parts = new Parts();
  const { shape, center } = speciesHead(kind);
  const b: Build = {
    kind, look, parts, shape, headCenter: center, ears: [], eyes: [], mouthFrame: new THREE.Matrix4(), rng,
    eyeTheta: 0.36, eyePhi: -0.04, gazePivot: new THREE.Vector3(), gazeRange: 1,
  };

  // ---- Body: torso, napkin, feet, tail (all static, one mesh) ----
  const torsoGeo = lathe(TORSO, 12);
  torsoGeo.rotateY(Math.PI);
  torsoGeo.scale(1, 1, TORSO_DEPTH);
  torsoGeo.translate(0, 0, TORSO_Z);
  const coat = col(look.coat);
  const chest = col(kind === 'panda' ? look.coat : kind === 'frog' ? look.light : look.coat);
  const pandaBand = col('#2e2a33');
  parts.torso.push(
    paint(torsoGeo, (p, out) => {
      out.copy(coat);
      if (kind === 'panda') {
        // Black shoulders and back like a little vest; the belly stays white.
        const band = smooth((p.y - 0.42) / 0.08) * (1 - smooth((p.z - 0.05) / 0.12) * smooth((0.6 - p.y) / 0.2));
        out.lerp(pandaBand, band);
      } else if (kind === 'frog' || kind === 'fox' || kind === 'raccoon' || kind === 'cat') {
        const belly = smooth((p.z - 0.08) / 0.1) * (1 - smooth((p.y - 0.62) / 0.08));
        out.lerp(kind === 'frog' ? chest : col(look.light), belly);
      }
    }),
  );
  parts.torso.push(napkin(look.napkins[Math.floor(rng.next() * look.napkins.length)], look.trim, rng));
  // The napkin is tied around the neck: a rolled collar where head meets shoulders.
  const collar = new THREE.TorusGeometry(torsoRadius(0.79) + 0.014, 0.03, 5, 14);
  collar.rotateX(Math.PI / 2);
  collar.scale(1, 1, TORSO_DEPTH);
  collar.translate(0, 0.79, TORSO_Z);
  parts.torso.push(paint(collar, look.trim));
  const footColor = kind === 'panda' ? '#2e2a33' : kind === 'fox' || kind === 'raccoon' ? look.paw : look.coat;
  const padColor = kind === 'frog' ? look.light : kind === 'pig' ? look.paw : kind === 'panda' ? '#4a4552' : kind === 'bear' ? look.light : '#f6b8c4';
  for (const s of [-1, 1]) {
    const foot = ellipsoid(0.09, 0.072, 0.125, 7, 4);
    foot.rotateY(s * 0.22);
    foot.translate(s * 0.15, 0.07, 0.19);
    parts.torso.push(paint(foot, footColor));
    const pad = dome(0.055, 0.05, 0.02, 7, 2);
    pad.rotateY(s * 0.22);
    pad.translate(s * 0.175, 0.08, 0.305);
    parts.torso.push(paint(pad, padColor));
  }

  // ---- Head ----
  const headColor = col(look.coat);
  const lightColor = col(look.light);
  const headPaint = (p: THREE.Vector3, out: THREE.Color) => {
    out.copy(headColor);
    if (kind === 'frog') out.lerp(lightColor, smooth((-p.y - 0.13) / 0.08) * smooth((p.z + 0.05) / 0.2));
  };
  parts.head.push(paint(shape.geometry(24, 14), headPaint));

  b.gazePivot.set(0, 0, 0);
  const L = look;
  switch (kind) {
    case 'bear': {
      standardFace(b);
      const muzzle = shape.addBump(0, -0.31, 0.165, 0.118, 0.08, 0, 1.3);
      parts.head.push(shape.bumpGeometry(muzzle, solid(L.light)));
      noseBall(b, -0.215, 0.062, 0.043, L.nose, 0.002);
      omegaMouth(b, -0.37, L.mouth, 1);
      mouthAt(b, -0.355, 0.004);
      for (const s of [-1, 1]) {
        const g = earGeometry('round', 0.155, 0.145, 0.075, L.coat, L.inner);
        b.ears.push(earPart(shape, s * 0.8, 0.74, g, { sink: 0.06, splay: 0.62, lean: 0.05, yaw: 0.25, axis: new THREE.Vector3(1, 0, 0.4), amp: 0.32 }));
      }
      addTail(parts, [[0, 0.15, -0.3], [0, 0.17, -0.35]], () => 0.075, L.coat, 1, 6);
      break;
    }
    case 'cat': {
      standardFace(b, { eyeTheta: 0.37, cheekTheta: 0.62 });
      for (const s of [-1, 1]) {
        const puff = shape.addBump(s * 0.095, -0.33, 0.085, 0.066, 0.04, 0, 1.4);
        parts.head.push(shape.bumpGeometry(puff, solid(L.light), 3, 14));
      }
      const chin = shape.addBump(0, -0.47, 0.07, 0.05, 0.02);
      parts.head.push(shape.bumpGeometry(chin, solid(L.light), 3, 12));
      // A small pink nose (rounded triangle pointing down).
      {
        const m = shape.frame(0, -0.235, 0.004);
        const nose = new THREE.ConeGeometry(0.042, 0.05, 3, 1);
        nose.rotateZ(Math.PI);
        nose.scale(1, 0.75, 0.55);
        nose.translate(0, 0, 0.012);
        nose.applyMatrix4(m);
        parts.head.push(paint(nose, L.nose));
      }
      omegaMouth(b, -0.36, L.mouth, 0.95, true);
      mouthAt(b, -0.35, 0.02);
      // Whiskers stick out past the cheeks, so they read in silhouette.
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const [t0, p0] = shape.fromTangent(s * 0.16, -0.31, 0, -0.012 * k);
          const start = shape.skin(t0, p0, 0.0);
          const dir = new THREE.Vector3(s * 0.95, 0.12 - 0.12 * k, 0.32).normalize();
          const end = start.clone().addScaledVector(dir, 0.2);
          const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.01, 0.01));
          parts.head.push(paint(sweep([start, mid, end], (t) => 0.0062 * (1 - 0.55 * t), 4, 3, false), '#6d6577'));
        }
      }
      // Tabby forehead: three soft stripes.
      for (const [t, len] of [[-0.13, 0.08], [0, 0.11], [0.13, 0.08]]) {
        parts.head.push(shape.patch(t, 0.62, 0.028, len, soft('#8b93ae', L.coat, 0.55), { roll: -t * 1.2, lift: 0.003, rings: 2, segments: 10 }));
      }
      for (const s of [-1, 1]) {
        const g = earGeometry('pointy', 0.14, 0.28, 0.06, L.coat, L.inner);
        b.ears.push(earPart(shape, s * 0.6, 0.76, g, { sink: 0.05, splay: 0.42, lean: 0.08, yaw: 0.2, axis: new THREE.Vector3(0, 0, 1), amp: 0.4 }));
      }
      addTail(parts, [[0.04, 0.12, -0.3], [-0.2, 0.08, -0.3], [-0.36, 0.07, -0.08], [-0.32, 0.08, 0.16], [-0.18, 0.08, 0.26]], (t) => 0.055 - 0.012 * t, (t, out) => out.copy(col(L.coat)).lerp(col('#7f88a2'), t > 0.82 ? 1 : 0), 10, 6);
      break;
    }
    case 'fox': {
      standardFace(b, { eyeTheta: 0.35, eyePhi: -0.02, cheekColor: L.light, cheekTheta: 0.58, cheekPhi: -0.33 });
      // White cheek fluff that points outward, and a snout that pokes forward.
      for (const s of [-1, 1]) {
        parts.head.push(shape.patch(s * 0.36, -0.36, 0.2, 0.12, solid(L.light), { roll: s * 0.32, lift: 0.004, rings: 3, segments: 16 }));
      }
      parts.head.push(shape.patch(0, -0.6, 0.2, 0.15, solid(L.light), { lift: 0.004, rings: 3, segments: 16 }));
      const snout = shape.addBump(0, -0.27, 0.15, 0.115, 0.12, 0, 1.15);
      parts.head.push(shape.bumpGeometry(snout, solid(L.light)));
      noseBall(b, -0.2, 0.052, 0.04, L.nose, 0.004);
      omegaMouth(b, -0.33, L.mouth, 0.9, true);
      mouthAt(b, -0.315, 0.004);
      for (const s of [-1, 1]) {
        const g = earGeometry('pointy', 0.15, 0.36, 0.065, L.coat, L.inner, { tip: '#3b2c2e' });
        b.ears.push(earPart(shape, s * 0.55, 0.78, g, { sink: 0.05, splay: 0.36, lean: 0.08, yaw: 0.18, axis: new THREE.Vector3(0, 0, 1), amp: 0.38 }));
      }
      // Bushy tail curled around the right side, white tip in front.
      addTail(parts, [[0.05, 0.16, -0.3], [0.26, 0.16, -0.33], [0.38, 0.18, -0.1], [0.34, 0.17, 0.12]], (t) => 0.095 + 0.04 * Math.sin(Math.PI * t) - 0.035 * t, (t, out) => out.copy(col(L.coat)).lerp(col(L.light), smooth((t - 0.72) / 0.1)), 9, 7);
      break;
    }
    case 'bunny': {
      standardFace(b, { eyeTheta: 0.35, eyePhi: -0.05 });
      for (const s of [-1, 1]) {
        const puff = shape.addBump(s * 0.085, -0.31, 0.075, 0.06, 0.035, 0, 1.4);
        parts.head.push(shape.bumpGeometry(puff, solid('#fffaf6'), 3, 14));
      }
      {
        const m = shape.frame(0, -0.225, 0.006);
        const nose = ellipsoid(0.03, 0.022, 0.018, 10, 6);
        nose.applyMatrix4(m);
        parts.head.push(paint(nose, L.nose));
      }
      omegaMouth(b, -0.34, L.mouth, 0.85, true);
      // Buck teeth peeking out under the mouth.
      for (const s of [-1, 1]) {
        const tooth = new THREE.BoxGeometry(0.026, 0.034, 0.012);
        tooth.translate(s * 0.0145, -0.012, 0.004);
        tooth.applyMatrix4(shape.frame(0, -0.4, 0.004));
        parts.head.push(paint(tooth, '#ffffff'));
      }
      mouthAt(b, -0.33, 0.012);
      const flop = rng.sign();
      for (const s of [-1, 1]) {
        const floppy = s === flop;
        const g = earGeometry('long', 0.088, 0.5, 0.05, L.coat, L.inner, { bend: floppy ? -1.1 : 0 });
        b.ears.push(earPart(shape, s * 0.3, 0.98, g, { sink: 0.04, splay: floppy ? 0.62 : 0.22, lean: floppy ? 0.05 : 0.1, yaw: 0.15, axis: new THREE.Vector3(1, 0, 0.3), amp: 0.3 }));
      }
      addTail(parts, [[0, 0.16, -0.3], [0, 0.17, -0.32]], () => 0.085, '#ffffff', 1, 6);
      break;
    }
    case 'panda': {
      b.eyeRing = '#fbfbfb';
      standardFace(b, { eyeTheta: 0.37, eyePhi: -0.06, rx: 0.062, ry: 0.078 });
      for (const s of [-1, 1]) {
        parts.head.push(shape.patch(s * 0.37, -0.09, 0.115, 0.15, solid('#2e2a33'), { roll: s * 0.62, lift: 0.004, rings: 3, segments: 16 }));
      }
      const muzzle = shape.addBump(0, -0.32, 0.14, 0.1, 0.05, 0, 1.4);
      parts.head.push(shape.bumpGeometry(muzzle, solid('#ffffff')));
      noseBall(b, -0.235, 0.05, 0.034, L.nose, 0.0);
      omegaMouth(b, -0.37, L.mouth, 0.9, true);
      mouthAt(b, -0.355, 0.004);
      for (const s of [-1, 1]) {
        const g = earGeometry('round', 0.15, 0.14, 0.075, '#2e2a33', '#4a4552');
        b.ears.push(earPart(shape, s * 0.8, 0.74, g, { sink: 0.06, splay: 0.62, lean: 0.05, yaw: 0.25, axis: new THREE.Vector3(1, 0, 0.4), amp: 0.3 }));
      }
      addTail(parts, [[0, 0.15, -0.3], [0, 0.16, -0.34]], () => 0.07, '#ffffff', 1, 6);
      break;
    }
    case 'frog': {
      // Eyes on top: two bumps rising from the head with the beads on their fronts.
      const eyeParts: EyeSpot[] = [];
      for (const s of [-1, 1]) {
        const base = shape.point(s * 0.44, 0.6);
        const n = shape.normal(s * 0.44, 0.6);
        const c = base.clone().addScaledVector(n, 0.02);
        const domeGeo = ellipsoid(0.155, 0.145, 0.14, 14, 8);
        domeGeo.translate(c.x, c.y, c.z);
        parts.head.push(paint(domeGeo, L.coat));
        const dir = new THREE.Vector3(s * 0.22, 0.3, 0.93).normalize();
        const p = c.clone().add(new THREE.Vector3(dir.x * 0.155, dir.y * 0.145, dir.z * 0.14)).addScaledVector(dir, -0.012);
        eyeParts.push({ matrix: frameAt(p, dir), rx: 0.078, ry: 0.088, depth: 0.03, theta: 0, phi: 0, dome: { center: c, radii: new THREE.Vector3(0.155, 0.145, 0.14) } });
      }
      b.eyes.push(...eyeParts);
      b.gazeRange = 0.45;
      // A wide, happy frog mouth from cheek to cheek and two tiny nostrils.
      const pts: number[][] = [];
      for (let k = 0; k <= 10; k++) {
        const u = -0.27 + (0.54 * k) / 10;
        pts.push([u, 0.045 * (u / 0.27) ** 2 - 0.006]);
      }
      parts.head.push(paint(shape.line(0, -0.2, pts, 0.011, 0.003, 16), L.mouth));
      for (const s of [-1, 1]) {
        const nostril = ellipsoid(0.014, 0.01, 0.008, 6, 4);
        nostril.applyMatrix4(shape.frame(s * 0.07, 0.02, 0.0));
        parts.head.push(paint(nostril, '#3d5a2c'));
      }
      for (const s of [-1, 1]) {
        const bump = shape.addBump(s * 0.6, -0.12, 0.12, 0.09, 0.025, 0, 1.6);
        parts.cheeks.push(shape.bumpGeometry(bump, solid(L.coat), 3, 12));
        parts.cheeks.push(shape.patch(s * 0.6, -0.11, 0.075, 0.05, soft(L.blush, L.coat, 0.35), { lift: 0.005, rings: 2, segments: 12, under: [bump] }));
      }
      mouthAt(b, -0.2, 0.0, 1.7);
      break;
    }
    case 'pig': {
      standardFace(b, { eyeTheta: 0.38, eyePhi: 0.0, rx: 0.07, ry: 0.088, cheekTheta: 0.62 });
      // Snout: a short oval cylinder with a darker face and two nostrils.
      {
        const m = shape.frame(0, -0.2, -0.03);
        const snout = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
        snout.rotateX(Math.PI / 2);
        snout.scale(0.125, 0.095, 0.1);
        snout.translate(0, 0, 0.05);
        snout.applyMatrix4(m);
        parts.head.push(paint(snout, (p, out) => out.copy(col(L.coat)).lerp(col(L.light), 0.6)));
        const face = dome(0.118, 0.088, 0.018, 16, 2);
        face.translate(0, 0, 0.1);
        face.applyMatrix4(m);
        parts.head.push(paint(face, L.light));
        for (const s of [-1, 1]) {
          const nostril = ellipsoid(0.022, 0.034, 0.012, 6, 4);
          nostril.translate(s * 0.042, 0, 0.116);
          nostril.applyMatrix4(m);
          parts.head.push(paint(nostril, L.nose));
        }
      }
      parts.head.push(paint(shape.line(0, -0.44, [[-0.045, 0.012], [-0.02, -0.004], [0, -0.006], [0.02, -0.004], [0.045, 0.012]], 0.0105, 0.003, 10), L.mouth));
      mouthAt(b, -0.43, 0.0);
      for (const s of [-1, 1]) {
        const g = earGeometry('floppy', 0.16, 0.27, 0.05, L.coat, '#e9799a', { bend: 1.0 });
        b.ears.push(earPart(shape, s * 0.82, 0.66, g, { sink: 0.045, splay: 0.85, lean: -0.1, yaw: 0.5, axis: new THREE.Vector3(1, 0, 0), amp: 0.32 }));
      }
      // Curly tail.
      const spiral: number[][] = [];
      for (let k = 0; k <= 8; k++) {
        const a = k * 0.8;
        spiral.push([0.05 * Math.cos(a), 0.2 + 0.05 * Math.sin(a), -0.31 - k * 0.012]);
      }
      addTail(parts, spiral, () => 0.022, L.coat, 10, 4);
      break;
    }
    case 'raccoon': {
      b.eyeRing = '#fbfbfb';
      standardFace(b, { eyeTheta: 0.36, eyePhi: -0.05, rx: 0.066, ry: 0.082, cheekColor: L.light, cheekTheta: 0.6, cheekPhi: -0.34 });
      // Bandit mask: two slanted patches joined over the nose bridge, white brows above.
      for (const s of [-1, 1]) {
        parts.head.push(shape.patch(s * 0.37, -0.06, 0.16, 0.105, solid('#3b3642'), { roll: -s * 0.22, lift: 0.004, rings: 3, segments: 18 }));
        parts.head.push(shape.patch(s * 0.3, 0.22, 0.1, 0.042, solid(L.light), { roll: s * 0.2, lift: 0.008, rings: 2, segments: 12 }));
      }
      parts.head.push(shape.patch(0, -0.07, 0.08, 0.06, solid('#3b3642'), { lift: 0.0045, rings: 2, segments: 12 }));
      parts.head.push(shape.patch(0, 0.18, 0.03, 0.12, soft('#5d5762', L.coat, 0.5), { lift: 0.0035, rings: 2, segments: 10 }));
      parts.head.push(shape.patch(0, -0.6, 0.19, 0.14, solid(L.light), { lift: 0.004, rings: 3, segments: 16 }));
      const muzzle = shape.addBump(0, -0.3, 0.15, 0.11, 0.07, 0, 1.3);
      parts.head.push(shape.bumpGeometry(muzzle, solid(L.light)));
      noseBall(b, -0.215, 0.055, 0.038, L.nose, 0.002);
      omegaMouth(b, -0.36, L.mouth, 0.9, true);
      mouthAt(b, -0.345, 0.004);
      for (const s of [-1, 1]) {
        const g = earGeometry('round', 0.13, 0.16, 0.07, L.coat, '#f2ede6');
        b.ears.push(earPart(shape, s * 0.74, 0.76, g, { sink: 0.06, splay: 0.55, lean: 0.06, yaw: 0.22, axis: new THREE.Vector3(1, 0, 0.4), amp: 0.32 }));
      }
      const ringDark = col('#3b3642');
      const ringLight = col(L.coat);
      addTail(parts, [[-0.05, 0.16, -0.3], [-0.28, 0.16, -0.31], [-0.39, 0.17, -0.08], [-0.34, 0.17, 0.13]], (t) => 0.08 + 0.025 * Math.sin(Math.PI * t) - 0.02 * t, (t, out) => out.copy(Math.floor(t * 7.5) % 2 ? ringDark : ringLight), 10, 6);
      break;
    }
  }
  if (kind !== 'frog') addEyes(parts, shape, b.eyes, b.eyeRing);
  else addDomeEyes(parts, b.eyes);

  // ---- Arms ----
  const arms: ArmPart[] = [];
  const armLength = 0.34;
  for (const s of [-1, 1]) {
    arms.push({
      geometry: armGeometry(armLength, look.arm, look.paw, kind === 'frog' ? { fingers: true, pad: look.light } : kind === 'bear' ? { pad: '#c99068' } : {}),
      shoulder: new THREE.Vector3(s * 0.25, 0.65, 0.05),
      length: armLength,
      side: s,
      yaw: -s * 0.16,
    });
  }

  // Eyes are pivoted around their common centre so blinks and squints scale each in place.
  const eyesOrigin = new THREE.Vector3();
  for (const e of b.eyes) eyesOrigin.add(new THREE.Vector3().setFromMatrixPosition(e.matrix));
  eyesOrigin.multiplyScalar(1 / Math.max(1, b.eyes.length));
  // Blinks squash towards the lower lid, like a lid coming down rather than a squint.
  const ry = b.eyes.reduce((sum, e) => sum + e.ry, 0) / Math.max(1, b.eyes.length);
  eyesOrigin.y -= ry * 0.45;
  const eyes = merge(parts.eyes).translate(-eyesOrigin.x, -eyesOrigin.y, -eyesOrigin.z);
  const glints = merge(parts.glints).translate(-eyesOrigin.x, -eyesOrigin.y, -eyesOrigin.z);
  const arcs = merge(parts.arcs).translate(-eyesOrigin.x, -eyesOrigin.y, -eyesOrigin.z);
  if (kind === 'frog') b.gazePivot.copy(eyesOrigin).add(new THREE.Vector3(0, -0.05, -0.12));

  return {
    torso: merge(parts.torso),
    head: merge(parts.head),
    headCenter: center.clone(),
    headPivot: new THREE.Vector3(0, center.y - 0.24, center.z - 0.02),
    eyes,
    glints,
    arcs,
    eyesOrigin,
    lightArcs: !!b.eyeRing,
    gazePivot: b.gazePivot.clone(),
    gazeRange: b.gazeRange,
    mouth: merge(parts.mouth),
    mouthMatrix: b.mouthFrame.clone(),
    cheeks: merge(parts.cheeks),
    ears: b.ears,
    arms,
    restPitch: kind === 'frog' ? 0.36 : 0.54,
  };
}
