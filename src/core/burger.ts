import type { DishId, FoodId } from './content';
import type { Rng } from './rng';
import type { Rules } from './kitchen';
import type { SimEvent, Status } from './sim';
import { ClocheMarks, takesOf, thawTable } from './pantry';
import type { LevelDef } from './types';

/**
 * World 2, the Burger Joint. Each guest's ticket is an exact stack, bottom layer first: a burger
 * (bun to bun), a hot dog (bun, sausage, toppings), pancakes, a club sandwich (toast to toast) or a
 * sundae (glass to cherry). `LevelDef.orders[i]` names the dish, `tickets[i]` its layers.
 *
 * Rules
 * - Only the top item of a pantry column can be taken.
 * - A taken item goes onto the LEFTMOST plate whose next layer it is; otherwise it is parked on
 *   the counter (a free spot is needed, else the column can't be taken). The player never picks
 *   the plate: the left plate gets first pick, which is where the traps come from.
 * - After every placement the counter cascades: a parked item that is some plate's next layer
 *   slides on, left plate first, again and again.
 * - A finished stack is served; the next ticket in the queue takes that plate.
 * - Win: every item used (zero waste = every burger served). Stuck: no legal take.
 */
/** Every Burger Joint layer (engine item indices). */
export const BURGER_ITEMS: FoodId[] = [
  'bun_bottom', 'patty', 'cheese_slice', 'lettuce', 'tomato_slice', 'onion_rings', 'bun_top',
  'pickles', 'bacon', 'toast', 'hotdog_bun', 'sausage', 'pancake', 'butter', 'berries', 'cup', 'ice_cream', 'chocolate', 'cherry',
];
const INDEX = new Map(BURGER_ITEMS.map((id, i) => [id, i]));

function ix(id: FoodId): number {
  const i = INDEX.get(id);
  if (i === undefined) throw new Error(`${id} is not a burger layer`);
  return i;
}

export interface BState {
  ptr: number[];
  /** ticket index on each plate, -1 = empty for good */
  plate: number[];
  /** layers already on each plate */
  done: number[];
  next: number;
  counts: number[];
  served: number;
}

type BurgerLevel = Pick<LevelDef, 'columns' | 'slots' | 'seats' | 'lids' | 'tickets' | 'frozen'>;

export class BurgerRules implements Rules<BState> {
  readonly cols: number[][];
  readonly tickets: number[][];
  readonly slots: number;
  readonly nseats: number;
  readonly lids: number[] | null;
  /** frozen tiles: per column and row, the take count they thaw at (see pantry.ts) */
  readonly thaw: number[][] | null;
  readonly length: number;

  constructor(level: BurgerLevel, slots?: number) {
    if (!level.tickets) throw new Error('burger level without tickets');
    this.cols = level.columns.map((c) => c.map(ix));
    this.tickets = level.tickets.map((t) => t.map(ix));
    this.slots = slots ?? level.slots;
    this.nseats = level.seats;
    this.lids = level.lids && level.lids.some((x) => x > 0) ? level.lids.slice() : null;
    this.thaw = thawTable(level);
    this.length = this.cols.reduce((a, c) => a + c.length, 0);
  }

  start(): BState {
    const plate: number[] = [];
    for (let i = 0; i < this.nseats; i++) plate.push(i < this.tickets.length ? i : -1);
    return {
      ptr: this.cols.map(() => 0),
      plate,
      done: plate.map(() => 0),
      next: Math.min(this.nseats, this.tickets.length),
      counts: new Array<number>(BURGER_ITEMS.length).fill(0),
      served: 0,
    };
  }

  /** The layer plate `p` needs next, or -1. */
  need(s: Pick<BState, 'plate' | 'done'>, p: number): number {
    const t = s.plate[p];
    return t < 0 ? -1 : this.tickets[t][s.done[p]];
  }

  /** Leftmost plate that wants item `it` next, or -1. */
  target(s: Pick<BState, 'plate' | 'done'>, it: number): number {
    for (let p = 0; p < s.plate.length; p++) if (this.need(s, p) === it) return p;
    return -1;
  }

  /** One layer onto plate p; a finished plate is served and reloads from the queue. */
  private stack(st: BState, p: number): void {
    st.done[p]++;
    const t = st.plate[p];
    if (st.done[p] === this.tickets[t].length) {
      st.served++;
      st.plate[p] = st.next < this.tickets.length ? st.next++ : -1;
      st.done[p] = 0;
    }
  }

  private cascade(st: BState): void {
    for (;;) {
      let moved = false;
      for (let p = 0; p < st.plate.length; p++) {
        const n = this.need(st, p);
        if (n >= 0 && st.counts[n] > 0) {
          st.counts[n]--;
          this.stack(st, p);
          moved = true;
          break;
        }
      }
      if (!moved) return;
    }
  }

  private after(s: BState, col: number): BState | null {
    const pos = s.ptr[col];
    const c = this.cols[col];
    if (pos >= c.length) return null;
    if (this.lids && this.lids[col] > s.served) return null;
    if (this.thaw && this.thaw[col][pos] > takesOf(s.ptr)) return null;
    const it = c[pos];
    const p = this.target(s, it);
    if (p < 0) {
      let occ = 0;
      for (const x of s.counts) occ += x;
      if (occ >= this.slots) return null;
    }
    const st: BState = { ptr: s.ptr.slice(), plate: s.plate.slice(), done: s.done.slice(), next: s.next, counts: s.counts.slice(), served: s.served };
    st.ptr[col] = pos + 1;
    if (p >= 0) {
      this.stack(st, p);
      this.cascade(st);
    } else st.counts[it]++;
    return st;
  }

  moves(s: BState): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cols.length; i++) if (this.after(s, i)) out.push(i);
    return out;
  }

  successors(s: BState): [number, BState][] {
    const out: [number, BState][] = [];
    for (let i = 0; i < this.cols.length; i++) {
      const n = this.after(s, i);
      if (n) out.push([i, n]);
    }
    return out;
  }

  play(s: BState, col: number): BState {
    const n = this.after(s, col);
    if (!n) throw new Error(`illegal move: column ${col}`);
    return n;
  }

  isWin(s: BState): boolean {
    return s.served === this.tickets.length;
  }

  key(s: BState): string {
    let out = '';
    for (const p of s.ptr) out += String.fromCharCode(48 + p);
    out += '|';
    for (let i = 0; i < s.plate.length; i++) out += String.fromCharCode(49 + s.plate[i]) + String.fromCharCode(48 + s.done[i]);
    out += '|';
    for (const c of s.counts) out += String.fromCharCode(48 + c);
    return out + '|' + s.next;
  }
}

export interface BurgerSnapshot {
  ptr: number[];
  counter: (FoodId | null)[];
  plate: number[];
  done: number[];
  next: number;
  served: number;
  extra: number;
  status: Status;
  history: number[];
}

/** Play simulation for burger kitchens: counter spots and plates for the animations. */
export class BurgerSim {
  readonly level: LevelDef;
  ptr: number[];
  counter: (FoodId | null)[];
  /** ticket index per plate/seat, -1 = empty */
  plate: number[];
  done: number[];
  next: number;
  served = 0;
  status: Status = 'playing';
  history: number[] = [];
  private extra = 0;
  private rules: BurgerRules;
  /** what the player knows: lifted cloches stay lifted (not part of snapshots) */
  readonly cloches: ClocheMarks;

  constructor(level: LevelDef) {
    this.level = level;
    this.rules = new BurgerRules(level);
    this.cloches = new ClocheMarks(level);
    const s = this.rules.start();
    this.ptr = s.ptr;
    this.plate = s.plate;
    this.done = s.done;
    this.next = s.next;
    this.counter = new Array<FoodId | null>(level.slots).fill(null);
  }

  get slots(): number {
    return this.level.slots + this.extra;
  }

  get columns(): FoodId[][] {
    return this.level.columns;
  }

  covered(col: number, row: number): boolean {
    return this.cloches.covered(col, row);
  }

  thawLeft(col: number, row: number): number {
    const at = this.rules.thaw?.[col]?.[row] ?? 0;
    return at > 0 ? Math.max(0, at - takesOf(this.ptr)) : 0;
  }

  /** Dish wanted at each seat (the order's stacked dish, or empty), like Sim.seats. */
  get seats(): (DishId | null)[] {
    return this.plate.map((t) => (t >= 0 ? this.level.orders[t] : null));
  }

  ticket(seat: number): FoodId[] | null {
    const t = this.plate[seat];
    return t >= 0 ? this.level.tickets![t] : null;
  }

  stacked(seat: number): number {
    return this.done[seat];
  }

  queuedTickets(): FoodId[][] {
    return this.level.tickets!.slice(this.next);
  }

  queue(): DishId[] {
    return this.level.orders.slice(this.next);
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

  state(): BState {
    const counts = new Array<number>(BURGER_ITEMS.length).fill(0);
    for (const it of this.counter) if (it) counts[ix(it)]++;
    return { ptr: this.ptr.slice(), plate: this.plate.slice(), done: this.done.slice(), next: this.next, counts, served: this.served };
  }

  currentRules(): BurgerRules {
    if (this.rules.slots !== this.slots) this.rules = new BurgerRules(this.level, this.slots);
    return this.rules;
  }

  canTake(col: number): boolean {
    return this.status === 'playing' && this.currentRules().moves(this.state()).includes(col);
  }

  legalMoves(): number[] {
    return this.status === 'playing' ? this.currentRules().moves(this.state()) : [];
  }

  private finish(p: number, events: SimEvent[]): void {
    const t = this.plate[p];
    if (this.done[p] < this.level.tickets![t].length) return;
    this.served++;
    events.push({ t: 'serve', seat: p, dish: this.level.orders[t], from: [] });
    const order = this.next < this.level.tickets!.length ? this.next++ : -1;
    this.plate[p] = order;
    this.done[p] = 0;
    events.push({ t: 'seat', seat: p, dish: order >= 0 ? this.level.orders[order] : null, order, ticket: order >= 0 ? this.level.tickets![order] : undefined });
  }

  take(col: number): SimEvent[] | null {
    if (!this.canTake(col)) return null;
    const r = this.rules;
    const item = this.top(col)!;
    const events: SimEvent[] = [];
    this.ptr[col]++;
    this.history.push(col);
    const lidsBefore = this.openLids();
    const revealed = this.cloches.reveal(this.ptr);
    const p = r.target(this, ix(item));
    if (p >= 0) {
      events.push({ t: 'stack', col, item, seat: p, layer: this.done[p] });
      this.done[p]++;
      this.finish(p, events);
      // cascade: parked items slide onto the plates, left plate first
      for (;;) {
        let moved = false;
        for (let q = 0; q < this.plate.length; q++) {
          const n = r.need(this, q);
          if (n < 0) continue;
          const slot = this.counter.indexOf(BURGER_ITEMS[n]);
          if (slot < 0) continue;
          this.counter[slot] = null;
          events.push({ t: 'slide', slot, seat: q, layer: this.done[q], item: BURGER_ITEMS[n] });
          this.done[q]++;
          this.finish(q, events);
          moved = true;
          break;
        }
        if (!moved) break;
      }
    } else {
      const slot = this.counter.indexOf(null);
      this.counter[slot] = item;
      events.push({ t: 'take', col, item, slot });
    }
    for (const c of revealed) events.push({ t: 'reveal', col: c, item: this.top(c)! });
    for (const c of this.openLids()) if (!lidsBefore.includes(c)) events.push({ t: 'lid', col: c });
    if (this.served === this.level.tickets!.length) {
      this.status = 'won';
      events.push({ t: 'win' });
    } else if (this.legalMoves().length === 0) {
      this.status = 'stuck';
      events.push({ t: 'stuck' });
    }
    return events;
  }

  private openLids(): number[] {
    const out: number[] = [];
    this.level.lids?.forEach((k, c) => {
      if (k > 0 && k <= this.served) out.push(c);
    });
    return out;
  }

  addSlot(): void {
    this.extra++;
    this.counter.push(null);
    if (this.status === 'stuck') this.status = 'playing';
  }

  snapshot(): BurgerSnapshot {
    return {
      ptr: this.ptr.slice(), counter: this.counter.slice(), plate: this.plate.slice(), done: this.done.slice(),
      next: this.next, served: this.served, extra: this.extra, status: this.status, history: this.history.slice(),
    };
  }

  restore(s: BurgerSnapshot): void {
    this.ptr = s.ptr.slice();
    this.counter = s.counter.slice();
    this.plate = s.plate.slice();
    this.done = s.done.slice();
    this.next = s.next;
    this.served = s.served;
    this.extra = s.extra;
    this.status = s.status;
    this.history = s.history.slice();
  }
}

// ---------------------------------------------------------------------------------------------
// Stacked dishes: what a ticket of each dish looks like

/** Dishes of the Burger Joint, in the order the ladder introduces them. */
export const STACK_DISHES: DishId[] = ['burger', 'hotdog', 'pancakes', 'sandwich', 'sundae'];

/** The layers a dish's tickets can use besides its base, core and top (the level allows a subset). */
export const STACK_EXTRAS: Partial<Record<DishId, FoodId[]>> = {
  burger: ['cheese_slice', 'lettuce', 'tomato_slice', 'onion_rings', 'pickles', 'bacon'],
  hotdog: ['cheese_slice', 'onion_rings', 'pickles'],
  pancakes: ['berries', 'butter'],
  sandwich: ['bacon', 'lettuce', 'tomato_slice', 'cheese_slice'],
  sundae: ['ice_cream', 'chocolate', 'berries'],
};

/** Ticket length (layers, base and top included) each dish can have. */
export const STACK_LENGTH: Partial<Record<DishId, [number, number]>> = {
  burger: [3, 6], hotdog: [2, 4], pancakes: [3, 5], sandwich: [4, 6], sundae: [3, 5],
};

/**
 * One ticket of a stacked dish with about `len` layers, using only the `allowed` extra layers:
 * - burger: bottom bun, a patty (two with `doublePatty`) among mostly different fillings, top bun;
 * - hot dog: bun, sausage, different toppings;
 * - pancakes: two or three pancakes (berries may sit between them), butter or berries on top;
 * - sandwich: toast, different fillings, toast;
 * - sundae: glass, scoops (berries may join them), a cherry on top.
 */
export function makeStackTicket(rng: Rng, dish: DishId, len: number, allowed: FoodId[], doublePatty = 0): FoodId[] {
  const range = STACK_LENGTH[dish] ?? [3, 6];
  len = Math.max(range[0], Math.min(range[1], len));
  const can = (STACK_EXTRAS[dish] ?? []).filter((x) => allowed.includes(x));
  const distinct = (k: number) => rng.shuffle(can.slice()).slice(0, k);
  switch (dish) {
    case 'hotdog':
      return ['hotdog_bun', 'sausage', ...distinct(Math.min(len - 2, can.length))];
    case 'sandwich': {
      const mid = distinct(Math.min(len - 2, can.length));
      return ['toast', ...mid, 'toast'];
    }
    case 'pancakes': {
      const tops = can.length ? can : (['butter'] as FoodId[]);
      const top = rng.pick(tops);
      const body: FoodId[] = ['pancake', 'pancake'];
      while (body.length < len - 1) body.push(can.includes('berries') && body[body.length - 1] === 'pancake' && rng.chance(0.4) ? 'berries' : 'pancake');
      if (body[body.length - 1] === 'berries' && top === 'berries') body[body.length - 1] = 'pancake';
      return [...body, top];
    }
    case 'sundae': {
      const scoops = can.filter((x) => x !== 'berries');
      const first = rng.pick(scoops.length ? scoops : (['ice_cream'] as FoodId[]));
      const mid: FoodId[] = [];
      while (mid.length < len - 3 && can.length) mid.push(rng.pick(can));
      return ['cup', first, ...mid, 'cherry'];
    }
    default: {
      // burger: a patty and mostly different fillings, buns around them
      const k = len - 2;
      const others = can;
      const any: FoodId[] = others.length ? others : ['patty'];
      let mid: FoodId[];
      if (k >= 2 && doublePatty > 0 && rng.chance(doublePatty)) {
        const rest = rng.shuffle(others.slice()).slice(0, k - 2);
        while (rest.length < k - 2) rest.push(rng.pick(any));
        const at = rng.int(0, rest.length);
        mid = [...rest.slice(0, at), 'patty', 'patty', ...rest.slice(at)];
      } else {
        const pick = rng.shuffle(others.slice()).slice(0, k - 1);
        while (pick.length < k - 1) pick.push(rng.pick([...any, 'patty']));
        mid = rng.shuffle([...pick, 'patty']);
      }
      return ['bun_bottom', ...mid, 'bun_top'];
    }
  }
}

/** The stacked dish a ticket makes (by its bottom layer). */
export function stackDishOf(ticket: readonly FoodId[]): DishId {
  switch (ticket[0]) {
    case 'hotdog_bun': return 'hotdog';
    case 'pancake': return 'pancakes';
    case 'toast': return 'sandwich';
    case 'cup': return 'sundae';
    default: return 'burger';
  }
}
