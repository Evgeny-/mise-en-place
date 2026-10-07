/**
 * The song runner: walks a kitchen's form (intro, A, B, breaks...) bar by bar, keeps count of how
 * many times each section has come round (so arrangements can change on repeats), varies the tune a
 * little each pass and hands every bar to the kitchen's arranger with humanised timing helpers.
 */
import { type Player, Recorder } from './band';
import { Rng } from './dsp';
import { type Chord, type ChordAt, type Note, parseChords, parseLine, vary } from './theory';

export interface SectionDef {
  /** chord symbols per bar, `|`-separated */
  chords: string;
  /** the tune, if this section has one (see theory.ts for the notation) */
  mel?: string;
}

export interface SongDef {
  id: string;
  name: string;
  /** felt beats per minute (dotted quarters in 6/8 and 12/8) */
  bpm: number;
  /** felt beats per bar */
  beats: number;
  /** grid steps per bar (eighths, or triplet eighths in 12/8) */
  steps: number;
  /** swing: delay of odd steps as a fraction of a step */
  swing?: number;
  /** key: tonic pitch class, and the scale (semitones) used for harmonies and variations */
  key: number;
  scale: number[];
  /** loudness trim in dB, calibrated so every kitchen plays equally loud */
  trim: number;
  /** per-instrument level trims for this kitchen's mix */
  mix?: Partial<Record<string, number>>;
  sections: Record<string, SectionDef>;
  /** section order; after the last one the form goes back to `form[loop]` */
  form: string[];
  loop: number;
  arrange(b: Bar, band: Player): void;
  /** a short flourish in the kitchen's style for the win jingle (played on the SFX bus) */
  tag(band: Player, t: number, r: Rng): void;
}

export interface Bar {
  /** start time (context seconds) */
  t: number;
  /** seconds per felt beat, per grid step, per bar */
  beat: number;
  step: number;
  len: number;
  steps: number;
  beats: number;
  /** section name, bar index in it, its length; how many times it has been played before */
  sec: string;
  i: number;
  n: number;
  pass: number;
  /** times the whole form has looped; bars played so far */
  cycle: number;
  total: number;
  chords: ChordAt[];
  chord: Chord;
  /** first chord of the next bar, and the next bar's section */
  next: Chord;
  nextSec: string;
  /** this bar's melody notes (varied on repeats) */
  mel: Note[];
  first: boolean;
  last: boolean;
  /** last bar of a 4-bar phrase */
  phraseEnd: boolean;
  key: number;
  scale: number[];
  r: Rng;
  /** scratch memory that lives as long as the song (voicings, last notes...) */
  mem: Record<string, unknown>;
  /** time of grid step `s` (swing and a little human timing jitter) */
  at(s: number, jitter?: number): number;
  /** humanised velocity */
  vel(v: number, spread?: number): number;
  chordAt(s: number): Chord;
}

interface Section {
  chords: ChordAt[][];
  mel: Note[][] | null;
  bars: number;
}

const compiled = new WeakMap<SongDef, Record<string, Section>>();

/** Parse (and validate) a song's sections once. Throws on notation errors. */
export function compile(def: SongDef): Record<string, Section> {
  let c = compiled.get(def);
  if (c) return c;
  c = {};
  for (const [name, s] of Object.entries(def.sections)) {
    const chords = parseChords(s.chords, def.steps);
    let mel: Note[][] | null = null;
    if (s.mel) {
      try {
        mel = parseLine(s.mel, def.steps);
      } catch (e) {
        throw new Error(`${def.id}.${name}: ${(e as Error).message}`);
      }
      if (mel.length !== chords.length) throw new Error(`${def.id}.${name}: ${mel.length} melody bars vs ${chords.length} chord bars`);
    }
    c[name] = { chords, mel, bars: chords.length };
  }
  for (const f of def.form) if (!c[f]) throw new Error(`${def.id}: form uses unknown section ${f}`);
  compiled.set(def, c);
  return c;
}

export class Song {
  private secs: Record<string, Section>;
  private nextT: number;
  private f = 0;
  private i = 0;
  private cycle = 0;
  private total = 0;
  private passes = new Map<string, number>();
  private mem: Record<string, unknown> = {};
  private r: Rng;
  readonly stepLen: number;
  readonly barLen: number;
  /** what is playing now (for the audition page) */
  now = { sec: '', bar: 0, pass: 0, cycle: 0 };

  constructor(readonly def: SongDef, readonly band: Player, start: number, seed: number) {
    this.secs = compile(def);
    this.nextT = start;
    this.r = new Rng(seed);
    this.barLen = (60 / def.bpm) * def.beats;
    this.stepLen = this.barLen / def.steps;
  }

  /** Every baked note and drum a song is likely to need (a silent dry run over `bars` bars). */
  static preview(def: SongDef, bars = 140): string[] {
    const rec = new Recorder();
    const s = new Song(def, rec, 0, 1);
    s.pump(s.barLen * bars);
    return [...rec.keys];
  }

  /** Schedule every bar that starts before `until`. */
  pump(until: number): void {
    while (this.nextT < until) this.bar();
  }

  private after(f: number, i: number): { f: number; i: number } {
    const form = this.def.form;
    if (i + 1 < this.secs[form[f]].bars) return { f, i: i + 1 };
    return { f: f + 1 < form.length ? f + 1 : this.def.loop, i: 0 };
  }

  private bar(): void {
    const def = this.def;
    const name = def.form[this.f];
    const sec = this.secs[name];
    const pass = this.passes.get(name) ?? 0;
    const nx = this.after(this.f, this.i);
    const nextSec = def.form[nx.f];
    const t = this.nextT;
    const r = this.r;
    const stepLen = this.stepLen;
    const swing = def.swing ?? 0;
    const chords = sec.chords[this.i];
    const raw = sec.mel ? sec.mel[this.i] : [];
    const mel = pass > 0 ? vary(raw, Math.min(1, 0.45 + pass * 0.25), r, def.key, def.scale) : raw;
    const b: Bar = {
      t,
      beat: 60 / def.bpm,
      step: stepLen,
      len: this.barLen,
      steps: def.steps,
      beats: def.beats,
      sec: name,
      i: this.i,
      n: sec.bars,
      pass,
      cycle: this.cycle,
      total: this.total,
      chords,
      chord: chords[0].chord,
      next: this.secs[nextSec].chords[nx.i][0].chord,
      nextSec,
      mel,
      first: this.i === 0,
      last: this.i === sec.bars - 1,
      phraseEnd: this.i % 4 === 3,
      key: def.key,
      scale: def.scale,
      r,
      mem: this.mem,
      at: (s, jitter = 0.004) => {
        const odd = swing > 0 && Math.abs(s - Math.round(s)) < 1e-6 && Math.round(s) % 2 === 1;
        return t + s * stepLen + (odd ? swing * stepLen : 0) + r.gauss() * jitter;
      },
      vel: (v, spread = 0.08) => Math.max(0.03, Math.min(1.3, v * (1 + r.gauss() * spread))),
      chordAt: (s) => {
        let c = chords[0].chord;
        for (const ca of chords) if (ca.step <= s + 1e-6) c = ca.chord;
        return c;
      },
    };
    this.now = { sec: name, bar: this.i, pass, cycle: this.cycle };
    def.arrange(b, this.band);
    this.nextT += this.barLen;
    this.total++;
    if (nx.i === 0) {
      this.passes.set(name, pass + 1);
      if (nx.f <= this.f) this.cycle++;
    }
    this.f = nx.f;
    this.i = nx.i;
  }
}
