/**
 * Kitchen foley, synthesized: wooden boards and spoons, ceramic saucers, wine glasses tapped with a
 * spoon, a real desk bell (inharmonic, beating partials), pan sizzle, cork pops, coins in a tip jar
 * and the guests' little voices. Each sound is baked once (a few variants) into a stereo buffer
 * with its own small room, then simply played back.
 */
import { addModes, biquad, chirp, crackle, fadeIn, fadeOut, loudest, lowpass1, mix, Mode, mtof, noiseBurst, noiseShaped, normalize, peakOf, Rng, room, samples, scale, tailEnd, voice, type VoiceKey } from './dsp';

export type SfxName =
  | 'tap' | 'button' | 'invalid' | 'whoosh'
  | 'take' | 'land' | 'tile' | 'plop' | 'prep' | 'fold' | 'lid'
  | 'bell' | 'nom' | 'yum'
  | 'undo' | 'hint' | 'booster' | 'stuck'
  | 'win' | 'lose' | 'star' | 'coin' | 'unlock' | 'pop';

export const SFX_NAMES: SfxName[] = [
  'tap', 'button', 'invalid', 'whoosh', 'take', 'land', 'tile', 'plop', 'prep', 'fold', 'lid', 'bell', 'nom', 'yum',
  'undo', 'hint', 'booster', 'stuck', 'win', 'lose', 'star', 'coin', 'unlock', 'pop',
];

/** Guests with their own voice (see `yum` and `nom`). */
export const GUEST_VOICES = ['bear', 'cat', 'fox', 'bunny', 'panda', 'frog', 'pig', 'raccoon'] as const;
export type GuestVoice = (typeof GUEST_VOICES)[number];

/** Minimum gap between two plays of the same sound (seconds): frequent sounds never machine-gun. */
export const RATE: Partial<Record<SfxName, number>> = {
  tap: 0.03, button: 0.03, take: 0.05, land: 0.04, tile: 0.045, plop: 0.04, nom: 0.08, yum: 0.1, bell: 0.08, prep: 0.05, invalid: 0.08, undo: 0.06,
};

/** How many differently-seeded takes of each sound are baked (picked at random, never the same twice in a row). */
export const VARIANTS: Partial<Record<SfxName, number>> = { win: 1, unlock: 2, booster: 2, lose: 1, stuck: 2, whoosh: 3, star: 2, hint: 2, yum: 2 };

export interface SfxParams {
  pitch?: number;
  voice?: string;
}

/** Cache key: the parameters that change the baked sound. */
export function sfxKey(name: SfxName, p: SfxParams): string {
  switch (name) {
    case 'land':
    case 'plop':
      return `${name}:${clampInt(p.pitch ?? 0, 0, 9)}`;
    case 'prep':
      return `${name}:${clampInt(p.pitch ?? 0, 0, 3)}`;
    case 'star':
      return `${name}:${clampInt(p.pitch ?? 0, 0, 2)}`;
    case 'yum':
    case 'nom':
      return `${name}:${voiceOf(p)}`;
    default:
      return name;
  }
}

const clampInt = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

/** The voice to use: an explicit guest kind, or one picked by `pitch` (the old call style). */
function voiceOf(p: SfxParams): GuestVoice {
  if (p.voice && (GUEST_VOICES as readonly string[]).includes(p.voice)) return p.voice as GuestVoice;
  return GUEST_VOICES[clampInt(p.pitch ?? 0, 0, 99) % GUEST_VOICES.length];
}

/** Major-pentatonic steps: rising pitches (stacking a burger, a run of preps) always sound sweet. */
const PENTA = [0, 2, 4, 7, 9];
const penta = (i: number) => PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

export interface Baked {
  L: Float32Array;
  R: Float32Array;
}

// ------------------------------------------------------------------ the kit: foley primitives

class Kit {
  readonly m: Float32Array;
  constructor(readonly sr: number, sec: number, readonly r: Rng) {
    this.m = samples(sr, sec);
  }

  /** Mix a primitive in, normalized so `gain` is its peak level. */
  put(x: Float32Array, at: number, gain: number): void {
    normalize(x, 1);
    mix(this.m, x, at, this.sr, gain);
  }

  /** A knock on wood: a short burst ringing a few broad, quickly dying resonances (not a tuned bar). */
  wood(at: number, f: number, gain: number, o: { q?: number; ratios?: number[]; bright?: number; len?: number } = {}): void {
    const { sr, r } = this;
    const len = o.len ?? 0.1;
    const bright = o.bright ?? 0.5;
    const ex = noiseBurst(sr, len, r, 0.0002, 0.003 + (1 - bright) * 0.005);
    lowpass1(ex, 1500 + bright * 7000, sr);
    const out = samples(sr, len);
    const q = o.q ?? 8;
    (o.ratios ?? [1, 2.3, 3.9]).forEach((ra, j) => {
      const y = Float32Array.from(ex);
      biquad(y, 'bp', f * ra * this.r.range(0.98, 1.02), q * (1 - j * 0.2), sr);
      biquad(y, 'bp', f * ra, q * (1 - j * 0.2), sr);
      mix(out, normalize(y, 1), 0, sr, 1 / (1 + j * 1.4));
    });
    mix(out, normalize(ex, 1), 0, sr, 0.12 * bright);
    fadeOut(out, 0.01, sr);
    this.put(out, at, gain);
  }

  /** Soft low bump: a fingertip, a felt-padded thud, food landing. */
  thump(at: number, f: number, gain: number, len = 0.14): void {
    const { sr, r } = this;
    const out = chirp(sr, len, f * 1.6, f, 0.025, len * 0.7, 0.0015);
    const n = noiseBurst(sr, 0.03, r, 0.0008, 0.02);
    biquad(n, 'lp', 420, 0.7, sr);
    mix(out, normalize(n, 1), 0, sr, 0.35);
    this.put(out, at, gain);
  }

  /** A wine glass tapped with a spoon: a pure, long, gently beating tone and a tiny click. */
  glass(at: number, f: number, gain: number, o: { t60?: number; bright?: number } = {}): void {
    const { sr, r } = this;
    const t60 = o.t60 ?? 1.3;
    const b = o.bright ?? 0.6;
    const out = samples(sr, t60 + 0.05);
    addModes(out, 0, sr, [
      { f, a: 1, t60, beat: r.range(0.6, 1.2) },
      { f: f * 2.71, a: 0.3 * b, t60: t60 * 0.42, beat: r.range(1.2, 2.2) },
      { f: f * 5.08, a: 0.1 * b, t60: t60 * 0.2 },
    ], 1, 0.0007);
    const click = noiseBurst(sr, 0.005, r, 0.0002, 0.0025);
    biquad(click, 'hp', 3000, 0.7, sr);
    mix(out, normalize(click, 1), 0, sr, 0.1 * b);
    this.put(out, at, gain);
  }

  /** A small ceramic saucer or bowl: short, slightly clattery partials. */
  ceramic(at: number, f: number, gain: number, o: { t60?: number } = {}): void {
    const { sr, r } = this;
    const t60 = o.t60 ?? 0.4;
    const out = samples(sr, t60 + 0.05);
    const modes: Mode[] = [
      { f, a: 1, t60, beat: r.range(1, 2) },
      { f: f * 2.32, a: 0.45, t60: t60 * 0.55, beat: r.range(1.5, 3) },
      { f: f * 4.03, a: 0.2, t60: t60 * 0.3 },
      { f: f * 6.12, a: 0.08, t60: t60 * 0.18 },
    ];
    addModes(out, 0, sr, modes, 1, 0.0005);
    const click = noiseBurst(sr, 0.008, r, 0.0002, 0.004);
    biquad(click, 'bp', 3200, 0.8, sr);
    mix(out, normalize(click, 1), 0, sr, 0.25);
    this.put(out, at, gain);
  }

  /** The service bell on the pass: a thin steel dome. Inharmonic partials, each split into a beating pair. */
  deskBell(at: number, f: number, gain: number, strike = 1): void {
    const { sr, r } = this;
    const out = samples(sr, 3.3);
    const s = strike;
    addModes(out, 0, sr, [
      { f, a: 1, t60: 3.2, beat: 1.7 },
      { f: f * 2.405, a: 0.62 * s, t60: 1.8, beat: 2.9 },
      { f: f * 4.07, a: 0.32 * s, t60: 1.0, beat: 4.3 },
      { f: f * 5.93, a: 0.12 * s, t60: 0.55, beat: 5.1 },
      { f: f * 8.12, a: 0.04 * s, t60: 0.3 },
    ], 1, 0.0004);
    // the clapper's tick and the plunger's little thunk
    const tick = noiseBurst(sr, 0.004, r, 0.0001, 0.0015);
    biquad(tick, 'hp', 2500, 0.7, sr);
    mix(out, normalize(tick, 1), 0, sr, 0.18 * s);
    const thunk = chirp(sr, 0.04, 700, 520, 0.01, 0.025, 0.0005);
    mix(out, normalize(thunk, 1), 0, sr, 0.1);
    this.put(out, at, gain);
  }

  /** Air: a towel flick, a toss, a slide. Band-passed noise sweeping from f0 to f1. */
  swish(at: number, dur: number, f0: number, f1: number, gain: number, q = 1.1, env?: (u: number) => number): void {
    const { sr, r } = this;
    const x = noiseShaped(sr, dur, r, env ?? ((u) => Math.pow(Math.sin(Math.PI * u), 2)));
    biquad(x, 'bp', (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / dur)), q, sr);
    biquad(x, 'lp', 7000, 0.7, sr);
    this.put(x, at, gain);
  }

  /** A pan sizzle: crackle and hiss that settles. */
  sizzle(at: number, dur: number, gain: number): void {
    const { sr, r } = this;
    const c = crackle(sr, dur, r, 1100, 150, dur * 0.85);
    biquad(c, 'hp', 2000, 0.7, sr);
    biquad(c, 'lp', 8500, 0.7, sr);
    const h = noiseShaped(sr, dur, r, (u) => Math.min(1, u / 0.05) * Math.exp(-u * 4.5));
    biquad(h, 'hp', 3200, 0.7, sr);
    biquad(h, 'lp', 7500, 0.7, sr);
    this.put(c, at, gain);
    this.put(h, at, gain * 0.32);
  }

  /** Champagne-ish fizz: tiny bubbles popping, thinning out. */
  fizz(at: number, dur: number, gain: number, rate = 380): void {
    const { sr, r } = this;
    const c = crackle(sr, dur, r, rate, rate * 0.08, dur);
    biquad(c, 'bp', 6200, 0.8, sr);
    biquad(c, 'lp', 9000, 0.7, sr);
    this.put(c, at, gain);
  }

  /** A cork leaving a bottle: Helmholtz "pomp" plus a puff of air. */
  cork(at: number, gain: number, f = 560): void {
    const { sr, r } = this;
    const b = chirp(sr, 0.1, f * 1.3, f * 0.62, 0.035, 0.07, 0.0006);
    const n = noiseBurst(sr, 0.02, r, 0.0002, 0.01);
    biquad(n, 'bp', 1700, 0.9, sr);
    mix(b, normalize(n, 1), 0, sr, 0.5);
    this.put(b, at, gain);
    const h = noiseBurst(sr, 0.25, r, 0.004, 0.2);
    biquad(h, 'hp', 3600, 0.7, sr);
    biquad(h, 'lp', 8000, 0.7, sr);
    this.put(h, at + 0.004, gain * 0.1);
  }

  /** A short formant voice. */
  say(at: number, keys: VoiceKey[], gain: number, o?: Parameters<typeof voice>[3]): void {
    this.put(voice(this.sr, keys, this.r, o), at, gain);
  }

  /**
   * Room, trim and level. `levelDb` is the loudest 50 ms RMS in dBFS (what the ear notices for
   * short sounds); peaks are kept under -1 dBFS.
   */
  finish(levelDb: number, wet: number, o: { size?: number; damp?: number; tail?: number } = {}): Baked {
    const [L, R] = room(this.m, this.sr, { wet, size: o.size ?? 0.42, damp: o.damp ?? 0.6, tail: o.tail ?? 0.9 });
    const end = Math.max(tailEnd(L, -66), tailEnd(R, -66));
    const l = L.slice(0, end);
    const rr = R.slice(0, end);
    fadeOut(l, 0.012, this.sr);
    fadeOut(rr, 0.012, this.sr);
    const loud = Math.max(loudest(l, this.sr), loudest(rr, this.sr), 1e-9);
    let g = Math.pow(10, levelDb / 20) / loud;
    const pk = Math.max(peakOf(l), peakOf(rr)) * g;
    if (pk > 0.89) g *= 0.89 / pk;
    return { L: scale(l, g), R: scale(rr, g) };
  }
}

// ------------------------------------------------------------------ voices

type Vowel = 'm' | 'u' | 'o' | 'a' | 'e' | 'i' | 'uh';
const VOWEL: Record<Vowel, [number, number, number]> = {
  m: [270, 1050, 2300],
  u: [320, 800, 2300],
  o: [460, 860, 2550],
  a: [740, 1180, 2600],
  e: [520, 1750, 2550],
  i: [310, 2250, 2950],
  uh: [620, 1200, 2550],
};

interface Species {
  f0: number;
  /** formant scale: smaller animals have smaller, brighter mouths */
  fs: number;
}

const SPECIES: Record<GuestVoice, Species> = {
  bear: { f0: 150, fs: 0.9 },
  panda: { f0: 195, fs: 0.95 },
  pig: { f0: 270, fs: 1.0 },
  frog: { f0: 175, fs: 1.0 },
  cat: { f0: 430, fs: 1.18 },
  raccoon: { f0: 520, fs: 1.18 },
  fox: { f0: 560, fs: 1.22 },
  bunny: { f0: 820, fs: 1.4 },
};

/** Keyframe helper: [t, pitch multiple, amp, vowel, breath]. */
function keys(sp: Species, frames: [number, number, number, Vowel, number?][]): VoiceKey[] {
  return frames.map(([t, p, amp, v, br]) => {
    const [f1, f2, f3] = VOWEL[v];
    return { t, f0: sp.f0 * p, amp, f1: f1 * sp.fs, f2: f2 * sp.fs, f3: f3 * sp.fs, br: br ?? 0.08 };
  });
}

/** The happy noise each guest makes after eating. */
function yum(k: Kit, v: GuestVoice): void {
  const sp = SPECIES[v];
  const j = k.r.range(0.97, 1.04);
  const s = { ...sp, f0: sp.f0 * j };
  switch (v) {
    case 'bear': // "mm-HMM!"
      k.say(0, keys(s, [[0, 0.95, 0, 'm'], [0.03, 1, 0.8, 'm'], [0.12, 1.04, 0.7, 'm'], [0.15, 1.05, 0.12, 'm'], [0.19, 1.28, 0.95, 'm'], [0.32, 1.38, 0.8, 'u'], [0.42, 1.22, 0, 'u']]), 1, { vib: 0.012 });
      break;
    case 'panda': // a contented "mmm~"
      k.say(0, keys(s, [[0, 1, 0, 'm'], [0.05, 1, 0.8, 'm'], [0.2, 1.22, 0.95, 'm'], [0.38, 1.12, 0.7, 'u'], [0.5, 1.04, 0, 'u']]), 1, { vib: 0.015 });
      break;
    case 'pig': // "oink!"
      k.say(0, keys(s, [[0, 1.1, 0, 'o', 0.2], [0.025, 1.16, 1, 'o', 0.2], [0.11, 1.0, 0.85, 'u', 0.18], [0.2, 0.82, 0, 'u', 0.15]]), 1, { am: 38, amDepth: 0.35 });
      break;
    case 'frog': // "rib-bit!"
      k.say(0, keys(s, [[0, 1, 0, 'o', 0.15], [0.01, 1, 1, 'o', 0.15], [0.07, 0.96, 0.8, 'uh', 0.15], [0.085, 0.96, 0, 'uh'], [0.12, 1.22, 0, 'e'], [0.13, 1.26, 1, 'e', 0.12], [0.2, 1.2, 0.7, 'o', 0.12], [0.22, 1.2, 0, 'o']]), 1, { am: 44, amDepth: 0.75 });
      break;
    case 'cat': // "mrrp!"
      k.say(0, keys(s, [[0, 0.9, 0, 'm'], [0.02, 0.95, 0.75, 'e'], [0.12, 1.22, 0.95, 'a'], [0.22, 1.4, 0.6, 'u'], [0.27, 1.32, 0, 'u']]), 1, { am: 26, amDepth: 0.45 });
      break;
    case 'raccoon': // a chittery "chirr-rup"
      k.say(0, keys(s, [[0, 1, 0, 'e', 0.2], [0.02, 1, 0.9, 'e', 0.2], [0.16, 1.18, 0.8, 'i', 0.15], [0.19, 1.2, 0, 'i'], [0.22, 1.3, 0, 'a'], [0.235, 1.34, 0.9, 'a', 0.1], [0.3, 1.25, 0, 'u']]), 1, { am: 32, amDepth: 0.65 });
      break;
    case 'fox': // "yip-yip!"
      k.say(0, keys(s, [[0, 1, 0, 'i'], [0.015, 1.15, 1, 'i'], [0.07, 0.96, 0.6, 'a'], [0.09, 0.95, 0, 'a'], [0.13, 1.1, 0, 'i'], [0.145, 1.3, 1, 'i'], [0.21, 1.06, 0.5, 'a'], [0.24, 1.0, 0, 'a']]), 1);
      break;
    case 'bunny': // a tiny "eep!"
      k.say(0, keys(s, [[0, 1, 0, 'i'], [0.012, 1.0, 0.9, 'i'], [0.1, 1.3, 0.8, 'e'], [0.145, 1.25, 0, 'e']]), 1);
      break;
  }
}

/** A bite: a little crunch and the mouth closing on it, sized to the guest. */
function nom(k: Kit, v: GuestVoice): void {
  const sp = SPECIES[v];
  const { sr, r } = k;
  for (let g = 0; g < 4; g++) {
    const grain = noiseBurst(sr, 0.022, r, 0.0005, 0.012);
    biquad(grain, 'bp', r.range(900, 2000) * Math.sqrt(sp.fs), 1.3, sr);
    k.put(grain, g * 0.017 + r.range(0, 0.007), 0.5 * (1 - g * 0.17));
  }
  const s = { ...sp, f0: Math.min(sp.f0, 420) * r.range(0.95, 1.05) };
  k.say(0.012, keys(s, [[0, 0.95, 0, 'm'], [0.015, 1, 0.8, 'm'], [0.055, 1.05, 0.6, 'm'], [0.08, 1, 0, 'm']]), 0.55);
  k.thump(0, 150 * sp.fs, 0.35, 0.1);
}

// ------------------------------------------------------------------ recipes

export function bakeSfx(name: SfxName, p: SfxParams, sr: number, seed: number): Baked {
  const r = new Rng(seed);
  switch (name) {
    case 'tap': {
      // a fingertip on the wooden counter
      const k = new Kit(sr, 0.1, r);
      k.wood(0, r.range(950, 1150), 1, { q: 6, bright: 0.55, len: 0.07 });
      k.thump(0, 260, 0.25, 0.06);
      return k.finish(-27, 0.05);
    }
    case 'button': {
      // a wooden spoon on a small board: round and hollow, a little pitched
      const k = new Kit(sr, 0.14, r);
      k.wood(0, r.range(640, 700), 1, { q: 11, bright: 0.45, ratios: [1, 2.6] });
      k.thump(0, 230, 0.3, 0.07);
      return k.finish(-23, 0.07);
    }
    case 'invalid': {
      // two muffled knocks, the second lower: a gentle "nuh-uh"
      const k = new Kit(sr, 0.32, r);
      k.wood(0, 265, 1, { q: 7, bright: 0.25, len: 0.12, ratios: [1, 2.2] });
      k.thump(0, 140, 0.55);
      k.wood(0.12, 215, 0.85, { q: 7, bright: 0.2, len: 0.12, ratios: [1, 2.2] });
      k.thump(0.12, 118, 0.45);
      return k.finish(-19, 0.08);
    }
    case 'whoosh': {
      // a tea towel flick
      const k = new Kit(sr, 0.36, r);
      k.swish(0, 0.34, r.range(280, 340), r.range(1300, 1700), 1, 0.7, (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 2));
      return k.finish(-30, 0.06);
    }
    case 'take': {
      // the ingredient is plucked from its crate: a light tick and an airy "fwip" upward
      const k = new Kit(sr, 0.16, r);
      k.wood(0, r.range(1500, 1900), 0.35, { q: 5, len: 0.04, bright: 0.7 });
      k.swish(0.004, 0.13, r.range(600, 820), r.range(2200, 3000), 1, 1.4, (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 2));
      return k.finish(-24, 0.06);
    }
    case 'land': {
      // food settles on its little saucer on the board: a soft pat, the board, a quiet clink
      const k = new Kit(sr, 0.45, r);
      const pat = noiseBurst(sr, 0.05, r, 0.0015, 0.035);
      biquad(pat, 'lp', 800, 0.8, sr);
      k.put(pat, 0, 0.7);
      k.thump(0, r.range(165, 195), 0.75, 0.12);
      k.ceramic(0.003, 1680 * Math.pow(2, penta(p.pitch ?? 0) / 12) * r.range(0.99, 1.01), 0.3, { t60: 0.32 });
      return k.finish(-21, 0.08);
    }
    case 'tile': {
      // level start: little wooden tiles dropping into the trays
      const k = new Kit(sr, 0.12, r);
      k.wood(0, r.range(1100, 1800), 1, { q: 8, len: 0.045, bright: 0.6 });
      k.wood(r.range(0.035, 0.055), r.range(1100, 1800), 0.3, { q: 8, len: 0.035, bright: 0.5 });
      return k.finish(-29, 0.04);
    }
    case 'plop': {
      // food on food (a burger layer, a taco filling): a soft "bup" that climbs with each layer
      const k = new Kit(sr, 0.2, r);
      const f = 200 * Math.pow(2, penta(p.pitch ?? 0) / 12) * r.range(0.985, 1.015);
      k.put(chirp(sr, 0.13, f * 1.7, f, 0.03, 0.09, 0.0012), 0, 1);
      const sq = noiseBurst(sr, 0.04, r, 0.001, 0.025);
      biquad(sq, 'lp', 1000, 0.8, sr);
      k.put(sq, 0, 0.35);
      return k.finish(-21, 0.07);
    }
    case 'prep': {
      // two things become one: a toss in the pan, a sizzle, and two glass "tings"
      const k = new Kit(sr, 1.4, r);
      const [a, b] = [[79, 86], [81, 88], [84, 91], [86, 93]][clampInt(p.pitch ?? 0, 0, 3)];
      k.thump(0, 120, 0.3, 0.1);
      k.sizzle(0.012, 0.5, 0.5);
      k.glass(0.07, mtof(a), 0.62, { t60: 0.9, bright: 0.5 });
      k.glass(0.15, mtof(b), 0.5, { t60: 1.1, bright: 0.45 });
      return k.finish(-16, 0.16, { size: 0.5 });
    }
    case 'fold': {
      // a tortilla folds over: a soft flap and a glint
      const k = new Kit(sr, 1, r);
      const flap = noiseShaped(sr, 0.13, r, (u) => Math.min(1, u / 0.12) * Math.exp(-u * 5));
      biquad(flap, 'lp', 900, 0.8, sr);
      k.put(flap, 0, 0.8);
      k.thump(0.02, 150, 0.5, 0.12);
      k.glass(0.09, mtof(88), 0.35, { t60: 0.8, bright: 0.4 });
      return k.finish(-21, 0.12);
    }
    case 'lid': {
      // the wooden lid of a crate lifts: a creak, a hollow clack, a glimpse of what's inside
      const k = new Kit(sr, 1.2, r);
      const cr = samples(sr, 0.17);
      for (let t = 0; t < 0.15;) {
        const i = Math.round(t * sr);
        cr[i] += (0.5 + 0.5 * r.next()) * Math.sin((Math.PI * t) / 0.15);
        t += (1 / (80 + 1100 * t)) * r.range(0.85, 1.15);
      }
      const y = Float32Array.from(cr);
      biquad(y, 'bp', 540, 5, sr);
      const y2 = Float32Array.from(cr);
      biquad(y2, 'bp', 1300, 4, sr);
      mix(y, normalize(y2, 1), 0, sr, 0.6 * peakOf(y));
      k.put(y, 0, 0.3);
      k.wood(0.15, 330, 1, { q: 6, ratios: [1, 2.2, 3.7], bright: 0.45, len: 0.14 });
      k.thump(0.15, 140, 0.35);
      k.glass(0.24, mtof(84), 0.28, { t60: 0.8 });
      k.glass(0.31, mtof(91), 0.22, { t60: 1 });
      return k.finish(-19, 0.1);
    }
    case 'bell':
      // the same bell every time (it sits on the pass); only the strike changes
      return (() => {
        const k = new Kit(sr, 3.4, r);
        k.deskBell(0, 1494 * r.range(0.998, 1.002), 1, r.range(0.82, 1));
        return k.finish(-15, 0.2, { size: 0.55, tail: 1.6 });
      })();
    case 'nom': {
      const k = new Kit(sr, 0.16, r);
      nom(k, voiceOf(p));
      return k.finish(-23, 0.04);
    }
    case 'yum': {
      const k = new Kit(sr, 0.6, r);
      yum(k, voiceOf(p));
      return k.finish(-16, 0.1);
    }
    case 'undo': {
      // the take, backwards: air rushing in, then a soft tock as things settle
      const k = new Kit(sr, 0.36, r);
      const b = new Kit(sr, 0.26, r);
      b.wood(0, r.range(1400, 1700), 0.45, { q: 5, len: 0.04, bright: 0.6 });
      b.swish(0, 0.24, 2600, 650, 1, 1.2, (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 2));
      const rev = Float32Array.from(b.m).reverse();
      fadeIn(rev, 0.01, sr);
      fadeOut(rev, 0.004, sr);
      k.put(rev, 0, 1);
      k.wood(0.25, 560, 0.45, { q: 8, bright: 0.35 });
      return k.finish(-22, 0.07);
    }
    case 'hint': {
      // a spoon taps a glass twice: "may I have your attention"
      const k = new Kit(sr, 1.5, r);
      const f = mtof(93) * r.range(0.997, 1.003);
      k.glass(0, f, 1, { t60: 1.2, bright: 0.55 });
      k.glass(0.14, f, 0.7, { t60: 1.2, bright: 0.5 });
      return k.finish(-16, 0.14);
    }
    case 'booster': {
      // an extra board slides onto the counter, a plate lands on it, a sparkle
      const k = new Kit(sr, 1.6, r);
      k.swish(0, 0.22, 900, 1900, 0.55, 0.9);
      k.ceramic(0.2, 1150, 1, { t60: 0.5 });
      k.thump(0.2, 150, 0.6);
      [84, 88, 91].forEach((m, i) => k.glass(0.3 + i * 0.08, mtof(m), 0.42, { t60: 1, bright: 0.45 }));
      return k.finish(-16, 0.14);
    }
    case 'stuck': {
      // the guests murmur "uh-oh", doubled very softly on two clay bowls
      const k = new Kit(sr, 1.2, r);
      const s: Species = { f0: 250, fs: 1.1 };
      k.say(0, keys(s, [[0, 1, 0, 'uh'], [0.03, 1.02, 0.9, 'uh'], [0.15, 1, 0.7, 'uh'], [0.18, 1, 0.1, 'uh'], [0.22, 0.84, 0.9, 'o'], [0.42, 0.8, 0.6, 'u'], [0.52, 0.78, 0, 'u']]), 1, { vib: 0.01 });
      k.ceramic(0.03, mtof(83), 0.12, { t60: 0.6 });
      k.ceramic(0.22, mtof(80), 0.12, { t60: 0.7 });
      return k.finish(-17, 0.14);
    }
    case 'win': {
      // a cork pops, the bubbles fizz, and the bell rings twice; the kitchen's band adds a flourish live
      const k = new Kit(sr, 3.6, r);
      k.cork(0, 1, 520);
      k.fizz(0.03, 1.5, 0.22);
      k.deskBell(0.14, 1494, 0.8, 1);
      k.deskBell(0.34, 1494, 0.62, 0.85);
      return k.finish(-13, 0.18, { size: 0.55, tail: 1.6 });
    }
    case 'lose': {
      const k = new Kit(sr, 2, r);
      [91, 88, 84, 79].forEach((m, i) => k.glass(i * 0.22, mtof(m), 1 - i * 0.12, { t60: 1.1, bright: 0.4 }));
      return k.finish(-17, 0.18);
    }
    case 'star': {
      // each star: a struck glass, a little higher each time, and a wisp of sparkle
      const k = new Kit(sr, 2, r);
      const f = mtof([91, 95, 98][clampInt(p.pitch ?? 0, 0, 2)]);
      k.glass(0, f, 1, { t60: 1.6, bright: 0.65 });
      k.glass(0, f / 2, 0.22, { t60: 1.2, bright: 0.2 });
      k.fizz(0.01, 0.5, 0.16, 300);
      return k.finish(-14, 0.18);
    }
    case 'coin': {
      // coins into the tip jar
      const k = new Kit(sr, 0.8, r);
      const hit = (at: number, g: number, fm: number) => {
        const out = samples(sr, 0.45);
        addModes(out, 0, sr, [
          { f: 2650 * fm, a: 1, t60: 0.2 },
          { f: 4120 * fm, a: 0.45, t60: 0.12 },
          { f: 6200 * fm, a: 0.14, t60: 0.06 },
          { f: 1180, a: 0.34, t60: 0.32, beat: 1.4 },
          { f: 2950, a: 0.16, t60: 0.18 },
        ], 1, 0.0006);
        biquad(out, 'lp', 6500, 0.7, sr);
        k.put(out, at, g);
      };
      hit(0, 1, r.range(0.97, 1.03));
      hit(0.075, 0.75, r.range(1.05, 1.1));
      hit(0.15, 0.3, r.range(0.92, 0.97));
      return k.finish(-17, 0.1);
    }
    case 'unlock': {
      // something new on the menu: glasses chime upward over a warm swell
      const k = new Kit(sr, 2.2, r);
      [84, 88, 91, 96].forEach((m, i) => k.glass(i * 0.075, mtof(m), 0.8 + i * 0.05, { t60: 1.3, bright: 0.45 }));
      const pad = samples(sr, 1.6);
      addModes(pad, 0, sr, [72, 76, 79].map((m) => ({ f: mtof(m), a: 1, t60: 1.5, beat: 0.8 })), 1, 0.12);
      k.put(pad, 0.04, 0.3);
      k.fizz(0.2, 0.9, 0.12, 260);
      return k.finish(-14, 0.2);
    }
    case 'pop': {
      const k = new Kit(sr, 0.3, r);
      k.cork(0, 1, r.range(560, 640));
      return k.finish(-20, 0.07);
    }
  }
}

/** Every distinct sound worth auditioning or rendering (name, params, label). */
export function sfxCatalog(): { name: SfxName; opts: SfxParams; label: string }[] {
  const out: { name: SfxName; opts: SfxParams; label: string }[] = [];
  for (const name of SFX_NAMES) {
    if (name === 'yum' || name === 'nom') {
      for (const v of GUEST_VOICES) out.push({ name, opts: { voice: v }, label: `${name}-${v}` });
    } else if (name === 'star') {
      for (let i = 0; i < 3; i++) out.push({ name, opts: { pitch: i }, label: `star-${i + 1}` });
    } else if (name === 'prep') {
      for (let i = 0; i < 3; i++) out.push({ name, opts: { pitch: i }, label: `prep-${i + 1}` });
    } else if (name === 'plop') {
      for (let i = 0; i < 5; i++) out.push({ name, opts: { pitch: i }, label: `plop-${i + 1}` });
    } else out.push({ name, opts: {}, label: name });
  }
  return out;
}
