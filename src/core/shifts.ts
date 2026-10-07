/**
 * The campaign runs in shifts: five levels in one kitchen, then five in another. Every kitchen keeps
 * its own 40-level ladder (dishes, mechanics, tiers and targets by its LOCAL index 1–40), so its
 * difficulty keeps climbing across its visits; the campaign level number `n` is the global position.
 * Each shift's 5th level is its kitchen's local 5th / 10th / ... level, so globally every 5th level
 * is still a hard or super hard "rush".
 *
 * World (kitchen) index: 0 Trattoria, 1 Burger Joint, 2 Taquería. No imports: safe for the UI and
 * the level builders alike.
 */

/** Levels in a shift. */
export const SHIFT_LEN = 5;
/** Levels of each kitchen's ladder (8 shifts). */
export const LEVELS_PER_KITCHEN = 40;
/**
 * Kitchen of each campaign shift: two Trattoria shifts first, the Burger Joint from level 11, the
 * Taquería from level 26, then the three take turns; the Taquería's late ladder closes the campaign.
 */
export const SHIFT_ORDER: readonly number[] = [0, 0, 1, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 1, 2, 2];
/** Stored campaign levels (src/data/levels.json); endless levels follow. */
export const CAMPAIGN_LEVELS = SHIFT_ORDER.length * SHIFT_LEN;
/** Kitchens the endless shifts rotate through after the campaign, in order. */
export const ENDLESS_KITCHENS: readonly number[] = [0, 1, 2];

export interface Shift {
  /** 0-based shift number (campaign shifts first, then endless ones) */
  index: number;
  /** kitchen (world index) */
  world: number;
  /** first and last campaign level number of the shift */
  first: number;
  last: number;
  /** kitchen-local index of the shift's first level (1, 6, 11, ... 36); 0 for endless shifts */
  local: number;
  /** 1-based visit number at this kitchen (its 1st, 2nd, ... shift; endless shifts keep counting) */
  visit: number;
  endless: boolean;
}

/** shift index -> kitchen-local index of its first level */
const FIRST_LOCAL: number[] = [];
{
  const seen = [0, 0, 0];
  for (const w of SHIFT_ORDER) {
    FIRST_LOCAL.push(seen[w] * SHIFT_LEN + 1);
    seen[w]++;
  }
}

/** The shift that holds level n (campaign or endless). */
export function shiftOf(n: number): Shift {
  const index = shiftIndex(n);
  const first = index * SHIFT_LEN + 1;
  const last = first + SHIFT_LEN - 1;
  if (index < SHIFT_ORDER.length) {
    const local = FIRST_LOCAL[index];
    return { index, world: SHIFT_ORDER[index], first, last, local, visit: (local - 1) / SHIFT_LEN + 1, endless: false };
  }
  const e = index - SHIFT_ORDER.length;
  const world = ENDLESS_KITCHENS[e % ENDLESS_KITCHENS.length];
  const visit = SHIFT_ORDER.filter((w) => w === world).length + Math.floor(e / ENDLESS_KITCHENS.length) + 1;
  return { index, world, first, last, local: 0, visit, endless: true };
}

/** 0-based shift index of level n (campaign or endless). */
export function shiftIndex(n: number): number {
  return Math.floor((Math.max(1, n) - 1) / SHIFT_LEN);
}

/** 1-based visit number of level n's shift at its kitchen (the kitchen's 1st, 2nd, ... stop). */
export function visitOf(n: number): number {
  return shiftOf(n).visit;
}

/** Kitchen (world index) of level n. */
export function kitchenAt(n: number): number {
  return shiftOf(n).world;
}

/** Kitchen-local index (1–40) of campaign level n; 0 past the campaign. */
export function localOf(n: number): number {
  const s = shiftOf(n);
  return s.endless ? 0 : s.local + (n - s.first);
}

/** Campaign level number of a kitchen's local level (1–40). */
export function campaignLevel(world: number, local: number): number {
  const shift = Math.floor((local - 1) / SHIFT_LEN);
  let seen = 0;
  for (let i = 0; i < SHIFT_ORDER.length; i++) {
    if (SHIFT_ORDER[i] !== world) continue;
    if (seen++ === shift) return i * SHIFT_LEN + 1 + ((local - 1) % SHIFT_LEN);
  }
  throw new Error(`kitchen ${world} has no local level ${local}`);
}

/** Every campaign shift, in order (for the map). */
export function campaignShifts(): Shift[] {
  return SHIFT_ORDER.map((_, i) => shiftOf(i * SHIFT_LEN + 1));
}
