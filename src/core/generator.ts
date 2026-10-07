/**
 * Level generator for both kitchens: the Trattoria (combo rules, below) and the Burger Joint
 * (stack rules, see "Burger Joint" further down).
 *
 * 1. Pick the guests' orders for a level spec (zero-waste: the pantry holds exactly the raw parts
 *    of the ordered dishes).
 * 2. Build a golden line: a randomised depth-first search over item TYPES under the exact rules,
 *    biased toward moves that hold an item on the counter instead of combining it at once.
 * 3. Deal the golden line into columns (top first) with an uneven skyline. Taking the columns in
 *    golden order replays the golden line, so the level is solvable by construction.
 * 4. Optionally put lids on columns: a lidded column that opens after k dishes only receives
 *    items the golden line takes after its k-th dish, so the golden line stays legal.
 * 5. Measure with the exact solver and the simulated players (metrics.ts) and keep the candidate
 *    closest to the spec's target band. Tight levels (unwinnable with one slot fewer) are the
 *    dominant difficulty dial; the spec can require them.
 *
 * Everything is deterministic for a seed.
 */
import { BURGER_ITEMS, BurgerRules, makeStackTicket, stackDishOf } from './burger';
import type { DishId, FoodId } from './content';
import { KitchenRules, kitchenFor, type Kitchen } from './kitchen';
import { isTight, measureLevel, roundStats, thinkingRate } from './metrics';
import { endlessLocal, endlessSpec, endlessWorld } from './progression';
import { TAQUERIA_WORLD, generateTacoLevel, taqueriaEndlessSpec } from './tacoGen';
import { Rng } from './rng';
import { Solver } from './solver';
import type { Intro, LevelDef, LevelStats, Tier } from './types';

/** Accepted ranges of the measured difficulty (missing = anything goes). */
export interface Target {
  /** exact random-player win probability */
  random?: [number, number];
  /** the greedy player must lose */
  greedyLoses?: boolean;
  /** required lookahead of the greedy bot that avoids getting stuck */
  lookahead?: [number, number];
  /** critical decisions along the solution */
  minCritical?: number;
  /** critical decisions after the first third of the solution */
  minLateCritical?: number;
  /** random win probability from a third of the way in, at most */
  phaseRandom?: number;
  /** thinking player (2–3 moves ahead) win rate */
  thinking?: [number, number];
  /** unwinnable with one counter slot fewer */
  tight?: boolean;
  /** lid levels: the lids must remove at least this share of the winning lines */
  minLidCut?: number;
  /** soft cap on how many moves a fatal move can stay unnoticed (see LevelStats.trapDepth) */
  maxTrap?: number;
}

/** Everything the generator needs for one level. */
export interface LevelSpec {
  /** campaign level number (global) */
  n: number;
  world: number;
  /** kitchen-local index (1–40) of a campaign level */
  local?: number;
  menu: string;
  tier: Tier;
  /** which rules the kitchen plays by (default: combo, the Trattoria) */
  rules?: 'combo' | 'burger';
  /** burger kitchens: ticket shapes */
  burger?: BurgerShape;
  columns: number;
  /** tallest column */
  depth: number;
  slots: number;
  seats: number;
  /** number of guests (orders; burger tickets), inclusive range */
  orders: [number, number];
  /** dishes guests may order (burger kitchens: ['burger']) */
  dishes: DishId[];
  /** dishes that must be ordered (a multiset) */
  must?: DishId[];
  /** pantry size, inclusive range */
  items: [number, number];
  /** number of lidded columns */
  lids?: number;
  /** a lid opens after at most this many dishes */
  lidMax?: number;
  /** golden line: preference for holding an item over combining it (0 = none) */
  holdBias?: number;
  /** extra ±1 column-height transfers for an uneven skyline */
  spread?: number;
  /** what this level teaches (the UI shows a card) */
  intro?: Intro;
  /** a short label of what the level is about (docs and debug only) */
  theme?: string;
  target: Target;
}

export interface GenOptions {
  /** candidate levels to measure at most */
  attempts?: number;
  /** thinking-player games per measured candidate (0 = skip the thinking player) */
  thinkRuns?: number;
  /** stop early after this many milliseconds (breaks determinism; for runtime use only) */
  timeBudgetMs?: number;
  /** solver state budget per candidate */
  budget?: number;
  /** stop after this many candidates landed in the band and keep the most central one (default 1) */
  keep?: number;
}

export interface GenResult {
  level: LevelDef;
  /** distance from the target band (0 = on target) */
  dist: number;
  attempts: number;
  /** candidates that passed the quick filters and were fully measured */
  measured: number;
  ms: number;
}

// ---------------------------------------------------------------------------------------------
// Orders

export function itemCount(k: Kitchen, orders: DishId[]): number {
  return orders.reduce((a, d) => a + k.rawParts(k.dish(d)).length, 0);
}

/**
 * Random orders for the spec, or null if none fit the item range. Variety: when the spec allows
 * several dishes, at least two are ordered and the orders are spread evenly over them (no dish more
 * than twice, or than its even share rounded up), so a level never asks for the same dish over and
 * over.
 */
export function pickOrders(spec: LevelSpec, rng: Rng): DishId[] | null {
  const k = kitchenFor(spec.menu);
  const cap = Math.min(spec.items[1], spec.columns * spec.depth);
  const lo = Math.max(spec.items[0], spec.columns);
  for (let tries = 0; tries < 400; tries++) {
    const n = rng.int(spec.orders[0], spec.orders[1]);
    const orders = (spec.must ?? []).slice(0, n);
    while (orders.length < n) orders.push(rng.pick(spec.dishes));
    rng.shuffle(orders);
    const items = itemCount(k, orders);
    if (items > cap || items < lo) continue;
    if (spec.dishes.length > 1) {
      const counts = new Map<DishId, number>();
      for (const d of orders) counts.set(d, (counts.get(d) ?? 0) + 1);
      if (counts.size < 2 || Math.max(...counts.values()) > Math.max(2, Math.ceil(n / spec.dishes.length))) continue;
    }
    // A new dish shows up among the first seated guests.
    if (spec.intro && orders.includes(spec.intro as DishId)) {
      const at = orders.indexOf(spec.intro as DishId);
      const seat = rng.int(0, Math.min(spec.seats, orders.length) - 1);
      if (at > seat) [orders[at], orders[seat]] = [orders[seat], orders[at]];
    }
    return orders;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Golden line

export interface GoldenLine {
  /** raw item indices in take order */
  items: number[];
  /** dishes served before each move */
  servedBefore: number[];
  /** fullest counter along the line */
  peak: number;
}

/**
 * Randomised DFS over item types that serves every order under the exact rules (the landing-slot
 * rule included). Moves that hold an item (nothing combines) get a random bonus scaled by
 * `holdBias`, so the line parks items and the dealt columns ask for planning.
 */
export function goldenLine(
  menu: string,
  orders: DishId[],
  seats: number,
  slots: number,
  rng: Rng,
  holdBias = 0.5,
  nodeCap = 20000,
): GoldenLine | null {
  const rules = new KitchenRules({ menu, columns: [], slots, seats, orders });
  const k = rules.k;
  const rem = new Array<number>(k.items.length).fill(0);
  for (const d of orders) for (const x of k.rawParts(k.dish(d))) rem[x]++;
  const types = rem.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  const start = rules.start();
  const dead = new Set<string>();
  const path: number[] = [];
  const occs: number[] = [];
  const servedBefore: number[] = [];
  let nodes = 0;
  const total = orders.length;

  const dfs = (counts: number[], seatsNow: number[], next: number, served: number, occ: number): boolean => {
    if (served === total) return true;
    const key = rem.join(',') + '|' + counts.join(',') + '|' + seatsNow.join(',') + '|' + next;
    if (dead.has(key)) return false;
    if (++nodes > nodeCap) return false;
    const cands: { w: number; t: number; counts: number[]; seats: number[]; next: number; served: number; occ: number }[] = [];
    for (const t of types) {
      if (!rem[t]) continue;
      const c2 = counts.slice();
      c2[t]++;
      const s2 = seatsNow.slice();
      const st = { next, served };
      rules.resolve(c2, s2, st);
      let occ2 = 0;
      for (const x of c2) occ2 += x;
      if (occ2 > slots) continue;
      const holds = occ2 === occ + 1 && st.served === served;
      cands.push({ w: rng.next() + (holds ? holdBias * rng.next() : 0), t, counts: c2, seats: s2, next: st.next, served: st.served, occ: occ2 });
    }
    cands.sort((a, b) => b.w - a.w);
    for (const c of cands) {
      rem[c.t]--;
      path.push(c.t);
      occs.push(c.occ);
      servedBefore.push(served);
      if (dfs(c.counts, c.seats, c.next, c.served, c.occ)) return true;
      rem[c.t]++;
      path.pop();
      occs.pop();
      servedBefore.pop();
      if (nodes > nodeCap) return false;
    }
    dead.add(key);
    return false;
  };

  if (!dfs(start.counts, start.seats, start.next, start.served, 0)) return null;
  return { items: path.slice(), servedBefore: servedBefore.slice(), peak: Math.max(0, ...occs) };
}

// ---------------------------------------------------------------------------------------------
// Columns and lids

/**
 * Column heights for n items: as even as possible, then `spread * C` random ±1 transfers for an
 * uneven skyline (every column keeps min..depth items).
 */
export function columnHeights(n: number, columns: number, depth: number, rng: Rng, spread = 1, min = 1): number[] {
  if (n < columns || n > columns * depth) throw new Error(`cannot deal ${n} items into ${columns}x${depth}`);
  const lens = new Array<number>(columns).fill(Math.floor(n / columns));
  const extra = rng.shuffle([...Array(columns).keys()]).slice(0, n - lens.reduce((a, b) => a + b, 0));
  for (const i of extra) lens[i]++;
  for (let i = 0; i < spread * columns; i++) {
    const a = rng.int(0, columns - 1);
    const b = rng.int(0, columns - 1);
    if (a !== b && lens[a] > min && lens[b] < depth) {
      lens[a]--;
      lens[b]++;
    }
  }
  return lens;
}

/**
 * Column label per golden-line position: the golden line's i-th item goes to the bottom of column
 * labels[i]. Any labelling keeps the golden line legal, because the items are dealt in its order.
 */
function shuffledLabels(lens: number[], rng: Rng): number[] {
  const labels: number[] = [];
  lens.forEach((len, i) => {
    for (let j = 0; j < len; j++) labels.push(i);
  });
  return rng.shuffle(labels);
}

/**
 * Labels with `count` lidded columns. A column whose lid opens after k dishes (1..lidMax) only
 * receives items the golden line takes after its k-th dish, so the golden line stays legal.
 * Returns null if the lidded columns don't fit.
 */
export function dealLidLabels(lens: number[], servedBefore: number[], count: number, lidMax: number, rng: Rng): { labels: number[]; lids: number[] } | null {
  const n = servedBefore.length;
  const labels = new Array<number>(n).fill(-1);
  const lids = new Array<number>(lens.length).fill(0);
  let placed = 0;
  for (const c of rng.shuffle([...lens.keys()])) {
    if (placed >= count) break;
    for (let k = rng.int(1, lidMax); k >= 1; k--) {
      const free: number[] = [];
      for (let i = 0; i < n; i++) if (labels[i] < 0 && servedBefore[i] >= k) free.push(i);
      if (free.length < lens[c]) continue;
      for (const i of rng.shuffle(free).slice(0, lens[c])) labels[i] = c;
      lids[c] = k;
      placed++;
      break;
    }
  }
  if (placed < count) return null;
  const rest = shuffledLabels(lens.map((len, c) => (lids[c] ? 0 : len)), rng);
  let j = 0;
  for (let i = 0; i < n; i++) if (labels[i] < 0) labels[i] = rest[j++];
  return { labels, lids };
}

/** Columns (top item first) from a golden line and its labels. */
export function columnsFrom(items: FoodId[], labels: number[], columns: number): FoodId[][] {
  const cols: FoodId[][] = Array.from({ length: columns }, () => []);
  items.forEach((it, i) => cols[labels[i]].push(it));
  return cols;
}

// ---------------------------------------------------------------------------------------------
// Targets

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

/** Distance of the measured stats from the target (0 = on target). */
export function objective(st: LevelStats, t: Target): number {
  let v = logBand(st.random, t.random);
  if (t.greedyLoses && st.greedy) v += 0.4;
  v += 0.25 * linBand(st.lookahead, t.lookahead);
  if (t.minCritical) v += 0.12 * Math.max(0, t.minCritical - st.critical);
  if (t.minLateCritical) v += 0.12 * Math.max(0, t.minLateCritical - (st.lateCritical ?? 0));
  if (t.phaseRandom !== undefined) v += Math.max(0, logBand(st.phaseRandom ?? 1, [0, t.phaseRandom]));
  if (t.tight && st.tight === false) v += 0.6;
  if (t.thinking) v += st.thinking === undefined ? 0.15 : 1.2 * linBand(st.thinking, t.thinking);
  if (t.minLidCut !== undefined) v += Math.max(0, t.minLidCut - (st.lidCut ?? 0));
  if (t.maxTrap !== undefined) v += 0.05 * Math.max(0, (st.trapDepth ?? 0) - t.maxTrap);
  return v;
}

/** The same distance without the (expensive) thinking-player term. */
function quickObjective(st: LevelStats, t: Target): number {
  return objective(st, { ...t, thinking: undefined });
}

// ---------------------------------------------------------------------------------------------
// Generation

/**
 * One unmeasured candidate level for the spec (orders, golden line, columns, lids), or null.
 * `golden` is the golden line as column indices (a winning line of the level), `peak` its fullest
 * counter.
 */
export function buildCandidate(spec: LevelSpec, rng: Rng): { level: LevelDef; golden: number[]; peak: number } | null {
  if (spec.rules === 'burger') return buildBurgerCandidate(spec, rng);
  const orders = pickOrders(spec, rng);
  if (!orders) return null;
  const g = goldenLine(spec.menu, orders, spec.seats, spec.slots, rng, spec.holdBias ?? 0.6);
  if (!g) return null;
  const k = kitchenFor(spec.menu);
  const lens = columnHeights(g.items.length, spec.columns, spec.depth, rng, spec.spread ?? 1);
  let labels: number[];
  let lids: number[] | undefined;
  if (spec.lids) {
    const dealt = dealLidLabels(lens, g.servedBefore, spec.lids, spec.lidMax ?? 2, rng);
    if (!dealt) return null;
    ({ labels, lids } = dealt);
  } else labels = shuffledLabels(lens, rng);
  const columns = columnsFrom(g.items.map((i) => k.items[i]), labels, spec.columns);
  const level: LevelDef = {
    n: spec.n,
    world: spec.world,
    ...(spec.local ? { local: spec.local } : {}),
    menu: spec.menu,
    tier: spec.tier,
    columns,
    slots: spec.slots,
    seats: spec.seats,
    orders,
  };
  if (lids) level.lids = lids;
  if (spec.intro) level.intro = spec.intro;
  return { level, golden: labels, peak: g.peak };
}

/**
 * How far a level is from the middle of its target: the random win on a log scale plus the
 * thinking player's win rate (0 = centred). Used to choose among candidates inside the band, which
 * keeps the difficulty curve smooth.
 */
export function aimDistance(st: LevelStats, t: Target): number {
  let d = 0;
  if (t.random) {
    const [lo, hi] = t.random;
    const centre = lo > 0 ? Math.sqrt(lo * hi) : hi / 3;
    d += Math.abs(Math.log10(Math.max(st.random, 1e-5)) - Math.log10(centre));
  }
  if (t.thinking && st.thinking !== undefined) d += Math.abs(st.thinking - (t.thinking[0] + t.thinking[1]) / 2);
  return d;
}

/**
 * Generates a level for the spec: candidates are built and measured until `keep` of them land in
 * the target band, and the one closest to the middle of the band is kept (a smooth difficulty
 * curve); if none lands, the closest candidate is returned. Deterministic for a seed
 * (unless a time budget stops it early).
 */
export function generateLevel(spec: LevelSpec, seed: number, opts: GenOptions = {}): GenResult | null {
  const t0 = performance.now();
  const rng = new Rng(seed);
  const attempts = opts.attempts ?? 200;
  const thinkRuns = opts.thinkRuns ?? 0;
  const keep = opts.keep ?? 1;
  const t = spec.target;
  let best: { level: LevelDef; stats: LevelStats; dist: number; score: number } | null = null;
  let measured = 0;
  let onTarget = 0;
  let a = 0;
  for (; a < attempts; a++) {
    if (opts.timeBudgetMs !== undefined && best && performance.now() - t0 > opts.timeBudgetMs) break;
    const cand = buildCandidate(spec, rng);
    if (!cand) continue;
    // Quick filters: a tight level needs a golden line that fills the counter.
    if (t.tight && cand.peak < spec.slots) continue;
    const tight = isTight(cand.level, opts.budget);
    if (t.tight && !tight && best?.stats.tight) continue;
    const m = measureLevel(cand.level, { budget: opts.budget, lidCut: t.minLidCut !== undefined });
    if (!m) continue;
    measured++;
    m.stats.tight = tight;
    let dist = quickObjective(m.stats, t);
    // The thinking player is the slowest measurement: only ask it when the rest is about right.
    if (thinkRuns && t.thinking && dist < 0.3) m.stats.thinking = thinkingRate(cand.level, thinkRuns, seed);
    dist = objective(m.stats, t);
    const score = dist > 0 ? 100 + dist : aimDistance(m.stats, t);
    if (!best || score < best.score) best = { level: { ...cand.level, solution: m.solution }, stats: m.stats, dist, score };
    if (dist === 0 && ++onTarget >= keep) {
      a++;
      break;
    }
  }
  if (!best) return null;
  const level: LevelDef = { ...best.level, stats: roundStats(best.stats), seed };
  return { level, dist: best.dist, attempts: a, measured, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------------------------------------
// Burger Joint
//
// A burger level is a set of tickets (exact stacks, bottom bun to top bun). The golden take order
// is a random walk over item types under the exact rules that parks an item no plate wants yet
// whenever a counter spot is free (with probability `park`), else feeds a plate; feeding is always
// possible, so the walk always serves every ticket. Dealing it into columns keeps it legal. Random
// deals are almost never tight (about 0.3% in the design simulation), so tight levels come from a
// guided split: swap two column labels at a time, keep swaps that lower the random-win chance of
// the same level with one counter spot fewer, until that level can't be won at all.

/** Ticket shapes of a burger level. */
export interface BurgerShape {
  /** layers per ticket, buns included */
  layers: [number, number];
  /** extra layers in use (burger-only levels: every ticket has a patty and every kind appears) */
  fillings: FoodId[];
  /** layers that must appear on some ticket (the level's new filling) */
  feature?: FoodId[];
  /** chance that a ticket has a double patty */
  doublePatty?: number;
  /** golden order: chance to park an item no plate wants yet when a spot is free (default 0.9) */
  park?: number;
  /** guided split: label swaps tried per candidate (default 250) */
  guide?: number;
  /**
   * Counter slack: the guided split makes the level unwinnable with `slots - slack - 1` spots, so
   * 0 = tight, 1 = one spare spot (a breather). Undefined = plain random split.
   */
  slack?: number;
}

/** One ticket: bottom bun, `len - 2` fillings (a patty and mostly different kinds), top bun. */
export function makeTicket(rng: Rng, len: number, fillings: FoodId[], doublePatty = 0): FoodId[] {
  const k = len - 2;
  const others: FoodId[] = fillings.filter((f) => f !== 'patty');
  const any = others.length ? others : fillings;
  let mid: FoodId[];
  if (k >= 2 && doublePatty > 0 && rng.chance(doublePatty)) {
    const rest = rng.shuffle(others.slice()).slice(0, k - 2);
    while (rest.length < k - 2) rest.push(rng.pick(any));
    const at = rng.int(0, rest.length);
    mid = [...rest.slice(0, at), 'patty', 'patty', ...rest.slice(at)];
  } else {
    const pick = rng.shuffle(others.slice()).slice(0, k - 1);
    while (pick.length < k - 1) pick.push(rng.pick(fillings));
    mid = rng.shuffle([...pick, 'patty']);
  }
  return ['bun_bottom', ...mid, 'bun_top'];
}

/**
 * Tickets for a Burger Joint spec, or null if they don't fit. The dishes are drawn like the
 * Trattoria's orders (every `must` dish, spread evenly over `spec.dishes`, a new dish among the
 * first seated guests); each ticket follows its dish (makeStackTicket). Burger-only levels use
 * every filling kind of the spec; mixed levels show at least the spec's featured layers.
 */
export function pickTickets(spec: LevelSpec, rng: Rng): FoodId[][] | null {
  const shape = spec.burger!;
  const cap = Math.min(spec.items[1], spec.columns * spec.depth);
  const lo = Math.max(spec.items[0], spec.columns * 2);
  const dishes = spec.dishes.length ? spec.dishes : (['burger'] as DishId[]);
  const burgersOnly = dishes.every((d) => d === 'burger');
  for (let tries = 0; tries < 600; tries++) {
    const n = rng.int(spec.orders[0], spec.orders[1]);
    const kinds = (spec.must ?? []).slice(0, n);
    while (kinds.length < n) kinds.push(rng.pick(dishes));
    rng.shuffle(kinds);
    if (dishes.length > 1) {
      const counts = new Map<DishId, number>();
      for (const d of kinds) counts.set(d, (counts.get(d) ?? 0) + 1);
      if (counts.size < Math.min(2, n) || Math.max(...counts.values()) > Math.max(2, Math.ceil(n / dishes.length))) continue;
    }
    if (spec.intro && kinds.includes(spec.intro as DishId)) {
      const at = kinds.indexOf(spec.intro as DishId);
      const seat = rng.int(0, Math.min(spec.seats, kinds.length) - 1);
      if (at > seat) [kinds[at], kinds[seat]] = [kinds[seat], kinds[at]];
    }
    const tickets = kinds.map((d) =>
      burgersOnly
        ? makeTicket(rng, rng.int(shape.layers[0], shape.layers[1]), shape.fillings, shape.doublePatty)
        : makeStackTicket(rng, d, rng.int(shape.layers[0], shape.layers[1]), shape.fillings, d === 'burger' ? shape.doublePatty : 0),
    );
    const items = tickets.reduce((a, t) => a + t.length, 0);
    if (items > cap || items < lo) continue;
    const used = new Set(tickets.flat());
    if ((burgersOnly ? shape.fillings : shape.feature ?? []).some((f) => !used.has(f))) continue;
    return tickets;
  }
  return null;
}

/**
 * Golden take order for burger tickets (item indices into BURGER_ITEMS), with the dishes served
 * before each take and the fullest counter. One column per item type lets the exact rules route
 * every take (leftmost plate, else the counter) and cascade.
 */
export function burgerGolden(tickets: FoodId[][], seats: number, slots: number, rng: Rng, park = 0.9): GoldenLine {
  const count = BURGER_ITEMS.map((id) => tickets.reduce((a, t) => a + t.filter((x) => x === id).length, 0));
  const columns = BURGER_ITEMS.map((id, i) => new Array<FoodId>(count[i]).fill(id));
  const r = new BurgerRules({ columns, slots, seats, tickets });
  let s = r.start();
  const items: number[] = [];
  const servedBefore: number[] = [];
  let peak = 0;
  while (!r.isWin(s)) {
    const steps = r.successors(s);
    const feeds = steps.filter(([m]) => r.target(s, m) >= 0);
    const parks = steps.filter(([m]) => r.target(s, m) < 0);
    const step = parks.length && rng.chance(park)
      ? parks[rng.weighted(parks.map(([m]) => count[m] - s.ptr[m]))]
      : feeds[rng.int(0, feeds.length - 1)];
    items.push(step[0]);
    servedBefore.push(s.served);
    s = step[1];
    peak = Math.max(peak, s.counts.reduce((a, b) => a + b, 0));
  }
  return { items, servedBefore, peak };
}

/**
 * Guided split: swap two labels at a time (keeping lidded columns after their threshold) and keep
 * a swap when the level with one counter spot fewer gets no easier for a random player, until that
 * level can't be won. Returns the tight labelling, or null after `iters` swaps.
 */
export function guideTight(level: LevelDef, items: FoodId[], labels: number[], servedBefore: number[], iters: number, rng: Rng): number[] | null {
  const C = level.columns.length;
  const lids = level.lids;
  const lb = labels.slice();
  const score = (): number => {
    const solver = new Solver(new BurgerRules({ ...level, columns: columnsFrom(items, lb, C) }, level.slots - 1));
    return solver.winnable() ? solver.pRandom() + 1e-9 : 0;
  };
  let f = score();
  for (let it = 0; it < iters && f > 0; it++) {
    const i = rng.int(0, lb.length - 1);
    const j = rng.int(0, lb.length - 1);
    const a = lb[i];
    const b = lb[j];
    if (a === b) continue;
    if (lids && ((lids[b] && servedBefore[i] < lids[b]) || (lids[a] && servedBefore[j] < lids[a]))) continue;
    lb[i] = b;
    lb[j] = a;
    const f2 = score();
    if (f2 <= f) f = f2;
    else {
      lb[i] = a;
      lb[j] = b;
    }
  }
  return f === 0 ? lb : null;
}

function buildBurgerCandidate(spec: LevelSpec, rng: Rng): { level: LevelDef; golden: number[]; peak: number } | null {
  const shape = spec.burger!;
  const tickets = pickTickets(spec, rng);
  if (!tickets) return null;
  // With slack k the golden order (and the guided split) use k spots fewer than the level has.
  const slots = spec.slots - (shape.slack ?? 0);
  const g = burgerGolden(tickets, spec.seats, slots, rng, shape.park ?? 0.9);
  // A tight split needs a golden order that fills the counter (the guided split is expensive).
  if ((shape.slack !== undefined || spec.target.tight) && g.peak < slots) return null;
  const items = g.items.map((i) => BURGER_ITEMS[i]);
  const lens = columnHeights(items.length, spec.columns, spec.depth, rng, spec.spread ?? 1, items.length >= 2 * spec.columns ? 2 : 1);
  let labels: number[];
  let lids: number[] | undefined;
  if (spec.lids) {
    const dealt = dealLidLabels(lens, g.servedBefore, spec.lids, spec.lidMax ?? 2, rng);
    if (!dealt) return null;
    ({ labels, lids } = dealt);
  } else labels = shuffledLabels(lens, rng);
  const level: LevelDef = {
    n: spec.n,
    world: spec.world,
    ...(spec.local ? { local: spec.local } : {}),
    menu: spec.menu,
    tier: spec.tier,
    rules: 'burger',
    columns: columnsFrom(items, labels, spec.columns),
    slots: spec.slots,
    seats: spec.seats,
    orders: tickets.map(stackDishOf),
    tickets,
  };
  if (lids) level.lids = lids;
  if (spec.intro) level.intro = spec.intro;
  if (shape.slack !== undefined) {
    const tuned = guideTight({ ...level, slots }, items, labels, g.servedBefore, shape.guide ?? 250, rng);
    if (tuned) {
      labels = tuned;
      level.columns = columnsFrom(items, labels, spec.columns);
    }
  }
  return { level, golden: labels, peak: g.peak };
}

/**
 * Endless mode (levels after the campaign; blocks of 10 alternate the kitchens, see endlessSpec),
 * safe to run in a Web Worker: a modest attempt budget keeps it under 300 ms per level on a laptop.
 * Deterministic for (n, seed) unless `timeBudgetMs` cuts the search short on a slow device.
 */
export function generateEndlessLevel(n: number, seed = 0x5eed, timeBudgetMs?: number): LevelDef {
  const s = (Math.imul(n, 2654435761) ^ seed) >>> 0;
  if (endlessWorld(n) === TAQUERIA_WORLD) {
    // Taquería shifts: a few candidates of a late shape, the closest one wins
    const spec = taqueriaEndlessSpec(n, endlessLocal(n));
    const res = generateTacoLevel(spec, s, { attempts: 10, timeBudgetMs }) ?? generateTacoLevel({ ...spec, target: {} }, s + 1, { attempts: 10 });
    if (!res) throw new Error(`endless level ${n}: generation failed`);
    return res.level;
  }
  const spec = endlessSpec(n);
  // Every burger candidate runs a guided split: fewer candidates, the closest one wins.
  const attempts = spec.rules === 'burger' ? 4 : 24;
  const res =
    generateLevel(spec, s, { attempts, timeBudgetMs }) ??
    generateLevel({ ...spec, target: {} }, s + 1, { attempts });
  if (!res) throw new Error(`endless level ${n}: generation failed`);
  return res.level;
}
