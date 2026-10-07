import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FOODS, type FoodId } from '../core/content';
import type { PlaySim as Sim } from '../core/sim';
import type { Layout } from './layout';
import { foodModel } from './models';
import { ease, type Tweens } from './anim';
import { LabelTexture } from './textures';
import { shade } from './painter';
import { tileTexture } from './decor';

interface Entry {
  item: FoodId;
  /** tile + food, moved together */
  holder: THREE.Group;
  food: THREE.Object3D;
  /** current visual row (springs towards the target row) */
  z: number;
  /** level-start drop: seconds into the fall (negative = still waiting) */
  drop: number;
}

const DROP = 0.55;

/** Ease for a tile falling into its tray and settling. */
function bounce(k: number): number {
  if (k < 0.6) return 1 - (k / 0.6) * (k / 0.6);
  const t = (k - 0.6) / 0.4;
  return Math.sin(t * Math.PI) * 0.12;
}

interface Lid {
  group: THREE.Group;
  label: LabelTexture;
  open: boolean;
}

const TILE_H = 0.14;

/**
 * The pantry: one tray per column with its items standing on coloured tiles, the top item
 * nearest to the counter. Tiles slide forward when the front item is taken.
 */
export class PantryView {
  readonly group = new THREE.Group();
  private cols: Entry[][] = [];
  private hits: THREE.Mesh[] = [];
  private shades: THREE.Mesh[] = [];
  private lids: (Lid | null)[] = [];
  private tileGeo: THREE.BufferGeometry;
  private baseGeo: THREE.BufferGeometry;
  private tileMats = new Map<string, THREE.MeshStandardMaterial>();
  private baseMats = new Map<string, THREE.MeshStandardMaterial>();
  private hitMat = new THREE.MeshBasicMaterial({ visible: false });
  private shadeMat = new THREE.MeshBasicMaterial({ color: '#2b1a10', transparent: true, opacity: 0.32, depthWrite: false });
  private lidMat = new THREE.MeshStandardMaterial({ color: '#9a6a43', roughness: 0.6 });
  private lidTopMat = new THREE.MeshStandardMaterial({ color: '#b98454', roughness: 0.55 });
  private legal: boolean[] = [];
  /** called when a dropped-in tile lands (level start) */
  onLand: ((col: number) => void) | null = null;
  private hintCol = -1;
  private shakeT: number[] = [];

  constructor(
    private layout: Layout,
    private tweens: Tweens,
    private trayTop: number,
    private tileStyle = 'ceramic',
  ) {
    this.tileGeo = new RoundedBoxGeometry(1, TILE_H, 1, 3, 0.06);
    this.baseGeo = new RoundedBoxGeometry(1, 0.06, 1, 2, 0.03);
  }

  private tileMat(item: FoodId): THREE.MeshStandardMaterial {
    let m = this.tileMats.get(item);
    if (!m) {
      const map = tileTexture(this.tileStyle);
      m = new THREE.MeshStandardMaterial({ color: shade(FOODS[item].color, map ? 0.45 : 0.62), roughness: map ? 0.6 : 0.42, map });
      this.tileMats.set(item, m);
    }
    return m;
  }

  private baseMat(item: FoodId): THREE.MeshStandardMaterial {
    let m = this.baseMats.get(item);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: shade(FOODS[item].color, 0.15), roughness: 0.5 });
      this.baseMats.set(item, m);
    }
    return m;
  }

  private rowZ(row: number): number {
    return this.layout.rowZ0 + row * this.layout.rowStep;
  }

  private makeEntry(item: FoodId, col: number, row: number): Entry {
    const l = this.layout;
    const holder = new THREE.Group();
    const tw = l.tile;
    const td = l.rowStep * 0.86;
    const base = new THREE.Mesh(this.baseGeo, this.baseMat(item));
    base.scale.set(tw, 1, td);
    base.position.y = 0.03;
    base.receiveShadow = true;
    const tile = new THREE.Mesh(this.tileGeo, this.tileMat(item));
    tile.scale.set(tw * 0.94, 1, td * 0.94);
    tile.position.y = 0.04 + TILE_H / 2;
    tile.castShadow = true;
    tile.receiveShadow = true;
    const food = foodModel(item);
    food.scale.setScalar(Math.min(1, tw * 0.95));
    food.position.y = 0.04 + TILE_H;
    holder.add(base, tile, food);
    holder.position.set(l.colX[col], this.trayTop, this.rowZ(row));
    this.group.add(holder);
    return { item, holder, food, z: row, drop: DROP };
  }

  /** Rebuild every column from the simulation (level start, undo). */
  sync(sim: Sim, intro = false): void {
    for (const col of this.cols) for (const e of col) this.group.remove(e.holder);
    for (const h of this.hits) this.group.remove(h);
    for (const s of this.shades) this.group.remove(s);
    for (const lid of this.lids) if (lid) this.group.remove(lid.group);
    this.cols = [];
    this.hits = [];
    this.shades = [];
    this.lids.forEach((lid) => lid?.label.dispose());
    this.lids = [];
    const l = this.layout;
    sim.columns.forEach((items, c) => {
      const entries: Entry[] = [];
      for (let i = sim.ptr[c]; i < items.length; i++) {
        const e = this.makeEntry(items[i], c, i - sim.ptr[c]);
        // the pantry fills up: front rows first, columns rippling left to right
        if (intro) e.drop = -(0.08 * (i - sim.ptr[c]) + 0.05 * c + 0.15);
        entries.push(e);
      }
      this.cols.push(entries);
      const len = (l.rows - 1) * l.rowStep + l.tile + 0.3;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(l.colPitch, 1.2, len + 0.4), this.hitMat);
      hit.position.set(l.colX[c], 0.6, l.rowZ0 + ((l.rows - 1) * l.rowStep) / 2 - 0.2);
      hit.userData.col = c;
      this.group.add(hit);
      this.hits.push(hit);
      const shadePlane = new THREE.Mesh(new THREE.PlaneGeometry(l.tile + 0.2, len).rotateX(-Math.PI / 2), this.shadeMat);
      // above the items, shifted towards the camera so it covers the column's footprint on screen
      shadePlane.position.set(l.colX[c], 1.02, l.rowZ0 + ((l.rows - 1) * l.rowStep) / 2 + 1.02 * Math.tan(l.tilt));
      shadePlane.renderOrder = 5;
      shadePlane.visible = false;
      this.group.add(shadePlane);
      this.shades.push(shadePlane);
      const k = sim.level.lids?.[c] ?? 0;
      this.lids.push(k > sim.served ? this.makeLid(c, k - sim.served) : null);
    });
  }

  private makeLid(col: number, left: number): Lid {
    const l = this.layout;
    const g = new THREE.Group();
    const len = (l.rows - 1) * l.rowStep + l.tile + 0.12;
    const body = new THREE.Mesh(new RoundedBoxGeometry(l.tile + 0.2, 0.5, len, 3, 0.12), this.lidMat);
    body.position.y = 0.32;
    body.castShadow = true;
    body.receiveShadow = true;
    const top = new THREE.Mesh(new RoundedBoxGeometry(l.tile * 0.7, 0.08, l.tile * 0.7, 2, 0.04), this.lidTopMat);
    top.position.set(0, 0.6, l.rowStep * 0.2 - len / 2 + l.tile * 0.5);
    const label = new LabelTexture(128);
    label.draw(String(left), { fill: '#fff6e0' });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(l.tile * 0.62, l.tile * 0.62).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true }));
    plane.position.set(0, 0.65, top.position.z);
    g.add(body, top, plane);
    g.position.set(l.colX[col], this.trayTop, l.rowZ0 + ((l.rows - 1) * l.rowStep) / 2);
    this.group.add(g);
    return { group: g, label, open: false };
  }

  /** A lid shows how many more dishes it waits for; 0 opens it. */
  updateLids(sim: Sim): void {
    this.lids.forEach((lid, c) => {
      if (!lid || lid.open) return;
      const left = (sim.level.lids?.[c] ?? 0) - sim.served;
      if (left > 0) {
        lid.label.draw(String(left), { fill: '#fff6e0' });
        return;
      }
      lid.open = true;
      const g = lid.group;
      const y0 = g.position.y;
      this.tweens.add(0.7, (k) => {
        g.position.y = y0 + k * 2.4;
        g.rotation.x = -k * 0.5;
        g.scale.setScalar(1 - k * 0.3);
      }, { ease: ease.inQuad, done: () => this.group.remove(g) });
    });
  }

  lidded(col: number): boolean {
    const lid = this.lids[col];
    return !!lid && !lid.open;
  }

  /** Which columns can be tapped right now (others are shaded). */
  setLegal(legal: boolean[]): void {
    this.legal = legal;
    this.shades.forEach((s, c) => {
      s.visible = !legal[c] && this.cols[c].length > 0 && !this.lidded(c);
    });
  }

  setHint(col: number): void {
    this.hintCol = col;
  }

  /** A little "no" wiggle for a column that can't be taken right now. */
  shake(col: number): void {
    this.shakeT[col] = 1;
  }

  /**
   * Detach the front item of a column for its flight to the counter. Returns the food object
   * (already re-parented to `into`, keeping its world transform) and its start position.
   */
  take(col: number, into: THREE.Object3D): { food: THREE.Object3D; from: THREE.Vector3 } {
    const entry = this.cols[col].shift()!;
    const food = entry.food;
    const from = new THREE.Vector3();
    food.getWorldPosition(from);
    into.attach(food);
    const holder = entry.holder;
    this.tweens.add(0.22, (k) => holder.scale.setScalar(1 - k), { ease: ease.inQuad, done: () => this.group.remove(holder) });
    return { food, from };
  }

  /** Put an item back on the front of a column (undo). */
  untake(col: number, item: FoodId): void {
    const e = this.makeEntry(item, col, -1);
    e.z = -1;
    this.cols[col].unshift(e);
    e.holder.scale.setScalar(0.01);
    this.tweens.add(0.3, (k) => e.holder.scale.setScalar(0.01 + k * 0.99), { ease: ease.outBack });
  }

  pick(ray: THREE.Raycaster): number | null {
    const hit = ray.intersectObjects(this.hits, false)[0];
    return hit ? (hit.object.userData.col as number) : null;
  }

  /** World position of the front item of a column (for hints and tutorials). */
  frontPos(col: number, out: THREE.Vector3): THREE.Vector3 {
    const l = this.layout;
    return out.set(l.colX[col], this.trayTop + 0.5, this.rowZ(0));
  }

  setLayout(l: Layout): void {
    this.layout = l;
  }

  update(dt: number, time: number): void {
    const l = this.layout;
    const k = 1 - Math.exp(-dt * 14);
    this.cols.forEach((entries, c) => {
      const sh = this.shakeT[c] ?? 0;
      if (sh > 0) this.shakeT[c] = Math.max(0, sh - dt * 2.6);
      const dx = sh > 0 ? Math.sin(sh * 28) * 0.07 * sh : 0;
      entries.forEach((e, row) => {
        e.z += (row - e.z) * k;
        if (Math.abs(row - e.z) < 0.001) e.z = row;
        const front = row === 0 && this.legal[c] && !this.lidded(c);
        const hint = front && this.hintCol === c;
        const lift = front ? 0.05 + Math.sin(time * 3 + c * 0.9) * 0.025 : 0;
        let fall = 0;
        if (e.drop < DROP) {
          e.drop += dt;
          const k = Math.max(0, Math.min(1, e.drop / DROP));
          fall = e.drop < 0 ? 40 : bounce(k) * 3.2;
          if (e.drop >= DROP) this.onLand?.(c);
        }
        e.holder.position.set(l.colX[c] + dx, this.trayTop + lift + fall + (hint ? Math.abs(Math.sin(time * 6)) * 0.18 : 0), this.rowZ(e.z));
        e.food.rotation.y = front ? Math.sin(time * 1.6 + c) * 0.12 : 0;
      });
    });
  }

  dispose(): void {
    this.group.clear();
    this.tileGeo.dispose();
    this.baseGeo.dispose();
    for (const m of this.tileMats.values()) m.dispose();
    for (const m of this.baseMats.values()) m.dispose();
    this.hitMat.dispose();
    this.shadeMat.dispose();
    this.lidMat.dispose();
    this.lidTopMat.dispose();
    this.lids.forEach((lid) => lid?.label.dispose());
  }
}
