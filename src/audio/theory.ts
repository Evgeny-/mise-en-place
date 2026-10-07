/**
 * Just enough music theory for the kitchen bands: a compact melody notation, chord symbols,
 * voice-led chord voicings, diatonic steps and gentle melodic variation for repeats.
 *
 * Melody lines: bars separated by `|`, notes as `<name><octave>[:<steps>][flags]`, e.g.
 * `C5:2 F5:2 A5:2 | C6:3~ Bb5 A5:2`. `-` is a rest, `_` ties onto the previous note. Flags:
 * `~` sustain ornament (tremolo on plucked strings, vibrato on winds), `^` slide/scoop into the
 * note, `'` accent, `,` ghost (soft).
 */
import type { Rng } from './dsp';

export interface Note {
  /** start, in grid steps from the bar start */
  step: number;
  /** length in grid steps (may run past the bar end when tied) */
  dur: number;
  /** MIDI pitch, or null for a rest */
  midi: number | null;
  flags: string;
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchClass(name: string): number {
  const pc = LETTER[name[0]];
  if (pc === undefined) throw new Error(`bad pitch ${name}`);
  const acc = name.slice(1);
  return (pc + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
}

export function noteMidi(name: string): number {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const base = LETTER[m[1][0]] + (m[1][1] === '#' ? 1 : m[1][1] === 'b' ? -1 : 0);
  return base + 12 * (Number(m[2]) + 1);
}

const TOKEN = /^([A-G](?:#|b)?-?\d|-|_)(?::(\d+(?:\.\d+)?))?([~^',]*)$/;

/** Parse a melody line into bars of notes; every bar must fill exactly `steps` steps. */
export function parseLine(src: string, steps: number): Note[][] {
  const bars = src.split('|').map((b) => b.trim()).filter((b) => b.length > 0);
  const out: Note[][] = [];
  let last: Note | null = null;
  bars.forEach((bar, bi) => {
    const notes: Note[] = [];
    let pos = 0;
    for (const tok of bar.split(/\s+/)) {
      const m = TOKEN.exec(tok);
      if (!m) throw new Error(`bad token "${tok}" in bar ${bi + 1}`);
      const dur = m[2] ? Number(m[2]) : 1;
      if (m[1] === '_') {
        if (!last) throw new Error(`tie with nothing before it in bar ${bi + 1}`);
        last.dur += dur;
      } else if (m[1] === '-') {
        last = null;
      } else {
        last = { step: pos, dur, midi: noteMidi(m[1]), flags: m[3] ?? '' };
        notes.push(last);
      }
      pos += dur;
    }
    if (Math.abs(pos - steps) > 1e-6) throw new Error(`bar ${bi + 1} "${bar}" has ${pos} steps, expected ${steps}`);
    out.push(notes);
  });
  return out;
}

// ------------------------------------------------------------------ chords

export interface Chord {
  name: string;
  /** root pitch class */
  root: number;
  /** chord tones in semitones above the root */
  iv: number[];
  /** bass pitch class (slash chords) */
  bass: number;
}

export interface ChordAt {
  chord: Chord;
  step: number;
  dur: number;
}

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7], '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], '69': [0, 4, 7, 9, 14], '7b9': [0, 4, 7, 10, 13], m7b5: [0, 3, 6, 10],
};

export function parseChord(sym: string): Chord {
  const m = /^([A-G](?:#|b)?)([a-z0-9]*)(?:\/([A-G](?:#|b)?))?$/.exec(sym);
  if (!m || !(m[2] in QUALITY)) throw new Error(`bad chord ${sym}`);
  const root = pitchClass(m[1]);
  return { name: sym, root, iv: QUALITY[m[2]], bass: m[3] ? pitchClass(m[3]) : root };
}

/** Chords per bar: `F | C7 | Bb C7` (several in a bar share it evenly). */
export function parseChords(src: string, steps: number): ChordAt[][] {
  return src
    .split('|')
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .map((bar) => {
      const syms = bar.split(/\s+/);
      const d = steps / syms.length;
      return syms.map((s, i) => ({ chord: parseChord(s), step: i * d, dur: d }));
    });
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** The lowest MIDI note of pitch class `pc` at or above `lo`. */
export function above(pc: number, lo: number): number {
  return lo + mod12(pc - lo);
}

/** The MIDI note of pitch class `pc` closest to `target`. */
export function nearest(pc: number, target: number): number {
  const lo = target - mod12(target - pc);
  return target - lo > 6 ? lo + 12 : lo;
}

/** Bass note of the chord in the octave starting at `lo`. */
export function bassOf(c: Chord, lo = 36): number {
  return above(c.bass, lo);
}

/**
 * A close voicing of `n` chord tones around `center`, moving as little as possible from `prev`.
 * Extra tones are dropped in the order fifth, root (so a 7th chord in 3 voices keeps 3rd, 7th, root).
 */
export function voicing(c: Chord, center: number, n = 3, prev?: number[] | null): number[] {
  const tones = c.iv.slice();
  while (tones.length > n) {
    const i5 = tones.indexOf(7);
    if (i5 >= 0) tones.splice(i5, 1);
    else if (tones.indexOf(0) >= 0) tones.splice(tones.indexOf(0), 1);
    else tones.pop();
  }
  const pcs = tones.map((i) => mod12(c.root + i));
  while (pcs.length < n) pcs.push(pcs[pcs.length % tones.length]);
  let best: number[] = [];
  let bestScore = Infinity;
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = pcs.slice(rot).concat(pcs.slice(0, rot));
    for (let low = center - 12; low <= center; low++) {
      if (mod12(low) !== order[0]) continue;
      const v = [low];
      for (let k = 1; k < order.length; k++) {
        let m = v[k - 1] + 1;
        while (mod12(m) !== order[k]) m++;
        v.push(m);
      }
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      let score = Math.abs(mean - center) * 0.6;
      if (prev && prev.length === v.length) for (let k = 0; k < v.length; k++) score += Math.abs(v[k] - prev[k]);
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
  }
  return best;
}

/** The chord tone nearest to `target` (for improvised notes on strong beats). */
export function chordTone(c: Chord, target: number): number {
  let best = target;
  let d = Infinity;
  for (const iv of c.iv) {
    const m = nearest(mod12(c.root + iv), target);
    if (Math.abs(m - target) < d) {
      d = Math.abs(m - target);
      best = m;
    }
  }
  return best;
}

// ------------------------------------------------------------------ scales

/** Move `n` degrees along the scale (key pitch class + degrees in semitones) from `midi`. */
export function scaleStep(midi: number, n: number, key: number, scale: number[]): number {
  const inScale = (m: number) => scale.includes(mod12(m - key));
  let m = midi;
  while (!inScale(m)) m--;
  const dir = Math.sign(n);
  for (let k = 0; k < Math.abs(n); k++) {
    m += dir;
    while (!inScale(m)) m += dir;
  }
  return m;
}

/** Snap to the scale (downwards). */
export function inKey(midi: number, key: number, scale: number[]): number {
  return scaleStep(midi, 0, key, scale);
}

/**
 * A repeat played a little differently: passing tones fill some thirds, some long notes get a turn,
 * an odd short note drops out. Bar-local and gentle, the tune stays recognisable.
 */
export function vary(notes: Note[], amount: number, r: Rng, key: number, scale: number[]): Note[] {
  if (amount <= 0) return notes;
  const out: Note[] = [];
  notes.forEach((n, i) => {
    const next = notes[i + 1];
    if (n.midi === null) return;
    if (next && next.midi !== null && n.dur >= 2 && next.step === n.step + n.dur) {
      const iv = next.midi - n.midi;
      if (Math.abs(iv) >= 3 && Math.abs(iv) <= 4 && r.next() < 0.35 * amount) {
        out.push({ ...n, dur: n.dur - 1 });
        out.push({ step: n.step + n.dur - 1, dur: 1, midi: scaleStep(n.midi, Math.sign(iv), key, scale), flags: ',' });
        return;
      }
    }
    if (n.dur >= 3 && r.next() < 0.22 * amount) {
      const up = scaleStep(n.midi, 1, key, scale);
      out.push({ ...n, dur: n.dur - 2, flags: n.flags.replace('~', '') });
      out.push({ step: n.step + n.dur - 2, dur: 1, midi: up, flags: ',' });
      out.push({ step: n.step + n.dur - 1, dur: 1, midi: n.midi, flags: '' });
      return;
    }
    if (n.dur <= 1 && n.step > 0 && i > 0 && r.next() < 0.1 * amount) return;
    out.push(n);
  });
  return out;
}
