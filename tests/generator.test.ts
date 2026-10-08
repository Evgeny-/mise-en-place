import { describe, expect, it } from 'vitest';
import {
  buildCandidate,
  burgerGolden,
  columnHeights,
  dealLidLabels,
  generateEndlessLevel,
  generateLevel,
  goldenLine,
  itemCount,
  makeTicket,
  objective,
  pickOrders,
  pickTickets,
  type LevelSpec,
} from '../src/core/generator';
import { BURGER_ITEMS, BurgerRules, stackDishOf } from '../src/core/burger';
import { createSim } from '../src/core/sim';
import { KitchenRules, kitchenFor } from '../src/core/kitchen';
import {
  alongLine,
  burgerHeuristic,
  greedyPlayout,
  isTight,
  kitchenHeuristic,
  measureLevel,
  naturalSolution,
  requiredLookahead,
  Thinker,
} from '../src/core/metrics';
import { CAMPAIGN_LEVELS, endlessSpec, endlessWorld, kitchenSpec } from '../src/core/progression';

/** Trattoria and Burger Joint ladder rows by local level. */
const trattoria = (local: number) => kitchenSpec(0, local);
const diner = (local: number) => kitchenSpec(1, local);
import { Rng } from '../src/core/rng';
import { Solver } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import type { DishId, FoodId } from '../src/core/content';
import { CLASSIC } from './classic';

const k = kitchenFor('trattoria');

/** Pantry items minus the raw parts of the orders, per item (all zero = zero-waste). */
function waste(lv: LevelDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of lv.columns) for (const it of c) out[it] = (out[it] ?? 0) + 1;
  for (const d of lv.orders) for (const x of k.rawParts(k.dish(d))) out[k.items[x]] = (out[k.items[x]] ?? 0) - 1;
  for (const key of Object.keys(out)) if (out[key] === 0) delete out[key];
  return out;
}

function replays(lv: LevelDef, line: number[]): boolean {
  const r = new KitchenRules(lv);
  let s = r.start();
  for (const m of line) {
    if (!r.moves(s).includes(m)) return false;
    s = r.play(s, m);
  }
  return r.isWin(s);
}

const SMALL: LevelSpec = { ...trattoria(9), target: { ...trattoria(9).target, thinking: undefined } };

describe('golden line and dealing', () => {
  it('golden lines serve every order within the counter size', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 40; i++) {
      const orders: DishId[] = ['minestrone', 'pizza', 'omelette', 'spaghetti', 'minestrone'];
      const slots = 2 + (i % 3);
      const g = goldenLine('trattoria', orders, 2, slots, rng);
      if (!g) continue;
      expect(g.peak).toBeLessThanOrEqual(slots);
      expect(g.items.length).toBe(itemCount(k, orders));
      // one column holding the whole line in golden order is a winnable level
      const lv: LevelDef = { n: 0, world: 0, menu: 'trattoria', tier: 'normal', columns: [g.items.map((x) => k.items[x])], slots, seats: 2, orders };
      expect(replays(lv, g.items.map(() => 0))).toBe(true);
    }
  });

  it('column heights stay within 1..depth and add up', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      const cols = rng.int(2, 6);
      const depth = rng.int(3, 6);
      const n = rng.int(cols, cols * depth);
      const lens = columnHeights(n, cols, depth, rng, 2);
      expect(lens.reduce((a, b) => a + b, 0)).toBe(n);
      for (const l of lens) {
        expect(l).toBeGreaterThanOrEqual(1);
        expect(l).toBeLessThanOrEqual(depth);
      }
    }
  });

  it('orders respect the item range, the must-list and dish variety', () => {
    const rng = new Rng(11);
    const spec = trattoria(34);
    for (let i = 0; i < 100; i++) {
      const orders = pickOrders(spec, rng)!;
      const items = itemCount(k, orders);
      expect(items).toBeLessThanOrEqual(Math.min(spec.items[1], spec.columns * spec.depth));
      expect(items).toBeGreaterThanOrEqual(spec.items[0]);
      for (const d of new Set(spec.must)) expect(orders.filter((x) => x === d).length).toBeGreaterThanOrEqual(spec.must!.filter((x) => x === d).length);
      const most = Math.max(...[...new Set(orders)].map((d) => orders.filter((x) => x === d).length));
      expect(most).toBeLessThanOrEqual(Math.max(2, Math.ceil(orders.length / spec.dishes.length)));
    }
  });

  it('a new dish is among the first seated guests', () => {
    const rng = new Rng(2);
    for (const n of [6, 13, 21]) {
      const spec = trattoria(n);
      for (let i = 0; i < 30; i++) expect(pickOrders(spec, rng)!.slice(0, spec.seats)).toContain(spec.intro);
    }
  });
});

describe('lids', () => {
  it('lids are placed so that the golden line stays legal', () => {
    const spec = trattoria(38);
    const rng = new Rng(17);
    let built = 0;
    for (let i = 0; i < 60; i++) {
      const c = buildCandidate(spec, rng);
      if (!c) continue;
      built++;
      expect(c.level.lids).toBeDefined();
      expect(c.level.lids!.filter((x) => x > 0).length).toBe(spec.lids);
      for (const l of c.level.lids!) expect(l).toBeLessThanOrEqual(spec.lidMax!);
      expect(replays(c.level, c.golden)).toBe(true);
      expect(waste(c.level)).toEqual({});
    }
    expect(built).toBeGreaterThan(30);
  });

  it('a lidded column only gets items taken after its dishes are served', () => {
    const rng = new Rng(4);
    const served = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3];
    for (let i = 0; i < 100; i++) {
      const dealt = dealLidLabels([3, 3, 3, 3], served, 1, 3, rng);
      if (!dealt) continue;
      const c = dealt.lids.findIndex((x) => x > 0);
      dealt.labels.forEach((col, pos) => {
        if (col === c) expect(served[pos]).toBeGreaterThanOrEqual(dealt.lids[c]);
      });
      expect(dealt.labels.filter((x) => x === c).length).toBe(3);
    }
  });
});

describe('generateLevel', () => {
  it('is deterministic for a seed', () => {
    const a = generateLevel(SMALL, 1234, { attempts: 12, thinkRuns: 8 })!;
    const b = generateLevel(SMALL, 1234, { attempts: 12, thinkRuns: 8 })!;
    expect(a.level).toEqual(b.level);
    expect(a.dist).toBe(b.dist);
    const c = generateLevel(SMALL, 1235, { attempts: 12, thinkRuns: 8 })!;
    expect(c.level.columns).not.toEqual(a.level.columns);
  });

  it('levels are zero-waste, solvable, and carry a winning solution and their stats', () => {
    for (const n of [3, 8, 14, 21, 27, 36]) {
      const spec = trattoria(n);
      const res = generateLevel({ ...spec, target: { ...spec.target, thinking: undefined } }, n, { attempts: 15 })!;
      const lv = res.level;
      expect(waste(lv)).toEqual({});
      expect(lv.columns.length).toBe(spec.columns);
      for (const c of lv.columns) {
        expect(c.length).toBeGreaterThan(0);
        expect(c.length).toBeLessThanOrEqual(spec.depth);
      }
      expect(new Solver(new KitchenRules(lv)).winnable()).toBe(true);
      expect(replays(lv, lv.solution!)).toBe(true);
      expect(lv.stats!.items).toBe(lv.solution!.length);
      expect(lv.intro).toBe(spec.intro);
    }
  });

  it('a level that must be tight cannot be won with one slot fewer', () => {
    const spec = trattoria(23);
    const res = generateLevel({ ...spec, target: { ...spec.target, thinking: undefined } }, 99, { attempts: 40 })!;
    expect(res.level.stats!.tight).toBe(true);
    expect(isTight(res.level)).toBe(true);
    expect(new Solver(new KitchenRules(res.level, res.level.slots - 1)).winnable()).toBe(false);
    expect(new Solver(new KitchenRules(res.level)).winnable()).toBe(true);
  });

  it('the objective is zero inside the band and grows outside', () => {
    const lv = generateLevel(SMALL, 7, { attempts: 10 })!.level;
    const st = lv.stats!;
    expect(objective(st, {})).toBe(0);
    expect(objective(st, { random: [0, 1] })).toBe(0);
    expect(objective({ ...st, random: 0.5 }, { random: [0, 0.05] })).toBeGreaterThan(objective({ ...st, random: 0.1 }, { random: [0, 0.05] }));
    expect(objective({ ...st, greedy: true }, { greedyLoses: true })).toBeGreaterThan(0);
    expect(objective({ ...st, tight: false }, { tight: true })).toBeGreaterThan(0);
  });
});

describe('endless levels', () => {
  it('are deterministic, zero-waste and solvable', () => {
    // the first endless shift is the Trattoria's: two normal levels and a hard one
    for (const n of [CAMPAIGN_LEVELS + 1, CAMPAIGN_LEVELS + 3, CAMPAIGN_LEVELS + 5]) {
      const a = generateEndlessLevel(n);
      expect(generateEndlessLevel(n)).toEqual(a);
      expect(a.n).toBe(n);
      expect(a.tier).toBe(endlessSpec(n).tier);
      expect(waste(a)).toEqual({});
      expect(replays(a, a.solution!)).toBe(true);
    }
  }, 180_000);
});

/** Python design parity (landing-slot rule = "merge on drop" with one slot fewer). */
const SHOWCASE: LevelDef = {
  n: 1, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 2,
  columns: [['tomato', 'tomato', 'tomato', 'potato'], ['tomato', 'onion'], ['egg', 'potato', 'carrot', 'mushroom', 'pasta'], ['onion', 'cheese', 'carrot']] as FoodId[][],
  orders: ['minestrone', 'minestrone', 'spaghetti', 'omelette'],
};
// the design simulation's menu (a potato next to flour makes gnocchi dough on today's menu)
const LATER: LevelDef = {
  n: 1, world: 0, menu: CLASSIC.id, tier: 'normal', slots: 3, seats: 2,
  columns: [['tomato', 'tomato', 'carrot'], ['cheese', 'egg', 'tomato', 'pasta', 'onion'], ['tomato', 'flour', 'egg', 'mushroom', 'cheese'], ['pasta', 'tomato', 'potato', 'tomato'], ['tomato']] as FoodId[][],
  orders: ['spaghetti', 'minestrone', 'pizza', 'spaghetti', 'omelette'],
  lids: [0, 0, 0, 0, 3],
};

describe('metrics', () => {
  it('match the design simulations on the showcase levels', () => {
    for (const [lv, p] of [[SHOWCASE, 0.01367], [LATER, 0.15077]] as const) {
      const m = measureLevel(lv)!;
      expect(m.stats.random).toBeCloseTo(p, 4);
      expect(m.stats.greedy).toBe(false);
      expect(m.stats.lookahead).toBeGreaterThan(0);
    }
  });

  it('the natural solution only takes safe moves and the bots are consistent', () => {
    const r = new KitchenRules(SHOWCASE);
    const solver = new Solver(r);
    const h = kitchenHeuristic(r);
    const line = naturalSolution(solver, h)!;
    expect(replays(SHOWCASE, line)).toBe(true);
    const rep = alongLine(solver, line);
    expect(rep.critical).toBeGreaterThan(0);
    expect(rep.critical).toBeLessThanOrEqual(rep.decisions);
    expect(rep.safeRatio).toBeGreaterThan(0);
    expect(rep.safeRatio).toBeLessThan(1);
    expect(rep.trapDepth).toBeGreaterThan(0);
    const la = requiredLookahead(solver, h);
    expect(la).toBeGreaterThan(0);
    expect(greedyPlayout(r, h).win).toBe(false);
  });

  it('the thinking player is seeded and plans better than the greedy player', () => {
    const r = new KitchenRules(SHOWCASE);
    const th = new Thinker(r, kitchenHeuristic(r));
    expect(th.rate(20, 5)).toBe(th.rate(20, 5));
    const deep = new Thinker(r, kitchenHeuristic(r)).rate(20, 5, [6]);
    expect(deep).toBeGreaterThan(0);
  });

  it('lid levels report how many winning lines the lids cut', () => {
    const m = measureLevel(LATER)!;
    // 1089588 of 28575802 winning lines survive the lid (see kitchen.test.ts)
    expect(m.stats.lidCut).toBeCloseTo(1 - 1089588 / 28575802, 4);
  });
});

// ---------------------------------------------------------------------------------------------
// Burger Joint

const B = 'bun_bottom', PA = 'patty', CH = 'cheese_slice', LE = 'lettuce', TO = 'tomato_slice', ON = 'onion_rings', BT = 'bun_top';

function burger(columns: FoodId[][], tickets: FoodId[][], seats: number, slots: number, lids?: number[]): LevelDef {
  return { n: 41, world: 1, menu: 'diner', tier: 'normal', rules: 'burger', columns, slots, seats, tickets, orders: tickets.map(() => 'burger'), lids };
}

/** Layers of the tickets minus the pantry, per item (all zero = zero-waste). */
function burgerWaste(lv: LevelDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of lv.tickets!) for (const it of t) out[it] = (out[it] ?? 0) + 1;
  for (const c of lv.columns) for (const it of c) out[it] = (out[it] ?? 0) - 1;
  for (const key of Object.keys(out)) if (out[key] === 0) delete out[key];
  return out;
}

function simWins(lv: LevelDef, line: number[]): boolean {
  const sim = createSim(lv);
  for (const m of line) if (!sim.take(m)) return false;
  return sim.status === 'won';
}

const quiet = (spec: LevelSpec): LevelSpec => ({ ...spec, target: { ...spec.target, thinking: undefined } });

describe('burger tickets and golden order', () => {
  it('tickets are buns around fillings with a patty; double patties sit together', () => {
    const rng = new Rng(8);
    const fillings: FoodId[] = [PA, CH, LE, TO, ON];
    for (let i = 0; i < 300; i++) {
      const len = rng.int(4, 6);
      const t = makeTicket(rng, len, fillings, 0.5);
      expect(t.length).toBe(len);
      expect(t[0]).toBe(B);
      expect(t[len - 1]).toBe(BT);
      expect(t.slice(1, -1)).toContain(PA);
      for (const x of t.slice(1, -1)) expect(fillings).toContain(x);
      const pattyAt = t.map((x, j) => (x === PA ? j : -1)).filter((j) => j >= 0);
      if (pattyAt.length === 2) expect(pattyAt[1] - pattyAt[0]).toBe(1);
    }
  });

  it('the featured filling is ordered and every dish of the set is served', () => {
    const rng = new Rng(9);
    const spec = diner(17);
    expect(spec.burger!.feature).toEqual(['berries']);
    for (let i = 0; i < 50; i++) {
      const tickets = pickTickets(spec, rng)!;
      const used = new Set(tickets.flat());
      for (const f of spec.burger!.feature!) expect(used.has(f)).toBe(true);
      expect(new Set(tickets.map(stackDishOf))).toEqual(new Set(spec.dishes));
      const items = tickets.reduce((a, t) => a + t.length, 0);
      expect(items).toBeLessThanOrEqual(spec.columns * spec.depth);
    }
  });

  it('the golden order serves every ticket within the counter', () => {
    const rng = new Rng(10);
    for (let i = 0; i < 60; i++) {
      const tickets = pickTickets(diner(15), rng)!;
      const slots = 2 + (i % 3);
      const g = burgerGolden(tickets, 2, slots, rng)!;
      expect(g.peak).toBeLessThanOrEqual(slots);
      expect(g.items.length).toBe(tickets.reduce((a, t) => a + t.length, 0));
      // one column holding the golden order is a winnable level
      const lv = burger([g.items.map((x) => BURGER_ITEMS[x])], tickets, 2, slots);
      expect(simWins(lv, g.items.map(() => 0))).toBe(true);
    }
  });
});

describe('burger levels', () => {
  it('are deterministic for a seed', () => {
    const spec = quiet(diner(12));
    const a = generateLevel(spec, 77, { attempts: 4 })!;
    const b = generateLevel(spec, 77, { attempts: 4 })!;
    expect(a.level).toEqual(b.level);
    expect(generateLevel(spec, 78, { attempts: 4 })!.level.columns).not.toEqual(a.level.columns);
  });

  it('are zero-waste, use the burger rules and replay their solution in the play simulation', () => {
    for (const n of [2, 6, 11, 26]) {
      const spec = diner(n);
      const lv = generateLevel(quiet(spec), n, { attempts: 4 })!.level;
      expect(lv.rules).toBe('burger');
      expect(lv.menu).toBe('diner');
      expect(lv.world).toBe(1);
      expect(lv.orders).toEqual(lv.tickets!.map(stackDishOf));
      expect(new Set(lv.orders)).toEqual(new Set(spec.dishes));
      expect(burgerWaste(lv)).toEqual({});
      expect(simWins(lv, lv.solution!)).toBe(true);
      expect(lv.stats!.items).toBe(lv.solution!.length);
    }
  });

  it('the guided split makes the level tight and keeps the golden order legal', () => {
    const spec = quiet(diner(13));
    const rng = new Rng(21);
    let tight = 0;
    for (let i = 0; i < 6; i++) {
      const c = buildCandidate(spec, rng);
      if (!c) continue;
      expect(simWins(c.level, c.golden)).toBe(true);
      if (isTight(c.level)) {
        tight++;
        expect(new Solver(new BurgerRules(c.level, c.level.slots - 1)).winnable()).toBe(false);
      }
    }
    expect(tight).toBeGreaterThan(3);
  });

  it('a level that must be tight is tight; a breather has exactly one spare spot', () => {
    const t = generateLevel(quiet(diner(16)), 5, { attempts: 6 })!.level;
    expect(t.stats!.tight).toBe(true);
    expect(isTight(t)).toBe(true);
    const br = generateLevel(quiet(diner(8)), 5, { attempts: 6 })!.level;
    expect(isTight(br)).toBe(false);
    expect(new Solver(new BurgerRules(br, br.slots - 1)).winnable()).toBe(true);
    expect(new Solver(new BurgerRules(br, br.slots - 2)).winnable()).toBe(false);
  });

  it('lidded burger columns keep the golden order legal', () => {
    const spec = quiet(diner(29));
    const rng = new Rng(31);
    let built = 0;
    for (let i = 0; i < 8; i++) {
      const c = buildCandidate(spec, rng);
      if (!c) continue;
      built++;
      expect(c.level.lids!.filter((x) => x > 0).length).toBe(spec.lids);
      expect(simWins(c.level, c.golden)).toBe(true);
    }
    expect(built).toBeGreaterThan(3);
  });
});

describe('burger metrics', () => {
  /** The two exhibits of the Burger Line design simulation. */
  const SHOW = burger(
    [[B, PA, TO, B, LE], [CH, B, PA, LE], [TO, PA, BT, BT, BT]],
    [[B, PA, LE, BT], [B, LE, TO, CH, PA, BT], [B, PA, TO, BT]],
    2,
    3,
  );
  const LATER = burger(
    [[LE, ON, ON], [CH, B, B, B, TO], [CH, B, ON, CH], [BT, PA, BT, PA], [PA, BT, PA, PA], [BT, CH, B, ON, BT]],
    [[B, ON, LE, PA, BT], [B, CH, PA, ON, BT], [B, PA, CH, ON, BT], [B, CH, ON, PA, BT], [B, CH, TO, PA, BT]],
    2,
    3,
    [1, 0, 0, 0, 0, 0],
  );

  it('match the design simulation: exact random win, winning lines, the tempting first move', () => {
    for (const [lv, p, wins, first] of [[SHOW, 0.0087, 75, 0], [LATER, 0.0085, 6191908460, 1]] as const) {
      const m = measureLevel(lv, { tight: true })!;
      expect(m.stats.random).toBeCloseTo(p, 4);
      expect(m.stats.greedy).toBe(false);
      expect(m.stats.tight).toBe(true);
      expect(new Solver(new BurgerRules(lv)).countWins()).toBe(wins);
      const r = new BurgerRules(lv);
      expect(greedyPlayout(r, burgerHeuristic(r)).line[0]).toBe(first);
    }
  });

  it('the greedy player feeds a plate first, else parks the item needed soonest', () => {
    // plate needs a bottom bun; column 0 offers lettuce (needed 2 layers later), column 1 a top bun (needed last)
    const lv = burger([[LE, B], [BT, PA]], [[B, PA, LE, BT]], 1, 3);
    const r = new BurgerRules(lv);
    const h = burgerHeuristic(r);
    const s = r.start();
    const p = h.priorities(s, r.successors(s));
    expect(p[0]).toBeGreaterThan(p[1]);
    const lv2 = burger([[LE, PA], [B, BT]], [[B, PA, LE, BT]], 1, 3);
    const r2 = new BurgerRules(lv2);
    const s2 = r2.start();
    const p2 = burgerHeuristic(r2).priorities(s2, r2.successors(s2));
    expect(p2[1]).toBeGreaterThan(p2[0]);
  });
});

describe('endless kitchens', () => {
  it('take turns in 5-level shifts after the campaign', () => {
    const e = CAMPAIGN_LEVELS; // endless starts right after the campaign
    expect(endlessWorld(e + 1)).toBe(0);
    expect(endlessWorld(e + 5)).toBe(0);
    expect(endlessWorld(e + 6)).toBe(1);
    expect(endlessWorld(e + 11)).toBe(2);
    expect(endlessWorld(e + 16)).toBe(0);
    const q = generateEndlessLevel(e + 15);
    expect(q.rules).toBe('taco');
    expect(q.world).toBe(2);
    expect(q.tier).not.toBe('normal');
    expect(simWins(q, q.solution!)).toBe(true);
    const a = generateEndlessLevel(e + 6);
    expect(a.rules).toBe('burger');
    expect(a.world).toBe(1);
    expect(generateEndlessLevel(e + 6)).toEqual(a);
    expect(burgerWaste(a)).toEqual({});
    expect(simWins(a, a.solution!)).toBe(true);
    expect(generateEndlessLevel(e + 1).rules).toBeUndefined();
  }, 180_000);
});
