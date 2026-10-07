import { describe, expect, it } from 'vitest';
import { Recorder } from './band';
import { loudest, mtof, peakOf, pluck, Rng } from './dsp';
import { bakeSfx, sfxCatalog } from './sfx';
import { compile, Song } from './song';
import { SONGS } from './songs';
import { parseChord, parseLine, scaleStep, voicing } from './theory';

describe('music notation', () => {
  it('parses notes, rests and ties and checks bar lengths', () => {
    const bars = parseLine('C5:2 D5 - | E5:3 _:1', 4);
    expect(bars[0].map((n) => n.midi)).toEqual([72, 74]);
    expect(bars[1][0].dur).toBe(4);
    expect(() => parseLine('C5:3', 4)).toThrow();
  });

  it('voices chords close together and moves little', () => {
    const c = parseChord('C7');
    const v = voicing(c, 64, 3);
    expect(v.length).toBe(3);
    expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(12);
    const next = voicing(parseChord('F'), 64, 3, v);
    expect(next.reduce((a, m, i) => a + Math.abs(m - v[i]), 0)).toBeLessThanOrEqual(6);
  });

  it('steps along a scale', () => {
    expect(scaleStep(72, -2, 0, [0, 2, 4, 5, 7, 9, 11])).toBe(69);
    expect(scaleStep(74, 1, 2, [0, 2, 4, 7, 9])).toBe(76);
  });
});

describe('kitchen bands', () => {
  for (const def of SONGS) {
    it(`${def.id}: every section parses and the form plays for 200 bars`, () => {
      const secs = compile(def);
      for (const f of def.form) expect(secs[f]).toBeTruthy();
      const rec = new Recorder();
      const s = new Song(def, rec, 0, 3);
      s.pump(s.barLen * 200);
      expect(rec.keys.size).toBeGreaterThan(10);
      // notes stay in sensible instrument ranges
      for (const k of rec.keys) {
        const [inst, m] = k.split(':');
        if (inst === 'perc') continue;
        expect(Number(m), k).toBeGreaterThanOrEqual(28);
        expect(Number(m), k).toBeLessThanOrEqual(100);
      }
    });
  }
});

describe('synthesis', () => {
  it('plucked strings are in tune', () => {
    const sr = 32000;
    for (const m of [43, 55, 67, 79]) {
      const f = mtof(m);
      const x = pluck(sr, f, 0.5, { t60: 1.5, damp: 0.2, pick: 0.15, hard: 0.6 }, new Rng(1));
      const seg = x.subarray(Math.round(sr * 0.1), Math.round(sr * 0.35));
      const ac = (l: number) => {
        let s = 0;
        for (let i = 0; i + l < seg.length; i++) s += seg[i] * seg[i + l];
        return s;
      };
      let lag = 0;
      let best = -Infinity;
      for (let l = Math.floor(sr / (f * 1.06)); l <= Math.ceil(sr / (f / 1.06)); l++) {
        const v = ac(l);
        if (v > best) {
          best = v;
          lag = l;
        }
      }
      const [a, b, c] = [ac(lag - 1), ac(lag), ac(lag + 1)];
      const exact = lag + (0.5 * (a - c)) / (a - 2 * b + c);
      expect(Math.abs(1200 * Math.log2(sr / exact / f)), `midi ${m}`).toBeLessThan(5);
    }
  });

  it('every sound bakes cleanly at its level', () => {
    for (const c of sfxCatalog()) {
      const b = bakeSfx(c.name, c.opts, 24000, 11);
      const p = Math.max(peakOf(b.L), peakOf(b.R));
      expect(Number.isFinite(p), c.label).toBe(true);
      expect(p, c.label).toBeLessThanOrEqual(0.9);
      expect(b.L.length / 24000, c.label).toBeLessThan(4);
      expect(20 * Math.log10(loudest(b.L, 24000)), c.label).toBeGreaterThan(-35);
    }
  });
});
