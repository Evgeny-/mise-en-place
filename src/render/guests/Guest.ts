import * as THREE from 'three';
import {
  SeededRandom, Spring, clamp, clamp01, easeOutBack, hump, lerp, plateau, ramp, settle, smooth, wobble,
} from './anim';
import { guestMaterials } from './materials';
import { PAW_REST_Y, buildGuestModel, type ArmPart, type EarPart, type GuestKind } from './species';

/**
 * Every animation layer writes additive offsets into these channels; the sum drives the rig. That
 * keeps layers independent: a guest can blink while chewing and keep breathing during a wave.
 */
const C = {
  rootX: 0, rootY: 1, rootZ: 2, rootYaw: 3, rootRoll: 4, stretch: 5,
  lean: 6, bodyRoll: 7, breath: 8,
  headPitch: 9, headYaw: 10, headRoll: 11, headLift: 12,
  gazeX: 13, gazeY: 14, blink: 15, happy: 16, wide: 17,
  mouth: 18, cheeks: 19,
  armFreeL: 20, armPitchL: 21, armSpreadL: 22,
  armFreeR: 23, armPitchR: 24, armSpreadR: 25,
  earL: 26, earR: 27, earPerk: 28,
  /** 0..1: how much a clip overrides where the guest is looking */
  focus: 29,
  /** 0..1: a cartoon stretch of a raised arm, so a tiny chibi paw can wave beside the big head */
  reachL: 30, reachR: 31,
  /** uniform growth around the seat: -1 = vanished, 0 = full size (pop in / out) */
  size: 32,
} as const;
const CHANNELS = 33;

const arm = (side: number) => (side < 0 ? C.armFreeL : C.armFreeR);
const reach = (side: number) => (side < 0 ? C.reachL : C.reachR);

export const ARRIVE_DURATION = 1.0;
export const LEAVE_DURATION = 1.6;
export const EAT_DURATION = 1.2;
export const DELIGHT_DURATION = 1.25;
/** Restarting a clip blends out of its previous pose over this long, so nothing ever pops. */
const CARRY = 0.22;
/** Pitch of a free arm (off the counter) before any raise. */
const FREE_ARM_PITCH = 0.3;
const MAX_HEAD_YAW = 0.62;

export type GuestState = 'arriving' | 'seated' | 'leaving' | 'away';

type ClipFn = (t: number, o: Float64Array) => void;

/**
 * A timed animation evaluated as a pure function of its own clock. Restarting (or cancelling) it keeps
 * the old run playing while it fades out under the new one: position and velocity stay continuous,
 * so a second eat() mid-chew or a leave() during arrival never pops.
 */
class Clip {
  t = 0;
  active = false;
  private readonly fading: { t: number; age: number }[] = [];
  private readonly scratch = new Float64Array(CHANNELS);

  constructor(readonly duration: number, private readonly fn: ClipFn) {}

  start(): void {
    this.cancel();
    this.t = 0;
    this.active = true;
  }

  /** Stop, gliding out of the current motion. */
  cancel(): void {
    if (!this.active) return;
    this.active = false;
    if (this.fading.length >= 3) this.fading.shift();
    this.fading.push({ t: this.t, age: 0 });
  }

  get remaining(): number {
    return this.active ? Math.max(0, this.duration - this.t) : 0;
  }

  /** Adds this clip's offsets to `o`; returns true on the update where it finishes. */
  advance(dt: number, o: Float64Array): boolean {
    for (let k = this.fading.length - 1; k >= 0; k--) {
      const f = this.fading[k];
      f.t += dt;
      f.age += dt;
      if (f.age >= CARRY || f.t >= this.duration) {
        this.fading.splice(k, 1);
        continue;
      }
      this.add(f.t, 1 - smooth(f.age / CARRY), o);
    }
    if (!this.active) return false;
    this.t += dt;
    if (this.t >= this.duration) {
      this.active = false;
      return true;
    }
    this.add(this.t, 1, o);
    return false;
  }

  private add(t: number, weight: number, o: Float64Array): void {
    const s = this.scratch;
    s.fill(0);
    this.fn(t, s);
    for (let i = 0; i < CHANNELS; i++) o[i] += s[i] * weight;
  }
}

/**
 * A quick lean in for the bite (mouth wide, then CHOMP), then sit back and savour it face-up: squinting
 * ^ ^ eyes, puffed cheeks pulsing with each chew, a happy sway and two little paw pats. The savouring
 * part tilts the face towards the chef, so it reads from the high game camera.
 */
function eatClip(t: number, o: Float64Array, side: number): void {
  const lean = smooth(t / 0.16) * (1 - smooth((t - 0.26) / 0.24));
  o[C.lean] += 0.15 * lean;
  o[C.headPitch] -= 0.1 * lean;
  o[C.headLift] += 0.015 * lean;
  // Settles back with a small springy overshoot past rest.
  const savour = ramp(t, 0.26, 0.5) * (1 - settle((t - 0.84) / (EAT_DURATION - 0.84)));
  o[C.headPitch] += 0.2 * savour;
  const bite = t < 0.3 ? smooth((t - 0.02) / 0.13) * (1 - smooth((t - 0.2) / 0.06)) : 0;
  const chews = 0.4 * hump(t, 0.36, 0.5) + 0.36 * hump(t, 0.54, 0.68) + 0.3 * hump(t, 0.72, 0.86);
  o[C.mouth] += bite + chews;
  const full = plateau(t, 0.21, 0.08, 1.1, 0.2);
  o[C.cheeks] += full * (1.05 - 0.55 * chews);
  o[C.happy] += plateau(t, 0.2, 0.08, 1.06, 0.16);
  o[C.stretch] += 0.03 * hump(t, 0.02, 0.18) - 0.07 * hump(t, 0.19, 0.34) - 0.025 * chews;
  o[C.headLift] -= 0.02 * chews;
  o[C.headRoll] += side * 0.09 * Math.sin(2 * Math.PI * 1.6 * (t - 0.36)) * plateau(t, 0.36, 0.1, 1.0, 0.16);
  o[C.earPerk] += 0.3 * hump(t, 0.08, 0.5) + 0.12 * wobble(t - 0.24, 3, 5, 0.6);
  const pats = hump(t, 0.6, 0.72) + hump(t, 0.78, 0.9);
  o[C.armPitchL] -= 0.14 * pats;
  o[C.armPitchR] -= 0.14 * pats;
  o[C.focus] += plateau(t, 0, 0.2, EAT_DURATION, 0.3);
}

/** ^ ^ eyes, a hop of joy with squash on landing, paws up in a tiny cheer. */
function delightClip(t: number, o: Float64Array, side: number): void {
  const joy = plateau(t, 0, 0.09, DELIGHT_DURATION, 0.22);
  o[C.happy] += joy;
  const u1 = (t - 0.1) / 0.32;
  const u2 = (t - 0.52) / 0.18;
  const hop = u1 > 0 && u1 < 1 ? 4 * u1 * (1 - u1) : 0;
  const hop2 = u2 > 0 && u2 < 1 ? 4 * u2 * (1 - u2) : 0;
  o[C.rootY] += 0.13 * hop + 0.035 * hop2;
  o[C.stretch] += -0.07 * hump(t, 0, 0.13) + 0.09 * hump(t, 0.09, 0.3) - 0.12 * hump(t, 0.38, 0.54) - 0.05 * hump(t, 0.66, 0.78)
    + 0.04 * wobble(t - 0.78, 3.5, 6, 0.45);
  o[C.mouth] += 0.55 * plateau(t, 0.05, 0.1, 1.05, 0.22);
  o[C.cheeks] += 0.4 * joy;
  o[C.headRoll] += side * 0.15 * plateau(t, 0.08, 0.2, DELIGHT_DURATION, 0.35) + 0.04 * wobble(t - 0.42, 3, 5, 0.6);
  o[C.headPitch] += 0.08 * joy;
  o[C.earPerk] += 0.35 * joy + 0.25 * wobble(t - 0.4, 3.2, 5, 0.7);
  const cheer = plateau(t, 0.05, 0.14, 1.0, 0.25);
  for (const s of [-1, 1]) {
    const a = arm(s);
    o[a] += cheer;
    o[a + 1] -= 0.75 * cheer + 0.2 * wobble(t - 0.3, 3, 5, 0.6);
    o[a + 2] += 0.35 * cheer;
    o[reach(s)] += 0.4 * cheer;
  }
  o[C.focus] += 0.7 * joy;
}

/**
 * Pop up onto the stool: spring from just below the seat while growing, land with a squash, paws plop
 * down, hello tilt. Growing from small reads well whether or not the counter hides the floor.
 */
function arriveClip(t: number, o: Float64Array, side: number): void {
  const land = 0.46;
  const peakT = 0.32;
  const peak = 0.24;
  const start = -0.75;
  let y = 0;
  if (t < peakT) y = peak - ((peak - start) / (peakT * peakT)) * (t - peakT) ** 2;
  else if (t < land) y = peak - (peak / ((land - peakT) * (land - peakT))) * (t - peakT) ** 2;
  o[C.rootY] += y;
  o[C.rootZ] -= 0.3 * (1 - smooth(t / land));
  o[C.size] -= 0.88 * (1 - smooth(t / 0.3));
  o[C.stretch] += 0.2 * (1 - smooth(t / peakT)) + 0.06 * hump(t, peakT, land) - 0.24 * hump(t, land - 0.03, land + 0.17)
    + 0.06 * wobble(t - land - 0.14, 3.2, 5, 0.38);
  const flail = 1 - smooth((t - land + 0.02) / 0.16);
  for (const s of [-1, 1]) {
    const a = arm(s);
    o[a] += flail;
    o[a + 1] -= 1.1 * (1 - smooth((t - 0.12) / 0.36)) + 0.14 * wobble(t - land - 0.1, 3, 6, 0.36);
    o[a + 2] += 0.5 * (1 - smooth((t - 0.1) / 0.4));
  }
  o[C.earPerk] += -0.7 * hump(t, 0, 0.42) + 0.3 * wobble(t - land, 3, 5, 0.5);
  o[C.headPitch] += 0.14 * hump(t, 0.02, 0.42);
  o[C.headRoll] += side * 0.13 * plateau(t, land + 0.08, 0.16, ARRIVE_DURATION, 0.3);
  o[C.wide] += 0.6 * plateau(t, 0, 0.1, land + 0.1, 0.15);
  o[C.happy] += plateau(t, land + 0.12, 0.08, ARRIVE_DURATION, 0.2);
  o[C.mouth] += 0.4 * plateau(t, land + 0.08, 0.1, ARRIVE_DURATION - 0.04, 0.2);
  o[C.focus] += plateau(t, 0, 0.05, ARRIVE_DURATION, 0.3);
}

/** Wave goodbye with one paw, crouch, and hop away, dwindling to nothing. */
function leaveClip(t: number, o: Float64Array, side: number): void {
  const raised = plateau(t, 0, 0.2, 0.98, 0.2);
  const a = arm(side);
  o[a] += raised;
  // Paw up beside the cheek (a chibi arm cannot reach over its big head), swinging side to side.
  o[a + 1] -= 1.5 * raised * easeOutBack(t / 0.24);
  const waving = plateau(t, 0.16, 0.08, 0.86, 0.1);
  const swing = Math.sin(2 * Math.PI * 3 * (t - 0.16));
  o[a + 2] += raised * 0.7 + 0.19 * swing * waving;
  o[reach(side)] += raised;
  o[C.happy] += plateau(t, 0.02, 0.1, 1.02, 0.14);
  o[C.mouth] += 0.5 * plateau(t, 0.04, 0.1, 0.96, 0.16);
  o[C.headRoll] += side * 0.1 * raised + 0.045 * swing * waving;
  o[C.bodyRoll] -= side * 0.04 * raised;
  o[C.earPerk] += 0.25 * raised;
  // Crouch, then hop up and away, turning towards the way out and shrinking out of sight.
  const jump = 1.02;
  o[C.stretch] += -0.14 * hump(t, 0.86, 1.06) + 0.16 * hump(t, 1.0, 1.45);
  for (const s of [-1, 1]) {
    const k = arm(s);
    o[k] += ramp(t, 0.9, 1.0) * (s === side ? 0 : 1);
    o[k + 1] -= 0.5 * ramp(t, 0.95, 1.12);
  }
  if (t > jump) {
    const u = t - jump;
    const top = 0.14;
    o[C.rootY] += u < top ? 0.3 - (0.3 / (top * top)) * (u - top) ** 2 : 0.3 - (0.95 / ((LEAVE_DURATION - jump - top) ** 2)) * (u - top) ** 2;
  }
  o[C.size] -= smooth((t - jump - 0.1) / (LEAVE_DURATION - jump - 0.1));
  o[C.rootZ] -= 0.42 * smooth((t - jump) / 0.5);
  o[C.rootYaw] += side * 0.75 * smooth((t - jump + 0.06) / 0.34);
  o[C.earPerk] -= 0.6 * ramp(t, jump + 0.1, LEAVE_DURATION);
  o[C.focus] += plateau(t, 0, 0.12, LEAVE_DURATION, 0.01);
}

const blinkCurve = (t: number): number => (t < 0 ? 0 : t < 0.065 ? smooth(t / 0.065) : t < 0.1 ? 1 : 1 - smooth((t - 0.1) / 0.1));
/** A quick flick and a wobble back. */
const twitchCurve = (t: number): number =>
  t <= 0 || t >= 0.5 ? 0 : t < 0.07 ? smooth(t / 0.07) : Math.exp(-(t - 0.07) * 9) * Math.cos((t - 0.07) * 20) * (1 - smooth((t - 0.38) / 0.12));

interface Arm extends ArmPart {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
}

interface Ear extends EarPart {
  pivot: THREE.Group;
}

/**
 * A cute animal guest sitting across the counter. Purely procedural: build it, add `group` to the
 * scene at a seat (origin = centre of the seat, facing +z), and call update() every frame.
 */
export class Guest {
  readonly group = new THREE.Group();
  readonly kind: GuestKind;
  readonly seed: number;

  private readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly face = new THREE.Group();
  private readonly eyePivot = new THREE.Group();
  private readonly eyes: THREE.Mesh;
  private readonly glints: THREE.Mesh;
  private readonly arcs: THREE.Mesh;
  private readonly mouth: THREE.Mesh;
  private readonly cheeks: THREE.Mesh;
  private readonly arms: Arm[] = [];
  private readonly ears: Ear[] = [];
  private readonly headPivot: THREE.Vector3;
  private readonly headCenter: THREE.Vector3;
  private readonly restPitch: number;
  private readonly gazeRange: number;

  private readonly pose = new Float64Array(CHANNELS);
  private stateValue: GuestState = 'seated';
  private disposed = false;
  /** which paw waves, which way the head tilts: a little personality per guest */
  private readonly side: number;
  private readonly arriveClip: Clip;
  private readonly leaveClip: Clip;
  private readonly eatClip: Clip;
  private readonly delightClip: Clip;

  // Idle life.
  private readonly rng: SeededRandom;
  private readonly phase: number;
  private blinkTimer: number;
  private blinkT = 1;
  private doubleBlink = false;
  private lookBlinkT = 1;
  private twitchTimer: number;
  private twitchT = 1;
  private twitchEar = 0;
  private twitchSign = 1;
  private tiltTimer: number;
  private tiltRollTarget = 0;
  private tiltYawTarget = 0;
  private readonly tiltRoll = new Spring(4.2, 0.5);
  private readonly tiltYaw = new Spring(4.2, 0.55);
  private patTimer: number;
  private patT = 2;
  private patSide = 1;

  // Looking and anticipation.
  private lookTarget: THREE.Vector3 | null = null;
  private readonly lookYaw = new Spring(7.5, 0.7);
  private readonly lookPitch = new Spring(7.5, 0.72);
  private readonly gazeX = new Spring(24, 0.85);
  private readonly gazeY = new Spring(24, 0.85);
  private lastYawGoal = 0;
  private expectant = false;
  private readonly expect = new Spring(7, 0.5);

  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly quat2 = new THREE.Quaternion();
  private static readonly X_AXIS = new THREE.Vector3(1, 0, 0);

  constructor(kind: GuestKind, seed?: number) {
    this.kind = kind;
    this.seed = seed ?? Math.floor(Math.random() * 0x7fffffff);
    const model = buildGuestModel(kind, this.seed);
    const mats = guestMaterials();
    this.rng = new SeededRandom(this.seed ^ 0x5bd1e995);
    this.side = this.rng.sign();
    this.phase = this.rng.range(0, Math.PI * 2);
    this.blinkTimer = this.rng.range(0.6, 3);
    this.twitchTimer = this.rng.range(1.5, 4);
    this.tiltTimer = this.rng.range(1, 3);
    this.patTimer = this.rng.range(5, 10);

    this.headPivot = model.headPivot;
    this.headCenter = model.headCenter;
    this.restPitch = model.restPitch;
    this.gazeRange = model.gazeRange;

    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, shadow = true) => {
      const m = new THREE.Mesh(geometry, material);
      m.name = name;
      m.castShadow = shadow;
      m.receiveShadow = shadow;
      return m;
    };
    this.group.name = `guest-${kind}`;
    this.group.add(this.root);
    this.root.add(this.body);
    this.torso = mesh(model.torso, mats.fur, 'torso');
    this.body.add(this.torso);

    this.head.position.copy(this.headPivot);
    this.body.add(this.head);
    this.face.position.copy(this.headCenter).sub(this.headPivot);
    this.head.add(this.face);
    this.face.add(mesh(model.head, mats.fur, 'head'));

    this.eyePivot.position.copy(model.gazePivot);
    this.face.add(this.eyePivot);
    this.eyes = mesh(model.eyes, mats.gloss, 'eyes', false);
    this.eyes.position.copy(model.eyesOrigin).sub(model.gazePivot);
    this.eyePivot.add(this.eyes);
    this.glints = mesh(model.glints, mats.glint, 'glints', false);
    this.eyes.add(this.glints);
    this.arcs = mesh(model.arcs, model.lightArcs ? mats.glint : mats.gloss, 'arcs', false);
    this.arcs.position.copy(this.eyes.position);
    this.arcs.visible = false;
    this.eyePivot.add(this.arcs);

    this.mouth = mesh(model.mouth, mats.fur, 'mouth', false);
    model.mouthMatrix.decompose(this.mouth.position, this.mouth.quaternion, this.mouth.scale);
    this.mouth.visible = false;
    this.face.add(this.mouth);
    this.cheeks = mesh(model.cheeks, mats.fur, 'cheeks');
    this.face.add(this.cheeks);

    for (const ear of model.ears) {
      const pivot = new THREE.Group();
      pivot.position.copy(ear.position);
      pivot.quaternion.copy(ear.quaternion);
      pivot.add(mesh(ear.geometry, mats.fur, 'ear'));
      this.face.add(pivot);
      this.ears.push({ ...ear, pivot });
    }
    for (const part of model.arms) {
      const pivot = new THREE.Group();
      pivot.position.copy(part.shoulder);
      pivot.rotation.order = 'ZYX';
      const armMesh = mesh(part.geometry, mats.fur, 'arm');
      pivot.add(armMesh);
      this.body.add(pivot);
      this.arms.push({ ...part, pivot, mesh: armMesh });
    }

    const side = this.side;
    this.arriveClip = new Clip(ARRIVE_DURATION, (t, o) => arriveClip(t, o, side));
    this.leaveClip = new Clip(LEAVE_DURATION, (t, o) => leaveClip(t, o, side));
    this.eatClip = new Clip(EAT_DURATION, (t, o) => eatClip(t, o, side));
    this.delightClip = new Clip(DELIGHT_DURATION, (t, o) => delightClip(t, o, -side));
    this.update(0, 0);
  }

  get state(): GuestState {
    return this.stateValue;
  }

  /** Pop up from behind the counter onto the stool. Returns the duration in seconds. */
  arrive(): number {
    if (this.disposed) return 0;
    this.leaveClip.cancel();
    this.stateValue = 'arriving';
    this.root.visible = true;
    this.arriveClip.start();
    return ARRIVE_DURATION;
  }

  /** Wave goodbye and hop down off the stool; the guest is hidden (state 'away') at the end. */
  leave(): number {
    if (this.disposed || this.stateValue === 'away') return 0;
    if (this.stateValue === 'leaving') return this.leaveClip.remaining;
    this.arriveClip.cancel();
    this.stateValue = 'leaving';
    this.leaveClip.start();
    return LEAVE_DURATION;
  }

  /** Lean in and chomp: cheeks puff, eyes squint happily. Returns the duration in seconds. */
  eat(): number {
    if (this.disposed) return 0;
    this.eatClip.start();
    return EAT_DURATION;
  }

  /** Happy ^ ^ eyes and a little bounce. */
  delight(): void {
    if (this.disposed) return;
    this.delightClip.start();
  }

  /** Follow a world point with head and eyes (call again as it moves); null looks back at the chef. */
  lookAt(target: THREE.Vector3 | null): void {
    if (!target) {
      this.lookTarget = null;
      return;
    }
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) return;
    this.lookTarget = (this.lookTarget ?? new THREE.Vector3()).copy(target);
  }

  /** Lean forward with wide eyes and drumming paws while the dish is nearly ready. */
  setExpectant(on: boolean): void {
    this.expectant = on;
  }

  update(dt: number, time: number): void {
    if (this.disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const o = this.pose;
    o.fill(0);
    if (this.arriveClip.advance(step, o) && this.stateValue === 'arriving') this.stateValue = 'seated';
    if (this.leaveClip.advance(step, o) && this.stateValue === 'leaving') this.stateValue = 'away';
    this.eatClip.advance(step, o);
    this.delightClip.advance(step, o);
    this.idle(step, Number.isFinite(time) ? time : 0, o);
    this.anticipate(step, Number.isFinite(time) ? time : 0, o);
    this.look(step, o);
    this.root.visible = this.stateValue !== 'away';
    if (this.root.visible) this.apply(o);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) geometries.add(child.geometry);
    });
    for (const g of geometries) g.dispose();
    this.group.clear();
  }

  // ---------------------------------------------------------------------------------------------

  private idle(dt: number, time: number, o: Float64Array): void {
    const rng = this.rng;
    const t = time + this.phase;
    const breath = Math.sin((2 * Math.PI * t) / 3.4);
    o[C.breath] += 0.013 * breath;
    o[C.headLift] += 0.005 * Math.sin((2 * Math.PI * t) / 3.4 - 0.7);
    o[C.headRoll] += 0.025 * Math.sin(t * 0.83) + 0.012 * Math.sin(t * 1.91 + 1.3);
    o[C.headYaw] += 0.03 * Math.sin(t * 0.61 + 2.1) + 0.01 * Math.sin(t * 1.47);
    o[C.headPitch] += 0.015 * Math.sin(t * 0.71 + 0.4);

    // Every few seconds a deliberate little head tilt, settling with a soft overshoot.
    this.tiltTimer -= dt;
    if (this.tiltTimer <= 0) {
      this.tiltTimer = rng.range(2.5, 6);
      const rest = rng.next() < 0.35;
      this.tiltRollTarget = rest ? 0 : rng.range(-0.12, 0.12);
      this.tiltYawTarget = rest ? 0 : rng.range(-0.1, 0.1);
    }
    o[C.headRoll] += this.tiltRoll.step(this.tiltRollTarget, dt);
    o[C.headYaw] += this.tiltYaw.step(this.tiltYawTarget, dt);

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = rng.range(2.2, 5.2);
      this.doubleBlink = rng.next() < 0.22;
      this.blinkT = 0;
    }
    this.blinkT += dt;
    this.lookBlinkT += dt;
    o[C.blink] += Math.max(blinkCurve(this.blinkT), this.doubleBlink ? blinkCurve(this.blinkT - 0.26) : 0, blinkCurve(this.lookBlinkT));

    // Ear twitches (frogs have none: their throat pulses instead).
    this.twitchTimer -= dt;
    if (this.twitchTimer <= 0) {
      this.twitchTimer = rng.range(2.6, 6.5);
      this.twitchEar = rng.next() < 0.5 ? 0 : 1;
      this.twitchSign = rng.next() < 0.75 ? 1 : -1;
      this.twitchT = 0;
    }
    this.twitchT += dt;
    const twitch = twitchCurve(this.twitchT) * this.twitchSign;
    if (this.ears.length) o[this.twitchEar ? C.earR : C.earL] += twitch;
    else o[C.cheeks] += 0.55 * hump(this.twitchT, 0, 0.4);

    // Now and then a paw pats the counter twice.
    this.patTimer -= dt;
    if (this.patTimer <= 0) {
      this.patTimer = rng.range(7, 14);
      this.patSide = rng.sign();
      this.patT = 0;
    }
    this.patT += dt;
    o[arm(this.patSide) + 1] -= 0.2 * (hump(this.patT, 0, 0.2) + hump(this.patT, 0.24, 0.44));
  }

  private anticipate(dt: number, time: number, o: Float64Array): void {
    const w = this.expect.step(this.expectant ? 1 : 0, dt);
    if (Math.abs(w) < 1e-6) return;
    o[C.lean] += 0.13 * w;
    o[C.wide] += w;
    o[C.earPerk] += 0.35 * w;
    o[C.headPitch] += 0.07 * w;
    o[C.headLift] += 0.008 * Math.sin(2 * Math.PI * 1.8 * time) * w;
    // Bursts of eager paw drumming.
    const cycle = (time + this.phase) % 2.6;
    const burst = plateau(cycle, 0, 0.12, 1.1, 0.15) * clamp01(w);
    const beat = 2 * Math.PI * 3.6 * time;
    o[C.armPitchL] -= 0.2 * burst * Math.max(0, Math.sin(beat)) ** 2;
    o[C.armPitchR] -= 0.2 * burst * Math.max(0, Math.sin(beat + Math.PI)) ** 2;
  }

  private look(dt: number, o: Float64Array): void {
    let yawGoal = 0;
    let pitchGoal = 0;
    if (this.lookTarget) {
      this.group.updateWorldMatrix(true, false);
      const local = this.tmp.copy(this.lookTarget).applyMatrix4(this.inverse.copy(this.group.matrixWorld).invert());
      const from = this.tmp2.copy(this.headCenter);
      local.sub(from);
      const flat = Math.hypot(local.x, local.z);
      yawGoal = Math.atan2(local.x, Math.max(local.z, 0.05));
      // Rest already looks up at the chef; express the target relative to that.
      pitchGoal = Math.atan2(local.y, Math.max(flat, 1e-3)) - this.restPitch;
    }
    if (Math.abs(yawGoal - this.lastYawGoal) > 0.5) this.lookBlinkT = 0;
    this.lastYawGoal = yawGoal;
    const headYaw = clamp(yawGoal * 0.7, -MAX_HEAD_YAW, MAX_HEAD_YAW);
    // Looking down hides the face from the high game camera: the eyes do more of that work.
    const headPitch = clamp(pitchGoal * 0.62, -0.3, 0.3);
    const range = 0.16 * this.gazeRange;
    const eyeX = clamp(yawGoal - headYaw, -range, range);
    const eyeY = clamp(pitchGoal - headPitch, -range, range);
    const k = 1 - clamp01(o[C.focus]);
    o[C.headYaw] += k * this.lookYaw.step(headYaw, dt);
    o[C.headPitch] += k * this.lookPitch.step(headPitch, dt);
    o[C.gazeX] += k * this.gazeX.step(eyeX, dt);
    o[C.gazeY] += k * this.gazeY.step(eyeY, dt);
  }

  private apply(o: Float64Array): void {
    this.root.position.set(o[C.rootX], o[C.rootY], o[C.rootZ]);
    this.root.rotation.set(0, o[C.rootYaw], o[C.rootRoll], 'YXZ');
    const sy = clamp(1 + o[C.stretch], 0.55, 1.6);
    const sxz = 1 / Math.sqrt(sy);
    const size = clamp(1 + o[C.size], 0.001, 1.5);
    this.root.scale.set(sxz * size, sy * size, sxz * size);
    const lean = clamp(o[C.lean], -0.3, 0.42);
    this.body.rotation.set(lean, 0, o[C.bodyRoll]);
    const breath = o[C.breath];
    this.torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.6);

    this.head.position.set(this.headPivot.x, this.headPivot.y * (1 + breath) + o[C.headLift], this.headPivot.z);
    const pitch = clamp(this.restPitch + o[C.headPitch], -0.6, 0.85);
    this.head.rotation.set(-pitch, clamp(o[C.headYaw], -0.8, 0.8), o[C.headRoll], 'YXZ');

    const range = this.gazeRange;
    this.eyePivot.rotation.set(-o[C.gazeY] * range, o[C.gazeX] * range, 0, 'YXZ');
    const happy = clamp01(o[C.happy]);
    const open = 1 - 0.9 * clamp01(o[C.blink]);
    const wide = clamp(o[C.wide], -0.5, 1.4);
    const shut = 1 - smooth(happy / 0.55);
    const eyeY = (1 + 0.14 * wide) * open * shut;
    this.eyes.visible = eyeY > 0.04;
    this.eyes.scale.set((1 + 0.1 * wide) * (0.75 + 0.25 * shut), Math.max(0.04, eyeY), 1);
    const arch = smooth((happy - 0.3) / 0.7);
    this.arcs.visible = arch > 0.02;
    this.arcs.scale.set(1, Math.max(0.04, arch), 1);

    const m = clamp01(o[C.mouth]);
    this.mouth.visible = m > 0.03;
    this.mouth.scale.set(0.55 + 0.45 * m, 0.1 + 0.9 * m, 1);
    const c = clamp(o[C.cheeks], -0.3, 1.5);
    this.cheeks.scale.set(1 + 0.13 * c, 1 + 0.05 * c, 1 + 0.12 * c);

    for (const ear of this.ears) {
      const twitch = ear.side < 0 ? o[C.earL] : o[C.earR];
      this.quat.setFromAxisAngle(Guest.X_AXIS, clamp(o[C.earPerk], -0.9, 0.7) * 0.55);
      this.quat2.setFromAxisAngle(ear.axis, twitch * ear.amp * -ear.side);
      ear.pivot.quaternion.copy(ear.quaternion).multiply(this.quat).multiply(this.quat2);
    }

    // Paws stay planted on the counter (a one-bone IK) unless an animation lifts them.
    this.root.updateMatrix();
    this.body.updateMatrix();
    for (const a of this.arms) {
      const base = arm(a.side);
      const shoulder = this.tmp.copy(a.shoulder).applyMatrix4(this.body.matrix).applyMatrix4(this.root.matrix);
      const drop = clamp((shoulder.y - PAW_REST_Y) / (a.length * sy * size), -0.95, 0.95);
      const planted = Math.asin(drop) - lean;
      const free = clamp01(o[base]);
      const spread = o[base + 2];
      a.pivot.rotation.set(lerp(planted, FREE_ARM_PITCH, free) + o[base + 1], a.yaw * (1 - free) + a.side * spread * 0.6, -a.side * spread, 'ZYX');
      const stretch = clamp01(o[reach(a.side)]);
      a.pivot.position.set(a.shoulder.x, a.shoulder.y + 0.06 * stretch, a.shoulder.z);
      a.mesh.scale.set(1, 1, 1 + 0.3 * stretch);
    }
  }
}
