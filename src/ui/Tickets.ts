import { DISHES, FOODS, MENUS, type DishId, type FoodId, type Menu } from '../core/content';
import type { PlaySim as Sim } from '../core/sim';
import { icons } from '../render/icons';
import { h } from './dom';
import { t, loc } from '../app/i18n';

interface TicketEl {
  root: HTMLElement;
  dish: DishId | null;
  /** what the ticket shows (dish id, or the burger's layers) — rebuilt when it changes */
  key: string;
  parts: HTMLElement[];
}

function img(src: string, alt = ''): HTMLImageElement {
  return h('img', { attrs: { src, alt, draggable: 'false' } });
}

/**
 * Order tickets: one at each seated guest and a rail with the orders still to come.
 * Combo kitchens show the dish and its parts (ticked when the part is on the counter);
 * burger kitchens show the layers from the top bun down, the next one highlighted.
 */
export class Tickets {
  readonly el: HTMLElement;
  private tickets: TicketEl[] = [];
  private queueEl: HTMLElement;
  private queueList: HTMLElement;
  private onTap: (dish: DishId) => void;
  private menu: Menu = MENUS.trattoria;
  private queueKey = '';
  /** seat geometry and orders the ticket layout was last chosen for */
  private layoutKey = '';

  constructor(root: HTMLElement, onTap: (dish: DishId) => void) {
    this.onTap = onTap;
    this.el = h('div', { class: 'tickets' });
    this.queueList = h('div', { class: 'queue-list' });
    this.queueEl = h('div', { class: 'queue' }, h('span', { class: 'queue-label', text: t('queue') }), this.queueList);
    this.el.append(this.queueEl);
    root.append(this.el);
  }

  private part(id: FoodId): HTMLElement {
    const prep = FOODS[id].kind === 'prep';
    const el = h('span', { class: 'part' + (prep ? ' prep' : ''), attrs: { title: loc(FOODS[id].name) } }, img(icons.food(id), loc(FOODS[id].name)));
    if (prep) {
      // what it is made of, written out under the slot: sauce = tomato + tomato
      const p = this.menu.preps.find((q) => q.out === id);
      if (p) el.append(h('span', { class: 'mini' }, ...p.from.flatMap((f, i) => (i ? [h('i', { text: '+' }), img(icons.food(f), loc(FOODS[f].name))] : [img(icons.food(f), loc(FOODS[f].name))]))));
    }
    return el;
  }

  private makeTicket(seat: number): TicketEl {
    const root = h('div', { class: 'ticket empty' });
    const tk: TicketEl = { root, dish: null, key: '', parts: [] };
    root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (tk.dish) this.onTap(tk.dish);
    });
    root.dataset.seat = String(seat);
    return tk;
  }

  /** Identity of what a seat's ticket shows; a new burger with the same layers still counts as new. */
  private keyOf(sim: Sim, seat: number): string {
    const layers = sim.ticket?.(seat) ?? null;
    // the order's own array: identical layers on a later order still count as a new ticket
    if (layers) return 'order' + (sim.level.tickets?.indexOf(layers) ?? -1);
    return sim.seats[seat] ?? '';
  }

  private fill(tk: TicketEl, sim: Sim, seat: number): void {
    const dish = sim.seats[seat];
    const layers = sim.ticket?.(seat) ?? null;
    tk.dish = dish;
    tk.key = this.keyOf(sim, seat);
    tk.root.replaceChildren();
    tk.root.classList.toggle('empty', !dish);
    tk.root.classList.toggle('burger-ticket', !!layers);
    tk.parts = [];
    if (!dish) return;
    if (layers) {
      // top bun first, like the burger itself
      const stack = h('div', { class: 'layers' });
      for (let k = layers.length - 1; k >= 0; k--) {
        const el = h('span', { class: 'layer' }, img(icons.food(layers[k]), loc(FOODS[layers[k]].name)));
        tk.parts[k] = el;
        stack.append(el);
      }
      tk.root.append(h('div', { class: 'clip' }), stack);
      return;
    }
    const def = DISHES[dish];
    const parts = h('div', { class: 'parts' });
    for (const p of def.parts) {
      const el = this.part(p);
      tk.parts.push(el);
      parts.append(el);
    }
    const pic = img(icons.dish(dish), loc(def.name));
    pic.classList.add('dish');
    tk.root.append(h('div', { class: 'clip' }), pic, parts);
  }

  /** Rebuild for a level (seat count) and show the current orders. */
  reset(sim: Sim): void {
    this.menu = MENUS[sim.level.menu] ?? MENUS.trattoria;
    for (const tk of this.tickets) tk.root.remove();
    this.tickets = sim.seats.map((_, i) => this.makeTicket(i));
    for (const tk of this.tickets) this.el.append(tk.root);
    this.queueKey = '';
    this.update(sim, false);
  }

  /** Reflect the simulation: new orders, ticked parts or stacked layers, the queue. */
  update(sim: Sim, animate = true): void {
    sim.seats.forEach((dish, i) => {
      const tk = this.tickets[i];
      if (!tk) return;
      if (tk.key !== this.keyOf(sim, i) || tk.dish !== dish) {
        this.fill(tk, sim, i);
        if (animate) {
          tk.root.classList.remove('arrive');
          void tk.root.offsetWidth;
          tk.root.classList.add('arrive');
        }
      }
      if (!dish) return;
      if (sim.ticket?.(i)) {
        const done = sim.stacked?.(i) ?? 0;
        tk.parts.forEach((el, k) => {
          el.classList.toggle('ok', k < done);
          el.classList.toggle('next', k === done);
        });
        return;
      }
      // taco kitchens: tick what is already in the tortilla being filled, if it can still become this dish
      const taco = sim as unknown as { receivingSlot?: () => number | null; slotInfo?: (i: number) => { kind: string; fill?: FoodId[]; can?: DishId[] } | null };
      if (taco.receivingSlot) {
        const r = taco.receivingSlot();
        const info = r !== null ? taco.slotInfo?.(r) : null;
        const fits = !!info && info.kind === 'open' && !!info.can?.includes(dish);
        const pool = fits ? (info!.fill ?? []).slice() : [];
        DISHES[dish].parts.forEach((p, j) => {
          const k = pool.indexOf(p);
          const ok = j === 0 ? fits : k >= 0;
          if (j > 0 && k >= 0) pool.splice(k, 1);
          tk.parts[j]?.classList.toggle('ok', ok);
        });
        return;
      }
      // tick parts present on the counter (each counter item ticks one part)
      const pool = sim.counter.filter((x): x is FoodId => !!x);
      DISHES[dish].parts.forEach((p, j) => {
        const k = pool.indexOf(p);
        const ok = k >= 0;
        if (ok) pool.splice(k, 1);
        tk.parts[j]?.classList.toggle('ok', ok);
      });
    });
    const q = sim.queue();
    const qt = sim.queuedTickets?.() ?? null;
    const key = qt ? qt.map((x) => x.join(',')).join('|') : q.join(',');
    this.queueEl.classList.toggle('hidden', q.length === 0);
    if (key === this.queueKey) return;
    this.queueKey = key;
    const items = q.map((d, i) => {
      if (qt) {
        const mini = h('span', { class: 'qstack' });
        for (let k = qt[i].length - 1; k >= 0; k--) mini.append(img(icons.food(qt[i][k])));
        return h('span', { class: 'qitem qburger' }, mini, h('b', { text: String(i + 1) }));
      }
      return h('span', { class: 'qitem', attrs: { title: loc(DISHES[d].name) } }, img(icons.dish(d), loc(DISHES[d].name)), h('b', { text: String(i + 1) }));
    });
    this.queueList.replaceChildren(...items);
  }

  /** Follow the guests' heads on screen; tickets shrink when the seats are close together. */
  place(anchor: (seat: number) => { x: number; y: number }, queueTop: number, side = false, ceiling = 0): void {
    this.el.classList.toggle('side', side);
    const pts = this.tickets.map((_, i) => anchor(i));
    let pitch = Infinity;
    for (let i = 1; i < pts.length; i++) pitch = Math.min(pitch, Math.abs(pts[i].x - pts[i - 1].x));
    // fit between the neighbours and under the ceiling (the orders strip)
    const room = Math.min(...pts.map((p) => p.y)) - ceiling - 6;
    const key = `${side}|${Math.round(pitch)}|${Math.round(room)}|${this.tickets.map((tk) => tk.key).join(',')}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.chooseLayout(pitch, room, side);
    }
    const scale = this.fit(pitch, room, side);
    this.tickets.forEach((tk, i) => {
      const p = pts[i];
      tk.root.style.transform = side
        ? `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(0, -50%)`
        : `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    });
    this.queueEl.style.top = `${Math.round(queueTop)}px`;
  }

  /** The scale every ticket is drawn at for these seats. */
  private fit(pitch: number, room: number, side: boolean): number {
    const width = Math.max(...this.tickets.map((tk) => tk.root.offsetWidth || 100));
    const height = Math.max(...this.tickets.map((tk) => tk.root.offsetHeight || 100));
    return side ? Math.max(0.6, Math.min(1, (room + height / 2) / height)) : Math.max(0.5, Math.min(1, (pitch - 8) / width, room / height));
  }

  /** Three-part orders stack their parts two over one when that lets the tickets be drawn larger. */
  private chooseLayout(pitch: number, room: number, side: boolean): void {
    const three = this.tickets.filter((tk) => tk.dish && tk.parts.length === 3 && !tk.root.classList.contains('burger-ticket'));
    for (const tk of this.tickets) tk.root.classList.remove('stacked');
    if (side || !three.length) return;
    const flat = this.fit(pitch, room, side);
    for (const tk of three) tk.root.classList.add('stacked');
    if (this.fit(pitch, room, side) < flat + 0.04) for (const tk of three) tk.root.classList.remove('stacked');
  }

  destroy(): void {
    this.el.remove();
  }
}
