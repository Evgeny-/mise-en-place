import { describe, expect, it } from 'vitest';
import { BurgerRules } from '../src/core/burger';
import type { FoodId } from '../src/core/content';
import { generateGuidedLevel } from '../src/core/generator';
import { levelOf, planObjective, reachOf, type Draft } from '../src/core/guided';
import { KitchenRules } from '../src/core/kitchen';
import { blindRates, bottlenecks, deduce, goalRate, lineDepth, measureDepth, plannerRates, planningDepth, STRONG, withAnyRules } from '../src/core/measure';
import { levelRecipes, MENUS } from '../src/core/content';
import type { SimEvent } from '../src/core/sim';
import { kitchenHeuristic, naturalSolution } from '../src/core/metrics';
import { kitchenSpec } from '../src/core/progression';
import { createSim } from '../src/core/sim';
import { Solver } from '../src/core/solver';
import { TacoRules, TacoSim } from '../src/core/taco';
import type { LevelDef } from '../src/core/types';
import { Game } from '../src/game/Game';
import type { GameView } from '../src/render/GameView';
import { THEMES } from '../src/render/themes';

function fakeView(): GameView {
  return {
    clock: 0, layout: { slotX: [0, 0, 0] }, load: () => undefined, apply: () => 0.4, syncAll: () => undefined, relayout: () => undefined,
    setHint: () => undefined, shake: () => undefined, refreshLegal: () => undefined, update: () => undefined, isIdle: () => true, unload: () => undefined,
  } as unknown as GameView;
}

/** Two spaghetti; the pasta of column 1 is frozen until two takes were made. */
const ICY: LevelDef = {
  n: 1, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 1,
  columns: [['tomato', 'tomato', 'tomato', 'tomato'], ['pasta', 'pasta']] as FoodId[][],
  orders: ['spaghetti', 'spaghetti'],
  frozen: [[1, 0, 2]],
};

describe('frozen tiles', () => {
  it('a frozen top can be taken only after enough takes, in every kitchen', () => {
    const r = new KitchenRules(ICY);
    let s = r.start();
    expect(r.moves(s)).toEqual([0]);
    s = r.play(s, 0);
    expect(r.moves(s)).toEqual([0]);
    s = r.play(s, 0);
    expect(r.moves(s)).toEqual([0, 1]);
    expect(new Solver(new KitchenRules(ICY)).winnable()).toBe(true);
    // the ice is part of the rules: without it the pasta can go first
    expect(new KitchenRules({ ...ICY, frozen: undefined }).moves(new KitchenRules(ICY).start())).toEqual([0, 1]);

    const burger: LevelDef = {
      n: 1, world: 1, menu: 'diner', tier: 'normal', rules: 'burger', slots: 3, seats: 1,
      columns: [['bun_bottom', 'patty'], ['bun_top']] as FoodId[][], orders: ['burger'], tickets: [['bun_bottom', 'patty', 'bun_top']],
      frozen: [[1, 0, 2]],
    };
    const b = new BurgerRules(burger);
    expect(b.moves(b.start())).toEqual([0]);
    expect(b.moves(b.play(b.play(b.start(), 0), 0))).toEqual([1]);

    const taco: LevelDef = {
      n: 1, world: 2, menu: 'taqueria', tier: 'normal', rules: 'taco', slots: 4, seats: 1,
      columns: [['tortilla', 'beans'], ['corn', 'lettuce']] as FoodId[][], orders: ['taco_veggie'], frozen: [[1, 0, 2]],
    };
    const t = new TacoRules(taco);
    expect(t.refusal(t.start(), 1)).toBe('frozen');
    expect(t.moves(t.play(t.play(t.start(), 0), 0))).toEqual([1]);
    expect(new TacoSim(taco).whyNot(1)).toBe('frozen');
  });

  it('the play simulation counts down, and the game explains a frozen column', () => {
    const events: string[] = [];
    const g = new Game(fakeView(), ICY, THEMES[0], {
      onWin: () => events.push('win'), onStuck: () => events.push('stuck'), onChange: () => undefined,
      onInvalid: (_g, why) => events.push('invalid:' + why),
    });
    expect(g.sim.thawLeft(1, 0)).toBe(2);
    expect(g.sim.thawLeft(1, 1)).toBe(0);
    expect(g.take(1)).toBe(false);
    expect(events).toEqual(['invalid:frozen']);
    g.take(0);
    expect(g.sim.thawLeft(1, 0)).toBe(1);
    g.take(0);
    expect(g.sim.thawLeft(1, 0)).toBe(0);
    expect(g.take(1)).toBe(true);
    g.undo();
    g.undo();
    expect(g.sim.thawLeft(1, 0)).toBe(1);
  });
});

/** A bruschetta and a spaghetti; the tile behind the bread is under a cloche. */
const DOME: LevelDef = {
  n: 1, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 2,
  columns: [['bread', 'tomato'], ['tomato', 'pasta'], ['tomato']] as FoodId[][],
  orders: ['bruschetta', 'spaghetti'],
  cloches: [[0, 1]],
};

describe('cloches', () => {
  it('a cloche lifts when its tile reaches the front, and stays lifted after an undo', () => {
    const sim = createSim(DOME);
    expect(sim.covered(0, 1)).toBe(true);
    expect(sim.covered(0, 0)).toBe(false);
    const snap = sim.snapshot();
    const ev = sim.take(0)!;
    expect(ev).toContainEqual({ t: 'reveal', col: 0, item: 'tomato' });
    expect(sim.covered(0, 1)).toBe(false);
    sim.restore(snap as never);
    expect(sim.ptr[0]).toBe(0);
    expect(sim.covered(0, 1)).toBe(false);
  });

  it('cloches don\'t change the rules: the solver sees through them', () => {
    const { cloches: _hidden, ...plain } = DOME;
    const open = new Solver(new KitchenRules(plain));
    const domed = new Solver(new KitchenRules(DOME));
    expect(domed.countWins()).toBe(open.countWins());
    expect(domed.pRandom()).toBe(open.pRandom());
  });

  it('a taco preview lifts no cloche', () => {
    const taco: LevelDef = {
      n: 1, world: 2, menu: 'taqueria', tier: 'normal', rules: 'taco', slots: 4, seats: 1,
      columns: [['tortilla', 'beans'], ['corn', 'lettuce']] as FoodId[][], orders: ['taco_veggie'], cloches: [[0, 1], [1, 1]],
    };
    const sim = new TacoSim(taco);
    expect(sim.preview(0)!.some((e) => e.t === 'reveal')).toBe(false);
    expect(sim.covered(0, 1)).toBe(true);
    sim.take(0);
    expect(sim.covered(0, 1)).toBe(false);
    expect(sim.covered(1, 1)).toBe(true);
  });

  it('the deducer reasons from the tickets: a single hidden tile is never a guess', () => {
    const d = deduce(DOME);
    expect(d).toEqual({ win: true, guesses: 0, riddles: 0, worlds: 1 });
  });

  it('without a guess the deducer always wins; every arrangement it weighs could be the real one', () => {
    let riddles = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const spec = { ...kitchenSpec(0, 14), cloches: 3 };
      const lv = generateGuidedLevel(spec, seed, { attempts: 1, iters: 0, runs: 4, holdout: 4, clocheTries: 1 })?.level;
      if (!lv?.cloches) continue;
      const d = deduce(lv);
      expect(d.worlds).toBeGreaterThanOrEqual(1);
      if (d.guesses === 0) expect(d.win).toBe(true);
      riddles += d.riddles;
    }
    // cloches on these levels do hide something that matters
    expect(riddles).toBeGreaterThan(0);
  }, 180_000);

  it('hiding identical items hides nothing: the blind planner plays like the sighted one', () => {
    const lv: LevelDef = { ...DOME, columns: [['tomato', 'tomato'], ['bread', 'pasta'], ['tomato']] as FoodId[][], cloches: [[0, 1]] };
    const sighted = withAnyRules(lv, undefined, (r, h) => plannerRates(r, h, 8, 3, [1, 2]));
    expect(blindRates(lv, 8, 3, [1, 2])).toEqual(sighted);
  });
});

describe('planning measures', () => {
  it('planning depth is the first depth that wins at least half the games', () => {
    expect(planningDepth([0.2, 0.4, 0.6, 1, 1])).toBe(3);
    expect(planningDepth([0.9, 0.4, 0.6, 1, 1])).toBe(1);
    expect(planningDepth([0, 0, 0, 0, 0.4])).toBe(6);
    expect(reachOf([0.1, 0.5, 0.2], 3)).toBe(0.5);
    expect(reachOf([0.1, 0.5, 0.2], 1)).toBe(0.1);
  });

  it('forced and deep decisions are critical decisions of the solution', () => {
    const spec = kitchenSpec(0, 23);
    const res = generateGuidedLevel(spec, 5, { attempts: 1, iters: 10, runs: 6, holdout: 8 })!;
    const lv = res.level;
    const r = new KitchenRules(lv);
    const solver = new Solver(r);
    const h = kitchenHeuristic(r);
    const sol = naturalSolution(solver, h)!;
    const { forced, deep } = lineDepth(solver, h, sol);
    expect(forced).toBeLessThanOrEqual(lv.stats!.critical);
    expect(deep).toBeLessThanOrEqual(lv.stats!.critical);
  });

  it('planner rates are seeded', () => {
    const lv = kitchenSpec(0, 9);
    const res = generateGuidedLevel(lv, 11, { attempts: 1, iters: 5, runs: 6, holdout: 8 })!;
    const a = measureDepth(res.level, { runs: 12, seed: 4 })!.stats.plan;
    const b = measureDepth(res.level, { runs: 12, seed: 4 })!.stats.plan;
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });

  it('the planning objective is zero inside the bands and grows outside', () => {
    const st = { random: 0.1, greedy: false, lookahead: 0, critical: 5, decisions: 8, safeRatio: 0.8, states: 1, plan: [0.1, 0.2, 0.5, 0.8, 0.9], forced: 3, deep: 2 };
    const t = { reach: { 2: [0, 0.3] as [number, number], 5: [0.6, 1] as [number, number] }, minForced: 3, minDeep: 2, greedyLoses: true };
    expect(planObjective(st, t)).toBe(0);
    expect(planObjective({ ...st, plan: [0.1, 0.6, 0.6, 0.8, 0.9] }, t)).toBeGreaterThan(0);
    expect(planObjective({ ...st, plan: [0.1, 0.2, 0.2, 0.3, 0.4] }, t)).toBeGreaterThan(0);
    expect(planObjective({ ...st, deep: 0 }, t)).toBeGreaterThan(0);
    expect(planObjective({ ...st, greedy: true }, t)).toBeGreaterThan(0);
    expect(planObjective({ ...st, guesses: 1 }, t)).toBeGreaterThan(0);
  });
});

describe('guided generator', () => {
  it('deals the golden line with its ice so that it stays a winning line', () => {
    const d: Draft = {
      base: { n: 1, world: 0, menu: 'trattoria', tier: 'normal', columns: [], slots: 3, seats: 1, orders: ['spaghetti', 'spaghetti'] },
      items: ['tomato', 'tomato', 'pasta', 'tomato', 'tomato', 'pasta'] as FoodId[],
      labels: [0, 0, 1, 0, 0, 1], servedBefore: [0, 0, 0, 1, 1, 1], thaw: [0, 0, 0, 0, 0, 5], columns: 2, depth: 4,
    };
    const lv = levelOf(d);
    expect(lv.columns).toEqual([['tomato', 'tomato', 'tomato', 'tomato'], ['pasta', 'pasta']]);
    expect(lv.frozen).toEqual([[1, 1, 5]]);
    const sim = createSim(lv);
    for (const m of [0, 0, 1, 0, 0, 1]) expect(sim.take(m)).not.toBeNull();
    expect(sim.status).toBe('won');
  });

  it('is deterministic for a seed; levels are solvable, replay their solution and keep their mechanics fair', () => {
    for (const [w, local] of [[0, 12], [0, 26], [1, 12]] as const) {
      const spec = kitchenSpec(w, local);
      const opts = { attempts: 3, iters: 12, runs: 6, holdout: 8, clocheTries: 3, worlds: 12 };
      const a = generateGuidedLevel(spec, 21, opts)!;
      expect(generateGuidedLevel(spec, 21, opts)!.level).toEqual(a.level);
      const lv = a.level;
      const sim = createSim(lv);
      for (const m of lv.solution!) expect(sim.take(m), `${w}/${local}`).not.toBeNull();
      expect(sim.status).toBe('won');
      if (spec.frozen) expect(lv.frozen?.length).toBe(spec.frozen);
      if (spec.cloches) {
        expect(lv.cloches?.length).toBe(spec.cloches);
        for (const [, r] of lv.cloches!) expect(r).toBeGreaterThan(0);
        expect(lv.stats!.guesses).toBe(0);
      }
    }
  }, 180_000);
});

describe('the stove and the ragù chain', () => {
  /** Plays random games in the simulation and checks every step against the compact rules. */
  function parity(lv: LevelDef, games: number, seed: number): { won: number } {
    let won = 0;
    let x = seed;
    const rand = (n: number) => {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      return (x >>> 8) % n;
    };
    for (let g = 0; g < games; g++) {
      const sim = createSim(lv);
      const rules = sim.currentRules();
      let s = rules.start();
      for (;;) {
        const legal = sim.legalMoves();
        expect(legal).toEqual(rules.moves(s));
        if (!legal.length) break;
        const m = legal[rand(legal.length)];
        sim.take(m);
        s = rules.play(s, m);
        expect(rules.key(sim.state())).toBe(rules.key(s));
      }
      if (sim.status === 'won') won++;
      expect(sim.status === 'won').toBe(rules.isWin(s));
    }
    return { won };
  }

  const OVEN: LevelDef = {
    n: 1, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 2,
    columns: [['flour', 'tomato', 'cheese', 'pasta'], ['egg', 'tomato', 'tomato'], ['tomato', 'bread', 'mozzarella', 'bacon']] as FoodId[][],
    orders: ['pizza', 'spaghetti', 'calzone'].map((d) => d as never),
    stove: { pizza: 2, calzone: 2 },
  };

  it('an oven dish bakes for its takes in a counter slot while its guest waits', () => {
    // a level where the pizza is complete after five takes
    const lv: LevelDef = {
      n: 1, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 1,
      columns: [['flour', 'egg', 'tomato', 'tomato', 'cheese'], ['pasta', 'pasta']] as FoodId[][],
      orders: ['pizza', 'spaghetti'] as never, stove: { pizza: 2 },
    };
    // spaghetti needs a second sauce: not zero-waste, but fine for the rules
    const sim = createSim(lv) as unknown as { take(c: number): SimEvent[] | null; baking(s: number): number | null; seats: unknown[]; served: number };
    for (let i = 0; i < 5; i++) sim.take(0);
    expect(sim.baking(0)).toBe(2);
    expect(sim.served).toBe(0);
    const ev = sim.take(1)!;
    expect(ev.some((e) => e.t === 'tick')).toBe(true);
    expect(sim.baking(0)).toBe(1);
    const ev2 = sim.take(1)!;
    expect(ev2.map((e) => e.t)).toContain('done');
    expect(sim.served).toBe(1);
  });

  it('the oven and the grill: the play simulation agrees with the compact rules', () => {
    parity(OVEN, 60, 7);
    const grill: LevelDef = {
      n: 1, world: 1, menu: 'diner', tier: 'normal', rules: 'burger', slots: 3, seats: 2,
      columns: [['bun_bottom', 'patty', 'bun_top', 'patty'], ['bun_bottom', 'cheese_slice', 'bun_top'], ['patty', 'lettuce']] as FoodId[][],
      orders: ['burger', 'burger'] as never,
      tickets: [['bun_bottom', 'patty', 'cheese_slice', 'bun_top'], ['bun_bottom', 'patty', 'patty', 'lettuce', 'bun_top']] as FoodId[][],
      stove: { patty: 2 },
    };
    const { won } = parity(grill, 60, 9);
    expect(won).toBeGreaterThan(0);
    // a patty never goes straight onto a plate
    const b = new BurgerRules(grill);
    const s = b.play(b.play(b.start(), 0), 0);
    expect(s.grill).toEqual([2]);
    expect(s.done[0]).toBe(1);
  });

  it('sauce next to minced beef turns into ragù at once: the chain', () => {
    const r = new KitchenRules({ menu: 'trattoria', columns: [['beef', 'tomato', 'tomato', 'pasta']], slots: 3, seats: 1, orders: ['tagliatelle'] });
    let s = r.start();
    for (let i = 0; i < 3; i++) s = r.play(s, 0);
    const k = r.k;
    expect(s.counts[k.item('ragu')]).toBe(1);
    expect(s.counts[k.item('sauce')]).toBe(0);
    expect(r.isWin(r.play(s, 0))).toBe(true);
    // the recipe card lists the chain once beef and two tomatoes are in the pantry
    const rec = levelRecipes(MENUS.trattoria, ['tagliatelle'], ['beef', 'tomato', 'tomato', 'pasta']);
    expect(rec.preps.map((p) => p.out)).toEqual(['sauce', 'ragu']);
  });

  it('the goal-directed player and the bottlenecks are deterministic for a seed', () => {
    const spec = kitchenSpec(0, 23);
    const lv = generateGuidedLevel(spec, 3, { attempts: 1, iters: 5, runs: 6, holdout: 8 })!.level;
    expect(lv.stove).toBeDefined();
    const a = goalRate(lv, STRONG, 8, 1);
    expect(goalRate(lv, STRONG, 8, 1)).toBe(a);
    const b1 = withAnyRules(lv, undefined, (r) => bottlenecks(new Solver(r), 6, 2));
    const b2 = withAnyRules(lv, undefined, (r) => bottlenecks(new Solver(r), 6, 2));
    expect(b1).toEqual(b2);
    expect(b1.score).toBeGreaterThanOrEqual(b1.narrow);
    const sim = createSim(lv);
    for (const m of lv.solution!) expect(sim.take(m)).not.toBeNull();
    expect(sim.status).toBe('won');
  }, 180_000);
});
