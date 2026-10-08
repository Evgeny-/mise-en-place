/**
 * The campaign ladder as data: kitchen-local level -> generator spec (board size, counter, seats,
 * orders, dishes or burger tickets, lids, tier and the target difficulty band), plus the spec for
 * endless levels after the campaign. Targets are measured by simulated players (metrics.ts);
 * docs/difficulty.md explains the numbers.
 *
 * The campaign alternates kitchens in 5-level shifts (shifts.ts). Each kitchen keeps its own ladder
 * of 40 local levels: the Trattoria (combo rules), the Burger Joint (stack rules, burger.ts) and the
 * Taquería (container rules, taco.ts; its ladder lives in tacoGen.ts). In every kitchen each 5th
 * local level is hard and each 10th super hard (a banquet: more guests, more columns). A new dish
 * or mechanic is always introduced on a normal level.
 */
import type { DishId, FoodId } from './content';
import { taqueriaIntro } from './tacoGen';
import { planBands } from './targets';
import type { BurgerShape, LevelSpec, Target } from './generator';
import {
  CAMPAIGN_LEVELS, LEVELS_PER_KITCHEN, SHIFT_LEN, campaignLevel, kitchenAt, localOf, shiftOf,
} from './shifts';
import type { Intro, LevelDef, Tier } from './types';

export {
  CAMPAIGN_LEVELS, ENDLESS_KITCHENS, SHIFT_LEN, SHIFT_ORDER, campaignLevel, campaignShifts, kitchenAt, localOf, shiftIndex, shiftOf, visitOf,
  type Shift,
} from './shifts';

/** Levels of each kitchen's ladder. */
export const LEVELS_PER_WORLD = LEVELS_PER_KITCHEN;
/** Menu of each world (index = LevelDef.world). */
export const WORLD_MENUS = ['trattoria', 'diner', 'taqueria'];
/** Rules each world's kitchen plays by. */
export const WORLD_RULES: ('combo' | 'burger' | 'taco')[] = ['combo', 'burger', 'taco'];
/** Kitchens the main builder (scripts/build-levels.ts) generates; the Taquería has its own builder. */
export const BUILDER_WORLDS = [0, 1];

/** Kitchen (world index) of level n. */
export function worldOf(n: number): number {
  return kitchenAt(n);
}

/** Tier of a kitchen-local level: every 5th is hard, every 10th super hard. */
export function tierForLocal(local: number): Tier {
  return local % 10 === 0 ? 'superhard' : local % 5 === 0 ? 'hard' : 'normal';
}

/**
 * The late local level an endless level n plays like: its kitchen's local 31–35 on odd visits and
 * 36–40 on even ones, so each kitchen's endless shifts end in a hard level and a banquet in turn.
 */
export function endlessLocal(n: number): number {
  const s = shiftOf(n);
  return 30 + (s.visit % 2 ? 0 : SHIFT_LEN) + (n - s.first) + 1;
}

/** Tier of level n (by its kitchen-local index; endless levels by the late level they play like). */
export function tierForLevel(n: number): Tier {
  return tierForLocal(n <= CAMPAIGN_LEVELS ? localOf(n) : endlessLocal(n));
}

/** Level 1, authored: two columns, one guest seat, two plates of spaghetti. Every tap order wins. */
export const TUTORIAL: LevelDef = {
  n: campaignLevel(0, 1),
  world: 0,
  local: 1,
  menu: 'trattoria',
  tier: 'normal',
  columns: [
    ['tomato', 'tomato', 'pasta'],
    ['tomato', 'pasta', 'tomato'],
  ] as FoodId[][],
  slots: 2,
  seats: 1,
  orders: ['spaghetti', 'spaghetti'],
  intro: 'spaghetti',
};

/**
 * The Burger Joint's first level, authored: one plate, two short burgers. Every tap order wins;
 * tapping the patty first shows it parking on the counter and sliding onto the plate when the
 * bottom bun arrives.
 */
export const BURGER_TUTORIAL: LevelDef = {
  n: campaignLevel(1, 1),
  world: 1,
  local: 1,
  menu: 'diner',
  tier: 'normal',
  rules: 'burger',
  columns: [
    ['bun_bottom', 'bun_top', 'patty'],
    ['patty', 'bun_bottom', 'cheese_slice', 'bun_top'],
  ] as FoodId[][],
  slots: 3,
  seats: 1,
  orders: ['burger', 'burger'],
  tickets: [
    ['bun_bottom', 'patty', 'bun_top'],
    ['bun_bottom', 'cheese_slice', 'patty', 'bun_top'],
  ] as FoodId[][],
  intro: 'burger',
};

/** The authored level of a kitchen's local index, if any. */
export function authoredLocal(world: number, local: number): LevelDef | undefined {
  if (local !== 1) return undefined;
  return world === 0 ? TUTORIAL : world === 1 ? BURGER_TUTORIAL : undefined;
}

/** The authored level n (the Trattoria's and the Burger Joint's first levels), if any. */
export function authoredLevel(n: number): LevelDef | undefined {
  return n <= CAMPAIGN_LEVELS ? authoredLocal(kitchenAt(n), localOf(n)) : undefined;
}

interface Row {
  theme: string;
  cols: number;
  depth: number;
  slots: number;
  seats: number;
  orders: [number, number];
  dishes: DishId[];
  /** burger kitchens: ticket shapes and counter slack */
  burger?: BurgerShape;
  must?: DishId[];
  items?: [number, number];
  lids?: number;
  lidMax?: number;
  /** cloches and frozen tiles (pantry.ts) */
  cloches?: number;
  frozen?: number;
  /** the stove: oven dishes and their baking takes, or the patty's grill takes */
  stove?: LevelDef['stove'];
  intro?: Intro;
  /** target overrides */
  t?: Target;
}

// Trattoria dishes, in the order they are introduced.
const S: DishId = 'spaghetti';
const BR: DishId = 'bruschetta';
const CA: DishId = 'caprese';
const PZ: DishId = 'pizza';
const OM: DishId = 'omelette';
const RI: DishId = 'risotto';
const PE: DishId = 'pesto_pasta';
const CB: DishId = 'carbonara';
const MI: DishId = 'minestrone';
const GN: DishId = 'gnocchi';
const CZ: DishId = 'calzone';
const TI: DishId = 'tiramisu';
const TG: DishId = 'tagliatelle';
const LA: DishId = 'lasagne';

/**
 * Trattoria row: `set` is exactly the level's dish set (every dish in it is ordered), so
 * neighbouring levels never serve the same set; `lead` dishes are ordered once more (a new dish
 * leads its intro level).
 */
function tr(theme: string, cols: number, depth: number, slots: number, seats: number, orders: [number, number], set: DishId[],
  extra: Partial<Row> & { lead?: DishId[] } = {}): Row {
  const { lead = extra.intro && set.includes(extra.intro as DishId) ? [extra.intro as DishId] : [], ...rest } = extra;
  return { theme, cols, depth, slots, seats, orders, dishes: set, must: [...set, ...lead], ...rest };
}

/**
 * World 1, the Trattoria (local levels). A new dish every one or two levels at first, each with one
 * lesson: two tomatoes make sauce (L1) -> bruschetta keeps ONE tomato raw (2) -> caprese, a salad of
 * three raw things (3) -> pizza: flour + egg make dough (4) -> omelette: the egg is wanted twice (6)
 * -> risotto shares the mushroom and the cheese (7) -> pesto: basil + cheese (8) -> carbonara, four
 * parts (11) -> cloches: a tile hidden until it reaches the front (12) -> minestrone: soffritto and a
 * lone tomato (13) -> gnocchi: potato + flour (16) -> calzone shares the dough (18) -> a 2-slot
 * counter (19) -> tiramisu: mascarpone + egg = cream (21) -> frozen tiles (from 26; taught in the
 * Burger Joint) -> a third seat and six columns (from 30) -> lids (36). A prep only ever appears on
 * a level after it was taught: basil never meets cheese before L8, potato never meets flour before
 * L16 (checked by the campaign test).
 */
const TRATTORIA: Record<number, Row> = {
  2: tr('new: bruschetta — bread and ONE raw tomato', 2, 5, 2, 2, [3, 3], [BR, S], { intro: BR }),
  3: tr('new: caprese — mozzarella, tomato, basil', 3, 4, 2, 2, [3, 4], [CA, BR], { intro: CA }),
  4: tr('new: pizza — flour + egg make dough', 3, 4, 3, 1, [2, 2], [PZ, S], { intro: PZ }),
  5: tr('tomato rush: sauce, bruschetta or caprese?', 4, 5, 2, 2, [5, 6], [S, BR, CA]),
  6: tr('new: omelette — the egg is wanted twice', 3, 5, 3, 2, [3, 3], [OM, PZ], { intro: OM }),
  7: tr('new: risotto — mushroom and cheese for two dishes', 3, 5, 3, 1, [3, 3], [RI, OM], { intro: RI }),
  8: tr('new: pesto — basil + cheese', 3, 5, 3, 1, [3, 3], [PE, RI], { intro: PE }),
  9: tr('keep the basil away from the cheese', 4, 5, 3, 1, [4, 5], [CA, PZ, OM]),
  10: tr('banquet: the first menu', 5, 6, 3, 2, [6, 7], [BR, PE, RI, S]),
  11: tr('new: carbonara — egg, cheese, bacon and pasta', 4, 5, 3, 2, [3, 4], [CB, OM], { intro: CB }),
  12: tr('new: cloches — what is under the dome?', 4, 5, 3, 2, [4, 4], [CB, CA, S], { intro: 'cloche', cloches: 2 }),
  13: tr('new: minestrone — soffritto, a potato and ONE tomato', 4, 5, 3, 2, [3, 4], [MI, BR], { intro: MI }),
  14: tr('soup, risotto and pesto: whose cheese?', 5, 5, 3, 2, [5, 5], [MI, PE, RI], { cloches: 2 }),
  15: tr('egg trouble: carbonara or dough?', 5, 5, 3, 2, [5, 6], [CB, PZ, CA]),
  16: tr('new: gnocchi — potato + flour', 4, 5, 3, 2, [3, 4], [GN, MI], { intro: GN }),
  17: tr('flour for gnocchi or pizza?', 5, 5, 3, 2, [5, 6], [GN, PZ, OM], { cloches: 3 }),
  18: tr('new: calzone — dough, mozzarella and bacon', 4, 5, 3, 2, [3, 4], [CZ, CA], { intro: CZ }),
  19: tr('new: small kitchen — two slots', 4, 5, 2, 2, [3, 4], [RI, CZ, S], { intro: 'slots' }),
  20: tr('banquet in a small kitchen', 5, 5, 2, 2, [6, 7], [GN, PE, BR, OM]),
  21: tr('new: tiramisu — mascarpone + egg make cream', 4, 5, 3, 2, [3, 4], [TI, PZ], { intro: TI }),
  22: tr('small kitchen: tiramisu, caprese, risotto', 5, 5, 2, 2, [5, 5], [TI, CA, RI], { cloches: 2 }),
  23: tr('new: the oven — pizza and calzone bake for a few moves', 5, 5, 3, 2, [4, 5], [PZ, CZ, CA], { intro: 'oven', stove: { pizza: 2, calzone: 2 } }),
  24: tr('two tomatoes or one?', 5, 5, 3, 2, [5, 6], [GN, TI, BR], { cloches: 3 }),
  25: tr('dough, cream or omelette? the egg decides', 5, 6, 3, 2, [6, 6], [CZ, TI, OM], { cloches: 2, stove: { calzone: 3 } }),
  26: tr('from the freezer: basil, pesto or caprese?', 5, 5, 3, 2, [5, 6], [RI, PE, CA], { frozen: 1 }),
  27: tr('new: tagliatelle al ragù — sauce meets beef: ragù', 5, 5, 3, 2, [4, 5], [TG, S, BR], { intro: TG }),
  28: tr('calzone, soup and spaghetti on ice', 5, 6, 3, 2, [6, 6], [CZ, MI, S], { frozen: 2, stove: { calzone: 2 } }),
  29: tr('every egg counts', 5, 5, 3, 2, [5, 6], [PZ, OM, GN], { cloches: 2, frozen: 1, stove: { pizza: 2 } }),
  30: tr('banquet: ragù night', 6, 5, 3, 3, [7, 7], [S, TI, TG, CB], { lead: [TG], cloches: 3 }),
  31: tr('three seats: soup, risotto and calzone', 5, 6, 3, 3, [6, 7], [MI, RI, CZ], { frozen: 2, stove: { calzone: 3 } }),
  32: tr('new: lasagne — pasta, ragù and cheese, baked', 6, 5, 3, 3, [5, 6], [LA, PE, BR], { intro: LA, stove: { lasagne: 2 } }),
  33: tr('gnocchi, caprese and omelette', 6, 5, 3, 3, [6, 7], [GN, CA, OM], { frozen: 2 }),
  34: tr('pizza, carbonara and soup', 6, 5, 3, 3, [6, 7], [PZ, CB, MI], { cloches: 3, frozen: 1, stove: { pizza: 3 } }),
  35: tr('the busy pass', 6, 5, 3, 2, [7, 7], [TI, TG, GN], { cloches: 2, frozen: 1 }),
  36: tr('new: lids — a column opens after k dishes', 5, 5, 3, 2, [4, 5], [S, CZ, OM], { lids: 1, lidMax: 2, intro: 'lid' }),
  37: tr('a lid: bruschetta, ragù and soup', 5, 5, 3, 3, [6, 6], [BR, TG, MI], { lids: 1, lidMax: 3, cloches: 2 }),
  38: tr('lids: caprese, tiramisu and pizza', 6, 5, 3, 3, [6, 7], [CA, TI, PZ], { lids: 2, lidMax: 3, frozen: 1, stove: { pizza: 2 } }),
  39: tr('a lid: carbonara, gnocchi and lasagne', 6, 5, 3, 3, [6, 7], [CB, GN, LA], { lids: 1, lidMax: 3, cloches: 3, frozen: 1, stove: { lasagne: 2 } }),
  40: tr('grand banquet', 6, 6, 3, 3, [7, 8], [MI, PZ, TG, LA, CA], { cloches: 3, frozen: 1, stove: { pizza: 2, lasagne: 3 } }),
};

/**
 * World 2, the Burger Joint (local levels): five stacked dishes under the same layer rules. A new
 * dish every two or three levels at first, each with one lesson: a burger is an exact stack, items
 * fly to the plate that needs them next and park on the counter otherwise (L1) -> a hot dog: bun,
 * sausage, topping (2) -> pancakes: the same layer twice in a row (3) -> a small tight kitchen (5)
 * -> the club sandwich: toast at both ends, so one toast fits two plates (6) -> the sundae (8) ->
 * tight kitchens and cloches from L11, frozen tiles (12), new fillings that several dishes share
 * (chocolate, pickles, onion, berries) -> taller tickets -> double patty (21) -> lids from L26 -> a
 * third plate and six columns from L31.
 * Fillings join in that order; `fillings` lists those in use so far.
 */
function BURGER_LADDER(): Record<number, Row> {
  const BU: DishId = 'burger', HD: DishId = 'hotdog', PC: DishId = 'pancakes', SW: DishId = 'sandwich', SD: DishId = 'sundae';
  const ALL = [BU, HD, PC, SW, SD];
  /** extra layers in use from each local level on */
  const joins: [number, FoodId][] = [
    [1, 'cheese_slice'], [3, 'butter'], [6, 'bacon'], [7, 'lettuce'], [8, 'ice_cream'], [9, 'tomato_slice'],
    [12, 'chocolate'], [13, 'pickles'], [16, 'onion_rings'], [17, 'berries'],
  ];
  const fillingsAt = (local: number) => joins.filter(([l]) => l <= local).map(([, f]) => f);
  const featureAt = (local: number) => joins.filter(([l]) => l === local).map(([, f]) => f);
  /** burger row: board, plates, tickets (count, layers), dish set (every dish is ordered), counter slack, double patty */
  const rows: Record<number, Row> = {};
  const b = (local: number, theme: string, cols: number, depth: number, seats: number, tickets: number, layers: [number, number], set: DishId[],
    slack?: number, doublePatty?: number, extra: Partial<Row> = {}) => {
    const intro = extra.intro && set.includes(extra.intro as DishId) ? [extra.intro as DishId] : [];
    rows[local] = {
      theme, cols, depth, slots: 3, seats, orders: [tickets, tickets], dishes: set, must: [...intro, ...set],
      burger: { layers, fillings: fillingsAt(local), feature: featureAt(local), slack, doublePatty }, ...extra,
    };
  };
  b(2, 'new: hot dog — bun, sausage, topping', 3, 4, 2, 3, [3, 4], [HD, BU], undefined, 0, { intro: HD });
  b(3, 'new: pancakes — the same layer twice', 3, 5, 2, 3, [4, 4], [PC, BU], undefined, 0, { intro: PC });
  b(4, 'count the counter spots', 3, 5, 2, 3, [4, 5], [HD, PC]);
  b(5, 'a tight little kitchen', 3, 5, 2, 3, [4, 5], [BU, HD, PC], 0);
  b(6, 'new: club sandwich — one toast fits two plates', 4, 4, 2, 3, [4, 5], [SW, BU], 1, 0, { intro: SW });
  b(7, 'lettuce for the sandwich', 4, 5, 2, 4, [4, 5], [SW, HD], 1);
  b(8, 'new: sundae — glass, scoops, a cherry', 4, 5, 2, 4, [4, 5], [SD, PC], 1, 0, { intro: SD });
  b(9, 'tomato for burgers and sandwiches', 4, 5, 2, 4, [5, 5], [SD, BU, SW], 1);
  b(10, 'banquet: the whole menu', 5, 5, 2, 5, [4, 5], ALL, 0);
  b(11, 'tight counter, a cloche or two', 4, 5, 2, 4, [5, 5], [HD, SW], 0, 0, { cloches: 2 });
  b(12, 'new: frozen — it thaws after a few moves', 4, 5, 2, 4, [5, 5], [BU, SD], 0, 0, { intro: 'frozen', frozen: 1 });
  b(13, 'pickles: hot dog or burger?', 5, 5, 2, 4, [4, 5], [PC, HD, SW], 0, 0, { cloches: 2 });
  b(14, 'read the columns as recipes', 5, 5, 2, 4, [5, 5], [SD, HD, BU], 0, 0, { frozen: 1 });
  b(15, 'rush hour', 5, 5, 2, 5, [5, 5], [SW, PC, BU], 0, 0, { cloches: 2 });
  b(16, 'new: the grill — patties cook for a few moves', 5, 5, 2, 4, [5, 5], [BU, HD], 0, 0, { intro: 'grill', stove: { patty: 2 } });
  b(17, 'berries for pancakes and sundaes', 5, 5, 2, 5, [5, 5], [SD, PC, BU], 0, 0, { frozen: 2, stove: { patty: 2 } });
  b(18, 'tall tickets', 5, 6, 2, 4, [5, 6], [SW, HD], 0, 0, { cloches: 3 });
  b(19, 'tall tickets on ice', 5, 6, 2, 5, [5, 6], [BU, SD, PC], 0, 0, { frozen: 1, cloches: 2 });
  b(20, 'banquet: the big order', 5, 6, 2, 6, [5, 5], ALL, 0, 0, { cloches: 2 });
  b(21, 'double patty on the grill', 5, 5, 2, 4, [5, 6], [BU, SW], 0, 0.5, { frozen: 1, stove: { patty: 2 } });
  b(22, 'sandwiches, sundaes, pancakes', 5, 6, 2, 5, [5, 6], [SW, SD, PC], 0, 0, { cloches: 3 });
  b(23, 'double trouble', 5, 6, 2, 5, [5, 6], [BU, PC], 0, 0.5, { frozen: 2, stove: { patty: 3 } });
  b(24, 'hot dogs, sandwiches, sundaes', 5, 6, 2, 5, [5, 6], [HD, SW, SD], 0, 0, { cloches: 2, frozen: 1 });
  b(25, 'the stack-up', 5, 6, 2, 5, [5, 6], [BU, SW, SD], 0, 0.5, { cloches: 2, stove: { patty: 2 } });
  b(26, 'new: lids — a column opens after k dishes', 5, 5, 2, 4, [5, 5], [HD, PC, SW], 0, 0, { lids: 1, lidMax: 2, intro: 'lid' });
  b(27, 'a lid and a double patty', 5, 6, 2, 5, [5, 6], [BU, SD], 0, 0.3, { lids: 1, lidMax: 2, cloches: 2, stove: { patty: 2 } });
  b(28, 'serve in the right order', 5, 6, 2, 5, [5, 6], [PC, SW, HD], 0, 0, { lids: 1, lidMax: 3, frozen: 1 });
  b(29, 'two lids', 5, 5, 2, 5, [5, 5], [SD, PC, BU], 0, 0, { lids: 2, lidMax: 3, cloches: 2 });
  b(30, 'banquet behind a lid', 6, 5, 2, 6, [5, 5], ALL, 0, 0, { lids: 1, lidMax: 2, frozen: 1, stove: { patty: 2 } });
  b(31, 'a third plate', 5, 5, 3, 5, [5, 5], [HD, SW, SD], 0, 0, { cloches: 2 });
  b(32, 'three plates', 6, 5, 3, 5, [5, 6], [BU, PC, SD], 0, 0, { frozen: 2, stove: { patty: 3 } });
  b(33, 'three plates, double patty', 6, 5, 3, 5, [5, 6], [BU, HD, SW], 0, 0.3, { cloches: 3 });
  b(34, 'three plates, long queue', 6, 5, 3, 6, [5, 5], [PC, SW, SD], 0, 0, { frozen: 1, cloches: 2 });
  b(35, 'lunch rush', 6, 5, 3, 6, [5, 5], [HD, SD, BU], 0, 0, { cloches: 2, frozen: 1, stove: { patty: 2 } });
  b(36, 'three plates and a lid', 6, 5, 3, 5, [5, 6], [SW, PC, HD], 0, 0, { lids: 1, lidMax: 2, cloches: 2 });
  b(37, 'three plates and a lid', 6, 5, 3, 5, [5, 5], [BU, SD, PC], 0, 0.3, { lids: 1, lidMax: 3, frozen: 1, stove: { patty: 2 } });
  b(38, 'three plates, a late lid', 6, 5, 3, 5, [5, 6], [SD, SW, HD], 0, 0, { lids: 1, lidMax: 3, cloches: 3 });
  b(39, 'three plates, a late lid', 6, 5, 3, 6, [5, 5], [BU, PC, SW], 0, 0.3, { lids: 1, lidMax: 3, cloches: 2, frozen: 1, stove: { patty: 3 } });
  b(40, 'grand banquet: three plates', 6, 5, 3, 6, [5, 5], ALL, 0, 0.3, { cloches: 3, frozen: 1, stove: { patty: 2 } });
  return rows;
}

/** Ladder rows by kitchen (index = world), keyed by local level. */
const LADDERS: Record<number, Row>[] = [TRATTORIA, BURGER_LADDER()];

/**
 * Target band for a kitchen's local level. Both kitchens share the tier semantics. The teaching ramp
 * (local 2–8, the Burger Joint to 9) keeps the classic "anyone wins" bands of the random player and
 * only asks that a player looking two moves ahead wins. From local 9 on the planning bands
 * (targets.ts) take over: normal levels must beat the greedy player and need more and more moves of
 * planning (deep traps, forced non-greedy decisions), hard levels and banquets go further, and every
 * level from local 11 on is tight. Lids and ice must matter (they rule out a share of the winning
 * lines); cloches must hide something that decides a move, and a careful deducer must never guess
 * (banquets may need one guess, which the docs flag). The generator aims for the middle of every band.
 */
export function targetFor(world: number, local: number, tier: Tier, intro?: Intro, lids = 0, mech: { cloches?: number; frozen?: number } = {}): Target {
  const extra: Target = {};
  if (lids > 0) extra.minLidCut = intro === 'lid' ? 0.4 : 0.2;
  if (mech.frozen) extra.minIceCut = intro === 'frozen' ? 0.3 : 0.15;
  if (mech.cloches) extra.minRiddles = 1;
  const plan = planBands(tier, local, intro, 9);
  // the stacks have fewer single-move passages (the leftmost plate decides), so their bottleneck bar is lower
  if (world === 1 && plan.minBottleneck) plan.minBottleneck = Math.max(1, Math.round(plan.minBottleneck / 2));
  const ramp = world === 1 ? 9 : 8;
  if (local <= ramp && tier === 'normal') {
    // the opening: a real decision from the second level on (openingBands); the random player
    // still wins the first levels often, and the Trattoria's L8 is a tight kitchen
    const classic: Target = local <= 4 ? { random: [0.15, 1], minCritical: 1 }
      : { random: [0.05, 0.7], minCritical: 2, tight: world === 0 && local === 8 ? true : undefined };
    return { ...classic, ...plan, ...extra };
  }
  if (local === 5) return { random: [0.03, 0.45], minCritical: 3, tight: true, ...plan, ...extra };
  return { ...plan, tight: tier !== 'normal' || (local >= 11 && !intro) ? true : undefined, maxTrap: 12, ...extra };
}

function specFrom(n: number, world: number, local: number, row: Row, target?: Target): LevelSpec {
  const tier = tierForLocal(local);
  const spec: LevelSpec = {
    n,
    world,
    local,
    menu: WORLD_MENUS[world % WORLD_MENUS.length],
    tier,
    columns: row.cols,
    depth: row.depth,
    slots: row.slots,
    seats: row.seats,
    orders: row.orders,
    dishes: row.dishes,
    must: row.must,
    items: row.items ?? [row.cols + 2, 30],
    lids: row.lids,
    lidMax: row.lidMax,
    cloches: row.cloches,
    frozen: row.frozen,
    stove: row.stove,
    intro: row.intro,
    theme: row.theme,
    target: target ?? { ...targetFor(world, local, tier, row.intro, row.lids ?? 0, row), ...row.t },
  };
  if (row.burger) {
    spec.rules = 'burger';
    spec.burger = row.burger;
  }
  return spec;
}

/** Generator spec of a Trattoria or Burger Joint local level (2..40; local 1 is authored). */
export function kitchenSpec(world: number, local: number): LevelSpec {
  const row = LADDERS[world]?.[local];
  if (!row) throw new Error(`no ladder row for kitchen ${world}, local level ${local}`);
  return specFrom(campaignLevel(world, local), world, local, row);
}

/** Generator spec of campaign level n (Trattoria and Burger Joint levels, except the authored ones). */
export function levelSpec(n: number): LevelSpec {
  return kitchenSpec(kitchenAt(n), localOf(n));
}

/** The dish or mechanic a kitchen's local level introduces, if any. */
export function introAtLocal(world: number, local: number): Intro | undefined {
  if (world === 2) return taqueriaIntro(local);
  return authoredLocal(world, local)?.intro ?? LADDERS[world]?.[local]?.intro;
}

/** The dish or mechanic campaign level n introduces, if any. */
export function introAt(n: number): Intro | undefined {
  return n <= CAMPAIGN_LEVELS ? introAtLocal(kitchenAt(n), localOf(n)) : undefined;
}

/** Short label of what a kitchen's local level is about (build output and audit). */
export function themeOf(world: number, local: number): string {
  if (world === 0 && local === 1) return 'tutorial: two tomatoes make sauce';
  if (world === 1 && local === 1) return 'tutorial: a burger is an exact stack';
  return LADDERS[world]?.[local]?.theme ?? '';
}

/** Which kitchen an endless level n uses: 5-level shifts in turn (ENDLESS_KITCHENS in shifts.ts). */
export function endlessWorld(n: number): number {
  return shiftOf(n).world;
}

/**
 * The runtime part of a target: the planner bands up to depth 3 (the deeper planners are too slow
 * for a phone), forced / deep decisions, greedy loses, tight and the random cap. Endless levels are
 * built by the guided generator in a Web Worker with a small budget (see generateEndlessLevel).
 */
export function runtimeTarget(t: Target): Target {
  const reach: Target['reach'] = {};
  for (const [d, band] of Object.entries(t.reach ?? {})) if (Number(d) <= 3 && band) reach[Number(d)] = band;
  return {
    reach, goal: t.goal, minForced: t.minForced, minDeep: t.minDeep, greedyLoses: t.greedyLoses, tight: t.tight, maxRandom: t.maxRandom,
    maxGuesses: t.maxGuesses,
  };
}

/** Late ladder rows the endless pool cycles through, per kitchen (normal tier). */
const POOL_CYCLE = [
  [24, 26, 28, 29, 31, 33, 34, 37, 38, 39],
  [27, 28, 29, 31, 32, 33, 34, 36, 37, 38, 39, 24],
];

/**
 * The pre-built endless pool (scripts/build-endless.ts, levels 121–240): campaign quality. Each
 * level plays a late row of its kitchen at full size with the full late targets of the local level
 * it plays like (endlessLocal: its shift's hard level or banquet included). `step` picks another
 * row of the cycle (the builder uses it to keep neighbouring dish sets apart).
 */
export function poolSpec(n: number, step = 0): LevelSpec {
  const tier = tierForLevel(n);
  const world = endlessWorld(n);
  if (world === 2) throw new Error(`pool level ${n} is a Taquería level: see taqueriaPoolSpec`);
  const like = endlessLocal(n);
  const L = LADDERS[world];
  const cycle = POOL_CYCLE[world];
  const visit = shiftOf(n).visit;
  let row: Row = tier === 'superhard' ? L[visit % 2 ? 30 : 40] : tier === 'hard' ? L[visit % 2 ? 25 : 35] : L[cycle[(n * 5 + step) % cycle.length]];
  row = { ...row, intro: undefined };
  const target = targetFor(world, like, tier, undefined, row.lids ?? 0, row);
  return { ...specFrom(n, world, like, row, target), local: undefined, n, tier, theme: 'endless pool' };
}

/**
 * Endless levels after the campaign: 5-level shifts take the kitchens in turn. A shift plays its
 * kitchen's late shapes (local 31–35 or 36–40 on alternate visits, see endlessLocal) with the same
 * tiers (the 5th level of a shift is hard or a banquet) and the late ladder's planning targets
 * (runtimeTarget). Boards are a little smaller than the campaign's late ones (five columns, at most
 * six guests) so the worker builds a level in well under a second; cloches and ice come with the
 * rows. The level's `world` is the kitchen's world.
 */
export function endlessSpec(n: number): LevelSpec {
  const tier = tierForLevel(n);
  const world = endlessWorld(n);
  if (world === 2) throw new Error(`endless level ${n} is a Taquería level: see taqueriaEndlessSpec`);
  // a late level of that kitchen with the same tier: its targets apply
  const like = endlessLocal(n);
  const L = LADDERS[world];
  const cycle = world === 0 ? [26, 27, 28, 29, 31, 32, 33, 34, 37, 39] : [27, 28, 29, 31, 32, 33, 34, 36, 37, 38];
  let row: Row = tier === 'superhard' ? L[30] : tier === 'hard' ? L[n % 20 === 5 ? 25 : 35] : L[cycle[(n * 7) % cycle.length]];
  const orders: [number, number] = [Math.min(row.orders[0], 6), Math.min(row.orders[1], 6)];
  row = { ...row, cols: Math.min(row.cols, 5), depth: 6, seats: Math.min(row.seats, 2), orders, intro: undefined };
  const target = runtimeTarget(targetFor(world, like, tier, undefined, row.lids ?? 0, row));
  return { ...specFrom(n, world, like, row, target), local: undefined, n, tier, theme: 'endless' };
}
