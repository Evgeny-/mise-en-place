import type { DishId, FoodId, Text } from './content';

export type Tier = 'normal' | 'hard' | 'superhard';

/** Difficulty measured by simulated players (see generator.ts). */
export interface LevelStats {
  /** exact win probability of a player who taps a random legal column */
  random: number;
  /** does the greedy player (take what helps the current tickets) win? */
  greedy: boolean;
  /** smallest look-ahead (in moves) a careful player needs; 0 = greedy play wins */
  lookahead: number;
  /** moves along the stored solution where some legal move loses */
  critical: number;
  /** moves along the stored solution with more than one legal choice */
  decisions: number;
  /** share of legal moves that keep the level winnable, averaged along the solution */
  safeRatio: number;
  /** distinct game states the solver visited */
  states: number;
  /** exact random-player win probability from a third of the way along the solution */
  phaseRandom?: number;
  /** critical moves after the first third of the solution */
  lateCritical?: number;
  /** most moves that can still be played after a fatal move along the solution before getting stuck */
  trapDepth?: number;
  /** win rate of the thinking player (plans 2–3 moves ahead) */
  thinking?: number;
  /** unwinnable with one counter slot fewer */
  tight?: boolean;
  /** pantry items (= moves of every winning line) */
  items?: number;
  /** lidded levels: share of the winning lines (without lids) that the lids rule out */
  lidCut?: number;
}

/**
 * What a level teaches for the first time (the UI shows a card). Taquería mechanics: 'tortilla'
 * (a tortilla catches the next fillings), 'park' (lay a new tortilla over a half-made taco),
 * 'topping' (a ticket's marked filling must go in last).
 */
export type Intro = DishId | 'lid' | 'slots' | 'tortilla' | 'park' | 'topping';

export interface LevelDef {
  /** campaign level number, 1-based (the global position; see shifts.ts) */
  n: number;
  /** world (kitchen) index, 0-based: 0 Trattoria, 1 Burger Joint, 2 Taquería */
  world: number;
  /** campaign levels: the kitchen-local index 1–40 (its ladder, tier and targets); absent for endless levels */
  local?: number;
  /** key into MENUS */
  menu: string;
  tier: Tier;
  /** pantry columns, top item first */
  columns: FoodId[][];
  /** counter slots; a full counter only accepts an item that combines at once */
  slots: number;
  /** guests served at the same time (active tickets) */
  seats: number;
  /** dishes in arrival order; the first `seats` guests are seated at the start */
  orders: DishId[];
  /** which rules this kitchen plays by (default: combo, the Trattoria rules) */
  rules?: 'combo' | 'burger' | 'taco';
  /** burger kitchens: each order's layers, bottom to top (orders[i] is 'burger') */
  tickets?: FoodId[][];
  /** per column: the column opens after this many dishes were served (0 = open) */
  lids?: number[];
  /** taco kitchens, twist "topping last": per dish, the filling that must go into it last */
  toppings?: Partial<Record<DishId, FoodId>>;
  /** a winning sequence of column indices */
  solution?: number[];
  stats?: LevelStats;
  name?: Text;
  seed?: number;
  /** the dish or mechanic this level introduces */
  intro?: Intro;
}
