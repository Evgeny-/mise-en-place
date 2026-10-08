/**
 * Builds the Trattoria and Burger Joint levels of the campaign into src/data/levels.json. The
 * campaign alternates kitchens in 5-level shifts (src/core/shifts.ts); each level is built from its
 * kitchen's ladder row for its LOCAL index (src/core/progression.ts) and measured by the simulated
 * players (src/core/metrics.ts). Each kitchen's first level is an authored tutorial. Seeds are
 * derived from the menu and the local index, so a rebuild is reproducible and does not depend on
 * the shift order. Taquería levels already in the file are kept (they come from
 * build-taqueria.ts + merge-levels.ts).
 *
 *   bun scripts/build-levels.ts [out=src/data/levels.json]
 *   RESUME=1 bun scripts/build-levels.ts       keep the stored levels (byte for byte), build the rest
 *   LEVELS=5,9 bun scripts/build-levels.ts     rebuild only these campaign levels, keep the others in place
 *   KITCHEN=0 bun scripts/build-levels.ts      only the Trattoria (1: only the Burger Joint)
 *   SALT=2 LEVELS=17 bun ...                   try different seeds for a level
 *   ATTEMPTS=8 ITERS=150 ...                   drafts per seed and hill-climb steps per draft (guided.ts)
 *
 * The output file is rewritten after every level (checkpoint).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { aimDistance, generateGuidedLevel, objective, type GenResult } from '../src/core/generator';
import { finalStats } from '../src/core/guided';
import { roundStats } from '../src/core/metrics';
import { authoredLevel, BUILDER_WORLDS, CAMPAIGN_LEVELS, kitchenAt, levelSpec, localOf } from '../src/core/progression';
import { hashString } from '../src/core/rng';
import type { LevelDef } from '../src/core/types';

const OUT = process.argv[2] ?? 'src/data/levels.json';
const ONLY = process.env.LEVELS ? new Set(process.env.LEVELS.split(',').map(Number)) : null;
const KITCHENS = process.env.KITCHEN ? [Number(process.env.KITCHEN)] : BUILDER_WORLDS;
const RESUME = process.env.RESUME === '1';
const SALT = process.env.SALT ?? '';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 8);
const ITERS = Number(process.env.ITERS ?? 140);
/** planner games per depth: while searching, and for the stored numbers (fresh seeds) */
const RUNS = 16;
const HOLDOUT = 64;
/** seeds tried per level when the first one misses the target */
const SEEDS = 3;

const stored: LevelDef[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
// a stored level still belongs at its number only if the shift layout agrees
const fits = (l: LevelDef) => l.n <= CAMPAIGN_LEVELS && l.world === kitchenAt(l.n) && l.local === localOf(l.n);
const byNumber = new Map(stored.filter(fits).map((l) => [l.n, l]));
const levels: LevelDef[] = [];
// other kitchens' levels (the Taquería, or a kitchen left out with KITCHEN=) stay as they are
for (const l of byNumber.values()) if (!KITCHENS.includes(l.world)) levels.push(l);

function save(): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const sorted = [...levels].sort((a, b) => a.n - b.n);
  writeFileSync(OUT + '.tmp', '[\n' + sorted.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
  renameSync(OUT + '.tmp', OUT);
}

const pct = (v: number | undefined, d = 1) => (v === undefined ? '   -' : (100 * v).toFixed(d).padStart(5));

function line(lv: LevelDef, note: string): string {
  const st = lv.stats!;
  const depth = Math.max(...lv.columns.map((c) => c.length));
  return (
    `#${String(lv.n).padStart(3)} ${'TBQ'[lv.world]}${String(lv.local).padStart(2)} ${lv.tier.padEnd(9)} ${String(st.items).padStart(2)} items ${lv.columns.length}x${depth} ` +
    `slots=${lv.slots} seats=${lv.seats} guests=${lv.orders.length}${lv.lids ? ' lids' : '     '} ` +
    `plan=${(st.plan ?? []).map((x) => pct(x, 0).trim()).join('/')} depth=${st.depth} forced=${st.forced} deep=${st.deep} ` +
    `rnd=${pct(st.random, 2)}% greedy=${st.greedy ? 'win ' : 'lose'} LA=${st.lookahead} crit=${st.critical}/${st.decisions} trap=${st.trapDepth} ` +
    `${st.tight ? 'tight' : '     '}${lv.frozen ? ` ice=${lv.frozen.length}/${pct(st.iceCut, 0).trim()}%` : ''}` +
    `${lv.cloches ? ` cloches=${lv.cloches.length} guess=${st.guesses} riddles=${st.riddles}` : ''} ${note}`
  );
}

const t0 = performance.now();
for (let n = 1; n <= CAMPAIGN_LEVELS; n++) {
  if (!KITCHENS.includes(kitchenAt(n))) continue;
  if ((ONLY && !ONLY.has(n)) || (RESUME && byNumber.has(n))) {
    const kept = byNumber.get(n);
    if (kept) levels.push(kept);
    else if (ONLY) throw new Error(`level ${n} is missing from ${OUT}; build it with LEVELS=${n}`);
    continue;
  }
  const ts = performance.now();
  const authored = authoredLevel(n);
  if (authored) {
    // Tutorials are authored: measure them and store their solution like any other level.
    const m = finalStats(authored, { holdout: HOLDOUT, seed: 1 })!;
    const lv: LevelDef = { ...authored, solution: m.solution, stats: roundStats(m.stats) };
    levels.push(lv);
    save();
    console.log(line(lv, `authored ${(performance.now() - ts).toFixed(0)}ms`));
    continue;
  }
  const spec = levelSpec(n);
  let best: GenResult | null = null;
  for (let k = 0; k < SEEDS; k++) {
    const seed = hashString(`${spec.menu}:${spec.local}${SALT ? ':' + SALT : ''}${k ? ':' + k : ''}`);
    const res = generateGuidedLevel(spec, seed, { attempts: ATTEMPTS, iters: ITERS, keep: 3, runs: RUNS, holdout: HOLDOUT });
    const better = res && (!best || res.dist < best.dist || (res.dist === best.dist && aimDistance(res.level.stats!, spec.target) < aimDistance(best.level.stats!, spec.target)));
    if (better) best = res;
    if (best && best.dist === 0) break;
  }
  if (!best) throw new Error(`level ${n}: generation failed`);
  levels.push(best.level);
  save();
  const dist = objective(best.level.stats!, spec.target);
  const what = best.level.tickets ? 'tickets ' + best.level.tickets.map((t) => t.length).join(',') : best.level.orders.join(' ');
  console.log(line(best.level, `${dist === 0 ? 'ok ' : 'OFF ' + dist.toFixed(2)} ${(performance.now() - ts).toFixed(0)}ms  ${what}  — ${spec.theme}`));
}
save();
console.log(`wrote ${levels.length} levels to ${OUT} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
