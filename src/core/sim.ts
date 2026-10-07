import type { DishId, FoodId } from './content';
import { KitchenRules, kitchenFor, type Kitchen, type KState, type Rules } from './kitchen';
import { BurgerSim } from './burger';
import { TacoSim, type TacoRefusal, type TacoSlot } from './taco';
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
}

/** The play simulation for a level's rules. */
export function createSim(level: LevelDef): PlaySim {
  if (level.rules === 'taco') return new TacoSim(level) as unknown as PlaySim;
  return level.rules === 'burger' ? (new BurgerSim(level) as unknown as PlaySim) : (new Sim(level) as unknown as PlaySim);
}

export interface SimSnapshot {
  ptr: number[];
  counter: (FoodId | null)[];
  seats: (DishId | null)[];
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
  seats: (DishId | null)[];
  next: number;
  served: number;
  status: Status = 'playing';
  private extraSlots = 0;
  /** columns taken so far */
  history: number[] = [];
  private rules: KitchenRules;

  constructor(level: LevelDef) {
    this.level = level;
    this.kitchen = kitchenFor(level.menu);
    this.rules = new KitchenRules(level);
    this.ptr = level.columns.map(() => 0);
    this.counter = new Array<FoodId | null>(level.slots).fill(null);
    this.seats = [];
    for (let i = 0; i < level.seats; i++) this.seats.push(level.orders[i] ?? null);
    this.next = Math.min(level.seats, level.orders.length);
    this.served = 0;
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
    return {
      ptr: this.ptr.slice(),
      counts,
      seats: this.seats.map((d) => (d ? k.dish(d) : -1)),
      next: this.next,
      served: this.served,
    };
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
    const k = this.kitchen;
    const item = this.top(col)!;
    const events: SimEvent[] = [];
    this.ptr[col]++;
    this.history.push(col);
    const lidsBefore = this.openLids();
    // Land in the leftmost free slot, or on a temporary landing spot past the last slot.
    let landing = this.counter.indexOf(null);
    if (landing < 0) {
      landing = this.counter.length;
      this.counter.push(item);
    } else this.counter[landing] = item;
    events.push({ t: 'take', col, item, slot: landing });

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
      let served = false;
      for (let s = 0; s < this.seats.length; s++) {
        const dish = this.seats[s];
        if (!dish || !k.fits(counts, k.dish(dish))) continue;
        const from: number[] = [];
        for (const part of k.parts[k.dish(dish)]) {
          const at = this.findSlotNotIn(k.items[part], from);
          from.push(at);
        }
        for (const at of from) this.counter[at] = null;
        events.push({ t: 'serve', seat: s, dish, from });
        this.served++;
        const order = this.next < this.level.orders.length ? this.next : -1;
        const nd = order >= 0 ? this.level.orders[this.next++] : null;
        this.seats[s] = nd;
        events.push({ t: 'seat', seat: s, dish: nd, order });
        served = true;
        break;
      }
      if (!served) break;
    }
    // canTake() guarantees that an item on the temporary landing spot combined: drop the spot.
    while (this.counter.length > this.slots && this.counter[this.counter.length - 1] === null) this.counter.pop();
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
    if (this.status === 'stuck') this.status = 'playing';
  }

  snapshot(): SimSnapshot {
    return {
      ptr: this.ptr.slice(),
      counter: this.counter.slice(),
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
    this.seats = s.seats.slice();
    this.next = s.next;
    this.served = s.served;
    this.extraSlots = s.slots;
    this.status = s.status;
    this.history = s.history.slice();
  }
}
