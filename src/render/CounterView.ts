import * as THREE from 'three';
import { FOODS, type FoodId } from '../core/content';
import type { PlaySim as Sim } from '../core/sim';
import type { Layout } from './layout';
import { dishModel, fillingPiece, fillingSlots, foodModel, tacoModel } from './models';
import { LabelTexture } from './textures';
import type { DishId } from '../core/content';
import { arc, ease, squash, type Tweens } from './anim';
import type { FxView } from './FxView';
import { audio } from '../audio/audio';

export const FLIGHT = 0.36;
/** preps that come off the stove hot; raw ones (dough, salsa, guacamole) don't steam */
const STEAMING: ReadonlySet<FoodId> = new Set<FoodId>(['sauce', 'soffritto']);
export const MERGE = 0.3;

/**
 * The chef's counter: items sitting on the slot plates. The logical contents change at once;
 * the objects animate after the given delays, so quick taps never fight over a slot.
 */
export class CounterView {
  readonly group = new THREE.Group();
  /** object currently owning each slot (may still be flying in) */
  private objs: (THREE.Object3D | null)[] = [];
  private ids: (FoodId | null)[] = [];
  private steamT = 0;
  /** taco kitchens: a glowing ring under the tortilla that receives the next filling */
  private ring: THREE.Mesh;
  private ringSlot: number | null = null;
  private ringT = 0;
  /** the stove: a burner under a slot while something cooks there, with its countdown */
  private burners: (Burner | null)[] = [];
  private burnerMat = new THREE.MeshStandardMaterial({ color: '#2f2a2a', roughness: 0.5, metalness: 0.6 });
  private flameMat = new THREE.MeshBasicMaterial({ color: '#ff7a2f', transparent: true, opacity: 0.9, depthWrite: false });
  private badgeMat = new THREE.MeshBasicMaterial({ color: '#c2410c', depthWrite: false, transparent: true });
  /** a finished dish waiting for its guest sits on a red napkin: per slot */
  private napkins: (THREE.Group | null)[] = [];
  private napkinMat = new THREE.MeshStandardMaterial({ color: '#d63b3b', roughness: 0.8 });
  private napkinInnerMat = new THREE.MeshStandardMaterial({ color: '#fff4e2', roughness: 0.85 });

  constructor(
    private layout: Layout,
    private tweens: Tweens,
    private fx: FxView,
    private top: number,
  ) {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.54, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    this.group.add(this.ring);
  }

  /**
   * The last part of a dish that is served at once: over the board, between the other parts
   * (the counter is full, so it has no dish of its own to land on).
   */
  joinPos(others: number[], out = new THREE.Vector3()): THREE.Vector3 {
    const xs = others.filter((i) => i < this.layout.slotX.length).map((i) => this.layout.slotX[i]);
    const x = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    return out.set(x, this.top + 0.75, this.layout.slotZ);
  }

  slotPos(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const l = this.layout;
    const x = i < l.slotX.length ? l.slotX[i] : l.slotX[l.slotX.length - 1] + l.slotPitch;
    return out.set(x, this.top, l.slotZ);
  }

  sync(sim: Sim): void {
    for (const o of this.objs) if (o) this.group.remove(o);
    this.objs = [];
    this.ids = [];
    for (const b of this.burners) if (b) this.dropBurner(b);
    this.burners = [];
    for (const n of this.napkins) if (n) this.group.remove(n);
    this.napkins = [];
    const info = (sim as unknown as { slotInfo?: (i: number) => import('../core/taco').TacoSlot | null }).slotInfo?.bind(sim);
    this.setReceiving(null);
    sim.counter.forEach((id, i) => {
      const held = sim.heldAt?.(i) ?? null;
      if (held) {
        // a finished dish waiting for its guest (set menu, VIP); stacked kitchens put it above the tray
        const lift = sim.ticket ? 0.07 : 0;
        this.napkins[i] = this.makeNapkin(i, lift);
        const o = this.ovenDish(held);
        o.position.copy(this.slotPos(i));
        o.position.y += 0.03 + lift;
        this.group.add(o);
        this.objs.push(o);
        this.ids.push(null);
        return;
      }
      const cook = sim.cooking?.(i) ?? null;
      if (cook) this.burners[i] = this.makeBurner(i, cook.left);
      if (cook?.dish) {
        // a dish in the oven
        const o = this.ovenDish(cook.dish);
        o.position.copy(this.slotPos(i));
        this.group.add(o);
        this.objs.push(o);
        this.ids.push(null);
        return;
      }
      if (!id) {
        this.objs.push(null);
        this.ids.push(null);
        return;
      }
      const slot = info?.(i);
      if (slot && (slot.kind === 'open' || slot.kind === 'taco')) {
        // taco kitchens: rebuild a tortilla with its fillings, or a folded taco
        const o = slot.kind === 'taco' ? tacoModel(slot.dish) : foodModel(slot.item);
        if (slot.kind === 'open') slot.fill.forEach((f, n) => o.add(this.piece(f, n, slot.cap)));
        o.position.copy(this.slotPos(i));
        this.group.add(o);
        this.objs.push(o);
        this.ids.push(id);
        if (slot.kind === 'open' && slot.receiving) this.setReceiving(i);
        return;
      }
      const o = foodModel(id);
      o.position.copy(this.slotPos(i));
      this.group.add(o);
      this.objs.push(o);
      this.ids.push(id);
    });
  }

  setLayout(l: Layout): void {
    this.layout = l;
    while (this.objs.length < l.slotX.length) {
      this.objs.push(null);
      this.ids.push(null);
    }
    // glide items to their (possibly moved) plates
    this.objs.forEach((o, i) => {
      if (!o) return;
      const from = o.position.clone();
      const to = this.slotPos(i);
      this.tweens.add(0.35, (k) => o.position.lerpVectors(from, to, k), { ease: ease.inOutCubic });
    });
  }

  /**
   * An item taken from the pantry flies to slot `slot` (or straight onto `target`, the slot of
   * the item it is about to combine with, or to the point `at` in the air). `obj` is already in
   * world space.
   */
  land(obj: THREE.Object3D, from: THREE.Vector3, slot: number, target: number, delay: number, id: FoodId, at?: THREE.Vector3): void {
    this.group.attach(obj);
    obj.position.copy(from);
    this.objs[slot] = obj;
    this.ids[slot] = id;
    const to = at ?? this.slotPos(target);
    const a = from.clone();
    const p = new THREE.Vector3();
    this.tweens.add(FLIGHT, (k) => {
      arc(a, to, 1.1, k, p);
      obj.position.copy(p);
      obj.rotation.y = k * Math.PI * 2;
      const s = 1 + Math.sin(k * Math.PI) * 0.18;
      obj.scale.setScalar(s);
    }, {
      delay,
      ease: ease.inOutSine,
      tag: obj,
      done: () => {
        obj.rotation.y = 0;
        if (at) return;
        audio.play('land', { pan: to.x / 6 });
        this.tweens.add(0.42, (k) => {
          const s = squash(k, 0.3);
          obj.scale.set(s.xz, s.y, s.xz);
        }, { ease: ease.linear, tag: obj });
      },
    });
  }

  /** Items at `a` and `b` become `item` at `slot` after `delay`. */
  merge(a: number, b: number, slot: number, item: FoodId, delay: number, pitch: number): void {
    const oa = this.objs[a];
    const ob = this.objs[b];
    const at = this.slotPos(slot);
    this.objs[a] = this.objs[b] = null;
    this.ids[a] = this.ids[b] = null;
    const product = foodModel(item);
    product.position.copy(at);
    product.scale.setScalar(0.001);
    this.group.add(product);
    this.objs[slot] = product;
    this.ids[slot] = item;
    const gone = [oa, ob].filter((o): o is THREE.Object3D => !!o);
    this.tweens.add(MERGE * 0.6, (k) => {
      for (const o of gone) {
        o.position.lerp(at, k * 0.6);
        o.scale.setScalar(Math.max(0.001, 1 - k));
        o.rotation.y += 0.25;
      }
    }, {
      delay,
      ease: ease.inQuad,
      start: () => {
        for (const o of gone) this.tweens.cancel(o);
      },
      done: () => {
        for (const o of gone) this.group.remove(o);
        this.fx.puff(at.x, at.y + 0.35, at.z, '#ffffff', 9, 0.42);
        this.fx.sparkle(at.x, at.y + 0.4, at.z, FOODS[item].color, 14, 0.9);
        audio.play('prep', { pitch });
        this.tweens.add(0.45, (k) => product.scale.setScalar(Math.max(0.001, k)), { ease: ease.outBack, tag: product });
      },
    });
  }

  /** The parts at `slots` leave for a guest's plate. Returns them (world-space objects) for the guest view. */
  release(slots: number[]): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const s of slots) {
      const o = this.objs[s];
      this.objs[s] = null;
      this.ids[s] = null;
      this.dropNapkin(s);
      if (o) out.push(o);
    }
    return out;
  }

  /** A filling piece placed on an open tortilla: the n-th of `cap`, in a little ring. */
  private piece(item: FoodId, n: number, cap: number): THREE.Object3D {
    const p = fillingPiece(item);
    const at = fillingSlots(cap >= 4 ? 'wrap' : 'tortilla')[n];
    if (at) {
      p.position.set(at.x, at.y, at.z);
      p.rotation.y = at.yaw;
    } else {
      const a = (n / cap) * Math.PI * 2 + 0.4;
      p.position.set(Math.cos(a) * 0.17, 0.05 + n * 0.012, Math.sin(a) * 0.15);
    }
    return p;
  }

  /**
   * Taco kitchens: a filling drops into the open container at `slot` (now holding n). `obj` comes
   * straight from the pantry (world space); otherwise it is the item waiting at counter `from`.
   */
  fill(obj: THREE.Object3D | null, from: THREE.Vector3 | null, fromSlot: number | null, slot: number, item: FoodId, n: number, cap: number, delay: number): void {
    let o = obj;
    if (!o && fromSlot !== null) {
      o = this.objs[fromSlot];
      this.objs[fromSlot] = null;
      this.ids[fromSlot] = null;
    }
    const target = this.objs[slot];
    if (!o) return;
    this.group.attach(o);
    const a = from ? from.clone() : o.position.clone();
    o.position.copy(a);
    const to = this.slotPos(slot);
    const p = new THREE.Vector3();
    this.tweens.add(FLIGHT, (k) => {
      arc(a, to, 0.9, k, p);
      o!.position.copy(p);
      o!.scale.setScalar(1 - k * 0.55);
    }, {
      delay,
      ease: ease.inOutSine,
      tag: o,
      start: () => {
        this.tweens.cancel(o!);
        a.copy(o!.position);
      },
      done: () => {
        this.group.remove(o!);
        if (target) {
          target.add(this.piece(item, n - 1, cap));
          this.tweens.add(0.35, (k) => {
            const sq = squash(k, 0.25);
            target.scale.set(sq.xz, sq.y, sq.xz);
          }, { ease: ease.linear, tag: target });
        }
        audio.play('plop', { pitch: n - 1 });
        this.fx.puff(to.x, to.y + 0.15, to.z, '#fff6e0', 3, 0.16);
      },
    });
  }

  /** Taco kitchens: the full container at `slot` folds into a taco. */
  fold(slot: number, dish: DishId, delay: number): void {
    const old = this.objs[slot];
    const taco = tacoModel(dish);
    const at = this.slotPos(slot);
    taco.position.copy(at);
    taco.scale.multiplyScalar(0.001);
    const full = taco.scale.x / 0.001;
    this.group.add(taco);
    this.objs[slot] = taco;
    this.tweens.after(delay, () => {
      if (old) this.group.remove(old);
      this.fx.puff(at.x, at.y + 0.3, at.z, '#ffffff', 7, 0.36);
      this.fx.sparkle(at.x, at.y + 0.35, at.z, '#ffd23f', 12, 0.8);
      audio.play('fold');
      this.tweens.add(0.42, (k) => taco.scale.setScalar(Math.max(0.001, k * full)), { ease: ease.outBack, tag: taco });
    });
  }

  /** Taco kitchens: a container on the extra landing spot moves to a freed slot. */
  move(from: number, to: number, delay: number): void {
    this.dropNapkin(from);
    const o = this.objs[from];
    this.objs[to] = o;
    this.ids[to] = this.ids[from];
    this.objs[from] = null;
    this.ids[from] = null;
    if (!o) return;
    const a = new THREE.Vector3();
    const b = this.slotPos(to);
    this.tweens.add(0.3, (k) => o.position.lerpVectors(a, b, k), { delay, ease: ease.inOutCubic, start: () => a.copy(o.position) });
  }

  // ---------------------------------------------------------------------------------- the stove

  /** A dish model sized for a counter slot (it bakes there). */
  private ovenDish(dish: DishId): THREE.Object3D {
    const o = dishModel(dish);
    o.scale.multiplyScalar(0.62);
    return o;
  }

  /** A round burner with a flame ring under slot i and a big countdown above it. */
  private makeBurner(i: number, left: number): Burner {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.54, 0.06, 32), this.burnerMat);
    plate.position.y = -0.02;
    plate.receiveShadow = true;
    const flame = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.6, 36).rotateX(-Math.PI / 2), this.flameMat);
    flame.position.y = 0.03;
    flame.renderOrder = 3;
    // the countdown: a round orange badge with a big white number, facing the camera
    const label = new LabelTexture(128);
    label.draw(String(left), COOK_INK);
    const tag = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.27, 28), this.badgeMat);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false }));
    num.position.z = 0.01;
    disc.renderOrder = 8;
    num.renderOrder = 9;
    tag.add(disc, num);
    tag.position.set(0.4, 0.82, 0.25);
    tag.rotation.x = -0.5;
    g.add(plate, flame, tag);
    g.position.copy(this.slotPos(i));
    this.group.add(g);
    return { group: g, flame, tag, label, left, t: 0 };
  }

  private dropBurner(b: Burner): void {
    this.group.remove(b.group);
    b.label.dispose();
    ((b.tag.children[1] as THREE.Mesh).material as THREE.Material).dispose();
  }

  /** Parts at `from` go into the oven at `slot` as `dish`, baking for `left` takes. */
  bake(from: number[], slot: number, dish: DishId, left: number, delay: number): void {
    const gone = from.map((i) => this.objs[i]).filter((o): o is THREE.Object3D => !!o);
    for (const i of from) {
      this.objs[i] = null;
      this.ids[i] = null;
    }
    const at = this.slotPos(slot);
    const product = this.ovenDish(dish);
    const full = product.scale.x;
    product.position.copy(at);
    product.scale.setScalar(0.001);
    this.group.add(product);
    this.objs[slot] = product;
    this.tweens.add(MERGE, (k) => {
      for (const o of gone) {
        o.position.lerp(at, k * 0.6);
        o.scale.setScalar(Math.max(0.001, 1 - k));
      }
    }, {
      delay,
      ease: ease.inQuad,
      start: () => {
        for (const o of gone) this.tweens.cancel(o);
      },
      done: () => {
        for (const o of gone) this.group.remove(o);
        this.burners[slot] = this.makeBurner(slot, left);
        this.fx.puff(at.x, at.y + 0.35, at.z, '#ffffff', 8, 0.4);
        audio.play('fold');
        this.tweens.add(0.45, (k) => product.scale.setScalar(Math.max(0.001, k * full)), { ease: ease.outBack, tag: product });
      },
    });
  }

  /** A red napkin folded on the diagonal under slot i: a finished dish waits there for its guest. */
  private makeNapkin(i: number, lift = 0): THREE.Group {
    const g = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.9), this.napkinMat);
    cloth.rotation.y = Math.PI / 4;
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), this.napkinInnerMat);
    inner.rotation.y = Math.PI / 4;
    g.add(cloth, inner);
    g.position.copy(this.slotPos(i));
    g.position.y += 0.012 + lift;
    this.group.add(g);
    return g;
  }

  private dropNapkin(slot: number): void {
    const n = this.napkins[slot];
    if (n) this.group.remove(n);
    this.napkins[slot] = null;
  }

  /** Parts at `from` become `dish`, which waits on a napkin at `slot` for its guest (set menu, VIP). */
  ready(from: number[], slot: number, dish: DishId, delay: number): void {
    const gone = from.map((i) => this.objs[i]).filter((o): o is THREE.Object3D => !!o);
    for (const i of from) {
      this.objs[i] = null;
      this.ids[i] = null;
    }
    const at = this.slotPos(slot);
    const product = this.ovenDish(dish);
    const full = product.scale.x;
    product.position.copy(at);
    product.position.y += 0.03;
    product.scale.setScalar(0.001);
    this.group.add(product);
    this.objs[slot] = product;
    this.tweens.add(MERGE, (k) => {
      for (const o of gone) {
        o.position.lerp(at, k * 0.6);
        o.scale.setScalar(Math.max(0.001, 1 - k));
      }
    }, {
      delay,
      ease: ease.inQuad,
      start: () => {
        for (const o of gone) this.tweens.cancel(o);
      },
      done: () => {
        for (const o of gone) this.group.remove(o);
        this.napkins[slot] = this.makeNapkin(slot);
        this.fx.sparkle(at.x, at.y + 0.4, at.z, '#ffd23f', 12, 0.8);
        audio.play('bell', { volume: 0.6 });
        this.tweens.add(0.45, (k) => product.scale.setScalar(Math.max(0.001, k * full)), { ease: ease.outBack, tag: product });
      },
    });
  }

  /** Burger kitchens: a finished stack (world-space group) moves from its plate to a napkin at `slot`. */
  adopt(holder: THREE.Object3D, slot: number, delay: number): void {
    this.objs[slot] = holder;
    const to = this.slotPos(slot);
    // above the metal serving tray, on a napkin
    to.y += 0.1;
    const a = new THREE.Vector3();
    const p = new THREE.Vector3();
    this.tweens.add(0.45, (k) => {
      arc(a, to, 0.8, k, p);
      holder.position.copy(p);
    }, {
      delay,
      ease: ease.inOutSine,
      start: () => {
        this.group.attach(holder);
        a.copy(holder.position);
        // the napkin is laid out as the stack comes over (it may have moved to a freed spot meanwhile)
        const at = this.objs.indexOf(holder);
        if (at >= 0 && at < this.layout.slotX.length && !this.napkins[at]) this.napkins[at] = this.makeNapkin(at, 0.07);
      },
      done: () => audio.play('land'),
    });
  }

  /** A patty at `slot` goes on the grill for `left` takes. */
  grill(slot: number, left: number, delay: number): void {
    this.tweens.after(delay + FLIGHT, () => {
      if (this.burners[slot]) this.dropBurner(this.burners[slot]!);
      this.burners[slot] = this.makeBurner(slot, left);
      audio.play('prep', { pitch: 0 });
    });
  }

  /** The countdown at `slot` shows `left` takes to go. */
  setCook(slot: number, left: number, delay: number): void {
    this.tweens.after(delay, () => {
      const b = this.burners[slot];
      if (!b) return;
      b.left = left;
      b.label.draw(String(left), COOK_INK);
      b.t = 0.35;
    });
  }

  /** Whatever cooks at `slot` is done: the burner goes out with a ding and a puff of steam. */
  done(slot: number, delay: number): void {
    const b = this.burners[slot];
    this.burners[slot] = null;
    this.tweens.after(delay, () => {
      const at = this.slotPos(slot);
      if (b) this.dropBurner(b);
      this.fx.steam(at.x, at.y + 0.6, at.z, 4);
      this.fx.sparkle(at.x, at.y + 0.5, at.z, '#ffd23f', 10, 0.7);
      audio.play('bell');
    });
  }

  /** Taco kitchens: show which tortilla receives the next filling. */
  setReceiving(slot: number | null): void {
    this.ringSlot = slot;
    this.ring.visible = slot !== null;
    this.ringT = 0;
  }

  /** Remove the temporary landing spot beyond the last slot (never holds anything after a move). */
  trim(slots: number): void {
    this.objs.length = Math.max(slots, Math.min(this.objs.length, slots));
    this.ids.length = this.objs.length;
  }

  update(dt: number): void {
    this.ringT += this.ringSlot === null ? dt : 0;
    if (this.ringSlot !== null) {
      this.ringT += dt;
      const p = this.slotPos(this.ringSlot);
      this.ring.position.set(p.x, p.y + 0.02, p.z);
      const pulse = 1 + Math.sin(this.ringT * 5) * 0.05;
      this.ring.scale.set(pulse, 1, pulse);
    }
    for (const b of this.burners) {
      if (!b) continue;
      b.flame.scale.setScalar(1 + Math.sin(this.ringT * 9 + b.group.position.x) * 0.04);
      if (b.t > 0) {
        b.t = Math.max(0, b.t - dt);
        b.tag.scale.setScalar(1 + b.t * 0.8);
      }
    }
    this.steamT += dt;
    if (this.steamT > 0.5) {
      this.steamT = 0;
      this.burners.forEach((b, i) => {
        if (b && Math.random() < 0.7) {
          const p = this.slotPos(i);
          this.fx.steam(p.x, p.y + 0.6, p.z, 1);
        }
      });
      this.ids.forEach((id, i) => {
        if (id && STEAMING.has(id) && Math.random() < 0.55) {
          const p = this.slotPos(i);
          this.fx.steam(p.x, p.y + 0.55, p.z, 1);
        }
      });
    }
  }

  dispose(): void {
    for (const b of this.burners) if (b) this.dropBurner(b);
    this.group.clear();
    this.burnerMat.dispose();
    this.flameMat.dispose();
    this.badgeMat.dispose();
    this.napkinMat.dispose();
    this.napkinInnerMat.dispose();
  }
}

/** The countdown over a burner: big white digits with a warm rim (legible at phone size). */
const COOK_INK = { fill: '#ffffff', stroke: '#7c2d12', shadow: 'rgba(60, 20, 0, 0.35)', scale: 1.5 };

interface Burner {
  group: THREE.Group;
  flame: THREE.Mesh;
  tag: THREE.Group;
  label: LabelTexture;
  left: number;
  /** pop animation of the countdown after a tick */
  t: number;
}
