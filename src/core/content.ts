/**
 * Ingredients, preps and dishes. Each world (kitchen) uses one menu.
 * Items are referred to by string id in level files and by index inside the engine.
 */

export type Lang = 'en' | 'ru';
export type Text = Record<Lang, string>;

export type FoodId =
  // Trattoria
  | 'tomato' | 'onion' | 'carrot' | 'potato' | 'cheese' | 'egg' | 'flour' | 'pasta' | 'mushroom'
  | 'bread' | 'basil' | 'mozzarella' | 'rice' | 'bacon' | 'mascarpone' | 'coffee'
  | 'sauce' | 'dough' | 'soffritto' | 'pesto' | 'gnocchi_dough' | 'cream'
  // Burger Joint (also uses bacon): bases, layers, tops
  | 'bun_bottom' | 'patty' | 'cheese_slice' | 'lettuce' | 'tomato_slice' | 'onion_rings' | 'bun_top'
  | 'pickles' | 'toast' | 'hotdog_bun' | 'sausage' | 'pancake' | 'butter' | 'berries' | 'cup' | 'ice_cream' | 'chocolate' | 'cherry'
  // Taquería (also uses tomato, onion, cheese and lettuce): containers, fillings, prep halves, preps
  | 'tortilla' | 'wrap' | 'beans' | 'pork' | 'chicken' | 'corn' | 'avocado' | 'lime'
  | 'salsa' | 'guacamole';

export type DishId =
  | 'pizza' | 'spaghetti' | 'minestrone' | 'omelette'
  | 'bruschetta' | 'caprese' | 'risotto' | 'pesto_pasta' | 'carbonara' | 'gnocchi' | 'calzone' | 'tiramisu'
  // Burger Joint: stacked dishes (each ticket lists its exact layers, see burger.ts)
  | 'burger' | 'hotdog' | 'pancakes' | 'sandwich' | 'sundae'
  // Taquería: tacos (a tortilla + 3 fillings) and burritos (a wrap + 4 fillings)
  | 'taco_carnitas' | 'taco_pollo' | 'taco_veggie' | 'taco_frijol' | 'taco_verde'
  | 'burrito_carnitas' | 'burrito_pollo' | 'burrito_veggie' | 'burrito_verde'
  // ...and dishes made the same way: a quesadilla and a tostada (tortilla + 3), enchiladas (wrap + 4)
  | 'quesadilla' | 'tostada' | 'enchiladas';

export interface FoodDef {
  id: FoodId;
  /** raw items come from the pantry; preps appear on the counter when two raw items meet */
  kind: 'raw' | 'prep';
  /** identity colour: tile tint, particles, UI chips */
  color: string;
  name: Text;
}

export interface PrepDef {
  out: FoodId;
  /** the two items that combine on the counter (may be the same item twice) */
  from: [FoodId, FoodId];
}

export interface DishDef {
  id: DishId;
  parts: FoodId[];
  name: Text;
}

export interface Menu {
  id: string;
  /** every item that can appear in this kitchen, raw first */
  items: FoodId[];
  /** checked in this order: the first prep whose two parts are on the counter fires */
  preps: PrepDef[];
  dishes: DishDef[];
}

export const FOODS: Record<FoodId, FoodDef> = {
  tomato: { id: 'tomato', kind: 'raw', color: '#e8473c', name: { en: 'Tomato', ru: 'Помидор' } },
  onion: { id: 'onion', kind: 'raw', color: '#9b5bb5', name: { en: 'Onion', ru: 'Лук' } },
  carrot: { id: 'carrot', kind: 'raw', color: '#f28a2e', name: { en: 'Carrot', ru: 'Морковь' } },
  potato: { id: 'potato', kind: 'raw', color: '#c99a5b', name: { en: 'Potato', ru: 'Картофель' } },
  cheese: { id: 'cheese', kind: 'raw', color: '#f6c938', name: { en: 'Cheese', ru: 'Сыр' } },
  egg: { id: 'egg', kind: 'raw', color: '#f4efe4', name: { en: 'Egg', ru: 'Яйцо' } },
  flour: { id: 'flour', kind: 'raw', color: '#d9c7a3', name: { en: 'Flour', ru: 'Мука' } },
  pasta: { id: 'pasta', kind: 'raw', color: '#f0c45a', name: { en: 'Pasta', ru: 'Макароны' } },
  mushroom: { id: 'mushroom', kind: 'raw', color: '#8a5a3c', name: { en: 'Mushroom', ru: 'Гриб' } },
  sauce: { id: 'sauce', kind: 'prep', color: '#c8302a', name: { en: 'Tomato sauce', ru: 'Томатный соус' } },
  dough: { id: 'dough', kind: 'prep', color: '#ead9b6', name: { en: 'Dough', ru: 'Тесто' } },
  soffritto: { id: 'soffritto', kind: 'prep', color: '#e0893a', name: { en: 'Soffritto', ru: 'Зажарка' } },
  bread: { id: 'bread', kind: 'raw', color: '#d39a52', name: { en: 'Bread', ru: 'Хлеб' } },
  basil: { id: 'basil', kind: 'raw', color: '#3e9c3c', name: { en: 'Basil', ru: 'Базилик' } },
  mozzarella: { id: 'mozzarella', kind: 'raw', color: '#eef2ec', name: { en: 'Mozzarella', ru: 'Моцарелла' } },
  rice: { id: 'rice', kind: 'raw', color: '#efe4c8', name: { en: 'Rice', ru: 'Рис' } },
  bacon: { id: 'bacon', kind: 'raw', color: '#d8675c', name: { en: 'Bacon', ru: 'Бекон' } },
  mascarpone: { id: 'mascarpone', kind: 'raw', color: '#f5ead6', name: { en: 'Mascarpone', ru: 'Маскарпоне' } },
  coffee: { id: 'coffee', kind: 'raw', color: '#6b4027', name: { en: 'Coffee', ru: 'Кофе' } },
  pesto: { id: 'pesto', kind: 'prep', color: '#5d9e2f', name: { en: 'Pesto', ru: 'Песто' } },
  gnocchi_dough: { id: 'gnocchi_dough', kind: 'prep', color: '#ecc97e', name: { en: 'Gnocchi', ru: 'Ньокки' } },
  cream: { id: 'cream', kind: 'prep', color: '#f6e7c4', name: { en: 'Mascarpone cream', ru: 'Крем маскарпоне' } },
  bun_bottom: { id: 'bun_bottom', kind: 'raw', color: '#d9953f', name: { en: 'Bottom bun', ru: 'Низ булочки' } },
  patty: { id: 'patty', kind: 'raw', color: '#6b3b26', name: { en: 'Patty', ru: 'Котлета' } },
  cheese_slice: { id: 'cheese_slice', kind: 'raw', color: '#f7c22f', name: { en: 'Cheese', ru: 'Сыр' } },
  lettuce: { id: 'lettuce', kind: 'raw', color: '#6cc04a', name: { en: 'Lettuce', ru: 'Салат' } },
  tomato_slice: { id: 'tomato_slice', kind: 'raw', color: '#e5483d', name: { en: 'Tomato', ru: 'Помидор' } },
  onion_rings: { id: 'onion_rings', kind: 'raw', color: '#e9d7f0', name: { en: 'Onion', ru: 'Лук' } },
  bun_top: { id: 'bun_top', kind: 'raw', color: '#e0a04a', name: { en: 'Top bun', ru: 'Верх булочки' } },
  pickles: { id: 'pickles', kind: 'raw', color: '#7fa83a', name: { en: 'Pickles', ru: 'Огурчики' } },
  toast: { id: 'toast', kind: 'raw', color: '#e9bd72', name: { en: 'Toast', ru: 'Тост' } },
  hotdog_bun: { id: 'hotdog_bun', kind: 'raw', color: '#e8a650', name: { en: 'Hot dog bun', ru: 'Булочка для хот-дога' } },
  sausage: { id: 'sausage', kind: 'raw', color: '#b9532f', name: { en: 'Sausage', ru: 'Сосиска' } },
  pancake: { id: 'pancake', kind: 'raw', color: '#e6ad58', name: { en: 'Pancake', ru: 'Панкейк' } },
  butter: { id: 'butter', kind: 'raw', color: '#f9e08c', name: { en: 'Butter', ru: 'Сливочное масло' } },
  berries: { id: 'berries', kind: 'raw', color: '#5b4fb0', name: { en: 'Berries', ru: 'Ягоды' } },
  cup: { id: 'cup', kind: 'raw', color: '#cfe7f3', name: { en: 'Sundae glass', ru: 'Креманка' } },
  ice_cream: { id: 'ice_cream', kind: 'raw', color: '#fbf0d4', name: { en: 'Vanilla ice cream', ru: 'Ванильное мороженое' } },
  chocolate: { id: 'chocolate', kind: 'raw', color: '#6e4026', name: { en: 'Chocolate ice cream', ru: 'Шоколадное мороженое' } },
  cherry: { id: 'cherry', kind: 'raw', color: '#d4243a', name: { en: 'Cherry', ru: 'Вишенка' } },
  tortilla: { id: 'tortilla', kind: 'raw', color: '#f0cf7a', name: { en: 'Tortilla', ru: 'Тортилья' } },
  wrap: { id: 'wrap', kind: 'raw', color: '#f3e4c2', name: { en: 'Burrito wrap', ru: 'Лепёшка для буррито' } },
  beans: { id: 'beans', kind: 'raw', color: '#7b3f2c', name: { en: 'Beans', ru: 'Фасоль' } },
  pork: { id: 'pork', kind: 'raw', color: '#c4754a', name: { en: 'Pork', ru: 'Свинина' } },
  chicken: { id: 'chicken', kind: 'raw', color: '#e9b46c', name: { en: 'Chicken', ru: 'Курица' } },
  corn: { id: 'corn', kind: 'raw', color: '#f6cf36', name: { en: 'Corn', ru: 'Кукуруза' } },
  avocado: { id: 'avocado', kind: 'raw', color: '#5d8c2f', name: { en: 'Avocado', ru: 'Авокадо' } },
  lime: { id: 'lime', kind: 'raw', color: '#9fcd3a', name: { en: 'Lime', ru: 'Лайм' } },
  salsa: { id: 'salsa', kind: 'prep', color: '#d6402e', name: { en: 'Salsa', ru: 'Сальса' } },
  guacamole: { id: 'guacamole', kind: 'prep', color: '#8bbd45', name: { en: 'Guacamole', ru: 'Гуакамоле' } },
};

export const DISHES: Record<DishId, DishDef> = {
  pizza: { id: 'pizza', parts: ['dough', 'sauce', 'cheese'], name: { en: 'Pizza', ru: 'Пицца' } },
  spaghetti: { id: 'spaghetti', parts: ['pasta', 'sauce'], name: { en: 'Spaghetti', ru: 'Спагетти' } },
  minestrone: { id: 'minestrone', parts: ['soffritto', 'potato', 'tomato'], name: { en: 'Minestrone', ru: 'Минестроне' } },
  omelette: { id: 'omelette', parts: ['egg', 'mushroom', 'cheese'], name: { en: 'Omelette', ru: 'Омлет' } },
  bruschetta: { id: 'bruschetta', parts: ['bread', 'tomato'], name: { en: 'Bruschetta', ru: 'Брускетта' } },
  caprese: { id: 'caprese', parts: ['mozzarella', 'tomato', 'basil'], name: { en: 'Caprese', ru: 'Капрезе' } },
  risotto: { id: 'risotto', parts: ['rice', 'mushroom', 'cheese'], name: { en: 'Mushroom risotto', ru: 'Ризотто с грибами' } },
  pesto_pasta: { id: 'pesto_pasta', parts: ['pasta', 'pesto'], name: { en: 'Pasta al pesto', ru: 'Паста с песто' } },
  carbonara: { id: 'carbonara', parts: ['pasta', 'egg', 'cheese', 'bacon'], name: { en: 'Carbonara', ru: 'Карбонара' } },
  gnocchi: { id: 'gnocchi', parts: ['gnocchi_dough', 'sauce'], name: { en: 'Gnocchi al pomodoro', ru: 'Ньокки с томатами' } },
  calzone: { id: 'calzone', parts: ['dough', 'mozzarella', 'bacon'], name: { en: 'Calzone', ru: 'Кальцоне' } },
  tiramisu: { id: 'tiramisu', parts: ['cream', 'coffee'], name: { en: 'Tiramisu', ru: 'Тирамису' } },
  // Burger Joint: parts = one example stack, bottom to top (every ticket lists its own layers)
  burger: { id: 'burger', parts: ['bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'bun_top'], name: { en: 'Burger', ru: 'Бургер' } },
  hotdog: { id: 'hotdog', parts: ['hotdog_bun', 'sausage', 'pickles'], name: { en: 'Hot dog', ru: 'Хот-дог' } },
  pancakes: { id: 'pancakes', parts: ['pancake', 'pancake', 'berries', 'butter'], name: { en: 'Pancakes', ru: 'Панкейки' } },
  sandwich: { id: 'sandwich', parts: ['toast', 'bacon', 'lettuce', 'tomato_slice', 'toast'], name: { en: 'Club sandwich', ru: 'Клаб-сэндвич' } },
  sundae: { id: 'sundae', parts: ['cup', 'ice_cream', 'chocolate', 'cherry'], name: { en: 'Sundae', ru: 'Мороженое-сандей' } },
  // Taquería: parts = the container, then the exact fillings (see taco.ts)
  taco_carnitas: { id: 'taco_carnitas', parts: ['tortilla', 'pork', 'salsa', 'cheese'], name: { en: 'Carnitas taco', ru: 'Тако карнитас' } },
  taco_pollo: { id: 'taco_pollo', parts: ['tortilla', 'chicken', 'salsa', 'lettuce'], name: { en: 'Chicken taco', ru: 'Тако с курицей' } },
  taco_veggie: { id: 'taco_veggie', parts: ['tortilla', 'beans', 'corn', 'lettuce'], name: { en: 'Veggie taco', ru: 'Овощное тако' } },
  taco_frijol: { id: 'taco_frijol', parts: ['tortilla', 'beans', 'cheese', 'salsa'], name: { en: 'Bean taco', ru: 'Тако с фасолью' } },
  taco_verde: { id: 'taco_verde', parts: ['tortilla', 'chicken', 'guacamole', 'corn'], name: { en: 'Taco verde', ru: 'Тако верде' } },
  burrito_carnitas: { id: 'burrito_carnitas', parts: ['wrap', 'pork', 'beans', 'cheese', 'salsa'], name: { en: 'Carnitas burrito', ru: 'Буррито карнитас' } },
  burrito_pollo: { id: 'burrito_pollo', parts: ['wrap', 'chicken', 'lettuce', 'corn', 'salsa'], name: { en: 'Chicken burrito', ru: 'Буррито с курицей' } },
  burrito_veggie: { id: 'burrito_veggie', parts: ['wrap', 'beans', 'corn', 'lettuce', 'cheese'], name: { en: 'Veggie burrito', ru: 'Овощное буррито' } },
  burrito_verde: { id: 'burrito_verde', parts: ['wrap', 'chicken', 'beans', 'guacamole', 'lettuce'], name: { en: 'Burrito verde', ru: 'Буррито верде' } },
  quesadilla: { id: 'quesadilla', parts: ['tortilla', 'chicken', 'cheese', 'cheese'], name: { en: 'Quesadilla', ru: 'Кесадилья' } },
  tostada: { id: 'tostada', parts: ['tortilla', 'beans', 'lettuce', 'guacamole'], name: { en: 'Tostada', ru: 'Тостада' } },
  enchiladas: { id: 'enchiladas', parts: ['wrap', 'chicken', 'beans', 'cheese', 'salsa'], name: { en: 'Enchiladas', ru: 'Энчиладас' } },
};

/**
 * Trattoria: six preps that make themselves, in priority order (an egg next to flour becomes dough
 * before it can become cream). No dish holds both halves of a prep raw, so every dish can be served;
 * the puzzle is keeping halves apart until the right moment (a lone tomato, a basil leaf away from
 * the cheese, a potato away from the flour).
 */
export const TRATTORIA: Menu = {
  id: 'trattoria',
  items: [
    'tomato', 'onion', 'carrot', 'potato', 'cheese', 'egg', 'flour', 'pasta', 'mushroom',
    'bread', 'basil', 'mozzarella', 'rice', 'bacon', 'mascarpone', 'coffee',
    'sauce', 'dough', 'soffritto', 'pesto', 'gnocchi_dough', 'cream',
  ],
  preps: [
    { out: 'sauce', from: ['tomato', 'tomato'] },
    { out: 'dough', from: ['flour', 'egg'] },
    { out: 'soffritto', from: ['onion', 'carrot'] },
    { out: 'pesto', from: ['basil', 'cheese'] },
    { out: 'gnocchi_dough', from: ['potato', 'flour'] },
    { out: 'cream', from: ['mascarpone', 'egg'] },
  ],
  // in the order the campaign introduces them (the cookbook and the recipe card follow it)
  dishes: [
    DISHES.spaghetti, DISHES.bruschetta, DISHES.caprese, DISHES.pizza, DISHES.omelette, DISHES.risotto,
    DISHES.pesto_pasta, DISHES.carbonara, DISHES.minestrone, DISHES.gnocchi, DISHES.calzone, DISHES.tiramisu,
  ],
};

/**
 * Burger Joint: no preps; each ticket is an exact stack of layers, bottom first (see burger.ts).
 * Five stacked dishes share their fillings, so the plates still compete for them.
 */
export const DINER: Menu = {
  id: 'diner',
  items: [
    'bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'tomato_slice', 'onion_rings', 'pickles', 'bacon', 'bun_top',
    'toast', 'hotdog_bun', 'sausage', 'pancake', 'butter', 'berries', 'cup', 'ice_cream', 'chocolate', 'cherry',
  ],
  preps: [],
  dishes: [DISHES.burger, DISHES.hotdog, DISHES.pancakes, DISHES.sandwich, DISHES.sundae],
};

/**
 * Taquería: containers (a tortilla holds 3 fillings, a burrito wrap 4) catch the fillings; tomato +
 * onion make salsa, avocado + lime make guacamole (see taco.ts). Dish parts list the container first.
 */
export const TAQUERIA: Menu = {
  id: 'taqueria',
  items: [
    'tortilla', 'wrap', 'beans', 'pork', 'chicken', 'cheese', 'lettuce', 'corn',
    'tomato', 'onion', 'avocado', 'lime', 'salsa', 'guacamole',
  ],
  preps: [
    { out: 'salsa', from: ['tomato', 'onion'] },
    { out: 'guacamole', from: ['avocado', 'lime'] },
  ],
  dishes: [
    DISHES.taco_carnitas, DISHES.taco_pollo, DISHES.taco_veggie, DISHES.taco_frijol, DISHES.taco_verde,
    DISHES.burrito_carnitas, DISHES.burrito_pollo, DISHES.burrito_veggie, DISHES.burrito_verde,
    DISHES.quesadilla, DISHES.tostada, DISHES.enchiladas,
  ],
};

export const MENUS: Record<string, Menu> = { trattoria: TRATTORIA, diner: DINER, taqueria: TAQUERIA };

/**
 * The recipes that matter on one level: the dishes it orders (in menu order) and every prep that
 * can happen with its pantry, both the ones its dishes need and the reactions to avoid (a basil
 * next to the cheese). For the recipe card; a menu's full list is long.
 */
export function levelRecipes(menu: Menu, orders: readonly DishId[], pantry: readonly FoodId[]): { preps: PrepDef[]; dishes: DishDef[] } {
  const count = new Map<FoodId, number>();
  for (const it of pantry) count.set(it, (count.get(it) ?? 0) + 1);
  const preps = menu.preps.filter((p) => (p.from[0] === p.from[1] ? (count.get(p.from[0]) ?? 0) >= 2 : count.has(p.from[0]) && count.has(p.from[1])));
  return { preps, dishes: menu.dishes.filter((d) => orders.includes(d.id)) };
}
