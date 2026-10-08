/**
 * How much a level makes you think: the planner profile, forced and deep decisions, and what the
 * cloches hide (a blind planner and a careful deducer). Works for every kitchen; the classic
 * measurements (random player, greedy, lookahead bot, critical decisions) are in metrics.ts.
 *
 * - Planner at depth d: the thinking player (metrics.ts, Thinker) looking exactly d moves ahead
 *   with its kitchen's position value; ties broken at random. Its win rates at d = 1..5 are the
 *   level's planner profile, the smallest d that wins at least half the games its planning depth.
 *   A level that the depth-2 planner wins doesn't ask you to think ahead.
 * - Forced decisions: moves along the solution where the greedy (obvious) move loses.
 * - Deep decisions: moves along the solution where some fatal move still leaves 3 or more moves
 *   to play before the kitchen jams, so you can't see it is fatal by trying a move or two. Exact
 *   (from the solver), independent of any heuristic.
 * - Cloches hide tiles until they reach the front of their column. The blind planner plans on a
 *   guess of what is underneath (any arrangement of the hidden items consistent with what it has
 *   seen: the pantry holds exactly the ordered dishes' parts, so the hidden multiset is known).
 *   The deducer takes, at every step, a move that keeps the level winnable in every arrangement
 *   still possible (exact solver per arrangement; arrangements that can't be won from the start
 *   are ruled out, since every level can be won). A step where no move is safe in all of them is a
 *   guess; a fair level needs none.
 */
import { BurgerRules } from './burger';
import { KitchenRules } from './kitchen';
import {
  alongLine, burgerHeuristic, greedyPlayout, greedyStep, kitchenHeuristic, naturalSolution, phaseRandom, requiredLookahead,
  stepsOf, Thinker, type Heuristic, type Step, type Stepper,
} from './metrics';
import { Rng } from './rng';
import { Solver, SolverBudgetError, WIN } from './solver';
import { TacoRules } from './taco';
import { tacoHeuristic } from './tacoHeuristic';
import type { FoodId } from './content';
import type { LevelDef, LevelStats } from './types';

/** Planner depths of the profile. */
export const PLAN_DEPTHS = [1, 2, 3, 4, 5];

type AnyLevel = Pick<LevelDef, 'menu' | 'columns' | 'slots' | 'seats' | 'orders' | 'lids' | 'rules' | 'tickets' | 'toppings' | 'frozen' | 'cloches'>;

/** Runs `f` with the level's rules and its kitchen's heuristic (any kitchen). */
export function withAnyRules<T>(level: AnyLevel, slots: number | undefined, f: <S>(rules: Stepper<S>, h: Heuristic<S>) => T): T {
  if (level.rules === 'taco') {
    const r = new TacoRules(level, slots);
    return f(r, tacoHeuristic(r));
  }
  if (level.rules === 'burger') {
    const r = new BurgerRules(level, slots);
    return f(r, burgerHeuristic(r));
  }
  const r = new KitchenRules(level, slots);
  return f(r, kitchenHeuristic(r));
}

export interface Profile {
  /** planner win rates at PLAN_DEPTHS */
  plan: number[];
  depth: number;
  forced: number;
  deep: number;
}

/** Planning depth of a planner profile: the smallest depth winning at least half the games (6 = none). */
export function planningDepth(plan: readonly number[]): number {
  const i = plan.findIndex((x) => x >= 0.5);
  return i < 0 ? PLAN_DEPTHS.length + 1 : PLAN_DEPTHS[i];
}

/** Forced and deep decisions along a winning line. */
export function lineDepth<S>(solver: Solver<S>, h: Heuristic<S>, line: number[], start: S = solver.rules.start()): { forced: number; deep: number } {
  let s = start;
  let forced = 0;
  let deep = 0;
  for (const m of line) {
    const steps = solver.successors(s);
    let fatal = false;
    let hidden = false;
    for (const [, n] of steps) {
      const v = solver.surv(n);
      if (v !== WIN) {
        fatal = true;
        if (v >= 3) hidden = true;
      }
    }
    if (fatal) {
      const g = greedyStep(h, s, steps);
      if (solver.surv(g[1]) !== WIN) forced++;
      if (hidden) deep++;
    }
    s = steps.find(([c]) => c === m)![1];
  }
  return { forced, deep };
}

/**
 * The second planner family: no kitchen knowledge at all. A position is worth its served dishes, the
 * items already used up (taken and no longer on the counter) and the columns it leaves open. Its
 * win rates are combined with the kitchen planner's (the better of the two counts), so a level
 * can't be "hard" only because one heuristic misjudges it.
 */
export function simpleHeuristic<S>(rules: Stepper<S>): Heuristic<S> {
  const served = (s: S): number => {
    if (rules instanceof TacoRules) return rules.served(s as never);
    return (s as unknown as { served: number }).served;
  };
  const occ = (s: S): number => {
    if (rules instanceof TacoRules || rules instanceof KitchenRules || rules instanceof BurgerRules) return rules.occupancy(s as never);
    let n = 0;
    for (const c of (s as unknown as { counts: number[] }).counts) n += c;
    return n;
  };
  const takes = (s: S): number => {
    let n = 0;
    for (const p of (s as unknown as { ptr: number[] }).ptr) n += p;
    return n;
  };
  return {
    priorities: (_s, steps) => steps.map(() => 0),
    value: (s) => 1000 * served(s) + 4 * (takes(s) - occ(s)) + 6 * rules.moves(s).length,
  };
}

/**
 * Win rate of the planners at each depth (`runs` games each): the better of the kitchen planner
 * (its kitchen's position value) and the simple planner (simpleHeuristic).
 */
export function plannerRates<S>(rules: Stepper<S>, h: Heuristic<S>, runs: number, seed: number, depths: number[] = PLAN_DEPTHS): number[] {
  const th = new Thinker(rules, h);
  const simple = new Thinker(rules, simpleHeuristic(rules));
  return depths.map((d) => Math.max(th.rate(runs, (seed + 7919 * d) >>> 0, [d]), simple.rate(runs, (seed + 6007 * d) >>> 0, [d])));
}

// ---------------------------------------------------------------------------------------------
// Cloches: arrangements of the hidden items

/** The hidden tiles of a level and the items under them. */
interface Hidden {
  /** [col, row] of each cloche */
  at: [number, number][];
  items: FoodId[];
}

function hiddenOf(level: AnyLevel): Hidden | null {
  const at = (level.cloches ?? []).filter(([c, r]) => r > 0 && r < (level.columns[c]?.length ?? 0));
  if (!at.length) return null;
  return { at, items: at.map(([c, r]) => level.columns[c][r]) };
}

/** The level with the hidden items placed as `items` (same order as hiddenOf().at). */
function arranged<L extends AnyLevel>(level: L, hid: Hidden, items: FoodId[]): L {
  const columns = level.columns.map((c) => c.slice());
  hid.at.forEach(([c, r], i) => (columns[c][r] = items[i]));
  return { ...level, columns };
}

/** Number of distinct arrangements of a multiset (capped). */
function arrangements(items: FoodId[], cap = 1e6): number {
  const counts = new Map<FoodId, number>();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  let n = 1;
  let k = 0;
  for (const c of counts.values()) {
    for (let i = 1; i <= c; i++) {
      k++;
      n = (n * k) / i;
      if (n > cap) return cap;
    }
  }
  return Math.round(n);
}

/** Every distinct arrangement of the free items over the free positions (lexicographic), up to `cap`. */
function allArrangements(items: FoodId[], cap: number): FoodId[][] {
  const sorted = items.slice().sort();
  const out: FoodId[][] = [];
  const used = new Array<boolean>(sorted.length).fill(false);
  const cur: FoodId[] = [];
  const rec = () => {
    if (out.length >= cap) return;
    if (cur.length === sorted.length) {
      out.push(cur.slice());
      return;
    }
    for (let i = 0; i < sorted.length; i++) {
      if (used[i] || (i > 0 && sorted[i] === sorted[i - 1] && !used[i - 1])) continue;
      used[i] = true;
      cur.push(sorted[i]);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
  return out;
}

/**
 * Arrangements of the hidden items consistent with what is known (`known[i]`: cloche i lifted, its
 * true item fixed). All of them when there are at most `cap`, else `cap` random ones; the true
 * arrangement is always included.
 */
function consistentArrangements(hid: Hidden, known: boolean[], rng: Rng, cap: number): FoodId[][] {
  const freeIdx = hid.at.map((_, i) => i).filter((i) => !known[i]);
  const freeItems = freeIdx.map((i) => hid.items[i]);
  const fill = (perm: FoodId[]) => {
    const out = hid.items.slice();
    freeIdx.forEach((i, j) => (out[i] = perm[j]));
    return out;
  };
  const truthKey = hid.items.join(',');
  let perms: FoodId[][];
  if (arrangements(freeItems) <= cap) perms = allArrangements(freeItems, cap).map(fill);
  else {
    const seen = new Set<string>([truthKey]);
    perms = [hid.items.slice()];
    for (let tries = 0; perms.length < cap && tries < cap * 20; tries++) {
      const p = fill(rng.shuffle(freeItems.slice()));
      const key = p.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        perms.push(p);
      }
    }
  }
  if (!perms.some((p) => p.join(',') === truthKey)) perms.push(hid.items.slice());
  return perms;
}

/** Which cloches are lifted at column pointers `ptr` (a cloche lifts when its tile reaches the front). */
function knownAt(hid: Hidden, ptr: readonly number[]): boolean[] {
  return hid.at.map(([c, r]) => ptr[c] >= r);
}

/** Pointers after a line of takes (every take advances one column). */
function ptrAfter(columns: number, line: readonly number[]): number[] {
  const ptr = new Array<number>(columns).fill(0);
  for (const m of line) ptr[m]++;
  return ptr;
}

interface World<S> {
  rules: Stepper<S>;
  h: Heuristic<S>;
  solver: Solver<S>;
  /** the kitchen planner and the simple planner */
  thinkers: [Thinker<S>, Thinker<S>];
  solvable: boolean | null;
}

/** One arrangement of the hidden items as a playable world (rules, solver, planner), memoized. */
class Worlds {
  private cache = new Map<string, World<unknown>>();

  constructor(
    readonly level: AnyLevel,
    readonly hid: Hidden,
    readonly budget: number,
  ) {}

  get(items: FoodId[]): World<unknown> {
    const key = items.join(',');
    let w = this.cache.get(key);
    if (!w) {
      w = withAnyRules(arranged(this.level, this.hid, items), undefined, (rules, h) => ({
        rules, h, solver: new Solver(rules, this.budget), thinkers: [new Thinker(rules, h), new Thinker(rules, simpleHeuristic(rules))], solvable: null,
      } as unknown as World<unknown>));
      this.cache.set(key, w);
    }
    return w;
  }

  /** Can this arrangement be won from the start? (false when too big to tell) */
  solvable(items: FoodId[]): boolean {
    const w = this.get(items);
    if (w.solvable === null) {
      try {
        w.solvable = w.solver.winnable();
      } catch (e) {
        if (!(e instanceof SolverBudgetError)) throw e;
        w.solvable = false;
      }
    }
    return w.solvable;
  }

  /** The state after a line of takes in this world (the taken tiles are lifted, so the line is legal). */
  replay(w: World<unknown>, line: readonly number[]): unknown {
    let s = w.rules.start();
    for (const m of line) s = w.rules.play(s, m);
    return s;
  }
}

/**
 * Win rate of the blind planners at each depth: before every move they pick one arrangement of the
 * still-hidden items consistent with what they have seen and plan as if that were the pantry (the
 * better of the kitchen planner and the simple planner, as in plannerRates).
 */
export function blindRates(level: AnyLevel, runs: number, seed: number, depths: number[] = PLAN_DEPTHS, budget = 400_000): number[] {
  const hid = hiddenOf(level);
  if (!hid) return withAnyRules(level, undefined, (r, h) => plannerRates(r, h, runs, seed, depths));
  const worlds = new Worlds(level, hid, budget);
  return withAnyRules(level, undefined, (rules) =>
    depths.map((d) => {
      let best = 0;
      for (const family of [0, 1] as const) {
        const rng = new Rng((seed + 104729 * d + 31 * family) >>> 0);
        let wins = 0;
        for (let g = 0; g < runs; g++) if (blindGame(rules, worlds, d, rng, family)) wins++;
        best = Math.max(best, runs ? wins / runs : 0);
      }
      return best;
    }),
  );
}

function blindGame<S>(rules: Stepper<S>, worlds: Worlds, depth: number, rng: Rng, family: 0 | 1): boolean {
  const hid = worlds.hid;
  let s = rules.start();
  const line: number[] = [];
  for (let guard = 0; guard <= rules.length + 1; guard++) {
    if (rules.isWin(s)) return true;
    const steps = stepsOf(rules, s);
    if (!steps.length) return false;
    const known = knownAt(hid, ptrAfter(worlds.level.columns.length, line));
    // a guess at the hidden items, consistent with what is known
    const free = hid.items.filter((_, i) => !known[i]);
    rng.shuffle(free);
    let j = 0;
    const guess = hid.items.map((x, i) => (known[i] ? x : free[j++]));
    const w = worlds.get(guess);
    const ws = worlds.replay(w, line);
    const wsteps = stepsOf(w.rules, ws);
    let best = steps[0];
    let bestV = -Infinity;
    for (const st of steps) {
      const wn = wsteps.find(([m]) => m === st[0]);
      const v = (wn ? w.thinkers[family].look(wn[1], depth - 1) : -1e12) + rng.next() * 0.5;
      if (v > bestV) {
        bestV = v;
        best = st;
      }
    }
    line.push(best[0]);
    s = best[1];
  }
  return rules.isWin(s);
}

export interface DeduceResult {
  win: boolean;
  /** steps where no move was safe in every arrangement still possible */
  guesses: number;
  /** steps where what lies under a cloche decides whether some move is safe (and reasoning finds a safe one) */
  riddles: number;
  /** arrangements considered at the start (after ruling out those that can't be won) */
  worlds: number;
}

/**
 * The careful deducer on a cloche level: at every step the move that keeps the level winnable in
 * the most arrangements still possible (every one, unless it must guess), greedy among equals.
 * Exhaustive over the arrangements when there are at most `cap`, else `cap` sampled ones.
 */
export function deduce(level: AnyLevel, seed = 1, cap = 40, budget = 400_000): DeduceResult {
  const hid = hiddenOf(level);
  if (!hid) return { win: true, guesses: 0, riddles: 0, worlds: 1 };
  const worlds = new Worlds(level, hid, budget);
  const rng = new Rng(seed);
  const pool = consistentArrangements(hid, hid.at.map(() => false), rng, cap).filter((p) => worlds.solvable(p));
  return withAnyRules(level, undefined, (rules, h) => {
    let s = rules.start();
    const line: number[] = [];
    let guesses = 0;
    let riddles = 0;
    for (let guard = 0; guard <= rules.length + 1; guard++) {
      if (rules.isWin(s)) return { win: true, guesses, riddles, worlds: pool.length };
      const steps = stepsOf(rules, s);
      if (!steps.length) return { win: false, guesses, riddles, worlds: pool.length };
      const known = knownAt(hid, ptrAfter(level.columns.length, line));
      const live = pool.filter((p) => p.every((x, i) => !known[i] || x === hid.items[i]));
      const safe = steps.map(() => 0);
      for (const p of live) {
        const w = worlds.get(p);
        const ws = worlds.replay(w, line);
        const wsteps = stepsOf(w.rules, ws);
        steps.forEach(([m], i) => {
          const wn = wsteps.find(([c]) => c === m);
          try {
            if (wn && w.solver.surv(wn[1]) === WIN) safe[i]++;
          } catch (e) {
            if (!(e instanceof SolverBudgetError)) throw e;
          }
        });
      }
      const top = Math.max(...safe);
      if (top < live.length) guesses++;
      else if (safe.some((x) => x > 0 && x < live.length)) riddles++;
      const best = steps.filter((_, i) => safe[i] === top);
      const [m, n] = greedyStep(h, s, best);
      line.push(m);
      s = n;
    }
    return { win: rules.isWin(s), guesses, riddles, worlds: pool.length };
  });
}

// ---------------------------------------------------------------------------------------------
// Whole-level measurement

export interface ProfileOptions {
  /** planner games per depth */
  runs?: number;
  seed?: number;
  /** planner depths to measure (default PLAN_DEPTHS) */
  depths?: number[];
  budget?: number;
}

/**
 * The planner profile and the forced / deep decisions of a level (blind planner on cloche levels),
 * plus the classic numbers (random player, greedy, lookahead bot, critical decisions). Null if the
 * level can't be won.
 */
export function measureDepth(level: AnyLevel, opts: ProfileOptions & { solution?: number[]; classic?: boolean } = {}): { stats: LevelStats; solution: number[] } | null {
  const runs = opts.runs ?? 32;
  const seed = opts.seed ?? 1;
  const depths = opts.depths ?? PLAN_DEPTHS;
  return withAnyRules(level, undefined, (rules, h) => {
    const solver = new Solver(rules, opts.budget);
    if (!solver.winnable()) return null;
    const solution = opts.solution ?? naturalSolution(solver, h)!;
    const line = alongLine(solver, solution);
    const { forced, deep } = lineDepth(solver, h, solution);
    const hidden = !!hiddenOf(level);
    const plan = hidden ? blindRates(level, runs, seed, depths, opts.budget) : plannerRates(rules, h, runs, seed, depths);
    const stats: LevelStats = {
      random: opts.classic === false ? 0 : solver.pRandom(),
      greedy: greedyPlayout(rules, h).win,
      lookahead: opts.classic === false ? 0 : requiredLookahead(solver, h),
      critical: line.critical,
      decisions: line.decisions,
      safeRatio: line.safeRatio,
      states: solver.states,
      phaseRandom: opts.classic === false ? undefined : phaseRandom(solver, solution),
      lateCritical: line.lateCritical,
      trapDepth: line.trapDepth,
      items: rules.length,
      plan,
      depth: depths === PLAN_DEPTHS ? planningDepth(plan) : undefined,
      forced,
      deep,
    };
    if (hidden) stats.sighted = plannerRates(rules, h, runs, seed, [3])[0];
    return { stats, solution };
  });
}

// ---------------------------------------------------------------------------------------------
// The goal-directed player and bottlenecks

/** Dishes served in a position (any kitchen). */
function servedOf<S>(rules: Stepper<S>, s: S): number {
  if (rules instanceof TacoRules) return rules.served(s as never);
  return (s as unknown as { served: number }).served;
}

export interface GoalOptions {
  /** moves the player plans ahead along its goal */
  depth: number;
  /** chance per decision to slip: take a plausible move (a wanted item or a dig) without checking it */
  slip: number;
  /** rows below the top a wanted item may lie for a dig to count as purposeful */
  dig?: number;
  /** search nodes per decision before settling for the best plan so far */
  nodes?: number;
}

/**
 * The goal-directed player: reasons backwards from the orders, as people do. At every decision it
 * considers only purposeful moves — taking an item a seated guest still needs (preps and chains
 * expanded to their raw parts), or digging toward one (a wanted item at most `dig` rows down) — and
 * plans along them up to `depth` moves ahead (also past the next serve: a serve that jams the
 * kitchen right after is no plan); plans are compared by the kitchen's position value (which
 * protects the counter: a free spot, no extra sauce, nothing nobody needs). A plan that jams the
 * kitchen is avoided. With probability
 * `slip` it takes a plausible move without checking it (the mistake model). Moves outside the
 * goal are considered only when no purposeful move exists.
 */
export class GoalPlayer<S> {
  private readonly cols: number[][];

  constructor(
    readonly rules: Stepper<S>,
    readonly h: Heuristic<S>,
    readonly o: GoalOptions,
  ) {
    this.cols = (rules as unknown as { cols: number[][] }).cols;
  }

  /** The purposeful moves among `steps` (all of them if none is). */
  purposeful(s: S, steps: Step<S>[]): Step<S>[] {
    if (!this.h.wanted) return steps;
    const want = this.h.wanted(s);
    const ptr = (s as unknown as { ptr: number[] }).ptr;
    const dig = this.o.dig ?? 2;
    const out = steps.filter(([m]) => {
      const col = this.cols[m];
      for (let r = ptr[m]; r < Math.min(col.length, ptr[m] + 1 + dig); r++) if (want[col[r]] > 0) return true;
      return false;
    });
    return out.length ? out : steps;
  }

  private search(s: S, d: number, goal: number, memo: Map<string, number>, budget: { n: number }): number {
    if (this.rules.isWin(s)) return 1e9;
    const key = d + '#' + this.rules.key(s);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const steps = stepsOf(this.rules, s);
    let v: number;
    if (!steps.length) v = -1e8 - 1000 * d;
    else if (d === 0 || --budget.n < 0) v = this.h.value(s) + (servedOf(this.rules, s) > goal ? 1 : 0);
    else {
      v = -Infinity;
      for (const [, n] of this.purposeful(s, steps)) {
        const x = this.search(n, d - 1, goal, memo, budget);
        if (x > v) v = x;
        if (v >= 1e9) break;
      }
    }
    memo.set(key, v);
    return v;
  }

  /** One game from the start: did it win? */
  play(rng: Rng, start: S = this.rules.start()): boolean {
    let s = start;
    for (let guard = 0; guard <= this.rules.length + 1; guard++) {
      if (this.rules.isWin(s)) return true;
      const steps = stepsOf(this.rules, s);
      if (!steps.length) return false;
      const options = this.purposeful(s, steps);
      let pick: Step<S>;
      if (options.length > 1 && rng.next() < this.o.slip) pick = options[rng.int(0, options.length - 1)];
      else {
        const goal = servedOf(this.rules, s);
        const memo = new Map<string, number>();
        const budget = { n: this.o.nodes ?? 4000 };
        const choose = (cands: Step<S>[]): [Step<S>, number] => {
          let p = cands[0];
          let best = -Infinity;
          for (const st of cands) {
            const v = this.search(st[1], this.o.depth - 1, goal, memo, budget) + rng.next() * 0.5;
            if (v > best) {
              best = v;
              p = st;
            }
          }
          return [p, best];
        };
        let best: number;
        [pick, best] = choose(options);
        // every purposeful plan jams the kitchen: look at the other moves too
        if (best < -1e7 && options.length < steps.length) [pick] = choose(steps);
      }
      s = pick[1];
    }
    return this.rules.isWin(s);
  }

  rate(runs: number, seed: number): number {
    const rng = new Rng(seed);
    let wins = 0;
    for (let i = 0; i < runs; i++) if (this.play(rng)) wins++;
    return runs ? wins / runs : 0;
  }
}

/** The strong goal-directed player of the targets (plans 4 moves along its goal, slips 5% of the time). */
export const STRONG: GoalOptions = { depth: 4, slip: 0.05 };
/** The careful one of the fairness check (plans 6 moves along its goal, never slips). */
export const CAREFUL: GoalOptions = { depth: 6, slip: 0 };

/** Win rate of the goal-directed player on a level (any kitchen). */
export function goalRate(level: AnyLevel, o: GoalOptions, runs: number, seed: number): number {
  return withAnyRules(level, undefined, (r, h) => new GoalPlayer(r, h, o).rate(runs, seed));
}

/**
 * Bottlenecks along winning lines: `samples` winning lines drawn uniformly (each winning line as
 * likely as any other); a position where exactly one of several legal moves keeps the level winnable
 * scores 1 + the moves a wrong choice stays hidden (playable before the kitchen jams, at most 9).
 * Returns the mean score per line and the mean number of such positions.
 */
export function bottlenecks<S>(solver: Solver<S>, samples: number, seed: number): { score: number; narrow: number } {
  const rng = new Rng(seed);
  let score = 0;
  let narrow = 0;
  for (let k = 0; k < samples; k++) {
    let s = solver.rules.start();
    for (let guard = 0; guard <= solver.rules.length + 1 && !solver.rules.isWin(s); guard++) {
      const steps = solver.successors(s);
      const wins = steps.map(([, n]) => (solver.surv(n) === WIN ? solver.countWins(n) : 0));
      const safe = wins.filter((w) => w > 0).length;
      if (safe === 1 && steps.length > 1) {
        let hidden = 0;
        for (const [, n] of steps) {
          const v = solver.surv(n);
          if (v !== WIN) hidden = Math.max(hidden, v);
        }
        score += 1 + Math.min(9, hidden);
        narrow++;
      }
      const total = wins.reduce((a, b) => a + b, 0);
      if (!total) break;
      let x = rng.next() * total;
      let i = 0;
      while (i < wins.length - 1 && (x -= wins[i]) > 0) i++;
      while (wins[i] === 0) i++;
      s = steps[i][1];
    }
  }
  return { score: samples ? score / samples : 0, narrow: samples ? narrow / samples : 0 };
}
