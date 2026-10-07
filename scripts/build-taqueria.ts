/**
 * Builds the Taquería's 40 local levels (world 3; their campaign numbers come from the shift layout
 * in src/core/shifts.ts) into src/data/levels-taqueria.json: every level is generated from the
 * ladder in src/core/tacoGen.ts and measured by the simulated players (src/core/metrics.ts with
 * the taco heuristic). Seeds are derived from the local index, so a rebuild is reproducible. The
 * main campaign file (levels.json) is not touched; merge separately (scripts/merge-levels.ts).
 *
 *   bun scripts/build-taqueria.ts [out=src/data/levels-taqueria.json]
 *   LEVELS=5,10 bun scripts/build-taqueria.ts    rebuild only these LOCAL levels, keep the others in place
 *   RESUME=1 bun scripts/build-taqueria.ts       continue an interrupted build from its checkpoint
 *   SALT=2 LEVELS=95 bun ...                     try different seeds for a level
 *   ATTEMPTS=300 ...                             candidates per seed (default 200)
 *
 * The output file is rewritten after every level (checkpoint).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashString } from '../src/core/rng';
import {
  TAQUERIA_LEVELS, generateTacoLevel, tacoAim, tacoObjective, tacoThinking, taqueriaSpec, type TacoGenResult,
} from '../src/core/tacoGen';
import { roundStats } from '../src/core/metrics';
import type { LevelDef } from '../src/core/types';

const OUT = process.argv[2] ?? 'src/data/levels-taqueria.json';
const ONLY = process.env.LEVELS ? new Set(process.env.LEVELS.split(',').map(Number)) : null;
const RESUME = process.env.RESUME === '1';
const SALT = process.env.SALT ?? '';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 200);
/** thinking-player games per candidate near the target */
const THINK_RUNS = 64;
/** seeds tried per level when the first one misses the target */
const SEEDS = 3;

const previous: LevelDef[] = (ONLY || RESUME) && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
// keyed by local index; a kept level takes its campaign number from the current shift layout
const byLocal = new Map(previous.filter((l) => l.local).map((l) => [l.local!, { ...l, n: taqueriaSpec(l.local!).n }]));
const levels: LevelDef[] = [];

function save(): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const sorted = [...levels].sort((a, b) => a.n - b.n);
  writeFileSync(OUT + '.tmp', '[\n' + sorted.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
  renameSync(OUT + '.tmp', OUT);
}

const pct = (v: number | undefined, d = 1) => (v === undefined ? '   -' : (100 * v).toFixed(d).padStart(5));
const short = (d: string) => d.replace('taco_', '').replace('burrito_', 'B-');

function line(lv: LevelDef, note: string): string {
  const st = lv.stats!;
  const depth = Math.max(...lv.columns.map((c) => c.length));
  return (
    `#${String(lv.n).padStart(3)} Q${String(lv.local).padStart(2)} ${lv.tier.padEnd(9)} ${String(st.items).padStart(2)} items ${lv.columns.length}x${depth} ` +
    `slots=${lv.slots} seats=${lv.seats} guests=${lv.orders.length}${lv.toppings ? ' top' : '    '} ` +
    `rnd=${pct(st.random, 2)}% @1/3=${pct(st.phaseRandom)}% greedy=${st.greedy ? 'win ' : 'lose'} LA=${st.lookahead} ` +
    `crit=${st.critical}/${st.decisions} late=${st.lateCritical} trap=${st.trapDepth} think=${pct(st.thinking, 0)}% ` +
    `${st.tight ? 'tight' : '     '} states=${st.states} ${note}`
  );
}

const t0 = performance.now();
for (let local = 1; local <= TAQUERIA_LEVELS; local++) {
  if ((ONLY && !ONLY.has(local)) || (RESUME && byLocal.has(local))) {
    const kept = byLocal.get(local);
    if (kept) levels.push(kept);
    else if (ONLY) throw new Error(`local level ${local} is missing from ${OUT}; build it with LEVELS=${local}`);
    continue;
  }
  const ts = performance.now();
  const spec = taqueriaSpec(local);
  let best: TacoGenResult | null = null;
  for (let k = 0; k < SEEDS; k++) {
    const seed = hashString(`taqueria:${local}${SALT ? ':' + SALT : ''}${k ? ':' + k : ''}`);
    const res = generateTacoLevel(spec, seed, { attempts: ATTEMPTS, thinkRuns: THINK_RUNS, keep: 4 });
    const better = res && (!best || res.dist < best.dist || (res.dist === best.dist && tacoAim(res.level.stats!, spec.target) < tacoAim(best.level.stats!, spec.target)));
    if (better) best = res;
    if (best && best.dist === 0) break;
  }
  if (!best) throw new Error(`local level ${local}: generation failed`);
  const lv = best.level;
  // every stored level carries the thinking player's rate (the generator only asks it near the target)
  if (lv.stats!.thinking === undefined) lv.stats = roundStats({ ...lv.stats!, thinking: tacoThinking(lv, THINK_RUNS, lv.seed!) });
  levels.push(lv);
  save();
  const dist = tacoObjective(lv.stats!, spec.target);
  console.log(line(lv, `${dist === 0 ? 'ok ' : 'OFF ' + dist.toFixed(2)} ${(performance.now() - ts).toFixed(0)}ms  ${lv.orders.map(short).join(' ')}  — ${spec.theme}`));
}
save();
console.log(`wrote ${levels.length} levels to ${OUT} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
