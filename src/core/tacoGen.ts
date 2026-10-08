/**
 * Taquería (world 3) level generator, simulated-player heuristic and campaign ladder (levels 81–120).
 * A port of the design research generator (tgen.py) onto the shared measurement code (metrics.ts).
 *
 * 1. Pick the orders (zero waste: the pantry holds exactly one container + the raw fillings of each
 *    ticket; salsa = tomato + onion, guacamole = avocado + lime).
 * 2. Golden line: a randomised depth-first search over item TYPES under the exact rules (fit guard
 *    and landing-slot rule included), biased toward takes that hold an item on the counter
 *    (`holdBias`) and toward laying a new container over a half-made one (`nestBias`, parking).
 * 3. Deal the golden line into columns (top first) with an uneven skyline. Taking the columns in
 *    golden order replays the golden line, so the level is solvable by construction.
 * 4. Teaching filters: an intro level can require that its concept is necessary ('park': unwinnable
 *    if the OLDEST open tortilla received; 'scoop': unwinnable if loose fillings were never scooped).
 * 5. Measure with the exact solver and the simulated players (metrics.ts) and keep the candidate
 *    closest to the middle of the level's target band (same tiers and stats as world 1).
 *
 * Everything is deterministic for a seed.
 */
import { DISHES, type DishId, type FoodId } from './content';
import type { Target } from './generator';
import { generateGuided, planAim, planObjective, type Draft, type GuidedOptions } from './guided';
import { planBands } from './targets';
import {
  alongLine, greedyPlayout, naturalSolution, phaseRandom, requiredLookahead, roundStats, Thinker,
} from './metrics';
import { tacoHeuristic } from './tacoHeuristic';
import { Rng } from './rng';
import { campaignLevel } from './shifts';
import { Solver } from './solver';
import { TACO_ITEMS, TacoRules, tacoIndex, type TacoLevel, type TacoVariant } from './taco';
import type { Intro, LevelDef, LevelStats, Tier } from './types';

const TORTILLA = 12;
/** item index -> raw items it is made of (salsa -> tomato + onion, guacamole -> avocado + lime) */
const EXPAND: number[][] = TACO_ITEMS.map((_, i) => (i === 6 ? [8, 9] : i === 7 ? [10, 11] : [i]));

export { tacoHeuristic } from './tacoHeuristic';

// ---------------------------------------------------------------------------------------------
// Measurement

export interface TacoMeasureOptions {
  /** thinking-player games (0 = skip) */
  thinkRuns?: number;
  seed?: number;
  /** also check whether the level can be won with one slot fewer */
  tight?: boolean;
  /** solution to measure along (default: the natural solution) */
  solution?: number[];
  budget?: number;
}

/** Every difficulty number of a taco level (null if it can't be won); same fields as world 1. */
export function measureTaco(level: TacoLevel, opts: TacoMeasureOptions = {}): { stats: LevelStats; solution: number[] } | null {
  const rules = new TacoRules(level);
  const h = tacoHeuristic(rules);
  const solver = new Solver(rules, opts.budget);
  if (!solver.winnable()) return null;
  const solution = opts.solution ?? naturalSolution(solver, h)!;
  const line = alongLine(solver, solution);
  const stats: LevelStats = {
    random: solver.pRandom(),
    greedy: greedyPlayout(rules, h).win,
    lookahead: requiredLookahead(solver, h),
    critical: line.critical,
    decisions: line.decisions,
    safeRatio: line.safeRatio,
    states: solver.states,
    phaseRandom: phaseRandom(solver, solution),
    lateCritical: line.lateCritical,
    trapDepth: line.trapDepth,
    items: rules.length,
  };
  if (opts.thinkRuns) stats.thinking = tacoThinking(level, opts.thinkRuns, opts.seed ?? 1);
  if (opts.tight) stats.tight = isTacoTight(level, opts.budget);
  return { stats, solution };
}

/** Is the level unwinnable with one counter slot fewer? */
export function isTacoTight(level: TacoLevel, budget?: number): boolean {
  if (level.slots <= 1) return true;
  return !new Solver(new TacoRules(level, level.slots - 1), budget).winnable();
}

/** Win rate of the thinking player (planning depths 2 and 3 in turn). */
export function tacoThinking(level: TacoLevel, runs: number, seed: number): number {
  const r = new TacoRules(level);
  return new Thinker(r, tacoHeuristic(r)).rate(runs, seed ^ 0x2545f491, [2, 3]);
}

/** Is the level winnable under a rule variant (the teaching filters)? */
export function winnableUnder(level: TacoLevel, variant: TacoVariant, budget?: number): boolean {
  return new Solver(new TacoRules(level, undefined, variant), budget).winnable();
}

// ---------------------------------------------------------------------------------------------
// Specs and targets

/** Everything the generator needs for one taco level. */
export interface TacoSpec {
  /** campaign level number (global) */
  n: number;
  world: number;
  /** kitchen-local index (1–40) */
  local?: number;
  tier: Tier;
  columns: number;
  /** tallest column */
  depth: number;
  slots: number;
  seats: number;
  /** number of guests, inclusive range */
  orders: [number, number];
  /** dishes guests may order */
  dishes: DishId[];
  /** dishes that must be ordered (a multiset) */
  must?: DishId[];
  /** pantry size, inclusive range */
  items?: [number, number];
  /** golden line: preference for takes that hold an item on the counter */
  holdBias?: number;
  /** golden line: preference for laying a container over a half-made one */
  nestBias?: number;
  /** extra ±1 column-height transfers for an uneven skyline */
  spread?: number;
  /** twist "topping last" */
  toppings?: Partial<Record<DishId, FoodId>>;
  /** frozen tiles and cloches (pantry.ts) */
  frozen?: number;
  cloches?: number;
  /** teaching filter: the concept must be necessary to win */
  essential?: 'park' | 'scoop';
  intro?: Intro;
  theme?: string;
  target: Target;
}

const logBand = (v: number, band: [number, number] | undefined): number => {
  if (!band) return 0;
  const f = (x: number) => Math.log10(Math.max(x, 1e-5));
  if (v > band[1]) return f(v) - f(band[1]);
  if (v < band[0]) return f(band[0]) - f(v);
  return 0;
};

const linBand = (v: number, band: [number, number] | undefined): number => {
  if (!band) return 0;
  return v < band[0] ? band[0] - v : v > band[1] ? v - band[1] : 0;
};

/** Distance of the measured stats from the target (0 = on target); the same terms as world 1. */
export function tacoObjective(st: LevelStats, t: Target): number {
  let v = logBand(st.random, t.random);
  v += planObjective(st, t);
  v += 0.25 * linBand(st.lookahead, t.lookahead);
  if (t.minCritical) v += 0.12 * Math.max(0, t.minCritical - st.critical);
  if (t.minLateCritical) v += 0.12 * Math.max(0, t.minLateCritical - (st.lateCritical ?? 0));
  if (t.phaseRandom !== undefined) v += Math.max(0, logBand(st.phaseRandom ?? 1, [0, t.phaseRandom]));
  if (t.thinking) v += st.thinking === undefined ? 0.15 : 1.2 * linBand(st.thinking, t.thinking);
  if (t.maxTrap !== undefined) v += 0.05 * Math.max(0, (st.trapDepth ?? 0) - t.maxTrap);
  return v;
}

/** How far a level is from the middle of its target (random win on a log scale + thinking player). */
export function tacoAim(st: LevelStats, t: Target): number {
  let d = 0;
  if (t.random) {
    const [lo, hi] = t.random;
    const centre = lo > 0 ? Math.sqrt(lo * hi) : hi / 3;
    d += Math.abs(Math.log10(Math.max(st.random, 1e-5)) - Math.log10(centre));
  }
  if (t.thinking && st.thinking !== undefined) d += Math.abs(st.thinking - (t.thinking[0] + t.thinking[1]) / 2);
  return d + planAim(st, t);
}

// ---------------------------------------------------------------------------------------------
// Orders, golden line, columns

/** Raw pantry items of a dish: its container + its fillings (preps expanded). */
export function tacoRawParts(d: DishId): FoodId[] {
  return DISHES[d].parts.flatMap((p) => EXPAND[tacoIndex(p)].map((i) => TACO_ITEMS[i]));
}

export function tacoItemCount(orders: DishId[]): number {
  return orders.reduce((a, d) => a + tacoRawParts(d).length, 0);
}

/** Random orders for the spec (the intro dish among the first seated guests), or null. */
export function pickTacoOrders(spec: TacoSpec, rng: Rng): DishId[] | null {
  const cap = Math.min(spec.items?.[1] ?? 99, spec.columns * spec.depth);
  const lo = Math.max(spec.items?.[0] ?? 0, spec.columns);
  for (let tries = 0; tries < 400; tries++) {
    const n = rng.int(spec.orders[0], spec.orders[1]);
    const orders = (spec.must ?? []).slice(0, n);
    while (orders.length < n) orders.push(rng.pick(spec.dishes));
    rng.shuffle(orders);
    const items = tacoItemCount(orders);
    if (items > cap || items < lo) continue;
    // spread evenly over the dishes (see pickOrders in generator.ts)
    if (spec.dishes.length > 1) {
      const counts = new Map<DishId, number>();
      for (const d of orders) counts.set(d, (counts.get(d) ?? 0) + 1);
      if (counts.size < Math.min(2, n) || Math.max(...counts.values()) > Math.max(2, Math.ceil(n / spec.dishes.length))) continue;
    }
    if (spec.intro && orders.includes(spec.intro as DishId)) {
      const at = orders.indexOf(spec.intro as DishId);
      const seat = rng.int(0, Math.min(spec.seats, orders.length) - 1);
      if (at > seat) [orders[at], orders[seat]] = [orders[seat], orders[at]];
    }
    return orders;
  }
  return null;
}

/**
 * Golden line: randomised DFS over item types that serves every order under the exact rules.
 * Returns the take order as item ids, or null (node cap reached).
 */
export function tacoGolden(
  orders: DishId[],
  seats: number,
  slots: number,
  rng: Rng,
  opts: { holdBias?: number; nestBias?: number; toppings?: TacoLevel['toppings']; nodeCap?: number } = {},
): FoodId[] | null {
  const items = orders.flatMap(tacoRawParts);
  // one column holding everything: the rules engine resolves drops of any type
  const r = new TacoRules({ columns: [items], slots, seats, orders, toppings: opts.toppings });
  const rem = new Array<number>(TACO_ITEMS.length).fill(0);
  for (const it of items) rem[tacoIndex(it)]++;
  const hold = opts.holdBias ?? 0.5;
  const nest = opts.nestBias ?? 0;
  const cap = opts.nodeCap ?? 60000;
  const dead = new Set<string>();
  const path: number[] = [];
  let nodes = 0;

  const dfs = (k: number): boolean => {
    const K = r.kinfo[k];
    if (K.win) return true;
    const key = rem.join(',') + '|' + k;
    if (dead.has(key)) return false;
    if (++nodes > cap) return false;
    const o = K.occ;
    const opensWithFood = K.opens.some((b) => b.f.length > 0);
    const cands: { w: number; t: number; k: number }[] = [];
    for (let t = 0; t < rem.length; t++) {
      if (!rem[t]) continue;
      const d = r.drop(k, t);
      const o2 = r.kinfo[d.k].occ;
      if (d.dead || (o >= slots && o2 > slots)) continue;
      let w = rng.next();
      if (o2 > o) w += hold * rng.next();
      if (t >= TORTILLA && opensWithFood) w += nest * rng.next();
      cands.push({ w, t, k: d.k });
    }
    cands.sort((a, b) => b.w - a.w);
    for (const c of cands) {
      rem[c.t]--;
      path.push(c.t);
      if (dfs(c.k)) return true;
      rem[c.t]++;
      path.pop();
      if (nodes > cap) return false;
    }
    dead.add(key);
    return false;
  };

  return dfs(r.startKitchen()) ? path.map((i) => TACO_ITEMS[i]) : null;
}

/** Column heights for n items: as even as possible, then `spread * C` random ±1 transfers. */
function heights(n: number, columns: number, depth: number, rng: Rng, spread = 1): number[] {
  if (n < columns || n > columns * depth) throw new Error(`cannot deal ${n} items into ${columns}x${depth}`);
  const lens = new Array<number>(columns).fill(Math.floor(n / columns));
  const extra = rng.shuffle([...Array(columns).keys()]).slice(0, n - lens.reduce((a, b) => a + b, 0));
  for (const i of extra) lens[i]++;
  for (let i = 0; i < spread * columns; i++) {
    const a = rng.int(0, columns - 1);
    const b = rng.int(0, columns - 1);
    if (a !== b && lens[a] > 1 && lens[b] < depth) {
      lens[a]--;
      lens[b]++;
    }
  }
  return lens;
}

/** One unmeasured candidate level (golden labels = a winning line), or null. */
export function buildTacoCandidate(spec: TacoSpec, rng: Rng): { level: LevelDef; golden: number[] } | null {
  const orders = pickTacoOrders(spec, rng);
  if (!orders) return null;
  const g = tacoGolden(orders, spec.seats, spec.slots, rng, { holdBias: spec.holdBias, nestBias: spec.nestBias, toppings: spec.toppings });
  if (!g) return null;
  const lens = heights(g.length, spec.columns, spec.depth, rng, spec.spread ?? 1);
  const labels: number[] = [];
  lens.forEach((len, i) => {
    for (let j = 0; j < len; j++) labels.push(i);
  });
  rng.shuffle(labels);
  const columns: FoodId[][] = Array.from({ length: spec.columns }, () => []);
  g.forEach((it, i) => columns[labels[i]].push(it));
  const level: LevelDef = {
    n: spec.n, world: spec.world, ...(spec.local ? { local: spec.local } : {}), menu: 'taqueria', tier: spec.tier, rules: 'taco',
    columns, slots: spec.slots, seats: spec.seats, orders,
  };
  if (spec.toppings && Object.keys(spec.toppings).length) level.toppings = { ...spec.toppings };
  if (spec.intro) level.intro = spec.intro;
  return { level, golden: labels };
}

/** A draft for the guided generator (guided.ts): orders, golden line and a first dealing. */
export function draftTaco(spec: TacoSpec, rng: Rng): Draft | null {
  const cand = buildTacoCandidate(spec, rng);
  if (!cand) return null;
  const items: FoodId[] = [];
  const ptr = cand.level.columns.map(() => 0);
  for (const c of cand.golden) items.push(cand.level.columns[c][ptr[c]++]);
  return {
    base: { ...cand.level, columns: [] }, items, labels: cand.golden, servedBefore: items.map(() => 0), thaw: items.map(() => 0),
    columns: spec.columns, depth: spec.depth,
  };
}

/** Generates a taco level with the guided generator: drafts hill-climbed toward the target. */
export function generateGuidedTaco(spec: TacoSpec, seed: number, opts: GuidedOptions = {}): TacoGenResult | null {
  const t = spec.target;
  const res = generateGuided({
    target: t,
    objective: (st) => tacoObjective(st, t),
    aim: (st) => tacoAim(st, t),
    draft: (rng) => draftTaco(spec, rng),
    frozen: spec.frozen,
    cloches: spec.cloches,
    accept: (lv) =>
      !(spec.essential === 'park' && winnableUnder(lv, { route: 'old' }, opts.budget)) &&
      !(spec.essential === 'scoop' && winnableUnder(lv, { absorb: false }, opts.budget)),
  }, seed, opts);
  if (!res) return null;
  return { ...res, level: { ...res.level, stats: roundStats(res.level.stats!) } };
}

export interface TacoGenOptions {
  /** candidate levels to build at most */
  attempts?: number;
  /** thinking-player games per measured candidate near the target (0 = skip) */
  thinkRuns?: number;
  budget?: number;
  /** stop after this many candidates landed in the band and keep the most central one (default 1) */
  keep?: number;
  /** stop early after this many milliseconds once a candidate exists (breaks determinism; runtime only) */
  timeBudgetMs?: number;
}

export interface TacoGenResult {
  level: LevelDef;
  /** distance from the target band (0 = on target) */
  dist: number;
  attempts: number;
  measured: number;
  ms: number;
}

/**
 * Generates a taco level for the spec: candidates are built and measured until `keep` of them land
 * in the target band; the one closest to the middle of the band is kept (else the closest one).
 */
export function generateTacoLevel(spec: TacoSpec, seed: number, opts: TacoGenOptions = {}): TacoGenResult | null {
  const t0 = performance.now();
  const rng = new Rng(seed);
  const attempts = opts.attempts ?? 200;
  const keep = opts.keep ?? 1;
  const t = spec.target;
  let best: { level: LevelDef; stats: LevelStats; dist: number; score: number } | null = null;
  let measured = 0;
  let onTarget = 0;
  let a = 0;
  for (; a < attempts; a++) {
    if (opts.timeBudgetMs !== undefined && best && performance.now() - t0 > opts.timeBudgetMs) break;
    const cand = buildTacoCandidate(spec, rng);
    if (!cand) continue;
    const lv = cand.level;
    if (spec.essential === 'park' && winnableUnder(lv, { route: 'old' }, opts.budget)) continue;
    if (spec.essential === 'scoop' && winnableUnder(lv, { absorb: false }, opts.budget)) continue;
    const tight = isTacoTight(lv, opts.budget);
    if (t.tight && !tight && best?.stats.tight) continue;
    const m = measureTaco(lv, { budget: opts.budget });
    if (!m) continue;
    measured++;
    m.stats.tight = tight;
    let dist = tacoObjective(m.stats, { ...t, thinking: undefined });
    // the thinking player is the slowest measurement: only ask it when the rest is about right
    if (opts.thinkRuns && t.thinking && dist < 0.3) m.stats.thinking = tacoThinking(lv, opts.thinkRuns, seed);
    dist = tacoObjective(m.stats, t);
    const score = dist > 0 ? 100 + dist : tacoAim(m.stats, t);
    if (!best || score < best.score) best = { level: { ...lv, solution: m.solution }, stats: m.stats, dist, score };
    if (dist === 0 && ++onTarget >= keep) {
      a++;
      break;
    }
  }
  if (!best) return null;
  return { level: { ...best.level, stats: roundStats(best.stats), seed }, dist: best.dist, attempts: a, measured, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------------------------------------
// The Taquería ladder: local levels 1–40 of world 2 (their campaign numbers come from shifts.ts)

export const TAQUERIA_WORLD = 2;
/** Local levels of the Taquería ladder. */
export const TAQUERIA_LEVELS = 40;

/** Every 5th local level is hard, every 10th a banquet (super hard), as in every kitchen. */
export function taqueriaTier(local: number): Tier {
  return local % 10 === 0 ? 'superhard' : local % 5 === 0 ? 'hard' : 'normal';
}

const C: DishId = 'taco_carnitas';
const P: DishId = 'taco_pollo';
const V: DishId = 'taco_veggie';
const F: DishId = 'taco_frijol';
const G: DishId = 'taco_verde';
const BC: DishId = 'burrito_carnitas';
const BP: DishId = 'burrito_pollo';
const BV: DishId = 'burrito_veggie';
const BG: DishId = 'burrito_verde';
const Q: DishId = 'quesadilla';
const T: DishId = 'tostada';
const E: DishId = 'enchiladas';
const CHEESE_TOP: Partial<Record<DishId, FoodId>> = { [C]: 'cheese' };
const TOPS: Partial<Record<DishId, FoodId>> = { [C]: 'cheese', [P]: 'lettuce' };
const TOPS_ALL: Partial<Record<DishId, FoodId>> = { [C]: 'cheese', [P]: 'lettuce', [V]: 'lettuce', [BV]: 'cheese' };

interface TacoRow {
  theme: string;
  cols: number;
  depth?: number;
  slots: number;
  seats: number;
  orders: [number, number];
  dishes: DishId[];
  must?: DishId[];
  nest?: number;
  hold?: number;
  toppings?: Partial<Record<DishId, FoodId>>;
  essential?: 'park' | 'scoop';
  /** frozen tiles and cloches (pantry.ts) */
  frozen?: number;
  cloches?: number;
  intro?: Intro;
  /** target overrides */
  t?: Target;
}

/**
 * Taquería row: `set` is exactly the level's dish set (every dish in it is ordered, a new dish
 * twice), so neighbouring levels never serve the same set.
 */
function tq(theme: string, cols: number, slots: number, orders: number, set: DishId[], extra: Partial<TacoRow> = {}): TacoRow {
  const lead = extra.intro && set.includes(extra.intro as DishId) ? [extra.intro as DishId] : [];
  return { theme, cols, slots, seats: 2, orders: [orders, orders], dishes: set, must: [...lead, ...set], ...extra };
}

/**
 * The ladder (after the research ladder, final.json): a tortilla catches fillings and salsa drops in
 * -> the NEWEST tortilla receives: park a half-made taco under a new one (4) -> the quesadilla, a
 * double helping of cheese (6) -> queued tickets and the scoop of loose fillings (7) -> frijol (8) ->
 * a 3-slot counter (11) -> burritos: a 4-filling wrap next to tortillas (13) -> enchiladas (16) ->
 * guacamole (taco verde, 21) -> the tostada (23) -> topping last (31). Every level mixes two or
 * three dishes (banquets more), and neighbouring levels never serve the same set.
 */
const TACO_LADDER: Record<number, TacoRow> = {
  1: tq('a tortilla catches the next three fillings', 2, 4, 2, [V, C], { seats: 1, intro: 'tortilla' }),
  2: tq('new: chicken taco — salsa drops into the tortilla', 3, 4, 3, [P, C], { intro: P }),
  3: tq('finish one taco before the next filling', 3, 4, 3, [P, V]),
  4: tq('park a half-made taco under a new tortilla', 3, 4, 3, [C, P], { nest: 2, essential: 'park', intro: 'park' }),
  5: tq('tortilla stack', 4, 4, 4, [C, P, V], { nest: 1 }),
  6: tq('new: quesadilla — chicken and double cheese', 3, 4, 3, [Q, V], { nest: 1, intro: Q }),
  7: tq('a taco for the queue; loose fillings get scooped in order', 4, 4, 4, [Q, C, P], { essential: 'scoop' }),
  8: tq('new: bean taco — beans, cheese and salsa', 4, 4, 4, [F, C], { nest: 1, intro: F }),
  9: tq('plan for the queue, under a cloche', 4, 4, 4, [F, P, V], { nest: 1, cloches: 2 }),
  10: tq('banquet: taco night', 5, 4, 5, [C, P, V, F, Q], { nest: 1 }),
  11: tq('small counter: three slots', 4, 3, 4, [Q, F, C], { intro: 'slots' }),
  12: tq('small counter', 4, 3, 4, [P, V, F], { nest: 1, cloches: 2 }),
  13: tq('new: burrito — a wrap holds four', 4, 4, 4, [BV, P], { intro: BV }),
  14: tq('which container is receiving? one is frozen', 4, 4, 4, [BV, C, Q], { nest: 1, frozen: 1 }),
  15: tq('three-slot rush', 5, 3, 5, [F, P, BV], { nest: 1, cloches: 2 }),
  16: tq('new: enchiladas — chicken, beans, cheese, salsa', 5, 4, 4, [E, V], { nest: 1, intro: E }),
  17: tq('tacos, a burrito and enchiladas', 5, 4, 5, [E, C, BV], { depth: 6, nest: 1, cloches: 2 }),
  18: tq('the carnitas burrito', 5, 4, 5, [BC, P, Q], { nest: 1, frozen: 1 }),
  19: tq('two wraps', 5, 4, 5, [BC, F, E], { depth: 6, nest: 1, cloches: 2 }),
  20: tq('banquet: burrito night', 6, 4, 6, [BV, E, P, V, C], { nest: 1, frozen: 1 }),
  21: tq('new: taco verde — guacamole: avocado + lime', 4, 4, 4, [G, P], { intro: G }),
  22: tq('salsa or guacamole', 5, 4, 5, [G, C, BV], { nest: 1, cloches: 2 }),
  23: tq('new: tostada — beans, lettuce, guacamole', 5, 4, 5, [T, F], { nest: 1, intro: T }),
  24: tq('the guacamole menu', 5, 4, 5, [T, G, Q], { nest: 1, frozen: 1 }),
  25: tq('beans for everyone', 5, 4, 5, [BC, T, P], { depth: 6, nest: 1, cloches: 2 }),
  26: tq('the chicken burrito', 5, 4, 5, [BP, V, E], { depth: 6, nest: 1, frozen: 1, cloches: 2 }),
  27: tq('the full menu, small counter', 5, 3, 5, [G, F, BC], { depth: 6, nest: 1, cloches: 2 }),
  28: tq('the full menu on ice', 5, 4, 5, [Q, T, BP], { nest: 1, frozen: 2 }),
  29: tq('the full menu, small counter', 5, 3, 5, [E, C, G], { depth: 6, nest: 1, cloches: 2 }),
  30: tq('banquet: fiesta', 6, 4, 6, [BG, T, Q, F, P, C], { nest: 1, cloches: 2, frozen: 1 }),
  31: tq('topping last: cheese goes on top', 4, 4, 4, [C, P], { toppings: CHEESE_TOP, intro: 'topping', must: [C, C, P] }),
  32: tq('topping last, under a cloche', 5, 4, 5, [P, C, BV], { toppings: TOPS, nest: 1, cloches: 2 }),
  33: tq('topping last on ice', 5, 4, 5, [F, Q, P], { toppings: TOPS, nest: 1, frozen: 1 }),
  34: tq('topping last, small counter', 5, 3, 5, [C, V, T], { toppings: TOPS, nest: 1, cloches: 2 }),
  35: tq('toppings and burritos', 5, 4, 5, [P, C, BV], { toppings: TOPS, nest: 1, cloches: 2, frozen: 1 }),
  36: tq('three guests: toppings everywhere', 6, 4, 6, [V, P, BV, C], { seats: 3, toppings: TOPS_ALL, nest: 1, frozen: 1 }),
  37: tq('three guests: topping last, full menu', 5, 4, 5, [G, E, P], { seats: 3, depth: 6, toppings: TOPS, nest: 1, cloches: 2 }),
  38: tq('topping last, small counter', 5, 3, 5, [F, C, BP], { depth: 6, toppings: TOPS, nest: 1, frozen: 1, cloches: 2 }),
  39: tq('three guests: toppings everywhere', 6, 4, 5, [V, BG, T], { seats: 3, toppings: TOPS_ALL, nest: 1, cloches: 2 }),
  40: tq('grand fiesta', 6, 4, 6, [P, C, F, BV, G, Q], { seats: 3, toppings: TOPS, nest: 1, cloches: 2, frozen: 1 }),
};

/**
 * Target band for the Taquería's local level, with the other kitchens' tier semantics. The fit
 * guard and the landing-slot rule remove every one-move blunder, so random play is stronger than in
 * the Trattoria: the teaching levels (1–5) keep their random-player bands, and from local 6 on the
 * planning bands (targets.ts) apply with a random-player cap 1.6 times the Trattoria's. Tightness is
 * recorded but not targeted (a 4-spot counter rarely is). Ice must matter, cloches must hide a
 * riddle, as in every kitchen.
 */
export function taqueriaTarget(local: number, tier: Tier, intro?: Intro, mech: { cloches?: number; frozen?: number } = {}): Target {
  const plan = planBands(tier, local, intro, 6, 1.6);
  const extra: Target = {};
  if (mech.frozen) extra.minIceCut = intro === 'frozen' ? 0.3 : 0.15;
  if (mech.cloches) extra.minRiddles = 1;
  // the tutorial (local 1) teaches; from local 2 the opening asks for a real decision (openingBands)
  if (local <= 1) return { random: [0.5, 1], minCritical: 0, reach: { 2: [0.6, 1] }, ...extra };
  if (local <= 4) return { random: [0.1, 1], minCritical: 1, ...plan, ...extra };
  if (local === 5) return { random: [0.03, 0.3], greedyLoses: true, minCritical: 3, maxTrap: 10, ...plan, ...extra };
  return { ...plan, maxTrap: 14, ...extra };
}

/** Generator spec of the Taquería's local level (1..40); `n` is its campaign level number. */
export function taqueriaSpec(local: number): TacoSpec {
  const row = TACO_LADDER[local];
  if (!row) throw new Error(`no Taquería spec for local level ${local}`);
  const tier = taqueriaTier(local);
  return {
    n: campaignLevel(TAQUERIA_WORLD, local),
    world: TAQUERIA_WORLD,
    local,
    tier,
    columns: row.cols,
    depth: row.depth ?? 5,
    slots: row.slots,
    seats: row.seats,
    orders: row.orders,
    dishes: row.dishes,
    must: row.must,
    items: [row.cols + 2, 30],
    holdBias: row.hold ?? 0.5,
    nestBias: row.nest ?? 0,
    toppings: row.toppings,
    frozen: row.frozen,
    cloches: row.cloches,
    essential: row.essential,
    intro: row.intro,
    theme: row.theme,
    target: { ...taqueriaTarget(local, tier, row.intro, row), ...row.t },
  };
}

/** The dish or mechanic the Taquería's local level introduces, if any. */
export function taqueriaIntro(local: number): Intro | undefined {
  return TACO_LADDER[local]?.intro;
}

/** Short label of what the Taquería's local level is about (build output and audit). */
export function taqueriaTheme(local: number): string {
  return TACO_LADDER[local]?.theme ?? '';
}

/**
 * Endless Taquería levels (after the campaign, see endlessSpec in progression.ts): five-column late
 * shapes with the late planning targets of the local level `like` (31–40) up to depth 3, so the
 * runtime generator stays fast; banquets use the hard shape with the banquet band.
 */
export function taqueriaEndlessSpec(n: number, like: number): TacoSpec {
  const tier = taqueriaTier(like);
  const cycle = [32, 33, 34, 38, 26, 27, 28, 29, 22, 24];
  const local = tier === 'normal' ? cycle[(n * 7) % cycle.length] : 35;
  const spec = taqueriaSpec(local);
  const full = taqueriaTarget(like, tier, undefined, spec);
  const reach: Target['reach'] = {};
  for (const [d, band] of Object.entries(full.reach ?? {})) if (Number(d) <= 3 && band) reach[Number(d)] = band;
  return {
    ...spec, n, local: undefined, tier, intro: undefined, essential: undefined, theme: 'endless', seats: 2,
    target: {
      reach, goal: full.goal, minForced: full.minForced, minDeep: full.minDeep, greedyLoses: full.greedyLoses, maxRandom: full.maxRandom,
      maxGuesses: full.maxGuesses,
    },
  };
}

/** Late Taquería rows the endless pool cycles through (normal tier). */
const POOL_ROWS = [22, 24, 26, 27, 28, 29, 32, 33, 34, 36, 37, 38, 39];

/**
 * A Taquería level of the pre-built endless pool (scripts/build-endless.ts): a late row at full size
 * with the full late targets of the local level `like` it plays like; `visit` alternates the hard
 * and banquet shapes, `step` picks another row (neighbouring dish sets stay apart).
 */
export function taqueriaPoolSpec(n: number, like: number, visit: number, step = 0): TacoSpec {
  const tier = taqueriaTier(like);
  const local = tier === 'superhard' ? (visit % 2 ? 30 : 40) : tier === 'hard' ? (visit % 2 ? 25 : 35) : POOL_ROWS[(n * 5 + step) % POOL_ROWS.length];
  const spec = taqueriaSpec(local);
  return {
    ...spec, n, local: undefined, tier, intro: undefined, essential: undefined, theme: 'endless pool',
    target: { ...taqueriaTarget(like, tier, undefined, spec) },
  };
}
