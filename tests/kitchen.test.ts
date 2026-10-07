import { describe, expect, it } from 'vitest';
import { KitchenRules } from '../src/core/kitchen';
import { Sim } from '../src/core/sim';
import { Solver } from '../src/core/solver';
import { Rng } from '../src/core/rng';
import type { LevelDef } from '../src/core/types';
import type { DishId, FoodId } from '../src/core/content';
import { CLASSIC } from './classic';

function level(columns: FoodId[][], slots: number, seats: number, orders: DishId[], lids?: number[]): LevelDef {
  return { n: 1, world: 0, menu: 'trattoria', tier: 'normal', columns, slots, seats, orders, lids };
}

function classic(lv: LevelDef): LevelDef {
  return { ...lv, menu: CLASSIC.id };
}

/** The showcase level from the design simulations (strict counter 4 = 3 slots + landing). */
const SHOWCASE = level(
  [
    ['tomato', 'tomato', 'tomato', 'potato'],
    ['tomato', 'onion'],
    ['egg', 'potato', 'carrot', 'mushroom', 'pasta'],
    ['onion', 'cheese', 'carrot'],
  ],
  3,
  2,
  ['minestrone', 'minestrone', 'spaghetti', 'omelette'],
);

/** The later-level sample (strict counter 4, five columns), on the design simulation's menu. */
const LATER = classic(level(
  [
    ['tomato', 'tomato', 'carrot'],
    ['cheese', 'egg', 'tomato', 'pasta', 'onion'],
    ['tomato', 'flour', 'egg', 'mushroom', 'cheese'],
    ['pasta', 'tomato', 'potato', 'tomato'],
    ['tomato'],
  ],
  3,
  2,
  ['spaghetti', 'minestrone', 'pizza', 'spaghetti', 'omelette'],
  [0, 0, 0, 0, 3],
));

describe('kitchen rules', () => {
  it('two tomatoes always make sauce, even when a soup wants a raw tomato', () => {
    const r = new KitchenRules(level([['tomato', 'onion'], ['carrot', 'potato'], ['tomato']], 3, 2, ['minestrone', 'minestrone']));
    const solver = new Solver(r);
    // three tomatoes would be needed raw, but there are only enough items for... it is unsolvable
    expect(solver.winnable()).toBe(false);
  });

  it('matches the design simulation on the showcase level', () => {
    const r = new KitchenRules(SHOWCASE);
    const s = new Solver(r);
    const start = r.start();
    expect(s.winnable(start)).toBe(true);
    expect(s.countWins(start)).toBe(1008);
    expect(s.safeMoves(start)).toEqual([2, 3]);
    expect(r.moves(start)).toEqual([0, 1, 2, 3]);
    expect(s.pRandom(start)).toBeGreaterThan(0);
  });

  it('matches the design simulation on the later level', () => {
    // the lid on the lone tomato (opens after 3 dishes) cuts the winning lines 26-fold
    expect(new Solver(new KitchenRules(LATER)).countWins()).toBe(1089588);
    expect(new Solver(new KitchenRules({ ...LATER, lids: undefined })).countWins()).toBe(28575802);
  });
});

describe('play simulation', () => {
  it('agrees with the compact rules on random playouts', () => {
    const rng = new Rng(7);
    for (const lv of [SHOWCASE, LATER]) {
      for (let game = 0; game < 300; game++) {
        const sim = new Sim(lv);
        const rules = new KitchenRules(lv);
        let st = rules.start();
        for (;;) {
          const legal = rules.moves(st);
          expect(sim.legalMoves()).toEqual(legal);
          if (!legal.length) {
            expect(sim.status).toBe(rules.isWin(st) ? 'won' : 'stuck');
            break;
          }
          const m = legal[Math.floor(rng.next() * legal.length)];
          const ev = sim.take(m)!;
          expect(ev[0]).toMatchObject({ t: 'take', col: m });
          st = rules.play(st, m);
          expect(rules.key(sim.state())).toBe(rules.key(st));
          expect(sim.counter.length).toBe(lv.slots);
          if (rules.isWin(st)) {
            expect(sim.status).toBe('won');
            break;
          }
        }
      }
    }
  }, 60_000);

  it('replays the solver line to a win and reports serves', () => {
    const solver = new Solver(new KitchenRules(SHOWCASE));
    const line = solver.solution()!;
    const sim = new Sim(SHOWCASE);
    const served: string[] = [];
    for (const m of line) for (const e of sim.take(m)!) if (e.t === 'serve') served.push(e.dish);
    expect(sim.status).toBe('won');
    expect(served.sort()).toEqual(['minestrone', 'minestrone', 'omelette', 'spaghetti']);
    expect(sim.counter.every((x) => x === null)).toBe(true);
  });

  it('a new tomato flies onto the lone tomato to make sauce', () => {
    const sim = new Sim(level([['tomato', 'pasta'], ['tomato']], 2, 1, ['spaghetti']));
    sim.take(0);
    const ev = sim.take(1)!;
    expect(ev).toEqual([
      { t: 'take', col: 1, item: 'tomato', slot: 1 },
      { t: 'prep', a: 1, b: 0, slot: 0, item: 'sauce' },
    ]);
    const ev2 = sim.take(0)!;
    expect(ev2.map((e) => e.t)).toEqual(['take', 'serve', 'seat', 'win']);
  });
});
