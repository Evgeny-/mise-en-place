import * as THREE from 'three';
import type { DishId } from '../core/content';
import type { PlaySim as Sim } from '../core/sim';
import { GUEST_SCALE, type Layout } from './layout';
import { burgerLayer, dishModel, Guest, GUEST_KINDS, type GuestKind } from './models';
import { ARRIVE_DURATION } from './guests';
import type { FoodId } from '../core/content';
import { arc, ease, type Tweens } from './anim';
import type { FxView } from './FxView';
import { audio } from '../audio/audio';

/** A finished dish waiting at the pass for its guest. */
interface Delivery {
  dish: DishId;
  obj: THREE.Object3D;
  /** view time when the dish is assembled */
  ready: number;
  /** already in the guest's hands (burgers): eat it where it is */
  held?: boolean;
  /** part of the same meal as the delivery before it (a set menu): eaten together, side by side */
  together?: boolean;
}

interface Layer {
  obj: THREE.Object3D;
  thickness: number;
  /** view time the layer settles on the plate (layers rebuilt by sync are already there) */
  landAt: number;
}

interface Seat {
  guest: Guest | null;
  /** burger kitchens: layers on the plate, bottom first */
  stack: Layer[];
  /** queued changes for this seat, played in order */
  queue: (Delivery | { next: GuestKind | null })[];
  /** view time until which the seat is busy (eating, swapping guests) */
  busyUntil: number;
}

/** Guests change quickly: the goodbye wave and the hop onto the stool play faster than their clips. */
const LEAVE_PACE = 1.8;
const ARRIVE_PACE = 1.3;

/** Dishes are modelled 1.6 wide; on the placemat they sit a bit smaller. */
const DISH_SCALE = 0.66;

/** Guest kind for an order: stable for a level, varied along the queue. */
export function guestFor(levelSeed: number, order: number): GuestKind {
  let h = (levelSeed * 2654435761 + order * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  return GUEST_KINDS[h % GUEST_KINDS.length];
}

/** Guests at the bar, the dishes served to them and their reactions. */
export class GuestsView {
  readonly group = new THREE.Group();
  private seats: Seat[] = [];
  /** guests on their way out: they keep animating (wave, hop away) until they are gone */
  private leaving: Guest[] = [];
  private time = 0;
  private seed = 1;

  constructor(
    private layout: Layout,
    private tweens: Tweens,
    private fx: FxView,
  ) {}

  /** Origin of a seated guest. */
  seatPos(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const l = this.layout;
    // the ledge's slab sits 0.06 above barTop: paws rest on it, not in it
    return out.set(l.seatX[i], l.barTop + 0.07 - 0.55 * GUEST_SCALE, l.seatZ);
  }

  /** Where a served dish stands, on the placemat. */
  platePos(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const l = this.layout;
    return out.set(l.seatX[i], l.barTop + 0.075, l.plateZ);
  }

  /** Top of a guest's head (for the ticket above it). */
  headPos(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.seatPos(i, out).add(new THREE.Vector3(0, 1.62 * GUEST_SCALE, 0));
  }

  sync(sim: Sim, intro = false): void {
    for (const s of this.seats) s.guest?.dispose();
    for (const g of this.leaving) g.dispose();
    this.leaving = [];
    // everything this view shows is rebuilt from the simulation: guests, burgers on the plates,
    // dishes waiting at the pass or being eaten (undo must not leave any of them behind)
    this.group.clear();
    this.seed = sim.level.seed ?? sim.level.n;
    this.seats = sim.seats.map((dish, i) => {
      const seat: Seat = { guest: null, stack: [], queue: [], busyUntil: 0 };
      if (dish) {
        // the order index of a seated guest: seats fill from the queue in order
        seat.guest = this.makeGuest(guestFor(this.seed, this.orderIndexAt(sim, i)), i);
        if (intro) {
          // guests take their seats one after another as the kitchen opens
          const g = seat.guest;
          g.group.visible = false;
          this.tweens.after(0.35 + i * 0.25, () => {
            g.group.visible = true;
            g.arrive();
          });
        }
      }
      // burger kitchens: rebuild the layers already on the plate
      const ticket = sim.ticket?.(i);
      const done = sim.stacked?.(i) ?? 0;
      if (ticket) {
        let y = 0;
        for (let k = 0; k < done; k++) {
          const { object, thickness } = burgerLayer(ticket[k]);
          object.position.copy(this.platePos(i)).add(new THREE.Vector3(0, y, 0));
          this.group.add(object);
          seat.stack.push({ obj: object, thickness, landAt: 0 });
          y += thickness;
        }
      }
      return seat;
    });
  }

  /** Height of the burger being built on a plate. */
  private stackTop(seat: number, layers: number): number {
    let y = 0;
    const st = this.seats[seat].stack;
    for (let k = 0; k < Math.min(layers, st.length); k++) y += st[k].thickness;
    return y;
  }

  /**
   * Burger kitchens: `obj` (the item as it looked in the pantry or on the counter, world space)
   * flies onto the plate at `seat` and becomes layer `layer` of the burger.
   */
  stackLayer(seat: number, layer: number, item: FoodId, obj: THREE.Object3D, from: THREE.Vector3, delay: number): void {
    const s = this.seats[seat];
    this.group.attach(obj);
    obj.position.copy(from);
    const { object, thickness } = burgerLayer(item);
    const base = this.stackTop(seat, layer);
    s.stack.length = layer;
    s.stack.push({ obj: object, thickness, landAt: this.time + delay + 0.36 });
    const target = this.platePos(seat).add(new THREE.Vector3(0, base, 0));
    const a = from.clone();
    const p = new THREE.Vector3();
    this.tweens.add(0.36, (k) => {
      arc(a, target, 1.2, k, p);
      obj.position.copy(p);
      obj.rotation.y = k * Math.PI * 2;
    }, {
      delay,
      ease: ease.inOutSine,
      tag: obj,
      start: () => a.copy(obj.position),
      done: () => {
        this.group.remove(obj);
        // already picked up with the finished dish (serveStack waits for this, so only a safeguard)
        if (object.parent) return;
        object.position.copy(target);
        this.group.add(object);
        audio.play('plop', { pitch: layer });
        this.fx.puff(target.x, target.y + thickness, target.z, '#fff6e0', 3, 0.18);
        this.tweens.add(0.36, (k) => {
          const sq = Math.sin(k * Math.PI * 2) * Math.exp(-k * 3) * 0.35;
          object.scale.set(1 + sq, 1 - sq, 1 + sq);
        }, { ease: ease.linear, tag: object });
      },
    });
  }

  /** Burger kitchens: the finished stack (a burger, a hot dog, a sundae...) is picked up by its guest and eaten. */
  /**
   * A finished stack leaves the plate for the counter (set menus, VIPs): returns it as one group in
   * world space once its last layer has landed (the counter view moves it), or null if none.
   */
  takeStack(seat: number, at: number): THREE.Object3D | null {
    const s = this.seats[seat];
    if (!s?.stack.length) return null;
    const layers = s.stack.splice(0);
    const holder = new THREE.Group();
    holder.position.copy(this.platePos(seat));
    this.group.add(holder);
    const when = Math.max(at, ...layers.map((l) => l.landAt + 0.05));
    this.tweens.after(Math.max(0, when - this.time), () => {
      for (const l of layers) holder.attach(l.obj);
    });
    return holder;
  }

  serveStack(seat: number, at: number, dish: DishId = 'burger'): void {
    const s = this.seats[seat];
    const layers = s.stack.splice(0);
    const holder = new THREE.Group();
    const plate = this.platePos(seat);
    holder.position.copy(plate);
    this.group.add(holder);
    // the last layer may still be in the air (it slides over from the counter): wait for it
    at = Math.max(at, ...layers.map((l) => l.landAt + 0.05));
    const delay = Math.max(0, at - this.time);
    this.tweens.after(delay, () => {
      for (const l of layers) holder.attach(l.obj);
      audio.play('bell');
      this.fx.sparkle(plate.x, plate.y + 0.5, plate.z, '#ffe27a', 22, 1.2);
      // lift it off the plate so the next burger can be started right away
      const from = holder.position.clone();
      const to = from.clone().add(new THREE.Vector3(0, 0.55, -0.32));
      this.tweens.add(0.35, (k) => holder.position.lerpVectors(from, to, k), { ease: ease.outBack });
    });
    this.push(seat, { dish, obj: holder, ready: at + 0.35, held: true });
  }

  private orderIndexAt(sim: Sim, seat: number): number {
    // Good enough for a stable look: the seat number plus the dishes served so far.
    return seat + sim.served * 3;
  }

  private makeGuest(kind: GuestKind, i: number): Guest {
    const g = new Guest(kind, this.seed + i * 7);
    this.seatPos(i, g.group.position);
    g.group.scale.setScalar(GUEST_SCALE);
    this.group.add(g.group);
    return g;
  }

  setLayout(l: Layout): void {
    this.layout = l;
    this.seats.forEach((s, i) => {
      if (s.guest) this.seatPos(i, s.guest.group.position);
    });
  }

  /**
   * Parts leave the counter at `at` (view time) and come together into `dish` above the
   * guest's plate; the guest eats when free.
   */
  serve(seat: number, dish: DishId, parts: THREE.Object3D[], at: number, fly = 0.42): void {
    // a stacked dish was built on the plate itself: nothing comes from the counter
    if (!parts.length && this.seats[seat]?.stack.length) return this.serveStack(seat, at, dish);
    const plate = this.platePos(seat);
    const pass = plate.clone().add(new THREE.Vector3(0, 0.55, 0.15));
    const delay = Math.max(0, at - this.time);
    parts.forEach((o, i) => {
      this.group.attach(o);
      const start = new THREE.Vector3();
      const p = new THREE.Vector3();
      this.tweens.add(fly, (k) => {
        arc(start, pass, 1.4, k, p);
        o.position.copy(p);
        o.scale.setScalar(Math.max(0.001, 1 - k * 0.7));
      }, {
        delay: delay + i * 0.06,
        ease: ease.inOutSine,
        start: () => {
          this.tweens.cancel(o);
          start.copy(o.position);
        },
        done: () => this.group.remove(o),
        tag: o,
      });
    });
    const ready = at + fly + (parts.length - 1) * 0.06;
    const obj = dishModel(dish);
    obj.position.copy(pass);
    obj.scale.setScalar(0.001);
    this.group.add(obj);
    this.tweens.after(ready - this.time, () => {
      audio.play('bell');
      this.fx.sparkle(pass.x, pass.y, pass.z, '#ffe27a', 22, 1.2);
      this.tweens.add(0.4, (k) => obj.scale.setScalar(Math.max(0.001, k * DISH_SCALE * 0.92)), { ease: ease.outBack });
    });
    this.push(seat, { dish, obj, ready });
  }

  /** Queues a delivery; one right after another for the same seat is the same meal (a set menu). */
  private push(seat: number, d: Delivery): void {
    const q = this.seats[seat].queue;
    const last = q[q.length - 1];
    if (last && 'obj' in last && Math.abs(last.ready - d.ready) < 0.9) d.together = true;
    q.push(d);
  }

  /** After the current guest is done, `next` (or nobody) takes the seat. */
  seatChanged(seat: number, order: number): void {
    this.seats[seat].queue.push({ next: order >= 0 ? guestFor(this.seed, order) : null });
  }

  private runSeat(i: number): void {
    const s = this.seats[i];
    if (this.time < s.busyUntil || !s.queue.length) return;
    const head = s.queue[0];
    if ('obj' in head) {
      // a set menu: both dishes of the meal arrive before the guest starts
      let n = 1;
      while (n < s.queue.length && 'obj' in s.queue[n] && (s.queue[n] as Delivery).together) n++;
      const meal = s.queue.slice(0, n) as Delivery[];
      if (meal.some((d) => this.time < d.ready + 0.25) || !s.guest) return;
      s.queue.splice(0, n);
      meal.forEach((d, k) => this.eat(i, s, d, meal.length > 1 ? (k - (meal.length - 1) / 2) * 0.55 : 0));
    } else {
      s.queue.shift();
      this.swap(i, s, head.next);
    }
  }

  private eat(i: number, s: Seat, d: Delivery, side = 0): void {
    const guest = s.guest!;
    const plate = d.held ? d.obj.position.clone() : this.platePos(i).add(new THREE.Vector3(side, 0, 0));
    const obj = d.obj;
    const from = obj.position.clone();
    if (!d.held) {
      this.tweens.add(0.3, (k) => {
        obj.position.lerpVectors(from, plate, k);
        obj.scale.setScalar(DISH_SCALE * (0.92 + 0.08 * k));
      }, { ease: ease.outBack });
    }
    const dur = guest.eat();
    const t0 = 0.3;
    for (let b = 0; b < 4; b++) {
      this.tweens.after(t0 + (b * dur) / 4, () => {
        audio.play('nom', { voice: guest.kind });
        this.fx.puff(plate.x, plate.y + 0.3, plate.z, '#fff3d6', 3, 0.18);
      });
    }
    this.tweens.add(dur, (k) => obj.scale.setScalar(Math.max(0.001, (d.held ? 1 : DISH_SCALE) * (1 - k * 0.92))), {
      delay: t0,
      ease: ease.inQuad,
      done: () => {
        this.group.remove(obj);
        guest.delight();
        audio.play('yum', { voice: guest.kind });
        const h = this.headPos(i);
        this.fx.hearts(h.x, h.y - 0.2, h.z + 0.3, 5);
      },
    });
    // the next guest's turn comes right after the last bite: the happy bounce plays on as they go
    s.busyUntil = this.time + t0 + dur + 0.2;
  }

  private swap(i: number, s: Seat, next: GuestKind | null): void {
    // nobody else is coming: the last guest stays for the finale
    if (!next && s.guest) return;
    let t = 0;
    const old = s.guest;
    if (old) {
      t = old.leave(LEAVE_PACE);
      this.leaving.push(old);
      this.tweens.after(t, () => {
        this.leaving = this.leaving.filter((g) => g !== old);
        this.group.remove(old.group);
        old.dispose();
      });
    }
    s.guest = null;
    // the next guest pops up as the last one, shrinking, hops out of sight
    const enter = Math.max(0, t - 0.2);
    if (next) {
      this.tweens.after(enter, () => {
        const g = this.makeGuest(next, i);
        s.guest = g;
        g.arrive(ARRIVE_PACE);
      });
    }
    s.busyUntil = this.time + (next ? enter + (ARRIVE_DURATION / ARRIVE_PACE) * 0.7 : t);
  }

  /** The kitchen is done: every seated guest cheers, one after another. */
  cheer(): number {
    let d = 0;
    this.seats.forEach((s, i) => {
      if (!s.guest) return;
      const g = s.guest;
      this.tweens.after(0.15 * i, () => {
        g.delight();
        const h = this.headPos(i);
        this.fx.hearts(h.x, h.y - 0.1, h.z + 0.3, 6);
      });
      d = 0.15 * i + 0.8;
    });
    return d;
  }

  /** Point the guests' eyes at something (an item flying past) or back at the chef. */
  lookAt(p: THREE.Vector3 | null): void {
    for (const s of this.seats) s.guest?.lookAt(p);
  }

  setExpectant(seat: number, on: boolean): void {
    this.seats[seat]?.guest?.setExpectant(on);
  }

  get busy(): boolean {
    return this.seats.some((s) => s.queue.length > 0 || this.time < s.busyUntil);
  }

  update(dt: number, time: number): void {
    this.time = time;
    this.seats.forEach((s, i) => {
      this.runSeat(i);
      s.guest?.update(dt, time);
    });
    for (const g of this.leaving) g.update(dt, time);
  }

  dispose(): void {
    for (const s of this.seats) s.guest?.dispose();
    for (const g of this.leaving) g.dispose();
    this.leaving = [];
    this.group.clear();
  }
}
