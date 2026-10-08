import type { Tier } from '../core/types';
import type { BoosterId } from './save';

/** Level at which each helper becomes available (with a small gift). */
export const BOOSTER_UNLOCK: Record<BoosterId, number> = { hint: 4, slot: 8 };
export const BOOSTER_GIFT = 2;
export const BOOSTER_PRICE: Record<BoosterId, number> = { hint: 60, slot: 90 };
/** Free undos per level (a rewind from the stuck card counts as one); each extra one costs coins. */
export const UNDO_FREE = 3;
export const UNDO_PRICE = 20;

export interface Reward {
  base: number;
  stars: number;
  clean: number;
  total: number;
}

/** Coins for a win: the level (first time only), stars beyond the previous best, a clean run. */
export function coinsFor(tier: Tier, stars: number, clean: boolean, prevStars: number): Reward {
  const first = prevStars === 0;
  const base = first ? (tier === 'superhard' ? 40 : tier === 'hard' ? 25 : 12) : 4;
  const starCoins = Math.max(0, stars - prevStars) * 5;
  const cleanCoins = clean && first ? 5 : 0;
  return { base, stars: starCoins, clean: cleanCoins, total: base + starCoins + cleanCoins };
}
