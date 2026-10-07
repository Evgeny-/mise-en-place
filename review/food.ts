/**
 * Review page for the food models: every food and dish under the game lighting, seen by an
 * orthographic camera at the play tilt, standing on pantry tiles like in the game.
 *
 * URL params:
 *   ids=tomato,egg      only these foods/dishes (all sections)
 *   sections=grid,strip,close   which sections to show (default all)
 *   close=tomato,pizza  ids for the close-up row (default: a few of each kind)
 *   csize=400           close-up cell size in px
 *   cell=190            grid cell size in px
 *   tilt=0.62           camera tilt from vertical (default PLAY_TILT)
 *   rot=0.5             spin every model around Y (inspect other sides)
 *   plain=1             neutral tiles instead of identity-tinted ones
 *   layers=1            also show each burger layer on its own
 *   sections=taq        Taquería extras: filling pieces, open tortilla/wrap with fillings, counter tacos
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addStudioLights, createRenderer, PLAY_TILT } from '../src/render/stage';
import { DISHES, FOODS, type DishId, type FoodId } from '../src/core/content';
import {
  BURGER_LAYERS, DISH_TRIANGLE_BUDGET, FOOD_TRIANGLE_BUDGET, burgerLayer, dishModel, fillingPiece, fillingSlots, foodModel,
  hasDedicatedModel, modelTriangles, tacoModel,
} from '../src/render/food';

const params = new URLSearchParams(location.search);
const tilt = Number(params.get('tilt') ?? PLAY_TILT);
const rot = Number(params.get('rot') ?? 0);
const plain = params.has('plain');
const cell = Number(params.get('cell') ?? 190);
const only = params.get('ids')?.split(',').filter(Boolean) ?? null;
const sections = (params.get('sections') ?? 'grid,strip,close').split(',');
const showLayers = params.has('layers');

const FOOD_IDS = (Object.keys(FOODS) as FoodId[]).filter((id) => !only || only.includes(id));
const DISH_IDS = (Object.keys(DISHES) as DishId[]).filter((id) => !only || only.includes(id));
const TRAY = '#8a5634';
const BAR = '#f4efe8';

// ------------------------------------------------------------------ scene

const host = document.getElementById('gl')!;
const renderer = createRenderer(host, { alpha: true });
renderer.setScissorTest(true);
const scene = new THREE.Scene();
const lights = addStudioLights(renderer, scene);
// Same sun placement as GameView (relative to the board centre) and a similar shadow frustum.
lights.sun.position.set(-7, 18, -6);
lights.sun.target.position.set(0, 0, 0);
const sc = lights.sun.shadow.camera;
sc.left = sc.bottom = -6;
sc.right = sc.top = 6;
sc.near = 1;
sc.far = 60;
sc.updateProjectionMatrix();

const groundGeo = new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2);
const trayGround = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: TRAY, roughness: 0.7 }));
const barGround = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: BAR, roughness: 0.35 }));
trayGround.receiveShadow = barGround.receiveShadow = true;
scene.add(trayGround, barGround);

function tint(hex: string, k: number): THREE.Color {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color('#ffffff'), k);
  return c;
}

const tileGeo = new RoundedBoxGeometry(1, 0.14, 1, 3, 0.06);
const baseGeo = new RoundedBoxGeometry(1, 0.06, 1, 2, 0.03);

/** The same tile stack as PantryView: dark base, identity-tinted tile, food on top. */
function onTile(obj: THREE.Object3D, color: string, size = 1): THREE.Group {
  const holder = new THREE.Group();
  const tw = 1.03 * size, td = 0.86 * size;
  const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: tint(color, 0.15), roughness: 0.5 }));
  base.scale.set(tw, 1, td);
  base.position.y = 0.03;
  base.receiveShadow = true;
  const tile = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color: tint(color, 0.62), roughness: 0.42 }));
  tile.scale.set(tw * 0.94, 1, td * 0.94);
  tile.position.y = 0.11;
  tile.castShadow = tile.receiveShadow = true;
  obj.scale.multiplyScalar(size === 1 ? Math.min(1, tw * 0.95) : 1);
  obj.position.y = 0.18;
  obj.rotation.y += rot;
  holder.add(base, tile, obj);
  return holder;
}

interface Entry {
  key: string;
  label: string;
  dish: boolean;
  holder: THREE.Group;
  tris: number;
  calls: number;
  budget: number;
}

const entries = new Map<string, Entry>();

function meshes(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
  return n;
}

function addEntry(key: string, label: string, dish: boolean, obj: THREE.Object3D, holder: THREE.Group, budget: number): void {
  holder.visible = false;
  scene.add(holder);
  entries.set(key, { key, label, dish, holder, tris: modelTriangles(obj), calls: meshes(obj), budget });
}

for (const id of FOOD_IDS) {
  const obj = foodModel(id);
  addEntry(id, hasDedicatedModel(id) ? id : `${id} (stand-in)`, false, obj, onTile(obj, plain ? '#e9dcc6' : FOODS[id].color), FOOD_TRIANGLE_BUDGET);
}
for (const id of DISH_IDS) {
  const obj = dishModel(id);
  obj.rotation.y = rot;
  const holder = new THREE.Group();
  holder.add(obj);
  addEntry(`dish:${id}`, hasDedicatedModel(id) ? id : `${id} (stand-in)`, true, obj, holder, DISH_TRIANGLE_BUDGET);
}
// The burger stacked from burgerLayer() pieces, to check the layer thicknesses.
if (!only || only.includes('burger') || only.includes('stack')) {
  const stack = new THREE.Group();
  let y = 0;
  for (const id of ['bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'tomato_slice', 'onion_rings', 'bun_top'] as FoodId[]) {
    const { object, thickness } = burgerLayer(id);
    object.position.y = y;
    stack.add(object);
    y += thickness;
  }
  stack.rotation.y = rot;
  const holder = new THREE.Group();
  holder.add(stack);
  addEntry('stack', 'layers stacked', true, stack, holder, Infinity);
}
if (showLayers) {
  for (const id of BURGER_LAYERS) {
    const { object } = burgerLayer(id);
    addEntry(`layer:${id}`, `layer ${id}`, false, object, onTile(object, FOODS[id].color), FOOD_TRIANGLE_BUDGET);
  }
}

// Taquería extras: filling pieces, open containers holding pieces, counter tacos and burritos.
const FILLINGS: FoodId[] = ['beans', 'pork', 'chicken', 'cheese', 'lettuce', 'corn', 'salsa', 'guacamole'];
const taqKeys: string[] = [];
if (sections.includes('taq')) {
  for (const id of FILLINGS) {
    const obj = fillingPiece(id);
    // Pieces are ~0.35 wide: show them on a tile at the same scale as on a tortilla.
    addEntry(`piece:${id}`, `piece ${id}`, false, obj, onTile(obj, FOODS[id].color), 600);
    taqKeys.push(`piece:${id}`);
  }
  for (const [container, fill] of [['tortilla', ['pork', 'salsa', 'cheese']], ['wrap', ['chicken', 'beans', 'guacamole', 'lettuce']],
    ['tortilla', ['beans', 'corn', 'lettuce']]] as [FoodId, FoodId[]][]) {
    const open = new THREE.Group();
    open.add(foodModel(container));
    fillingSlots(container).forEach((slot, i) => {
      if (!fill[i]) return;
      const p = fillingPiece(fill[i]);
      p.position.set(slot.x, slot.y, slot.z);
      p.rotation.y = slot.yaw;
      open.add(p);
    });
    const key = `open:${container}:${fill.join('+')}`;
    addEntry(key, `${container} + ${fill.join(', ')}`, false, open, onTile(open, FOODS[container].color), Infinity);
    taqKeys.push(key);
  }
  for (const id of (Object.keys(DISHES) as DishId[]).filter((d) => d.startsWith('taco_') || d.startsWith('burrito_'))) {
    const obj = tacoModel(id);
    addEntry(`counter:${id}`, `counter ${id}`, false, obj, onTile(obj, '#e9dcc6'), FOOD_TRIANGLE_BUDGET);
    taqKeys.push(`counter:${id}`);
  }
}

// ------------------------------------------------------------------ page

interface Cell { el: HTMLElement; entry: Entry; viewW: number; }
const cells: Cell[] = [];
const root = document.getElementById('sections')!;

function section(title: string, note: string): HTMLElement {
  const h = document.createElement('h2');
  h.innerHTML = `${title}<small>${note}</small>`;
  const row = document.createElement('div');
  row.className = 'row';
  root.append(h, row);
  return row;
}

function addCell(row: HTMLElement, entry: Entry, w: number, h: number, viewW: number, label: 'full' | 'name' | 'none'): void {
  const wrap = document.createElement('div');
  wrap.className = 'cell';
  const view = document.createElement('div');
  view.className = 'view';
  view.style.width = `${w}px`;
  view.style.height = `${h}px`;
  wrap.append(view);
  if (label !== 'none') {
    const l = document.createElement('div');
    l.className = 'label';
    const over = entry.tris > entry.budget ? ' over' : '';
    l.innerHTML = label === 'full'
      ? `${entry.label}<small class="${over}">${entry.tris} tris · ${entry.calls} draw${entry.calls === 1 ? '' : 's'}</small>`
      : entry.label;
    wrap.append(l);
  }
  row.append(wrap);
  cells.push({ el: view, entry, viewW });
}

const all = [...entries.values()].filter((e) => !taqKeys.includes(e.key));
const foodsOnly = all.filter((e) => !e.dish);
const dishesOnly = all.filter((e) => e.dish);

if (sections.includes('grid')) {
  const row = section('All items', 'game lighting · orthographic · play tilt');
  for (const e of all) addCell(row, e, e.dish ? Math.round(cell * 1.25) : cell, e.dish ? Math.round(cell * 1.25) : cell, e.dish ? 1.95 : 1.28, 'full');
}
if (sections.includes('strip')) {
  // Tiles at true phone size: a 1.03-wide tile is 56 px (then 48 px); dishes at the same density.
  for (const px of [56, 48]) {
    const row = section(`Phone scale · ${px} px tiles`, '1 CSS px = 1 device px here; phones render 2–3× sharper');
    row.classList.add('tight');
    const viewW = 1.18;
    const w = Math.round((px * viewW) / 1.03);
    for (const e of foodsOnly) addCell(row, e, w, w, viewW, 'none');
    if (dishesOnly.length) {
      const dishRow = document.createElement('div');
      dishRow.className = 'row tight';
      dishRow.style.marginTop = '4px';
      root.append(dishRow);
      for (const e of dishesOnly) addCell(dishRow, e, Math.round(w * 1.7), Math.round(w * 1.7), viewW * 1.7, 'none');
    }
  }
}
if (sections.includes('taq')) {
  const row = section('Taquería extras', 'filling pieces · open containers · counter tacos');
  for (const key of taqKeys) addCell(row, entries.get(key)!, cell, cell, 1.28, 'full');
}
if (sections.includes('close')) {
  const ids = params.get('close')?.split(',').filter(Boolean)
    ?? ['tomato', 'egg', 'cheese', 'mushroom', 'dish:pizza', 'dish:burger'];
  const row = section('Close-up', '');
  for (const id of ids) {
    const e = entries.get(id) ?? entries.get(`dish:${id}`);
    const cs = Number(params.get('csize') ?? 400);
    if (e) addCell(row, e, cs, cs, e.dish ? 1.85 : 1.15, 'full');
  }
}

const tris = foodsOnly.map((e) => e.tris);
document.getElementById('stats')!.textContent =
  `${foodsOnly.length} foods (max ${Math.max(0, ...tris)} tris) · ${dishesOnly.length} dishes · tilt ${tilt.toFixed(2)}`;

// ------------------------------------------------------------------ render

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 80);

function render(): void {
  const W = document.documentElement.scrollWidth;
  const H = document.documentElement.scrollHeight;
  renderer.setSize(W, H);
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const c of cells) {
    const r = c.el.getBoundingClientRect();
    const x = r.left + window.scrollX, y = r.top + window.scrollY;
    const vy = H - (y + r.height);
    renderer.setViewport(x, vy, r.width, r.height);
    renderer.setScissor(x, vy, r.width, r.height);
    for (const e of entries.values()) e.holder.visible = e === c.entry;
    trayGround.visible = !c.entry.dish;
    barGround.visible = c.entry.dish;
    const halfW = c.viewW / 2, halfH = (halfW * r.height) / r.width;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    const ty = c.entry.dish ? 0.08 : 0.3;
    const d = 30;
    camera.position.set(0, ty + d * Math.cos(tilt), d * Math.sin(tilt));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, ty, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  document.title = 'ready';
}

requestAnimationFrame(render);
