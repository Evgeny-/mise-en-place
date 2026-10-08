import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSim } from '../src/core/sim';
import { Solver } from '../src/core/solver';
import { TacoRules } from '../src/core/taco';
import { campaignLevel } from '../src/core/shifts';
import { TAQUERIA_LEVELS, tacoRawParts, taqueriaIntro, taqueriaTier } from '../src/core/tacoGen';
import type { LevelDef } from '../src/core/types';

const FILE = new URL('../src/data/levels-taqueria.json', import.meta.url);

function load(): LevelDef[] {
  if (!existsSync(FILE)) throw new Error('src/data/levels-taqueria.json is missing: run `bun scripts/build-taqueria.ts`');
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

describe('Taquería ladder (local levels 1–40)', () => {
  it('levels-taqueria.json exists', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  const levels = existsSync(FILE) ? load() : [];

  it('has every level, numbered in order, with the right tier, world, menu, rules and intro', () => {
    expect(levels.length).toBe(TAQUERIA_LEVELS);
    levels.forEach((lv, i) => {
      expect(lv.local).toBe(i + 1);
      expect(lv.n).toBe(campaignLevel(2, lv.local!));
      expect(lv.tier).toBe(taqueriaTier(lv.local!));
      expect(lv.world).toBe(2);
      expect(lv.menu).toBe('taqueria');
      expect(lv.rules).toBe('taco');
      expect(lv.intro).toBe(taqueriaIntro(lv.local!));
      // the topping twist starts at its intro level
      if (lv.toppings) expect(lv.local).toBeGreaterThanOrEqual(31);
    });
  });

  it('boards stay within the size limits', () => {
    for (const lv of levels) {
      const items = lv.columns.reduce((a, c) => a + c.length, 0);
      expect(lv.columns.length, `L${lv.n} columns`).toBeLessThanOrEqual(6);
      expect(lv.columns.length).toBeGreaterThanOrEqual(2);
      for (const c of lv.columns) {
        expect(c.length, `L${lv.n} column`).toBeGreaterThan(0);
        expect(c.length, `L${lv.n} depth`).toBeLessThanOrEqual(6);
      }
      expect(lv.slots, `L${lv.n} slots`).toBeGreaterThanOrEqual(2);
      expect(lv.slots).toBeLessThanOrEqual(5);
      expect(lv.seats, `L${lv.n} seats`).toBeGreaterThanOrEqual(1);
      expect(lv.seats).toBeLessThanOrEqual(3);
      expect(items, `L${lv.n} items`).toBeLessThanOrEqual(30);
    }
  });

  it('pantries hold exactly one container and the raw fillings of every order', () => {
    for (const lv of levels) {
      const count = new Map<string, number>();
      for (const d of lv.orders) for (const x of tacoRawParts(d)) count.set(x, (count.get(x) ?? 0) + 1);
      for (const c of lv.columns) for (const it of c) count.set(it, (count.get(it) ?? 0) - 1);
      for (const [item, v] of count) expect(v, `L${lv.n} ${item}`).toBe(0);
    }
  });

  it('every stored solution wins in the play simulation without boosters', () => {
    for (const lv of levels) {
      expect(lv.solution, `L${lv.n} solution`).toBeDefined();
      const sim = createSim(lv);
      for (const m of lv.solution!) expect(sim.take(m), `L${lv.n} move ${m}`).not.toBeNull();
      expect(sim.status, `L${lv.n}`).toBe('won');
      expect(sim.counter.every((x) => x === null)).toBe(true);
    }
  });

  it('carries the measured difficulty, and the stored random win matches a fresh solve', () => {
    for (const lv of levels) {
      const st = lv.stats!;
      expect(st, `L${lv.n} stats`).toBeDefined();
      expect(st.items).toBe(lv.solution!.length);
      expect(st.random).toBeGreaterThan(0);
      expect(st.random).toBeLessThanOrEqual(1);
      expect(st.critical).toBeLessThanOrEqual(st.decisions);
      expect(st.plan, `L${lv.n} plan`).toHaveLength(5);
      if (lv.tier !== 'normal' || (lv.local! >= 6 && !lv.intro)) expect(st.greedy, `L${lv.n} greedy`).toBe(false);
      expect(new Solver(new TacoRules(lv)).pRandom(), `L${lv.n} random`).toBeCloseTo(st.random, 5);
    }
    // difficulty grows: the first levels are easier than the late normal ones, which are easier than the banquets
    const avg = (a: LevelDef[]) => a.reduce((x, l) => x + l.stats!.random, 0) / a.length;
    const late = levels.filter((l) => l.tier === 'normal' && l.local! > 30);
    expect(avg(levels.filter((l) => l.local! <= 4))).toBeGreaterThan(avg(late));
    expect(avg(late)).toBeGreaterThan(avg(levels.filter((l) => l.tier === 'superhard')));
  }, 120_000);
});
