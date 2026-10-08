import type { PlanTarget } from './guided';
import type { Intro, Tier } from './types';

/**
 * The planning part of every kitchen's targets: how far ahead a player must think, measured by the
 * planner profile (measure.ts). reach(d) is the best win rate of the planners that look at most d
 * moves ahead. Every kitchen opens engaging (openingBands, local 2–8): from its second level on
 * each level holds a decision where the obvious move loses and the trap shows two moves ahead, and
 * by local 5–8 a player needs to look about three moves ahead. Normal levels then slide from the
 * Trattoria's L11 to "three is rarely enough, five usually is" (local 39); hard levels and banquets
 * go further. Levels that introduce something stay a little gentler.
 *
 * `first`: the kitchen's first local level with the sliding normal bands (the Trattoria and the
 * Burger Joint 9, the Taquería 6); the normal bands slide from two levels after it to L39.
 */
export function planBands(tier: Tier, local: number, intro: Intro | undefined, first = 9, randomScale = 1): PlanTarget {
  const t = bands(tier, local, intro, first);
  if (t.maxRandom !== undefined) t.maxRandom = Math.min(1, t.maxRandom * randomScale);
  return t;
}

function bands(tier: Tier, local: number, intro: Intro | undefined, first: number): PlanTarget {
  const stage = Math.min(1, Math.max(0, (local - first - 2) / (37 - first)));
  if (local >= 2 && local <= 8 && (tier === 'normal' || local === 5)) return openingBands(local);
  // the end of the Trattoria's and the Burger Joint's first shift: three moves ahead, a deeper trap
  if (local === 9 && first === 9 && tier === 'normal') {
    return { reach: { 2: [0, 0.45], 3: [0.4, 0.85], 5: [0.6, 1] }, minForced: 3, minDeep: 2, greedyLoses: true, maxRandom: 0.3 };
  }
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

/**
 * The opening of every kitchen (local 2–8; local 1 is its tutorial). Each level holds at least one
 * forced decision (the obvious move loses) and a trap that a player looking two moves ahead sees;
 * the ramp reaches a planning depth of about three by local 5–8 (5 is the first shift's hard level,
 * 6 is a gentler intro step).
 */
export function openingBands(local: number): PlanTarget {
  if (local <= 3) return { reach: { 1: [0, 0.7], 2: [0.6, 1] }, minForced: 1, greedyLoses: true };
  if (local === 4) return { reach: { 1: [0, 0.55], 2: [0.55, 1] }, minForced: 2, greedyLoses: true };
  if (local === 5) return { reach: { 2: [0, 0.5], 3: [0.5, 1] }, minForced: 2, minDeep: 1, greedyLoses: true };
  if (local === 6) return { reach: { 2: [0, 0.6], 3: [0.5, 1] }, minForced: 2, greedyLoses: true };
  return { reach: { 2: [0, 0.5], 3: [0.55, 1] }, minForced: 2, minDeep: 1, greedyLoses: true };
}
