/**
 * Guests review page: every animal seated behind a wooden counter, seen from the game camera (top)
 * and from a closer, lower angle (bottom).
 *
 * URL params
 *   kinds=fox,cat        which guests, in order (default: all)
 *   anim=eat             idle | arrive | leave | eat | delight | expectant | look | demo (default demo)
 *   t=0.5                freeze that many seconds after the animation starts; a list (t=0.2,0.5,0.9)
 *                        renders one row per time (a contact sheet)
 *   view=both            both | game | close
 *   cols=3               lay a contact sheet out in a grid with this many columns
 *   ppu=90               pixels per seat in the game view (default: fit the row)
 *   close=3              how many seats the close view frames (from the left)
 *   look=x,y,z           world point for anim=look (default: a spot on the counter to the left)
 *   seed=1, warm=1.6     guest seed and idle warm-up seconds before the animation
 *   counter=0            hide the counter (to inspect the whole body)
 *   dpr=2                force a pixel ratio
 */
import * as THREE from 'three';
import { createRenderer, addStudioLights, PLAY_TILT } from '../src/render/stage';
import { Guest, GUEST_KINDS, GUEST_LAYOUT, createStool, type GuestKind } from '../src/render/guests';

const params = new URLSearchParams(location.search);
const kinds = (params.get('kinds')?.split(',').filter((k): k is GuestKind => (GUEST_KINDS as string[]).includes(k)) ?? []);
const KINDS: GuestKind[] = kinds.length ? kinds : [...GUEST_KINDS];
const anim = params.get('anim') ?? 'demo';
const times = params.get('t')?.split(',').map(Number).filter(Number.isFinite) ?? [];
const frozen = times.length > 0;
const view = params.get('view') ?? 'both';
const cols = Math.max(1, Number(params.get('cols')) || 1);
const ppu = Number(params.get('ppu')) || 0;
const closeCount = Math.max(1, Math.min(KINDS.length, Number(params.get('close')) || 3));
const seed = Number(params.get('seed')) || 1;
const warm = params.has('warm') ? Number(params.get('warm')) : 1.6;
const showCounter = params.get('counter') !== '0';
const lookParam = params.get('look')?.split(',').map(Number);
const SPACING = GUEST_LAYOUT.spacing;

const el = document.getElementById('c')!;
const renderer = createRenderer(el);
if (params.get('dpr')) renderer.setPixelRatio(Number(params.get('dpr')));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e6cf');
const { sun } = addStudioLights(renderer, scene);

const seatX = (i: number) => (i - (KINDS.length - 1) / 2) * SPACING;
const rowWidth = KINDS.length * SPACING;

// ---- Room: floor, back wall, counter strip with plates, stools ----
function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    const y = (i * c.height) / planks;
    const h = c.height / planks;
    g.fillStyle = ['#dfa66a', '#d99d60', '#e3ac72', '#d69a5d', '#dda468'][i];
    g.fillRect(0, y, c.width, h);
    g.strokeStyle = 'rgba(120, 70, 30, 0.12)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      const yy = y + 6 + k * (h - 12) / 5;
      g.moveTo(0, yy);
      for (let x = 0; x <= c.width; x += 32) g.lineTo(x, yy + Math.sin(x * 0.02 + i * 3 + k) * 2.2);
      g.stroke();
    }
    g.fillStyle = 'rgba(110, 60, 25, 0.35)';
    g.fillRect(0, y + h - 2, c.width, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const floorY = -0.9;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: '#e7cfa8', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = floorY;
floor.receiveShadow = true;
scene.add(floor);

const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), new THREE.MeshStandardMaterial({ color: '#f4dcc0', roughness: 0.95 }));
wall.position.set(0, floorY + 4, -2.2);
wall.receiveShadow = true;
scene.add(wall);
const wainscot = new THREE.Mesh(new THREE.BoxGeometry(60, 1.2, 0.08), new THREE.MeshStandardMaterial({ color: '#9fc7b5', roughness: 0.8 }));
wainscot.position.set(0, floorY + 0.6, -2.16);
wainscot.receiveShadow = true;
scene.add(wainscot);

const counterGroup = new THREE.Group();
counterGroup.visible = showCounter;
scene.add(counterGroup);
{
  const len = rowWidth + 1.6;
  const tex = woodTexture();
  tex.repeat.set(len / 3, 1);
  const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 });
  const sideMat = new THREE.MeshStandardMaterial({ color: '#b97a45', roughness: 0.7 });
  const depth = 1.45;
  const top = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, depth), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  top.position.set(0, GUEST_LAYOUT.counterTop - 0.05, GUEST_LAYOUT.counterEdgeZ + depth / 2);
  top.castShadow = top.receiveShadow = true;
  counterGroup.add(top);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, GUEST_LAYOUT.counterTop - 0.1 - floorY, depth - 0.45), new THREE.MeshStandardMaterial({ color: '#8fbfa9', roughness: 0.8 }));
  cabinet.position.set(0, (GUEST_LAYOUT.counterTop - 0.1 + floorY) / 2, GUEST_LAYOUT.counterEdgeZ + 0.45 + (depth - 0.45) / 2);
  cabinet.castShadow = cabinet.receiveShadow = true;
  counterGroup.add(cabinet);
  const plateMat = new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.35 });
  const foods = ['#e8473c', '#f0c45a', '#6cc04a', '#e0893a', '#c8302a', '#f6c938', '#9b5bb5', '#d9953f'];
  KINDS.forEach((_, i) => {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.04, 28), plateMat);
    plate.position.set(seatX(i), GUEST_LAYOUT.counterTop + 0.02, GUEST_LAYOUT.dishZ);
    plate.castShadow = plate.receiveShadow = true;
    counterGroup.add(plate);
    const food = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: foods[i % foods.length], roughness: 0.5 }));
    food.scale.set(1, 0.6, 1);
    food.position.set(seatX(i), GUEST_LAYOUT.counterTop + 0.04, GUEST_LAYOUT.dishZ);
    food.castShadow = true;
    counterGroup.add(food);
  });
}
KINDS.forEach((_, i) => {
  const stool = createStool(-floorY, ['#e05a4f', '#4fa3d9', '#f2b33d', '#7cbf6a'][i % 4]);
  stool.position.set(seatX(i), 0, 0);
  scene.add(stool);
});

// Shadow frustum around the whole row.
{
  const span = rowWidth / 2 + 3;
  const sc = sun.shadow.camera;
  sc.left = -span;
  sc.right = span;
  sc.top = span;
  sc.bottom = -span;
  sc.near = 1;
  sc.far = 70;
  sc.updateProjectionMatrix();
}

// ---- Guests: one set per contact-sheet row ----
interface Row {
  group: THREE.Group;
  guests: Guest[];
  t: number;
}
const rows: Row[] = (frozen ? times : [0]).map((t) => {
  const group = new THREE.Group();
  scene.add(group);
  const guests = KINDS.map((kind, i) => {
    const g = new Guest(kind, seed + i * 17);
    g.group.position.set(seatX(i), 0, 0);
    group.add(g.group);
    return g;
  });
  return { group, guests, t };
});

const lookPoint = (i: number) =>
  lookParam && lookParam.length === 3 ? new THREE.Vector3(lookParam[0], lookParam[1], lookParam[2]) : new THREE.Vector3(seatX(i) - 0.9, GUEST_LAYOUT.counterTop + 0.1, 0.95);

function trigger(g: Guest, i: number, name: string): void {
  switch (name) {
    case 'arrive': g.arrive(); break;
    case 'leave': g.leave(); break;
    case 'eat': g.eat(); break;
    case 'delight': g.delight(); break;
    case 'expectant': g.setExpectant(true); break;
    case 'look': g.lookAt(lookPoint(i)); break;
    default: break;
  }
}

// ---- Cameras ----
const gameCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const closeCam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

function fitGame(aspect: number, pxWidth: number): void {
  const cos = Math.cos(PLAY_TILT);
  const sin = Math.sin(PLAY_TILT);
  const target = new THREE.Vector3(0, 0.9, 0.35);
  // screen y of a world point: y * sin - z * cos (camera up is (0, sin, -cos))
  const top = 2.05 * sin - -0.45 * cos;
  const bottom = 0.5 * sin - 1.55 * cos;
  const midY = target.y * sin - target.z * cos;
  let halfW = rowWidth / 2 + 0.35;
  let halfH = Math.max(top - midY, midY - bottom) + 0.05;
  if (ppu > 0) {
    halfW = (pxWidth / ppu) * SPACING / 2;
    halfH = halfW / aspect;
  } else if (halfW / aspect < halfH) halfW = halfH * aspect;
  else halfH = halfW / aspect;
  gameCam.left = -halfW;
  gameCam.right = halfW;
  gameCam.top = halfH;
  gameCam.bottom = -halfH;
  gameCam.position.copy(target).add(new THREE.Vector3(0, cos, sin).multiplyScalar(40));
  gameCam.up.set(0, 1, 0);
  gameCam.lookAt(target);
  gameCam.near = 1;
  gameCam.far = 120;
  gameCam.updateProjectionMatrix();
}

function fitClose(aspect: number): void {
  const elevation = 0.3;
  const x0 = seatX(0);
  const x1 = seatX(closeCount - 1);
  const target = new THREE.Vector3((x0 + x1) / 2, 1.08, 0.15);
  const width = (x1 - x0) + SPACING * 1.15;
  const fov = THREE.MathUtils.degToRad(closeCam.fov);
  const distW = width / 2 / Math.tan(fov / 2) / aspect;
  const distH = (frozen && times.length > 1 ? 0.95 : 1.35) / Math.tan(fov / 2);
  const dist = Math.max(distW, distH);
  closeCam.aspect = aspect;
  closeCam.position.copy(target).add(new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation)).multiplyScalar(dist));
  closeCam.lookAt(target);
  closeCam.updateProjectionMatrix();
}

// ---- Labels ----
const labels: HTMLElement[] = [];
function label(text: string, cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  document.body.append(d);
  labels.push(d);
  return d;
}
const tmpV = new THREE.Vector3();
function place(elm: HTMLElement, p: THREE.Vector3, cam: THREE.Camera, vp: { x: number; y: number; w: number; h: number }): void {
  tmpV.copy(p).project(cam);
  elm.style.left = `${vp.x + ((tmpV.x + 1) / 2) * vp.w}px`;
  elm.style.top = `${vp.y + ((1 - tmpV.y) / 2) * vp.h}px`;
}

// ---- Simulation ----
const DT = 1 / 60;
let clock = 0;
function step(dt: number): void {
  clock += dt;
  for (const row of rows) for (const g of row.guests) g.update(dt, clock);
}

function freeze(): void {
  // Idle warm-up shared by every row, then each row runs its own time after the trigger.
  for (let k = 0; k < Math.round(warm / DT); k++) step(DT);
  const start = clock;
  for (const row of rows) row.guests.forEach((g, i) => trigger(g, i, anim));
  const order = rows.map((r, i) => [r.t, i]).sort((a, b) => a[0] - b[0]);
  // Advance all rows together, freezing each one when it reaches its time.
  const done = new Set<number>();
  for (const [t, i] of order) {
    while (clock - start < t - 1e-9) {
      const dt = Math.min(DT, t - (clock - start));
      clock += dt;
      rows.forEach((row, j) => {
        if (!done.has(j)) for (const g of row.guests) g.update(dt, clock);
      });
    }
    done.add(i);
  }
}

// Live demo: each guest runs the whole routine, staggered along the row.
const ROUTINE: [number, (g: Guest, i: number) => void][] = [
  [0, (g) => g.arrive()],
  [2.4, (g, i) => g.lookAt(lookPoint(i))],
  [3.6, (g) => g.lookAt(null)],
  [4.2, (g) => g.setExpectant(true)],
  [6.4, (g) => { g.setExpectant(false); g.eat(); }],
  [7.7, (g) => g.delight()],
  [10.5, (g) => g.leave()],
];
const PERIOD = 13.5;
const fired = new Map<string, number>();
function live(dt: number): void {
  rows[0].guests.forEach((g, i) => {
    if (anim === 'demo') {
      const local = clock - i * 0.45;
      if (local < 0) return;
      const cycle = Math.floor(local / PERIOD);
      const tt = local - cycle * PERIOD;
      ROUTINE.forEach(([at, fn], k) => {
        const key = `${i}:${k}`;
        if (tt >= at && fired.get(key) !== cycle) {
          fired.set(key, cycle);
          fn(g, i);
        }
      });
    } else {
      const period = anim === 'leave' || anim === 'arrive' ? 2.4 : anim === 'expectant' || anim === 'look' ? 3 : 2.2;
      const local = clock - i * 0.15;
      const cycle = Math.floor(local / period);
      const key = `${i}`;
      if (local >= 0 && fired.get(key) !== cycle) {
        fired.set(key, cycle);
        if (anim === 'leave') { if (g.state === 'away') g.arrive(); else g.leave(); }
        else if (anim === 'expectant') g.setExpectant(cycle % 2 === 0);
        else if (anim === 'look') g.lookAt(cycle % 2 === 0 ? lookPoint(i) : null);
        else trigger(g, i, anim);
      }
    }
  });
  step(dt);
}

// ---- Render ----
function render(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  renderer.setScissorTest(true);
  for (const l of labels) l.remove();
  labels.length = 0;
  const views = view === 'both' ? ['game', 'close'] : [view];
  const cells: { row: Row; v: string; x: number; y: number; w: number; h: number }[] = [];
  const total = rows.length * views.length;
  const gridCols = Math.min(cols, total);
  const gridRows = Math.ceil(total / gridCols);
  const cw = Math.floor(w / gridCols);
  const ch = Math.floor(h / gridRows);
  let n = 0;
  rows.forEach((row) => views.forEach((v) => {
    cells.push({ row, v, x: (n % gridCols) * cw, y: Math.floor(n / gridCols) * ch, w: cw, h: ch });
    n++;
  }));
  for (const cell of cells) {
    for (const row of rows) row.group.visible = row === cell.row;
    const aspect = cell.w / cell.h;
    const cam = cell.v === 'game' ? gameCam : closeCam;
    if (cell.v === 'game') fitGame(aspect, cell.w);
    else fitClose(aspect);
    // WebGL viewports count from the bottom.
    const vy = h - cell.y - cell.h;
    renderer.setViewport(cell.x, vy, cell.w, cell.h);
    renderer.setScissor(cell.x, vy, cell.w, cell.h);
    renderer.render(scene, cam);
    if (params.get('labels') !== '0') {
      const count = cell.v === 'game' ? KINDS.length : closeCount;
      for (let i = 0; i < count; i++) {
        place(label(KINDS[i], 'label'), new THREE.Vector3(seatX(i), GUEST_LAYOUT.counterTop, GUEST_LAYOUT.counterEdgeZ + (cell.v === 'game' ? 1.35 : 0.2)), cam, cell);
      }
      if (frozen) {
        const tag = label(`${anim} t=${cell.row.t}${views.length > 1 ? ` · ${cell.v}` : ''}`, 'row-label');
        tag.style.top = `${cell.y + 4}px`;
        tag.style.left = `${cell.x + 6}px`;
      }
    }
  }
}

const info = document.getElementById('info')!;
{
  const tris = rows[0].guests.map((g) => {
    let n = 0;
    g.group.traverse((o) => {
      if (o instanceof THREE.Mesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return `${g.kind} ${n}`;
  });
  info.textContent = `triangles: ${tris.join(' · ')}`;
}

if (frozen) {
  freeze();
  render();
  document.title = 'ready';
} else {
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    live(dt);
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  addEventListener('resize', render);
}
