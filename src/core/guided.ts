/**
 * The guided generator: instead of dealing random levels and keeping the lucky ones, it searches.
 *
 * Every kitchen first builds a DRAFT: a golden line (a winning take order of item types under the
 * exact rules) and a labelling that deals the golden line into columns. Any labelling keeps the
 * golden line legal, because the items are dealt in its order; lidded columns only receive items
 * the golden line takes after their lid opens, and a frozen tile only thaws by the time the golden
 * line takes it. So the level is solvable by construction, whatever the search does to it.
 *
 * The search is a hill climb over the draft: swap two tiles between columns, move a tile to another
 * column (a different skyline) or move the ice to another tile, and keep a change when the level
 * gets no further from its target. The score is the measured planner profile (measure.ts: a
 * planning player looking 1–5 moves ahead must fail at shallow depths and win at the target depth),
 * the forced and deep decisions along the solution, and the usual constraints (tight counter,
 * greedy loses). Cloches go on last, on the finished layout: a few placements are tried and the one
 * that hides the most from a shallow planner while a careful deducer never has to guess is kept.
 *
 * Everything is deterministic for a seed (unless a time budget stops the search early).
 */
import type { FoodId } from './content';
import { isTight } from './metrics';
import {
  bottlenecks, CAREFUL, deduce, GoalPlayer, lineDepth, measureDepth, plannerRates, PLAN_DEPTHS, planningDepth, STRONG, withAnyRules,
} from './measure';
import { alongLine, naturalSolution, greedyPlayout } from './metrics';
import { Rng } from './rng';
import { Solver, SolverBudgetError } from './solver';
import { TacoRules } from './taco';
import type { LevelDef, LevelStats } from './types';

/** A level under construction: its golden line and how it is dealt. */
export interface Draft {
  /** the level without columns / frozen / cloches (they come from the draft) */
  base: LevelDef;
  /** golden line: items in take order */
  items: FoodId[];
  /** column of each golden take (the i-th item goes to the bottom of column labels[i] so far) */
  labels: number[];
  /** dishes served before each golden take (lids) */
  servedBefore: number[];
  /** per golden take: the take count its ice thaws at (0 = not frozen) */
  thaw: number[];
  columns: number;
  /** tallest column allowed */
  depth: number;
}

/** Accepted ranges of the measured difficulty (see generator.ts Target for the classic fields). */
export interface PlanTarget {
  /**
   * Planner bands: reach(d) = the best win rate of the planners looking at most d moves ahead
   * (a player who can look d moves ahead can also look fewer).
   */
  reach?: Partial<Record<number, [number, number]>>;
  minForced?: number;
  minDeep?: number;
  greedyLoses?: boolean;
  tight?: boolean;
  /** cloche levels: steps where the deducer must guess, at most (default 0) */
  maxGuesses?: number;
  /** frozen levels: the ice must rule out at least this share of the winning lines */
  minIceCut?: number;
  /** cloche levels: decisions where what lies under a cloche decides whether a move is safe, at least */
  minRiddles?: number;
  /**
   * the random player's win chance, at most: a heuristic-free check that a level isn't hard only
   * because the planners misjudge it
   */
  maxRandom?: number;
  /** win rate bands of the strong goal-directed player (a strong human's first try) and the careful one (fairness) */
  goal?: [number, number];
  careful?: [number, number];
  /** bottleneck score along the winning lines, at least */
  minBottleneck?: number;
}

/** Best win rate of the planners looking at most d moves ahead. */
export function reachOf(plan: readonly number[] | undefined, d: number): number {
  if (!plan) return 0;
  let best = 0;
  for (let i = 0; i < Math.min(d, plan.length); i++) best = Math.max(best, plan[i]);
  return best;
}

const linBand = (v: number, band: [number, number]): number => (v < band[0] ? band[0] - v : v > band[1] ? v - band[1] : 0);

/** Distance of the measured stats from the planning part of a target (0 = on target). */
export function planObjective(st: LevelStats, t: PlanTarget): number {
  let v = 0;
  if (t.reach) for (const [d, band] of Object.entries(t.reach)) if (band) v += 1.5 * linBand(reachOf(st.plan, Number(d)), band);
  if (t.minForced) v += 0.1 * Math.max(0, t.minForced - (st.forced ?? 0));
  if (t.minDeep) v += 0.1 * Math.max(0, t.minDeep - (st.deep ?? 0));
  if (t.greedyLoses && st.greedy) v += 0.4;
  if (t.tight && st.tight === false) v += 0.6;
  if (st.guesses !== undefined) v += 1 * Math.max(0, st.guesses - (t.maxGuesses ?? 0));
  if (t.minIceCut !== undefined) v += Math.max(0, t.minIceCut - (st.iceCut ?? 0));
  if (t.minRiddles && st.riddles !== undefined) v += 0.3 * Math.max(0, t.minRiddles - st.riddles);
  if (t.maxRandom !== undefined && st.random > t.maxRandom) v += 1.5 * Math.log10(st.random / t.maxRandom);
  if (t.goal) v += 2 * linBand(st.goal ?? 0, t.goal);
  if (t.careful) v += 2 * linBand(st.careful ?? 0, t.careful);
  if (t.minBottleneck) v += 0.08 * Math.max(0, t.minBottleneck - (st.bottleneck ?? 0));
  return v;
}

/** How far the planner profile is from the middle of its bands (choosing among on-target levels). */
export function planAim(st: LevelStats, t: PlanTarget): number {
  let d = 0;
  if (t.reach) for (const [k, band] of Object.entries(t.reach)) if (band) d += 0.5 * Math.abs(reachOf(st.plan, Number(k)) - (band[0] + band[1]) / 2);
  if (t.goal && st.goal !== undefined) d += Math.abs(st.goal - (t.goal[0] + t.goal[1]) / 2);
  if (t.careful && st.careful !== undefined) d += 0.5 * Math.abs(st.careful - (t.careful[0] + t.careful[1]) / 2);
  return d;
}

// ---------------------------------------------------------------------------------------------
// Drafts -> levels

/** The level a draft deals (columns top first, frozen tiles at their dealt positions). */
export function levelOf(d: Draft): LevelDef {
  const columns: FoodId[][] = Array.from({ length: d.columns }, () => []);
  const frozen: [number, number, number][] = [];
  d.items.forEach((it, i) => {
    const c = d.labels[i];
    if (d.thaw[i] > 0) frozen.push([c, columns[c].length, d.thaw[i]]);
    columns[c].push(it);
  });
  const lv: LevelDef = { ...d.base, columns };
  delete lv.frozen;
  delete lv.cloches;
  if (frozen.length) lv.frozen = frozen;
  return lv;
}

/** Earliest golden take that may be frozen, and the smallest thaw count (a short freeze isn't worth the ice). */
const ICE_FROM = 5;
const ICE_MIN = 4;

/** Puts `count` frozen tiles on golden takes from the 6th on; each thaws 0–2 takes before the golden line needs it. */
export function freeze(d: Draft, count: number, rng: Rng): void {
  d.thaw.fill(0);
  const cand = rng.shuffle([...d.items.keys()].filter((i) => i >= ICE_FROM));
  for (const i of cand.slice(0, count)) d.thaw[i] = Math.max(ICE_MIN, i - rng.int(0, 2));
}

function heights(d: Draft): number[] {
  const h = new Array<number>(d.columns).fill(0);
  for (const c of d.labels) h[c]++;
  return h;
}

/** May golden take i go to column c (lids: only takes after the lid opens)? */
function allowed(d: Draft, i: number, c: number): boolean {
  const lid = d.base.lids?.[c] ?? 0;
  return !lid || d.servedBefore[i] >= lid;
}

/** One random change of the draft (in place); returns an undo function, or null if nothing changed. */
function mutate(d: Draft, rng: Rng, minHeight: number): (() => void) | null {
  const n = d.labels.length;
  const roll = rng.next();
  if (roll < 0.6) {
    // swap two tiles between columns
    const i = rng.int(0, n - 1);
    const j = rng.int(0, n - 1);
    const a = d.labels[i];
    const b = d.labels[j];
    if (a === b || !allowed(d, i, b) || !allowed(d, j, a)) return null;
    d.labels[i] = b;
    d.labels[j] = a;
    return () => {
      d.labels[i] = a;
      d.labels[j] = b;
    };
  }
  if (roll < 0.9 || !d.thaw.some((x) => x > 0)) {
    // move a tile to another column: a new skyline
    const i = rng.int(0, n - 1);
    const a = d.labels[i];
    const b = rng.int(0, d.columns - 1);
    const h = heights(d);
    if (a === b || h[a] <= minHeight || h[b] >= d.depth || !allowed(d, i, b)) return null;
    d.labels[i] = b;
    return () => {
      d.labels[i] = a;
    };
  }
  // move the ice to another tile
  const from = rng.pick([...d.thaw.keys()].filter((i) => d.thaw[i] > 0));
  const to = rng.int(ICE_FROM, n - 1);
  if (d.thaw[to] > 0) return null;
  const old = d.thaw[from];
  d.thaw[from] = 0;
  d.thaw[to] = Math.max(ICE_MIN, to - rng.int(0, 2));
  return () => {
    d.thaw[to] = 0;
    d.thaw[from] = old;
  };
}

// ---------------------------------------------------------------------------------------------
// Scoring

export interface ScoreOptions {
  /** planner games per depth */
  runs: number;
  seed: number;
  /** planner depths to measure (the target's bands need the ones up to their largest depth) */
  depths?: number[];
  budget?: number;
}

/** What the quick stats must cover besides the planning target. */
type Needs = PlanTarget & { random?: [number, number]; minCritical?: number };

/**
 * Quick stats for the search: planner profile, forced / deep decisions, greedy, tight, and the
 * random win and critical decisions when the target asks for them. Null if unwinnable.
 */
export function quickStats(lv: LevelDef, t: Needs, o: ScoreOptions): LevelStats | null {
  try {
    return withAnyRules(lv, undefined, (rules, h) => {
      const solver = new Solver(rules, o.budget ?? 400_000);
      if (!solver.winnable()) return null;
      const sol = naturalSolution(solver, h)!;
      const { forced, deep } = lineDepth(solver, h, sol);
      // only the planner depths the target's bands ask about (the deep planners are the slow part)
      const maxBand = Math.max(0, ...Object.keys(t.reach ?? {}).map(Number));
      const depths = o.depths ?? (maxBand ? PLAN_DEPTHS.filter((d) => d <= maxBand) : PLAN_DEPTHS);
      const rates = plannerRates(rules, h, o.runs, o.seed, depths);
      const plan = PLAN_DEPTHS.map((dd) => {
        const k = depths.indexOf(dd);
        return k >= 0 ? rates[k] : 0;
      });
      const line = t.minCritical ? alongLine(solver, sol) : null;
      const st: LevelStats = {
        random: t.maxRandom !== undefined || t.random ? solver.pRandom() : 0, greedy: greedyPlayout(rules, h).win, lookahead: 0,
        critical: line?.critical ?? 0, decisions: line?.decisions ?? 0, safeRatio: 0, states: solver.states, plan, forced, deep,
      };
      if (t.tight) {
        const r = tightResidue(lv, o.budget);
        st.tight = r === 0;
        residue.set(st, r);
      }
      if (t.minIceCut !== undefined) st.iceCut = cutOf(lv, { ...lv, frozen: undefined }, o.budget, solver.countWins());
      if (t.goal) st.goal = new GoalPlayer(rules, h, STRONG).rate(o.runs, o.seed ^ 0x6a09);
      if (t.careful) st.careful = new GoalPlayer(rules, h, CAREFUL).rate(o.runs, o.seed ^ 0xbb67);
      if (t.minBottleneck) {
        const b = bottlenecks(solver, 8, o.seed ^ 0x3c6e);
        st.bottleneck = b.score;
        st.narrow = b.narrow;
      }
      return st;
    });
  } catch (e) {
    if (e instanceof SolverBudgetError) return null;
    throw e;
  }
}

/** How far from tight a level is: 0 if it can't be won with one slot fewer, else 0.05 + the random win there. */
function tightResidue(lv: LevelDef, budget?: number): number {
  if (lv.slots <= 1) return 0;
  return withAnyRules(lv, lv.slots - 1, (r) => {
    const s = new Solver(r, budget);
    return s.winnable() ? 0.05 + s.pRandom() : 0;
  });
}

const residue = new WeakMap<LevelStats, number>();

/** Share of the winning lines of `open` that `lv` (the same level with lids or ice) rules out. */
function cutOf(lv: LevelDef, open: LevelDef, budget?: number, wins?: number): number {
  const count = (l: LevelDef) => withAnyRules(l, undefined, (r) => new Solver(r, budget).countWins());
  const all = count(open);
  return all > 0 ? 1 - (wins ?? count(lv)) / all : 0;
}

function tightOf(lv: LevelDef, budget?: number): boolean {
  if (lv.rules === 'taco') return lv.slots <= 1 || !new Solver(new TacoRules(lv, lv.slots - 1), budget).winnable();
  return isTight(lv, budget);
}

export interface ClimbOptions extends ScoreOptions {
  iters: number;
  minHeight?: number;
  /** stop early after this many milliseconds (breaks determinism) */
  until?: number;
}

/**
 * Hill climb (in place). `objective` is the full distance from the target (default: its planning
 * part); the search also aims for the middle of the planner bands and, for a tight target, for a
 * counter one slot smaller that is ever harder to win. Returns the draft's final quick stats.
 */
export function climb(d: Draft, t: Needs, rng: Rng, o: ClimbOptions, objective: (st: LevelStats) => number = (st) => planObjective(st, t)): { stats: LevelStats; score: number } | null {
  const score = (st: LevelStats) => objective(st) * 10 + planAim(st, t) + 5 * (residue.get(st) ?? 0);
  let st = quickStats(levelOf(d), t, o);
  if (!st) return null;
  let best = score(st);
  for (let it = 0; it < o.iters && best > 0; it++) {
    if (o.until !== undefined && performance.now() > o.until) break;
    const undo = mutate(d, rng, o.minHeight ?? 1);
    if (!undo) continue;
    const st2 = quickStats(levelOf(d), t, o);
    const s2 = st2 ? score(st2) : Infinity;
    if (st2 && s2 <= best) {
      best = s2;
      st = st2;
    } else undo();
  }
  return { stats: st, score: best };
}

// ---------------------------------------------------------------------------------------------
// Cloches

export interface ClocheOptions {
  count: number;
  /** planner depths to measure (default 1–5) */
  depths?: number[];
  /** placements to try */
  tries: number;
  runs: number;
  seed: number;
  /** arrangements the deducer considers at most */
  worlds?: number;
  budget?: number;
}

/**
 * Puts `count` cloches on the finished level: tries a few placements (tiles behind the front row,
 * never a frozen one) and keeps the one closest to the target with the blind planner, among those
 * where the careful deducer never guesses more than the target allows. Null if none is fair.
 */
export function placeCloches(lv: LevelDef, t: PlanTarget, rng: Rng, o: ClocheOptions): { level: LevelDef; plan: number[]; guesses: number; riddles: number } | null {
  const icy = new Set((lv.frozen ?? []).map(([c, r]) => c * 100 + r));
  const spots: [number, number][] = [];
  lv.columns.forEach((col, c) => {
    for (let r = 1; r < col.length; r++) if (!icy.has(c * 100 + r)) spots.push([c, r]);
  });
  if (spots.length < o.count) return null;
  let best: { level: LevelDef; plan: number[]; guesses: number; riddles: number; score: number } | null = null;
  for (let k = 0; k < o.tries; k++) {
    const at = rng.shuffle(spots.slice()).slice(0, o.count).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cand: LevelDef = { ...lv, cloches: at };
    const ded = deduce(cand, o.seed + k, o.worlds ?? 40, o.budget);
    if (!ded.win || ded.guesses > (t.maxGuesses ?? 0)) continue;
    const m = measureDepth(cand, { runs: o.runs, seed: o.seed, classic: false, budget: o.budget, depths: o.depths });
    if (!m) continue;
    if (o.depths) m.stats.plan = PLAN_DEPTHS.map((d) => (o.depths!.includes(d) ? m.stats.plan![o.depths!.indexOf(d)] : 0));
    const st = { ...m.stats, guesses: ded.guesses, riddles: ded.riddles };
    // closest to the target; among equals the one that hides the most (lower blind planner rates)
    const score = planObjective(st, t) * 10 + planAim(st, t) + 0.2 * (st.plan![2] - (st.sighted ?? 0));
    if (!best || score < best.score) best = { level: cand, plan: st.plan!, guesses: ded.guesses, riddles: ded.riddles, score };
  }
  return best ? { level: best.level, plan: best.plan, guesses: best.guesses, riddles: best.riddles } : null;
}

export { planningDepth };

// ---------------------------------------------------------------------------------------------
// The search loop

/** One level to generate: how to draft candidates, the mechanics to add and how to judge them. */
export interface GuidedJob {
  target: Needs;
  /** full distance from the target (classic and planning terms; 0 = on target) */
  objective(st: LevelStats): number;
  /** distance from the middle of the bands, for choosing among on-target levels */
  aim(st: LevelStats): number;
  /** a fresh draft (orders, golden line, labels), or null */
  draft(rng: Rng): Draft | null;
  /** frozen tiles to put in the pantry */
  frozen?: number;
  /** cloches to put on the finished layout */
  cloches?: number;
  /** smallest column height the search may leave */
  minHeight?: number;
  /** lidded levels: measure how many winning lines the lids cut */
  lidCut?: boolean;
  /** a last check of the climbed level (teaching filters); false rejects it */
  accept?(level: LevelDef): boolean;
}

export interface GuidedOptions {
  /** drafts to try at most */
  attempts?: number;
  /** hill-climb steps per draft */
  iters?: number;
  /** stop after this many drafts landed on target (the most central one wins; default 1) */
  keep?: number;
  /** planner games per depth while searching / for the stored numbers (a different seed) */
  runs?: number;
  holdout?: number;
  /** planner depths the search measures (default 1–5) */
  depths?: number[];
  budget?: number;
  /** stop early after this many milliseconds once a level exists (breaks determinism) */
  timeBudgetMs?: number;
  /** cloche placements to try */
  clocheTries?: number;
  /** arrangements the deducer considers */
  worlds?: number;
  /** skip the slow classic numbers (random player, lookahead bot): the runtime generator */
  fast?: boolean;
}

export interface GuidedResult {
  level: LevelDef;
  dist: number;
  attempts: number;
  measured: number;
  ms: number;
}

/** Final numbers of a finished level: classic stats, planner profile (blind with cloches), tightness, lids. */
export function finalStats(lv: LevelDef, o: { holdout: number; seed: number; budget?: number; fast?: boolean; lidCut?: boolean; depths?: number[] }): { stats: LevelStats; solution: number[] } | null {
  // the runtime generator measures only the depths it searched with (the others read 0)
  const depths = o.fast && o.depths ? o.depths : PLAN_DEPTHS;
  const m = measureDepth(lv, { runs: o.holdout, seed: o.seed, classic: !o.fast, budget: o.budget, depths });
  if (m && depths !== PLAN_DEPTHS) m.stats.plan = PLAN_DEPTHS.map((d) => (depths.includes(d) ? m.stats.plan![depths.indexOf(d)] : 0));
  if (!m) return null;
  m.stats.tight = tightOf(lv, o.budget);
  withAnyRules(lv, undefined, (rules, h) => {
    m.stats.goal = new GoalPlayer(rules, h, STRONG).rate(o.holdout, o.seed ^ 0x6a09);
    if (!o.fast) {
      m.stats.careful = new GoalPlayer(rules, h, CAREFUL).rate(o.holdout, o.seed ^ 0xbb67);
      const b = bottlenecks(new Solver(rules, o.budget), 16, o.seed ^ 0x3c6e);
      m.stats.bottleneck = b.score;
      m.stats.narrow = b.narrow;
    }
  });
  if (o.lidCut && lv.lids?.some((x) => x > 0)) m.stats.lidCut = cutOf(lv, { ...lv, lids: undefined }, o.budget);
  if (lv.frozen?.length) m.stats.iceCut = cutOf(lv, { ...lv, frozen: undefined }, o.budget);
  return m;
}

/**
 * Generates a level: drafts are hill-climbed toward the target, finished (ice, cloches), measured
 * with fresh planner games and kept if closest to the target (or to the middle of it, once on
 * target). Null if no draft could be built.
 */
export function generateGuided(job: GuidedJob, seed: number, opts: GuidedOptions = {}): GuidedResult | null {
  const t0 = performance.now();
  const rng = new Rng(seed);
  const attempts = opts.attempts ?? 6;
  const keep = opts.keep ?? 1;
  const runs = opts.runs ?? 16;
  const holdout = opts.holdout ?? 48;
  const deadline = opts.timeBudgetMs !== undefined ? t0 + opts.timeBudgetMs : undefined;
  let best: { level: LevelDef; dist: number; score: number } | null = null;
  let measured = 0;
  let onTarget = 0;
  let a = 0;
  for (; a < attempts; a++) {
    if (deadline !== undefined && best && performance.now() > deadline) break;
    const d = job.draft(rng);
    if (!d) continue;
    if (job.frozen) freeze(d, job.frozen, rng);
    const c = climb(d, job.target, rng, {
      iters: opts.iters ?? 120, runs, seed: seed ^ 0x51ed, depths: opts.depths, budget: opts.budget, minHeight: job.minHeight,
      until: deadline,
    }, job.objective);
    if (!c) continue;
    let lv = levelOf(d);
    if (job.accept && !job.accept(lv)) continue;
    const m = finalStats(lv, { holdout, seed: seed ^ 0x2545f491, budget: opts.budget, fast: opts.fast, lidCut: job.lidCut && !opts.fast, depths: opts.depths });
    if (!m) continue;
    let stats = m.stats;
    if (job.cloches) {
      const placed = placeCloches(lv, job.target, rng, {
        count: job.cloches, tries: opts.clocheTries ?? 6, runs: Math.min(holdout, 32), seed: seed ^ 0x7f4a7c15, worlds: opts.worlds, budget: opts.budget,
        depths: opts.fast ? opts.depths : undefined,
      });
      if (!placed) continue;
      lv = placed.level;
      stats = { ...stats, sighted: stats.plan![2], plan: placed.plan, depth: planningDepth(placed.plan), guesses: placed.guesses, riddles: placed.riddles };
    }
    measured++;
    const dist = job.objective(stats);
    const score = dist > 0 ? 100 + dist : job.aim(stats);
    if (!best || score < best.score) best = { level: { ...lv, solution: m.solution, stats }, dist, score };
    if (dist === 0 && ++onTarget >= keep) {
      a++;
      break;
    }
  }
  if (!best) return null;
  return { level: { ...best.level, seed }, dist: best.dist, attempts: a, measured, ms: performance.now() - t0 };
}
