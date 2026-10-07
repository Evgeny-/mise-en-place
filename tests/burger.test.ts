import { describe, expect, it } from 'vitest';
import { BurgerRules, BurgerSim } from '../src/core/burger';
import { Solver } from '../src/core/solver';
import { Rng } from '../src/core/rng';
import type { LevelDef } from '../src/core/types';
import type { FoodId } from '../src/core/content';

const B = 'bun_bottom', P = 'patty', C = 'cheese_slice', L = 'lettuce', T = 'tomato_slice', U = 'bun_top';

function burgerLevel(columns: FoodId[][], tickets: FoodId[][], seats: number, slots: number, lids?: number[]): LevelDef {
  return { n: 41, world: 1, menu: 'diner', tier: 'normal', rules: 'burger', columns, slots, seats, tickets, orders: tickets.map(() => 'burger'), lids };
}

/** The showcase from the Burger Line design simulation (counter 3). */
const SHOWCASE = burgerLevel(
  [
    [B, P, T, B, L],
    [C, B, P, L],
    [T, P, U, U, U],
  ],
  [
    [B, P, L, U],
    [B, L, T, C, P, U],
    [B, P, T, U],
  ],
  2,
  3,
);

describe('burger rules', () => {
  it('matches the design simulation on the showcase', () => {
    const r = new BurgerRules(SHOWCASE);
    const s = new Solver(r);
    const start = r.start();
    expect(s.countWins(start)).toBe(75);
    expect(r.moves(start)).toEqual([0, 1, 2]);
    // the tempting bottom bun on column 1 loses; columns 2 and 3 win in 50 and 25 ways
    expect(r.successors(start).map(([, n]) => s.countWins(n))).toEqual([0, 50, 25]);
    expect(s.states).toBe(87);
  });

  it('needs every counter spot (tight)', () => {
    expect(new Solver(new BurgerRules(SHOWCASE, 2)).winnable()).toBe(false);
  });
});

describe('burger play simulation', () => {
  it('agrees with the compact rules on random playouts', () => {
    const rng = new Rng(3);
    for (let game = 0; game < 400; game++) {
      const sim = new BurgerSim(SHOWCASE);
      const rules = new BurgerRules(SHOWCASE);
      let st = rules.start();
      for (;;) {
        const legal = rules.moves(st);
        expect(sim.legalMoves()).toEqual(legal);
        if (!legal.length) {
          expect(sim.status).toBe(rules.isWin(st) ? 'won' : 'stuck');
          break;
        }
        const m = legal[Math.floor(rng.next() * legal.length)];
        sim.take(m);
        st = rules.play(st, m);
        expect(rules.key(sim.state())).toBe(rules.key(st));
        if (rules.isWin(st)) {
          expect(sim.status).toBe('won');
          break;
        }
      }
    }
  }, 60_000);

  it('stacks, parks, slides and serves', () => {
    const sim = new BurgerSim(burgerLevel([[P, B], [U]], [[B, P, U]], 1, 2));
    expect(sim.take(0)).toEqual([{ t: 'take', col: 0, item: P, slot: 0 }]);
    const ev = sim.take(0)!;
    expect(ev).toEqual([
      { t: 'stack', col: 0, item: B, seat: 0, layer: 0 },
      { t: 'slide', slot: 0, seat: 0, layer: 1, item: P },
    ]);
    const last = sim.take(1)!;
    expect(last.map((e) => e.t)).toEqual(['stack', 'serve', 'seat', 'win']);
  });
});
