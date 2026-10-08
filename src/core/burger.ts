import type { DishId, FoodId } from './content';
import type { Rng } from './rng';
import type { Rules } from './kitchen';
import type { GuestInfo, SimEvent, Status } from './sim';
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
  /** parked items per layer (grilled patties included once done) */
  counts: number[];
  served: number;
  /** the grill: takes left for each patty on it, ascending; absent without a grill */
  grill?: number[];
  /**
   * Set menus and VIPs (guest mode): per plate, the order index of the seated guest's first ticket
   * (-1 = empty), and how many of the guest's finished stacks wait on the counter (a spot each).
   * plate[p] is -2 while the guest's stacks are all finished but can't go out yet (a VIP is seated).
   */
  g?: number[];
  held?: number[];
}

type BurgerLevel = Pick<LevelDef, 'columns' | 'slots' | 'seats' | 'lids' | 'tickets' | 'frozen' | 'stove' | 'sets' | 'vip'>;

const PATTY = BURGER_ITEMS.indexOf('patty');

export class BurgerRules implements Rules<BState> {
  readonly cols: number[][];
  readonly tickets: number[][];
  readonly slots: number;
  readonly nseats: number;
  readonly lids: number[] | null;
  /** frozen tiles: per column and row, the take count they thaw at (see pantry.ts) */
  readonly thaw: number[][] | null;
  /** the grill: takes a patty grills before it can go on a plate (0 = no grill) */
  readonly grillTime: number;
  /** guest mode: per order index, does a two-ticket set start here / is it a VIP (null: neither) */
  readonly setStart: boolean[] | null;
  readonly vipAt: boolean[] | null;
  readonly length: number;

  constructor(level: BurgerLevel, slots?: number) {
    if (!level.tickets) throw new Error('burger level without tickets');
    this.cols = level.columns.map((c) => c.map(ix));
    this.tickets = level.tickets.map((t) => t.map(ix));
    this.slots = slots ?? level.slots;
    this.nseats = level.seats;
    this.lids = level.lids && level.lids.some((x) => x > 0) ? level.lids.slice() : null;
    this.thaw = thawTable(level);
    this.grillTime = level.stove?.patty ?? 0;
    const guests = !!(level.sets?.length || level.vip?.length);
    this.setStart = guests ? level.tickets.map((_, i) => !!level.sets?.includes(i)) : null;
    this.vipAt = guests ? level.tickets.map((_, i) => !!level.vip?.includes(i)) : null;
    this.length = this.cols.reduce((a, c) => a + c.length, 0);
  }

  /** Guest mode: tickets of the guest whose first order is g (one, or two for a set menu). */
  ticketsOf(g: number): number {
    return g < 0 ? 0 : this.setStart![g] ? 2 : 1;
  }

  /** Guest mode: seats the next guest in the queue at plate p (or leaves it empty). */
  private seatGuest(st: BState, p: number): void {
    if (st.next < this.tickets.length) {
      st.plate[p] = st.next;
      st.g![p] = st.next;
      st.next += this.setStart![st.next] ? 2 : 1;
    } else {
      st.plate[p] = -1;
      st.g![p] = -1;
    }
    st.done[p] = 0;
    st.held![p] = 0;
  }

  /** Guest mode: serves every guest whose stacks are all finished (only VIPs while one is seated). */
  private deliver(st: BState): void {
    const vip = this.vipAt!;
    for (let again = true; again; ) {
      again = false;
      const vipSeated = st.g!.some((x) => x >= 0 && vip[x]);
      for (let p = 0; p < st.plate.length; p++) {
        if (st.plate[p] !== -2 || (vipSeated && !vip[st.g![p]])) continue;
        st.served += this.ticketsOf(st.g![p]);
        this.seatGuest(st, p);
        again = true;
        break;
      }
    }
  }

  start(): BState {
    const plate: number[] = [];
    for (let i = 0; i < this.nseats; i++) plate.push(i < this.tickets.length ? i : -1);
    const s: BState = {
      ptr: this.cols.map(() => 0),
      plate,
      done: plate.map(() => 0),
      next: Math.min(this.nseats, this.tickets.length),
      counts: new Array<number>(BURGER_ITEMS.length).fill(0),
      served: 0,
    };
    if (this.grillTime) s.grill = [];
    if (this.setStart) {
      s.g = plate.map(() => -1);
      s.held = plate.map(() => 0);
      s.next = 0;
      for (let p = 0; p < plate.length; p++) this.seatGuest(s, p);
    }
    return s;
  }

  /** Counter spots in use: parked items, patties on the grill and finished stacks waiting for their guest. */
  occupancy(s: BState): number {
    let occ = s.grill ? s.grill.length : 0;
    for (const x of s.counts) occ += x;
    if (s.held) for (const h of s.held) occ += h;
    return occ;
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

  /**
   * One layer onto plate p; a finished plate is served and reloads from the queue. Guest mode: a
   * finished stack waits on the counter; the plate takes the set's second ticket, or the guest is
   * served once all their stacks are done (unless a VIP is seated).
   */
  private stack(st: BState, p: number): void {
    st.done[p]++;
    const t = st.plate[p];
    if (st.done[p] !== this.tickets[t].length) return;
    if (!st.g) {
      st.served++;
      st.plate[p] = st.next < this.tickets.length ? st.next++ : -1;
      st.done[p] = 0;
      return;
    }
    st.held![p]++;
    st.done[p] = 0;
    if (st.held![p] < this.ticketsOf(st.g[p])) st.plate[p] = st.g[p] + st.held![p];
    else {
      st.plate[p] = -2;
      this.deliver(st);
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
    // a raw patty always goes on the grill (a spot), never straight onto a plate
    const grilled = !!s.grill && it === PATTY;
    const p = grilled ? -1 : this.target(s, it);
    if (p < 0 && this.occupancy(s) >= this.slots) return null;
    const st: BState = { ptr: s.ptr.slice(), plate: s.plate.slice(), done: s.done.slice(), next: s.next, counts: s.counts.slice(), served: s.served };
    if (s.g) {
      st.g = s.g.slice();
      st.held = s.held!.slice();
    }
    st.ptr[col] = pos + 1;
    if (p >= 0) {
      this.stack(st, p);
      this.cascade(st);
    } else if (!grilled) st.counts[it]++;
    if (s.grill) {
      // patties already on the grill cook one take more; done ones become parked patties and may
      // slide onto a plate; with the pantry empty, the grill finishes
      const empty = takesOf(st.ptr) === this.length;
      let done = 0;
      const grill: number[] = [];
      for (const t of s.grill) {
        if (t <= 1 || empty) done++;
        else grill.push(t - 1);
      }
      if (grilled) {
        if (empty) done++;
        else grill.push(this.grillTime);
      }
      grill.sort((a, b) => a - b);
      st.grill = grill;
      if (done) {
        st.counts[PATTY] += done;
        this.cascade(st);
      }
    }
    // guest mode: finished stacks waiting for their guest take spots too
    if (st.g && this.occupancy(st) > this.slots) return null;
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
    if (s.grill) out += '|' + s.grill.join('');
    if (s.g) for (let i = 0; i < s.g.length; i++) out += String.fromCharCode(49 + s.g[i]) + s.held![i];
    return out + '|' + s.next;
  }
}

export interface BurgerSnapshot {
  ptr: number[];
  counter: (FoodId | null)[];
  grill: (number | null)[];
  stacks: ({ seat: number; order: number } | null)[];
  guest: number[];
  held: number[];
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
  /** the grill: takes left for the patty grilling at each counter slot (null: nothing grills there) */
  grill: (number | null)[];
  /** guest mode: per plate, the guest's first order index and their finished stacks waiting on the counter */
  guest: number[] = [];
  held: number[] = [];
  /** guest mode: a finished stack waiting on each counter slot (for the guest at `seat`) */
  stacks: ({ seat: number; order: number } | null)[];
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
    this.grill = new Array<number | null>(level.slots).fill(null);
    this.stacks = new Array<{ seat: number; order: number } | null>(level.slots).fill(null);
    if (s.g) {
      this.guest = s.g.slice();
      this.held = s.held!.slice();
    }
  }

  guestAt(seat: number): GuestInfo | null {
    if (!this.rules.setStart) {
      const t = this.plate[seat];
      return t >= 0 ? { dishes: [this.level.orders[t]], ready: [false], vip: false } : null;
    }
    const g = this.guest[seat];
    if (g < 0) return null;
    const n = this.rules.ticketsOf(g);
    const dishes = this.level.orders.slice(g, g + n);
    return { dishes, ready: dishes.map((_, j) => j < this.held[seat]), vip: this.rules.vipAt![g] };
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
    const st = this.stacks[i];
    return st ? this.level.orders[st.order] : null;
  }

  /** A free counter slot (no item, no patty, no finished stack), or -1. */
  private freeSlot(): number {
    for (let i = 0; i < this.counter.length; i++) if (this.counter[i] === null && this.grill[i] === null && !this.stacks[i]) return i;
    return -1;
  }

  get slots(): number {
    return this.level.slots + this.extra;
  }

  cooking(i: number): { left: number; dish: DishId | null } | null {
    const left = this.grill[i];
    return left !== null && left !== undefined ? { left, dish: null } : null;
  }

  /** A slot holding a parked (not grilling) `item`, or -1. */
  private parkedSlot(item: FoodId): number {
    for (let i = 0; i < this.counter.length; i++) if (this.counter[i] === item && this.grill[i] === null) return i;
    return -1;
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
    return this.plate.map((_, p) => {
      const t = this.shown(p);
      return t >= 0 ? this.level.orders[t] : null;
    });
  }

  /** The ticket a plate shows: the one being built, or (guest mode, all done but waiting) the last one. */
  private shown(p: number): number {
    const t = this.plate[p];
    return t === -2 ? this.guest[p] + this.held[p] - 1 : t;
  }

  ticket(seat: number): FoodId[] | null {
    const t = this.shown(seat);
    return t >= 0 ? this.level.tickets![t] : null;
  }

  stacked(seat: number): number {
    return this.plate[seat] === -2 ? this.level.tickets![this.shown(seat)].length : this.done[seat];
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
    this.counter.forEach((it, i) => {
      if (it && this.grill[i] === null) counts[ix(it)]++;
    });
    const st: BState = { ptr: this.ptr.slice(), plate: this.plate.slice(), done: this.done.slice(), next: this.next, counts, served: this.served };
    if (this.rules.grillTime) st.grill = this.grill.filter((x): x is number => x !== null).sort((a, b) => a - b);
    if (this.rules.setStart) {
      st.g = this.guest.slice();
      st.held = this.held.slice();
    }
    return st;
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
    if (this.rules.setStart) return this.finishGuest(p, t, events);
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
    const grilling = this.grill.map((g) => g !== null);
    const grilled = r.grillTime > 0 && item === 'patty';
    const p = grilled ? -1 : r.target(this, ix(item));
    if (p >= 0) {
      events.push({ t: 'stack', col, item, seat: p, layer: this.done[p] });
      this.done[p]++;
      this.finish(p, events);
      this.cascade(events);
    } else {
      const slot = this.freeSlot();
      this.counter[slot] = item;
      events.push({ t: 'take', col, item, slot });
      if (grilled) {
        this.grill[slot] = r.grillTime;
        events.push({ t: 'grill', slot, left: r.grillTime });
      }
    }
    if (r.grillTime) {
      // patties already on the grill cook one take more; done ones are parked patties that may
      // slide onto a plate; with the pantry empty the grill finishes
      const empty = this.ptr.every((q, c) => q >= this.level.columns[c].length);
      let doneAny = false;
      this.grill.forEach((g, i) => {
        if (g === null || (!grilling[i] && !empty)) return;
        const left = empty ? 0 : g - 1;
        if (left > 0) {
          this.grill[i] = left;
          events.push({ t: 'tick', slot: i, left });
        } else {
          this.grill[i] = null;
          events.push({ t: 'done', slot: i });
          doneAny = true;
        }
      });
      if (doneAny) this.cascade(events);
    }
    // a finished stack that waited past the last spot moves to a spot freed meanwhile
    while (this.counter.length > this.slots) {
      const at = this.counter.length - 1;
      const st = this.stacks[at];
      if (st) {
        const to = this.freeSlot();
        if (to < 0 || to >= this.slots) throw new Error('no spot for a finished stack');
        this.stacks[to] = st;
        events.push({ t: 'move', from: at, to });
      }
      this.counter.pop();
      this.grill.pop();
      this.stacks.pop();
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

  /**
   * Guest mode: ticket t of the guest at plate p is finished. The stack waits on the counter while
   * the set's second ticket is built; once all are done the guest is served, unless a VIP is
   * seated (then the last stack waits on the counter too).
   */
  private finishGuest(p: number, t: number, events: SimEvent[]): void {
    const r = this.rules;
    this.held[p]++;
    this.done[p] = 0;
    if (this.held[p] < r.ticketsOf(this.guest[p])) {
      this.shelve(p, t, events);
      this.plate[p] = this.guest[p] + this.held[p];
      events.push({ t: 'ticket', seat: p, order: this.plate[p], ticket: this.level.tickets![this.plate[p]] });
      return;
    }
    this.plate[p] = -2;
    this.deliverAll(events, p, t);
    // not served yet (a VIP is seated): the last stack waits on the counter as well
    if (this.plate[p] === -2) this.shelve(p, t, events);
  }

  private shelve(p: number, t: number, events: SimEvent[]): void {
    let slot = this.freeSlot();
    if (slot < 0) {
      // a spot frees up later in this take (a parked item slides onto a plate): wait past the last one meanwhile
      slot = this.counter.length;
      this.counter.push(null);
      this.grill.push(null);
      this.stacks.push(null);
    }
    this.stacks[slot] = { seat: p, order: t };
    events.push({ t: 'shelve', seat: p, slot, dish: this.level.orders[t] });
  }

  /**
   * Guest mode: serves every guest whose stacks are all finished (only VIPs while one is seated):
   * the stacks waiting on the counter, and the one still on the plate (`fresh`: plate p, ticket t).
   */
  private deliverAll(events: SimEvent[], fresh = -1, freshTicket = -1): void {
    const r = this.rules;
    const vip = r.vipAt!;
    for (let again = true; again; ) {
      again = false;
      const vipSeated = this.guest.some((g) => g >= 0 && vip[g]);
      for (let p = 0; p < this.plate.length; p++) {
        if (this.plate[p] !== -2 || (vipSeated && !vip[this.guest[p]])) continue;
        this.stacks.forEach((st, slot) => {
          if (!st || st.seat !== p) return;
          events.push({ t: 'serve', seat: p, dish: this.level.orders[st.order], from: [slot] });
          this.stacks[slot] = null;
        });
        if (p === fresh) {
          events.push({ t: 'serve', seat: p, dish: this.level.orders[freshTicket], from: [] });
          fresh = -1;
        }
        this.served += r.ticketsOf(this.guest[p]);
        const order = this.next < this.level.tickets!.length ? this.next : -1;
        this.plate[p] = order;
        this.guest[p] = order;
        this.held[p] = 0;
        this.done[p] = 0;
        if (order >= 0) this.next += r.setStart![order] ? 2 : 1;
        events.push({ t: 'seat', seat: p, dish: order >= 0 ? this.level.orders[order] : null, order, ticket: order >= 0 ? this.level.tickets![order] : undefined });
        again = true;
        break;
      }
    }
  }

  /** Parked items slide onto the plates that need them next, left plate first, again and again. */
  private cascade(events: SimEvent[]): void {
    const r = this.rules;
    for (;;) {
      let moved = false;
      for (let q = 0; q < this.plate.length; q++) {
        const n = r.need(this, q);
        if (n < 0) continue;
        const slot = this.parkedSlot(BURGER_ITEMS[n]);
        if (slot < 0) continue;
        this.counter[slot] = null;
        events.push({ t: 'slide', slot, seat: q, layer: this.done[q], item: BURGER_ITEMS[n] });
        this.done[q]++;
        this.finish(q, events);
        moved = true;
        break;
      }
      if (!moved) return;
    }
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
    this.grill.push(null);
    this.stacks.push(null);
    if (this.status === 'stuck') this.status = 'playing';
  }

  snapshot(): BurgerSnapshot {
    return {
      ptr: this.ptr.slice(), counter: this.counter.slice(), grill: this.grill.slice(), stacks: this.stacks.map((x) => (x ? { ...x } : null)),
      guest: this.guest.slice(), held: this.held.slice(), plate: this.plate.slice(), done: this.done.slice(),
      next: this.next, served: this.served, extra: this.extra, status: this.status, history: this.history.slice(),
    };
  }

  restore(s: BurgerSnapshot): void {
    this.ptr = s.ptr.slice();
    this.counter = s.counter.slice();
    this.grill = s.grill.slice();
    this.stacks = s.stacks.map((x) => (x ? { ...x } : null));
    this.guest = s.guest.slice();
    this.held = s.held.slice();
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
