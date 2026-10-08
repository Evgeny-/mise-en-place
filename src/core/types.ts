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
  /**
   * Planner profile: win rate of the planning player who looks 1, 2, 3, 4 and 5 moves ahead
   * (index 0 = depth 1). On cloche levels the planner can't see under the cloches (it plans on a
   * guess of what is hidden, consistent with what it has seen).
   */
  plan?: number[];
  /** planning depth: the smallest look-ahead (1–5) whose planner wins at least half the games; 6 = deeper */
  depth?: number;
  /** decisions along the solution where the greedy (obvious) move loses */
  forced?: number;
  /** decisions along the solution with a fatal move that stays playable for 3+ moves (a hidden trap) */
  deep?: number;
  /** cloche levels: steps where even a careful deducer had to guess (0 = fair: reasoning always suffices) */
  guesses?: number;
  /** cloche levels: depth-3 planner win rate if it could see under the cloches (compare plan[2]) */
  sighted?: number;
  /** frozen levels: share of the winning lines (without ice) that the ice rules out */
  iceCut?: number;
  /**
   * cloche levels: decisions (along the deducer's game) where what lies under a cloche decides
   * whether some move is safe: reasoning about the hidden tiles matters there
   */
  riddles?: number;
  /**
   * The goal-directed players (measure.ts): win rate of the strong one (plans 4 moves along the
   * orders, slips 5% of the time: a strong human's first try) and of the careful one (6 moves, no
   * slips: the fairness check).
   */
  goal?: number;
  careful?: number;
  /**
   * Bottlenecks along uniformly sampled winning lines: per line, the positions where exactly one
   * move keeps the level winnable, each scoring 1 + the moves a wrong choice stays hidden (`narrow`
   * counts the positions alone).
   */
  bottleneck?: number;
  narrow?: number;
}

/**
 * What a level teaches for the first time (the UI shows a card). Taquería mechanics: 'tortilla'
 * (a tortilla catches the next fillings), 'park' (lay a new tortilla over a half-made taco),
 * 'topping' (a ticket's marked filling must go in last).
 */
export type Intro = DishId | 'lid' | 'slots' | 'tortilla' | 'park' | 'topping' | 'cloche' | 'frozen' | 'oven' | 'grill' | 'set' | 'vip';

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
  /**
   * Cloches: [column, row] of tiles under a cloche (row 0 = the column's top at the start; always
   * >= 1). A cloche lifts when its tile reaches the front of its column and stays lifted (undo
   * doesn't cover it again).
   */
  cloches?: [number, number][];
  /**
   * Frozen tiles: [column, row, thaw]. The tile can be taken only after `thaw` takes in total; the
   * column is blocked behind it until then. The ice shows the takes still to go.
   */
  frozen?: [number, number, number][];
  /**
   * The stove (rules: kitchen.ts, burger.ts). Trattoria: per dish, the takes it bakes in the oven
   * once its parts are together (its guest waits; the dish takes a counter slot meanwhile). Burger
   * Joint: `patty`, the takes a patty grills before it can go on a plate.
   */
  stove?: Partial<Record<DishId | FoodId, number>>;
  /**
   * Set menus: order indices i where orders[i] and orders[i + 1] are one guest's two dishes. The
   * first one finished waits on a counter slot until the other is ready; both go out together.
   */
  sets?: number[];
  /**
   * VIP guests: order indices of their (first) dish. While a VIP is seated, other guests' finished
   * dishes wait on the counter (a slot each) until the VIP is served.
   */
  vip?: number[];
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
