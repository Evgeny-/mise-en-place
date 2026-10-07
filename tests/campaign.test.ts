import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISHES, type DishId } from '../src/core/content';
import { stackDishOf } from '../src/core/burger';
import { kitchenFor } from '../src/core/kitchen';
import {
  BURGER_TUTORIAL, CAMPAIGN_LEVELS, introAt, introAtLocal, localOf, SHIFT_ORDER, TUTORIAL, tierForLevel, WORLD_MENUS, WORLD_RULES, worldOf,
} from '../src/core/progression';
import { createSim } from '../src/core/sim';
import type { LevelDef } from '../src/core/types';

const FILE = new URL('../src/data/levels.json', import.meta.url);

/** Local level at which a dish is introduced in its kitchen. */
function introLocal(d: DishId): number {
  for (const w of [0, 1, 2]) for (let l = 1; l <= 40; l++) if (introAtLocal(w, l) === d) return l;
  return 1;
}

function load(): LevelDef[] {
  if (!existsSync(FILE)) throw new Error('src/data/levels.json is missing: run `bun scripts/build-levels.ts`');
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

describe('campaign levels', () => {
  it('levels.json exists', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  const levels = existsSync(FILE) ? load() : [];

  it('has every campaign level, numbered in order, with the right tier and world', () => {
    expect(levels.length).toBe(CAMPAIGN_LEVELS);
    levels.forEach((lv, i) => {
      expect(lv.n).toBe(i + 1);
      expect(lv.tier).toBe(tierForLevel(lv.n));
      expect(lv.world).toBe(worldOf(lv.n));
      expect(lv.local).toBe(localOf(lv.n));
      expect(lv.menu).toBe(WORLD_MENUS[lv.world]);
      expect(lv.rules ?? 'combo').toBe(WORLD_RULES[lv.world]);
      expect(lv.intro).toBe(introAt(lv.n));
    });
  });

  it('alternates the kitchens in 5-level shifts, 40 levels each', () => {
    for (const w of [0, 1, 2]) {
      const locals = levels.filter((l) => l.world === w).map((l) => l.local);
      expect(locals).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    }
    levels.forEach((lv, i) => expect(lv.world).toBe(SHIFT_ORDER[Math.floor(i / 5)]));
    // every 5th level is a kitchen's hard or super hard level
    for (const lv of levels) expect(lv.tier === 'normal', `L${lv.n}`).toBe(lv.n % 5 !== 0);
  });

  it('the Trattoria and the Burger Joint start with their authored tutorials', () => {
    for (const t of [TUTORIAL, BURGER_TUTORIAL]) {
      const lv = levels[t.n - 1];
      expect(lv.columns).toEqual(t.columns);
      expect(lv.orders).toEqual(t.orders);
      expect(lv.tickets).toEqual(t.tickets);
      expect(lv.slots).toBe(t.slots);
      expect(lv.seats).toBe(t.seats);
      // every tap order wins
      expect(lv.stats!.random).toBe(1);
    }
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
      if (lv.lids) {
        expect(lv.lids.length).toBe(lv.columns.length);
        for (const l of lv.lids) {
          expect(l).toBeGreaterThanOrEqual(0);
          expect(l).toBeLessThan(lv.orders.length);
        }
      }
    }
  });

  it('burger pantries hold exactly the layers of the tickets, and every ticket is its dish', () => {
    const burgers = levels.filter((l) => l.rules === 'burger');
    expect(burgers.length).toBe(40);
    const bases: Record<string, [string, string | null]> = {
      burger: ['bun_bottom', 'bun_top'], hotdog: ['hotdog_bun', null], pancakes: ['pancake', null], sandwich: ['toast', 'toast'], sundae: ['cup', 'cherry'],
    };
    for (const lv of burgers) {
      const tickets = lv.tickets!;
      expect(tickets.length, `L${lv.n} tickets`).toBe(lv.orders.length);
      expect(lv.seats).toBeLessThanOrEqual(tickets.length);
      const count = new Map<string, number>();
      tickets.forEach((t, i) => {
        expect(stackDishOf(t), `L${lv.n} ticket ${i}`).toBe(lv.orders[i]);
        const [base, top] = bases[lv.orders[i]];
        expect(t[0], `L${lv.n} ticket`).toBe(base);
        if (top) expect(t[t.length - 1], `L${lv.n} ticket`).toBe(top);
        expect(t.length).toBeGreaterThanOrEqual(lv.orders[i] === 'hotdog' ? 2 : 3);
        expect(t.length).toBeLessThanOrEqual(6);
        for (const it of t) count.set(it, (count.get(it) ?? 0) + 1);
      });
      for (const c of lv.columns) for (const it of c) count.set(it, (count.get(it) ?? 0) - 1);
      for (const [item, v] of count) expect(v, `L${lv.n} ${item}`).toBe(0);
    }
  });


  it('pantries hold exactly the raw parts of the ordered dishes', () => {
    const k = kitchenFor('trattoria');
    for (const lv of levels.filter((l) => !l.rules || l.rules === 'combo')) {
      const count = new Map<string, number>();
      for (const d of lv.orders) for (const x of k.rawParts(k.dish(d))) count.set(k.items[x], (count.get(k.items[x]) ?? 0) + 1);
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

  it('menus vary: neighbouring levels of a kitchen serve different dish sets, and no dish dominates a level', () => {
    for (const w of [0, 1, 2]) {
      const world = levels.filter((l) => l.world === w);
      let prev = '';
      for (const lv of world) {
        const set = [...new Set(lv.orders)].sort().join(',');
        if (lv.local! > 1) expect(set, `L${lv.n} repeats the previous dish set`).not.toBe(prev);
        prev = set;
        if (w !== 2 && lv.local! > 1) {
          const most = Math.max(...[...new Set(lv.orders)].map((d) => lv.orders.filter((x) => x === d).length));
          expect(most, `L${lv.n} orders`).toBeLessThanOrEqual(Math.max(2, Math.ceil(lv.orders.length / new Set(lv.orders).size)));
        }
      }
    }
  });

  it('Trattoria: a prep can only happen on a level once a dish that uses it was introduced', () => {
    const k = kitchenFor('trattoria');
    const taught = new Set<string>();
    for (const lv of levels.filter((l) => l.world === 0)) {
      if (lv.intro && lv.intro in DISHES) for (const p of DISHES[lv.intro as DishId].parts) taught.add(p);
      const raw = new Set(lv.columns.flat());
      for (const p of k.menu.preps) {
        const fires = p.from[0] === p.from[1] ? lv.columns.flat().filter((x) => x === p.from[0]).length >= 2 : raw.has(p.from[0]) && raw.has(p.from[1]);
        if (fires) expect(taught.has(p.out), `L${lv.n}: ${p.out} before it is taught`).toBe(true);
      }
      // a level only serves dishes that were introduced at or before it
      for (const d of lv.orders) expect(lv.local! >= introLocal(d), `L${lv.n}: ${d} before its intro`).toBe(true);
    }
  });

  it('carries the measured difficulty', () => {
    for (const lv of levels) {
      const st = lv.stats!;
      expect(st, `L${lv.n} stats`).toBeDefined();
      expect(st.items).toBe(lv.solution!.length);
      expect(st.random).toBeGreaterThan(0);
      expect(st.random).toBeLessThanOrEqual(1);
      expect(st.critical).toBeLessThanOrEqual(st.decisions);
      // taco kitchens record tightness but don't target it (a 4-spot counter rarely is)
      if (lv.tier !== 'normal' && lv.rules !== 'taco') expect(st.tight, `L${lv.n} tight`).toBe(true);
      if (lv.rules !== 'taco' && (lv.local! >= 11 || (lv.world === 0 && lv.local! >= 9))) expect(st.greedy, `L${lv.n} greedy`).toBe(false);
    }
    // difficulty grows within each world: the late normal levels are harder than the first ones
    const avg = (a: LevelDef[]) => a.reduce((x, l) => x + l.stats!.random, 0) / a.length;
    for (const w of [0, 1]) {
      const world = levels.filter((l) => l.world === w);
      const local = (l: LevelDef) => l.local!;
      expect(avg(world.filter((l) => local(l) <= 4))).toBeGreaterThan(avg(world.filter((l) => l.tier === 'normal' && local(l) > 30)));
      expect(avg(world.filter((l) => l.tier === 'normal' && local(l) > 10))).toBeGreaterThan(avg(world.filter((l) => l.tier === 'superhard')));
      // from the 11th level of a world on, every level is tight (levels that introduce something may breathe)
      for (const l of world) if (local(l) >= 11 && !l.intro) expect(l.stats!.tight, `L${l.n} tight`).toBe(true);
    }
  });
});
