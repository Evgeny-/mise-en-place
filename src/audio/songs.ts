/**
 * The kitchens' house bands. Each kitchen has its own tune (A and B sections, an intro and a
 * quieter "break" for thinking), its own band and its own groove. Repeats change who plays the
 * tune, add harmony or percussion and vary the melody a little, so long sessions keep moving.
 *
 * Index = `KitchenTheme.music` (src/render/themes.ts).
 */
import type { LineKind, Player as Band, PluckInst, ReedKind } from './band';
import type { Bar, SongDef } from './song';
import { bassOf, type Chord, chordTone, inKey, type Note, scaleStep, voicing } from './theory';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];

type Lead = PluckInst | LineKind | 'accordion' | 'musette';
const LINE = new Set<string>(['steel', 'erhu', 'flute', 'dizi', 'ney']);
const REED = new Set<string>(['accordion', 'musette', 'sheng']);
const TREM_RATE: Partial<Record<string, number>> = { mandolin: 13, pipa: 15, oud: 11, guzheng: 12, qanun: 12 };

// ------------------------------------------------------------------ playing helpers

/** One note, the way this instrument plays a tune (tremolo on long plucked notes, slides on lines). */
function voice(band: Band, b: Bar, inst: Lead, m: number, t: number, dur: number, v: number, flags = '', slot: string = inst): void {
  if (LINE.has(inst)) {
    const key = `line:${slot}`;
    const prev = b.mem[key] as { m: number; end: number } | undefined;
    const close = !!prev && t - prev.end < 0.15 && Math.abs(m - prev.m) <= 7 && m !== prev.m;
    const slide = close && (flags.includes('^') || ((inst === 'steel' || inst === 'erhu' || inst === 'ney') && b.r.next() < 0.45));
    band.line(inst as LineKind, m, t, dur * 0.94, v, { from: slide ? prev!.m : undefined });
    b.mem[key] = { m, end: t + dur };
  } else if (REED.has(inst)) {
    band.reed(inst as ReedKind, [m], t, dur * 0.92, v);
  } else if (TREM_RATE[inst] && flags.includes('~') && dur > 0.3) {
    band.trem(inst as PluckInst, m, t, dur, v * 0.9, TREM_RATE[inst]);
  } else {
    band.note(inst as PluckInst, m, t, Math.max(dur * 1.05, 0.12), v);
  }
}

interface MelOpts {
  vel?: number;
  /** octaves up/down */
  oct?: number;
  /** play it this many scale steps away: -2 = a third below (a harmony line) */
  shift?: number;
  notes?: Note[];
}

/** The bar's tune on `inst`. */
function melody(band: Band, b: Bar, inst: Lead, o: MelOpts = {}): void {
  for (const n of o.notes ?? b.mel) {
    if (n.midi === null) continue;
    let m = n.midi + 12 * (o.oct ?? 0);
    if (o.shift) m = scaleStep(m, o.shift, b.key, b.scale);
    const accent = n.flags.includes("'") ? 1.12 : n.flags.includes(',') ? 0.72 : 1;
    const v = b.vel((o.vel ?? 0.8) * accent * (n.step === 0 ? 1.04 : 1), 0.07);
    voice(band, b, inst, m, b.at(n.step, 0.007), n.dur * b.step, v, n.flags, o.shift || o.oct ? `${inst}${o.shift ?? 0}${o.oct ?? 0}` : inst);
  }
}

/** The step from which the tune rests until the end of the bar (2+ steps), or null. */
function restFrom(b: Bar): number | null {
  if (!b.mel.length) return null;
  const last = b.mel[b.mel.length - 1];
  const end = last.step + last.dur;
  return end <= b.steps - 2 ? end : null;
}

/** A few improvised notes: chord tones on the beats, steps in between. Sparse by design. */
function improv(band: Band, b: Bar, inst: Lead, o: { density: number; center: number; vel: number; every?: number }): void {
  const every = o.every ?? 1;
  let last = (b.mem[`imp:${inst}`] as number | undefined) ?? o.center;
  const per = b.steps / b.beats;
  for (let s = 0; s < b.steps; s += every) {
    const strong = s % per === 0;
    if (b.r.next() > o.density * (strong ? 1.3 : 0.8)) continue;
    let m = strong ? chordTone(b.chordAt(s), last + Math.round(b.r.gauss() * 2.5)) : scaleStep(last, b.r.next() < 0.5 ? 1 : -1, b.key, b.scale);
    if (m > o.center + 8) m = scaleStep(m, -3, b.key, b.scale);
    if (m < o.center - 8) m = scaleStep(m, 3, b.key, b.scale);
    const len = every * (b.r.next() < 0.3 ? 2 : 1);
    voice(band, b, inst, m, b.at(s, 0.01), len * b.step, b.vel(o.vel, 0.12), '', `${inst}i`);
    last = m;
  }
  b.mem[`imp:${inst}`] = last;
}

/** A quick scale run of `n` notes from `from` (dir +1 up, -1 down), `gap` seconds apart. */
function run(band: Band, b: Bar, inst: Lead, from: number, n: number, dir: number, t: number, gap: number, vel: number): void {
  let m = inKey(from, b.key, b.scale);
  for (let k = 0; k < n; k++) {
    voice(band, b, inst, m, t + k * gap, gap * 1.3, vel * (0.78 + 0.22 * (k / n)), '', `${inst}run`);
    m = scaleStep(m, dir, b.key, b.scale);
  }
}

/** A harp/zither glissando up the scale. */
function gliss(band: Band, inst: PluckInst, key: number, scale: number[], from: number, to: number, t: number, dur: number, vel: number): void {
  const notes: number[] = [];
  for (let m = scaleStep(from, 0, key, scale); m <= to; m = scaleStep(m, 1, key, scale)) notes.push(m);
  notes.forEach((m, i) => band.note(inst, m, t + (i / notes.length) * dur, 0.9, vel * (0.55 + 0.45 * (i / notes.length))));
}

/** Chord tones from `lo` upwards, `count` of them (for arpeggios). */
function tonesUp(c: Chord, lo: number, count: number): number[] {
  const out: number[] = [];
  for (let m = lo; out.length < count && m < lo + 48; m++) if (c.iv.some((iv) => (((c.root + iv - m) % 12) + 12) % 12 === 0)) out.push(m);
  return out;
}

const fifthOf = (root: number, top: number) => (root + 7 > top ? root - 5 : root + 7);
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length];

// ------------------------------------------------------------------ 0 · Trattoria

const trattoria: SongDef = {
  id: 'trattoria',
  name: 'Trattoria · Sunday sauce',
  bpm: 132,
  beats: 3,
  steps: 6,
  key: 5,
  scale: MAJOR,
  trim: 2.1,
  mix: { guitar: 0.7, accordion: 1.25, tambourine: 3, bass: 0.75 },
  sections: {
    intro: { chords: 'F | C7 | F | C7' },
    A: {
      chords: 'F | F | C7 | C7 | C7 | C7 | F | F | F | F7 | Bb | Bb | F | C7 | F | F',
      mel: 'C5:2 F5:2 A5:2 | C6:3~ Bb5 A5:2 | G5:4~ E5:2 | C5:4~ -:2 | Bb4:2 E5:2 G5:2 | Bb5:3~ A5 G5:2 | A5:4~ F5:2 | F5:2 E5 F5 G5:2 | A5:4~ C6:2 | Eb6:3~ D6 C6:2 | D6:4~ Bb5:2 | G5:2 A5:2 Bb5:2 | C6:2 A5:2 F5:2 | G5:3 A5 G5 E5 | F5:6~ | -:4 C5:2',
    },
    B: {
      chords: 'Dm | Dm | A7 | A7 | A7 | A7 | Dm | Dm | Gm | Gm | Dm | Dm | Bb | C7 | F | C7',
      mel: 'A4:2 D5:2 F5:2 | A5:4~ G5:2 | G5:2 F5:2 E5:2 | C#5:6~ | E5:2 G5:2 Bb5:2 | A5:3~ G5 F5:2 | F5:4~ E5:2 | D5:6~ | D5:2 G5:2 Bb5:2 | Bb5:4~ A5:2 | A5:2 F5:2 D5:2 | F5:4~ E5:2 | D5:2 F5:2 Bb5:2 | Bb5:3~ A5 G5:2 | A5:6~ | G5:2 E5:2 C5:2',
    },
    break: { chords: 'F | Dm | Gm | C7 | F | Dm | Gm | C7' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const beat = (k: number, j = 0.004) => b.at(k * 2, j);
    const ch = b.chord;
    const root = bassOf(ch, 36);
    const fifth = fifthOf(root, 47);
    const s = b.sec;
    const lead: Lead | null = s === 'A' ? pick(['mandolin', 'accordion', 'mandolin', 'guitar'] as const, b.pass) : s === 'B' ? pick(['accordion', 'mandolin', 'accordion'] as const, b.pass) : null;

    // bass: "oom" on the downbeat, walking into a new chord at the end of a phrase
    if (b.phraseEnd && b.next.name !== ch.name && s !== 'break') {
      const to = bassOf(b.next, 36);
      band.note('bass', root, beat(0), b.beat * 0.9, b.vel(0.85));
      band.note('bass', fifth, beat(1), b.beat * 0.8, b.vel(0.6));
      band.note('bass', to + (to < fifth ? 1 : -1), beat(2), b.beat * 0.8, b.vel(0.62));
    } else band.note('bass', b.i % 2 ? fifth : root, beat(0), b.beat * 0.95, b.vel(0.85));

    if (s === 'break') {
      // the kitchen breathes: guitar arpeggios, now and then a mandolin phrase
      const v = voicing(ch, 62, 3, b.mem.arp as number[] | undefined);
      b.mem.arp = v;
      [root + 12, v[0], v[1], v[2], v[1], v[0]].forEach((m, k) => band.note('guitar', m, b.at(k, 0.006), b.step * 2.2, b.vel(k ? 0.4 : 0.5)));
      if (b.pass % 2 === 1 || b.i >= 4) improv(band, b, 'mandolin', { density: 0.3, center: 74, vel: 0.55 });
      return;
    }

    // pah-pah on beats 2 and 3: the accordion, or the guitar while the accordion sings
    const v = voicing(ch, 63, 3, b.mem.pah as number[] | undefined);
    b.mem.pah = v;
    if (lead === 'accordion') {
      band.strum('guitar', v, beat(1), b.vel(0.45), b.beat * 0.5, true, 0.01);
      band.strum('guitar', v, beat(2), b.vel(0.36), b.beat * 0.45, true, 0.01);
    } else {
      band.reed('accordion', v, beat(1), b.beat * 0.5, b.vel(0.62));
      band.reed('accordion', v, beat(2), b.beat * 0.45, b.vel(0.5));
    }

    if (s === 'intro') {
      if (b.last) [67, 69, 70].forEach((m, k) => band.note('mandolin', m, b.at(3 + k, 0.006), b.step, b.vel(0.6)));
      return;
    }
    // a soft held chord under the mandolin keeps the room warm between the oom-pah-pahs
    if (lead !== 'accordion') {
      const held = voicing(ch, 58, 2, b.mem.held as number[] | undefined);
      b.mem.held = held;
      band.reed('accordion', held, b.at(0, 0.01), b.len * 0.97, b.vel(0.3));
    }

    if (lead === 'mandolin') melody(band, b, 'mandolin', { vel: 0.85 });
    else if (lead === 'accordion') {
      melody(band, b, 'accordion', { vel: 1 });
      if (s === 'A') melody(band, b, 'mandolin', { vel: 0.42, shift: -2 });
    } else if (lead === 'guitar') melody(band, b, 'guitar', { vel: 0.95 });

    const rest = restFrom(b);
    if (rest !== null) run(band, b, lead === 'mandolin' ? 'guitar' : 'mandolin', chordTone(b.chordAt(rest), 69), b.steps - rest, 1, b.at(rest, 0.005), b.step, 0.5);

    // a tambourine shimmer on some repeats
    if ((s === 'B' && b.pass % 3 !== 0) || (s === 'A' && b.pass % 4 === 2)) {
      band.perc('tambourine', beat(0), b.vel(0.55));
      if (b.phraseEnd) {
        band.perc('tambourine', beat(1), b.vel(0.4));
        band.perc('tambourine', beat(2), b.vel(0.45));
      }
    }
  },
  tag(band, t) {
    [60, 65, 69, 72].forEach((m, k) => band.note('mandolin', m, t + k * 0.11, 0.2, 0.8));
    const e = t + 0.44;
    for (const m of [65, 69, 72]) band.trem('mandolin', m, e, 1.2, 0.55, 13);
    band.reed('accordion', [53, 57, 60, 65], e, 1.3, 0.9);
    band.note('bass', 36, t + 0.22, 0.2, 0.6);
    band.note('bass', 41, e, 1.2, 0.55);
  },
};

// ------------------------------------------------------------------ 1 · Burger Joint

const diner: SongDef = {
  id: 'diner',
  name: 'Burger Joint · jukebox ballad',
  bpm: 74,
  beats: 4,
  steps: 12,
  key: 10,
  scale: MAJOR,
  trim: -1.0,
  mix: { piano: 0.85, oohs: 0.7, brush: 3, brushTap: 3, snap: 2.5 },
  sections: {
    intro: { chords: 'Bb | F7' },
    A: {
      chords: 'Bb | Gm | Eb | F7 | Bb | Gm | Eb F7 | Bb',
      mel: 'F5:9~ D5:3 | G5:6 F5:3 D5:3 | Eb5:6 G5:3 Bb5:3 | A5:9~ -:3 | F5:6 D5:3 F5:3 | Bb5:6~ A5:3 G5:3 | G5:6 A5:3 C6:3 | Bb5:9~ -:3',
    },
    B: {
      chords: 'Eb | Eb | Bb | Bb | C7 | C7 | F7 | F7',
      mel: 'G5:3 Bb5:3 G5:3 Eb5:3 | F5:6 Eb5:3 C5:3 | D5:9~ Bb4:3 | D5:3 F5:3 G5:3 Ab5:3 | G5:9~ E5:3 | Bb5:6 A5:3 G5:3 | A5:6 F5:3 Eb5:3 | C5:6~ -:6',
    },
    break: { chords: 'Bb | Gm | Eb | F7' },
  },
  form: ['intro', 'A', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    const beat = (k: number, j = 0.004) => b.at(k * 3, j);
    // upright bass: the root, the fifth half way, a pickup into a new chord
    for (const c of b.chords) {
      const root = bassOf(c.chord, 34);
      band.note('bass', root, b.at(c.step, 0.004), b.step * Math.min(5, c.dur - 1), b.vel(0.85));
      if (c.dur >= 12) band.note('bass', fifthOf(root, 46), b.at(c.step + 6, 0.004), b.step * 4.5, b.vel(0.62));
    }
    if (b.next.name !== b.chords[b.chords.length - 1].chord.name) band.note('bass', bassOf(b.next, 34) - 1, b.at(11, 0.004), b.step * 0.9, b.vel(0.55));

    const leadPiano = (s === 'B' && b.pass % 2 === 0) || (s === 'A' && b.pass % 4 === 2);
    if (s === 'break') {
      // piano arpeggios up and down in triplets
      [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1].forEach((k, st) => band.note('piano', tonesUp(b.chordAt(st), 58, 4)[k], b.at(st, 0.004), b.step * 1.6, b.vel(st % 3 === 0 ? 0.45 : 0.32)));
    } else {
      // the doo-wop piano: soft repeated triplet chords
      for (let st = 0; st < 12; st++) {
        const v = voicing(b.chordAt(st), 67, 3, b.mem.pv as number[] | undefined);
        b.mem.pv = v;
        band.strum('piano', v, b.at(st, 0.003), b.vel((st % 3 === 0 ? 0.36 : 0.24) * (leadPiano ? 0.75 : 1), 0.1), b.step * 0.8, true, 0.003);
      }
    }
    // the backing singers
    if (s !== 'intro') for (const c of b.chords) band.oohs(voicing(c.chord, 62, 4), b.at(c.step, 0.01), c.dur * b.step, b.vel(s === 'B' ? 0.75 : 0.6), s === 'B' ? 'ah' : 'oo');
    // brushes, and finger snaps on 2 and 4 the second time round
    for (const k of [1, 3]) band.perc('brush', beat(k, 0.006), b.vel(0.6));
    for (const st of [0, 2, 3, 5, 6, 8, 9, 11]) if (st % 3 === 0 || b.r.next() < 0.55) band.perc('brushTap', b.at(st, 0.005), b.vel(st % 3 === 0 ? 0.45 : 0.28));
    if ((s === 'A' && b.pass % 2 === 1) || s === 'break') for (const k of [1, 3]) band.perc('snap', beat(k, 0.008), b.vel(0.65));

    if (s === 'intro') {
      if (b.last) band.line('steel', 77, b.at(9, 0), b.step * 3, 0.6, { from: 74, glide: 0.25 });
      return;
    }
    if (s === 'break') return;
    if (leadPiano) melody(band, b, 'piano', { vel: 0.85 });
    else melody(band, b, 'steel', { vel: 0.9 });
    // the piano answers where the tune rests
    const rest = restFrom(b);
    if (rest !== null && !leadPiano) {
      let m = chordTone(b.chordAt(rest), 79);
      for (let st = rest; st < 12; st++) {
        band.note('piano', m, b.at(st, 0.004), b.step * 1.2, b.vel(0.5));
        m = scaleStep(m, -1, b.key, b.scale);
      }
    }
  },
  tag(band, t) {
    [62, 65, 70, 74, 77].forEach((m, k) => band.note('piano', m, t + k * 0.085, 0.5, 0.6 + k * 0.05));
    const e = t + 0.45;
    band.strum('piano', [70, 74, 77, 79], e, 0.7, 1.6, true, 0.012);
    band.oohs([62, 65, 70, 74], e - 0.05, 1.5, 0.8, 'oo', 'ah');
    band.line('steel', 82, e, 1.4, 0.75, { from: 77, glide: 0.2 });
    band.note('bass', 34, e, 1.2, 0.55);
    band.perc('brush', e, 0.7);
  },
};

// ------------------------------------------------------------------ 2 · Taquería

/** Bars played in 3/4 against the 6/8 (sesquiáltera). */
const HEMI: Record<string, number[]> = { intro: [1, 3], A: [5, 6], break: [1, 3] };

const taqueria: SongDef = {
  id: 'taqueria',
  name: 'Taquería · sol y cilantro',
  bpm: 66,
  beats: 2,
  steps: 6,
  key: 2,
  scale: MAJOR,
  trim: -1.1,
  mix: { harp: 0.6, guitar: 0.55, shaker: 3, clap: 3 },
  sections: {
    intro: { chords: 'D | A7 | D | A7' },
    A: {
      chords: 'D | A7 | A7 | D | D | G | A7 | D',
      mel: 'A4 D5 F#5 A5:3 | G5 F#5 E5 C#5:3 | E5 G5 A5 C#6:2 B5 | A5:3 F#5:3 | D5 F#5 A5 D6:3 | B5:2 A5:2 G5:2 | A5:2 G5:2 E5:2 | D5:3 -:3',
    },
    B: {
      chords: 'G | D | A7 | D | G | D | E7 A7 | D',
      mel: 'B4 D5 G5 B5:3 | A5:2 F#5 D5:3 | C#5 E5 G5 A5:2 G5 | F#5:6~ | G5 B5 D6 B5:2 G5 | A5:3 F#5:3 | G#5:2 B5 A5:2 G5 | F#5:3 D5:3',
    },
    break: { chords: 'D | G | A7 | D' },
  },
  form: ['intro', 'A', 'A', 'B', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    const hemi = (HEMI[s] ?? []).includes(b.i);
    // guitarrón: 1 and 4 in 6/8, 1-3-5 in the 3/4 bars
    if (hemi) {
      const root = bassOf(b.chord, 38);
      [root, fifthOf(root, 49), root].forEach((m, k) => band.note('guitarron', m, b.at(k * 2, 0.004), b.step * 1.7, b.vel(k ? 0.65 : 0.85)));
    } else {
      for (const c of b.chords) {
        const root = bassOf(c.chord, 38);
        band.note('guitarron', root, b.at(c.step, 0.004), b.step * 2.6, b.vel(0.85));
        if (c.dur >= 6) band.note('guitarron', fifthOf(root, 49), b.at(c.step + 3, 0.004), b.step * 2.6, b.vel(0.7));
      }
    }
    // the strummed guitar
    const pat: [number, boolean, number][] = hemi
      ? [[0, true, 0.85], [1, false, 0.32], [2, true, 0.62], [3, false, 0.32], [4, true, 0.62], [5, false, 0.4]]
      : [[0, true, 0.85], [1, false, 0.3], [2, false, 0.45], [3, true, 0.72], [4, false, 0.3], [5, false, 0.45]];
    for (const [st, down, v] of pat) {
      const vo = voicing(b.chordAt(st), 60, 4, b.mem.gv as number[] | undefined);
      b.mem.gv = vo;
      band.strum('guitar', down ? vo : vo.slice(1), b.at(st, 0.004), b.vel(v * 0.75), b.step * (down ? 1.4 : 0.9), down, down ? 0.013 : 0.009);
    }
    // a jarana's bright up-strokes, from the second time round
    if ((s === 'A' && b.pass % 2 === 1) || s === 'B') {
      for (const [st, down] of pat) if (!down) band.strum('requinto', voicing(b.chordAt(st), 72, 3), b.at(st, 0.005), b.vel(0.28), b.step * 0.5, false, 0.007);
    }
    for (let st = 0; st < 6; st++) band.perc('shaker', b.at(st, 0.004), b.vel(pat[st][1] ? 0.75 : 0.4));
    if (s === 'B' || s === 'break' || (s === 'A' && b.pass >= 2)) for (const st of hemi ? [0, 2, 4] : [0, 3]) band.perc('clap', b.at(st, 0.008), b.vel(0.5));

    if (s === 'intro') {
      if (b.last) run(band, b, 'requinto', 64, 3, 1, b.at(3, 0.004), b.step, 0.6);
      return;
    }
    if (s === 'break') {
      improv(band, b, 'harp', { density: 0.35, center: 76, vel: 0.5 });
      return;
    }
    const lead = s === 'A' ? pick(['requinto', 'harp', 'requinto'] as const, b.pass) : pick(['harp', 'requinto'] as const, b.pass);
    melody(band, b, lead, { vel: 0.85 });
    // the Mexican way: a second guitar a third below, or the harp doubling in octaves
    if (lead === 'requinto') melody(band, b, 'requinto', { vel: 0.55, shift: -2 });
    else melody(band, b, 'harp', { vel: 0.42, oct: -1 });
    const rest = restFrom(b);
    if (rest !== null) run(band, b, 'requinto', chordTone(b.chordAt(rest), 66), b.steps - rest, 1, b.at(rest, 0.004), b.step, 0.55);
  },
  tag(band, t) {
    const D = [50, 57, 62, 66, 69];
    for (let k = 0; k < 4; k++) band.strum('guitar', D, t + k * 0.045, 0.45 + k * 0.08, 0.3, true, 0.006);
    [[69, 66], [74, 69], [78, 74], [81, 78]].forEach(([m, h], k) => {
      band.note('requinto', m, t + 0.2 + k * 0.1, 0.3, 0.75);
      band.note('requinto', h, t + 0.2 + k * 0.1, 0.3, 0.5);
    });
    const e = t + 0.62;
    band.strum('guitar', D, e, 0.85, 1.3, true, 0.012);
    band.note('requinto', 86, e, 1.2, 0.7);
    band.note('requinto', 81, e, 1.2, 0.5);
    band.note('guitarron', 38, e, 1.2, 0.55);
    band.perc('shaker', e, 0.8);
    band.perc('clap', e, 0.7);
  },
};

// ------------------------------------------------------------------ 3 · Boulangerie

const bakery: SongDef = {
  id: 'bakery',
  name: 'Boulangerie · croissant swing',
  bpm: 112,
  beats: 4,
  steps: 8,
  swing: 0.3,
  key: 7,
  scale: MAJOR,
  trim: 0.7,
  mix: { musette: 1.15, brush: 2.4, bass: 0.8 },
  sections: {
    intro: { chords: 'G6 | D7' },
    A: {
      chords: 'G6 | Em7 | Am7 | D7 | G6 | E7 | A7 D7 | G6',
      mel: 'B4:2 D5:2 G5:3 F#5 | E5:4 D5:2 B4:2 | C5:2 E5:2 A5:3 G5 | F#5:6~ -:2 | B5:2 A5 G5 D5:2 B4:2 | G#5:2 B5:2 D6:3 C6 | B5:2 A5:2 C6:2 F#5:2 | G5:6~ -:2',
    },
    B: {
      chords: 'Em | Em | Am | Am | D7 | D7 | B7 | Am7 D7',
      mel: 'G5:3 F#5 E5:2 B4:2 | E5:6~ D#5:2 | E5:3 D5 C5:2 A4:2 | C5:6~ -:2 | D5:2 F#5:2 A5:2 C6:2 | B5:3 A5 F#5:4~ | F#5:2 A5:2 D#5:4~ | E5:2 C5:2 D5:2 F#5:2',
    },
    break: { chords: 'G6 | E7 | Am7 | D7' },
  },
  form: ['intro', 'A', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    // la pompe: a short full chord on 1 and 3, a crisp chop on 2 and 4
    for (const st of [0, 2, 4, 6]) {
      const chop = st === 2 || st === 6;
      const key = chop ? 'pc' : 'pb';
      const vo = voicing(b.chordAt(st), chop ? 62 : 58, 4, b.mem[key] as number[] | undefined);
      b.mem[key] = vo;
      band.strum('gypsy', vo, b.at(st, 0.004), b.vel(chop ? 0.36 : 0.27), b.step * (chop ? 0.45 : 1.2), true, 0.007);
    }
    // bass: in two during the tune, walking in the bridge and the break
    if (s === 'B' || s === 'break') {
      const c0 = b.chordAt(0);
      const c2 = b.chordAt(4);
      const r0 = bassOf(c0, 36);
      const to = bassOf(b.next, 36);
      const third = r0 + c0.iv[1];
      const three = c2 !== c0 ? bassOf(c2, 36) : r0 + 7;
      [r0, third, three, to + (to > three ? -1 : 1)].forEach((m, k) => band.note('bass', m, b.at(k * 2, 0.004), b.step * 1.8, b.vel(k ? 0.68 : 0.85)));
    } else {
      for (const c of b.chords) {
        const root = bassOf(c.chord, 36);
        band.note('bass', root, b.at(c.step, 0.004), b.step * 3.4, b.vel(0.85));
        if (c.dur >= 8) band.note('bass', fifthOf(root, 48), b.at(c.step + 4, 0.004), b.step * 3.4, b.vel(0.7));
      }
    }
    for (const st of [2, 6]) band.perc('brush', b.at(st, 0.006), b.vel(0.5));

    if (s === 'intro') {
      if (b.last) run(band, b, 'musette', 74, 4, -1, b.at(4, 0.003), b.step, 0.6);
      return;
    }
    if (s === 'break') {
      improv(band, b, 'gypsy', { density: 0.45, center: 74, vel: 0.6 });
      return;
    }
    const lead = s === 'A' ? pick(['musette', 'gypsy', 'musette'] as const, b.pass) : pick(['gypsy', 'musette'] as const, b.pass);
    melody(band, b, lead, { vel: lead === 'musette' ? 0.95 : 0.9 });
    if (lead === 'gypsy') for (const c of b.chords) band.reed('musette', voicing(c.chord, 64, 3), b.at(c.step, 0.01), c.dur * b.step * 0.95, b.vel(0.35));
    const rest = restFrom(b);
    if (rest !== null) run(band, b, lead === 'gypsy' ? 'musette' : 'gypsy', chordTone(b.chordAt(rest), 76), b.steps - rest, -1, b.at(rest, 0.004), b.step, 0.55);
  },
  tag(band, t) {
    [67, 71, 74, 79].forEach((m, k) => band.reed('musette', [m], t + k * 0.1, 0.12, 0.8));
    const e = t + 0.42;
    band.reed('musette', [67, 71, 76, 79], e, 1.4, 0.9, 6.5);
    band.strum('gypsy', [55, 59, 64, 67], e, 0.7, 0.9, true, 0.01);
    band.note('bass', 43, e, 1.2, 0.55);
  },
};

// ------------------------------------------------------------------ 4 · Wok Station

const wok: SongDef = {
  id: 'wok',
  name: 'Wok Station · jade wok',
  bpm: 96,
  beats: 4,
  steps: 8,
  key: 2,
  scale: PENTA,
  trim: 1.8,
  mix: { guzheng: 0.7, woodblock: 1.5, tanggu: 1.5, gong: 1.5 },
  sections: {
    intro: { chords: 'D | A' },
    A: {
      chords: 'D | Bm | G | A | D | Bm | G A | D',
      mel: 'A4 B4 D5:2 E5:2 F#5:2 | E5:2 D5 B4 A4:4~ | B4:2 D5:2 E5 F#5 E5:2 | E5:6~ -:2 | F#5:2 A5:2 B5 A5 F#5:2 | E5:2 F#5 E5 D5:2 B4:2 | D5:2 B4:2 E5:2 F#5:2 | D5:6~ -:2',
    },
    B: {
      chords: 'Bm | G | D | A | Bm | G | Em A | D',
      mel: 'F#5:4 E5:2 D5:2 | E5:6 D5:2 | A4:4 B4:2 D5:2 | E5:8~ | B5:4 A5:2 F#5:2 | A5:3 F#5 E5:4 | D5:2 E5:2 F#5:2 E5:2 | D5:8~',
    },
    break: { chords: 'D | G | A | D' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    // bass on the low zither strings: root on 1, fifth on 3, a skip before 3 later on
    for (const c of b.chords) {
      const root = bassOf(c.chord, 38);
      band.note('guzheng', root, b.at(c.step, 0.004), b.step * 3, b.vel(0.8));
      if (c.dur >= 8) band.note('guzheng', fifthOf(root, 50), b.at(c.step + 4, 0.004), b.step * 3, b.vel(0.62));
      if (c.dur >= 8 && (b.pass > 0 || s === 'B')) band.note('guzheng', root + 12, b.at(c.step + 3, 0.004), b.step, b.vel(0.4));
    }
    // woodblock and a little drum
    for (const [st, v] of [[0, 0.6], [3, 0.45], [6, 0.5]]) band.perc('woodblock', b.at(st, 0.004), b.vel(v));
    if (b.r.next() < 0.4) band.perc('woodblock', b.at(7, 0.004), b.vel(0.3));
    band.perc('tanggu', b.at(0, 0.004), b.vel(0.55));
    band.perc('tanggu', b.at(4, 0.004), b.vel(0.42));
    if (b.phraseEnd) for (const st of [5, 6, 6.5, 7, 7.5]) band.perc('tanggu', b.at(st, 0.004), b.vel(0.3 + (st - 5) * 0.08));
    if (b.first && (s === 'B' || s === 'intro')) band.perc('gong', b.at(0, 0), 0.7);

    const lead = s === 'A' ? pick(['pipa', 'pipa', 'erhu'] as const, b.pass) : s === 'B' ? pick(['erhu', 'pipa'] as const, b.pass) : null;
    // the zither: flowing arpeggios under bowed lines, off-beat dyads under the pipa
    if (s === 'intro' || s === 'break' || lead === 'erhu') {
      for (let st = 0; st < 8; st++) band.note('guzheng', tonesUp(b.chordAt(st), 62, 5)[[0, 1, 2, 3, 4, 3, 2, 1][st]], b.at(st, 0.005), b.step * 1.8, b.vel(0.36));
    } else {
      for (const st of [2, 6]) band.strum('guzheng', voicing(b.chordAt(st), 69, 2), b.at(st, 0.004), b.vel(0.34), b.step * 1.2, true, 0.02);
    }
    if (b.last && s !== 'break') gliss(band, 'guzheng', b.key, b.scale, 62, 86, b.at(6, 0), b.step * 1.6, 0.42);
    if (s === 'break') improv(band, b, 'pipa', { density: 0.3, center: 74, vel: 0.55 });
    if (!lead) return;
    melody(band, b, lead, { vel: lead === 'pipa' ? 0.85 : 0.9 });
    if (s === 'A' && b.pass % 3 === 1) melody(band, b, 'guzheng', { vel: 0.4, oct: -1 });
  },
  tag(band, t) {
    gliss(band, 'guzheng', 2, PENTA, 62, 86, t, 0.4, 0.55);
    const e = t + 0.45;
    band.trem('pipa', 74, e, 0.9, 0.7, 15);
    band.trem('pipa', 81, e, 0.9, 0.45, 15);
    band.note('guzheng', 38, e, 1.5, 0.5);
    band.note('guzheng', 50, e, 1.5, 0.3);
    band.perc('gong', e, 0.5);
  },
};

// ------------------------------------------------------------------ 5 · Spice Market

const spice: SongDef = {
  id: 'spice',
  name: 'Spice Market · saffron steps',
  bpm: 92,
  beats: 4,
  steps: 8,
  swing: 0.08,
  key: 2,
  scale: HIJAZ,
  trim: 1.2,
  mix: { ney: 0.75, drone: 0.65, doum: 0.5, tek: 0.5, ka: 0.5, tambourine: 0.8 },
  sections: {
    intro: { chords: 'D | D' },
    A: {
      chords: 'D | D | Cm | D | Gm | Gm | Eb | D',
      mel: 'D5 Eb5 F#5:2 G5:2 A5:2 | Bb5 A5 G5 F#5 G5:2 F#5:2 | G5:2 Eb5:2 C5:2 D5:2 | D5:6~ -:2 | Bb4 C5 D5:2 Eb5:2 D5:2 | G5:3 A5 Bb5:2 A5:2 | G5:2 F#5 Eb5 D5:2 C5:2 | D5:6~ -:2',
    },
    B: {
      chords: 'D | D | Gm | Gm | Cm | D | Eb | D',
      mel: 'A5:6~ Bb5:2 | A5:4 G5:2 F#5:2 | G5:6~ A5:2 | Bb5:4 A5:2 G5:2 | G5:3 Eb5 C5:4 | F#5:4 Eb5:2 D5:2 | Eb5:4 D5:2 C5:2 | D5:8~',
    },
    break: { chords: 'D | Cm | Eb | D' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    // a harmonium drone on D, all the way through
    band.reed('drone', [50, 62], b.at(0, 0), b.len + 0.35, 0.8);
    // darbuka, maqsum: DUM tek - tek DUM - tek -
    band.perc('doum', b.at(0, 0.004), b.vel(0.85));
    band.perc('doum', b.at(4, 0.004), b.vel(0.72));
    for (const [st, v] of [[1, 0.7], [3, 0.55], [6, 0.65]]) band.perc('tek', b.at(st, 0.004), b.vel(v));
    if (s !== 'intro') for (const st of [2, 5, 7]) if (b.r.next() < 0.45) band.perc('ka', b.at(st, 0.004), b.vel(0.4));
    if (b.phraseEnd) for (const st of [4.5, 5.5, 6.5, 7, 7.5]) band.perc(st % 1 ? 'ka' : 'tek', b.at(st, 0.003), b.vel(0.35 + (st - 4.5) * 0.1));
    if (s === 'B') for (const st of [1, 3, 6]) band.perc('tambourine', b.at(st, 0.005), b.vel(0.35));
    // bass on the doums
    const root = bassOf(b.chord, 38);
    band.note('bass', root, b.at(0, 0.004), b.step * 2.6, b.vel(0.8));
    band.note('bass', root, b.at(4, 0.004), b.step * 2.6, b.vel(0.62));

    if (s === 'intro') {
      improv(band, b, 'oud', { density: 0.35, center: 62, vel: 0.55 });
      return;
    }
    if (s === 'break') {
      improv(band, b, 'qanun', { density: 0.45, center: 74, vel: 0.5 });
      return;
    }
    const lead = s === 'A' ? pick(['oud', 'oud', 'ney'] as const, b.pass) : pick(['ney', 'qanun'] as const, b.pass);
    melody(band, b, lead, { vel: 0.9 });
    if (s === 'A' && b.pass % 3 === 1) melody(band, b, 'qanun', { vel: 0.38, oct: 1 });
    // qanun runs into the next phrase
    const rest = restFrom(b);
    if (rest !== null) run(band, b, 'qanun', 67, (b.steps - rest) * 2, 1, b.at(rest, 0.003), b.step / 2, 0.5);
  },
  tag(band, t) {
    let m = 62;
    for (let k = 0; k < 8; k++) {
      band.note('qanun', m, t + k * 0.06, 0.4, 0.55 + k * 0.04);
      m = scaleStep(m, 1, 2, HIJAZ);
    }
    const e = t + 0.5;
    band.trem('oud', 62, e, 1.0, 0.7, 11);
    band.trem('oud', 50, e, 1.0, 0.3, 11);
    band.perc('doum', e, 0.9);
    band.perc('tambourine', e, 0.6);
    band.perc('tambourine', e + 0.12, 0.4);
    band.reed('drone', [50, 62], e, 1.4, 0.45);
  },
};

// ------------------------------------------------------------------ 6 · Cafeteria

const cafeteria: SongDef = {
  id: 'cafeteria',
  name: 'Cafeteria · lunch-break bossa',
  bpm: 118,
  beats: 4,
  steps: 8,
  swing: 0.04,
  key: 0,
  scale: MAJOR,
  trim: -2.9,
  mix: { guitar: 0.6, rhodes: 0.8, flute: 1.2 },
  sections: {
    intro: { chords: 'Dm7 | G7' },
    A: {
      chords: 'Cmaj7 | Am7 | Dm7 | G7 | Em7 | A7 | Dm7 G7 | Cmaj7',
      mel: 'E5:3 D5 E5:2 G5:2 | A5:6~ G5:2 | F5:3 E5 F5:2 A5:2 | G5:6~ -:2 | B4:2 D5:2 G5:3 E5 | E5:2 G5:2 C#5:4~ | F5:2 A5:2 F5:2 D5:2 | E5:6~ -:2',
    },
    B: {
      chords: 'Fmaj7 | Fm6 | Em7 | A7 | Dm7 | G7 | Cmaj7 | G7',
      mel: 'A5:3 G5 E5:2 C5:2 | Ab5:3 G5 F5:2 D5:2 | G5:6~ E5:2 | A5:4 G5:2 E5:2 | F5:3 E5 D5:2 A4:2 | B4:2 D5:2 F5:3 E5 | E5:6~ -:2 | D5:2 F5:2 A5:2 B5:2',
    },
    break: { chords: 'Cmaj7 | Am7 | Dm7 | G7' },
  },
  form: ['intro', 'A', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    // bossa bass: root on 1, the fifth on the "and" of 2 tied over
    for (const c of b.chords) {
      const root = bassOf(c.chord, 36);
      const whole = c.dur >= 8;
      band.note('bass', root, b.at(c.step, 0.004), b.step * (whole ? 2.8 : 1.8), b.vel(0.85));
      band.note('bass', fifthOf(root, 48), b.at(c.step + (whole ? 3 : 2), 0.004), b.step * (whole ? 4.5 : 1.8), b.vel(0.66));
    }
    // nylon-string comping and the cross-stick on the bossa pattern
    const hits = b.total % 2 ? [2, 5] : [0, 3, 6];
    for (const st of hits) {
      const vo = voicing(b.chordAt(st), 60, 4, b.mem.bg as number[] | undefined);
      b.mem.bg = vo;
      band.strum('guitar', vo, b.at(st, 0.004), b.vel(0.45), b.step * 1.5, true, 0.006);
      band.perc('rim', b.at(st, 0.004), b.vel(0.5));
    }
    for (let st = 0; st < 8; st++) band.perc('shaker', b.at(st, 0.004), b.vel(st % 2 ? 0.45 : 0.28));
    band.perc('kick', b.at(0, 0.003), b.vel(0.55));
    band.perc('kick', b.at(3, 0.003), b.vel(0.3));
    band.perc('kick', b.at(4, 0.003), b.vel(0.45));

    const lead = s === 'A' ? pick(['flute', 'rhodes', 'flute'] as const, b.pass) : s === 'B' ? pick(['rhodes', 'flute'] as const, b.pass) : null;
    // electric piano: long soft chords, unless it has the tune
    if (lead !== 'rhodes') for (const c of b.chords) band.strum('rhodes', voicing(c.chord, 64, 4), b.at(c.step, 0.006), b.vel(0.26), c.dur * b.step * 0.95, true, 0.012);
    if (s === 'intro') {
      if (b.last) run(band, b, 'flute', 71, 3, 1, b.at(5, 0.003), b.step, 0.6);
      return;
    }
    if (s === 'break' || !lead) {
      improv(band, b, 'rhodes', { density: 0.35, center: 72, vel: 0.55 });
      return;
    }
    melody(band, b, lead, { vel: lead === 'flute' ? 0.85 : 0.8 });
    if (s === 'A' && b.pass % 3 === 2) melody(band, b, 'rhodes', { vel: 0.4, shift: -2 });
    const rest = restFrom(b);
    if (rest !== null) run(band, b, lead === 'flute' ? 'rhodes' : 'flute', chordTone(b.chordAt(rest), 76), b.steps - rest, -1, b.at(rest, 0.004), b.step, 0.5);
  },
  tag(band, t) {
    [60, 64, 67, 71, 74].forEach((m, k) => band.note('rhodes', m, t + k * 0.08, 1.4 - k * 0.08, 0.6));
    [79, 81, 83, 84].forEach((m, k) => band.line('flute', m, t + 0.1 + k * 0.1, k === 3 ? 1.1 : 0.12, 0.75));
    band.note('bass', 36, t + 0.45, 1.2, 0.5);
    band.perc('rim', t + 0.45, 0.6);
  },
};

// ------------------------------------------------------------------ 7 · Dim Sum House

const dimsum: SongDef = {
  id: 'dimsum',
  name: 'Dim Sum House · steam & jasmine',
  bpm: 72,
  beats: 4,
  steps: 8,
  key: 7,
  scale: PENTA,
  trim: 0.3,
  mix: { sheng: 2.5, clapper: 3, fingerCymbal: 3 },
  sections: {
    intro: { chords: 'G | D' },
    A: {
      chords: 'G | Em | C | D | G | Em | C D | G',
      mel: 'D5:3 E5 G5:4~ | E5:2 D5:2 B4:4~ | A4:2 B4 D5 E5:4~ | D5:8~ | G5:3 A5 B5:4~ | A5:2 G5:2 E5:4~ | E5:2 G5:2 D5:2 A4:2 | D5:2 E5:2 G5:4~',
    },
    B: {
      chords: 'Em | Em | C | D | Em | C | Am D | G',
      mel: 'B5:4 A5:2 G5:2 | E5:8~ | G5:3 E5 D5:4~ | A4:4 B4:2 D5:2 | E5:3 G5 A5:4~ | G5:4 E5:2 D5:2 | E5:2 A4:2 D5:2 E5:2 | D5:2 B4:2 G4:4~',
    },
    break: { chords: 'G | C | D | G' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    // the sheng holds soft chords
    for (const c of b.chords) band.reed('sheng', voicing(c.chord, 64, 3), b.at(c.step, 0.01), c.dur * b.step + 0.15, b.vel(0.75));
    // low zither strings: root, then the fifth
    for (const c of b.chords) {
      const root = bassOf(c.chord, 43);
      band.note('guzheng', root, b.at(c.step, 0.004), b.step * Math.min(6, c.dur), b.vel(0.7));
      if (c.dur >= 8) band.note('guzheng', fifthOf(root, 54), b.at(c.step + 4, 0.004), b.step * 3.5, b.vel(0.5));
    }
    // the wooden clapper marks the bar; a finger cymbal closes each eight bars
    band.perc('clapper', b.at(0, 0.004), b.vel(0.5));
    if (b.phraseEnd) band.perc('clapper', b.at(6, 0.004), b.vel(0.35));
    if (b.i % 8 === 7 || (b.last && s === 'break')) band.perc('fingerCymbal', b.at(6, 0), b.vel(0.6));

    const lead = s === 'A' ? pick(['dizi', 'guzheng'] as const, b.pass) : s === 'B' ? pick(['guzheng', 'dizi'] as const, b.pass) : null;
    // flowing zither arpeggios whenever the zither is not singing
    if (lead !== 'guzheng') {
      for (let st = 0; st < 8; st++) band.note('guzheng', tonesUp(b.chordAt(st), 55, 5)[[0, 1, 2, 3, 4, 3, 2, 1][st]], b.at(st, 0.006), b.step * 2, b.vel(st % 2 ? 0.26 : 0.34));
    }
    if (s === 'intro') {
      if (b.last) gliss(band, 'guzheng', b.key, b.scale, 67, 86, b.at(5, 0), b.step * 2, 0.4);
      return;
    }
    if (s === 'break' || !lead) {
      if (b.i % 2 === 1) improv(band, b, 'dizi', { density: 0.25, center: 76, vel: 0.5, every: 2 });
      return;
    }
    melody(band, b, lead, { vel: lead === 'dizi' ? 0.85 : 0.8 });
  },
  tag(band, t) {
    gliss(band, 'guzheng', 7, PENTA, 67, 91, t, 0.38, 0.5);
    const e = t + 0.42;
    for (let k = 0; k < 8; k++) band.line('dizi', k % 2 ? 81 : 79, e + k * 0.07, 0.08, 0.7);
    band.line('dizi', 79, e + 0.56, 0.9, 0.75);
    band.reed('sheng', [67, 71, 74], e, 1.5, 0.9);
    band.perc('fingerCymbal', e, 0.7);
    band.note('guzheng', 43, e, 1.4, 0.4);
  },
};

/** Every kitchen's band, indexed by `KitchenTheme.music`. */
export const SONGS: SongDef[] = [trattoria, diner, taqueria, bakery, wok, spice, cafeteria, dimsum];

/** Music index per kitchen id (for src/render/themes.ts). */
export const MUSIC = { trattoria: 0, diner: 1, taqueria: 2, bakery: 3, wok: 4, spice: 5, cafeteria: 6, dimsum: 7 } as const;
