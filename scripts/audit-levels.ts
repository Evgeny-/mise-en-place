/**
 * Audits the campaign (all three kitchens) and writes docs/difficulty.md (how difficulty is
 * measured, the Trattoria and the Burger Joint) and docs/difficulty-taqueria.md (the Taquería: its
 * prose sections are kept, the tables are regenerated).
 *
 * - replays every stored solution through the play simulation (createSim, no boosters) to a win;
 * - checks zero-waste pantries (the raw parts of the ordered dishes, the layers of the stacked
 *   tickets, or one container and the raw fillings of every taco order);
 * - re-measures every level: the exact solver numbers must match the stored stats (otherwise the
 *   rules changed since the build: rebuild); the planner profile is re-sampled with fresh seeds (a
 *   holdout sample, so the build's selection can't flatter it); cloche levels are deduced again;
 * - checks the menu and mechanic rules: neighbouring levels of a kitchen serve different dish sets,
 *   no cloche or ice before the level that introduces it, fair cloches;
 * - prints and writes per-tier and per-level tables. Levels are listed by their kitchen-local
 *   index with the campaign number (the kitchens alternate in 5-level shifts, src/core/shifts.ts).
 *
 *   bun scripts/audit-levels.ts [levels=src/data/levels.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stackDishOf } from '../src/core/burger';
import { DISHES, type DishId } from '../src/core/content';
import type { Target } from '../src/core/generator';
import { reachOf } from '../src/core/guided';
import { kitchenFor } from '../src/core/kitchen';
import { bottlenecks, CAREFUL, deduce, goalRate, measureDepth, planningDepth, STRONG, withAnyRules } from '../src/core/measure';
import { Solver } from '../src/core/solver';
import { isTight } from '../src/core/metrics';
import { introAt, kitchenSpec, SHIFT_ORDER, targetFor, themeOf } from '../src/core/progression';
import { createSim } from '../src/core/sim';
import { isTacoTight, tacoRawParts, taqueriaSpec, taqueriaTarget, taqueriaTheme } from '../src/core/tacoGen';
import type { LevelDef, LevelStats } from '../src/core/types';

const FILE = process.argv[2] ?? 'src/data/levels.json';
const DOC = 'docs/difficulty.md';
const TACO_DOC = 'docs/difficulty-taqueria.md';
const HOLDOUT_RUNS = 64;

if (!existsSync(FILE)) throw new Error(`${FILE} is missing: run bun scripts/build-levels.ts`);
const levels: LevelDef[] = JSON.parse(readFileSync(FILE, 'utf8'));

interface Row {
  lv: LevelDef;
  st: LevelStats;
  /** planner profile re-sampled with fresh seeds */
  plan: number[];
  /** the goal-directed players (strong: a first try; careful: the fairness check) and the bottleneck score, re-measured */
  goal: number;
  careful: number;
  bn: number;
  theme: string;
  problems: string[];
}

const rows: Row[] = [];
const t0 = performance.now();
const lastSet = new Map<number, string>();
const firstAt = (intro: string) => levels.find((l) => introAt(l.n) === intro)?.n ?? Infinity;
const CLOCHE_INTRO = firstAt('cloche');
const ICE_INTRO = firstAt('frozen');
for (const lv of levels) {
  const problems: string[] = [];
  const local = lv.local ?? 0;
  // 1. the stored solution wins in the real simulation
  const sim = createSim(lv);
  for (const m of lv.solution ?? []) if (!sim.take(m)) problems.push(`solution move ${m} is illegal`);
  if (sim.status !== 'won') problems.push(`solution ends ${sim.status}`);
  // 2. zero waste
  const need = new Map<string, number>();
  const add = (it: string, d: number) => need.set(it, (need.get(it) ?? 0) + d);
  if (lv.rules === 'burger') {
    const tickets = lv.tickets ?? [];
    if (tickets.length !== lv.orders.length || tickets.some((t, i) => stackDishOf(t) !== lv.orders[i])) problems.push('orders do not match the tickets');
    for (const t of tickets) for (const it of t) add(it, 1);
  } else if (lv.rules === 'taco') {
    for (const d of lv.orders) for (const it of tacoRawParts(d)) add(it, 1);
  } else {
    const k = kitchenFor(lv.menu);
    for (const d of lv.orders) for (const x of k.rawParts(k.dish(d))) add(k.items[x], 1);
  }
  for (const c of lv.columns) for (const it of c) add(it, -1);
  if ([...need.values()].some((v) => v !== 0)) problems.push('pantry is not zero-waste');
  // 3. menus vary from level to level; mechanics come after their intro
  const set = [...new Set(lv.orders)].sort().join(',');
  if (local > 1 && lastSet.get(lv.world) === set) problems.push('serves the same dish set as the kitchen\'s previous level');
  lastSet.set(lv.world, set);
  if (lv.cloches?.length && lv.n < CLOCHE_INTRO) problems.push('cloches before the level that introduces them');
  if (lv.frozen?.length && lv.n < ICE_INTRO) problems.push('ice before the level that introduces it');
  // 4. re-measure
  const seed = 638003 + lv.n * 37;
  const m = measureDepth(lv, { runs: HOLDOUT_RUNS, seed, solution: lv.solution });
  const theme = lv.world === 2 ? taqueriaTheme(local) : themeOf(lv.world, local);
  if (!m) {
    problems.push('unwinnable');
    rows.push({ lv, st: lv.stats!, plan: [0, 0, 0, 0, 0], goal: 0, careful: 0, bn: 0, theme, problems });
    continue;
  }
  const st = lv.stats!;
  const tight = lv.rules === 'taco' ? isTacoTight(lv) : isTight(lv);
  const same = (a: number | boolean | undefined, b: number | boolean | undefined) =>
    typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-3 : a === b;
  for (const key of ['random', 'greedy', 'lookahead', 'critical', 'decisions', 'items', 'forced', 'deep'] as const) {
    if (!same(st[key], m.stats[key])) problems.push(`stored ${key}=${st[key]} but measured ${m.stats[key]}`);
  }
  if (st.tight !== tight) problems.push(`stored tight=${st.tight} but measured ${tight}`);
  if (lv.cloches?.length) {
    const d = deduce(lv, seed, 64);
    if (!d.win) problems.push('the careful deducer loses');
    if (d.guesses > (lv.tier === 'superhard' ? 1 : 0)) problems.push(`the deducer must guess ${d.guesses} times`);
  }
  const goal = goalRate(lv, STRONG, HOLDOUT_RUNS, seed ^ 0x6a09);
  const careful = goalRate(lv, CAREFUL, HOLDOUT_RUNS, seed ^ 0xbb67);
  const bn = withAnyRules(lv, undefined, (r) => bottlenecks(new Solver(r), 16, seed ^ 0x3c6e)).score;
  rows.push({ lv, st, plan: m.stats.plan!, goal, careful, bn, theme, problems });
}
const secs = (performance.now() - t0) / 1000;

// ---------------------------------------------------------------------------------------------
// Tables

const pct = (v: number, d = 1) => `${(100 * v).toFixed(d)}%`;
const p0 = (v: number) => `${Math.round(100 * v)}`;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

const local = (r: Row) => r.lv.local ?? 0;
const inWorld = (w: number) => (r: Row) => r.lv.world === w;
/** Tier groups per kitchen: the teaching ramp, normal levels early and late, hard, banquets. */
const GROUPS: [string, (r: Row) => boolean][][] = [0, 1, 2].map((w) => {
  const first = w === 2 ? 6 : 9;
  return [
    [`Opening, L1–${first - 1} (L1 the tutorial, L5 hard)`, (r) => local(r) < first],
    [`Normal, L${first}–20`, (r) => r.lv.tier === 'normal' && local(r) >= first && local(r) <= 20],
    ['Normal, L21–39', (r) => r.lv.tier === 'normal' && local(r) > 20],
    [`Hard, L15–35`, (r) => r.lv.tier === 'hard' && local(r) > 5],
    ['Banquets, L10–40', (r) => r.lv.tier === 'superhard'],
  ];
});

const profile = (plans: number[][]) => [0, 1, 2, 3, 4].map((i) => p0(mean(plans.map((p) => p[i])))).join(' / ');

function tierTable(world: number): string {
  const out = [
    '| Tier | Levels | Strong player | Careful player | Bottlenecks | Planner d1 / d2 / d3 / d4 / d5 | Planning depth | Forced | Deep | Random win (mean / median) | Items | Board | Guests | Seats | Tight | Cloches / ice / stove |',
    '|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [name, f] of GROUPS[world]) {
    const g = rows.filter((r) => inWorld(world)(r) && f(r));
    if (!g.length) continue;
    const seats = [...new Set(g.map((r) => r.lv.seats))].sort().join('–');
    out.push(
      `| ${name} | ${g.length} | ${pct(mean(g.map((r) => r.goal)), 0)} | ${pct(mean(g.map((r) => r.careful)), 0)} | ${mean(g.map((r) => r.bn)).toFixed(1)} | ` +
        `${profile(g.map((r) => r.plan))} | ${mean(g.map((r) => planningDepth(r.plan))).toFixed(1)} | ` +
        `${mean(g.map((r) => r.st.forced ?? 0)).toFixed(1)} | ${mean(g.map((r) => r.st.deep ?? 0)).toFixed(1)} | ` +
        `${pct(mean(g.map((r) => r.st.random)))} / ${pct(median(g.map((r) => r.st.random)))} | ` +
        `${mean(g.map((r) => r.st.items ?? 0)).toFixed(1)} | ${mean(g.map((r) => r.lv.columns.length)).toFixed(1)} cols | ` +
        `${mean(g.map((r) => r.lv.orders.length)).toFixed(1)} | ${seats} | ${g.filter((r) => r.st.tight).length}/${g.length} | ` +
        `${g.filter((r) => r.lv.cloches?.length).length} / ${g.filter((r) => r.lv.frozen?.length).length} / ${g.filter((r) => r.lv.stove).length} |`,
    );
  }
  return out.join('\n');
}

const DISH_SHORT: Partial<Record<DishId, string>> = {
  spaghetti: 'Sp', bruschetta: 'Br', caprese: 'Cp', pizza: 'Pz', omelette: 'Om', risotto: 'Ri', pesto_pasta: 'Pe', carbonara: 'Cb',
  minestrone: 'Mi', gnocchi: 'Gn', calzone: 'Cz', tiramisu: 'Ti',
  burger: 'Bu', hotdog: 'Hd', pancakes: 'Pk', sandwich: 'Sw', sundae: 'Su',
  taco_carnitas: 'Ca', taco_pollo: 'Po', taco_veggie: 'Ve', taco_frijol: 'Fr', taco_verde: 'Vd',
  burrito_carnitas: 'BCa', burrito_pollo: 'BPo', burrito_veggie: 'BVe', burrito_verde: 'BVd',
  quesadilla: 'Qu', tostada: 'To', enchiladas: 'En',
};
const dishShort = (d: DishId) => DISH_SHORT[d] ?? d.slice(0, 2);
const INTRO_NAME: Record<string, string> = {
  slots: 'small counter', lid: 'lids', cloche: 'cloches', frozen: 'frozen tiles', oven: 'the oven', grill: 'the grill', set: 'set menus', vip: 'the VIP',
};

function levelTable(world: number): string {
  const out = [
    '| Local | # | Tier | Teaches | Guests | Items | Board | Slots | Seats | Strong / careful | Bottlenecks | Planner d1–d5 | Depth | Forced | Deep | Random | Greedy | Tight | Mechanics |',
    '|---:|---:|---|---|---|---:|---|---:|---:|---|---:|---|---:|---:|---:|---:|---|---|---|',
  ];
  for (const r of rows.filter(inWorld(world))) {
    const { lv, st } = r;
    const depth = Math.max(...lv.columns.map((c) => c.length));
    const what = lv.intro === 'slots' && world === 2 ? '3-slot counter' : lv.intro && lv.intro in DISHES ? DISHES[lv.intro as DishId].name.en : INTRO_NAME[lv.intro ?? ''] ?? lv.intro;
    const intro = lv.intro && !r.theme.startsWith('new:') ? `**new: ${what}** — ` : '';
    const theme = r.theme.startsWith('new:') ? r.theme.replace(/^new: (.+?) — /, '**new: $1** — ') : r.theme;
    const guests = lv.tickets
      ? lv.tickets.map((t, i) => `${dishShort(lv.orders[i])}${t.length}`).join(' ') + (lv.tickets.some((t) => t.filter((x) => x === 'patty').length > 1) ? ', double patty' : '')
      : lv.orders.map(dishShort).join(' ');
    const tops = lv.toppings ? ` (${Object.entries(lv.toppings).map(([d, f]) => `${dishShort(d as DishId)} ${f}`).join(', ')})` : '';
    const lids = lv.lids ? ` + lid${lv.lids.filter((x) => x).length > 1 ? 's' : ''} (after ${lv.lids.filter((x) => x).join(', ')})` : '';
    const mech = [
      lv.cloches?.length ? `${lv.cloches.length} cloche${lv.cloches.length > 1 ? 's' : ''} (${st.riddles ?? 0} riddle${st.riddles === 1 ? '' : 's'}${st.guesses ? `, ${st.guesses} guess` : ''})` : '',
      lv.frozen?.length ? `${lv.frozen.length} ice (cuts ${p0(st.iceCut ?? 0)}%)` : '',
      lv.stove ? (lv.rules === 'burger' ? `grill ${lv.stove.patty}` : `oven (${Object.entries(lv.stove).map(([d, t]) => `${dishShort(d as DishId)} ${t}`).join(', ')})`) : '',
      lv.sets?.length ? `set menu${lv.sets.length > 1 ? 's' : ''} (${lv.sets.map((i) => `${dishShort(lv.orders[i])}+${dishShort(lv.orders[i + 1])}`).join(', ')})` : '',
      lv.vip?.length ? `VIP (guest ${lv.vip.map((i) => i + 1).join(', ')})` : '',
    ].filter(Boolean).join(', ') || '–';
    out.push(
      `| ${lv.local} | ${lv.n} | ${lv.tier} | ${intro}${theme}${tops} | ${guests} | ${st.items} | ` +
        `${lv.columns.length}×${depth}${lids} | ${lv.slots} | ${lv.seats} | ${p0(r.goal)}% / ${p0(r.careful)}% | ${r.bn.toFixed(1)} | ` +
        `${r.plan.map(p0).join('/')} | ${planningDepth(r.plan)} | ` +
        `${st.forced ?? '–'} | ${st.deep ?? '–'} | ${pct(st.random, st.random < 0.01 ? 2 : 1)} | ${st.greedy ? 'wins' : 'loses'} | ` +
        `${st.tight ? 'yes' : '–'} | ${mech} |`,
    );
  }
  return out.join('\n');
}

function band(t: Target): string[] {
  const p = (v: number) => (v >= 0.1 ? `${Math.round(v * 100)}%` : `${+(v * 100).toFixed(1)}%`);
  const reach = Object.entries(t.reach ?? {})
    .map(([d, b]) => (b![0] <= 0 ? `d${d} ≤ ${p(b![1])}` : b![1] >= 1 ? `d${d} ≥ ${p(b![0])}` : `d${d} ${p(b![0])}–${p(b![1])}`))
    .join(', ');
  const fd = [t.minForced ? `forced ≥ ${t.minForced}` : '', t.minDeep ? `deep ≥ ${t.minDeep}` : '', t.minBottleneck ? `bottlenecks ≥ ${t.minBottleneck}` : ''].filter(Boolean).join(', ');
  const players = [t.goal ? `strong ${p(t.goal[0])}–${p(t.goal[1])}` : '', t.careful ? `careful ${p(t.careful[0])}–${p(t.careful[1])}` : ''].filter(Boolean).join(', ');
  const r = t.random ? (t.random[0] > 0 ? `${p(t.random[0])}–${p(t.random[1])}` : `≤ ${p(t.random[1])}`) : t.maxRandom !== undefined ? `≤ ${p(t.maxRandom)}` : '–';
  const other = [
    t.greedyLoses ? 'greedy loses' : '',
    t.tight ? 'tight' : '',
    t.minCritical ? `≥ ${t.minCritical} critical` : '',
    t.maxGuesses ? `≤ ${t.maxGuesses} cloche guess` : '',
    t.minLidCut !== undefined ? `lids cut ≥ ${p(t.minLidCut)} of the winning lines` : '',
    t.minIceCut !== undefined ? `ice cuts ≥ ${p(t.minIceCut)}` : '',
    t.minRiddles ? `≥ ${t.minRiddles} cloche riddle` : '',
  ].filter(Boolean).join(', ');
  return [players || '–', reach || '–', fd || '–', r, other || '–'];
}

function targetTable(reps: [string, Target][], note = ''): string {
  const out = ['| Levels (local) | Goal-directed players | Planner reach | Forced / deep / bottlenecks | Random win | Also |', '|---|---|---|---|---|---|'];
  for (const [name, t] of reps) out.push(`| ${name} | ${band(t).join(' | ')} |`);
  return out.join('\n') + (note ? '\n\n' + note : '');
}

const T = (local: number) => kitchenSpec(0, local).target;
const B = (local: number) => kitchenSpec(1, local).target;
const TARGETS_W1 = targetTable([
  ['L2–3', T(3)],
  ['L4', T(4)],
  ['L5 (hard, tomato rush)', T(5)],
  ['L6', T(6)],
  ['L7–8', T(7)],
  ['L9 (end of the first shift)', T(9)],
  ['Banquet L10', T(10)],
  ['Normal, L11', targetFor(0, 11, 'normal')],
  ['Normal, L25 (bands slide linearly)', targetFor(0, 25, 'normal')],
  ['Normal, L39', targetFor(0, 39, 'normal')],
  ['Intro levels (11, 12, 13, 16, 18, 19, 21, 23, 27, 28, 32, 33, 36)', T(13)],
  ['Hard L15', T(15)],
  ['Hard L35', T(35)],
  ['Banquets L20, 30, 40', T(20)],
], 'Levels with cloches also need a cloche riddle (a decision where what is hidden matters) and a careful deducer that never guesses (banquets: at most once); levels with ice need the ice to rule out at least 15% of the winning lines (the frozen intro 30%); lidded levels 20% (the lid intro 40%).');

const TARGETS_W2 = targetTable([
  ['L2–3', B(3)],
  ['L4', B(4)],
  ['L5 (hard, small tight kitchen)', B(5)],
  ['L6', B(6)],
  ['L7–8', B(7)],
  ['L9', B(9)],
  ['Banquet L10', B(10)],
  ['Normal, L11', targetFor(1, 11, 'normal')],
  ['Normal, L39 (bands slide linearly)', targetFor(1, 39, 'normal')],
  ['Frozen intro (12)', B(12)],
  ['Hard L15', B(15)],
  ['Hard L35', B(35)],
  ['Banquets L20, 30, 40', B(20)],
], 'Cloches, ice and lids as in the Trattoria.');

const Q = (local: number) => taqueriaSpec(local).target;
const TARGETS_W3 = targetTable([
  ['L1 (tutorial)', Q(1)],
  ['L2–3', Q(3)],
  ['L4 (park intro)', Q(4)],
  ['L5 (hard)', Q(5)],
  ['L6 (quesadilla intro)', Q(6)],
  ['L7–8', Q(7)],
  ['Normal, L9', taqueriaTarget(9, 'normal')],
  ['Normal, L39 (bands slide linearly)', taqueriaTarget(39, 'normal')],
  ['Intro levels (8, 11, 13, 16, 21, 23, 31)', Q(13)],
  ['Hard L15', Q(15)],
  ['Hard L35', Q(35)],
  ['Banquet L10', Q(10)],
  ['Banquets L20, 30, 40', Q(20)],
], 'L4 must be unwinnable if the OLDEST tortilla received; L7 must be unwinnable without the scoop. Cloches and ice as in the Trattoria.');

const shiftLine = SHIFT_ORDER.map((w) => 'TBQ'[w]).join(' ');

/**
 * The campaign before round 3 (commit 7919e84: planner targets, no stove or chains), measured with
 * today's players (32 games each): the reference the new ladders are compared with.
 */
const BEFORE = `| Kitchen, tier | Levels | Planner d2 / d3 / d5 | Strong player | Careful player | Bottlenecks | Items | Guests |
|---|---:|---|---:|---:|---:|---:|---:|
| T opening, L1–8 | 8 | 66 / 88 / 100 | 73% | 95% | 1.4 | 9.1 | 3.1 |
| T normal, L9–20 | 9 | 34 / 69 / 85 | 64% | 88% | 3.2 | 14.2 | 4.0 |
| T normal, L21–39 | 16 | 20 / 43 / 70 | 38% | 77% | 3.6 | 18.9 | 5.5 |
| T hard | 3 | 5 / 17 / 55 | 18% | 46% | 4.1 | 21.0 | 6.0 |
| T superhard | 4 | 17 / 25 / 54 | 22% | 64% | 3.5 | 21.3 | 6.8 |
| B opening, L1–8 | 8 | 55 / 86 / 100 | 87% | 99% | 1.4 | 12.3 | 3.1 |
| B normal, L9–20 | 9 | 31 / 55 / 81 | 55% | 94% | 1.3 | 19.9 | 4.2 |
| B normal, L21–39 | 16 | 21 / 38 / 75 | 43% | 79% | 1.7 | 24.9 | 5.0 |
| B hard | 3 | 9 / 22 / 71 | 29% | 61% | 1.2 | 26.3 | 5.3 |
| B superhard | 4 | 19 / 22 / 59 | 17% | 66% | 3.4 | 27.0 | 5.8 |
| Q opening, L1–5 | 5 | 75 / 89 / 97 | 86% | 96% | 1.1 | 14.2 | 3.0 |
| Q normal, L6–20 | 12 | 23 / 68 / 83 | 42% | 75% | 2.2 | 20.5 | 4.2 |
| Q normal, L21–39 | 16 | 17 / 47 / 72 | 54% | 82% | 3.4 | 24.9 | 4.9 |
| Q hard | 3 | 17 / 22 / 57 | 8% | 76% | 4.1 | 25.7 | 5.0 |
| Q superhard | 4 | 16 / 30 / 45 | 30% | 62% | 4.1 | 28.0 | 5.8 |`;

/** The same table for the current campaign. */
function summary(): string {
  const out = BEFORE.split('\n').slice(0, 2);
  for (const w of [0, 1, 2]) {
    const first = w === 2 ? 6 : 9;
    const groups: [string, (r: Row) => boolean][] = [
      [`opening, L1–${first - 1}`, (r) => local(r) < first],
      [`normal, L${first}–20`, (r) => r.lv.tier === 'normal' && local(r) >= first && local(r) <= 20],
      ['normal, L21–39', (r) => r.lv.tier === 'normal' && local(r) > 20],
      ['hard', (r) => r.lv.tier === 'hard' && local(r) >= first],
      ['superhard', (r) => r.lv.tier === 'superhard'],
    ];
    for (const [name, f] of groups) {
      const g = rows.filter((r) => r.lv.world === w && f(r));
      if (!g.length) continue;
      out.push(
        `| ${'TBQ'[w]} ${name} | ${g.length} | ${p0(mean(g.map((r) => r.plan[1])))} / ${p0(mean(g.map((r) => r.plan[2])))} / ${p0(mean(g.map((r) => r.plan[4])))} | ` +
          `${p0(mean(g.map((r) => r.goal)))}% | ${p0(mean(g.map((r) => r.careful)))}% | ${mean(g.map((r) => r.bn)).toFixed(1)} | ` +
          `${mean(g.map((r) => r.st.items ?? 0)).toFixed(1)} | ${mean(g.map((r) => r.lv.orders.length)).toFixed(1)} |`,
      );
    }
  }
  return out.join('\n');
}

/** The endless pool: stored numbers per kitchen and tier, and a replay of every stored solution. */
function poolTable(): string {
  const file = 'src/data/levels-endless.json';
  if (!existsSync(file)) return 'The pool is not built yet.';
  const pool: LevelDef[] = JSON.parse(readFileSync(file, 'utf8'));
  const issues: string[] = [];
  const last = new Map<number, string>();
  for (const lv of pool) {
    const sim = createSim(lv);
    for (const m of lv.solution ?? []) if (!sim.take(m)) issues.push(`#${lv.n}: solution move ${m} is illegal`);
    if (sim.status !== 'won') issues.push(`#${lv.n}: solution ends ${sim.status}`);
    const set = [...new Set(lv.orders)].sort().join(',');
    if (last.get(lv.world) === set) issues.push(`#${lv.n}: repeats the dish set of the kitchen's previous level`);
    last.set(lv.world, set);
  }
  problems.push(...issues.map((i) => `pool ${i}`));
  const out = [
    `${pool.length} levels (${pool[0].n}–${pool[pool.length - 1].n}), ${(readFileSync(file).length / 1024).toFixed(0)} KB. ` +
      (issues.length ? `Problems: ${issues.join('; ')}.` : 'Every stored solution replays to a win and neighbouring levels of a kitchen serve different dish sets.'),
    '',
    '| Kitchen, tier | Levels | Strong player | Careful player | Bottlenecks | Planner d2 / d3 / d5 | Items | Guests | Stove / cloches / ice |',
    '|---|---:|---:|---:|---:|---|---:|---:|---:|',
  ];
  for (const w of [0, 1, 2]) {
    for (const tier of ['normal', 'hard', 'superhard'] as const) {
      const g = pool.filter((l) => l.world === w && l.tier === tier);
      if (!g.length) continue;
      const m = (f: (st: LevelStats) => number) => mean(g.map((l) => f(l.stats!)));
      out.push(
        `| ${'TBQ'[w]} ${tier} | ${g.length} | ${pct(m((st) => st.goal ?? 0), 0)} | ${pct(m((st) => st.careful ?? 0), 0)} | ${m((st) => st.bottleneck ?? 0).toFixed(1)} | ` +
          `${p0(m((st) => st.plan![1]))} / ${p0(m((st) => st.plan![2]))} / ${p0(m((st) => st.plan![4]))} | ${m((st) => st.items ?? 0).toFixed(1)} | ` +
          `${mean(g.map((l) => l.orders.length)).toFixed(1)} | ${g.filter((l) => l.stove).length} / ${g.filter((l) => l.cloches).length} / ${g.filter((l) => l.frozen).length} |`,
      );
    }
  }
  return out.join('\n');
}

const problems = rows.flatMap((r) => r.problems.map((p) => `L${r.lv.n} (${'TBQ'[r.lv.world]}${r.lv.local}): ${p}`));
const auditLine = (w: number[]) => {
  const ps = rows.filter((r) => w.includes(r.lv.world)).flatMap((r) => r.problems.map((p) => `- L${r.lv.n} (local ${r.lv.local}): ${p}`));
  const n = rows.filter((r) => w.includes(r.lv.world)).length;
  return ps.length
    ? ps.join('\n')
    : `All ${n} stored solutions replay to a win in the play simulation, every pantry is zero-waste, neighbouring levels serve different dish sets, no cloche or ice comes before its intro, the careful deducer wins every cloche level without guessing (banquets: at most once), and the stored solver numbers match a fresh measurement.`;
};

const doc = `# Difficulty: how the campaign is measured

Generated by \`bun scripts/audit-levels.ts\` from \`src/data/levels.json\` (built by
\`bun scripts/build-levels.ts\`, the Taquería by \`bun scripts/build-taqueria.ts\` +
\`bun scripts/merge-levels.ts\`). Difficulty is measured, not guessed, and since the October rework
it is also **searched for**: the guided generator (\`src/core/guided.ts\`) hill-climbs every level
toward its target instead of dealing random levels and keeping the lucky ones.

The campaign alternates kitchens in **shifts of five levels** (\`src/core/shifts.ts\`):
${shiftLine} (T Trattoria, B Burger Joint, Q Taquería). Each kitchen keeps its own ladder of 40
**local** levels: its dishes, mechanics, tiers and targets all follow the local index, so its
difficulty keeps climbing across its visits, and every shift ends on the kitchen's local hard level
or banquet (every 5th campaign level). The tables list levels by local index with their campaign
number (#). The Trattoria plays by the combo rules (\`src/core/kitchen.ts\`), the Burger Joint by
the stack rules (\`src/core/burger.ts\`); the Taquería is in [difficulty-taqueria.md](difficulty-taqueria.md).

## Why the old levels felt easy

The first campaign was generated at random and filtered by the random player's win chance (6–19%
on normal levels) and a "thinking player" that planned 2–3 moves ahead (it won 75–78%). Measured
with the planners below, a player who looked **two moves ahead won 70–83% of the normal levels and
one who looked three ahead 90–96%**; the planning depth of a normal level was 1–2. Along the stored
solution only 2–3 decisions per normal level punished the obvious move and about one hid its
consequence for three moves or more. Random filtering kept levels that are hard to stumble through,
not levels that ask you to plan: the random player loses to one-move blunders, which a person never
makes. The boards were small too (4–5 columns, 4–5 guests).

## The players and numbers

- **Strong player / careful player** (\`GoalPlayer\` in \`src/core/measure.ts\`) — goal-directed
  players that reason backwards from the orders, as people do. They only consider purposeful moves:
  taking an item a seated guest (or the next one in the queue) still needs — preps and chains
  expanded to their raw parts — or digging toward one at most two rows down; moves outside the
  orders only when nothing purposeful is left or every purposeful plan jams the kitchen. Along those
  moves they plan ahead, past the next serve, comparing plans by the kitchen's position value (a free
  spot, no extra sauce, nothing nobody needs). The **strong player** plans 4 moves ahead and slips
  5% of the time (takes a plausible move unchecked): a strong human's first try. The **careful
  player** plans 6 moves ahead and never slips: the fairness check. Their win rates are the main
  targets now. Calibration on the campaign before this round: the strong player sits between the
  depth-3 and depth-4 planners, the careful one above the depth-5 planner.
- **Bottlenecks** — winning lines are drawn uniformly (every winning line as likely as any other);
  a position where exactly one of several legal moves keeps the level winnable scores 1 plus the
  moves a wrong choice stays hidden (playable before the kitchen jams, at most 9). The score is the
  mean per line: narrow passages whose mistakes show late make a level hard for anybody.
- **Planner at depth d** (\`src/core/measure.ts\`) — looks exactly d moves ahead and takes the move
  with the best reachable position; ties are broken at random. Two planner families play and the
  better one counts: the kitchen planner values positions with its kitchen's knowledge (served
  dishes, useful items on the counter, layers on the plates, fillings in the tortillas, never an
  extra sauce…), the simple planner knows nothing about cooking (served dishes, items used up,
  columns still open). Two families keep a level from being "hard" only because one heuristic
  misjudges it. **Planner d1–d5** are their win rates (holdout games with fresh seeds; the build
  searched with other seeds). **reach(d)** is the best of the depths up to d (a player who can look
  three moves ahead can also look two).
- **Planning depth** — the smallest d whose planner wins at least half the games (6 = none of 1–5).
- **Forced** — decisions along the stored solution where the greedy (obvious) move loses.
- **Deep** — decisions along the stored solution where some fatal move still leaves three or more
  moves to play before the kitchen jams: you can't see it is fatal by trying a move or two. Exact
  (from the solver), independent of any heuristic.
- **Random win** — exact probability that a player tapping a random legal column wins. It is now a
  cap, not the target: a heuristic-free check that a level isn't hard only for the planners.
- **Greedy** — takes what helps the seated guests right now (Trattoria: a prep or a serve, else an
  item a seated guest needs; Burger Joint: a layer straight onto a plate, else park the item needed
  soonest). **Critical decisions** — moves along the solution where some legal move loses.
- **Tight** — the level can't be won with one counter slot fewer.
- **Cloche numbers** — the **blind planner** plans on a guess of what is under the cloches (any
  arrangement of the hidden items consistent with what it has seen: the pantry holds exactly the
  ordered dishes' parts, so the hidden items are known, only not where). The **careful deducer**
  takes, at every step, a move that keeps the level winnable in every arrangement still possible
  (exact solver per arrangement; arrangements that can't be won from the start are ruled out,
  since every level can be won). A **riddle** is a decision where what lies under a cloche decides
  whether some move is safe; a **guess** is a step where no move is safe in every arrangement. On
  cloche levels the planner profile is the blind planners'.
- **Ice cut / lid cut** — the share of the winning lines (of the same level without ice / lids) that
  the ice / the lids rule out: they must matter.

## The mechanics

- **Cloches** (from the Trattoria's L12, campaign level 17; then in every kitchen). A steel cloche
  hides a tile until it reaches the front of its column. The tickets list exactly what the pantry
  holds, so what is under the cloches is known as a set, and a careful player can deduce enough to
  play safe: the generator keeps only placements where the deducer never guesses (banquets may need
  one guess, flagged in the tables) and where the cloches hide at least one riddle. **Undo can
  peek** — deliberately: a lifted cloche stays lifted after an undo (the game never pretends you
  didn't see it), and an undo already costs the clean-run star. The hint and the solver see through
  the cloches (the hint is a paid helper).
- **Frozen tiles** (from the Burger Joint's L12, campaign level 37; then in every kitchen). A tile in
  an ice block can't be taken until a number of takes were made, from any column; the number on the
  ice counts down, and its column waits behind it. You need that many moves that don't clog the
  counter. Free for the solver: the take count is the sum of the column pointers.
- **The stove** (\`level.stove\`). **The oven** (the Trattoria from L23, campaign level 48): once a
  pizza, a calzone or a lasagne has all its parts on the counter it bakes there for 2–3 takes; the
  dish takes a counter slot and its guest waits (the ticket shows ♨ and the takes left). **The
  grill** (the Burger Joint from L16, campaign level 51): a patty grills in a counter spot for 2–3
  takes before it can slide onto a plate. Every take, from any column, cooks one take more; when the
  pantry is empty the stove finishes by itself. A full counter while something cooks can jam the
  kitchen: that is the timing puzzle. The Taquería has no stove yet.
- **The ragù chain** (from the Trattoria's L27, campaign level 62). Tomato + tomato make sauce, and
  sauce next to minced beef turns into ragù at once — before any dish can take the sauce. Beef
  waiting on the counter steals the sauce a spaghetti, a pizza or gnocchi needed, several moves
  later: a long-range trap. Ragù is for tagliatelle al ragù (L27) and lasagne (L32, an oven dish).
- **Set menus** (the Trattoria from L28, campaign level 63; the Burger Joint from L31). One guest
  orders two dishes and gets them together: the first one finished waits on the counter on a red
  napkin — it takes a spot — until the second is ready (in the Burger Joint the finished stack moves
  off the plate to the counter and the plate builds the second one).
- **The VIP** (the Trattoria from L33, campaign level 78; the Burger Joint from L33). A guest with a
  gold star in the queue: while the VIP is seated nobody else is served, and other guests' finished
  dishes wait on the counter (a spot each) until the VIP has eaten. The queue shows exactly when the
  VIP arrives, so it is planned for, not a surprise. Both share one rule ("ready dishes": a finished
  dish that can't go out yet waits on the counter), which the solver, the hint and every player see.
- **Bigger kitchens late.** Six columns, a third seat and longer queues (up to 8 guests) from the
  middle of each ladder.

## The guided generator

Every level starts as a **draft**: the orders, a golden line (a winning take order of item types
under the exact rules) and a dealing of it into columns. Any dealing keeps the golden line legal,
because the items are dealt in its order; lidded columns only receive items the golden line takes
after their lid opens, and ice always thaws by the time the golden line needs the tile. So every
level is solvable by construction. A **hill climb** then changes the draft — swap two tiles between
columns, move a tile to another column, move the ice — and keeps a change when the level gets no
further from its target (the goal-directed players' bands, bottlenecks, planner bands, forced and
deep decisions, greedy loses, the random cap and, for tight targets, a counter one slot smaller that
gets ever harder to win). Cloches go on last: a
few placements are tried, and the one closest to the target that the deducer solves without
guessing is kept. A level is measured again with fresh games before it is stored. About 10 seconds to
10 minutes per level on a laptop.

## Before and after

The campaign before round 3 (commit 7919e84: planner targets only, no stove or chain), measured
with today's players (32 games each):

${BEFORE}

The campaign now (holdout games with fresh seeds):

${summary()}

## Menus

Every level serves a mix of two or three dishes (banquets more); a level's orders are spread
evenly over its dishes (no dish more than twice, or than its even share), neighbouring levels of a
kitchen never serve the same set, and a new dish leads the level that introduces it.

- **Trattoria (12 dishes, 6 preps).** Preps make themselves on the counter, in this priority:
  sauce (tomato + tomato), dough (flour + egg), soffritto (onion + carrot), pesto (basil + cheese),
  gnocchi (potato + flour), mascarpone cream (mascarpone + egg). Dishes and their intro levels:
  spaghetti 1 (pasta + sauce), bruschetta 2 (bread + ONE raw tomato), caprese 3 (mozzarella + tomato
  + basil), pizza 4 (dough + sauce + cheese), omelette 6 (egg + mushroom + cheese), risotto 7 (rice +
  mushroom + cheese), pasta al pesto 8 (pasta + pesto), carbonara 11 (pasta + egg + cheese + bacon),
  minestrone 13 (soffritto + potato + ONE raw tomato), gnocchi 16 (gnocchi + sauce), calzone 18
  (dough + mozzarella + bacon), tiramisu 21 (cream + coffee); cloches at 12, a 2-slot counter at 19,
  ice from 26, a third seat from 30, lids at 36. No dish holds both halves of a prep raw, and a prep
  can only happen on a level once a dish that uses it was introduced.
- **Burger Joint (5 stacked dishes).** Burger 1, hot dog 2, pancakes 3, club sandwich 6, sundae 8;
  fillings join as cheese 1, butter 3, bacon 6, lettuce 7, ice cream 8, tomato 9, chocolate 12,
  pickles 13, onion 16, berries 17; cloches from 11, ice at 12, double patty 21, lids 26, a third
  plate 31.

## World 1 — Trattoria

### Targets

${TARGETS_W1}

The opening engages from the start: L1 is the authored tutorial, and from L2 every level holds a
forced decision (the obvious move loses) whose trap a player looking two moves ahead sees; by L5–8
a player needs to look about three moves ahead, L9 hides a deeper trap and the first banquet asks
for three to four. Each intro level keeps its new dish or rule as its hook. From L11 the normal
bands slide: the strong player (a strong human's first try) wins 45–85% of the early normal
levels and 25–55% of the last ones, while the careful player wins most of them. Hard levels and
banquets are meant to be lost on the first try (the strong player wins at most 30% / 20%) but stay
fair: the careful player wins 20–70% / 15–60%, and their bottlenecks are narrow (a score of at least
4–6).

### Measured

${tierTable(0)}

### Levels

Dishes: Sp spaghetti, Br bruschetta, Cp caprese, Pz pizza, Om omelette, Ri risotto, Pe pasta al
pesto, Cb carbonara, Mi minestrone, Gn gnocchi, Cz calzone, Ti tiramisu. Board = columns × tallest
column; a lidded column opens after the given number of served dishes.

${levelTable(0)}

### What moves difficulty

- **The search, not the deal.** The same orders and golden line, dealt at random and then climbed,
  go from a depth-3 planner winning 90–100% to 20–50%: where each tile sits decides whether a
  reaction you must avoid shows three moves ahead or one.
- **Counter size and tightness** still divide the random win (one slot fewer roughly by three).
- **Reactions to avoid make the thinking.** A second tomato turns a bruschetta's, a caprese's or a
  minestrone's raw tomato into sauce; basil next to the cheese becomes pesto; an egg next to flour
  becomes dough; a potato next to flour becomes gnocchi.
- **Shared raw parts** make the order of serving matter. **More seats** are more outlets (easier
  per guest), so the late levels with a third seat also serve more guests.
- **Ice and lids** force an order; **cloches** turn a plan into a plan that works whatever is hidden.

## World 2 — Burger Joint

Every dish is an exact stack, bottom layer first. A taken item goes onto the leftmost plate whose
next layer it is, else it parks on the counter (a free spot is needed); parked items slide onto the
plates when they become the next layer. Every level has a 3-spot counter and is zero-waste.

### Targets

${TARGETS_W2}

The opening is the Trattoria's (a forced decision from L2, about three moves of planning by L5–9,
L5 a small tight kitchen); from L11 every level is tight (the intro levels may keep a spare spot).

### Measured

${tierTable(1)}

### Levels

Guests: each ticket's dish and its layer count (Bu burger, Hd hot dog, Pk pancakes, Sw club
sandwich, Su sundae). Board = columns × tallest column; a lidded column opens after the given
number of served dishes.

${levelTable(1)}

### What moves difficulty

- **Tightness is the dominant dial** of the stacks: a raw deal of 4 columns × 5 and 4 tickets lets
  a random player win about half the time; a tight one about 5%. The guided generator gets it by
  scoring the same level with one spot fewer (its random win, until it can't be won).
- **Shared fillings keep the plates competing**; the leftmost-plate routing is still the trap.
- **A third plate is a relief knob** (L31 on), so the late levels add tickets and columns.

## Endless mode

Levels 121–240 come from the **endless pool** (\`src/data/levels-endless.json\`, built offline by
\`bun scripts/build-endless.ts\` and loaded lazily): campaign quality, the full guided search with
the full late targets. The 5-level shifts take the three kitchens in turn; each level plays a late
row of its kitchen at full size (stove, chain, cloches, ice and lids included), and every shift ends
on a hard level or a banquet. Neighbouring levels of a kitchen serve different dish sets. The daily
special is a normal pool level picked by the date. Past the pool, \`generateEndlessLevel(n)\`
(\`src/core/generator.ts\`) builds levels in a Web Worker with a 1.5 s budget (\`ENDLESS_OPTIONS\`:
three drafts, forty climbing steps, the strong player and the planners up to depth 3); the next
level is prefetched while the current one is played.

${poolTable()}

## Audit

${auditLine([0, 1])}

Audit time (all three kitchens): ${secs.toFixed(1)} s.
`;
writeFileSync(DOC, doc);

// The Taquería document: keep its prose, regenerate its header and tables.
if (existsSync(TACO_DOC)) {
  const old = readFileSync(TACO_DOC, 'utf8');
  const section = (title: string) => {
    const at = old.indexOf(`## ${title}`);
    if (at < 0) return '';
    const next = old.indexOf('\n## ', at + 3);
    return old.slice(at, next < 0 ? undefined : next + 1).trimEnd();
  };
  const tdoc = `# Difficulty: the Taquería (world 3)

Built by \`bun scripts/build-taqueria.ts\` into \`src/data/levels-taqueria.json\` and merged into the
campaign by \`bun scripts/merge-levels.ts\`; this file's tables are written by
\`bun scripts/audit-levels.ts\`. The ladder and targets live in \`src/core/tacoGen.ts\`
(\`taqueriaSpec\`, \`taqueriaTarget\`), the rules in \`src/core/taco.ts\`. The Taquería's 40 local levels
are spread over 8 shifts of the campaign (${shiftLine}); tiers follow the local index as in every
kitchen: every 5th level is hard, every 10th a banquet, and a new dish or mechanic always comes on a
normal level. The players, the numbers, the mechanics (cloches, frozen tiles) and the guided
generator are described in [difficulty.md](difficulty.md).

${section('Rules in one paragraph')}

${section('Menu')}

## Targets

The fit guard and the landing-slot rule remove every one-move blunder, so random play is stronger
than in the Trattoria: the random cap of the planning bands is 1.6 times the Trattoria's. The
opening (L2–8) asks for the same as every kitchen's: a forced decision from L2, about three moves of
planning by L5–8; L1 stays the tutorial. Tightness is recorded but not targeted (a 4-spot
counter rarely is; the receiving tortilla is this world's dial).

${TARGETS_W3}

Teaching order: a tortilla catches fillings and salsa drops in (1–3, the chicken taco at 2) → park a
half-made taco under a new tortilla (4) → the quesadilla's double cheese (6) → queued tickets and
the scoop (7) → frijol (8) → cloches (9, taught in the Trattoria) → a 3-slot counter (11) → burritos
next to tacos: which container receives? (13) → frozen tiles (14, taught in the Burger Joint) →
enchiladas (16) → guacamole and taco verde (21) → the tostada (23) → topping last (31) → a third
guest (36).

## Measured (40 levels)

${tierTable(2)}

## Levels

Dishes: Ca carnitas, Po pollo, Ve veggie, Fr frijol, Vd verde, Qu quesadilla, To tostada; BCa, BPo,
BVe, BVd the burritos, En enchiladas. Board = columns × tallest column.

${levelTable(2)}

${section('What moves difficulty')}

## Audit

${auditLine([2])}
`;
  writeFileSync(TACO_DOC, tdoc);
}

for (const w of [0, 1, 2]) {
  console.log(tierTable(w));
  console.log();
}
for (const r of rows) {
  const { lv, st } = r;
  console.log(
    `#${String(lv.n).padStart(3)} ${'TBQ'[lv.world]}${String(lv.local).padStart(2)} ${lv.tier.padEnd(9)} plan(holdout)=${r.plan.map(p0).join('/')} ` +
      `(build ${(st.plan ?? []).map(p0).join('/')}) depth=${planningDepth(r.plan)} reach3=${p0(reachOf(r.plan, 3))} rnd=${pct(st.random, 2).padStart(7)} ` +
      `forced=${st.forced} deep=${st.deep}${r.problems.length ? '  PROBLEMS: ' + r.problems.join('; ') : ''}`,
  );
}
console.log(`\n${problems.length ? problems.length + ' problems' : 'no problems'}; wrote ${DOC} and ${TACO_DOC} in ${secs.toFixed(1)}s`);
if (problems.length) process.exitCode = 1;
