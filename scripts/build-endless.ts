/**
 * Builds the endless pool: levels after the campaign (121–240 by default), generated offline at
 * campaign quality with the full guided search (src/core/guided.ts) and the full late targets of
 * the level each one plays like (progression.ts poolSpec, tacoGen.ts taqueriaPoolSpec). The game
 * loads src/data/levels-endless.json lazily; past the pool the Web Worker generates levels.
 *
 *   bun scripts/build-endless.ts                          every kitchen → src/data/levels-endless.json
 *   KITCHEN=2 OUT=/tmp/q.json bun scripts/build-endless.ts   one kitchen into a partial file (run three in parallel)
 *   MERGE=/tmp/t.json,/tmp/b.json,/tmp/q.json bun scripts/build-endless.ts   merge partial files
 *   FROM=121 TO=240 RESUME=1 ATTEMPTS=6 ITERS=120 ...
 *
 * Neighbouring levels of a kitchen serve different dish sets. Stored levels keep only what the game
 * needs (the board, the solution and a compact set of numbers for the debug line).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { DishId } from '../src/core/content';
import { generateGuidedLevel } from '../src/core/generator';
import { CAMPAIGN_LEVELS, endlessLocal, endlessWorld, poolSpec, shiftOf } from '../src/core/progression';
import { hashString } from '../src/core/rng';
import { generateGuidedTaco, TAQUERIA_WORLD, taqueriaPoolSpec } from '../src/core/tacoGen';
import type { LevelDef, LevelStats } from '../src/core/types';

const OUT = process.env.OUT ?? 'src/data/levels-endless.json';
const FROM = Number(process.env.FROM ?? CAMPAIGN_LEVELS + 1);
const TO = Number(process.env.TO ?? CAMPAIGN_LEVELS + 120);
const KITCHENS = process.env.KITCHEN ? [Number(process.env.KITCHEN)] : [0, 1, 2];
const RESUME = process.env.RESUME === '1';
/** seeds tried per level when the first misses its target */
const SEEDS = Number(process.env.SEEDS ?? 1);

/** What a stored pool level keeps. */
function trim(lv: LevelDef): LevelDef {
  const st = lv.stats!;
  const stats: LevelStats = {
    random: st.random, greedy: st.greedy, lookahead: st.lookahead, critical: st.critical, decisions: st.decisions, safeRatio: st.safeRatio,
    states: st.states, items: st.items, plan: st.plan, depth: st.depth, forced: st.forced, deep: st.deep, goal: st.goal, careful: st.careful,
    bottleneck: st.bottleneck,
  };
  if (st.guesses) stats.guesses = st.guesses;
  const out: LevelDef = { n: lv.n, world: lv.world, menu: lv.menu, tier: lv.tier, columns: lv.columns, slots: lv.slots, seats: lv.seats, orders: lv.orders };
  for (const k of ['rules', 'tickets', 'lids', 'frozen', 'cloches', 'stove', 'toppings'] as const) if (lv[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = lv[k];
  out.solution = lv.solution;
  out.seed = lv.seed;
  out.stats = stats;
  return out;
}

function write(file: string, levels: LevelDef[]): void {
  const sorted = [...levels].sort((a, b) => a.n - b.n);
  writeFileSync(file + '.tmp', '[\n' + sorted.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
  renameSync(file + '.tmp', file);
}

if (process.env.MERGE) {
  const all = process.env.MERGE.split(',').flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as LevelDef[]);
  const byN = new Map(all.map((l) => [l.n, l]));
  const levels = [...byN.values()].sort((a, b) => a.n - b.n);
  levels.forEach((l, i) => {
    if (l.n !== levels[0].n + i) throw new Error(`pool level ${levels[0].n + i} is missing`);
  });
  write(OUT, levels);
  console.log(`merged ${levels.length} pool levels (${levels[0].n}–${levels[levels.length - 1].n}) into ${OUT}: ${(readFileSync(OUT).length / 1024).toFixed(0)} KB`);
  process.exit(0);
}

const kept: LevelDef[] = RESUME && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const levels = new Map(kept.map((l) => [l.n, l]));
const pct = (v: number | undefined) => (v === undefined ? '-' : String(Math.round(100 * v)));
const setOf = (orders: readonly DishId[]) => [...new Set(orders)].sort().join(',');
const t0 = performance.now();
/** the dish set each kitchen served last (neighbouring levels must differ) */
const lastSet = new Map<number, string>();
for (let n = FROM; n <= TO; n++) {
  const world = endlessWorld(n);
  if (!KITCHENS.includes(world)) continue;
  const have = levels.get(n);
  if (have) {
    lastSet.set(world, setOf(have.orders));
    continue;
  }
  const ts = performance.now();
  let res: { level: LevelDef; dist: number } | null = null;
  for (let step = 0; step < 6 && !res; step++) {
    if (world === TAQUERIA_WORLD) {
      const spec = taqueriaPoolSpec(n, endlessLocal(n), shiftOf(n).visit, step);
      if (setOf(spec.dishes) === lastSet.get(world)) continue;
      for (let k = 0; k < SEEDS; k++) {
        const r = generateGuidedTaco(spec, hashString(`pool:${n}:${k}`), {
          attempts: Number(process.env.ATTEMPTS ?? 4), iters: Number(process.env.ITERS ?? 60), keep: 1, runs: 12, holdout: 32, budget: 300_000, worlds: 16,
        });
        if (r && (!res || r.dist < res.dist)) res = r;
        if (res && res.dist === 0) break;
      }
    } else {
      const spec = poolSpec(n, step);
      if (setOf(spec.dishes) === lastSet.get(world)) continue;
      for (let k = 0; k < SEEDS; k++) {
        const r = generateGuidedLevel(spec, hashString(`pool:${n}:${k}`), {
          attempts: Number(process.env.ATTEMPTS ?? 4), iters: Number(process.env.ITERS ?? 80), keep: 1, runs: 12, holdout: 32,
        });
        if (r && (!res || r.dist < res.dist)) res = r;
        if (res && res.dist === 0) break;
      }
    }
  }
  if (!res) throw new Error(`pool level ${n}: generation failed`);
  const lv = trim(res.level);
  if (setOf(lv.orders) === lastSet.get(world)) throw new Error(`pool level ${n} repeats the dish set ${setOf(lv.orders)}`);
  lastSet.set(world, setOf(lv.orders));
  levels.set(n, lv);
  write(OUT, [...levels.values()]);
  const st = lv.stats!;
  console.log(
    `#${n} ${'TBQ'[world]} ${lv.tier.padEnd(9)} ${st.items} items ${lv.columns.length} cols plan=${st.plan!.map(pct).join('/')} goal=${pct(st.goal)} careful=${pct(st.careful)} ` +
      `bn=${st.bottleneck?.toFixed(1)} rnd=${(100 * st.random).toFixed(2)}% ${res.dist === 0 ? 'ok' : 'OFF ' + res.dist.toFixed(2)} ${((performance.now() - ts) / 1000).toFixed(1)}s ${lv.orders.join(' ')}`,
  );
}
console.log(`wrote ${levels.size} pool levels to ${OUT} in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
