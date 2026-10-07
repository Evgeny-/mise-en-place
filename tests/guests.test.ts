import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ARRIVE_DURATION, EAT_DURATION, GUEST_KINDS, GUEST_LAYOUT, Guest, LEAVE_DURATION, createStool, guestMaterials,
  type GuestKind,
} from '../src/render/guests';

const DT = 1 / 60;

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

function triangleCount(root: THREE.Object3D): number {
  return meshes(root).reduce((sum, m) => sum + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);
}

/** World matrices and visibility of every node: two guests in the same pose give the same snapshot. */
function snapshot(g: Guest): number[] {
  g.group.updateMatrixWorld(true);
  const out: number[] = [];
  g.group.traverse((o) => {
    out.push(o.visible ? 1 : 0, ...o.matrixWorld.elements);
  });
  return out;
}

function maxDiff(a: number[], b: number[]): number {
  expect(a.length).toBe(b.length);
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
}

/** Advance guests in lockstep; `clock` keeps the shared idle time. */
function run(guests: Guest[], seconds: number, clock: { t: number }, each?: () => void, dt = DT): void {
  const steps = Math.round(seconds / dt);
  for (let k = 0; k < steps; k++) {
    clock.t += dt;
    for (const g of guests) g.update(dt, clock.t);
    each?.();
  }
}

function pair(kind: GuestKind, seed = 7): { test: Guest; control: Guest; clock: { t: number } } {
  const clock = { t: 0 };
  const test = new Guest(kind, seed);
  const control = new Guest(kind, seed);
  run([test, control], 0.5, clock);
  return { test, control, clock };
}

/** Bounding-box corners of every visible mesh, in world units, keyed by mesh. */
function worldPoints(g: Guest): Map<string, THREE.Vector3[]> {
  g.group.updateMatrixWorld(true);
  const out = new Map<string, THREE.Vector3[]>();
  for (const m of meshes(g.group)) {
    if (!isShown(m)) continue;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!;
    const pts: THREE.Vector3[] = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      pts.push(new THREE.Vector3(x, y, z).applyMatrix4(m.matrixWorld));
    }
    out.set(m.uuid, pts);
  }
  return out;
}

function isShown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

describe('guest kinds', () => {
  it('lists the eight species', () => {
    expect(GUEST_KINDS).toEqual(['bear', 'cat', 'fox', 'bunny', 'panda', 'frog', 'pig', 'raccoon']);
  });

  it('shares three materials across every guest and the stool', () => {
    const a = new Guest('bear', 1);
    const b = new Guest('frog', 2);
    const mats = new Set<THREE.Material>();
    for (const m of [...meshes(a.group), ...meshes(b.group)]) mats.add(m.material as THREE.Material);
    const shared = guestMaterials();
    expect([...mats].every((m) => m === shared.fur || m === shared.gloss || m === shared.glint)).toBe(true);
    const stool = createStool();
    expect(stool.material).toBe(shared.fur);
    for (const m of mats) expect((m as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    a.dispose();
    b.dispose();
    stool.geometry.dispose();
  });
});

for (const kind of GUEST_KINDS) {
  describe(kind, () => {
    it('builds finite, vertex-coloured geometry within the triangle budget', () => {
      const g = new Guest(kind, 3);
      const all = meshes(g.group);
      expect(all.length).toBeGreaterThanOrEqual(9);
      expect(triangleCount(g.group)).toBeLessThanOrEqual(4000);
      for (const m of all) {
        const pos = m.geometry.getAttribute('position');
        expect(pos.count).toBeGreaterThan(0);
        expect(m.geometry.getAttribute('color').count).toBe(pos.count);
        expect(m.geometry.getAttribute('normal').count).toBe(pos.count);
        expect(Array.from(pos.array as Float32Array).every(Number.isFinite)).toBe(true);
        if (m.name !== 'glints' && m.name !== 'arcs' && m.name !== 'eyes' && m.name !== 'mouth') expect(m.castShadow).toBe(true);
      }
      g.dispose();
    });

    it('sits within the seat bounds with its head top near 1.6', () => {
      const g = new Guest(kind, 3);
      g.update(0, 0);
      g.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.group, true);
      const size = box.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThanOrEqual(1.1);
      expect(size.z).toBeLessThanOrEqual(1.0);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y).toBeLessThan(2.1);
      // Neighbours sit GUEST_LAYOUT.spacing apart: nothing reaches into the next seat.
      expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(GUEST_LAYOUT.spacing / 2);
      const head = all(g, 'head');
      const headBox = new THREE.Box3().setFromObject(head, true);
      expect(headBox.max.y).toBeGreaterThan(1.5);
      expect(headBox.max.y).toBeLessThan(1.68);
      // Paws rest on the counter, just in front of its near edge.
      for (const arm of all(g, 'arm', true)) {
        const b = new THREE.Box3().setFromObject(arm, true);
        expect(b.min.y).toBeGreaterThan(GUEST_LAYOUT.counterTop - 0.04);
        expect(b.max.z).toBeGreaterThan(GUEST_LAYOUT.counterEdgeZ + 0.1);
      }
      g.dispose();
    });

    it('plays every animation and returns exactly to its idle pose', () => {
      const { test, control, clock } = pair(kind);
      const settle = 2.5;
      const check = (label: string) => expect(maxDiff(snapshot(test), snapshot(control)), label).toBeLessThan(2e-3);

      const eat = test.eat();
      expect(eat).toBeGreaterThan(0);
      expect(eat).toBe(EAT_DURATION);
      let mouthOpened = false;
      let squinted = false;
      run([test, control], eat * 0.9, clock, () => {
        mouthOpened ||= all(test, 'mouth').visible;
        squinted ||= all(test, 'arcs').visible;
      });
      expect(mouthOpened && squinted).toBe(true);
      run([test, control], eat * 0.1 + settle, clock);
      check('eat');

      test.delight();
      let happy = false;
      run([test, control], 0.6, clock, () => {
        happy ||= all(test, 'arcs').visible;
      });
      expect(happy).toBe(true);
      run([test, control], 0.8 + settle, clock);
      check('delight');

      test.setExpectant(true);
      run([test, control], 1.5, clock);
      expect(maxDiff(snapshot(test), snapshot(control))).toBeGreaterThan(0.01);
      test.setExpectant(false);
      run([test, control], settle + 1, clock);
      check('expectant');

      test.lookAt(new THREE.Vector3(-3, 0.8, 1.2));
      run([test, control], 1.2, clock);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(all(test, 'head').getWorldQuaternion(new THREE.Quaternion()));
      expect(forward.x).toBeLessThan(-0.2);
      test.lookAt(null);
      run([test, control], settle + 1, clock);
      check('look');

      const leave = test.leave();
      expect(leave).toBe(LEAVE_DURATION);
      run([test, control], leave + 0.05, clock);
      expect(test.state).toBe('away');
      expect(meshes(test.group).every((m) => !isShown(m))).toBe(true);
      const arrive = test.arrive();
      expect(arrive).toBe(ARRIVE_DURATION);
      expect(test.state).toBe('arriving');
      run([test, control], arrive + 0.05, clock);
      expect(test.state).toBe('seated');
      run([test, control], settle, clock);
      check('leave + arrive');

      test.dispose();
      control.dispose();
    }, 20_000);

    it('never jumps between frames, even when animations overlap or restart', () => {
      const { test, clock } = pair(kind, 11);
      let prev = worldPoints(test);
      let worst = 0;
      const track = () => {
        const next = worldPoints(test);
        for (const [id, pts] of next) {
          const before = prev.get(id);
          if (before) for (let i = 0; i < pts.length; i++) worst = Math.max(worst, pts[i].distanceTo(before[i]));
        }
        prev = next;
      };
      const script: [number, () => void][] = [
        [0.2, () => test.setExpectant(true)],
        [0.9, () => test.lookAt(new THREE.Vector3(2, 0.7, 1))],
        [1.4, () => { test.setExpectant(false); test.eat(); }],
        [1.9, () => test.eat()],
        [2.2, () => test.delight()],
        [2.5, () => test.lookAt(null)],
        [2.6, () => test.delight()],
        [3.0, () => test.eat()],
      ];
      // At 240 fps a continuous motion moves a quarter as far per frame as at 60 fps, while a pop
      // jumps just as far at any frame rate: small steps here mean no pops anywhere.
      const fast = 1 / 240;
      let t = 0;
      for (const [at, fn] of script) {
        run([test], at - t, clock, track, fast);
        t = at;
        fn();
      }
      run([test], 2.5, clock, track, fast);
      expect(worst).toBeLessThan(0.06);
      test.dispose();
    }, 20_000);

    it('survives odd frame times and keeps updating after a long pause', () => {
      const g = new Guest(kind, 5);
      g.eat();
      g.update(0, 0);
      g.update(-1, 1);
      g.update(Number.NaN, 2);
      g.update(10, 12);
      g.update(1 / 60, 12.02);
      expect(snapshot(g).every(Number.isFinite)).toBe(true);
      g.lookAt(new THREE.Vector3(Number.NaN, 0, 0));
      g.update(1 / 60, 12.04);
      expect(snapshot(g).every(Number.isFinite)).toBe(true);
      g.dispose();
    });
  });
}

describe('guest lifecycle', () => {
  it('disposes its geometry and leaves the scene', () => {
    const scene = new THREE.Scene();
    const g = new Guest('pig', 9);
    scene.add(g.group);
    const geometries = meshes(g.group).map((m) => m.geometry);
    let disposed = 0;
    for (const geo of geometries) geo.addEventListener('dispose', () => disposed++);
    g.dispose();
    expect(disposed).toBe(new Set(geometries).size);
    expect(scene.children).not.toContain(g.group);
    expect(() => g.update(DT, 1)).not.toThrow();
    expect(g.arrive()).toBe(0);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    const a = new Guest('cat', 21);
    const b = new Guest('cat', 21);
    const c = new Guest('cat', 22);
    const clock = { t: 0 };
    run([a, b, c], 6, clock);
    expect(maxDiff(snapshot(a), snapshot(b))).toBe(0);
    expect(maxDiff(snapshot(a), snapshot(c))).toBeGreaterThan(1e-3);
    [a, b, c].forEach((g) => g.dispose());
  });

  it('reports a leave in progress and ignores a second leave', () => {
    const g = new Guest('fox', 4);
    const clock = { t: 0 };
    expect(g.leave()).toBe(LEAVE_DURATION);
    run([g], 0.5, clock);
    const remaining = g.leave();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(LEAVE_DURATION);
    run([g], remaining + 0.05, clock);
    expect(g.state).toBe('away');
    expect(g.leave()).toBe(0);
    g.dispose();
  });
});

/** First node with that name (or all of them). */
function all(g: Guest, name: string): THREE.Object3D;
function all(g: Guest, name: string, many: true): THREE.Object3D[];
function all(g: Guest, name: string, many?: boolean): THREE.Object3D | THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  g.group.traverse((o) => {
    if (o.name === name) found.push(o);
  });
  if (!found.length) throw new Error(`no ${name} in ${g.kind}`);
  return many ? found : found[0];
}
