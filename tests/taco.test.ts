import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DishId, FoodId } from '../src/core/content';
import { alongLine, greedyPlayout, naturalSolution, requiredLookahead } from '../src/core/metrics';
import { Rng } from '../src/core/rng';
import { createSim, type SimEvent } from '../src/core/sim';
import { Solver, WIN } from '../src/core/solver';
import { TacoRules, TacoSim, dishFor, type TacoVariant } from '../src/core/taco';
import {
  TAQUERIA_LEVELS, buildTacoCandidate, generateTacoLevel, tacoGolden, tacoHeuristic, tacoRawParts,
  taqueriaSpec, winnableUnder,
} from '../src/core/tacoGen';
import type { LevelDef } from '../src/core/types';

function lv(columns: FoodId[][], slots: number, seats: number, orders: DishId[], extra: Partial<LevelDef> = {}): LevelDef {
  return { n: 81, world: 2, menu: 'taqueria', tier: 'normal', rules: 'taco', columns, slots, seats, orders, ...extra };
}

/** Takes the given columns in turn; returns every move's events. */
function play(sim: TacoSim, moves: number[]): SimEvent[][] {
  return moves.map((m) => {
    const ev = sim.take(m);
    if (!ev) throw new Error(`illegal move ${m} after ${sim.history.join(',')}`);
    return ev;
  });
}

const occ = (sim: TacoSim) => sim.counter.filter((x) => x !== null).length;

/** The showcase from the design research (final.json): counter 4, Veggie + Pollo seated, Veggie queued. */
const SHOWCASE = lv(
  [
    ['chicken', 'tortilla', 'corn', 'onion'],
    ['corn', 'tortilla', 'tortilla', 'lettuce'],
    ['beans', 'lettuce'],
    ['lettuce', 'tomato', 'beans'],
  ],
  4,
  2,
  ['taco_veggie', 'taco_pollo', 'taco_veggie'],
);

interface ParityRow {
  name: string;
  columns: FoodId[][];
  slots: number;
  seats: number;
  orders: DishId[];
  lids?: number[];
  toppings?: Partial<Record<DishId, FoodId>>;
  variant?: 'old' | 'noscoop';
  expect: {
    solvable: boolean;
    wins: number;
    start: number[];
    random?: number;
    startSurv?: number[];
    greedy?: boolean;
    greedyLine?: number[];
    lookahead?: number;
    solution?: number[] | null;
  };
}

/** Levels and exact numbers from the research engine (taco.py), see tests/fixtures/taco-parity.json. */
const PARITY: ParityRow[] = JSON.parse(readFileSync(new URL('./fixtures/taco-parity.json', import.meta.url), 'utf8'));
const variantOf = (r: ParityRow): TacoVariant => (r.variant === 'old' ? { route: 'old' } : r.variant === 'noscoop' ? { absorb: false } : {});

describe('taco rules: parity with the design research', () => {
  it('matches the showcase numbers', () => {
    const r = new TacoRules(SHOWCASE);
    const s = new Solver(r);
    const start = r.start();
    expect(s.countWins()).toBe(20374);
    expect(s.pRandom()).toBeCloseTo(0.3993961640636907, 12);
    expect((100 * s.pRandom()).toFixed(1)).toBe('39.9');
    // take c1 (the tempting chicken) is fatal: stuck within 3 more moves; c2–c4 are safe
    expect(r.moves(start)).toEqual([0, 1, 2, 3]);
    expect(r.successors(start).map(([, n]) => s.surv(n))).toEqual([3, WIN, WIN, WIN]);
    expect(s.safeMoves(start)).toEqual([1, 2, 3]);
    const h = tacoHeuristic(r);
    // the greedy player falls for it
    expect(greedyPlayout(r, h)).toEqual({ win: false, line: [0, 0, 3, 3] });
    expect(requiredLookahead(s, h)).toBe(4);
    // the research's natural winning line, its critical steps and safe-move ratio
    const line = naturalSolution(s, h)!;
    expect(line.map((c) => c + 1)).toEqual([2, 2, 3, 3, 1, 1, 4, 2, 1, 2, 4, 4, 1]);
    const rep = alongLine(s, line);
    expect(rep.critical).toBe(3);
    expect(rep.safeRatio).toBeCloseTo(0.917, 3);
  });

  it('the showcase needs the NEWEST tortilla to receive and the scoop', () => {
    expect(winnableUnder(SHOWCASE, { route: 'old' })).toBe(false);
    expect(winnableUnder(SHOWCASE, { absorb: false })).toBe(false);
    expect(winnableUnder(SHOWCASE, {})).toBe(true);
  });

  it(`agrees with the research engine on ${PARITY.length} random levels`, () => {
    expect(PARITY.length).toBeGreaterThan(60);
    for (const row of PARITY) {
      const r = new TacoRules(row, undefined, variantOf(row));
      const s = new Solver(r);
      const st = r.start();
      const e = row.expect;
      expect(s.winnable(), row.name).toBe(e.solvable);
      expect(s.countWins(), row.name).toBe(e.wins);
      expect(r.moves(st), row.name).toEqual(e.start);
      if (e.random === undefined) continue;
      expect(Math.abs(s.pRandom() - e.random), row.name).toBeLessThan(1e-12);
      expect(r.successors(st).map(([, n]) => (s.surv(n) === WIN ? -1 : s.surv(n))), row.name).toEqual(e.startSurv);
      expect(s.solution(), row.name).toEqual(e.solution);
      const h = tacoHeuristic(r);
      const g = greedyPlayout(r, h);
      expect(g.win, row.name).toBe(e.greedy);
      expect(g.line, row.name).toEqual(e.greedyLine);
      expect(requiredLookahead(s, h), row.name).toBe(e.lookahead);
    }
  }, 60_000);
});

describe('taco rules (the research rule tests)', () => {
  it('1. a tortilla takes one slot; fillings go into it and take none', () => {
    const sim = new TacoSim(lv([['tortilla', 'pork', 'cheese']], 9, 1, ['taco_carnitas']));
    sim.take(0);
    expect(occ(sim)).toBe(1);
    play(sim, [0, 0]);
    expect(occ(sim)).toBe(1);
    expect(sim.slotInfo(0)).toEqual({ kind: 'open', item: 'tortilla', fill: ['pork', 'cheese'], cap: 3, receiving: true, can: ['taco_carnitas'] });
  });

  it('2. tomato + onion = salsa, which drops into the tortilla; the taco folds at 3 and is served', () => {
    const sim = new TacoSim(lv([['tortilla', 'pork', 'tomato', 'onion', 'cheese']], 9, 1, ['taco_carnitas']));
    const ev = play(sim, [0, 0, 0, 0, 0]);
    expect(ev).toEqual([
      [{ t: 'take', col: 0, item: 'tortilla', slot: 0 }, { t: 'receive', slot: 0 }],
      [{ t: 'fill', col: 0, from: null, item: 'pork', slot: 0, n: 1 }],
      [{ t: 'take', col: 0, item: 'tomato', slot: 1 }],
      [
        { t: 'take', col: 0, item: 'onion', slot: 2 },
        { t: 'prep', a: 2, b: 1, slot: 1, item: 'salsa' },
        { t: 'fill', col: null, from: 1, item: 'salsa', slot: 0, n: 2 },
      ],
      [
        { t: 'fill', col: 0, from: null, item: 'cheese', slot: 0, n: 3 },
        { t: 'fold', slot: 0, dish: 'taco_carnitas', seat: 0 },
        { t: 'serve', seat: 0, dish: 'taco_carnitas', from: [0] },
        { t: 'seat', seat: 0, dish: null, order: -1 },
        { t: 'receive', slot: null },
        { t: 'win' },
      ],
    ]);
    expect(sim.status).toBe('won');
    expect(occ(sim)).toBe(0);
  });

  it('3. the NEWEST open tortilla receives (the research variant: the oldest)', () => {
    const sim = new TacoSim(lv([['tortilla', 'pork', 'tortilla', 'chicken']], 9, 2, ['taco_carnitas', 'taco_pollo']));
    play(sim, [0, 0, 0, 0]);
    expect(sim.slotInfo(0)).toMatchObject({ kind: 'open', fill: ['pork'], receiving: false });
    expect(sim.slotInfo(1)).toMatchObject({ kind: 'open', fill: ['chicken'], receiving: true });
    expect(sim.receivingSlot()).toBe(1);
    const old = new TacoRules(lv([['tortilla', 'tortilla', 'beans']], 9, 2, ['taco_carnitas', 'taco_veggie']), undefined, { route: 'old' });
    let s = old.start();
    for (let i = 0; i < 3; i++) s = old.play(s, 0);
    expect(old.kitchen(s).opens.map((b) => b.f.length)).toEqual([1, 0]);
  });

  it('4. when the inner taco folds, the older tortilla receives again', () => {
    const sim = new TacoSim(lv([['tortilla', 'pork', 'tortilla', 'beans', 'corn', 'lettuce', 'cheese']], 9, 2, ['taco_carnitas', 'taco_veggie']));
    const ev = play(sim, [0, 0, 0, 0, 0, 0]);
    expect(ev[5]).toEqual([
      { t: 'fill', col: 0, from: null, item: 'lettuce', slot: 1, n: 3 },
      { t: 'fold', slot: 1, dish: 'taco_veggie', seat: 1 },
      { t: 'serve', seat: 1, dish: 'taco_veggie', from: [1] },
      { t: 'seat', seat: 1, dish: null, order: -1 },
      { t: 'receive', slot: 0 },
    ]);
    play(sim, [0]);
    expect(sim.slotInfo(0)).toMatchObject({ kind: 'open', fill: ['pork', 'cheese'], receiving: true });
  });

  it('5. a taco for a queued ticket waits (one slot) and is served when its guest sits down', () => {
    const sim = new TacoSim(lv([['tortilla', 'beans', 'corn', 'lettuce', 'tortilla', 'pork', 'cheese', 'tomato', 'onion']], 9, 1, ['taco_carnitas', 'taco_veggie']));
    const ev = play(sim, [0, 0, 0, 0]);
    expect(ev[3].slice(-2)).toEqual([{ t: 'fold', slot: 0, dish: 'taco_veggie', seat: null }, { t: 'receive', slot: null }]);
    expect(occ(sim)).toBe(1);
    expect(sim.slotInfo(0)).toEqual({ kind: 'taco', item: 'tortilla', fill: ['beans', 'corn', 'lettuce'], dish: 'taco_veggie' });
    const last = play(sim, [0, 0, 0, 0, 0]).pop()!;
    expect(last).toEqual([
      { t: 'take', col: 0, item: 'onion', slot: 3 },
      { t: 'prep', a: 3, b: 2, slot: 2, item: 'salsa' },
      { t: 'fill', col: null, from: 2, item: 'salsa', slot: 1, n: 3 },
      { t: 'fold', slot: 1, dish: 'taco_carnitas', seat: 0 },
      { t: 'serve', seat: 0, dish: 'taco_carnitas', from: [1] },
      { t: 'seat', seat: 0, dish: 'taco_veggie', order: 1 },
      { t: 'serve', seat: 0, dish: 'taco_veggie', from: [0] },
      { t: 'seat', seat: 0, dish: null, order: -1 },
      { t: 'receive', slot: null },
      { t: 'win' },
    ]);
  });

  it('6. in-place refill: the queued guest takes the served guest\'s seat', () => {
    const sim = new TacoSim(lv([['tortilla', 'beans', 'corn', 'lettuce']], 9, 2, ['taco_veggie', 'taco_carnitas', 'taco_pollo']));
    play(sim, [0, 0, 0, 0]);
    expect(sim.seats).toEqual(['taco_pollo', 'taco_carnitas']);
  });

  it('7. fit guard: a filling that would make a taco nobody ordered is refused', () => {
    const sim = new TacoSim(lv([['tortilla', 'pork', 'chicken']], 9, 2, ['taco_carnitas', 'taco_pollo']));
    play(sim, [0, 0]);
    expect(sim.legalMoves()).toEqual([]);
    expect(sim.status).toBe('stuck');
  });

  it('8. two open tortillas can\'t compete for one ticket (joint matching)', () => {
    const sim = new TacoSim(lv([['tortilla', 'pork', 'tortilla', 'pork']], 9, 2, ['taco_carnitas', 'taco_pollo']));
    play(sim, [0, 0, 0]);
    expect(sim.canTake(0)).toBe(false);
    expect(sim.whyNot(0)).toBe('fit');
  });

  it('9. loose fillings wait (one slot each) and the next tortilla scoops them in arrival order', () => {
    const a = new TacoSim(lv([['beans', 'corn', 'pork', 'tortilla']], 9, 2, ['taco_veggie', 'taco_carnitas']));
    play(a, [0, 0]);
    expect(occ(a)).toBe(2);
    // the next tortilla would scoop beans, corn, pork: no such taco
    expect(a.whyNot(0)).toBe('fit');
    const b = new TacoSim(lv([['beans', 'corn', 'lettuce', 'pork', 'tortilla']], 9, 2, ['taco_veggie', 'taco_carnitas']));
    const ev = play(b, [0, 0, 0, 0, 0]);
    expect(b.slotInfo(3)).toEqual({ kind: 'loose', item: 'pork', scoop: 0 });
    expect(ev[4]).toEqual([
      { t: 'take', col: 0, item: 'tortilla', slot: 4 },
      { t: 'fill', col: null, from: 0, item: 'beans', slot: 4, n: 1 },
      { t: 'fill', col: null, from: 1, item: 'corn', slot: 4, n: 2 },
      { t: 'fill', col: null, from: 2, item: 'lettuce', slot: 4, n: 3 },
      { t: 'fold', slot: 4, dish: 'taco_veggie', seat: 0 },
      { t: 'serve', seat: 0, dish: 'taco_veggie', from: [4] },
      { t: 'seat', seat: 0, dish: null, order: -1 },
      // (this pantry has no second tortilla)
      { t: 'stuck' },
    ]);
    expect(occ(b)).toBe(1);
    expect(b.slotInfo(3)).toEqual({ kind: 'loose', item: 'pork', scoop: 0 });
  });

  it('10. research variant (b): without the scoop a loose filling is a dead end', () => {
    const r = new TacoRules(lv([['beans', 'tortilla', 'corn', 'lettuce']], 9, 1, ['taco_veggie']), undefined, { absorb: false });
    expect(r.moves(r.start())).toEqual([]);
  });

  it('11. landing-slot rule: a full counter accepts only takes that resolve', () => {
    const a = new TacoSim(lv([['tortilla', 'tomato'], ['pork'], ['onion'], ['tortilla'], ['beans']], 2, 2, ['taco_carnitas', 'taco_veggie']));
    play(a, [0, 0]);
    // pork/beans drop into the tortilla, the onion makes salsa; a second tortilla needs a slot
    expect(a.legalMoves()).toEqual([1, 2, 4]);
    expect(a.whyNot(3)).toBe('full');
    const b = new TacoSim(lv([['beans', 'corn'], ['tortilla'], ['lettuce']], 2, 1, ['taco_veggie']));
    play(b, [0, 0]);
    expect(b.legalMoves()).toEqual([1]);
    // the tortilla lands on the extra spot, scoops both and moves to a freed slot
    expect(b.take(1)).toEqual([
      { t: 'take', col: 1, item: 'tortilla', slot: 2 },
      { t: 'fill', col: null, from: 0, item: 'beans', slot: 2, n: 1 },
      { t: 'fill', col: null, from: 1, item: 'corn', slot: 2, n: 2 },
      { t: 'move', from: 2, to: 0 },
      { t: 'receive', slot: 0 },
    ]);
    expect(b.counter).toEqual(['tortilla', null]);
    expect(b.take(2)!.map((e) => e.t)).toEqual(['fill', 'fold', 'serve', 'seat', 'receive', 'win']);
  });

  it('12. a burrito wrap holds four', () => {
    const sim = new TacoSim(lv([['wrap', 'beans', 'corn', 'lettuce', 'cheese']], 9, 1, ['burrito_veggie']));
    play(sim, [0, 0, 0, 0]);
    expect(sim.slotInfo(0)).toMatchObject({ kind: 'open', item: 'wrap', fill: ['beans', 'corn', 'lettuce'], cap: 4, receiving: true });
    expect(sim.take(0)!.slice(1, 2)).toEqual([{ t: 'fold', slot: 0, dish: 'burrito_veggie', seat: 0 }]);
    expect(sim.status).toBe('won');
  });

  it('15. avocado + lime = guacamole', () => {
    const sim = new TacoSim(lv([['tortilla', 'avocado', 'chicken', 'lime', 'corn']], 9, 1, ['taco_verde']));
    const ev = play(sim, [0, 0, 0, 0, 0]);
    expect(ev[3]).toContainEqual({ t: 'prep', a: 2, b: 1, slot: 1, item: 'guacamole' });
    expect(sim.status).toBe('won');
  });

  it('16. topping last: the marked filling can only close the taco', () => {
    const tops = { toppings: { taco_carnitas: 'cheese' as FoodId } };
    expect(new Solver(new TacoRules(lv([['tortilla', 'cheese', 'pork', 'tomato', 'onion']], 9, 1, ['taco_carnitas'], tops))).winnable()).toBe(false);
    expect(new Solver(new TacoRules(lv([['tortilla', 'pork', 'tomato', 'onion', 'cheese']], 9, 1, ['taco_carnitas'], tops))).winnable()).toBe(true);
    const sim = new TacoSim(lv([['tortilla', 'pork', 'cheese'], ['tomato', 'onion']], 9, 1, ['taco_carnitas'], tops));
    play(sim, [0, 0]);
    expect(sim.legalMoves()).toEqual([1]);
    expect(sim.whyNot(0)).toBe('topping');
    expect(sim.topping('taco_carnitas')).toBe('cheese');
  });
});

describe('taco play simulation', () => {
  const levels = [SHOWCASE, ...PARITY.filter((r) => !r.variant).slice(0, 40).map((r) => lv(r.columns, r.slots, r.seats, r.orders, { lids: r.lids, toppings: r.toppings }))];

  it('agrees with the compact rules on random playouts', () => {
    const rng = new Rng(11);
    for (const level of levels) {
      for (let game = 0; game < 60; game++) {
        const sim = createSim(level) as unknown as TacoSim;
        const rules = new TacoRules(level);
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
          expect(ev[0]).toMatchObject({ col: m });
          st = rules.play(st, m);
          expect(rules.key(sim.state())).toBe(rules.key(st));
          expect(sim.counter.length).toBe(level.slots);
          expect(sim.served).toBe(rules.served(st));
          const recv = sim.receivingSlot();
          if (recv !== null) expect(sim.slotInfo(recv)).toMatchObject({ kind: 'open', receiving: true });
          if (rules.isWin(st)) {
            expect(sim.status).toBe('won');
            break;
          }
        }
      }
    }
  }, 60_000);

  it('replays the solver line to a win and serves every order', () => {
    const solver = new Solver(new TacoRules(SHOWCASE));
    const sim = new TacoSim(SHOWCASE);
    const served: string[] = [];
    for (const m of solver.solution()!) for (const e of sim.take(m)!) if (e.t === 'serve') served.push(e.dish);
    expect(sim.status).toBe('won');
    expect(served.sort()).toEqual(['taco_pollo', 'taco_veggie', 'taco_veggie']);
    expect(sim.counter.every((x) => x === null)).toBe(true);
  });

  it('every fill/fold/serve refers to a slot that holds what it says', () => {
    const rng = new Rng(5);
    for (const level of levels.slice(0, 15)) {
      const sim = new TacoSim(level);
      while (sim.status === 'playing') {
        const legal = sim.legalMoves();
        const before = sim.snapshot();
        const ev = sim.take(legal[Math.floor(rng.next() * legal.length)])!;
        // replay the events on the slot contents before the move
        const slots: ({ kind: string; n: number } | null)[] = before.entries.map((e) => (e ? { kind: e.k, n: 'fill' in e ? e.fill.length : 0 } : null));
        for (const e of ev) {
          if (e.t === 'take') slots[e.slot] = { kind: 'landed', n: 0 };
          if (e.t === 'fill') {
            expect(slots[e.slot]).not.toBeNull();
            if (e.from !== null) {
              expect(slots[e.from]).not.toBeNull();
              slots[e.from] = null;
            }
          }
          if (e.t === 'prep') slots[e.a] = null;
          if (e.t === 'serve') for (const f of e.from) {
            expect(slots[f], JSON.stringify(ev)).not.toBeNull();
            slots[f] = null;
          }
          if (e.t === 'move') {
            expect(slots[e.to]).toBeNull();
            slots[e.to] = slots[e.from];
            slots[e.from] = null;
          }
        }
        slots.length = sim.slots;
        expect(slots.map((x) => x !== null)).toEqual(sim.counter.map((x) => x !== null));
      }
    }
  });

  it('undo restores everything; preview does not change the state', () => {
    const sim = new TacoSim(SHOWCASE);
    play(sim, [1, 1, 2]);
    const snap = sim.snapshot();
    const key = sim.currentRules().key(sim.state());
    expect(sim.preview(0)).toBeNull();
    const pv = sim.preview(2);
    expect(pv!.map((e) => e.t)).toEqual(['fill', 'fold', 'serve', 'seat', 'receive']);
    expect(sim.currentRules().key(sim.state())).toBe(key);
    expect(sim.take(2)).toEqual(pv);
    sim.restore(snap);
    expect(sim.currentRules().key(sim.state())).toBe(key);
    expect(sim.history).toEqual([1, 1, 2]);
  });

  it('a booster slot makes a stuck counter playable again', () => {
    const sim = new TacoSim(lv([['tomato'], ['avocado'], ['onion']], 1, 1, ['taco_pollo']));
    play(sim, [0]);
    expect(sim.status).toBe('stuck');
    expect(sim.whyNot(1)).toBe('full');
    // a lone salsa can never be scooped: there is no tortilla in this pantry
    expect(sim.whyNot(2)).toBe('fit');
    sim.addSlot();
    expect(sim.status).toBe('playing');
    expect(sim.counter.length).toBe(2);
    expect(sim.legalMoves()).toEqual([1]);
  });

  it('knows which dish a filling set makes', () => {
    expect(dishFor('tortilla', ['salsa', 'cheese', 'pork'])).toBe('taco_carnitas');
    expect(dishFor('wrap', ['beans', 'corn', 'lettuce', 'cheese'])).toBe('burrito_veggie');
    expect(dishFor('tortilla', ['beans', 'corn', 'cheese'])).toBeNull();
  });
});

describe('taco generator', () => {
  it('golden lines win and the pantry is zero-waste', () => {
    const rng = new Rng(3);
    const orders: DishId[] = ['taco_pollo', 'taco_carnitas', 'burrito_veggie', 'taco_verde'];
    const g = tacoGolden(orders, 2, 4, rng, { nestBias: 1 })!;
    expect(g.slice().sort()).toEqual(orders.flatMap(tacoRawParts).sort());
    const level = lv([g], 4, 2, orders);
    const r = new TacoRules(level);
    let s = r.start();
    for (let i = 0; i < g.length; i++) s = r.play(s, 0);
    expect(r.isWin(s)).toBe(true);
  });

  it('dealt candidates replay their golden line', () => {
    const rng = new Rng(9);
    for (const n of [4, 16, 31]) {
      const c = buildTacoCandidate(taqueriaSpec(n), rng)!;
      const sim = createSim(c.level);
      for (const m of c.golden) expect(sim.take(m)).not.toBeNull();
      expect(sim.status).toBe('won');
    }
  });

  it('is deterministic for a seed and honours the teaching filter', () => {
    const spec = taqueriaSpec(4);
    const a = generateTacoLevel(spec, 42, { attempts: 30 })!;
    const b = generateTacoLevel(spec, 42, { attempts: 30 })!;
    expect(a.level).toEqual(b.level);
    expect(a.level.rules).toBe('taco');
    expect(winnableUnder(a.level, { route: 'old' })).toBe(false);
  });

  it('has a spec for every Taquería level', () => {
    for (let n = 1; n <= TAQUERIA_LEVELS; n++) {
      const s = taqueriaSpec(n);
      expect(s.world).toBe(2);
      expect(s.columns * s.depth).toBeGreaterThanOrEqual(s.orders[0] * 4);
    }
  });
});
