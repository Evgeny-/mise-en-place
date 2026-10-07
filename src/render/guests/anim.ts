/** Small, allocation-free animation helpers for the guests: easing curves, exact springs, a seeded RNG. */

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smoothstep of x over [0, 1]. */
export const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Smoothstep of x over [a, b]. */
export const ramp = (x: number, a: number, b: number): number => smooth((x - a) / (b - a));

export const easeOutCubic = (x: number): number => {
  const t = 1 - clamp01(x);
  return 1 - t * t * t;
};

export const easeInCubic = (x: number): number => {
  const t = clamp01(x);
  return t * t * t;
};

/** Overshoots by about 10% before settling: the springy "pop" of every arrival. */
export const easeOutBack = (x: number, s = 1.70158): number => {
  const t = clamp01(x) - 1;
  return 1 + t * t * ((s + 1) * t + s);
};

/**
 * 0 → 1 like an underdamped spring released from rest: zero starting velocity, an overshoot of about
 * 15%, a soft settle, and exactly 1 (at rest) by x = 1. Use it to return to rest springily.
 */
export const settle = (x: number): number => {
  const t = clamp01(x);
  const a = 6;
  const b = 10;
  const r = 1 - Math.exp(-a * t) * (Math.cos(b * t) + (a / b) * Math.sin(b * t));
  return r + (1 - r) * smooth((t - 0.7) / 0.3);
};

/** 0 → 1 → 0 over [a, b] with zero slope at both ends. */
export const hump = (x: number, a: number, b: number): number => {
  if (x <= a || x >= b) return 0;
  const s = Math.sin(((x - a) / (b - a)) * Math.PI);
  return s * s;
};

/** Rises over [a, a + rise], holds, falls over [b - fall, b]. */
export const plateau = (x: number, a: number, rise: number, b: number, fall: number): number =>
  ramp(x, a, a + rise) * (1 - ramp(x, b - fall, b));

/**
 * A decaying wobble that starts at an impact: 0 at x = 0, oscillates with `freq` Hz and dies out.
 * Multiplied by a fade window so it lands on exactly 0 at `end` seconds.
 */
export const wobble = (x: number, freq: number, decay: number, end: number): number => {
  if (x <= 0 || x >= end) return 0;
  // The short smooth onset keeps velocity continuous where the wobble begins.
  return Math.exp(-decay * x) * Math.sin(2 * Math.PI * freq * x) * smooth(x / 0.06) * (1 - smooth((x - end * 0.7) / (end * 0.3)));
};

/**
 * Damped spring solved exactly for each step (target held constant over the step), so it is
 * stable for any dt: a frame hitch or a test that jumps 10 s ahead cannot make it explode.
 */
export class Spring {
  value: number;
  velocity = 0;

  constructor(public omega: number, public zeta: number, value = 0) {
    this.value = value;
  }

  step(target: number, dt: number): number {
    if (!(dt > 0)) return this.value;
    const w = this.omega;
    const z = this.zeta;
    const y0 = this.value - target;
    const v0 = this.velocity;
    if (z < 1) {
      const a = z * w;
      const wd = w * Math.sqrt(1 - z * z);
      const e = Math.exp(-a * dt);
      const c = Math.cos(wd * dt);
      const s = Math.sin(wd * dt);
      const b = (v0 + a * y0) / wd;
      this.value = target + e * (y0 * c + b * s);
      this.velocity = e * ((b * wd - a * y0) * c - (y0 * wd + a * b) * s);
    } else {
      const e = Math.exp(-w * dt);
      const k = v0 + w * y0;
      this.value = target + (y0 + k * dt) * e;
      this.velocity = (v0 - w * k * dt) * e;
    }
    // Snap tiny residues so a settled guest is exactly at rest.
    if (Math.abs(this.value - target) < 1e-7 && Math.abs(this.velocity) < 1e-6) {
      this.value = target;
      this.velocity = 0;
    }
    return this.value;
  }

  reset(value = 0): void {
    this.value = value;
    this.velocity = 0;
  }
}

/** mulberry32: tiny deterministic PRNG, one per guest so idle life never depends on other guests. */
export class SeededRandom {
  private s: number;

  constructor(seed: number) {
    this.s = (seed >>> 0) ^ 0x6d2b79f5;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}
