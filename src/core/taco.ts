import { DISHES, TAQUERIA, type DishId, type FoodId } from './content';
import type { Rules } from './kitchen';
import type { SimEvent, Status } from './sim';
import { ClocheMarks, takesOf, thawTable } from './pantry';
import type { LevelDef } from './types';

/**
 * World 3, the Taquería: containers. A port of the design research engine (taco.py, final rules).
 *
 * Rules
 * - Only the top item of a pantry column can be taken. It lands on a counter with `slots` slots.
 * - A TORTILLA (holds 3) or a burrito WRAP (holds 4) lands OPEN and takes one slot. The NEWEST open
 *   container is the RECEIVING one: every filling that lands drops into it and takes no slot. At
 *   capacity it folds (a taco / a burrito) and the previous open container receives again (a stack).
 * - Fillings: beans, pork, chicken, cheese, lettuce, corn, salsa, guacamole. With no container open
 *   a filling waits LOOSE (one slot); a container that opens SCOOPS the loose fillings in the order
 *   they arrived, up to its capacity.
 * - Prep halves wait on the counter: tomato + onion = salsa, avocado + lime = guacamole. The product
 *   is a filling and drops straight into the receiving container (or waits loose).
 * - Tickets are exact filling sets. A folded taco goes to the leftmost seated guest whose ticket it
 *   matches; otherwise it waits on the counter (one slot) and is served the moment its ticket is
 *   seated (in-place refill, cascades).
 * - Fit guard: a take is illegal if afterwards some container can no longer become a remaining
 *   ticket (open ones, folded ones, and the loose row as the next containers would scoop it), or
 *   the containers can't be matched to distinct remaining tickets.
 * - Landing-slot rule: a full counter still accepts a take whose resolution brings it back to at
 *   most `slots` items (a filling into an open container, a tomato that completes salsa, a
 *   tortilla that scoops).
 * - Twist "topping last": a dish may mark one filling that must go in last; the guard refuses it
 *   until it would close the container.
 * - Zero waste. Win: every guest served. Stuck: not won and no legal take.
 */

/** Item indices of the engine (the research engine's order): fillings, prep halves, containers. */
export const TACO_ITEMS: FoodId[] = [
  'beans', 'pork', 'chicken', 'cheese', 'lettuce', 'corn', 'salsa', 'guacamole',
  'tomato', 'onion', 'avocado', 'lime', 'tortilla', 'wrap',
];
const INDEX = new Map(TACO_ITEMS.map((id, i) => [id, i]));
const SALSA = 6;
const GUAC = 7;
const TOMATO = 8;
const TORTILLA = 12;
/** fillings a container holds, by container index (0 tortilla, 1 wrap) */
const CAP = [3, 4];
const CONTAINERS: FoodId[] = ['tortilla', 'wrap'];

/** Fillings a container holds (tortilla 3, wrap 4); 0 for anything else. */
export function capacityOf(id: FoodId): number {
  return id === 'tortilla' ? 3 : id === 'wrap' ? 4 : 0;
}

export function isContainer(id: FoodId): boolean {
  return id === 'tortilla' || id === 'wrap';
}

/** Can this item go into a container (a filling or a prep product)? */
export function isFilling(id: FoodId): boolean {
  const i = INDEX.get(id);
  return i !== undefined && i < TOMATO;
}

/** Prep halves and what they make with their partner. */
export const PREP_HALF: Partial<Record<FoodId, { partner: FoodId; makes: FoodId }>> = {
  tomato: { partner: 'onion', makes: 'salsa' },
  onion: { partner: 'tomato', makes: 'salsa' },
  avocado: { partner: 'lime', makes: 'guacamole' },
  lime: { partner: 'avocado', makes: 'guacamole' },
};

export function tacoIndex(id: FoodId): number {
  const i = INDEX.get(id);
  if (i === undefined) throw new Error(`${id} is not a Taquería item`);
  return i;
}

/** Every Taquería dish, in menu order (the engine's dish indices). */
export const TACO_DISHES: DishId[] = TAQUERIA.dishes.map((d) => d.id);
const DISH_INDEX = new Map(TACO_DISHES.map((d, i) => [d, i]));

export function tacoDish(id: DishId): number {
  const i = DISH_INDEX.get(id);
  if (i === undefined) throw new Error(`${id} is not a Taquería dish`);
  return i;
}

/** Container (0 tortilla, 1 wrap) and exact filling multiset (sorted item indices) of a dish. */
function compileDish(id: DishId): { c: number; exact: number[] } {
  const [container, ...fills] = DISHES[id].parts;
  const c = CONTAINERS.indexOf(container);
  if (c < 0 || fills.length !== CAP[c]) throw new Error(`${id}: bad Taquería dish`);
  return { c, exact: fills.map(tacoIndex).sort((a, b) => a - b) };
}
const COMPILED = TACO_DISHES.map(compileDish);

/** The dish whose exact filling set this is (container + fillings, any order), or null. */
export function dishFor(container: FoodId, fillings: FoodId[]): DishId | null {
  const c = CONTAINERS.indexOf(container);
  const f = fillings.map(tacoIndex).sort((a, b) => a - b);
  const d = COMPILED.findIndex((x) => x.c === c && sameList(x.exact, f));
  return d >= 0 ? TACO_DISHES[d] : null;
}

function sameList(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** a, b sorted: is a a sub-multiset of b? */
function submultiset(a: readonly number[], b: readonly number[]): boolean {
  let j = 0;
  for (const x of a) {
    while (j < b.length && b[j] < x) j++;
    if (j === b.length || b[j] !== x) return false;
    j++;
  }
  return true;
}

function count(a: readonly number[], x: number): number {
  let n = 0;
  for (const y of a) if (y === x) n++;
  return n;
}

function insertSorted(a: readonly number[], x: number): number[] {
  const out = a.slice();
  let i = out.length;
  while (i > 0 && out[i - 1] > x) i--;
  out.splice(i, 0, x);
  return out;
}

/**
 * A container on the counter: c = 0 tortilla / 1 wrap, f = fillings (sorted item indices),
 * last = the filling that went in last (folded containers whose dish has a topping; else -1).
 */
export interface Box {
  readonly c: number;
  readonly f: readonly number[];
  readonly last: number;
  readonly code: string;
}

function makeBox(c: number, f: readonly number[], last: number): Box {
  return { c, f, last, code: (c ? 'W' : 'T') + f.join('') + (last >= 0 ? '^' + last : '') };
}

/** The counter and the guests, interned by TacoRules (a "kitchen"). */
export interface TKitchen {
  /** open containers, oldest first (the last one receives) */
  readonly opens: readonly Box[];
  /** folded containers waiting for their ticket (canonical order) */
  readonly closed: readonly Box[];
  /** loose fillings in arrival order (the next container scoops from the front) */
  readonly loose: readonly number[];
  /** waiting prep halves: tomato, onion, avocado, lime counts */
  readonly raws: readonly number[];
  /** dish index per seat, -1 = empty */
  readonly seats: readonly number[];
  /** next order to seat */
  readonly next: number;
  /** counter slots in use */
  readonly occ: number;
  readonly served: number;
  readonly win: boolean;
}

/** Compact solver state: items taken per column + an interned kitchen. */
export interface TState {
  ptr: number[];
  k: number;
}

/** Why a column can't be taken (for the UI): see TacoRules.refusal. */
export type TacoRefusal = 'empty' | 'lid' | 'frozen' | 'full' | 'fit';

/** Rule variants of the design research, used only by the generator's teaching filters. */
export interface TacoVariant {
  /** 'old': the OLDEST open container receives (as first proposed); default 'new' */
  route?: 'new' | 'old';
  /** false: a container never scoops loose fillings (a loose filling is a dead end) */
  absorb?: boolean;
}

export type TacoLevel = Pick<LevelDef, 'columns' | 'slots' | 'seats' | 'orders' | 'lids' | 'toppings' | 'frozen'>;

interface Ticket {
  c: number;
  exact: number[];
  /** item index of the filling that must go in last, or -1 */
  top: number;
}

export class TacoRules implements Rules<TState> {
  readonly cols: number[][];
  readonly slots: number;
  readonly nseats: number;
  /** dish index per order */
  readonly orders: number[];
  readonly lids: number[] | null;
  /** frozen tiles: per column and row, the take count they thaw at (see pantry.ts) */
  readonly thaw: number[][] | null;
  readonly length: number;
  /** per dish index (TACO_DISHES): container, exact fillings, topping */
  readonly tickets: Ticket[];
  readonly hasToppings: boolean;
  readonly route: 'new' | 'old';
  readonly absorb: boolean;
  /** does the level have tortillas / wraps at all (the loose row may only be scooped by those) */
  private readonly hasC: boolean[];
  private readonly kit = new Map<string, number>();
  /** interned kitchens; TState.k indexes this */
  readonly kinfo: TKitchen[] = [];
  /** (kitchen, item) -> resulting kitchen * 2 + dead */
  private readonly rc = new Map<number, number>();
  private readonly dmemo = new Map<string, boolean>();

  constructor(level: TacoLevel, slots?: number, variant: TacoVariant = {}) {
    this.cols = level.columns.map((c) => c.map(tacoIndex));
    this.slots = slots ?? level.slots;
    this.nseats = level.seats;
    this.orders = level.orders.map(tacoDish);
    this.lids = level.lids && level.lids.some((x) => x > 0) ? level.lids.slice() : null;
    this.thaw = thawTable(level);
    this.length = this.cols.reduce((a, c) => a + c.length, 0);
    const tops = level.toppings ?? {};
    this.tickets = TACO_DISHES.map((d, i) => ({ ...COMPILED[i], top: tops[d] ? tacoIndex(tops[d]!) : -1 }));
    this.hasToppings = this.tickets.some((t) => t.top >= 0);
    this.route = variant.route ?? 'new';
    this.absorb = variant.absorb ?? true;
    this.hasC = [0, 1].map((c) => this.cols.some((col) => col.includes(TORTILLA + c)));
  }

  // ------------------------------------------------------------------------------- tickets

  /** Can a container (c, sorted fillings f, last filling) still become dish d? */
  fits(d: number, c: number, f: readonly number[], last: number): boolean {
    const t = this.tickets[d];
    if (t.c !== c) return false;
    const full = f.length === CAP[c];
    if (full ? !sameList(f, t.exact) : !submultiset(f, t.exact)) return false;
    if (t.top < 0) return true;
    // topping last: it closes the container, so it can't be in a half-made one yet
    return full ? last === t.top : count(f, t.top) < count(t.exact, t.top);
  }

  /** Dish index of a full container's exact filling set, or -1. */
  dishOf(c: number, f: readonly number[]): number {
    for (let d = 0; d < this.tickets.length; d++) if (this.tickets[d].c === c && sameList(this.tickets[d].exact, f)) return d;
    return -1;
  }

  /** A folded container; its last filling is kept only when its dish has a topping (canonical). */
  closedBox(c: number, f: readonly number[], last: number): Box {
    const d = this.dishOf(c, f);
    return makeBox(c, f, d >= 0 && this.tickets[d].top >= 0 ? last : -1);
  }

  // ------------------------------------------------------------------------------- kitchens

  /** Interns a kitchen (closed boxes in any order) and returns its index. */
  intern(opens: Box[], closed: Box[], loose: number[], raws: number[], seats: number[], next: number): number {
    closed.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    let key = '';
    for (const b of opens) key += b.code + ',';
    key += '/';
    for (const b of closed) key += b.code + ',';
    key += '/' + loose.join('') + '/' + raws.join('') + '/';
    for (const d of seats) key += String.fromCharCode(66 + d);
    key += next;
    let k = this.kit.get(key);
    if (k === undefined) {
      k = this.kinfo.length;
      this.kit.set(key, k);
      let seated = 0;
      for (const d of seats) if (d >= 0) seated++;
      const served = next - seated;
      this.kinfo.push({
        opens, closed, loose, raws, seats, next,
        occ: opens.length + closed.length + loose.length + raws[0] + raws[1] + raws[2] + raws[3],
        served,
        win: next === this.orders.length && served === next,
      });
    }
    return k;
  }

  startKitchen(): number {
    const seats: number[] = [];
    for (let i = 0; i < this.nseats; i++) seats.push(i < this.orders.length ? this.orders[i] : -1);
    return this.intern([], [], [], [0, 0, 0, 0], seats, Math.min(this.nseats, this.orders.length));
  }

  /** Kitchen after item `it` lands (resolved), and whether it is a dead end (the guard refuses it). */
  drop(k: number, it: number): { k: number; dead: boolean } {
    const key = k * 16 + it;
    let v = this.rc.get(key);
    if (v === undefined) {
      const k2 = this.resolve(this.kinfo[k], it);
      v = k2 * 2 + (this.isDead(this.kinfo[k2]) ? 1 : 0);
      this.rc.set(key, v);
    }
    return { k: v >> 1, dead: (v & 1) === 1 };
  }

  private resolve(K: TKitchen, item: number): number {
    const opens = K.opens.slice();
    const closed = K.closed.slice();
    const loose = K.loose.slice();
    const raws = K.raws.slice();
    const seats = K.seats.slice();
    let next = K.next;
    const orders = this.orders;

    // serve seat i: the next guest sits down and takes a waiting container at once if it fits
    const serve = (i: number): void => {
      for (;;) {
        if (next >= orders.length) {
          seats[i] = -1;
          return;
        }
        const t = (seats[i] = orders[next++]);
        const j = closed.findIndex((b) => this.fits(t, b.c, b.f, b.last));
        if (j < 0) return;
        closed.splice(j, 1);
      }
    };
    const close = (c: number, f: number[], last: number): void => {
      for (let i = 0; i < seats.length; i++) {
        if (seats[i] >= 0 && this.fits(seats[i], c, f, last)) {
          serve(i);
          return;
        }
      }
      closed.push(this.closedBox(c, f, last));
    };
    const add = (x: number): void => {
      if (!opens.length) {
        loose.push(x);
        return;
      }
      const k = this.route === 'old' ? 0 : opens.length - 1;
      const b = opens[k];
      const f = insertSorted(b.f, x);
      if (f.length === CAP[b.c]) {
        opens.splice(k, 1);
        close(b.c, f, x);
      } else opens[k] = makeBox(b.c, f, -1);
    };

    if (item >= TORTILLA) {
      const c = item - TORTILLA;
      let f: number[] = [];
      let last = -1;
      if (this.absorb && loose.length) {
        const take = loose.splice(0, CAP[c]);
        f = take.slice().sort((a, b) => a - b);
        last = take[take.length - 1];
      }
      if (f.length === CAP[c]) close(c, f, last);
      else opens.push(makeBox(c, f, -1));
    } else if (item >= TOMATO) {
      raws[item - TOMATO]++;
      if (raws[0] && raws[1]) {
        raws[0]--;
        raws[1]--;
        add(SALSA);
      } else if (raws[2] && raws[3]) {
        raws[2]--;
        raws[3]--;
        add(GUAC);
      }
    } else add(item);
    return this.intern(opens, closed, loose, raws, seats, next);
  }

  /** Remaining tickets (seated + queued) as dish indices. */
  private remaining(K: TKitchen): number[] {
    const rem: number[] = [];
    for (const d of K.seats) if (d >= 0) rem.push(d);
    for (let i = K.next; i < this.orders.length; i++) rem.push(this.orders[i]);
    return rem;
  }

  /** Visible dead end: a container (or the loose row, scooped) can't become a distinct remaining ticket. */
  isDead(K: TKitchen): boolean {
    const rem = this.remaining(K).sort((a, b) => a - b);
    let key = '';
    for (const b of K.opens) key += b.code + ',';
    key += '/';
    for (const b of K.closed) key += b.code + ',';
    key += '/' + K.loose.join('') + '/' + rem.join(',');
    let v = this.dmemo.get(key);
    if (v === undefined) {
      const items: Box[] = [...K.opens, ...K.closed];
      if (!K.loose.length) v = !this.assign(items, rem);
      else if (!this.absorb) v = true;
      else v = !this.looseOk(items, K.loose, 0, rem);
      this.dmemo.set(key, v);
    }
    return v;
  }

  /** Can the loose row (from `from` on) be scooped by future containers into valid ones? */
  private looseOk(items: Box[], loose: readonly number[], from: number, rem: number[]): boolean {
    if (from >= loose.length) return this.assign(items, rem);
    for (let c = 0; c < 2; c++) {
      if (!this.hasC[c]) continue;
      const g = loose.slice(from, from + CAP[c]);
      items.push(makeBox(c, g.slice().sort((a, b) => a - b), g[g.length - 1]));
      const ok = this.looseOk(items, loose, from + CAP[c], rem);
      items.pop();
      if (ok) return true;
    }
    return false;
  }

  /** Bipartite matching: every container gets a distinct remaining ticket it can still become. */
  private assign(items: readonly Box[], rem: readonly number[]): boolean {
    if (!items.length) return true;
    if (items.length > rem.length) return false;
    const edges = items.map((b) => {
      const out: number[] = [];
      for (let j = 0; j < rem.length; j++) if (this.fits(rem[j], b.c, b.f, b.last)) out.push(j);
      return out;
    });
    const owner = new Array<number>(rem.length).fill(-1);
    const aug = (i: number, seen: boolean[]): boolean => {
      for (const j of edges[i]) {
        if (seen[j]) continue;
        seen[j] = true;
        if (owner[j] < 0 || aug(owner[j], seen)) {
          owner[j] = i;
          return true;
        }
      }
      return false;
    };
    for (let i = 0; i < items.length; i++) {
      if (!edges[i].length || !aug(i, new Array<boolean>(rem.length).fill(false))) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------------------- Rules<TState>

  start(): TState {
    return { ptr: this.cols.map(() => 0), k: this.startKitchen() };
  }

  kitchen(s: TState): TKitchen {
    return this.kinfo[s.k];
  }

  /** Item index on top of a column, or -1. */
  top(s: TState, col: number): number {
    const c = this.cols[col];
    return s.ptr[col] < c.length ? c[s.ptr[col]] : -1;
  }

  served(s: TState): number {
    return this.kinfo[s.k].served;
  }

  occupancy(s: TState): number {
    return this.kinfo[s.k].occ;
  }

  /** Why column `col` can't be taken, or null if it can. */
  refusal(s: TState, col: number): TacoRefusal | null {
    const p = s.ptr[col];
    const c = this.cols[col];
    if (p >= c.length) return 'empty';
    const K = this.kinfo[s.k];
    if (this.lids && this.lids[col] > K.served) return 'lid';
    if (this.thaw && this.thaw[col][p] > takesOf(s.ptr)) return 'frozen';
    const { k, dead } = this.drop(s.k, c[p]);
    if (K.occ >= this.slots && this.kinfo[k].occ > this.slots) return 'full';
    return dead ? 'fit' : null;
  }

  private after(s: TState, col: number): TState | null {
    const p = s.ptr[col];
    const c = this.cols[col];
    if (p >= c.length) return null;
    const K = this.kinfo[s.k];
    if (this.lids && this.lids[col] > K.served) return null;
    if (this.thaw && this.thaw[col][p] > takesOf(s.ptr)) return null;
    const { k, dead } = this.drop(s.k, c[p]);
    if (dead || (K.occ >= this.slots && this.kinfo[k].occ > this.slots)) return null;
    const ptr = s.ptr.slice();
    ptr[col] = p + 1;
    return { ptr, k };
  }

  moves(s: TState): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cols.length; i++) if (this.after(s, i)) out.push(i);
    return out;
  }

  successors(s: TState): [number, TState][] {
    const out: [number, TState][] = [];
    for (let i = 0; i < this.cols.length; i++) {
      const n = this.after(s, i);
      if (n) out.push([i, n]);
    }
    return out;
  }

  play(s: TState, col: number): TState {
    const n = this.after(s, col);
    if (!n) throw new Error(`illegal move: column ${col}`);
    return n;
  }

  isWin(s: TState): boolean {
    return this.kinfo[s.k].win;
  }

  key(s: TState): string {
    let out = '';
    for (const p of s.ptr) out += String.fromCharCode(48 + p);
    return out + '|' + s.k;
  }
}

// ---------------------------------------------------------------------------------------------
// Play simulation

/** What a counter slot holds (for the view). */
export type TacoSlot =
  /** a filling waiting loose; `scoop` = its place in the scoop queue (0 = the next container takes it first) */
  | { kind: 'loose'; item: FoodId; scoop: number }
  /** a prep half waiting for its partner (tomato + onion = salsa, avocado + lime = guacamole) */
  | { kind: 'half'; item: FoodId; partner: FoodId; makes: FoodId }
  /**
   * an open container (tortilla or wrap) with the fillings already in it, in drop order;
   * `receiving`: the newest open container, where the next filling goes; `can`: the remaining
   * dishes it can still become (ghost icons)
   */
  | { kind: 'open'; item: FoodId; fill: FoodId[]; cap: number; receiving: boolean; can: DishId[] }
  /** a folded taco / burrito waiting for its guest */
  | { kind: 'taco'; item: FoodId; fill: FoodId[]; dish: DishId };

type Entry =
  | { k: 'loose'; item: FoodId; seq: number }
  | { k: 'half'; item: FoodId; seq: number }
  | { k: 'open'; item: FoodId; fill: FoodId[]; seq: number }
  | { k: 'taco'; item: FoodId; fill: FoodId[]; dish: DishId; seq: number };

export interface TacoSnapshot {
  ptr: number[];
  entries: (Entry | null)[];
  seats: (DishId | null)[];
  next: number;
  served: number;
  extra: number;
  seq: number;
  status: Status;
  history: number[];
}

const copyEntry = (e: Entry | null): Entry | null => (e ? ({ ...e, ...('fill' in e ? { fill: e.fill.slice() } : {}) } as Entry) : null);

/**
 * Play simulation for taco kitchens: same rules as TacoRules, plus counter slot positions for the
 * animations. Items keep their slot once placed (a new item lands on the leftmost free slot; on a
 * full counter it lands on the extra spot past the last slot and must resolve). The rules' order
 * (receiving = newest open container, scoop = arrival order) is tracked by arrival numbers;
 * slotInfo() tells the view which container receives and in which order loose fillings get scooped.
 */
export class TacoSim {
  readonly level: LevelDef;
  ptr: number[];
  /** what each slot shows (containers show their container item; see slotInfo for details) */
  counter: (FoodId | null)[];
  seats: (DishId | null)[];
  next: number;
  served = 0;
  status: Status = 'playing';
  history: number[] = [];
  private entries: (Entry | null)[];
  private extra = 0;
  private seq = 0;
  private rules: TacoRules;
  private plain: TacoRules | null = null;
  /** what the player knows: lifted cloches stay lifted (not part of snapshots) */
  readonly cloches: ClocheMarks;

  constructor(level: LevelDef) {
    this.level = level;
    this.rules = new TacoRules(level);
    this.cloches = new ClocheMarks(level);
    this.ptr = level.columns.map(() => 0);
    this.counter = new Array<FoodId | null>(level.slots).fill(null);
    this.entries = new Array<Entry | null>(level.slots).fill(null);
    this.seats = [];
    for (let i = 0; i < level.seats; i++) this.seats.push(level.orders[i] ?? null);
    this.next = Math.min(level.seats, level.orders.length);
  }

  get slots(): number {
    return this.level.slots + this.extra;
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

  covered(col: number, row: number): boolean {
    return this.cloches.covered(col, row);
  }

  thawLeft(col: number, row: number): number {
    const at = this.rules.thaw?.[col]?.[row] ?? 0;
    return at > 0 ? Math.max(0, at - takesOf(this.ptr)) : 0;
  }

  queue(): DishId[] {
    return this.level.orders.slice(this.next);
  }

  /** The filling that must go last into `dish` (twist "topping last"), if any. */
  topping(dish: DishId): FoodId | null {
    return this.level.toppings?.[dish] ?? null;
  }

  // ------------------------------------------------------------------------------- views

  /** Slot of the receiving container (the newest open one), or null. */
  receivingSlot(): number | null {
    let best = -1;
    let at: number | null = null;
    this.entries.forEach((e, i) => {
      if (e?.k === 'open' && e.seq > best) {
        best = e.seq;
        at = i;
      }
    });
    return at;
  }

  /** What counter slot i holds, or null if it is free. */
  slotInfo(i: number): TacoSlot | null {
    const e = this.entries[i];
    if (!e) return null;
    switch (e.k) {
      case 'loose': {
        const scoop = this.slotsOf('loose').indexOf(i);
        return { kind: 'loose', item: e.item, scoop };
      }
      case 'half': {
        const h = PREP_HALF[e.item]!;
        return { kind: 'half', item: e.item, partner: h.partner, makes: h.makes };
      }
      case 'open': {
        const r = this.rules;
        const c = CONTAINERS.indexOf(e.item);
        const f = e.fill.map(tacoIndex).sort((a, b) => a - b);
        const rem = new Set<DishId>([...this.seats.filter((d): d is DishId => !!d), ...this.queue()]);
        const can = [...rem].filter((d) => r.fits(tacoDish(d), c, f, -1));
        return { kind: 'open', item: e.item, fill: e.fill.slice(), cap: capacityOf(e.item), receiving: this.receivingSlot() === i, can };
      }
      case 'taco':
        return { kind: 'taco', item: e.item, fill: e.fill.slice(), dish: e.dish };
    }
  }

  /** Slots holding entries of a kind, in arrival order. */
  private slotsOf(kind: Entry['k']): number[] {
    const out: number[] = [];
    this.entries.forEach((e, i) => {
      if (e?.k === kind) out.push(i);
    });
    return out.sort((a, b) => this.entries[a]!.seq - this.entries[b]!.seq);
  }

  // ------------------------------------------------------------------------------- rules view

  /** Compact state for the solver (current slot count included). */
  state(): TState {
    return { ptr: this.ptr.slice(), k: this.kitchenIn(this.currentRules()) };
  }

  private kitchenIn(r: TacoRules): number {
    const opens: Box[] = [];
    const closed: Box[] = [];
    const loose: number[] = [];
    const raws = [0, 0, 0, 0];
    for (const i of this.slotsOf('open')) {
      const e = this.entries[i] as Extract<Entry, { k: 'open' }>;
      opens.push(makeBox(CONTAINERS.indexOf(e.item), e.fill.map(tacoIndex).sort((a, b) => a - b), -1));
    }
    for (const i of this.slotsOf('taco')) {
      const e = this.entries[i] as Extract<Entry, { k: 'taco' }>;
      const f = e.fill.map(tacoIndex);
      closed.push(r.closedBox(CONTAINERS.indexOf(e.item), f.slice().sort((a, b) => a - b), f[f.length - 1]));
    }
    for (const i of this.slotsOf('loose')) loose.push(tacoIndex(this.entries[i]!.item));
    for (const i of this.slotsOf('half')) raws[tacoIndex(this.entries[i]!.item) - TOMATO]++;
    const seats = this.seats.map((d) => (d ? tacoDish(d) : -1));
    return r.intern(opens, closed, loose, raws, seats, this.next);
  }

  currentRules(): TacoRules {
    if (this.rules.slots !== this.slots) this.rules = new TacoRules(this.level, this.slots);
    return this.rules;
  }

  canTake(col: number): boolean {
    return this.status === 'playing' && this.currentRules().moves(this.state()).includes(col);
  }

  legalMoves(): number[] {
    return this.status === 'playing' ? this.currentRules().moves(this.state()) : [];
  }

  /**
   * Why a column is dimmed: 'empty', 'lid', 'full' (no free slot and the item wouldn't resolve),
   * 'fit' (it would make a taco nobody ordered), 'topping' (it is a marked topping that can't go
   * in yet), or null if it can be taken.
   */
  whyNot(col: number): TacoRefusal | 'topping' | null {
    if (this.status === 'won') return 'empty';
    const r = this.currentRules();
    const why = r.refusal(this.state(), col);
    if (why !== 'fit' || !r.hasToppings) return why;
    if (!this.plain || this.plain.slots !== this.slots) this.plain = new TacoRules({ ...this.level, toppings: undefined }, this.slots);
    return this.plain.refusal({ ptr: this.ptr.slice(), k: this.kitchenIn(this.plain) }, col) === null ? 'topping' : 'fit';
  }

  /** The events taking `col` would produce, without taking it (for a touch-down preview). */
  preview(col: number): SimEvent[] | null {
    const snap = this.snapshot();
    const known = this.cloches.copy();
    const ev = this.take(col);
    this.restore(snap);
    // a preview lifts no cloche
    this.cloches.set(known);
    return ev?.filter((e) => e.t !== 'reveal') ?? null;
  }

  // ------------------------------------------------------------------------------- moves

  private put(i: number, e: Entry | null): void {
    this.entries[i] = e;
    this.counter[i] = e ? e.item : null;
  }

  /** Leftmost free slot, or the extra landing spot past the last slot. */
  private landing(): number {
    const i = this.entries.indexOf(null);
    if (i >= 0) return i;
    this.entries.push(null);
    this.counter.push(null);
    return this.entries.length - 1;
  }

  /** Take the top of a column. Returns the events, or null if the move is not legal. */
  take(col: number): SimEvent[] | null {
    if (!this.canTake(col)) return null;
    const item = this.top(col)!;
    const ev: SimEvent[] = [];
    const recvBefore = this.receivingSlot();
    const lidsBefore = this.openLids();
    this.ptr[col]++;
    this.history.push(col);
    const revealed = this.cloches.reveal(this.ptr);

    if (isContainer(item)) {
      const slot = this.landing();
      const e: Entry = { k: 'open', item, fill: [], seq: this.seq++ };
      this.put(slot, e);
      ev.push({ t: 'take', col, item, slot });
      // it scoops the loose fillings in arrival order
      for (const from of this.slotsOf('loose').slice(0, capacityOf(item))) {
        const it = this.entries[from]!.item;
        this.put(from, null);
        e.fill.push(it);
        ev.push({ t: 'fill', col: null, from, item: it, slot, n: e.fill.length });
      }
      if (e.fill.length === capacityOf(item)) this.fold(slot, ev);
    } else if (PREP_HALF[item]) {
      const slot = this.landing();
      this.put(slot, { k: 'half', item, seq: this.seq++ });
      ev.push({ t: 'take', col, item, slot });
      const h = PREP_HALF[item]!;
      const partner = this.slotsOf('half').find((i) => this.entries[i]!.item === h.partner);
      if (partner !== undefined) {
        // the new half joins the waiting one; the product appears where the waiting one was
        this.put(slot, null);
        this.put(partner, { k: 'loose', item: h.makes, seq: this.seq++ });
        ev.push({ t: 'prep', a: slot, b: partner, slot: partner, item: h.makes });
        this.addFilling(h.makes, null, partner, ev);
      }
    } else this.addFilling(item, col, null, ev);

    // a container left on the extra landing spot moves to a freed slot
    if (this.entries.length > this.slots) {
      const at = this.slots;
      if (this.entries[at]) {
        const to = this.entries.indexOf(null);
        if (to < 0 || to >= this.slots) throw new Error('landing item did not resolve');
        this.put(to, this.entries[at]);
        this.put(at, null);
        ev.push({ t: 'move', from: at, to });
      }
      this.entries.length = this.slots;
      this.counter.length = this.slots;
    }
    const recv = this.receivingSlot();
    if (recv !== recvBefore || ev.some((x) => x.t === 'move' && x.to === recv)) ev.push({ t: 'receive', slot: recv });
    for (const c of revealed) ev.push({ t: 'reveal', col: c, item: this.top(c)! });
    for (const c of this.openLids()) if (!lidsBefore.includes(c)) ev.push({ t: 'lid', col: c });
    if (this.next >= this.level.orders.length && this.seats.every((d) => d === null)) {
      this.status = 'won';
      ev.push({ t: 'win' });
    } else if (this.legalMoves().length === 0) {
      this.status = 'stuck';
      ev.push({ t: 'stuck' });
    }
    return ev;
  }

  /**
   * A filling arrives: from the pantry (`col`) or as a prep product sitting at slot `from`. It drops
   * into the receiving container, or waits loose (a pantry filling on the leftmost free slot, a
   * prep product where it formed).
   */
  private addFilling(item: FoodId, col: number | null, from: number | null, ev: SimEvent[]): void {
    const r = this.receivingSlot();
    if (r === null) {
      if (from === null) {
        const slot = this.landing();
        this.put(slot, { k: 'loose', item, seq: this.seq++ });
        ev.push({ t: 'take', col: col!, item, slot });
      }
      return;
    }
    const e = this.entries[r] as Extract<Entry, { k: 'open' }>;
    if (from !== null) this.put(from, null);
    e.fill.push(item);
    ev.push({ t: 'fill', col, from, item, slot: r, n: e.fill.length });
    if (e.fill.length === capacityOf(e.item)) this.fold(r, ev);
  }

  /** A full container at `slot` folds: served to the leftmost guest who ordered it, or it waits. */
  private fold(slot: number, ev: SimEvent[]): void {
    const e = this.entries[slot] as Extract<Entry, { k: 'open' }>;
    const dish = dishFor(e.item, e.fill);
    if (!dish) throw new Error(`a ${e.item} with ${e.fill.join(', ')} is no dish`);
    const seat = this.seats.indexOf(dish);
    if (seat < 0) {
      this.put(slot, { k: 'taco', item: e.item, fill: e.fill, dish, seq: this.seq++ });
      ev.push({ t: 'fold', slot, dish, seat: null });
      return;
    }
    ev.push({ t: 'fold', slot, dish, seat });
    this.put(slot, null);
    let from = slot;
    let d: DishId = dish;
    for (;;) {
      ev.push({ t: 'serve', seat, dish: d, from: [from] });
      this.served++;
      const order = this.next < this.level.orders.length ? this.next : -1;
      const nd = order >= 0 ? this.level.orders[this.next++] : null;
      this.seats[seat] = nd;
      ev.push({ t: 'seat', seat, dish: nd, order });
      if (!nd) return;
      // a taco already waiting for the new guest is served at once (the first one folded)
      const w = this.slotsOf('taco').find((i) => (this.entries[i] as Extract<Entry, { k: 'taco' }>).dish === nd);
      if (w === undefined) return;
      this.put(w, null);
      from = w;
      d = nd;
    }
  }

  private openLids(): number[] {
    const out: number[] = [];
    this.level.lids?.forEach((k, c) => {
      if (k > 0 && k <= this.served) out.push(c);
    });
    return out;
  }

  /** Booster: one more counter slot for the rest of the level. */
  addSlot(): void {
    this.extra++;
    this.counter.push(null);
    this.entries.push(null);
    if (this.status === 'stuck') this.status = 'playing';
  }

  snapshot(): TacoSnapshot {
    return {
      ptr: this.ptr.slice(), entries: this.entries.map(copyEntry), seats: this.seats.slice(), next: this.next,
      served: this.served, extra: this.extra, seq: this.seq, status: this.status, history: this.history.slice(),
    };
  }

  restore(s: TacoSnapshot): void {
    this.ptr = s.ptr.slice();
    this.entries = s.entries.map(copyEntry);
    this.counter = this.entries.map((e) => (e ? e.item : null));
    this.seats = s.seats.slice();
    this.next = s.next;
    this.served = s.served;
    this.extra = s.extra;
    this.seq = s.seq;
    this.status = s.status;
    this.history = s.history.slice();
  }
}
