/**
 * Simulated players and difficulty measurements ("difficulty is measured, not guessed").
 *
 * The players and measurements are generic: they work on any `Rules<S>` with the exact `Solver<S>`.
 * Only the heuristic — which move looks good to a greedy player, and how promising a position
 * looks to a player who can't see further — is specific to a world (`kitchenHeuristic` for the
 * Trattoria, `burgerHeuristic` for the Burger Joint); `withRules` picks both from a level.
 *
 * Players
 * - random: taps a uniformly random legal column (exact probability from the solver).
 * - greedy: takes a move that combines at once (prep or serve), else an item a seated guest still
 *   needs, else the leftmost column. Deterministic.
 * - lookahead bot k: the greedy player who also avoids moves after which fewer than k moves can
 *   still be played (it "sees" k moves deep for getting stuck). The smallest k that wins is the
 *   level's required lookahead.
 * - thinking player: plans 2–3 moves ahead with a position value (served dishes, progress on the
 *   seated guests, free slots, never an extra sauce); ties are broken at random, so it is sampled.
 */
import { BurgerRules, type BState } from './burger';
import { KitchenRules, type KState, type Rules } from './kitchen';
import { Rng } from './rng';
import { Solver, WIN } from './solver';
import type { LevelDef, LevelStats } from './types';

/** A legal move and the position it leads to. */
export type Step<S> = [number, S];

export type Stepper<S> = Rules<S> & { successors?(s: S): Step<S>[] };

export function stepsOf<S>(rules: Stepper<S>, s: S): Step<S>[] {
  if (rules.successors) return rules.successors(s);
  return rules.moves(s).map((m) => [m, rules.play(s, m)] as Step<S>);
}

/** World-specific knowledge of the simulated players. */
export interface Heuristic<S> {
  /** Greedy priority of each step from `s` (higher first; ties go to the earlier step = leftmost column). */
  priorities(s: S, steps: Step<S>[]): number[];
  /** How promising a position looks without searching further (higher is better). */
  value(s: S): number;
}

/** The greedy choice among `steps` (non-empty). */
export function greedyStep<S>(h: Heuristic<S>, s: S, steps: Step<S>[]): Step<S> {
  const p = h.priorities(s, steps);
  let best = 0;
  for (let i = 1; i < steps.length; i++) if (p[i] > p[best]) best = i;
  return steps[best];
}

export type Policy<S> = (s: S, steps: Step<S>[]) => Step<S>;

export interface Playout {
  win: boolean;
  /** moves played */
  line: number[];
}

/** Plays `policy` until a win or until stuck. */
export function playPolicy<S>(rules: Stepper<S>, policy: Policy<S>, start: S = rules.start(), solver?: Solver<S>): Playout {
  let s = start;
  const line: number[] = [];
  for (let guard = 0; guard <= rules.length + 1; guard++) {
    if (rules.isWin(s)) return { win: true, line };
    const steps = solver ? solver.successors(s) : stepsOf(rules, s);
    if (!steps.length) return { win: false, line };
    const [m, n] = policy(s, steps);
    line.push(m);
    s = n;
  }
  return { win: rules.isWin(s), line };
}

export function greedyPlayout<S>(rules: Stepper<S>, h: Heuristic<S>, start?: S): Playout {
  return playPolicy(rules, (s, st) => greedyStep(h, s, st), start);
}

/** Lookahead bot k: greedy among the moves after which at least k more moves can be played. */
export function botPlayout<S>(solver: Solver<S>, h: Heuristic<S>, k: number, start?: S): Playout {
  return playPolicy(
    solver.rules,
    (s, st) => {
      const ok = st.filter(([, n]) => solver.surv(n) >= k);
      return greedyStep(h, s, ok.length ? ok : st);
    },
    start,
    solver,
  );
}

/**
 * Smallest k for which the lookahead bot wins (0 = the greedy player wins), or -1 if the level
 * can't be won. Bounded by the item count: bot(length) only ever takes winning moves.
 */
export function requiredLookahead<S>(solver: Solver<S>, h: Heuristic<S>, start: S = solver.rules.start()): number {
  if (!solver.winnable(start)) return -1;
  for (let k = 0; k <= solver.rules.length + 1; k++) if (botPlayout(solver, h, k, start).win) return k;
  return -1;
}

/**
 * A winning line as a careful player would play it: only moves that keep the level winnable,
 * greedy priority among them. This is the stored solution (and what a hint suggests).
 */
export function naturalSolution<S>(solver: Solver<S>, h: Heuristic<S>, start: S = solver.rules.start()): number[] | null {
  if (!solver.winnable(start)) return null;
  const res = playPolicy(solver.rules, (s, st) => greedyStep(h, s, st.filter(([, n]) => solver.surv(n) === WIN)), start, solver);
  return res.win ? res.line : null;
}

export interface LineReport {
  /** moves where some legal move loses */
  critical: number;
  /** moves with more than one legal choice */
  decisions: number;
  /** critical moves after the first third of the line (the thinking must not end early) */
  lateCritical: number;
  /** share of legal moves that keep the level winnable, averaged over the moves */
  safeRatio: number;
  /** most moves a player can still make after a fatal move before getting stuck */
  trapDepth: number;
  /** average of the same over every fatal option along the line */
  trapMean: number;
  /** fatal options along the line */
  fatal: number;
}

/** Decisions along a (winning) line: critical moves, safe-move ratio and how deep the traps are. */
export function alongLine<S>(solver: Solver<S>, line: number[], start: S = solver.rules.start()): LineReport {
  let s = start;
  let critical = 0;
  let decisions = 0;
  let lateCritical = 0;
  let ratio = 0;
  let trapDepth = 0;
  let trapSum = 0;
  let fatal = 0;
  const third = Math.floor(line.length / 3);
  line.forEach((m, i) => {
    const steps = solver.successors(s);
    let safe = 0;
    let next: S | null = null;
    for (const [c, n] of steps) {
      const v = solver.surv(n);
      if (v === WIN) safe++;
      else {
        fatal++;
        trapSum += v;
        if (v > trapDepth) trapDepth = v;
      }
      if (c === m) next = n;
    }
    if (next === null) throw new Error(`illegal move ${m} at step ${i}`);
    if (steps.length > 1) decisions++;
    if (safe < steps.length) {
      critical++;
      if (i >= third) lateCritical++;
    }
    ratio += steps.length ? safe / steps.length : 1;
    s = next;
  });
  return {
    critical,
    decisions,
    lateCritical,
    safeRatio: line.length ? ratio / line.length : 1,
    trapDepth,
    trapMean: fatal ? trapSum / fatal : 0,
    fatal,
  };
}

/** Exact random-player win probability from `frac` of the way along the line. */
export function phaseRandom<S>(solver: Solver<S>, line: number[], frac = 1 / 3, start: S = solver.rules.start()): number {
  let s = start;
  const upto = Math.floor(line.length * frac);
  for (let i = 0; i < upto; i++) s = solver.rules.play(s, line[i]);
  return solver.pRandom(s);
}

const THINK_WIN = 1e9;
const THINK_STUCK = -1e8;

/**
 * The thinking player's search: the best value reachable within `d` more moves. Values are
 * deterministic, so one memo serves every run on the same level.
 */
export class Thinker<S> {
  private memo = new Map<string, number>();

  constructor(
    readonly rules: Stepper<S>,
    readonly h: Heuristic<S>,
  ) {}

  look(s: S, d: number): number {
    if (this.rules.isWin(s)) return THINK_WIN;
    const key = d + '#' + this.rules.key(s);
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    const steps = stepsOf(this.rules, s);
    let v: number;
    // A player looking at a position sees whether it is stuck; being stuck later is less bad.
    if (!steps.length) v = THINK_STUCK - 1000 * d;
    else if (d === 0) v = this.h.value(s);
    else {
      v = -Infinity;
      for (const [, n] of steps) {
        const x = this.look(n, d - 1);
        if (x > v) v = x;
        if (v >= THINK_WIN) break;
      }
    }
    this.memo.set(key, v);
    return v;
  }

  /** One game; `depth` = moves planned ahead (the move itself included). */
  play(depth: number, rng: Rng, start: S = this.rules.start()): Playout {
    return playPolicy(this.rules, (_s, steps) => {
      let best = steps[0];
      let bestV = -Infinity;
      for (const st of steps) {
        const v = this.look(st[1], depth - 1) + rng.next() * 0.5;
        if (v > bestV) {
          bestV = v;
          best = st;
        }
      }
      return best;
    }, start);
  }

  /** Win rate over `runs` games, planning depths taken in turn from `depths`. */
  rate(runs: number, seed: number, depths: number[] = [2, 3], start?: S): number {
    const rng = new Rng(seed);
    let wins = 0;
    for (let i = 0; i < runs; i++) if (this.play(depths[i % depths.length], rng, start).win) wins++;
    return runs ? wins / runs : 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Kitchen heuristic

/**
 * Greedy priorities and position values for the kitchen rules.
 * - priority 2: the move preps or serves at once; 1: a seated guest still needs the item (counter
 *   items count, preps expanded to their raw parts); 0: anything else.
 * - value: 1000 per served dish, +10 per counter item (in raw parts) a seated guest needs, +3 per
 *   item the next queued guests need, −6 per occupied slot, and a large penalty for a prep nobody
 *   can use any more (an extra sauce leaves a soup without its lone tomato).
 */
export function kitchenHeuristic(r: KitchenRules): Heuristic<KState> {
  const k = r.k;
  const n = k.items.length;
  const dishRaw = k.dishes.map((_, d) => k.rawParts(d));
  const prepOuts = k.preps.map((p) => p.out);
  // remaining demand of each prep product from queue position i on (seated guests not included)
  const queued: number[][] = [];
  for (let i = r.orders.length; i >= 0; i--) {
    const row = new Array<number>(n).fill(0);
    if (i < r.orders.length) {
      const next = queued[0];
      const need = k.need[r.orders[i]];
      for (let j = 0; j < n; j++) row[j] = next[j] + need[j];
    }
    queued.unshift(row);
  }
  const dem = new Array<number>(n).fill(0);
  const have = new Array<number>(n).fill(0);

  const deficit = (s: KState): number[] => {
    dem.fill(0);
    for (const d of s.seats) if (d >= 0) for (const x of dishRaw[d]) dem[x]++;
    for (let i = 0; i < n; i++) {
      const c = s.counts[i];
      if (c) for (const x of k.rawOf[i]) dem[x] -= c;
    }
    return dem;
  };

  return {
    priorities(s, steps) {
      const occ = r.occupancy(s);
      let def: number[] | null = null;
      return steps.map(([m, nx]) => {
        if (nx.served > s.served || r.occupancy(nx) < occ + 1) return 2;
        def ??= deficit(s);
        return def[r.top(s, m)] > 0 ? 1 : 0;
      });
    },
    value(s) {
      let v = 1000 * s.served;
      dem.fill(0);
      have.fill(0);
      let occ = 0;
      for (const d of s.seats) if (d >= 0) for (const x of dishRaw[d]) dem[x]++;
      for (let i = 0; i < n; i++) {
        const c = s.counts[i];
        if (!c) continue;
        occ += c;
        for (const x of k.rawOf[i]) have[x] += c;
      }
      let useful = 0;
      for (let x = 0; x < n; x++) {
        const u = Math.min(have[x], dem[x]);
        useful += u;
        have[x] -= u;
      }
      // what is left on the counter may be for the next guests in the queue
      let later = 0;
      const upto = Math.min(r.orders.length, s.next + r.nseats);
      for (let i = s.next; i < upto; i++) {
        for (const x of dishRaw[r.orders[i]]) {
          if (have[x] > 0) {
            have[x]--;
            later++;
          }
        }
      }
      v += 10 * useful + 3 * later - 6 * occ;
      const rest = queued[Math.min(s.next, r.orders.length)];
      for (const p of prepOuts) {
        if (!s.counts[p]) continue;
        let want = rest[p];
        for (const d of s.seats) if (d >= 0) want += k.need[d][p];
        if (s.counts[p] > want) v -= 50000;
      }
      return v;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Burger heuristic

/**
 * Greedy priorities and position values for the Burger Joint rules.
 * - priority: a take that goes straight onto a plate first; otherwise park the item needed
 *   soonest (layers to go on a plate, or 6 per queued ticket ahead of it); ties go leftmost.
 * - value: 1000 per served burger, +30 per layer on the plates, −10 per parked item and −2 per
 *   layer a parked item still has to wait (capped at 12).
 */
export function burgerHeuristic(r: BurgerRules): Heuristic<BState> {
  const T = r.tickets;
  /** layers until item `it` is wanted: on a plate (layers to go) or in the queue (6 per ticket) */
  const needDistance = (s: BState, it: number): number => {
    let best = 99;
    for (let p = 0; p < s.plate.length; p++) {
      const t = s.plate[p];
      if (t < 0) continue;
      const tk = T[t];
      for (let j = s.done[p]; j < tk.length; j++) {
        if (tk[j] === it) {
          best = Math.min(best, j - s.done[p]);
          break;
        }
      }
    }
    for (let q = s.next, off = 6; q < T.length && off < best; q++, off += 6) {
      const j = T[q].indexOf(it);
      if (j >= 0) {
        best = Math.min(best, off + j);
        break;
      }
    }
    return best;
  };

  return {
    priorities(s, steps) {
      return steps.map(([m]) => {
        const it = r.cols[m][s.ptr[m]];
        return r.target(s, it) >= 0 ? 1000 : 100 - Math.min(99, needDistance(s, it));
      });
    },
    value(s) {
      let v = 1000 * s.served;
      for (let p = 0; p < s.plate.length; p++) if (s.plate[p] >= 0) v += 30 * s.done[p];
      for (let it = 0; it < s.counts.length; it++) {
        const c = s.counts[it];
        if (c) v -= c * (10 + 2 * Math.min(12, needDistance(s, it)));
      }
      return v;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Whole-level measurement

export interface MeasureOptions {
  /** thinking-player games (0 = skip) */
  thinkRuns?: number;
  thinkDepths?: number[];
  seed?: number;
  /** also check whether the level can be won with one slot fewer */
  tight?: boolean;
  /** solution to measure along (default: the natural solution) */
  solution?: number[];
  /** solver state budget */
  budget?: number;
  /** lidded levels: also measure how many winning lines the lids rule out (default true) */
  lidCut?: boolean;
}

export interface Measured {
  stats: LevelStats;
  solution: number[];
}

/** What the measurements need of a level, for either kitchen's rules. */
export type Playable = Pick<LevelDef, 'menu' | 'columns' | 'slots' | 'seats' | 'orders' | 'lids' | 'rules' | 'tickets'>;

/**
 * Runs `f` with the level's rules (Trattoria combos or Burger Joint stacks) and heuristic. Other
 * kitchens bring their own rules and heuristic to the generic players above.
 */
export function withRules<T>(level: Playable, slots: number | undefined, f: <S>(rules: Stepper<S>, h: Heuristic<S>) => T): T {
  if (level.rules && level.rules !== 'combo' && level.rules !== 'burger') throw new Error(`no heuristic for ${level.rules} kitchens`);
  if (level.rules === 'burger') {
    const r = new BurgerRules(level, slots);
    return f(r, burgerHeuristic(r));
  }
  const r = new KitchenRules(level, slots);
  return f(r, kitchenHeuristic(r));
}

/** Is the level unwinnable with one counter slot fewer? */
export function isTight(level: Playable, budget?: number): boolean {
  if (level.slots <= 0) return true;
  if (level.rules !== 'burger' && level.slots <= 1) return true;
  return withRules(level, level.slots - 1, (r) => !new Solver(r, budget).winnable());
}

/** Every difficulty number of a level (null if it can't be won). */
export function measureLevel(level: Playable, opts: MeasureOptions = {}): Measured | null {
  return withRules(level, undefined, (rules, h) => {
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
    if (opts.thinkRuns) stats.thinking = new Thinker(rules, h).rate(opts.thinkRuns, opts.seed ?? 1, opts.thinkDepths);
    if (opts.tight) stats.tight = isTight(level, opts.budget);
    if (level.lids?.some((x) => x > 0) && opts.lidCut !== false) {
      const open = withRules({ ...level, lids: undefined }, undefined, (r) => new Solver(r, opts.budget).countWins());
      stats.lidCut = open > 0 ? 1 - solver.countWins() / open : 0;
    }
    return { stats, solution };
  });
}

/** Share of the winning lines of the lid-free level that the lids rule out (0 = the lids don't matter). */
export function lidCut(level: Playable, budget?: number): number {
  const count = (lv: Playable) => withRules(lv, undefined, (r) => new Solver(r, budget).countWins());
  const open = count({ ...level, lids: undefined });
  return open > 0 ? 1 - count(level) / open : 0;
}

/** Win rate of the thinking player (planning depths 2 and 3 in turn). */
export function thinkingRate(level: Playable, runs: number, seed: number): number {
  return withRules(level, undefined, (r, h) => new Thinker(r, h).rate(runs, seed ^ 0x2545f491, [2, 3]));
}

/** Rounded copy for storage. */
export function roundStats(s: LevelStats): LevelStats {
  const r = (v: number, d = 4) => +v.toFixed(d);
  const out: LevelStats = { ...s, random: r(s.random, 5), safeRatio: r(s.safeRatio, 3) };
  if (s.phaseRandom !== undefined) out.phaseRandom = r(s.phaseRandom, 5);
  if (s.thinking !== undefined) out.thinking = r(s.thinking, 3);
  if (s.lidCut !== undefined) out.lidCut = r(s.lidCut, 3);
  if (s.plan) out.plan = s.plan.map((x) => r(x, 3));
  if (s.sighted !== undefined) out.sighted = r(s.sighted, 3);
  if (s.iceCut !== undefined) out.iceCut = r(s.iceCut, 3);
  return out;
}
