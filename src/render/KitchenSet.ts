import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Layout } from './layout';
import type { KitchenTheme } from './themes';
import { counterTileTexture, flourTexture, formicaTexture, marbleTexture, paintedWoodTexture, shade, slabWoodTexture, steelTexture, wallTexture, woodTexture, WALL_DROP, WALL_H, WALL_W } from './painter';
import { propModel } from './props';
import { clothTexture, plateColors, DEFAULT_LOOKS, type Looks } from './decor';

/**
 * The static kitchen, one chef's counter seen from where the chef stands: the worktop runs from the
 * guests' low serving ledge on past the bottom of the screen. On it: the pantry containers, the
 * cutting board with the prep bowls (the counter slots) and a few kitchen things for scale. Behind
 * the ledge the guests sit on the dining-room side, in front of the wall.
 */
/** Props are modelled at real proportions to the food; in the scene they stand a little larger. */
const PROP_SCALE = 1.6;

export class KitchenSet {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  /** world positions of the slot plates' tops */
  slotTop = 0.16;
  trayTop = 0.08;
  placemats: THREE.Mesh[] = [];

  constructor(
    private theme: KitchenTheme,
    private layout: Layout,
    private looks: Looks = DEFAULT_LOOKS,
  ) {
    this.build();
  }

  setLayout(l: Layout): void {
    this.layout = l;
    this.clear();
    this.build();
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadow: 'cast' | 'receive' | 'both' | 'none' = 'receive'): THREE.Mesh {
    const m = new THREE.Mesh(this.track(geo), mat);
    m.castShadow = shadow === 'cast' || shadow === 'both';
    m.receiveShadow = shadow === 'receive' || shadow === 'both';
    this.group.add(m);
    return m;
  }

  /** A canvas texture tiled every `size` world units over a w × h surface. */
  private tiled(tex: THREE.Texture, w: number, h: number, size: number): THREE.Texture {
    const t = this.track(tex.clone());
    t.needsUpdate = true;
    t.repeat.set(w / size, h / size);
    return t;
  }

  private build(): void {
    const l = this.layout;
    const th = this.theme;
    const width = Math.max(l.halfW * 2 + 14, 30);

    // The worktop: from under the ledge on past the bottom of any screen.
    const topLen = l.maxZ - l.barFrontZ + 14;
    const surf = this.mesh(new THREE.PlaneGeometry(width, topLen).rotateX(-Math.PI / 2), this.counterMaterial(width, topLen));
    surf.position.set(0, 0, l.barFrontZ - 0.3 + topLen / 2);

    this.buildLedge();

    // The wall: a backdrop leaning back so it faces the camera.
    const wallTex = wallTexture(th);
    const wallMat = this.track(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }));
    // its panelling runs on below the floor line, filling the gap behind the guests down to the ledge
    const wall = this.mesh(new THREE.PlaneGeometry(WALL_W, WALL_H + WALL_DROP).translate(0, (WALL_H - WALL_DROP) / 2, 0), wallMat);
    wall.rotation.x = l.tilt - Math.PI / 2;
    wall.position.set(0, l.floorY - 0.01, l.wallZ);
    // Above the wall: a ceiling beam in the ledge's colour, so tall screens never show a void.
    const beamMat = this.track(new THREE.MeshStandardMaterial({ color: shade(th.ledge.line, 0.1), roughness: 0.7 }));
    const beam = this.mesh(new THREE.PlaneGeometry(WALL_W + 10, 6).translate(0, WALL_H + 3, 0), beamMat);
    beam.rotation.x = l.tilt - Math.PI / 2;
    beam.position.set(0, l.floorY - 0.02, l.wallZ - 0.01);

    // Pantry containers, one per column: produce crates, steel prep pans or clay trays.
    const len = (l.rows - 1) * l.rowStep + l.tile + 0.3;
    for (const x of l.colX) {
      const c = this.pantryContainer(l.tile + 0.2, len);
      c.position.set(x, 0, l.rowZ0 + ((l.rows - 1) * l.rowStep) / 2);
      this.group.add(c);
    }

    // Cutting board with the slot plates.
    const boardTex = woodTexture(th.board, shade(th.board, -0.2), 31, 512).clone();
    boardTex.needsUpdate = true;
    boardTex.repeat.set(1.4, 0.5);
    this.track(boardTex);
    const boardMat = this.track(new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.6 }));
    const boardW = l.slotX.length * l.slotPitch + 0.36;
    const board = this.mesh(new RoundedBoxGeometry(boardW, 0.12, 1.24, 3, 0.06), boardMat, 'both');
    // the dishes stand a little proud of the board, so on screen they sit slightly higher than
    // their feet: shift the board back just enough that they look centred on it
    board.position.set(0, 0.06, l.slotZ - 0.05);
    // Mise en place: a little prep dish on the board for each counter spot.
    const house = th.bowl === 'steel' ? '#cfd6da' : th.bowl === 'clay' ? '#d07a4a' : th.plate;
    // the house china: Italian cream with a terracotta-red rim, diner steel, glazed clay
    const houseRim = th.bowl === 'steel' ? '#e2e7ea' : th.bowl === 'clay' ? '#9e4b2a' : '#c8553d';
    const [bowlColor, rimColor] = plateColors(this.looks.plate, house, houseRim);
    const metal = th.bowl === 'steel' && this.looks.plate === 'white';
    const bowlMat = this.track(new THREE.MeshStandardMaterial({ color: bowlColor, roughness: metal ? 0.3 : 0.35, metalness: metal ? 0.65 : 0, side: THREE.DoubleSide }));
    const rimMat = this.track(new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.4, metalness: this.looks.plate === 'gold' ? 0.5 : metal ? 0.6 : 0 }));
    // shallow dishes with a raised rim: food and preps (a pot, the dough on its board) sit on
    // them, not down inside
    const profile = [
      [0, 0], [0.38, 0], [0.42, 0.01], [0.49, 0.05], [0.52, 0.075], [0.505, 0.083], [0.47, 0.058], [0.41, 0.03], [0, 0.026],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bowlGeo = this.track(new THREE.LatheGeometry(profile, 44));
    const rimGeo = this.track(new THREE.TorusGeometry(0.513, 0.013, 8, 44).rotateX(Math.PI / 2).translate(0, 0.08, 0));
    for (const x of l.slotX) {
      const bowl = new THREE.Mesh(bowlGeo, bowlMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      bowl.castShadow = bowl.receiveShadow = true;
      bowl.position.set(x, 0.12, l.slotZ);
      rim.position.copy(bowl.position);
      this.group.add(bowl, rim);
    }
    this.slotTop = 0.12 + 0.03;
    this.dressWorktop(boardW);
  }

  /** The guests' serving ledge: a low slab along the far side of the counter, with the placemats. */
  private buildLedge(): void {
    const l = this.layout;
    const th = this.theme;
    const lg = th.ledge;
    const width = Math.max(l.halfW * 2 + 14, 30);
    const depth = l.barFrontZ - l.barBackZ;
    const midZ = (l.barFrontZ + l.barBackZ) / 2;
    // body: from the dining-room floor up; the chef sees only its short front above the worktop
    const bodyMat = this.track(new THREE.MeshStandardMaterial({ color: shade(lg.base, -0.25), roughness: 0.7 }));
    const bodyH = l.barTop - 0.06 - l.floorY;
    const body = this.mesh(new THREE.BoxGeometry(width, bodyH, depth), bodyMat, 'both');
    body.position.set(0, l.floorY + bodyH / 2, midZ);
    // the slab
    const slabD = depth + 0.24;
    const tex = lg.kind === 'wood'
      ? this.slabTexture(lg.base, lg.line, width)
      : lg.kind === 'tile'
        ? this.tiled(counterTileTexture(lg.base, lg.line), width, slabD, 1.8)
        : this.tiled(formicaTexture(lg.base, lg.line), width, slabD, 2.5);
    const slabMat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: lg.kind === 'wood' ? 0.45 : 0.3 }));
    const slab = this.mesh(new RoundedBoxGeometry(width, 0.12, slabD, 2, 0.04), slabMat, 'both');
    slab.position.set(0, l.barTop, midZ + 0.04);
    // trim along the front edge: a brass inlay or a ribbed chrome band
    const trimMat = this.track(new THREE.MeshStandardMaterial({ color: lg.trim, roughness: 0.25, metalness: lg.kind === 'formica' ? 0.85 : lg.kind === 'wood' ? 0.5 : 0 }));
    const front = midZ + 0.04 + slabD / 2;
    const trim = this.mesh(new THREE.BoxGeometry(width, 0.08, 0.025), trimMat, 'none');
    trim.position.set(0, l.barTop - 0.005, front + 0.004);

    // Placemats in front of each seat.
    const matTex = clothTexture(this.looks.cloth, th.cloth);
    const placeMat = this.track(new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.9 }));
    this.placemats = l.seatX.map((x) => {
      // an oval mat, so it fits on the ledge in front of the paws without hanging over its edge
      const m = this.mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.012, 40).scale(1, 1, 0.8), placeMat);
      m.position.set(x, l.barTop + 0.066, l.plateZ);
      return m;
    });
  }

  /** What makes the worktop a kitchen table: flour by the board, the cold well, utensils for scale. */
  private dressWorktop(boardW: number): void {
    const l = this.layout;
    const th = this.theme;
    if (th.counter.kind === 'marble') {
      const flour = this.mesh(
        new THREE.PlaneGeometry(boardW + 1.6, 2.2).rotateX(-Math.PI / 2),
        this.track(new THREE.MeshStandardMaterial({ map: flourTexture(), transparent: true, depthWrite: false, roughness: 1 })),
        'receive',
      );
      flour.position.set(0, 0.004, l.slotZ + 0.1);
    }
    const pantryHalf = l.colX[l.colX.length - 1] + l.tile / 2 + 0.1;
    const pantryLen = (l.rows - 1) * l.rowStep + l.tile + 0.3;
    if (th.pantry === 'steel') {
      // a line cook's cold well: the pans stand in a recessed steel tray with a raised rim
      const w = pantryHalf * 2 + 0.24;
      const d = pantryLen + 0.24;
      const z = l.rowZ0 + ((l.rows - 1) * l.rowStep) / 2;
      const well = this.mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), this.track(new THREE.MeshStandardMaterial({ color: '#69747a', roughness: 0.5, metalness: 0.5 })));
      well.position.set(0, 0.003, z);
      const rim = this.track(new THREE.MeshStandardMaterial({ color: '#e2e7ea', roughness: 0.25, metalness: 0.8 }));
      for (const sx of [-1, 1]) this.mesh(new RoundedBoxGeometry(0.08, 0.1, d + 0.08, 2, 0.03), rim, 'both').position.set(sx * (w / 2 + 0.02), 0.05, z);
      for (const sz of [-1, 1]) this.mesh(new RoundedBoxGeometry(w + 0.12, 0.1, 0.08, 2, 0.03), rim, 'both').position.set(0, 0.05, z + sz * (d / 2 + 0.02));
    }
    // Props: two beside the cutting board, two further out beside the pantry (wide screens).
    const spots: [number, number, number][] = [
      [-(boardW / 2 + 0.55), l.slotZ - 0.05, 0.4],
      [boardW / 2 + 0.55, l.slotZ + 0.05, -0.5],
      [-(pantryHalf + 1.1), l.rowZ0 + 0.6, 0.6],
      [pantryHalf + 1.1, l.rowZ0 + 1.0, -0.3],
    ];
    th.props.forEach((kind, i) => {
      const spot = spots[i];
      if (!spot) return;
      const p = propModel(kind, (x) => this.track(x));
      p.position.set(spot[0], 0, spot[1]);
      p.rotation.y = spot[2];
      p.scale.setScalar(PROP_SCALE);
      this.group.add(p);
    });
  }

  /** The ledge's wood: one board along the whole counter, the texture spanning its depth once. */
  private slabTexture(base: string, line: string, width: number): THREE.Texture {
    const t = this.track(slabWoodTexture(base, line).clone());
    t.needsUpdate = true;
    t.repeat.set(width / 9, 1);
    return t;
  }

  private counterMaterial(width: number, len: number): THREE.MeshStandardMaterial {
    const c = this.theme.counter;
    if (c.kind === 'steel') {
      return this.track(new THREE.MeshStandardMaterial({ map: this.tiled(steelTexture(c.base, c.line), width, len, 3), roughness: 0.36, metalness: 0.55 }));
    }
    if (c.kind === 'painted') {
      // a painted wooden table, planks running along the counter
      return this.track(new THREE.MeshStandardMaterial({ map: this.tiled(paintedWoodTexture(c.base, c.line), width, len, 7), roughness: 0.6 }));
    }
    // one big marble slab: the veins span the whole counter
    return this.track(new THREE.MeshStandardMaterial({ map: this.tiled(marbleTexture(c.base, c.line, 11), width, len, 10), roughness: 0.28 }));
  }

  /** One pantry column's container, centred at the origin, items standing on y = trayTop. */
  private pantryContainer(w: number, len: number): THREE.Group {
    const th = this.theme;
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(this.track(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    const floorH = this.trayTop;
    if (th.pantry === 'steel') {
      const steel = this.track(new THREE.MeshStandardMaterial({ color: th.tray, roughness: 0.32, metalness: 0.7 }));
      add(new RoundedBoxGeometry(w, floorH, len, 2, 0.03), steel, 0, floorH / 2, 0);
      for (const sx of [-1, 1]) add(new RoundedBoxGeometry(0.045, 0.2, len, 2, 0.02), steel, sx * (w / 2 - 0.02), 0.1, 0);
      for (const sz of [-1, 1]) add(new RoundedBoxGeometry(w, 0.2, 0.045, 2, 0.02), steel, 0, 0.1, sz * (len / 2 - 0.02));
      return g;
    }
    if (th.pantry === 'clay') {
      const clay = this.track(new THREE.MeshStandardMaterial({ color: th.tray, roughness: 0.85 }));
      const glaze = this.track(new THREE.MeshStandardMaterial({ color: shade(th.tray, 0.25), roughness: 0.4 }));
      add(new RoundedBoxGeometry(w, floorH, len, 3, 0.04), clay, 0, floorH / 2, 0);
      for (const sx of [-1, 1]) add(new RoundedBoxGeometry(0.08, 0.2, len, 3, 0.035), glaze, sx * (w / 2 - 0.04), 0.1, 0);
      for (const sz of [-1, 1]) add(new RoundedBoxGeometry(w, 0.2, 0.08, 3, 0.035), glaze, 0, 0.1, sz * (len / 2 - 0.04));
      return g;
    }
    // produce crate: a slatted wooden box
    const wood = woodTexture(shade(th.tray, 0.15), shade(th.tray, -0.25), 21, 512).clone();
    wood.needsUpdate = true;
    wood.repeat.set(0.5, 1.5);
    this.track(wood);
    const plank = this.track(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.75 }));
    const dark = this.track(new THREE.MeshStandardMaterial({ map: wood, color: '#d8c4a8', roughness: 0.8 }));
    add(new RoundedBoxGeometry(w, floorH, len, 2, 0.02), dark, 0, floorH / 2, 0);
    for (const sx of [-1, 1]) for (const y of [0.1, 0.23]) add(new RoundedBoxGeometry(0.05, 0.085, len, 2, 0.02), plank, sx * (w / 2 - 0.025), y, 0);
    for (const sz of [-1, 1]) add(new RoundedBoxGeometry(w + 0.02, 0.3, 0.06, 2, 0.02), plank, 0, 0.15, sz * (len / 2 - 0.03));
    return g;
  }

  private clear(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.clear();
  }

  dispose(): void {
    this.clear();
  }
}
