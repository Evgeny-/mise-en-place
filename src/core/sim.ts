import type { DishId, FoodId } from './content';
import { KitchenRules, kitchenFor, type Kitchen, type KState, type Rules } from './kitchen';
import { BurgerSim } from './burger';
import { TacoSim, type TacoRefusal, type TacoSlot } from './taco';
import { ClocheMarks, takesOf, thawTable } from './pantry';
import type { LevelDef } from './types';

/** Everything the view needs to animate one move, in order. */
export type SimEvent =
  /** the top of `col` goes to counter slot `slot` (slot === slots means it combines on landing) */
  | { t: 'take'; col: number; item: FoodId; slot: number }
  /** the items at slots `a` and `b` combine into `item`, which stays at `slot` */
  | { t: 'prep'; a: number; b: number; slot: number; item: FoodId }
  /** the items at `from` go to the guest at `seat`, who gets `dish` */
  | { t: 'serve'; seat: number; dish: DishId; from: number[] }
  /** a new guest sits down at `seat` wanting `dish` (order index `order`; null: the seat stays empty) */
  | { t: 'seat'; seat: number; dish: DishId | null; order: number; ticket?: FoodId[] }
  /** burger kitchens: the top of `col` goes straight onto the plate at `seat` as layer `layer` */
  | { t: 'stack'; col: number; item: FoodId; seat: number; layer: number }
  /** burger kitchens: a parked item slides from counter `slot` onto the plate at `seat` */
  | { t: 'slide'; slot: number; seat: number; layer: number; item: FoodId }
  /**
   * taco kitchens: a filling drops into the open container at counter `slot`, which now holds `n`;
   * straight from the pantry (`col`), or from counter slot `from` (a loose filling being scooped by
   * a container that just landed, or a prep product formed at `from`)
   */
  | { t: 'fill'; col: number | null; from: number | null; item: FoodId; slot: number; n: number }
  /** taco kitchens: the full container at `slot` folds into `dish`; `seat`: the guest it goes to now (a serve follows), null = it waits on the counter */
  | { t: 'fold'; slot: number; dish: DishId; seat: number | null }
  /** taco kitchens: a container that landed on the extra spot of a full counter moves to the freed slot `to` */
  | { t: 'move'; from: number; to: number }
  /** taco kitchens: the container at `slot` is now the receiving one (null: no container open) */
  | { t: 'receive'; slot: number | null }
  /** a lidded column opens */
  | { t: 'lid'; col: number }
  /** the cloche on the new front tile of `col` lifts: it is `item` */
  | { t: 'reveal'; col: number; item: FoodId }
  /** the stove: the parts at `from` go into the oven at `slot` as `dish` for the guest at `seat`, baking `left` takes */
  | { t: 'bake'; seat: number; dish: DishId; from: number[]; slot: number; left: number }
  /** the stove: the patty at `slot` goes on the grill for `left` takes (burger kitchens) */
  | { t: 'grill'; slot: number; left: number }
  /** the stove: the dish or patty at `slot` has `left` takes to go */
  | { t: 'tick'; slot: number; left: number }
  /** the stove: the dish or patty at `slot` is done (an oven dish is served next: a serve from [slot] follows) */
  | { t: 'done'; slot: number }
  /** a finished dish waits on the counter at `slot` for the guest at `seat` (its parts come from `from`) */
  | { t: 'ready'; seat: number; dish: DishId; from: number[]; slot: number }
  /** burger kitchens: the finished stack on the plate at `seat` moves to counter `slot` to wait for its guest */
  | { t: 'shelve'; seat: number; slot: number; dish: DishId }
  /** burger kitchens: the plate at `seat` starts the guest's next ticket (a set menu's second dish) */
  | { t: 'ticket'; seat: number; order: number; ticket: FoodId[] }
  | { t: 'win' }
  | { t: 'stuck' };

export type Status = 'playing' | 'won' | 'stuck';

/** What the game controller, the view and the HUD need from a kitchen's play simulation. */
export interface PlaySim {
  readonly level: LevelDef;
  ptr: number[];
  counter: (FoodId | null)[];
  readonly seats: (DishId | null)[];
  next: number;
  served: number;
  status: Status;
  history: number[];
  readonly slots: number;
  readonly columns: FoodId[][];
  top(col: number): FoodId | null;
  remaining(col: number): number;
  lidOpen(col: number): boolean;
  queue(): DishId[];
  canTake(col: number): boolean;
  legalMoves(): number[];
  take(col: number): SimEvent[] | null;
  addSlot(): void;
  snapshot(): unknown;
  restore(s: never): void;
  /** is the tile at (col, row) still under a cloche? (row = index in the column, top first) */
  covered(col: number, row: number): boolean;
  /** takes still to go before the tile at (col, row) thaws (0 = not frozen or thawed) */
  thawLeft(col: number, row: number): number;
  /** the solver's view of the current position */
  currentRules(): Rules<unknown> & { successors?(s: unknown): [number, unknown][] };
  state(): unknown;
  /** burger kitchens: each seat's layers and how many are already on the plate */
  ticket?(seat: number): FoodId[] | null;
  stacked?(seat: number): number;
  queuedTickets?(): FoodId[][];
  /** taco kitchens: what counter slot i holds (loose filling, prep half, open container, waiting taco) */
  slotInfo?(i: number): TacoSlot | null;
  /** taco kitchens: the slot of the receiving (newest open) container, or null */
  receivingSlot?(): number | null;
  /** taco kitchens: why a column is dimmed */
  whyNot?(col: number): TacoRefusal | 'topping' | null;
  /** taco kitchens: the events a take would produce, without taking (touch-down preview) */
  preview?(col: number): SimEvent[] | null;
  /** taco kitchens: the filling that must go into `dish` last (twist "topping last") */
  topping?(dish: DishId): FoodId | null;
  /** the stove: takes left for whatever cooks at counter slot i (null: nothing cooks there) */
  cooking?(i: number): { left: number; dish: DishId | null } | null;
  /** the stove: the seat whose dish is in the oven, with the takes left (null: not baking) */
  baking?(seat: number): number | null;
  /** set menus and VIPs: the guest at a seat (their dishes, which are finished and waiting, VIP?) */
  guestAt?(seat: number): GuestInfo | null;
  /** set menus and VIPs: the guests still in the queue, in order */
  queuedGuests?(): { dishes: DishId[]; vip: boolean }[];
  /** a finished dish waiting on counter slot i for its guest (null: none) */
  heldAt?(i: number): DishId | null;
}

/** A seated guest in kitchens with set menus or VIPs. */
export interface GuestInfo {
  dishes: DishId[];
  /** per dish: finished and waiting on the counter */
  ready: boolean[];
  vip: boolean;
}

/** The play simulation for a level's rules. */
export function createSim(level: LevelDef): PlaySim {
  if (level.rules === 'taco') return new TacoSim(level) as unknown as PlaySim;
  return level.rules === 'burger' ? (new BurgerSim(level) as unknown as PlaySim) : (new Sim(level) as unknown as PlaySim);
}

/** A dish in the oven (left > 0: the takes it still bakes) or finished and waiting for its guest (left = 0). */
export interface OvenEntry {
  seat: number;
  dish: DishId;
  left: number;
  /** finished this very take: the counter slots its parts came from (dropped at the end of the take) */
  from?: number[];
}

export interface SimSnapshot {
  ptr: number[];
  counter: (FoodId | null)[];
  oven: (OvenEntry | null)[];
  seats: (DishId | null)[];
  guest: number[];
  readyBits: number[];
  next: number;
  served: number;
  slots: number;
  status: Status;
  history: number[];
}

/**
 * The play simulation: same rules as KitchenRules, but it remembers which counter slot holds
 * which item and reports events for the animations.
 */
export class Sim {
  readonly level: LevelDef;
  readonly kitchen: Kitchen;
  ptr: number[];
  /** counter slots, left to right */
  counter: (FoodId | null)[];
  /** the stove: a dish baking at each counter slot (the slot is taken meanwhile) */
  oven: (OvenEntry | null)[];
  seats: (DishId | null)[];
  /** guest mode (set menus, VIPs): per seat, the order index of the guest's first dish (-1 = empty), and their finished dishes */
  guest: number[] = [];
  readyBits: number[] = [];
  next: number;
  served: number;
  status: Status = 'playing';
  private extraSlots = 0;
  /** columns taken so far */
  history: number[] = [];
  private rules: KitchenRules;
  /** what the player knows: lifted cloches stay lifted (not part of snapshots) */
  readonly cloches: ClocheMarks;
  private readonly thaw: number[][] | null;

  constructor(level: LevelDef) {
    this.level = level;
    this.kitchen = kitchenFor(level.menu);
    this.rules = new KitchenRules(level);
    this.ptr = level.columns.map(() => 0);
    this.counter = new Array<FoodId | null>(level.slots).fill(null);
    this.oven = new Array<OvenEntry | null>(level.slots).fill(null);
    this.seats = [];
    for (let i = 0; i < level.seats; i++) this.seats.push(level.orders[i] ?? null);
    this.next = Math.min(level.seats, level.orders.length);
    this.served = 0;
    this.cloches = new ClocheMarks(level);
    this.thaw = thawTable(level);
    if (this.rules.setStart) {
      const st = this.rules.start();
      this.guest = st.g!.slice();
      this.readyBits = st.ready!.slice();
      this.seats = st.seats.map((d) => (d >= 0 ? this.kitchen.dishes[d] : null));
      this.next = st.next;
    }
  }

  guestAt(seat: number): GuestInfo | null {
    if (!this.rules.setStart) {
      const d = this.seats[seat];
      return d ? { dishes: [d], ready: [false], vip: false } : null;
    }
    const g = this.guest[seat];
    if (g < 0) return null;
    const dishes = this.rules.dishesOf(g).map((d) => this.kitchen.dishes[d]);
    return { dishes, ready: dishes.map((_, j) => !!(this.readyBits[seat] & (1 << j))), vip: this.rules.vipAt![g] };
  }

  queuedGuests(): { dishes: DishId[]; vip: boolean }[] {
    const out: { dishes: DishId[]; vip: boolean }[] = [];
    for (let i = this.next; i < this.level.orders.length; ) {
      const set = !!this.rules.setStart?.[i];
      out.push({ dishes: this.level.orders.slice(i, set ? i + 2 : i + 1), vip: !!this.rules.vipAt?.[i] });
      i += set ? 2 : 1;
    }
    return out;
  }

  heldAt(i: number): DishId | null {
    const o = this.oven[i];
    return o && o.left === 0 ? o.dish : null;
  }

  covered(col: number, row: number): boolean {
    return this.cloches.covered(col, row);
  }

  thawLeft(col: number, row: number): number {
    const at = this.thaw?.[col]?.[row] ?? 0;
    return at > 0 ? Math.max(0, at - takesOf(this.ptr)) : 0;
  }

  /** counter slots (a booster can add one) */
  get slots(): number {
    return this.level.slots + this.extraSlots;
  }

  get columns(): FoodId[][] {
    return this.level.columns;
  }

  top(col: number): FoodId | null {
    return this.level.columns[col][this.ptr[col]] ?? null;
  }

  remaining(col: number): number {
    return this.level.columns[col].length - this.ptr[col];
  }

  lidOpen(col: number): boolean {
    return (this.level.lids?.[col] ?? 0) <= this.served;
  }

  /** Dishes still to serve after the seated ones. */
  queue(): DishId[] {
    return this.level.orders.slice(this.next);
  }

  /** Compact state for the solver (current slot count included). */
  state(): KState {
    const k = this.kitchen;
    const counts = new Array<number>(k.items.length).fill(0);
    for (const it of this.counter) if (it) counts[k.item(it)]++;
    const st: KState = {
      ptr: this.ptr.slice(),
      counts,
      seats: this.seats.map((d) => (d ? k.dish(d) : -1)),
      next: this.next,
      served: this.served,
    };
    if (this.rules.bake) {
      st.cook = this.seats.map(() => 0);
      for (const o of this.oven) if (o) st.cook[o.seat] = o.left;
    }
    if (this.rules.setStart) {
      st.g = this.guest.slice();
      st.ready = this.readyBits.slice();
    }
    return st;
  }

  cooking(i: number): { left: number; dish: DishId | null } | null {
    const o = this.oven[i];
    return o && o.left > 0 ? { left: o.left, dish: o.dish } : null;
  }

  baking(seat: number): number | null {
    return this.oven.find((o) => o?.seat === seat && o.left > 0)?.left ?? null;
  }

  /** Rules for the current position (an extra slot from a booster counts). */
  currentRules(): KitchenRules {
    if (this.rules.slots !== this.slots) this.rules = new KitchenRules(this.level, this.slots);
    return this.rules;
  }

  canTake(col: number): boolean {
    if (this.status !== 'playing') return false;
    return this.currentRules().moves(this.state()).includes(col);
  }

  legalMoves(): number[] {
    if (this.status !== 'playing') return [];
    return this.currentRules().moves(this.state());
  }

  /** Take the top of a column. Returns the events, or null if the move is not legal. */
  take(col: number): SimEvent[] | null {
    if (!this.canTake(col)) return null;
    const item = this.top(col)!;
    const events: SimEvent[] = [];
    this.ptr[col]++;
    this.history.push(col);
    const lidsBefore = this.openLids();
    // Land in the leftmost free slot, or on a temporary landing spot past the last slot.
    const baking = this.oven.map((o) => !!o && o.left > 0);
    let landing = this.counter.findIndex((x, i) => x === null && !this.oven[i]);
    if (landing < 0) {
      landing = this.counter.length;
      this.counter.push(item);
      this.oven.push(null);
    } else this.counter[landing] = item;
    events.push({ t: 'take', col, item, slot: landing });
    for (const c of this.cloches.reveal(this.ptr)) events.push({ t: 'reveal', col: c, item: this.top(c)! });
    if (this.rules.setStart) this.resolveGuests(events, landing);
    else this.resolveCounter(events, landing);
    // the oven: dishes that were already baking bake one take more (seats in order); done ones are
    // served; with the pantry empty, everything left finishes
    const order = this.oven.map((o, i) => [o, i] as const).filter(([o, i]) => o && baking[i]).sort((a, b) => a[0]!.seat - b[0]!.seat);
    for (const [o, i] of order) {
      if (this.oven[i] !== o) continue;
      o!.left--;
      events.push({ t: 'tick', slot: i, left: o!.left });
      if (o!.left === 0) this.finishBake(i, events);
    }
    const empty = this.ptr.every((p, c) => p >= this.level.columns[c].length);
    while (empty && this.oven.some((o) => o && o.left > 0)) {
      let i = -1;
      this.oven.forEach((o, j) => {
        if (o && o.left > 0 && (i < 0 || o.seat < this.oven[i]!.seat)) i = j;
      });
      this.oven[i]!.left = 0;
      this.finishBake(i, events);
    }
    // canTake() guarantees that an item on the temporary landing spot combined: drop the spot.
    // a dish that came out of the oven freed a slot: an item left on the landing spot moves there
    if (this.counter.length > this.slots && this.counter[this.slots] !== null) {
      const to = this.counter.findIndex((x, i) => i < this.slots && x === null && !this.oven[i]);
      if (to >= 0) {
        this.counter[to] = this.counter[this.slots];
        this.counter[this.slots] = null;
        events.push({ t: 'move', from: this.slots, to });
      }
    }
    while (this.counter.length > this.slots && this.counter[this.counter.length - 1] === null && !this.oven[this.counter.length - 1]) {
      this.counter.pop();
      this.oven.pop();
    }
    if (this.counter.length > this.slots) throw new Error('landing item did not combine');
    for (const c of this.openLids()) if (!lidsBefore.includes(c)) events.push({ t: 'lid', col: c });
    if (this.served === this.level.orders.length) {
      this.status = 'won';
      events.push({ t: 'win' });
    } else if (this.legalMoves().length === 0) {
      this.status = 'stuck';
      events.push({ t: 'stuck' });
    }
    return events;
  }

  /**
   * Preps fire, then the leftmost seated guest (not waiting for the oven) whose parts are all on the
   * counter gets them: served, or the dish goes into the oven at the slot of its first part.
   */
  private resolveCounter(events: SimEvent[], landing: number): void {
    const k = this.kitchen;
    for (;;) {
      const counts = new Array<number>(k.items.length).fill(0);
      for (const it of this.counter) if (it) counts[k.item(it)]++;
      const pk = k.firePrep(counts);
      if (pk >= 0) {
        const p = k.preps[pk];
        const a = this.findSlot(k.items[p.a], -1, landing);
        const b = this.findSlot(k.items[p.b], a, landing);
        // The product stays where the older item was: the new arrival joins it.
        const keep = a === landing ? b : b === landing ? a : Math.min(a, b);
        const drop = keep === a ? b : a;
        const out = k.items[p.out];
        this.counter[keep] = out;
        this.counter[drop] = null;
        events.push({ t: 'prep', a: drop, b: keep, slot: keep, item: out });
        if (drop === landing) landing = keep;
        continue;
      }
      let acted = false;
      for (let s = 0; s < this.seats.length; s++) {
        const dish = this.seats[s];
        if (!dish || this.baking(s) !== null || !k.fits(counts, k.dish(dish))) continue;
        const from: number[] = [];
        for (const part of k.parts[k.dish(dish)]) {
          const at = this.findSlotNotIn(k.items[part], from);
          from.push(at);
        }
        for (const at of from) this.counter[at] = null;
        const bake = this.rules.bake?.[k.dish(dish)] ?? 0;
        if (bake > 0) {
          const slot = Math.min(...from);
          this.oven[slot] = { seat: s, dish, left: bake };
          events.push({ t: 'bake', seat: s, dish, from, slot, left: bake });
        } else {
          events.push({ t: 'serve', seat: s, dish, from });
          this.seatNext(s, events);
        }
        acted = true;
        break;
      }
      if (!acted) return;
    }
  }

  /**
   * Guest mode (set menus, VIPs), as KitchenRules.resolveGuests: preps fire; one dish is finished (a
   * VIP's first, else the leftmost guest's) and waits on the counter at the slot of its first part;
   * every guest whose dishes are all finished is served (only VIPs while one is seated). A dish
   * finished and served in the same step flies straight from its parts to the guest.
   */
  private resolveGuests(events: SimEvent[], landing: number): void {
    const k = this.kitchen;
    const vip = this.rules.vipAt!;
    for (;;) {
      const counts = new Array<number>(k.items.length).fill(0);
      for (const it of this.counter) if (it) counts[k.item(it)]++;
      const pk = k.firePrep(counts);
      if (pk >= 0) {
        const p = k.preps[pk];
        const a = this.findSlot(k.items[p.a], -1, landing);
        const b = this.findSlot(k.items[p.b], a, landing);
        const keep = a === landing ? b : b === landing ? a : Math.min(a, b);
        const drop = keep === a ? b : a;
        const out = k.items[p.out];
        this.counter[keep] = out;
        this.counter[drop] = null;
        events.push({ t: 'prep', a: drop, b: keep, slot: keep, item: out });
        if (drop === landing) landing = keep;
        continue;
      }
      let acted = false;
      for (const pass of [true, false]) {
        for (let i = 0; i < this.seats.length && !acted; i++) {
          const g = this.guest[i];
          if (g < 0 || vip[g] !== pass) continue;
          const ds = this.rules.dishesOf(g);
          for (let j = 0; j < ds.length; j++) {
            if (this.readyBits[i] & (1 << j) || !k.fits(counts, ds[j])) continue;
            const from: number[] = [];
            for (const part of k.parts[ds[j]]) from.push(this.findSlotNotIn(k.items[part], from));
            for (const at of from) this.counter[at] = null;
            this.oven[Math.min(...from)] = { seat: i, dish: k.dishes[ds[j]], left: 0, from };
            this.readyBits[i] |= 1 << j;
            acted = true;
            break;
          }
        }
        if (acted) break;
      }
      const delivered = this.deliverGuests(events);
      // dishes finished now that wait for their guest: their parts become the dish on the counter
      this.oven.forEach((o, slot) => {
        if (!o?.from) return;
        events.push({ t: 'ready', seat: o.seat, dish: o.dish, from: o.from, slot });
        delete o.from;
      });
      if (!acted && !delivered) return;
    }
  }

  /** Guest mode: serves every guest whose dishes are all finished (only VIPs while one is seated). */
  private deliverGuests(events: SimEvent[]): boolean {
    const vip = this.rules.vipAt!;
    let any = false;
    for (let again = true; again; ) {
      again = false;
      const vipSeated = this.guest.some((g) => g >= 0 && vip[g]);
      for (let i = 0; i < this.seats.length; i++) {
        const g = this.guest[i];
        if (g < 0) continue;
        const n = this.rules.dishesOf(g).length;
        if (this.readyBits[i] !== (1 << n) - 1 || (vipSeated && !vip[g])) continue;
        // the guest's dishes go out together: the one(s) waiting on the counter, the fresh one from its parts
        this.oven.forEach((o, slot) => {
          if (!o || o.seat !== i || o.left !== 0) return;
          events.push({ t: 'serve', seat: i, dish: o.dish, from: o.from ?? [slot] });
          this.oven[slot] = null;
        });
        this.served += n;
        this.readyBits[i] = 0;
        const order = this.next < this.level.orders.length ? this.next : -1;
        if (order >= 0) {
          this.guest[i] = order;
          this.seats[i] = this.level.orders[order];
          this.next += this.rules.setStart![order] ? 2 : 1;
        } else {
          this.guest[i] = -1;
          this.seats[i] = null;
        }
        events.push({ t: 'seat', seat: i, dish: this.seats[i], order });
        any = again = true;
        break;
      }
    }
    return any;
  }

  /** The guest at seat s was served: the next one in the queue sits down. */
  private seatNext(s: number, events: SimEvent[]): void {
    this.served++;
    const order = this.next < this.level.orders.length ? this.next : -1;
    const nd = order >= 0 ? this.level.orders[this.next++] : null;
    this.seats[s] = nd;
    events.push({ t: 'seat', seat: s, dish: nd, order });
  }

  /** The dish in the oven at slot i is done: served to its waiting guest; the counter resolves again. */
  private finishBake(i: number, events: SimEvent[]): void {
    const o = this.oven[i]!;
    this.oven[i] = null;
    events.push({ t: 'done', slot: i });
    events.push({ t: 'serve', seat: o.seat, dish: o.dish, from: [i] });
    this.seatNext(o.seat, events);
    this.resolveCounter(events, -1);
  }

  /** Leftmost slot holding `item` (not `skip`); the landing slot is used only as a last resort. */
  private findSlot(item: FoodId, skip: number, landing: number): number {
    let found = -1;
    for (let i = 0; i < this.counter.length; i++) {
      if (i === skip || this.counter[i] !== item) continue;
      if (i !== landing) return i;
      found = i;
    }
    return found;
  }

  private findSlotNotIn(item: FoodId, used: number[]): number {
    for (let i = 0; i < this.counter.length; i++) if (this.counter[i] === item && !used.includes(i)) return i;
    throw new Error(`no ${item} on the counter`);
  }


  private openLids(): number[] {
    const out: number[] = [];
    const lids = this.level.lids;
    if (!lids) return out;
    lids.forEach((k, c) => {
      if (k > 0 && k <= this.served) out.push(c);
    });
    return out;
  }

  /** Booster: one more counter slot for the rest of the level. */
  addSlot(): void {
    this.extraSlots++;
    this.counter.push(null);
    this.oven.push(null);
    if (this.status === 'stuck') this.status = 'playing';
  }

  snapshot(): SimSnapshot {
    return {
      ptr: this.ptr.slice(),
      counter: this.counter.slice(),
      oven: this.oven.map((o) => (o ? { ...o } : null)),
      guest: this.guest.slice(),
      readyBits: this.readyBits.slice(),
      seats: this.seats.slice(),
      next: this.next,
      served: this.served,
      slots: this.extraSlots,
      status: this.status,
      history: this.history.slice(),
    };
  }

  restore(s: SimSnapshot): void {
    this.ptr = s.ptr.slice();
    this.counter = s.counter.slice();
    this.oven = s.oven.map((o) => (o ? { ...o } : null));
    this.guest = s.guest.slice();
    this.readyBits = s.readyBits.slice();
    this.seats = s.seats.slice();
    this.next = s.next;
    this.served = s.served;
    this.extraSlots = s.slots;
    this.status = s.status;
    this.history = s.history.slice();
  }
}
