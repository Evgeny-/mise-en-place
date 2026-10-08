import { h, button } from './dom';
import { glyph } from './glyphs';
import { t, loc } from '../app/i18n';
import { THEMES } from '../render/themes';
import type { LevelDef } from '../core/types';
import { icons } from '../render/icons';
import { DISHES, type DishId } from '../core/content';
import { SHIFT_LEN, shiftIndex, shiftOf, type Shift } from '../core/shifts';
import { FRONT_W, FRONT_H, GROUND_BITS, KITCHEN_DECOR, SHARED_DECOR, pieceSize, streetSprite } from './streetArt';

export interface MapCallbacks {
  onPlay(n: number): void;
  onSettings(): void;
  onCookbook(): void;
  onDaily(): void;
  onShop(): void;
}

export interface MapData {
  /** today's daily special is already served */
  dailyDone: boolean;
  unlocked: number;
  stars: Record<number, number>;
  coins: number;
  total: number;
  debug: boolean;
  level(n: number): LevelDef | null;
}

/** Storefront growth stage (1 = a cart … 4 = a lively restaurant) for a kitchen's nth stop on the street. */
export function storefrontStage(visit: number): number {
  return [1, 2, 2, 3, 3, 4, 4, 4][visit - 1] ?? 4;
}

/** One shift's stretch of street, in px. */
const BLOCK = 380;
const PAD_TOP = 170;
const PAD_BOTTOM = 120;
/** Where the five level stops sit along a stretch (0 = its bottom, 1 = its top). */
const STOPS_T = [0.14, 0.32, 0.5, 0.68, 0.86];
/** Kept free on each side of the road's centre line: the kerb, the plates and their badges. */
const CLEAR = 66;
/** Margin from the screen's edges. */
const EDGE = 3;

type ShiftState = 'hazy' | 'current' | 'done' | 'open';
type Pool = 'kitchen' | 'shared' | 'bits';
/**
 * Where a stretch's decorations try to stand: [f along the stretch, on the side the road bulges
 * towards?, pool, extra px beyond the kerb]. Mid-stretch the road swings away from the storefront,
 * so its bulge side only has room for small things on a phone; the far slots fill wide screens and
 * are skipped where they would leave the screen or touch something already standing.
 */
const SLOTS: [number, boolean, Pool, number][] = [
  [0.1, false, 'kitchen', 0],
  [0.9, false, 'kitchen', 0],
  [0.18, true, 'kitchen', 0],
  [0.84, true, 'shared', 0],
  [0.5, true, 'shared', 0],
  [0.66, true, 'kitchen', 0],
  [0.34, true, 'shared', 0],
  [0.02, false, 'shared', 0],
  [0.96, true, 'kitchen', 0],
  [0.3, true, 'kitchen', 110],
  [0.72, true, 'shared', 120],
  [0.16, false, 'kitchen', 170],
  [0.55, false, 'shared', 230],
  [0.84, false, 'kitchen', 170],
  [0.52, true, 'kitchen', 220],
  [0.4, false, 'kitchen', 300],
  [0.12, true, 'shared', 280],
  [0.88, true, 'kitchen', 300],
  [0.05, true, 'bits', 24],
  [0.42, false, 'bits', 6],
  [0.6, true, 'bits', 34],
  [0.97, false, 'bits', 46],
  [0.25, false, 'bits', 70],
  [0.74, false, 'bits', 16],
  [0.45, true, 'bits', 8],
  [0.86, false, 'bits', 90],
  [0.14, false, 'bits', 120],
];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Deterministic noise in [0, 1), so the street looks the same on every visit. */
function hash(a: number, b: number): number {
  let x = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x27d4eb2f);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/**
 * The level map is a food street climbing uphill: every shift of five levels is a stop at one of the
 * kitchens' storefronts, which grow from a cart to a busy restaurant along the way, and its five
 * levels are plates on the street in front of it. Shifts not reached yet stand in the haze.
 */
export class MapScreen {
  readonly el: HTMLElement;
  private scroller: HTMLElement;
  private inner: HTMLElement;
  private top: HTMLElement;
  private data: MapData | null = null;
  visible = false;

  constructor(
    root: HTMLElement,
    private cb: MapCallbacks,
  ) {
    this.scroller = h('div', { class: 'map-scroll' });
    this.inner = h('div', { class: 'map-inner street' });
    this.scroller.append(this.inner);
    this.top = h('div', { class: 'topbar' });
    this.el = h('div', { class: 'map hidden' }, this.scroller, this.top);
    root.append(this.el);
  }

  show(data: MapData): void {
    this.data = data;
    this.visible = true;
    this.el.classList.remove('hidden');
    this.render();
    requestAnimationFrame(() => {
      const cur = this.inner.querySelector('.stop.current') as HTMLElement | null;
      if (!cur) {
        this.scroller.scrollTop = this.scroller.scrollHeight;
        return;
      }
      const y = cur.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top + this.scroller.scrollTop;
      this.scroller.scrollTop = y - this.scroller.clientHeight * 0.55;
    });
  }

  hide(): void {
    this.visible = false;
    this.el.classList.add('hidden');
  }

  render(): void {
    const d = this.data;
    if (!d) return;
    this.renderTopbar(d);

    // the campaign's shifts, then the endless ones reached so far and one more in the haze
    const campaign = Math.ceil(d.total / SHIFT_LEN);
    let count = Math.max(campaign, shiftIndex(d.unlocked) + 1);
    if (d.unlocked > d.total) count++;
    if (d.debug) count = Math.max(count, campaign + 2);
    const shifts: Shift[] = Array.from({ length: count }, (_, i) => shiftOf(i * SHIFT_LEN + 1));

    // the street winds through a column; the ground around it fills the whole width
    const vw = window.innerWidth;
    const W = Math.min(vw, 520);
    const C = vw / 2;
    const A = W * 0.2;
    const height = PAD_TOP + count * BLOCK + PAD_BOTTOM;
    const side = (i: number) => (i % 2 ? -1 : 1);
    const xAt = (i: number, f: number) => C + side(i) * A * Math.sin(Math.PI * f);
    const yAt = (i: number, f: number) => height - PAD_BOTTOM - (i + f) * BLOCK;
    // the road's centre line at any height, also where it runs on past both ends of the map
    const roadX = (y: number) => {
      const t = (height - PAD_BOTTOM - y) / BLOCK;
      const i = Math.floor(t);
      return xAt(i, t - i);
    };
    // everything beside the road is placed by the road's own curve, never on it and never overlapping
    const S = Math.min(1.25, Math.max(1, vw / 420));
    const taken: Box[] = [];
    const fits = (b: Box) => b.x0 >= EDGE && b.x1 <= vw - EDGE && !taken.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    /** a w×h box standing on the ground at y, beside the road (dir 1 east, -1 west), push px beyond the kerb */
    const beside = (y: number, w: number, h: number, dir: number, push: number): Box => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k <= 8; k++) {
        const x = roadX(y - (h * k) / 8);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      const x0 = dir > 0 ? hi + CLEAR + push : lo - CLEAR - push - w;
      return { x0, y0: y - h, x1: x0 + w, y1: y };
    };
    // the lamp posts and bunting where each stretch begins
    for (let i = 1; i < count; i++) taken.push({ x0: C - 92, y0: yAt(i, 0) - 48, x1: C + 92, y1: yAt(i, 0) + 30 });

    const items: HTMLElement[] = [];
    const art: { y: number; svg: string }[] = [];
    let lastUsed = new Set<string>();
    shifts.forEach((s, i) => {
      const theme = THEMES[s.world];
      const state: ShiftState = s.first > d.unlocked && !d.debug ? 'hazy' : d.unlocked >= s.first && d.unlocked <= s.last ? 'current' : s.last < d.unlocked ? 'done' : 'open';
      const sd = side(i);
      // bunting across the street between two lamp posts, where this kitchen's stretch begins
      if (i > 0) {
        items.push(
          h(
            'div',
            { class: `street-garland ${state}`, style: `left:${C - 84}px; top:${yAt(i, 0) - 40}px`, attrs: { 'data-kitchen': theme.id } },
            h('span', { class: 'lamp l' }),
            h('span', { class: 'lamp r' }),
            h('span', { class: 'garland' }),
          ),
        );
      }
      // the storefront stands where the road bends away from it, as close to the kerb as fits
      const yb = yAt(i, 0.3);
      const probe = beside(yb, FRONT_W * S, FRONT_H * S, -sd, 0);
      const room = sd > 0 ? probe.x1 - EDGE : vw - EDGE - probe.x0;
      const fw = Math.max(130, Math.min(FRONT_W * S, room));
      const fb = beside(yb, fw, (fw * FRONT_H) / FRONT_W, -sd, 0);
      const nudge = Math.max(0, EDGE - fb.x0) - Math.max(0, fb.x1 - (vw - EDGE));
      fb.x0 += nudge;
      fb.x1 += nudge;
      const mid = (fb.x0 + fb.x1) / 2;
      taken.push(fb, { x0: mid - 98, y0: fb.y1 - 6, x1: mid + 98, y1: fb.y1 + 30 });
      items.push(this.storefront(s, d, state, fb));
      // the kitchen's own things and the street's shared ones, then grass and pebbles in the gaps
      const used = new Set<string>();
      const pools: Record<Pool, readonly string[]> = { kitchen: KITCHEN_DECOR[s.world], shared: SHARED_DECOR, bits: GROUND_BITS };
      SLOTS.forEach(([f, bulge, pool, push], k) => {
        const list = pools[pool];
        const start = Math.floor(hash(i, k) * list.length);
        // try each piece of the pool, a little further out if the first spot is taken
        search: for (let n = 0; n < list.length * 3; n++) {
          const id = list[(start + n) % list.length];
          if (pool !== 'bits' && (used.has(id) || (pool === 'shared' && lastUsed.has(id)))) continue;
          const p = pieceSize(id);
          const sc = pool === 'bits' ? 1.2 : S;
          const b = beside(yAt(i, f), p.w * sc, p.h * sc, bulge ? sd : -sd, push * S + hash(k, i) * 12 + Math.floor(n / list.length) * 34);
          if (!fits(b)) continue;
          taken.push(b);
          used.add(id);
          const flip = p.flip && hash(i + 31, k) < 0.5 ? ';transform:scaleX(-1)' : '';
          art.push({
            y: b.y1,
            svg: `<svg class="sa${state === 'hazy' ? ' hazy' : ''}" viewBox="0 0 ${p.w} ${p.h}" style="left:${b.x0.toFixed(1)}px;top:${b.y0.toFixed(1)}px;width:${(p.w * sc).toFixed(1)}px;height:${(p.h * sc).toFixed(1)}px${flip}"><use href="#sa-${id}"/></svg>`,
          });
          break search;
        }
      });
      lastUsed = used;
      // the five levels: plates on the street in front of the storefront
      STOPS_T.forEach((f, k) => {
        const stop = this.stop(s.first + k, d, theme.id);
        stop.style.left = `${xAt(i, f)}px`;
        stop.style.top = `${yAt(i, f)}px`;
        items.push(stop);
      });
    });
    // farther things first, so nearer ones overlap them
    art.sort((a, b) => a.y - b.y);

    // one continuous ground that shifts from kitchen to kitchen at the crossings
    const ground = shifts.flatMap((s, i) => {
      const c = `var(--street-${s.world})`;
      return [`${c} ${i ? PAD_BOTTOM + i * BLOCK + 70 : 0}px`, `${c} ${i < count - 1 ? PAD_BOTTOM + (i + 1) * BLOCK - 70 : height}px`];
    });
    this.inner.style.height = `${height}px`;
    this.inner.style.backgroundImage = `var(--veil), linear-gradient(to top, ${ground.join(', ')})`;
    if (!this.el.querySelector('.sa-sprite')) this.el.insertAdjacentHTML('afterbegin', streetSprite());
    this.inner.replaceChildren(this.road(shifts, vw, height, xAt, yAt), h('div', { class: 'street-art', html: art.map((a) => a.svg).join('') }), ...items);
    if (this.visible) requestAnimationFrame(() => this.clampSigns());
  }

  /** Keep every nameplate on screen: one wider than its storefront slides inwards. */
  private clampSigns(): void {
    const vw = window.innerWidth;
    for (const sign of this.inner.querySelectorAll<HTMLElement>('.shop-sign')) {
      sign.style.translate = '';
      const r = sign.getBoundingClientRect();
      const dx = r.left < 6 ? 6 - r.left : r.right > vw - 6 ? vw - 6 - r.right : 0;
      if (dx) sign.style.translate = `${dx.toFixed(1)}px 0`;
    }
  }

  private renderTopbar(d: MapData): void {
    const settings = h('button', { class: 'btn round white', html: glyph('settings', 28), attrs: { 'aria-label': t('settings') } });
    settings.addEventListener('click', () => this.cb.onSettings());
    const book = h('button', { class: 'btn round white', html: glyph('cookbook', 28), attrs: { 'aria-label': t('cookbook') } });
    book.addEventListener('click', () => this.cb.onCookbook());
    const totalStars = Object.values(d.stars).reduce((a, b) => a + b, 0);
    const daily = h('button', { class: 'btn round white daily-btn' + (d.dailyDone ? ' done' : ''), html: glyph('daily', 28), attrs: { 'aria-label': t('daily'), title: t('daily') } });
    if (!d.dailyDone) daily.append(h('span', { class: 'badge-dot' }));
    // the coin balance doubles as the shop button
    const shop = h('button', { class: 'pill coin-shop', html: `${glyph('coin', 26)} ${d.coins}`, attrs: { 'aria-label': t('shop') } });
    shop.addEventListener('click', () => this.cb.onShop());
    daily.addEventListener('click', () => this.cb.onDaily());
    this.top.replaceChildren(h('div', { class: 'pill', html: `${glyph('star', 26)} ${totalStars}` }), h('div', { class: 'right' }, shop, daily, book, settings));
  }

  /** A kitchen's storefront at this stop, grown to its visit, with a nameplate and the shift's stars. */
  private storefront(s: Shift, d: MapData, state: ShiftState, b: Box): HTMLElement {
    const theme = THEMES[s.world];
    const front = h('div', {
      class: `storefront ${state}`,
      style: `left:${b.x0.toFixed(1)}px; top:${b.y0.toFixed(1)}px; width:${(b.x1 - b.x0).toFixed(1)}px; height:${(b.y1 - b.y0).toFixed(1)}px`,
      attrs: { 'data-kitchen': theme.id },
      html: `<span class="glow"></span><svg class="front-art" viewBox="0 0 ${FRONT_W} ${FRONT_H}" aria-hidden="true"><use href="#sa-front-${s.world}-${storefrontStage(s.visit)}"/></svg>`,
    });
    const earned = Array.from({ length: SHIFT_LEN }, (_, k) => d.stars[s.first + k] ?? 0).reduce((a, b) => a + b, 0);
    const sign = h('div', { class: 'shop-sign' }, h('b', { text: loc(theme.name) }));
    if (s.endless) sign.prepend(h('span', { class: 'sign-mark', html: glyph('sparkle', 18) }));
    sign.append(h('small', { html: state === 'hazy' ? glyph('lock', 15) : `${glyph('star', 15)}<span>${earned}/${SHIFT_LEN * 3}</span>` }));
    front.append(sign);
    return front;
  }

  /** The street: a pavement in each kitchen's tiles, kerb, paving, a zebra crossing where one stretch meets the next. */
  private road(shifts: Shift[], vw: number, height: number, xAt: (i: number, f: number) => number, yAt: (i: number, f: number) => number): HTMLElement {
    const pt = (i: number, f: number) => `${xAt(i, f).toFixed(1)} ${yAt(i, f).toFixed(1)}`;
    // a stretch of the curve from f0 to f1; the street runs on past both ends of the map along the
    // same curve (half a stretch below the first stop and above the last), so it leaves the screen
    // as smoothly as it bends everywhere else
    const stretch = (i: number, f0 = 0, f1 = 1) => {
      let p = `M${pt(i, f0)}`;
      for (let k = 1; k <= 24; k++) p += ` L${pt(i, f0 + ((f1 - f0) * k) / 24)}`;
      return p;
    };
    const last = shifts.length - 1;
    const below = stretch(-1, 0.5, 1);
    const above = stretch(last + 1, 0, 0.5);
    const whole = below + ' ' + shifts.map((_, i) => 'L' + stretch(i).slice(1)).join(' ') + ' L' + above.slice(1);
    const run = (cls: string) =>
      `<path class="${cls}${shifts[0].world}" d="${below}"/>` +
      shifts.map((s, i) => `<path class="${cls}${s.world}" d="${stretch(i)}"/>`).join('') +
      `<path class="${cls}${shifts[last].world}" d="${above}"/>`;
    const paving = run('paving p');
    const walks = run('walk w');
    const lines = shifts.map((s, i) => (s.world === 1 ? `<path class="centre-line" d="${stretch(i)}"/>` : '')).join('');
    const crossings = shifts
      .slice(1)
      .map((_, k) => `<path class="crossing" d="M${pt(k, 0.975)} L${pt(k + 1, 0.025)}"/>`)
      .join('');
    const svg =
      `<svg class="road" width="${vw}" height="${height}" aria-hidden="true"><defs>` +
      '<pattern id="cobbles" width="26" height="18" patternUnits="userSpaceOnUse"><rect width="26" height="18" fill="#b9a78d"/><rect x="1" y="1" width="11" height="7" rx="3" fill="#ddd0bb"/><rect x="14" y="1" width="11" height="7" rx="3" fill="#d4c5ad"/><rect x="-6" y="10" width="11" height="7" rx="3" fill="#d6c8b1"/><rect x="7" y="10" width="11" height="7" rx="3" fill="#e0d4c0"/><rect x="20" y="10" width="11" height="7" rx="3" fill="#d2c3aa"/></pattern>' +
      '<pattern id="asphalt" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#c4ccd0"/><circle cx="7" cy="9" r="1.3" fill="#adb6bb"/><circle cx="27" cy="21" r="1.1" fill="#dbe1e4"/><circle cx="16" cy="33" r="1.4" fill="#b2bbc0"/><circle cx="34" cy="5" r="1.1" fill="#adb6bb"/></pattern>' +
      '<pattern id="pavers" width="30" height="16" patternUnits="userSpaceOnUse"><rect width="30" height="16" fill="#f6e2c8"/><rect x="1" y="1" width="13" height="6" rx="1.5" fill="#e8a477"/><rect x="16" y="1" width="13" height="6" rx="1.5" fill="#e19a6c"/><rect x="-7" y="9" width="13" height="6" rx="1.5" fill="#e59f70"/><rect x="8" y="9" width="13" height="6" rx="1.5" fill="#eaa97e"/><rect x="23" y="9" width="13" height="6" rx="1.5" fill="#e29c6e"/></pattern>' +
      '<pattern id="walk0" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#ebc6a2"/><rect x="1" y="1" width="20" height="20" rx="2.5" fill="#f9e5cf"/></pattern>' +
      '<pattern id="walk1" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#f3faf6"/><rect width="12" height="12" fill="#e0f1e8"/><rect x="12" y="12" width="12" height="12" fill="#e0f1e8"/></pattern>' +
      '<pattern id="walk2" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#e6cc9c"/><rect x="1" y="1" width="22" height="22" rx="2.5" fill="#faf0dc"/><circle cx="12" cy="12" r="3.2" fill="#9fd1cb"/><circle cx="12" cy="12" r="1.2" fill="#f2b45a"/></pattern>' +
      `</defs><path class="walk-edge" d="${whole}"/>${walks}<path class="kerb-edge" d="${whole}"/><path class="kerb" d="${whole}"/>${paving}${lines}${crossings}</svg>`;
    return h('div', { class: 'road-wrap', html: svg });
  }

  private stop(n: number, d: MapData, kitchen: string): HTMLElement {
    const lv = d.level(n);
    const open = n <= d.unlocked || d.debug;
    const current = n === d.unlocked;
    const stars = d.stars[n] ?? 0;
    // endless levels are generated on demand; the last of each shift is its rush
    const tier = lv?.tier ?? (n % SHIFT_LEN === 0 ? 'hard' : 'normal');
    const el = h('div', { class: `stop ${tier}` + (open ? ' open' : ' closed') + (current ? ' current' : '') + (stars ? ' done' : '') + (n >= 1000 ? ' d4' : ''), attrs: { 'data-kitchen': kitchen } });
    const btn = button(String(n), 'stop-btn', () => open && this.cb.onPlay(n));
    if (!open) btn.innerHTML = glyph('lock', 24);
    el.append(btn);
    if (stars) el.append(h('div', { class: 'stop-stars', html: [1, 2, 3].map((i) => glyph('star', 17, i <= stars ? '' : 'off')).join('') }));
    if (lv?.intro && lv.intro in DISHES) el.append(h('img', { class: 'stop-dish', attrs: { src: icons.dish(lv.intro as DishId), alt: '' } }));
    if (tier !== 'normal') el.append(h('span', { class: 'stop-tier', html: glyph(tier === 'superhard' ? 'crown' : 'fire', 19), attrs: { title: t(tier === 'superhard' ? 'superhard' : 'hard') } }));
    if (current) el.append(h('div', { class: 'stop-chef', html: glyph('toque', 42) }));
    if (d.debug && lv?.stats) el.append(h('small', { class: 'stop-debug', text: `r${(lv.stats.random * 100).toFixed(1)} la${lv.stats.lookahead} c${lv.stats.critical}` }));
    return el;
  }
}
