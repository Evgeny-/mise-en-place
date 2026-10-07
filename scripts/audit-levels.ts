/**
 * Audits the campaign (all three kitchens) and writes docs/difficulty.md (Trattoria and Burger
 * Joint) and docs/difficulty-taqueria.md (the Taquería: its prose sections are kept, the tables are
 * regenerated).
 *
 * - replays every stored solution through the play simulation (createSim, no boosters) to a win;
 * - checks zero-waste pantries (the raw parts of the ordered dishes, the layers of the stacked
 *   tickets, or one container and the raw fillings of every taco order);
 * - re-measures every level: the exact solver numbers must match the stored stats (otherwise the
 *   rules changed since the build: rebuild), and the thinking player is re-sampled with fresh
 *   seeds (a holdout sample, so the build's selection can't flatter it);
 * - checks the menu rules: neighbouring levels of a kitchen serve different dish sets;
 * - prints and writes per-tier and per-level tables. Levels are listed by their kitchen-local
 *   index with the campaign number (the kitchens alternate in 5-level shifts, src/core/shifts.ts).
 *
 *   bun scripts/audit-levels.ts [levels=src/data/levels.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stackDishOf } from '../src/core/burger';
import { DISHES, type DishId } from '../src/core/content';
import type { Target } from '../src/core/generator';
import { kitchenFor } from '../src/core/kitchen';
import { measureLevel } from '../src/core/metrics';
import { kitchenSpec, SHIFT_ORDER, targetFor, themeOf } from '../src/core/progression';
import { createSim } from '../src/core/sim';
import { measureTaco, tacoRawParts, tacoThinking, taqueriaSpec, taqueriaTarget, taqueriaTheme } from '../src/core/tacoGen';
import type { LevelDef, LevelStats } from '../src/core/types';

const FILE = process.argv[2] ?? 'src/data/levels.json';
const DOC = 'docs/difficulty.md';
const TACO_DOC = 'docs/difficulty-taqueria.md';
const HOLDOUT_RUNS = 128;

if (!existsSync(FILE)) throw new Error(`${FILE} is missing: run bun scripts/build-levels.ts`);
const levels: LevelDef[] = JSON.parse(readFileSync(FILE, 'utf8'));

interface Row {
  lv: LevelDef;
  st: LevelStats;
  /** thinking-player holdout win rate */
  think: number;
  theme: string;
  problems: string[];
}

const rows: Row[] = [];
const t0 = performance.now();
const lastSet = new Map<number, string>();
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
  // 3. menus vary from level to level
  const set = [...new Set(lv.orders)].sort().join(',');
  if (local > 1 && lastSet.get(lv.world) === set) problems.push('serves the same dish set as the kitchen\'s previous level');
  lastSet.set(lv.world, set);
  // 4. re-measure
  const seed = 638003 + lv.n * 37;
  const m = lv.rules === 'taco'
    ? measureTaco(lv, { tight: true, solution: lv.solution })
    : measureLevel(lv, { tight: true, thinkRuns: HOLDOUT_RUNS, seed, solution: lv.solution });
  const theme = lv.world === 2 ? taqueriaTheme(local) : themeOf(lv.world, local);
  if (!m) {
    problems.push('unwinnable');
    rows.push({ lv, st: lv.stats!, think: 0, theme, problems });
    continue;
  }
  const think = lv.rules === 'taco' ? tacoThinking(lv, HOLDOUT_RUNS, seed) : m.stats.thinking ?? 0;
  const st = lv.stats!;
  const same = (a: number | boolean | undefined, b: number | boolean | undefined) =>
    typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-3 : a === b;
  for (const key of ['random', 'greedy', 'lookahead', 'critical', 'decisions', 'tight', 'items'] as const) {
    if (!same(st[key], m.stats[key])) problems.push(`stored ${key}=${st[key]} but measured ${m.stats[key]}`);
  }
  rows.push({ lv, st, think, theme, problems });
}
const secs = (performance.now() - t0) / 1000;

// ---------------------------------------------------------------------------------------------
// Tables

const pct = (v: number, d = 1) => `${(100 * v).toFixed(d)}%`;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

const local = (r: Row) => r.lv.local ?? 0;
const inWorld = (w: number) => (r: Row) => r.lv.world === w;
const GROUPS: [string, (r: Row) => boolean][][] = [
  [
    ['Teaching, L1–8 (L5 is a gentle hard)', (r) => local(r) <= 8],
    ['Normal, L9–40', (r) => r.lv.tier === 'normal' && local(r) >= 9],
    ['Hard, L15–35', (r) => r.lv.tier === 'hard' && local(r) >= 9],
    ['Super hard (banquets)', (r) => r.lv.tier === 'superhard'],
  ],
  [
    ['Ramp, L1–9 (L5 is a gentle hard)', (r) => local(r) <= 9],
    ['Normal, L11–39', (r) => r.lv.tier === 'normal' && local(r) >= 11],
    ['Hard, L15–35', (r) => r.lv.tier === 'hard' && local(r) >= 11],
    ['Super hard (banquets)', (r) => r.lv.tier === 'superhard'],
  ],
  [
    ['Teaching, L1–4', (r) => local(r) <= 4],
    ['Normal, L6–39', (r) => r.lv.tier === 'normal' && local(r) >= 6],
    ['Hard, L5–35', (r) => r.lv.tier === 'hard'],
    ['Banquets, L10–40', (r) => r.lv.tier === 'superhard'],
  ],
];

function tierTable(world: number): string {
  const groups = GROUPS[world].map(([name, f]) => [name, (r: Row) => inWorld(world)(r) && f(r)] as const);
  const out = [
    '| Tier | Levels | Random win (mean / median) | Random from ⅓ | Greedy wins | Thinking wins | Lookahead | Critical decisions | Safe-move ratio | Items | Slots | Tight |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [name, f] of groups) {
    const g = rows.filter(f);
    if (!g.length) continue;
    const slots = [...new Set(g.map((r) => r.lv.slots))].sort().join('–');
    out.push(
      `| ${name} | ${g.length} | ${pct(mean(g.map((r) => r.st.random)))} / ${pct(median(g.map((r) => r.st.random)))} | ` +
        `${pct(mean(g.map((r) => r.st.phaseRandom ?? 0)))} | ${pct(mean(g.map((r) => +r.st.greedy)), 0)} | ` +
        `${pct(mean(g.map((r) => r.think)), 0)} | ${mean(g.map((r) => r.st.lookahead)).toFixed(1)} | ` +
        `${mean(g.map((r) => r.st.critical)).toFixed(1)} (${mean(g.map((r) => r.st.lateCritical ?? 0)).toFixed(1)} late) | ` +
        `${mean(g.map((r) => r.st.safeRatio)).toFixed(2)} | ${mean(g.map((r) => r.st.items ?? 0)).toFixed(1)} | ${slots} | ` +
        `${g.filter((r) => r.st.tight).length}/${g.length} |`,
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

function levelTable(world: number): string {
  const out = [
    '| Local | # | Tier | Teaches | Guests | Items | Board | Slots | Seats | Random | From ⅓ | Greedy | LA | Critical | Trap | Thinking | Tight |',
    '|---:|---:|---|---|---|---:|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|',
  ];
  for (const r of rows.filter(inWorld(world))) {
    const { lv, st } = r;
    const depth = Math.max(...lv.columns.map((c) => c.length));
    const what = lv.intro === 'slots' ? (world === 2 ? '3-slot counter' : '2-slot counter') : lv.intro === 'lid' ? 'lids' : lv.intro && lv.intro in DISHES ? DISHES[lv.intro as DishId].name.en : lv.intro;
    const intro = lv.intro && !r.theme.startsWith('new:') ? `**new: ${what}** — ` : '';
    const theme = r.theme.startsWith('new:') ? r.theme.replace(/^new: (.+?) — /, '**new: $1** — ') : r.theme;
    const guests = lv.tickets
      ? lv.tickets.map((t, i) => `${dishShort(lv.orders[i])}${t.length}`).join(' ') + (lv.tickets.some((t) => t.filter((x) => x === 'patty').length > 1) ? ', double patty' : '')
      : lv.orders.map(dishShort).join(' ');
    const tops = lv.toppings ? ` (${Object.entries(lv.toppings).map(([d, f]) => `${dishShort(d as DishId)} ${f}`).join(', ')})` : '';
    const lids = lv.lids ? ` + lid${lv.lids.filter((x) => x).length > 1 ? 's' : ''} (after ${lv.lids.filter((x) => x).join(', ')})` : '';
    out.push(
      `| ${lv.local} | ${lv.n} | ${lv.tier} | ${intro}${theme}${tops} | ${guests} | ${st.items} | ` +
        `${lv.columns.length}×${depth}${lids} | ${lv.slots} | ${lv.seats} | ${pct(st.random, st.random < 0.01 ? 2 : 1)} | ` +
        `${pct(st.phaseRandom ?? 0, 0)} | ${st.greedy ? 'wins' : 'loses'} | ${st.lookahead} | ${st.critical}/${st.decisions} | ` +
        `${st.trapDepth ?? '–'} | ${pct(r.think, 0)} | ${st.tight ? 'yes' : '–'} |`,
    );
  }
  return out.join('\n');
}

function band(t: Target): string[] {
  const p = (v: number) => (v >= 0.1 ? `${Math.round(v * 100)}%` : `${+(v * 100).toFixed(1)}%`);
  const r = t.random ? (t.random[0] > 0 ? `${p(t.random[0])}–${p(t.random[1])}` : `≤ ${p(t.random[1])}`) : '–';
  const la = t.lookahead ? `${t.lookahead[0]}–${t.lookahead[1]}` : '–';
  const crit = t.minCritical ? `≥ ${t.minCritical}${t.minLateCritical ? ` (≥ ${t.minLateCritical} after ⅓)` : ''}` : '–';
  const think = t.thinking ? `${p(t.thinking[0])}–${p(t.thinking[1])}` : '–';
  const other = [
    t.greedyLoses ? 'greedy loses' : '',
    t.tight ? 'tight' : '',
    t.phaseRandom !== undefined ? `random from ⅓ ≤ ${p(t.phaseRandom)}` : '',
    t.maxTrap !== undefined ? `trap ≤ ${t.maxTrap} (soft)` : '',
    t.minLidCut !== undefined ? `lids cut ≥ ${p(t.minLidCut)} of the winning lines` : '',
  ].filter(Boolean).join(', ');
  return [r, la, crit, think, other || '–'];
}

function targetTable(reps: [string, Target][], note = ''): string {
  const out = ['| Levels (local) | Random win | Lookahead | Critical decisions | Thinking player | Also |', '|---|---|---|---|---|---|'];
  for (const [name, t] of reps) out.push(`| ${name} | ${band(t).join(' | ')} |`);
  return out.join('\n') + (note ? '\n\n' + note : '');
}

const T = (local: number) => kitchenSpec(0, local).target;
const B = (local: number) => kitchenSpec(1, local).target;
const TARGETS_W1 = targetTable([
  ['L2–4', T(3)],
  ['L5 (hard, tomato rush)', T(5)],
  ['L6 (omelette intro)', T(6)],
  ['L7', T(7)],
  ['L8', T(8)],
  ['Normal, L9', T(9)],
  ['Normal, L39 (bands slide linearly from L9)', targetFor(0, 39, 'normal')],
  ['Intro levels (11, 13, 16, 18, 19, 21)', T(13)],
  ['Lid intro (36)', T(36)],
  ['Hard (15, 25, 35)', T(15)],
  ['Banquet L10', T(10)],
  ['Banquets L20, 30, 40', T(20)],
], 'Normal levels with lids (37–39) and the L40 banquet also need the lids to cut at least 20% of the winning lines.');

const TARGETS_W2 = targetTable([
  ['L2–4', B(3)],
  ['L5 (hard, small tight kitchen)', B(5)],
  ['L6', B(6)],
  ['L7', B(7)],
  ['L8', B(8)],
  ['L9', B(9)],
  ['Normal, L11', B(11)],
  ['Normal, L39 (bands slide linearly from L11)', targetFor(1, 39, 'normal')],
  ['Lid intro (26)', B(26)],
  ['Hard (15, 25, 35)', B(15)],
  ['Banquet L10', B(10)],
  ['Banquets L20, 30, 40', B(20)],
], 'Normal levels with lids (27–29, 36–39) and the L30 banquet also need the lids to cut at least 20% of the winning lines.');

const Q = (local: number) => taqueriaSpec(local).target;
const TARGETS_W3 = targetTable([
  ['L1–2', Q(2)],
  ['L3', Q(3)],
  ['L4 (park intro)', Q(4)],
  ['L5 (gentle hard)', Q(5)],
  ['Normal, L6 → L39 (slides linearly)', taqueriaTarget(6, 'normal')],
  ['Normal, L39', taqueriaTarget(39, 'normal')],
  ['Intro levels (6, 8, 11, 13, 16, 21, 23, 31)', Q(13)],
  ['Hard (15, 25, 35)', Q(15)],
  ['Banquet L10', Q(10)],
  ['Banquets L20, 30, 40', Q(20)],
], 'L4 must be unwinnable if the OLDEST tortilla received; L7 must be unwinnable without the scoop.');

const shiftLine = SHIFT_ORDER.map((w) => 'TBQ'[w]).join(' ');

/** Measured while tuning the stacked levels: 24–30 candidates per configuration, 3-spot counter. */
const KNOBS_W2 = `- **The generator.** Tickets (the level's dish set, each ticket built after its dish: a burger
  is bun, patty and mostly different fillings, bun; a hot dog bun, sausage, toppings; pancakes two or
  three pancakes and a topping; a club sandwich toast, fillings, toast; a sundae glass, scoops,
  cherry) → a golden take order: a random walk under the exact rules that parks an item no plate
  wants yet whenever a spot is free (90%), else feeds a plate → dealt into columns, so the golden
  order stays a winning line → lids only on columns whose items are taken after the k-th dish.
  Random deals are almost never tight, so a **guided split** swaps two column labels at a time and
  keeps a swap when the same level with one spot fewer gets no easier for a random player, until
  that level can't be won at all. Breathers (L6–9) use the same search for one spot fewer and then
  get the spare spot back.
- **Shared fillings keep the plates competing.** Cheese, lettuce, tomato, bacon, pickles, onion
  and berries go on more than one dish; a toast fits a sandwich's bottom and another's top. The
  leftmost-plate routing is still the trap: the obvious layer goes to the left plate and steals what
  the right plate needed.
- **Tightness is the dominant dial** (the design simulation's finding still holds): a raw deal of
  4 columns × 5 and 4 tickets lets a random player win about half the time; the tight split of the
  same tickets about 5%.
- **Size and ticket height add depth smoothly**; double patties (L21–25, 27, 33, 37, 39, 40) make
  burgers steal patties from each other. **A third plate is a relief knob** (L31 on), so late
  levels add tickets. **Lids force a serve order** and make tight levels a little easier.`;

const problems = rows.flatMap((r) => r.problems.map((p) => `L${r.lv.n} (${'TBQ'[r.lv.world]}${r.lv.local}): ${p}`));
const auditLine = (w: number[]) => {
  const ps = rows.filter((r) => w.includes(r.lv.world)).flatMap((r) => r.problems.map((p) => `- L${r.lv.n} (local ${r.lv.local}): ${p}`));
  const n = rows.filter((r) => w.includes(r.lv.world)).length;
  return ps.length ? ps.join('\n') : `All ${n} stored solutions replay to a win in the play simulation, every pantry is zero-waste, neighbouring levels serve different dish sets and the stored solver numbers match a fresh measurement.`;
};

const doc = `# Difficulty: how the campaign is measured

Generated by \`bun scripts/audit-levels.ts\` from \`src/data/levels.json\` (built by
\`bun scripts/build-levels.ts\`, the Taquería by \`bun scripts/build-taqueria.ts\` +
\`bun scripts/merge-levels.ts\`). Difficulty is measured, not guessed: every level is solved exactly
and played by simulated players; the generator (\`src/core/generator.ts\`) keeps the candidate that
lands in its level's target band (\`src/core/progression.ts\`), aiming for the middle of the
band so the curve stays smooth.

The campaign alternates kitchens in **shifts of five levels** (\`src/core/shifts.ts\`):
${shiftLine} (T Trattoria, B Burger Joint, Q Taquería). Each kitchen keeps its own ladder of 40
**local** levels: its dishes, mechanics, tiers and targets all follow the local index, so its
difficulty keeps climbing across its visits, and every shift ends on the kitchen's local hard level
or banquet (every 5th campaign level). The tables list levels by local index with their campaign
number (#). The Trattoria plays by the combo rules (\`src/core/kitchen.ts\`), the Burger Joint by
the stack rules (\`src/core/burger.ts\`); the Taquería is in [difficulty-taqueria.md](difficulty-taqueria.md).

## The players and numbers

- **Random win** — exact probability that a player tapping a random legal column wins (the solver
  sums over the whole game tree). **From ⅓** is the same number from a third of the way along the
  stored solution: it shows the thinking doesn't stop after the first moves.
- **Greedy** — Trattoria: takes a move that preps or serves at once, else an item a seated guest
  still needs, else the leftmost column. Burger Joint: takes an item that goes straight onto a
  plate, else parks the item needed soonest (layers to go on a plate, then the queue), else the
  leftmost column. Deterministic: it wins or it doesn't.
- **Lookahead (LA)** — the smallest k for which the greedy player that also avoids moves after
  which fewer than k moves can still be played wins. 0 = greedy play is enough.
- **Thinking player** — plans 2 or 3 moves ahead (alternating) with a position value. Trattoria:
  served dishes, counter items the seated guests need, free slots, never a prep nobody can use (an
  extra sauce). Burger Joint: served dishes, layers on the plates, few parked items and parked
  items that are needed soon. Ties are broken at random; the tables show a holdout sample of
  ${HOLDOUT_RUNS} games per level with fresh seeds (the build selected levels with a different 64-game sample).
- **Critical decisions** — moves along the stored solution where some legal move makes the level
  unwinnable ("late" = after the first third). **Decisions** = moves with more than one legal choice.
- **Safe-move ratio** — share of legal moves that keep the level winnable, averaged along the solution.
- **Trap** — the most moves a player can still make after a fatal move before getting stuck. Deep
  traps are why the game should tell the player when the kitchen can no longer be finished.
- **Tight** — the level can't be won with one counter slot (spot) fewer. Every hard and banquet
  level is tight, and so is every normal level from the 11th local level on, except levels that
  introduce a dish or mechanic (they may keep a spare slot).

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
  (dough + mozzarella + bacon), tiramisu 21 (cream + coffee); a 2-slot counter at 19, lids at 36. No
  dish holds both halves of a prep raw, and a prep can only happen on a level once a dish that uses
  it was introduced (basil never meets cheese before L8, potato never meets flour before L16).
- **Burger Joint (5 stacked dishes).** Burger 1, hot dog 2, pancakes 3, club sandwich 6, sundae 8;
  fillings join as cheese 1, butter 3, bacon 6, lettuce 7, ice cream 8, tomato 9, chocolate 12,
  pickles 13, onion 16, berries 17; double patty 21, lids 26, a third plate 31.

## World 1 — Trattoria

### Targets

${TARGETS_W1}

Why these numbers: "anyone wins" early levels with a first real decision by L3, then normal levels
that beat the greedy player with the random player at or under 15% and 2–4 moves of lookahead, hard
levels at ≤ 3% random / LA ≥ 4 / ≥ 5 critical decisions, and banquets at ≤ 1% / LA ≥ 5 — while the
thinking player still wins most normal levels and about half of the hard ones, so the levels stay
fair. The early banquet (L10) gets its own band. Normal levels also have a floor (4% → 2%) so that
no normal level is harder than the hard ones next to it. Levels that introduce something play in a
gentler band (8%–30%).

### Measured

${tierTable(0)}

### Levels

Dishes: Sp spaghetti, Br bruschetta, Cp caprese, Pz pizza, Om omelette, Ri risotto, Pe pasta al
pesto, Cb carbonara, Mi minestrone, Gn gnocchi, Cz calzone, Ti tiramisu. Board = columns × tallest
column; a lidded column opens after the given number of served dishes.

${levelTable(0)}

### What moves difficulty

- **Counter size is the strongest dial** (one slot fewer roughly divides the random win by three
  on the same menu), **tightness the second** (keeping only levels that can't be won with one slot
  fewer).
- **Reactions to avoid make the thinking.** A second tomato turns a bruschetta's, a caprese's or a
  minestrone's raw tomato into sauce; basil next to the cheese becomes pesto; an egg next to flour
  becomes dough before it can be an omelette, carbonara or cream; a potato next to flour becomes
  gnocchi. Menus that mix a prep with a dish that needs one of its halves raw are the hard ones.
- **Shared raw parts** (mushroom and cheese for omelette and risotto, pasta for spaghetti, pesto
  pasta and carbonara, mozzarella and bacon for caprese, carbonara and calzone) make the order of
  serving matter. **More seats** make levels easier (more outlets). **Lids** force a serve order;
  the generator checks how many winning lines they cut (stored as \`lidCut\`).

## World 2 — Burger Joint

Every dish is an exact stack, bottom layer first. A taken item goes onto the leftmost plate whose
next layer it is, else it parks on the counter (a free spot is needed); parked items slide onto the
plates when they become the next layer. Every level has a 3-spot counter and is zero-waste.

### Targets

${TARGETS_W2}

The bands are the Trattoria's with a longer ramp: L2–4 are raw deals that anyone wins, L6–9 are
breathers with exactly one spare counter spot (tight for one spot fewer) and L5 is a small tight
kitchen. From L11 on every level is tight (the lid intro, L26, too).

### Measured

${tierTable(1)}

### Levels

Guests: each ticket's dish and its layer count (Bu burger, Hd hot dog, Pk pancakes, Sw club
sandwich, Su sundae). Board = columns × tallest column; a lidded column opens after the given
number of served dishes.

${levelTable(1)}

### How the stacked levels are made, and what moves their difficulty

${KNOBS_W2}

## Endless mode

Levels after the campaign come from \`generateEndlessLevel(n)\` (\`src/core/generator.ts\`, safe in
a Web Worker) with \`endlessSpec(n)\` (\`src/core/progression.ts\`). They keep the 5-level shifts,
taking the Trattoria and the Burger Joint in turn (\`ENDLESS_KITCHENS\` in shifts.ts); each shift
plays its kitchen's late shapes (local 31–35 or 36–40 on alternate visits) and bands without the
thinking player and the lid check, so its 5th level is a hard level or a banquet. At most 24
candidates per Trattoria level and 4 per Burger Joint level (100-swap guided splits); deterministic
for the level number.

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
normal level.

${section('Rules in one paragraph').replace('Twist from L111', 'Twist from local L31')}

${section('Players and numbers')}

## Menu

Twelve dishes, all made the taco way (a container and its exact fillings): tacos (a tortilla + 3)
carnitas (pork, salsa, cheese), pollo (chicken, salsa, lettuce), veggie (beans, corn, lettuce),
frijol (beans, cheese, salsa) and verde (chicken, guacamole, corn); the quesadilla (chicken and a
double helping of cheese) and the tostada (beans, lettuce, guacamole); burritos (a wrap + 4)
carnitas, pollo, veggie and verde, and enchiladas (chicken, beans, cheese, salsa). Every taco and
its burrito share a colour on the plate (red carnitas, gold pollo, green veggie, purple frijol, teal
verde), so they are told apart at a glance. Every level mixes two or three dishes (banquets more),
spread evenly, and neighbouring levels never serve the same set.

## Targets

The fit guard and the landing-slot rule remove every one-move blunder, so random play is stronger
than in the Trattoria and the random-win bands sit higher (as in the research tiers).

${TARGETS_W3}

Teaching order: a tortilla catches fillings and salsa drops in (1–3, the chicken taco at 2) → park a
half-made taco under a new tortilla (4) → the quesadilla's double cheese (6) → queued tickets and
the scoop (7) → frijol (8) → a 3-slot counter (11) → burritos next to tacos: which container
receives? (13) → enchiladas (16) → guacamole and taco verde (21) → the tostada (23) → topping last (31).

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
    `#${String(lv.n).padStart(3)} ${'TBQ'[lv.world]}${String(lv.local).padStart(2)} ${lv.tier.padEnd(9)} rnd=${pct(st.random, 2).padStart(7)} greedy=${st.greedy ? 'win ' : 'lose'} LA=${st.lookahead} ` +
      `crit=${st.critical}/${st.decisions} think(holdout)=${pct(r.think, 0).padStart(4)} (build ${st.thinking === undefined ? '-' : pct(st.thinking, 0)})` +
      `${r.problems.length ? '  PROBLEMS: ' + r.problems.join('; ') : ''}`,
  );
}
console.log(`\n${problems.length ? problems.length + ' problems' : 'no problems'}; wrote ${DOC} and ${TACO_DOC} in ${secs.toFixed(1)}s`);
if (problems.length) process.exitCode = 1;
