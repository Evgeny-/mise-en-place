import { describe, expect, it } from 'vitest';
import { BurgerRules } from '../src/core/burger';
import type { FoodId } from '../src/core/content';
import { generateGuidedLevel } from '../src/core/generator';
import { levelOf, planObjective, reachOf, type Draft } from '../src/core/guided';
import { KitchenRules } from '../src/core/kitchen';
import { blindRates, deduce, lineDepth, measureDepth, plannerRates, planningDepth, withAnyRules } from '../src/core/measure';
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
  });

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
  });
});
