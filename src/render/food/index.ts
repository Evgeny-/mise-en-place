import * as THREE from 'three';
import { DISHES, FOODS, type DishId, type FoodId } from '../../core/content';
import { Kit, triangles, type FoodGeometry } from './kit';
import { disposeFoodMaterials, foodMaterials } from './materials';
import { carrot, cheese, egg, flour, mushroom, onion, pasta, potato, tomato } from './produce';
import { dough, sauce, soffritto } from './preps';
import { bacon, basilBunch, bread, coffee, cream, gnocchiDough, mascarpone, mozzarella, pesto, rice } from './trattoria';
import { BURGER_LAYERS, LAYER_REACH, LAYER_THICKNESS, buildLayer, buildPantryLayer, isBurgerLayer, type BurgerLayerId } from './burger';
import { burger, hotdog, minestrone, omelette, pancakes, pizza, sandwich, spaghetti, sundae } from './dishes';
import { bruschetta, calzone, caprese, carbonara, gnocchi, pestoPasta, risotto, tiramisu } from './trattoriaDishes';
import { fallbackDish, fallbackFood } from './fallback';
import {
  avocado, beans, chicken, corn, fillingPiece as buildFillingPiece, fillingSlots, guacamole, lime, pork, salsa, tortilla, wrap,
  type FillingSlot,
} from './taqueria';
import { burritoDish, isBurrito, isTaco, smallBurrito, smallTaco, tacoDish } from './tacos';
import { enchiladas, quesadilla, tostada } from './taqueriaDishes';

/**
 * Procedural 3D food for Mise en Place.
 *
 * Geometry is built once per id and cached; every call returns a fresh Object3D (a Group with
 * one or two meshes) that shares the cached geometry and two shared materials (matte and gloss),
 * so a full pantry costs few draw calls and no extra memory. Do not dispose the geometry or the
 * materials of returned objects; call disposeFoodCache() when tearing the renderer down.
 *
 * Units: a pantry tile is about 1.0 wide. Raw items and preps stand on y = 0 inside
 * x, z ∈ [-0.45, 0.45] and are at most 0.85 tall; dishes fit x, z ∈ [-0.8, 0.8], ≤ 1.0 tall.
 * Models face the game camera (+Z towards the viewer, looking down at PLAY_TILT).
 */

export const FOOD_TRIANGLE_BUDGET = 1500;
export const DISH_TRIANGLE_BUDGET = 3500;
export { BURGER_LAYERS, LAYER_REACH, type BurgerLayerId };

/** Dedicated models. Ids missing here (e.g. a world added before its art) get a generic stand-in. */
const FOOD_BUILDERS: Partial<Record<FoodId, (k: Kit) => void>> = {
  tomato, onion, carrot, potato, cheese, egg, flour, pasta, mushroom,
  bread, basil: basilBunch, mozzarella, rice, bacon, mascarpone, coffee,
  sauce, dough, soffritto, pesto, gnocchi_dough: gnocchiDough, cream,
  bun_bottom: (k) => buildPantryLayer(k, 'bun_bottom'),
  patty: (k) => buildPantryLayer(k, 'patty'),
  cheese_slice: (k) => buildPantryLayer(k, 'cheese_slice'),
  lettuce: (k) => buildPantryLayer(k, 'lettuce'),
  tomato_slice: (k) => buildPantryLayer(k, 'tomato_slice'),
  onion_rings: (k) => buildPantryLayer(k, 'onion_rings'),
  bun_top: (k) => buildPantryLayer(k, 'bun_top'),
  pickles: (k) => buildPantryLayer(k, 'pickles'),
  toast: (k) => buildPantryLayer(k, 'toast'),
  hotdog_bun: (k) => buildPantryLayer(k, 'hotdog_bun'),
  sausage: (k) => buildPantryLayer(k, 'sausage'),
  pancake: (k) => buildPantryLayer(k, 'pancake'),
  butter: (k) => buildPantryLayer(k, 'butter'),
  berries: (k) => buildPantryLayer(k, 'berries'),
  cup: (k) => buildPantryLayer(k, 'cup'),
  ice_cream: (k) => buildPantryLayer(k, 'ice_cream'),
  chocolate: (k) => buildPantryLayer(k, 'chocolate'),
  cherry: (k) => buildPantryLayer(k, 'cherry'),
  tortilla, wrap, beans, pork, chicken, corn, avocado, lime, salsa, guacamole,
};

const DISH_BUILDERS: Partial<Record<DishId, (k: Kit) => void>> = {
  pizza, spaghetti, minestrone, omelette, burger, hotdog, pancakes, sandwich, sundae,
  bruschetta, caprese, risotto, pesto_pasta: pestoPasta, carbonara, gnocchi, calzone, tiramisu,
  quesadilla, tostada, enchiladas,
};
for (const id of Object.keys(DISHES) as DishId[]) {
  if (isTaco(id)) DISH_BUILDERS[id] = (k) => tacoDish(k, id);
  else if (isBurrito(id)) DISH_BUILDERS[id] = (k) => burritoDish(k, id);
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

function foodBuilder(id: FoodId): (k: Kit) => void {
  return FOOD_BUILDERS[id] ?? ((k) => fallbackFood(k, FOODS[id]?.color ?? '#d9b98a', seedOf(id)));
}

function dishBuilder(id: DishId): (k: Kit) => void {
  return DISH_BUILDERS[id] ?? ((k) => fallbackDish(k, (DISHES[id]?.parts ?? []).map((p) => FOODS[p]?.color ?? '#d9b98a'), seedOf(id)));
}

/** True when the id has its own model rather than the generic stand-in. */
export function hasDedicatedModel(id: FoodId | DishId): boolean {
  return id in FOOD_BUILDERS || id in DISH_BUILDERS;
}

const foods = new Map<FoodId, FoodGeometry>();
const dishes = new Map<DishId, FoodGeometry>();
const layers = new Map<BurgerLayerId, FoodGeometry>();
const pieces = new Map<FoodId, FoodGeometry | null>();
const counterDishes = new Map<DishId, FoodGeometry>();

function build(fn: (k: Kit) => void, ground = true): FoodGeometry {
  const k = new Kit();
  fn(k);
  return k.bake(ground);
}

function instantiate(geo: FoodGeometry, name: string): THREE.Group {
  const mats = foodMaterials();
  const group = new THREE.Group();
  group.name = name;
  for (const finish of ['matte', 'gloss'] as const) {
    const g = geo[finish];
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mats[finish]);
    mesh.name = `${name}:${finish}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Burger pieces whose pantry model is the layer itself: one cached geometry serves both. */
const SAME_AS_LAYER = new Set<FoodId>(['bun_bottom', 'patty', 'tomato_slice', 'bun_top']);

function layerGeometry(id: BurgerLayerId): FoodGeometry {
  let geo = layers.get(id);
  if (!geo) {
    geo = build((k) => buildLayer(k, id), false);
    layers.set(id, geo);
  }
  return geo;
}

/** Cached geometry of a pantry item or prep (shared by every foodModel(id)). */
export function foodGeometry(id: FoodId): FoodGeometry {
  if (SAME_AS_LAYER.has(id) && isBurgerLayer(id)) return layerGeometry(id);
  let geo = foods.get(id);
  if (!geo) {
    geo = build(foodBuilder(id));
    foods.set(id, geo);
  }
  return geo;
}

/** Cached geometry of a finished dish. */
export function dishGeometry(id: DishId): FoodGeometry {
  let geo = dishes.get(id);
  if (!geo) {
    geo = build(dishBuilder(id));
    dishes.set(id, geo);
  }
  return geo;
}

/** A raw item or prep standing on y = 0, ready to sit on a pantry tile or the counter. */
export function foodModel(id: FoodId): THREE.Object3D {
  const obj = instantiate(foodGeometry(id), `food:${id}`);
  obj.userData.foodId = id;
  return obj;
}

/** A finished dish on its plate, board or bowl. */
export function dishModel(id: DishId): THREE.Object3D {
  const obj = instantiate(dishGeometry(id), `dish:${id}`);
  obj.userData.dishId = id;
  return obj;
}

/**
 * One layer of a burger (bun_bottom, patty, cheese_slice, lettuce, tomato_slice, onion_rings,
 * bun_top). Its base is at y = 0; place the next layer `thickness` higher. Draping parts may
 * hang slightly below the base, over the layer underneath.
 */
export function burgerLayer(id: FoodId): { object: THREE.Object3D; thickness: number } {
  if (!isBurgerLayer(id)) throw new Error(`burgerLayer: ${id} is not a burger layer`);
  const object = instantiate(layerGeometry(id), `layer:${id}`);
  object.userData.foodId = id;
  return { object, thickness: LAYER_THICKNESS[id] };
}

/**
 * A small portion (~0.35 wide, base at y = 0) of a Taquería filling (beans, pork, chicken, cheese,
 * lettuce, corn, salsa, guacamole) to sit on an open tortilla or wrap; see fillingSlots(). Other
 * ids get their pantry model at 0.42 scale.
 */
export function fillingPiece(id: FoodId): THREE.Object3D {
  let geo = pieces.get(id);
  if (geo === undefined) {
    const k = new Kit();
    geo = buildFillingPiece(k, id) ? k.bake() : null;
    pieces.set(id, geo);
  }
  if (!geo) {
    const o = foodModel(id);
    o.scale.setScalar(0.42);
    return o;
  }
  const obj = instantiate(geo, `piece:${id}`);
  obj.userData.foodId = id;
  return obj;
}

/**
 * A folded taco or wrapped burrito without its plate (~0.8 wide, base at y = 0), for a counter
 * slot while it waits for its guest. Other dishes get their dish model at half scale.
 */
export function tacoModel(dish: DishId): THREE.Object3D {
  if (!isTaco(dish) && !isBurrito(dish)) {
    const o = dishModel(dish);
    o.scale.setScalar(0.5);
    return o;
  }
  let geo = counterDishes.get(dish);
  if (!geo) {
    geo = build((k) => (isTaco(dish) ? smallTaco(k, dish) : smallBurrito(k, dish)));
    counterDishes.set(dish, geo);
  }
  const obj = instantiate(geo, `counter:${dish}`);
  obj.userData.dishId = dish;
  return obj;
}

export { fillingSlots, type FillingSlot };

/** Triangle count of a model returned by this module (or any object made of indexed meshes). */
export function modelTriangles(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return n;
}

export { triangles as geometryTriangles };

/** Release every cached geometry and the shared materials. Models built earlier become invalid. */
export function disposeFoodCache(): void {
  for (const cache of [foods, dishes, layers, pieces, counterDishes] as Map<string, FoodGeometry | null>[]) {
    for (const geo of cache.values()) {
      geo?.matte?.dispose();
      geo?.gloss?.dispose();
    }
    cache.clear();
  }
  disposeFoodMaterials();
}
