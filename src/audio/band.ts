/**
 * The kitchen bands' instruments.
 *
 * Plucked and struck instruments (mandolin, guitars, harp, bass, oud, qanun, pipa, guzheng, piano,
 * electric piano, percussion) are physically-modelled offline (dsp.ts), baked once per pitch and
 * played back as buffers: one source + one gain per note. Sustained instruments (accordion,
 * musette, sheng, drones, doo-wop "oohs", lap steel, erhu, flutes) are live oscillators through a
 * couple of filters, with a shared vibrato LFO per band.
 */
import { addModes, biquad, chirp, mix, mtof, noiseBurst, noiseShaped, normalize, piano, pluck, rhodes, Rng, samples } from './dsp';

export type PluckInst = 'mandolin' | 'guitar' | 'requinto' | 'gypsy' | 'harp' | 'bass' | 'guitarron' | 'oud' | 'qanun' | 'pipa' | 'guzheng' | 'piano' | 'rhodes';
export type PercName =
  | 'woodblock' | 'clapper' | 'rim' | 'shaker' | 'brush' | 'brushTap' | 'snap' | 'clap' | 'tambourine'
  | 'doum' | 'tek' | 'ka' | 'tanggu' | 'kick' | 'fingerCymbal' | 'gong';
export type ReedKind = 'accordion' | 'musette' | 'sheng' | 'drone';
export type LineKind = 'steel' | 'erhu' | 'flute' | 'dizi' | 'ney';
export type Vowel = 'oo' | 'ah' | 'oh';

interface BakedDef {
  sr: number;
  sec: number;
  gain: number;
  pan: number;
  wet: number;
  /** damper release time constant at the note's end (s) */
  rel: number;
  make(sr: number, f: number, r: Rng): Float32Array;
}

const P = (sec: number, o: Parameters<typeof pluck>[3]) => (sr: number, f: number, r: Rng) => pluck(sr, f, sec, o, r);

export const PLUCKS: Record<PluckInst, BakedDef> = {
  mandolin: { sr: 32000, sec: 1.1, gain: 0.3, pan: -0.25, wet: 0.24, rel: 0.03, make: P(1.1, { t60: 1.0, damp: 0.1, pick: 0.12, hard: 0.82, noise: 0.35, course: 5, body: [{ f: 460, q: 1.2, db: 3 }] }) },
  guitar: { sr: 24000, sec: 1.8, gain: 0.3, pan: 0.22, wet: 0.2, rel: 0.05, make: P(1.8, { t60: 2.2, damp: 0.3, pick: 0.2, hard: 0.45, noise: 0.2, body: [{ f: 110, q: 1.4, db: 3 }, { f: 240, q: 2, db: 2 }] }) },
  requinto: { sr: 32000, sec: 1.5, gain: 0.3, pan: -0.22, wet: 0.22, rel: 0.05, make: P(1.5, { t60: 1.7, damp: 0.22, pick: 0.14, hard: 0.68, noise: 0.28, body: [{ f: 300, q: 1.4, db: 3 }] }) },
  gypsy: { sr: 32000, sec: 1.4, gain: 0.3, pan: 0.18, wet: 0.16, rel: 0.035, make: P(1.4, { t60: 1.4, damp: 0.09, pick: 0.1, hard: 0.85, noise: 0.4, body: [{ f: 330, q: 1, db: 4 }] }) },
  harp: { sr: 32000, sec: 2.4, gain: 0.3, pan: 0.18, wet: 0.3, rel: 0.08, make: P(2.4, { t60: 2.8, damp: 0.22, pick: 0.32, hard: 0.45, noise: 0.12 }) },
  bass: { sr: 22050, sec: 1.6, gain: 0.15, pan: 0, wet: 0.06, rel: 0.05, make: P(1.6, { t60: 1.5, damp: 0.42, pick: 0.22, hard: 0.32, noise: 0.08, lp: 1500, body: [{ f: 95, q: 1, db: 3 }] }) },
  guitarron: { sr: 22050, sec: 1.6, gain: 0.15, pan: 0, wet: 0.08, rel: 0.05, make: P(1.6, { t60: 1.8, damp: 0.35, pick: 0.18, hard: 0.55, noise: 0.12, lp: 2600 }) },
  oud: { sr: 24000, sec: 1.4, gain: 0.32, pan: -0.18, wet: 0.22, rel: 0.04, make: P(1.4, { t60: 1.3, damp: 0.28, pick: 0.12, hard: 0.6, noise: 0.3, course: 6, body: [{ f: 170, q: 1.2, db: 3 }] }) },
  qanun: { sr: 32000, sec: 1.6, gain: 0.26, pan: 0.25, wet: 0.26, rel: 0.05, make: P(1.6, { t60: 1.8, damp: 0.14, pick: 0.12, hard: 0.75, noise: 0.3, course: 3 }) },
  pipa: { sr: 32000, sec: 1.2, gain: 0.3, pan: -0.2, wet: 0.22, rel: 0.03, make: P(1.2, { t60: 1.1, damp: 0.12, pick: 0.08, hard: 0.88, noise: 0.4, body: [{ f: 520, q: 1.5, db: 3 }] }) },
  guzheng: { sr: 32000, sec: 2.4, gain: 0.27, pan: 0.2, wet: 0.3, rel: 0.08, make: P(2.4, { t60: 2.6, damp: 0.1, pick: 0.1, hard: 0.78, noise: 0.25 }) },
  piano: { sr: 24000, sec: 2.2, gain: 0.3, pan: 0.1, wet: 0.2, rel: 0.06, make: (sr, f, r) => piano(sr, f, 2.2, 0.5, r) },
  rhodes: { sr: 24000, sec: 2.4, gain: 0.3, pan: 0.08, wet: 0.18, rel: 0.1, make: (sr, f) => rhodes(sr, f, 2.4, 0.55) },
};

interface PercDef {
  sr: number;
  gain: number;
  pan: number;
  wet: number;
  make(sr: number, r: Rng): Float32Array;
}

function band(x: Float32Array, sr: number, ...f: [type: 'lp' | 'hp' | 'bp', f: number, q: number][]): Float32Array {
  for (const [t, fr, q] of f) biquad(x, t, fr, q, sr);
  return normalize(x, 1);
}

export const PERC: Record<PercName, PercDef> = {
  woodblock: {
    sr: 32000, gain: 0.16, pan: 0.3, wet: 0.12,
    make(sr, r) {
      const x = samples(sr, 0.16);
      const f = 880 * r.range(0.98, 1.02);
      addModes(x, 0, sr, [{ f, a: 1, t60: 0.11 }, { f: f * 2.62, a: 0.28, t60: 0.05 }], 1, 0.0003);
      mix(x, band(noiseBurst(sr, 0.004, r, 0.0002, 0.002), sr, ['hp', 2000, 0.7]), 0, sr, 0.25);
      return normalize(x, 1);
    },
  },
  clapper: {
    sr: 32000, gain: 0.14, pan: -0.2, wet: 0.14,
    make(sr, r) {
      const x = samples(sr, 0.12);
      for (const [at, g] of [[0, 1], [0.006, 0.6]]) {
        const f = 1480 * r.range(0.97, 1.03);
        const y = samples(sr, 0.1);
        addModes(y, 0, sr, [{ f, a: 1, t60: 0.06 }, { f: f * 2.3, a: 0.4, t60: 0.03 }], 1, 0.0002);
        mix(x, y, at, sr, g);
      }
      mix(x, band(noiseBurst(sr, 0.006, r, 0.0002, 0.003), sr, ['hp', 2500, 0.7]), 0, sr, 0.3);
      return normalize(x, 1);
    },
  },
  rim: {
    sr: 32000, gain: 0.14, pan: 0.15, wet: 0.12,
    make(sr, r) {
      const x = samples(sr, 0.12);
      addModes(x, 0, sr, [{ f: 480, a: 0.7, t60: 0.08 }, { f: 1650 * r.range(0.98, 1.02), a: 0.5, t60: 0.05 }], 1, 0.0003);
      mix(x, band(noiseBurst(sr, 0.012, r, 0.0002, 0.007), sr, ['bp', 2000, 1.2]), 0, sr, 1);
      return normalize(x, 1);
    },
  },
  shaker: {
    sr: 32000, gain: 0.08, pan: 0.35, wet: 0.08,
    make(sr, r) {
      const x = noiseShaped(sr, 0.09, r, (u) => (u < 0.3 ? Math.pow(u / 0.3, 1.5) : Math.exp(-(u - 0.3) * 9)));
      return band(x, sr, ['bp', 5500 * r.range(0.9, 1.1), 0.8], ['hp', 2500, 0.7]);
    },
  },
  brush: {
    sr: 32000, gain: 0.08, pan: -0.15, wet: 0.1,
    make(sr, r) {
      const x = noiseShaped(sr, 0.2, r, (u) => (u < 0.25 ? u / 0.25 : Math.exp(-(u - 0.25) * 5)));
      return band(x, sr, ['bp', 3800 * r.range(0.9, 1.1), 0.6], ['lp', 8000, 0.7]);
    },
  },
  brushTap: {
    sr: 32000, gain: 0.07, pan: -0.15, wet: 0.1,
    make(sr, r) {
      const x = band(noiseBurst(sr, 0.07, r, 0.001, 0.05), sr, ['bp', 3000, 0.7]);
      mix(x, normalize(chirp(sr, 0.08, 230, 195, 0.02, 0.06), 1), 0, sr, 0.2);
      return normalize(x, 1);
    },
  },
  snap: {
    sr: 32000, gain: 0.12, pan: 0.3, wet: 0.14,
    make(sr, r) {
      const x = band(noiseBurst(sr, 0.03, r, 0.0003, 0.016), sr, ['bp', 2400 * r.range(0.95, 1.05), 2]);
      mix(x, normalize(chirp(sr, 0.025, 1400, 1150, 0.01, 0.018), 1), 0, sr, 0.3);
      return normalize(x, 1);
    },
  },
  clap: {
    sr: 32000, gain: 0.11, pan: 0.25, wet: 0.16,
    make(sr, r) {
      const x = samples(sr, 0.14);
      for (const at of [0, 0.008, 0.017]) mix(x, noiseBurst(sr, 0.012, r, 0.0003, 0.008), at, sr, at === 0.017 ? 1 : 0.6);
      mix(x, noiseBurst(sr, 0.1, r, 0.001, 0.08), 0.017, sr, 0.35);
      return band(x, sr, ['bp', 1300 * r.range(0.92, 1.08), 1], ['hp', 500, 0.7]);
    },
  },
  tambourine: {
    sr: 32000, gain: 0.07, pan: 0.3, wet: 0.12,
    make(sr, r) {
      const x = samples(sr, 0.3);
      for (let j = 0; j < 4; j++) addModes(x, r.range(0, 0.006), sr, [{ f: r.range(5000, 8500), a: 1, t60: r.range(0.14, 0.24), beat: r.range(20, 40) }], 1, 0.0002);
      mix(x, band(noiseBurst(sr, 0.06, r, 0.0005, 0.04), sr, ['hp', 6000, 0.7]), 0, sr, 0.5);
      return normalize(x, 1);
    },
  },
  doum: {
    sr: 22050, gain: 0.32, pan: 0, wet: 0.1,
    make(sr, r) {
      const x = chirp(sr, 0.5, 128, 84, 0.06, 0.45, 0.001);
      mix(x, band(noiseBurst(sr, 0.03, r, 0.0005, 0.02), sr, ['lp', 400, 0.7]), 0, sr, 0.3);
      return normalize(x, 1);
    },
  },
  tek: {
    sr: 32000, gain: 0.13, pan: 0.12, wet: 0.12,
    make(sr, r) {
      const x = band(noiseBurst(sr, 0.05, r, 0.0002, 0.025), sr, ['bp', 2600 * r.range(0.95, 1.05), 1.3]);
      addModes(x, 0, sr, [{ f: 640, a: 0.4, t60: 0.05 }, { f: 1500, a: 0.25, t60: 0.035 }], 1, 0.0002);
      return normalize(x, 1);
    },
  },
  ka: {
    sr: 32000, gain: 0.07, pan: -0.12, wet: 0.12,
    make(sr, r) {
      const x = band(noiseBurst(sr, 0.04, r, 0.0003, 0.02), sr, ['bp', 2000 * r.range(0.95, 1.05), 1.1]);
      addModes(x, 0, sr, [{ f: 600, a: 0.3, t60: 0.04 }], 1, 0.0002);
      return normalize(x, 1);
    },
  },
  tanggu: {
    sr: 22050, gain: 0.2, pan: -0.1, wet: 0.16,
    make(sr, r) {
      const x = chirp(sr, 0.32, 235, 165, 0.04, 0.26, 0.001);
      mix(x, band(noiseBurst(sr, 0.02, r, 0.0003, 0.012), sr, ['bp', 900, 1]), 0, sr, 0.4);
      return normalize(x, 1);
    },
  },
  kick: {
    sr: 22050, gain: 0.26, pan: 0, wet: 0.04,
    make(sr, r) {
      const x = chirp(sr, 0.35, 105, 50, 0.07, 0.3, 0.001);
      mix(x, band(noiseBurst(sr, 0.005, r, 0.0002, 0.003), sr, ['lp', 2500, 0.7]), 0, sr, 0.15);
      return normalize(x, 1);
    },
  },
  fingerCymbal: {
    sr: 32000, gain: 0.06, pan: 0.3, wet: 0.3,
    make(sr, r) {
      const x = samples(sr, 2.3);
      const f = 2420 * r.range(0.995, 1.005);
      addModes(x, 0, sr, [{ f, a: 1, t60: 2.2, beat: 1.9 }, { f: f * 2.74, a: 0.3, t60: 1.1, beat: 3.3 }, { f: f * 5.1, a: 0.08, t60: 0.5 }], 1, 0.0004);
      return normalize(x, 1);
    },
  },
  gong: {
    sr: 22050, gain: 0.1, pan: 0, wet: 0.35,
    make(sr, r) {
      const x = samples(sr, 2.8);
      addModes(x, 0, sr, [
        { f: 196, a: 1, t60: 2.6, beat: 0.6 }, { f: 301, a: 0.7, t60: 2.2, beat: 0.9 }, { f: 431, a: 0.5, t60: 1.8 },
        { f: 612, a: 0.35, t60: 1.4 }, { f: 873, a: 0.2, t60: 1 },
      ], 1, 0.02);
      mix(x, band(noiseBurst(sr, 0.04, r, 0.001, 0.03), sr, ['lp', 500, 0.7]), 0, sr, 0.25);
      return normalize(x, 1);
    },
  },
};

interface ReedDef {
  detune: number[];
  lp: number;
  attack: number;
  release: number;
  gain: number;
  wave: string;
  vib: number;
  pan: number;
  wet: number;
}

const REEDS: Record<ReedKind, ReedDef> = {
  // a dry two-reed accordion for oom-pah chords
  accordion: { detune: [-6, 6], lp: 2100, attack: 0.025, release: 0.06, gain: 0.05, wave: 'reed', vib: 0, pan: 0.2, wet: 0.2 },
  // three reeds tuned apart: the wet, shimmering Paris musette
  musette: { detune: [-13, 0, 15], lp: 2600, attack: 0.035, release: 0.09, gain: 0.07, wave: 'reed', vib: 4, pan: -0.15, wet: 0.24 },
  // the mouth organ of the teahouse: soft, airy chords
  sheng: { detune: [-4, 5], lp: 2400, attack: 0.18, release: 0.3, gain: 0.03, wave: 'reedBright', vib: 3, pan: 0.15, wet: 0.35 },
  // a harmonium drone under the bazaar
  drone: { detune: [-5, 5], lp: 800, attack: 0.6, release: 0.8, gain: 0.05, wave: 'reed', vib: 0, pan: 0, wet: 0.3 },
};

interface LineDef {
  wave: string;
  lp: number;
  q: number;
  peak?: [number, number, number];
  attack: number;
  release: number;
  gain: number;
  vib: number;
  vibDelay: number;
  breath: number;
  glide: number;
  pan: number;
  wet: number;
  echo?: boolean;
}

const LINES: Record<LineKind, LineDef> = {
  // a 50s lap steel: clean, swelling, sliding, with slapback
  steel: { wave: 'steel', lp: 2300, q: 0.9, attack: 0.012, release: 0.15, gain: 0.11, vib: 9, vibDelay: 0.18, breath: 0, glide: 0.12, pan: -0.15, wet: 0.25, echo: true },
  // the two-string fiddle: nasal, expressive slides
  erhu: { wave: 'erhu', lp: 3400, q: 0.7, peak: [1100, 1.4, 6], attack: 0.08, release: 0.12, gain: 0.08, vib: 18, vibDelay: 0.15, breath: 0.02, glide: 0.1, pan: -0.15, wet: 0.3 },
  flute: { wave: 'flute', lp: 3600, q: 0.6, attack: 0.05, release: 0.1, gain: 0.12, vib: 11, vibDelay: 0.25, breath: 0.09, glide: 0.06, pan: -0.18, wet: 0.28 },
  // bamboo flute with its membrane buzz
  dizi: { wave: 'dizi', lp: 4200, q: 0.6, attack: 0.04, release: 0.1, gain: 0.1, vib: 14, vibDelay: 0.2, breath: 0.1, glide: 0.07, pan: -0.15, wet: 0.32 },
  // the reed flute of the bazaar: dark and breathy
  ney: { wave: 'flute', lp: 2200, q: 0.6, attack: 0.1, release: 0.15, gain: 0.12, vib: 10, vibDelay: 0.3, breath: 0.22, glide: 0.12, pan: -0.15, wet: 0.34 },
};

const VOWELS: Record<Vowel, [number, number]> = { oo: [330, 820], ah: [720, 1150], oh: [470, 870] };

/** Harmonic recipes for oscillator waveforms. */
function harmonics(name: string): number[] {
  const h: number[] = [0];
  switch (name) {
    case 'reed':
      for (let n = 1; n <= 24; n++) h.push((1 / Math.pow(n, 0.9)) * (n % 2 === 0 ? 0.72 : 1));
      break;
    case 'reedBright':
      for (let n = 1; n <= 16; n++) h.push(1 / Math.pow(n, 0.7));
      break;
    case 'flute':
      h.push(1, 0.26, 0.09, 0.035, 0.012);
      break;
    case 'dizi':
      for (let n = 1; n <= 12; n++) h.push(n === 1 ? 1 : 0.3 / Math.pow(n, 0.9));
      break;
    case 'erhu':
      for (let n = 1; n <= 28; n++) h.push((1 / n) * (n >= 3 && n <= 6 ? 1.5 : 1));
      break;
    case 'steel':
      for (let n = 1; n <= 16; n++) h.push((1 / Math.pow(n, 1.25)) * (n === 2 ? 1.3 : 1));
      break;
  }
  return h;
}

/** Per-context resources shared by every band and the SFX: baked notes, noise, waveforms. */
export class Resources {
  private notes = new Map<string, AudioBuffer>();
  private percs = new Map<string, AudioBuffer>();
  private waves = new Map<string, PeriodicWave>();
  private noiseBuf: AudioBuffer | null = null;
  private seed = 1;

  constructor(readonly ctx: BaseAudioContext) {}

  private toBuffer(data: Float32Array, sr: number): AudioBuffer {
    const b = this.ctx.createBuffer(1, data.length, sr);
    b.getChannelData(0).set(data);
    return b;
  }

  note(inst: PluckInst, midi: number): AudioBuffer {
    const key = `${inst}:${midi}`;
    let b = this.notes.get(key);
    if (b) {
      // keep recently used notes at the end (simple LRU)
      this.notes.delete(key);
      this.notes.set(key, b);
      return b;
    }
    const def = PLUCKS[inst];
    b = this.toBuffer(def.make(def.sr, mtof(midi), new Rng(midi * 7919 + inst.length * 131)), def.sr);
    this.notes.set(key, b);
    if (this.notes.size > 140) this.notes.delete(this.notes.keys().next().value!);
    return b;
  }

  /** Bake ahead of time: `inst:midi` or `perc:name` (see Recorder). */
  warm(key: string): void {
    const [a, b] = key.split(':');
    if (a === 'perc') {
      for (let i = 0; i < 3; i++) this.perc(b as PercName);
    } else if (a in PLUCKS) this.note(a as PluckInst, Number(b));
  }

  perc(name: PercName): AudioBuffer {
    const v = this.seed++ % 3;
    const key = `${name}:${v}`;
    let b = this.percs.get(key);
    if (!b) {
      const def = PERC[name];
      b = this.toBuffer(def.make(def.sr, new Rng(v * 104729 + name.length * 17 + 3)), def.sr);
      this.percs.set(key, b);
    }
    return b;
  }

  wave(name: string): PeriodicWave {
    let w = this.waves.get(name);
    if (!w) {
      const imag = Float32Array.from(harmonics(name));
      w = this.ctx.createPeriodicWave(new Float32Array(imag.length), imag);
      this.waves.set(name, w);
    }
    return w;
  }

  get noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const r = new Rng(99);
      const sr = this.ctx.sampleRate;
      const d = new Float32Array(sr * 2);
      for (let i = 0; i < d.length; i++) d[i] = r.bi();
      this.noiseBuf = this.toBuffer(d, sr);
    }
    return this.noiseBuf;
  }
}

interface Chan {
  input: GainNode;
  nodes: AudioNode[];
}

/** What an arrangement can ask of a band (a real one, or a recorder for dry runs). */
export interface Player {
  note(inst: PluckInst, midi: number, t: number, dur: number, vel: number, o?: NoteOpts): void;
  trem(inst: PluckInst, midi: number, t: number, dur: number, vel: number, rate?: number): void;
  strum(inst: PluckInst, midis: number[], t: number, vel: number, dur: number, down?: boolean, spread?: number): void;
  perc(name: PercName, t: number, vel: number, pan?: number): void;
  reed(kind: ReedKind, midis: number[], t: number, dur: number, vel: number, shake?: number): void;
  oohs(midis: number[], t: number, dur: number, vel: number, vowel?: Vowel, to?: Vowel): void;
  line(kind: LineKind, midi: number, t: number, dur: number, vel: number, o?: { from?: number; glide?: number; vib?: number }): void;
  dispose(): void;
}

/** A silent band that only notes which baked notes and drums a song will ask for. */
export class Recorder implements Player {
  readonly keys = new Set<string>();
  note(inst: PluckInst, midi: number): void {
    this.keys.add(`${inst}:${Math.round(midi)}`);
  }
  trem(inst: PluckInst, midi: number): void {
    this.note(inst, midi);
  }
  strum(inst: PluckInst, midis: number[]): void {
    for (const m of midis) this.note(inst, m);
  }
  perc(name: PercName): void {
    this.keys.add(`perc:${name}`);
  }
  reed(): void {}
  oohs(): void {}
  line(): void {}
  dispose(): void {}
}

export interface NoteOpts {
  /** bend by `to` semitones starting `at` s after the attack, over `dur` s (guzheng presses, steel bends) */
  bend?: { to: number; at: number; dur: number };
  /** play-rate detune in cents (on top of the humanising wobble) */
  cents?: number;
}

/**
 * One band playing into `out` (a song's fader, or the SFX bus for the win flourish).
 * Every instrument gets a channel (level, pan, reverb send) the first time it plays.
 */
export class Band implements Player {
  private chans = new Map<string, Chan>();
  private lfo: OscillatorNode | null = null;
  private r: Rng;
  private ctx: BaseAudioContext;

  /** `solo`: only these channels are audible (stem analysis); a channel matches by name or name prefix. */
  constructor(readonly res: Resources, readonly out: AudioNode, private reverb: AudioNode | null, private trims: Partial<Record<string, number>> = {}, seed = 1, private solo?: string[]) {
    this.ctx = res.ctx;
    this.r = new Rng(seed);
  }

  private chan(name: string, pan: number, wet: number, echo = false): Chan {
    let c = this.chans.get(name);
    if (c) return c;
    const ctx = this.ctx;
    const input = ctx.createGain();
    const muted = this.solo && !this.solo.some((x) => name === x || name.startsWith(`${x}@`));
    input.gain.value = muted ? 0 : (this.trims[name] ?? 1);
    const nodes: AudioNode[] = [input];
    let node: AudioNode = input;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
      nodes.push(p);
    }
    node.connect(this.out);
    if (echo) {
      // 50s slapback: one short repeat, a little darker
      const d = ctx.createDelay(0.5);
      d.delayTime.value = 0.12;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.value = 0.28;
      node.connect(d);
      d.connect(f);
      f.connect(g);
      g.connect(this.out);
      nodes.push(d, f, g);
    }
    if (wet > 0 && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = wet;
      node.connect(s);
      s.connect(this.reverb);
      nodes.push(s);
    }
    c = { input, nodes };
    this.chans.set(name, c);
    return c;
  }

  /** The shared vibrato oscillator (one per band). */
  private vibrato(): OscillatorNode {
    if (!this.lfo) {
      this.lfo = this.ctx.createOscillator();
      this.lfo.frequency.value = 5.3;
      this.lfo.start();
    }
    return this.lfo;
  }

  /** small random wobble, in cents, so repeated notes are never identical */
  private wobble(): number {
    return (this.r.next() - 0.5) * 5;
  }

  // ---------------------------------------------------------------- plucked & struck

  note(inst: PluckInst, midi: number, t: number, dur: number, vel: number, o: NoteOpts = {}): void {
    const def = PLUCKS[inst];
    const buf = this.res.note(inst, Math.round(midi));
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = Math.pow(2, ((o.cents ?? 0) + this.wobble()) / 1200);
    src.playbackRate.setValueAtTime(rate, t);
    if (o.bend) {
      src.playbackRate.setValueAtTime(rate, t + o.bend.at);
      src.playbackRate.linearRampToValueAtTime(rate * Math.pow(2, o.bend.to / 12), t + o.bend.at + o.bend.dur);
    }
    const g = ctx.createGain();
    const level = Math.max(0, vel) * def.gain;
    g.gain.setValueAtTime(level, t);
    const end = t + dur;
    src.connect(g);
    g.connect(this.chan(inst, def.pan, def.wet).input);
    src.start(t);
    if (dur < buf.duration - 0.05) {
      g.gain.setValueAtTime(level, end);
      g.gain.setTargetAtTime(0, end, def.rel);
      src.stop(end + def.rel * 4.5);
    } else src.stop(t + buf.duration + 0.02);
  }

  /** Tremolo picking (mandolin, pipa, oud, guzheng): quick repeated strokes for long notes. */
  trem(inst: PluckInst, midi: number, t: number, dur: number, vel: number, rate = 13): void {
    const dt = 1 / rate;
    const n = Math.max(1, Math.round(dur / dt));
    for (let i = 0; i < n; i++) {
      const v = vel * (i === 0 ? 1 : (i % 2 ? 0.62 : 0.78) * (0.9 + this.r.next() * 0.2)) * (i > n - 3 ? 0.85 : 1);
      this.note(inst, midi, t + i * dt + (i ? (this.r.next() - 0.5) * 0.008 : 0), i === n - 1 ? dt * 2.5 : dt + 0.03, v);
    }
  }

  /** A strum: the strings a few milliseconds apart (down = low to high). */
  strum(inst: PluckInst, midis: number[], t: number, vel: number, dur: number, down = true, spread = 0.014): void {
    const order = down ? midis : midis.slice().reverse();
    order.forEach((m, k) => this.note(inst, m, t + k * spread * (0.8 + this.r.next() * 0.4), dur, vel * (down ? 1 - k * 0.06 : 0.75 - k * 0.05)));
  }

  perc(name: PercName, t: number, vel: number, pan?: number): void {
    const def = PERC[name];
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.res.perc(name);
    src.playbackRate.value = Math.pow(2, this.wobble() / 600);
    const g = ctx.createGain();
    g.gain.value = Math.max(0, vel) * def.gain;
    src.connect(g);
    g.connect(this.chan(pan === undefined ? name : `${name}@${pan}`, pan ?? def.pan, def.wet).input);
    src.start(t);
  }

  // ---------------------------------------------------------------- sustained

  /** Reed chords: accordion stabs, a musette line, sheng pads, a drone. `shake` adds bellows tremolo (Hz). */
  reed(kind: ReedKind, midis: number[], t: number, dur: number, vel: number, shake = 0): void {
    const def = REEDS[kind];
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = def.lp;
    f.Q.value = 0.5;
    const g = ctx.createGain();
    const peak = (vel * def.gain) / Math.sqrt(midis.length);
    const a = Math.min(def.attack, dur * 0.5);
    const end = t + dur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * 0.85, Math.max(t + a + 0.001, end));
    g.gain.setTargetAtTime(0, end, def.release / 3);
    const stop = end + def.release * 2 + 0.05;
    f.connect(g);
    let last: AudioNode = g;
    const extra: AudioScheduledSourceNode[] = [];
    if (shake > 0) {
      const sg = ctx.createGain();
      sg.gain.value = 0.75;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = shake;
      const depth = ctx.createGain();
      depth.gain.value = 0.25;
      lfo.connect(depth);
      depth.connect(sg.gain);
      g.connect(sg);
      last = sg;
      extra.push(lfo);
    }
    last.connect(this.chan(kind, def.pan, def.wet).input);
    let depth: GainNode | null = null;
    if (def.vib > 0) {
      depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(def.vib, t + Math.min(0.4, dur * 0.6));
      this.vibrato().connect(depth);
    }
    let first: OscillatorNode | null = null;
    for (const m of midis) {
      for (const d of def.detune) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(this.res.wave(def.wave));
        o.frequency.value = mtof(m);
        o.detune.value = d + this.wobble();
        if (depth) depth.connect(o.detune);
        o.connect(f);
        o.start(t);
        o.stop(stop);
        first ??= o;
      }
    }
    for (const x of extra) {
      x.start(t);
      x.stop(stop);
    }
    if (depth && first) this.detachWhenDone(first, depth);
  }

  /** Unhook a per-note vibrato depth from the shared LFO once the note has ended (no leaks over long sessions). */
  private detachWhenDone(osc: OscillatorNode, depth: GainNode): void {
    osc.onended = () => {
      try {
        this.lfo?.disconnect(depth);
      } catch {
        /* already gone */
      }
    };
  }

  /** Doo-wop backing voices on a chord: sawtooth voices through two shared vowel formants. */
  oohs(midis: number[], t: number, dur: number, vel: number, vowel: Vowel = 'oo', to?: Vowel): void {
    const ctx = this.ctx;
    const sum = ctx.createGain();
    sum.gain.value = 1.4 / midis.length;
    const [f1, f2] = VOWELS[vowel];
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass';
    b1.frequency.value = f1;
    b1.Q.value = f1 / 90;
    const b2 = ctx.createBiquadFilter();
    b2.type = 'bandpass';
    b2.frequency.value = f2;
    b2.Q.value = f2 / 130;
    if (to) {
      const [g1, g2] = VOWELS[to];
      b1.frequency.setValueAtTime(f1, t + dur * 0.3);
      b1.frequency.linearRampToValueAtTime(g1, t + dur * 0.8);
      b2.frequency.setValueAtTime(f2, t + dur * 0.3);
      b2.frequency.linearRampToValueAtTime(g2, t + dur * 0.8);
    }
    const m2 = ctx.createGain();
    m2.gain.value = 0.55;
    const env = ctx.createGain();
    const peak = vel * 0.55;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + Math.min(0.28, dur * 0.4));
    env.gain.setValueAtTime(peak, Math.max(t + 0.3, t + dur - 0.1));
    env.gain.setTargetAtTime(0, t + dur, 0.14);
    sum.connect(b1);
    sum.connect(b2);
    b2.connect(m2);
    b1.connect(env);
    m2.connect(env);
    env.connect(this.chan('oohs', 0.1, 0.35).input);
    const depth = ctx.createGain();
    depth.gain.value = 10;
    this.vibrato().connect(depth);
    const stop = t + dur + 0.7;
    let first: OscillatorNode | null = null;
    midis.forEach((m, k) => {
      // one voice per note; alternate sharp/flat singers give the section its chorus
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = (k % 2 ? 7 : -7) + this.wobble();
      depth.connect(o.detune);
      o.connect(sum);
      o.start(t);
      o.stop(stop);
      first ??= o;
    });
    if (first) this.detachWhenDone(first, depth);
  }

  /** A single sung/bowed/blown note, optionally sliding in from `from`. */
  line(kind: LineKind, midi: number, t: number, dur: number, vel: number, o: { from?: number; glide?: number; vib?: number } = {}): void {
    const def = LINES[kind];
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.res.wave(def.wave));
    const f1 = mtof(midi);
    if (o.from !== undefined && o.from !== midi) {
      osc.frequency.setValueAtTime(mtof(o.from), t);
      osc.frequency.exponentialRampToValueAtTime(f1, t + (o.glide ?? def.glide));
    } else osc.frequency.setValueAtTime(f1, t);
    const ch = this.chan(kind, def.pan, def.wet, def.echo).input;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = def.lp;
    lp.Q.value = def.q;
    osc.connect(lp);
    let tail: AudioNode = lp;
    if (def.peak) {
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      [pk.frequency.value, pk.Q.value, pk.gain.value] = def.peak;
      lp.connect(pk);
      tail = pk;
    }
    const env = ctx.createGain();
    const peak = vel * def.gain;
    const a = Math.min(dur * 0.5, dur > 0.5 && kind === 'steel' ? 0.09 : def.attack);
    const end = t + dur;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + a);
    env.gain.setTargetAtTime(peak * 0.8, t + a, Math.max(0.05, dur * 0.6));
    env.gain.setTargetAtTime(0, end, def.release / 3);
    tail.connect(env);
    env.connect(ch);
    const stop = end + def.release * 2 + 0.05;
    const vib = o.vib ?? def.vib;
    let depth: GainNode | null = null;
    if (vib > 0 && dur > def.vibDelay) {
      depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + def.vibDelay);
      depth.gain.linearRampToValueAtTime(vib, t + def.vibDelay + 0.25);
      this.vibrato().connect(depth);
      depth.connect(osc.detune);
    }
    osc.start(t);
    osc.stop(stop);
    if (def.breath > 0) {
      const n = ctx.createBufferSource();
      n.buffer = this.res.noise;
      n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(6000, f1 * 2);
      bp.Q.value = 1.2;
      const bg = ctx.createGain();
      const bpk = peak * def.breath * 4;
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(bpk * 1.6, t + a * 0.7);
      bg.gain.setTargetAtTime(bpk * 0.6, t + a, 0.08);
      bg.gain.setTargetAtTime(0, end, def.release / 3);
      n.connect(bp);
      bp.connect(bg);
      bg.connect(ch);
      n.start(t, this.r.next());
      n.stop(stop);
    }
    if (depth) this.detachWhenDone(osc, depth);
  }

  /** Fade and release everything (after the song's fader has done its job). */
  dispose(): void {
    for (const c of this.chans.values()) for (const n of c.nodes) n.disconnect();
    this.chans.clear();
    try {
      this.lfo?.stop();
    } catch {
      /* not started */
    }
    this.lfo = null;
  }
}
