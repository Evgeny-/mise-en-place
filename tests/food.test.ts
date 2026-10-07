import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DISHES, FOODS, type DishId, type FoodId } from '../src/core/content';
import {
  BURGER_LAYERS, DISH_TRIANGLE_BUDGET, FOOD_TRIANGLE_BUDGET, LAYER_REACH, burgerLayer, dishModel, disposeFoodCache, fillingPiece, fillingSlots,
  foodModel, hasDedicatedModel, modelTriangles, tacoModel,
} from '../src/render/food';
import { Kit, dice, ellipsoid, lathe, leaf, loft, plate2, puck, sweep, type Vec } from '../src/render/food/kit';

const FOOD_IDS = Object.keys(FOODS) as FoodId[];
const DISH_IDS = Object.keys(DISHES) as DishId[];
const EPS = 1e-4;

function bounds(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

function meshes(obj: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/** Every mesh: shadows on, vertex colours and normals present, no NaN, shared food materials. */
function checkMeshes(obj: THREE.Object3D): void {
  const list = meshes(obj);
  expect(list.length).toBeGreaterThan(0);
  expect(list.length).toBeLessThanOrEqual(2);
  for (const m of list) {
    expect(m.castShadow).toBe(true);
    const g = m.geometry;
    expect(g.getAttribute('color')).toBeTruthy();
    expect(g.getAttribute('normal')).toBeTruthy();
    expect(g.index).toBeTruthy();
    const pos = g.getAttribute('position').array as Float32Array;
    expect(pos.every((v) => Number.isFinite(v))).toBe(true);
    const mat = m.material as THREE.MeshStandardMaterial;
    expect(mat.isMeshStandardMaterial).toBe(true);
    expect(mat.vertexColors).toBe(true);
  }
}

/** Signed volume of a closed triangle mesh: positive when every face points outwards. */
function signedVolume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  const idx = g.index;
  const n = idx ? idx.count : p.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(p, idx ? idx.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, idx ? idx.getX(i + 2) : i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

afterAll(() => disposeFoodCache());

describe('food models', () => {
  it.each(FOOD_IDS)('%s builds on its tile within budget', (id) => {
    const obj = foodModel(id);
    checkMeshes(obj);
    const b = bounds(obj);
    expect(b.min.y).toBeCloseTo(0, 4);
    expect(b.max.y).toBeLessThanOrEqual(0.85 + EPS);
    expect(b.min.x).toBeGreaterThanOrEqual(-0.45 - EPS);
    expect(b.max.x).toBeLessThanOrEqual(0.45 + EPS);
    expect(b.min.z).toBeGreaterThanOrEqual(-0.45 - EPS);
    expect(b.max.z).toBeLessThanOrEqual(0.45 + EPS);
    // big enough to fill the tile and read at phone size
    expect(Math.max(b.max.x - b.min.x, b.max.z - b.min.z)).toBeGreaterThan(0.55);
    expect(modelTriangles(obj)).toBeLessThanOrEqual(FOOD_TRIANGLE_BUDGET);
  });

  it.each(DISH_IDS)('dish %s builds within its footprint and budget', (id) => {
    const obj = dishModel(id);
    checkMeshes(obj);
    const b = bounds(obj);
    expect(b.min.y).toBeCloseTo(0, 4);
    expect(b.max.y).toBeLessThanOrEqual(1.0 + EPS);
    expect(b.min.x).toBeGreaterThanOrEqual(-0.8 - EPS);
    expect(b.max.x).toBeLessThanOrEqual(0.8 + EPS);
    expect(b.min.z).toBeGreaterThanOrEqual(-0.8 - EPS);
    expect(b.max.z).toBeLessThanOrEqual(0.8 + EPS);
    expect(modelTriangles(obj)).toBeLessThanOrEqual(DISH_TRIANGLE_BUDGET);
  });

  it.each(BURGER_LAYERS as readonly FoodId[])('burger layer %s stacks', (id) => {
    const { object, thickness } = burgerLayer(id);
    checkMeshes(object);
    const b = bounds(object);
    expect(thickness).toBeGreaterThan(0);
    expect(thickness).toBeLessThan(0.4);
    // its body starts at its base; only draping frills may hang a little lower
    expect(b.min.y).toBeGreaterThanOrEqual(-0.08);
    expect(b.max.y).toBeGreaterThanOrEqual(thickness * 0.8);
    expect(b.max.y).toBeLessThanOrEqual(thickness + (LAYER_REACH[id as keyof typeof LAYER_REACH] ?? 0.06));
    expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)).toBeLessThanOrEqual(0.45 + EPS);
    expect(modelTriangles(object)).toBeLessThanOrEqual(FOOD_TRIANGLE_BUDGET);
  });

  it('a whole burger stacked from layers fits a dish', () => {
    const stack = ['bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'tomato_slice', 'onion_rings', 'bun_top'] as FoodId[];
    let y = 0;
    let top = 0;
    for (const id of stack) {
      const { object, thickness } = burgerLayer(id);
      object.position.y = y;
      top = Math.max(top, bounds(object).max.y);
      y += thickness;
    }
    expect(top).toBeLessThanOrEqual(1.0);
  });

  it('rejects ids that are not burger layers', () => {
    expect(() => burgerLayer('tomato')).toThrow();
  });

  it('repeated calls share geometry and materials but not objects', () => {
    for (const make of [() => foodModel('tomato'), () => dishModel('pizza'), () => burgerLayer('patty').object]) {
      const a = make(), b = make();
      expect(a).not.toBe(b);
      const ma = meshes(a), mb = meshes(b);
      expect(ma.length).toBe(mb.length);
      ma.forEach((m, i) => {
        expect(m.geometry).toBe(mb[i].geometry);
        expect(m.material).toBe(mb[i].material);
      });
    }
  });

  it('every food and dish shares the same two materials', () => {
    const mats = new Set<THREE.Material>();
    for (const id of FOOD_IDS) for (const m of meshes(foodModel(id))) mats.add(m.material as THREE.Material);
    for (const id of DISH_IDS) for (const m of meshes(dishModel(id))) mats.add(m.material as THREE.Material);
    expect(mats.size).toBeLessThanOrEqual(2);
  });

  it('disposeFoodCache releases geometry and rebuilds on demand', () => {
    const before = meshes(foodModel('egg'))[0].geometry;
    const disposed: string[] = [];
    before.addEventListener('dispose', () => disposed.push('egg'));
    disposeFoodCache();
    expect(disposed).toEqual(['egg']);
    const after = meshes(foodModel('egg'))[0].geometry;
    expect(after).not.toBe(before);
    expect(after.getAttribute('position').count).toBe(before.getAttribute('position').count);
  });
});

describe('Taquería', () => {
  const FILLINGS: FoodId[] = ['beans', 'pork', 'chicken', 'cheese', 'lettuce', 'corn', 'salsa', 'guacamole'];
  const TACOS = DISH_IDS.filter((d) => d.startsWith('taco_') || d.startsWith('burrito_'));

  // Pinned list: ids added later (a new world before its art) fall back to stand-ins without failing here.
  const MODELLED = [
    'tomato', 'onion', 'carrot', 'potato', 'cheese', 'egg', 'flour', 'pasta', 'mushroom', 'sauce', 'dough', 'soffritto',
    'bread', 'basil', 'mozzarella', 'rice', 'bacon', 'mascarpone', 'coffee', 'pesto', 'gnocchi_dough', 'cream',
    'bruschetta', 'caprese', 'risotto', 'pesto_pasta', 'carbonara', 'gnocchi', 'calzone', 'tiramisu',
    'bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'tomato_slice', 'onion_rings', 'bun_top',
    'pickles', 'toast', 'hotdog_bun', 'sausage', 'pancake', 'butter', 'berries', 'cup', 'ice_cream', 'chocolate', 'cherry',
    'hotdog', 'pancakes', 'sandwich', 'sundae', 'quesadilla', 'tostada', 'enchiladas',
    'tortilla', 'wrap', 'beans', 'pork', 'chicken', 'corn', 'avocado', 'lime', 'salsa', 'guacamole',
    'pizza', 'spaghetti', 'minestrone', 'omelette', 'burger', 'taco_carnitas', 'taco_pollo', 'taco_veggie', 'taco_frijol',
    'taco_verde', 'burrito_carnitas', 'burrito_pollo', 'burrito_veggie', 'burrito_verde',
  ] as (FoodId | DishId)[];
  it('every modelled food and dish has its own model (no stand-ins)', () => {
    for (const id of MODELLED) expect(hasDedicatedModel(id), id).toBe(true);
  });

  it('open tortilla and wrap are low and about 0.8 / 0.9 wide', () => {
    for (const [id, w] of [['tortilla', 0.8], ['wrap', 0.87]] as const) {
      const b = bounds(foodModel(id));
      expect(b.max.y).toBeLessThanOrEqual(0.07);
      expect(b.max.x - b.min.x).toBeGreaterThan(w - 0.05);
    }
  });

  it.each(FILLINGS)('filling piece %s is small, grounded and shared', (id) => {
    const a = fillingPiece(id), b = fillingPiece(id);
    checkMeshes(a);
    const box = bounds(a);
    expect(box.min.y).toBeCloseTo(0, 4);
    expect(box.max.y).toBeLessThanOrEqual(0.2);
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThanOrEqual(0.4);
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeGreaterThan(0.18);
    expect(modelTriangles(a)).toBeLessThanOrEqual(600);
    expect(meshes(a)[0].geometry).toBe(meshes(b)[0].geometry);
  });

  it('fillingPiece falls back to a scaled pantry model for other ids', () => {
    const o = fillingPiece('tomato');
    expect(o.scale.x).toBeLessThan(0.5);
    expect(meshes(o)[0].geometry).toBe(meshes(foodModel('tomato'))[0].geometry);
  });

  it('filling slots: 3 on a tortilla, 4 on a wrap, all on top of it', () => {
    for (const [id, n] of [['tortilla', 3], ['wrap', 4]] as const) {
      const slots = fillingSlots(id);
      expect(slots).toHaveLength(n);
      const top = bounds(foodModel(id)).max.y;
      for (const s of slots) {
        expect(Math.hypot(s.x, s.z)).toBeLessThan(0.25);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(top);
      }
    }
  });

  it.each(TACOS)('counter model of %s fits a counter slot', (id) => {
    const a = tacoModel(id), b = tacoModel(id);
    checkMeshes(a);
    const box = bounds(a);
    expect(box.min.y).toBeCloseTo(0, 4);
    expect(box.max.y).toBeLessThanOrEqual(0.85);
    expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThanOrEqual(0.45 + EPS);
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeGreaterThan(0.6);
    expect(modelTriangles(a)).toBeLessThanOrEqual(FOOD_TRIANGLE_BUDGET);
    expect(meshes(a)[0].geometry).toBe(meshes(b)[0].geometry);
  });

  it('tacoModel of a non-taco dish is the dish at half scale', () => {
    expect(tacoModel('pizza').scale.x).toBeCloseTo(0.5);
  });
});

describe('modelling kit', () => {
  const closed: [string, () => THREE.BufferGeometry][] = [
    ['ellipsoid', () => ellipsoid(0.3, 0.2, 0.25)],
    ['puck', () => puck(0.4, 0.1, 0.02, 24)],
    ['lathe ring', () => lathe([[0.2, 0], [0.3, 0], [0.3, 0.05], [0.2, 0.05]], 20, { closed: true })],
    ['lathe with crease', () => lathe([[0, 0], [0.3, 0], [0.3, 0], [0.3, 0.2], [0.3, 0.2], [0, 0.2]], 20)],
    ['sweep round caps', () => sweep([[0, 0, 0], [0.2, 0.1, 0.05], [0.4, 0, 0.1]], 0.04, 12, 8)],
    ['sweep flat caps', () => sweep([[0, 0, 0], [0.3, 0.2, 0]], (t) => 0.05 - 0.02 * t, 4, 6, { caps: 'flat' })],
    ['sweep flat ribbon', () => sweep([[0, 0, 0], [0.3, 0, 0.1]], 0.03, 3, 6, { up: [0, 1, 0], section: (p) => [Math.cos(p) * 0.4, Math.sin(p)] })],
    ['leaf', () => leaf(0.3, 0.15, { fold: 0.02 })],
    ['plate2', () => plate2(0.5, 0.4, 0.03, 6, 0.05)],
    ['dice', () => dice(0.1, 0.08, 0.1, 0.02)],
    ['loft', () => {
      const sections: Vec[][] = [[[-0.3, 0, 0]]];
      for (const x of [-0.2, 0, 0.2]) {
        const ring: Vec[] = [];
        for (let j = 0; j < 12; j++) {
          const a = (j / 12) * Math.PI * 2;
          ring.push([x, Math.cos(a) * 0.1, Math.sin(a) * 0.1]);
        }
        sections.push(ring);
      }
      sections.push([[0.3, 0, 0]]);
      return loft(sections);
    }],
  ];
  it.each(closed)('%s faces point outwards', (_name, make) => {
    expect(signedVolume(make())).toBeGreaterThan(0);
  });

  it('bakes parts into one geometry per finish standing on the ground', () => {
    const k = new Kit();
    k.add(ellipsoid(0.1, 0.1, 0.1).translate(0, 0.5, 0), '#ff0000');
    k.add(ellipsoid(0.1, 0.1, 0.1).translate(0.2, 0.3, 0), '#00ff00', 'gloss');
    const geo = k.bake();
    expect(geo.matte).toBeTruthy();
    expect(geo.gloss).toBeTruthy();
    const minY = Math.min(geo.matte!.boundingBox!.min.y, geo.gloss!.boundingBox!.min.y);
    expect(minY).toBeCloseTo(0, 6);
  });
});
