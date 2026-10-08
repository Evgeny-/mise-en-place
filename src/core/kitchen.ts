import { MENUS, type DishId, type FoodId, type Menu } from './content';
import { takesOf, thawTable } from './pantry';
import type { LevelDef } from './types';

/**
 * A menu compiled to integer tables, plus the compact rules the solver, the level generator and
 * the hint use. The play simulation (sim.ts) tracks slot positions for the animations on top of
 * exactly the same resolution logic; tests check that both always agree.
 *
 * Rules
 * - Only the top item of a pantry column can be taken. It lands on the counter.
 * - The counter resolves until stable: first preps, one at a time in menu priority (two tomatoes
 *   ALWAYS make sauce); only when no prep fires, ONE dish is served: the leftmost seated guest
 *   whose dish parts are all on the counter. That guest leaves and the next guest in the queue
 *   takes the same seat; resolution continues (a new guest may be served at once).
 * - Landing-slot rule: a take is legal only if, after resolving, the counter holds at most
 *   `slots` items. A full counter therefore still accepts an item that combines immediately.
 * - Lids and frozen tiles (pantry.ts) block a column until enough dishes were served / takes made.
 * - The oven (level.stove): an oven dish whose parts are together bakes for N takes in one counter
 *   slot while its guest waits; every take bakes the dishes already in the oven one take more, and
 *   a done dish is served. When the pantry is empty, the oven finishes on its own.
 * - Win: every guest is served (levels are zero-waste, so the pantry and counter are empty).
 *   Stuck: not won and no legal take.
 */
export class Kitchen {
  readonly menu: Menu;
  readonly items: FoodId[];
  readonly index = new Map<FoodId, number>();
  /** prep rules in priority order */
  readonly preps: { a: number; b: number; out: number }[];
  readonly dishes: DishId[];
  readonly dishIndex = new Map<DishId, number>();
  /** dish index -> part item indices */
  readonly parts: number[][];
  /** dish index -> item index -> count */
  readonly need: number[][];
  /** item index -> raw item indices it is made of (itself for raw items) */
  readonly rawOf: number[][];

  constructor(menu: Menu) {
    this.menu = menu;
    this.items = menu.items.slice();
    this.items.forEach((id, i) => this.index.set(id, i));
    const ix = (id: FoodId) => {
      const i = this.index.get(id);
      if (i === undefined) throw new Error(`${id} is not on the ${menu.id} menu`);
      return i;
    };
    this.preps = menu.preps.map((p) => ({ a: ix(p.from[0]), b: ix(p.from[1]), out: ix(p.out) }));
    this.dishes = menu.dishes.map((d) => d.id);
    this.dishes.forEach((d, i) => this.dishIndex.set(d, i));
    this.parts = menu.dishes.map((d) => d.parts.map(ix));
    this.need = this.parts.map((ps) => {
      const v = new Array<number>(this.items.length).fill(0);
      for (const p of ps) v[p]++;
      return v;
    });
    this.rawOf = this.items.map((_, i) => this.expand(i));
  }

  private expand(i: number): number[] {
    const p = this.preps.find((q) => q.out === i);
    return p ? [...this.expand(p.a), ...this.expand(p.b)] : [i];
  }

  item(id: FoodId): number {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`${id} is not on the ${this.menu.id} menu`);
    return i;
  }

  dish(id: DishId): number {
    const i = this.dishIndex.get(id);
    if (i === undefined) throw new Error(`${id} is not on the ${this.menu.id} menu`);
    return i;
  }

  /** Raw items a dish is made of (sauce -> two tomatoes, ...). */
  rawParts(d: number): number[] {
    return this.parts[d].flatMap((p) => this.rawOf[p]);
  }

  /** The first prep that can fire on these counts, or -1. */
  firePrep(counts: number[]): number {
    for (let k = 0; k < this.preps.length; k++) {
      const p = this.preps[k];
      if (p.a === p.b ? counts[p.a] >= 2 : counts[p.a] > 0 && counts[p.b] > 0) return k;
    }
    return -1;
  }

  /** Can dish d be assembled from these counts? */
  fits(counts: number[], d: number): boolean {
    const need = this.need[d];
    for (let i = 0; i < need.length; i++) if (need[i] > counts[i]) return false;
    return true;
  }
}

const KITCHENS = new Map<string, Kitchen>();

export function kitchenFor(menuId: string): Kitchen {
  let k = KITCHENS.get(menuId);
  if (!k) {
    const menu = MENUS[menuId];
    if (!menu) throw new Error(`unknown menu ${menuId}`);
    k = new Kitchen(menu);
    KITCHENS.set(menuId, k);
  }
  return k;
}

/** Compact immutable state used by the solver. */
export interface KState {
  /** items taken per column */
  ptr: number[];
  /** counter item counts per item index */
  counts: number[];
  /** dish index per seat, -1 = empty */
  seats: number[];
  /** next order to seat */
  next: number;
  served: number;
  /** per seat: takes its dish still bakes in the oven (0 = not baking); absent without a stove */
  cook?: number[];
}

/** Generic rules interface: the solver and the difficulty metrics work on any world. */
export interface Rules<S> {
  start(): S;
  /** legal moves (column indices), ascending */
  moves(s: S): number[];
  /** state after a legal move (pure) */
  play(s: S, move: number): S;
  isWin(s: S): boolean;
  key(s: S): string;
  /** total moves of any winning line (zero-waste levels: the item count) */
  readonly length: number;
}

export class KitchenRules implements Rules<KState> {
  readonly k: Kitchen;
  readonly cols: number[][];
  readonly slots: number;
  readonly orders: number[];
  readonly lids: number[] | null;
  /** frozen tiles: per column and row, the take count they thaw at (see pantry.ts) */
  readonly thaw: number[][] | null;
  /** the oven: per dish index, the takes it bakes once its parts are together (0 = served at once); null without a stove */
  readonly bake: number[] | null;
  readonly nseats: number;
  readonly length: number;

  constructor(level: Pick<LevelDef, 'menu' | 'columns' | 'slots' | 'seats' | 'orders' | 'lids' | 'frozen' | 'stove'>, slots?: number) {
    this.k = kitchenFor(level.menu);
    this.cols = level.columns.map((c) => c.map((id) => this.k.item(id)));
    this.slots = slots ?? level.slots;
    this.orders = level.orders.map((d) => this.k.dish(d));
    this.lids = level.lids && level.lids.some((x) => x > 0) ? level.lids.slice() : null;
    this.thaw = thawTable(level);
    const bake = this.k.dishes.map((d) => (level.stove?.[d] ?? 0));
    this.bake = bake.some((x) => x > 0) ? bake : null;
    this.nseats = level.seats;
    this.length = this.cols.reduce((a, c) => a + c.length, 0);
  }

  start(): KState {
    const seats: number[] = [];
    for (let i = 0; i < this.nseats; i++) seats.push(i < this.orders.length ? this.orders[i] : -1);
    const s: KState = {
      ptr: this.cols.map(() => 0),
      counts: new Array<number>(this.k.items.length).fill(0),
      seats,
      next: Math.min(this.nseats, this.orders.length),
      served: 0,
    };
    if (this.bake) s.cook = seats.map(() => 0);
    return s;
  }

  /**
   * Resolves the counter (mutates the given arrays): preps first, one at a time in menu priority;
   * when none fires, the leftmost seated guest (not waiting for the oven) whose dish parts are all
   * there gets them: served at once, or (an oven dish) the dish starts baking and the guest waits.
   */
  resolve(counts: number[], seats: number[], st: { next: number; served: number }, cook?: number[]): void {
    const k = this.k;
    for (;;) {
      const pk = k.firePrep(counts);
      if (pk >= 0) {
        const p = k.preps[pk];
        counts[p.a]--;
        counts[p.b]--;
        counts[p.out]++;
        continue;
      }
      let acted = false;
      for (let i = 0; i < seats.length; i++) {
        const d = seats[i];
        if (d < 0 || (cook && cook[i] > 0) || !k.fits(counts, d)) continue;
        const need = k.need[d];
        for (let j = 0; j < need.length; j++) counts[j] -= need[j];
        if (cook && this.bake![d] > 0) cook[i] = this.bake![d];
        else this.serveSeat(seats, st, i);
        acted = true;
        break;
      }
      if (!acted) return;
    }
  }

  /** The guest at seat i is served; the next guest in the queue takes the seat. */
  private serveSeat(seats: number[], st: { next: number; served: number }, i: number): void {
    st.served++;
    seats[i] = st.next < this.orders.length ? this.orders[st.next++] : -1;
  }

  /**
   * The oven after a take: every dish that was baking before it bakes one take more; a done dish
   * is served (its guest leaves, the next one sits down, the counter resolves again). When the
   * pantry is empty, whatever is still in the oven finishes. Seats in order, as everywhere.
   */
  private tick(before: number[], counts: number[], seats: number[], st: { next: number; served: number }, cook: number[], empty: boolean): void {
    for (let i = 0; i < seats.length; i++) {
      if (before[i] > 0 && cook[i] > 0 && --cook[i] === 0) {
        this.serveSeat(seats, st, i);
        this.resolve(counts, seats, st, cook);
      }
    }
    while (empty && cook.some((c) => c > 0)) {
      const i = cook.findIndex((c) => c > 0);
      cook[i] = 0;
      this.serveSeat(seats, st, i);
      this.resolve(counts, seats, st, cook);
    }
  }

  private after(s: KState, col: number): KState | null {
    const p = s.ptr[col];
    const c = this.cols[col];
    if (p >= c.length) return null;
    if (this.lids && this.lids[col] > s.served) return null;
    if (this.thaw && this.thaw[col][p] > takesOf(s.ptr)) return null;
    const counts = s.counts.slice();
    counts[c[p]]++;
    const seats = s.seats.slice();
    const st = { next: s.next, served: s.served };
    const cook = s.cook ? s.cook.slice() : undefined;
    this.resolve(counts, seats, st, cook);
    const ptr = s.ptr.slice();
    ptr[col] = p + 1;
    if (cook) this.tick(s.cook!, counts, seats, st, cook, takesOf(ptr) === this.length);
    let occ = 0;
    for (const x of counts) occ += x;
    if (cook) for (const x of cook) if (x > 0) occ++;
    if (occ > this.slots) return null;
    const n: KState = { ptr, counts, seats, next: st.next, served: st.served };
    if (cook) n.cook = cook;
    return n;
  }

  moves(s: KState): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cols.length; i++) if (this.after(s, i)) out.push(i);
    return out;
  }

  /** Legal moves with their resulting states (avoids resolving twice). */
  successors(s: KState): [number, KState][] {
    const out: [number, KState][] = [];
    for (let i = 0; i < this.cols.length; i++) {
      const n = this.after(s, i);
      if (n) out.push([i, n]);
    }
    return out;
  }

  play(s: KState, col: number): KState {
    const n = this.after(s, col);
    if (!n) throw new Error(`illegal move: column ${col}`);
    return n;
  }

  isWin(s: KState): boolean {
    return s.served === this.orders.length;
  }

  key(s: KState): string {
    let out = '';
    for (const p of s.ptr) out += String.fromCharCode(48 + p);
    out += '|';
    for (const c of s.counts) out += String.fromCharCode(48 + c);
    out += '|';
    for (const d of s.seats) out += String.fromCharCode(49 + d);
    if (s.cook) {
      out += '|';
      for (const c of s.cook) out += String.fromCharCode(48 + c);
    }
    return out + '|' + s.next;
  }

  /** Item index on top of a column, or -1. */
  top(s: KState, col: number): number {
    const c = this.cols[col];
    return s.ptr[col] < c.length ? c[s.ptr[col]] : -1;
  }

  /** Counter slots in use (dishes in the oven included). */
  occupancy(s: KState): number {
    let occ = 0;
    for (const x of s.counts) occ += x;
    if (s.cook) for (const x of s.cook) if (x > 0) occ++;
    return occ;
  }
}
