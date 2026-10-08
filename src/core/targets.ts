import type { PlanTarget } from './guided';
import type { Intro, Tier } from './types';

/**
 * The planning part of every kitchen's targets: how far ahead a player must think, measured by the
 * planner profile (measure.ts). reach(d) is the best win rate of the planners that look at most d
 * moves ahead. Normal levels slide from "two moves ahead is often enough" (local 9) to "three is
 * rarely enough, five usually is" (local 39); hard levels and banquets go further. Levels that
 * introduce something stay gentler, and every kitchen's first levels (its teaching ramp) only ask
 * that a player looking two moves ahead wins.
 *
 * `first`: the kitchen's first local level with real planning (the Trattoria and the Burger Joint
 * 9, the Taquería 6); before it the ramp applies, and the normal bands slide from two levels after it
 * (the Trattoria's L11, the first level of its second shift) to L39.
 */
export function planBands(tier: Tier, local: number, intro: Intro | undefined, first = 9, randomScale = 1): PlanTarget {
  const t = bands(tier, local, intro, first);
  if (t.maxRandom !== undefined) t.maxRandom = Math.min(1, t.maxRandom * randomScale);
  return t;
}

function bands(tier: Tier, local: number, intro: Intro | undefined, first: number): PlanTarget {
  const stage = Math.min(1, Math.max(0, (local - first - 2) / (37 - first)));
  if (local < first && tier === 'normal') return { reach: { 2: [0.6, 1] } };
  if (local === 5) return { reach: { 2: [0.25, 0.85], 4: [0.6, 1] }, minForced: 1 };
  // the end of the first shift: a first taste of planning, two or three moves ahead
  if (local === first && tier === 'normal') return { reach: { 2: [0.3, 0.75], 3: [0.6, 1] }, minForced: 2, minDeep: 1, greedyLoses: true, maxRandom: 0.3 };
  if (tier === 'superhard') {
    if (local === 10) return { reach: { 2: [0.1, 0.5], 3: [0.3, 0.7], 5: [0.6, 1] }, minForced: 3, minDeep: 2, greedyLoses: true, maxRandom: 0.08 };
    return { reach: { 3: [0, 0.25], 4: [0, 0.4], 5: [0.25, 1] }, minForced: 4, minDeep: 4, greedyLoses: true, maxGuesses: 1, maxRandom: 0.03 };
  }
  if (tier === 'hard') {
    return {
      reach: { 2: [0, 0.2], 3: [0, 0.4 - 0.15 * stage], 5: [0.4, 1] },
      minForced: 3 + Math.round(stage), minDeep: 3 + Math.round(2 * stage), greedyLoses: true, maxRandom: 0.06,
    };
  }
  if (intro) return { reach: { 2: [0, 0.75], 3: [0.5, 1], 5: [0.7, 1] }, minForced: 1, greedyLoses: true, maxRandom: 0.4 };
  return {
    reach: { 2: [0, 0.6 - 0.4 * stage], 3: [0.3 - 0.15 * stage, 0.9 - 0.5 * stage], 5: [0.55, 1] },
    minForced: 2 + Math.round(2 * stage), minDeep: 1 + Math.round(2 * stage), greedyLoses: true, maxRandom: 0.25 - 0.15 * stage,
  };
}
