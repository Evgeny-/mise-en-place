/**
 * Puts the separately built Taquería levels (bun scripts/build-taqueria.ts →
 * src/data/levels-taqueria.json) into the campaign in src/data/levels.json at their shift positions
 * (src/core/shifts.ts). The other kitchens' levels keep their exact bytes. Run: bun scripts/merge-levels.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CAMPAIGN_LEVELS, campaignLevel, kitchenAt } from '../src/core/shifts';
import type { LevelDef } from '../src/core/types';

const TACO_WORLD = 2;
const main = JSON.parse(readFileSync('src/data/levels.json', 'utf8')) as LevelDef[];
const taco = JSON.parse(readFileSync('src/data/levels-taqueria.json', 'utf8')) as LevelDef[];
const kept = main.filter((l) => l.world !== TACO_WORLD && l.n <= CAMPAIGN_LEVELS && kitchenAt(l.n) === l.world);
const placed = taco.map((l) => ({ ...l, n: campaignLevel(TACO_WORLD, l.local!) }));
const out = [...kept, ...placed].sort((a, b) => a.n - b.n);
out.forEach((l, i) => {
  if (l.n !== i + 1) throw new Error(`level ${l.n} at position ${i + 1} (build the missing kitchen levels first)`);
  if (kitchenAt(l.n) !== l.world) throw new Error(`level ${l.n} belongs to kitchen ${kitchenAt(l.n)}, not ${l.world}`);
});
if (out.length !== CAMPAIGN_LEVELS) throw new Error(`${out.length} levels, expected ${CAMPAIGN_LEVELS}`);
writeFileSync('src/data/levels.json', '[\n' + out.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
console.log(`levels.json: ${kept.length} + ${placed.length} Taquería = ${out.length} levels`);
