import * as THREE from 'three';

export type Ease = (k: number) => number;

export const ease = {
  linear: (k: number) => k,
  outQuad: (k: number) => 1 - (1 - k) * (1 - k),
  inQuad: (k: number) => k * k,
  outCubic: (k: number) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inOutSine: (k: number) => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
  outElastic: (k: number) => {
    if (k <= 0 || k >= 1) return k;
    return Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface Tween {
  t: number;
  delay: number;
  dur: number;
  fn: (k: number) => void;
  ease: Ease;
  done?: () => void;
  started: boolean;
  start?: () => void;
  tag?: object;
}

/** Frame-driven tweens. Everything visual in a level animates through one instance. */
export class Tweens {
  private list: Tween[] = [];

  add(dur: number, fn: (k: number) => void, opts: { delay?: number; ease?: Ease; done?: () => void; start?: () => void; tag?: object } = {}): void {
    this.list.push({ t: 0, delay: opts.delay ?? 0, dur: Math.max(1e-4, dur), fn, ease: opts.ease ?? ease.outCubic, done: opts.done, started: false, start: opts.start, tag: opts.tag });
  }

  /** Run `fn` after `delay` seconds. */
  after(delay: number, fn: () => void, tag?: object): void {
    this.add(1e-4, () => undefined, { delay, done: fn, tag });
  }

  update(dt: number): void {
    if (!this.list.length) return;
    const list = this.list;
    this.list = [];
    const keep: Tween[] = [];
    for (const tw of list) {
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) {
          keep.push(tw);
          continue;
        }
      }
      if (!tw.started) {
        tw.started = true;
        tw.start?.();
      }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) tw.done?.();
      else keep.push(tw);
    }
    // Tweens added during callbacks were pushed to this.list; keep them after the survivors.
    this.list = keep.concat(this.list);
  }

  /** Finish every running tween immediately (callbacks run in order). */
  flush(): void {
    for (let i = 0; i < 20 && this.list.length; i++) this.update(1e3);
  }

  cancel(tag: object): void {
    this.list = this.list.filter((t) => t.tag !== tag);
  }

  get busy(): boolean {
    return this.list.length > 0;
  }

  clear(): void {
    this.list = [];
  }
}

/** Point on a parabolic hop from `a` to `b` peaking `height` above the straight line. */
export function arc(a: THREE.Vector3, b: THREE.Vector3, height: number, k: number, out: THREE.Vector3): THREE.Vector3 {
  out.lerpVectors(a, b, k);
  out.y += Math.sin(Math.PI * k) * height;
  return out;
}

/** Squash & stretch scale for a landing: 1 -> squashed -> overshoot -> 1. */
export function squash(k: number, amount = 0.25): { xz: number; y: number } {
  const s = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3) * amount;
  return { xz: 1 + s, y: 1 - s };
}
