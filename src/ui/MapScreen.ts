import { h, button } from './dom';
import { glyph } from './glyphs';
import { t, loc } from '../app/i18n';
import { THEMES } from '../render/themes';
import type { LevelDef } from '../core/types';
import { icons } from '../render/icons';
import { DISHES, type DishId, type FoodId } from '../core/content';
import { SHIFT_LEN, shiftIndex, shiftOf, type Shift } from '../core/shifts';

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

/** Ingredients lying about each kitchen's stretch of street, rendered from the game's clay models. */
const DECOR: FoodId[][] = [
  ['tomato', 'cheese', 'mushroom', 'onion', 'carrot', 'egg'],
  ['patty', 'lettuce', 'cheese_slice', 'tomato_slice', 'onion_rings', 'bun_top'],
  ['avocado', 'lime', 'corn', 'beans', 'chicken', 'tortilla'],
];

/** One shift's stretch of street, in px. */
const BLOCK = 380;
const PAD_TOP = 170;
const PAD_BOTTOM = 120;
/** Where the five level stops sit along a stretch (0 = its bottom, 1 = its top). */
const STOPS_T = [0.14, 0.32, 0.5, 0.68, 0.86];

const ART = `${import.meta.env.BASE_URL}art/`;

type ShiftState = 'hazy' | 'current' | 'done' | 'open';

/** A painted picture that falls back to another one (and then hides) if it is missing. */
function picture(cls: string, src: string, fallback: string | null): HTMLImageElement {
  const img = h('img', { class: cls, attrs: { src, alt: '', loading: 'lazy', draggable: 'false' } });
  img.addEventListener('error', () => {
    if (fallback && img.getAttribute('src') !== fallback) img.setAttribute('src', fallback);
    else img.classList.add('missing');
  });
  return img;
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
    const X0 = (vw - W) / 2;
    const A = W * 0.2;
    const height = PAD_TOP + count * BLOCK + PAD_BOTTOM;
    const side = (i: number) => (i % 2 ? -1 : 1);
    const xAt = (i: number, f: number) => X0 + W / 2 + side(i) * A * Math.sin(Math.PI * f);
    const yAt = (i: number, f: number) => height - PAD_BOTTOM - (i + f) * BLOCK;

    // each stretch's ground fades into its neighbours: one continuous street, not themed blocks.
    // The storefront's side is plain cream, the painting's own backdrop, so the picture melts
    // into it; the kitchen's tiles stay on the other side of the street.
    const grounds = shifts.map((s, i) => {
      const west = side(i) > 0;
      const mid = X0 + W / 2;
      const flat = h('div', { class: `street-flat ${west ? 'west' : 'east'}`, style: west ? `left:0; width:${mid}px` : `left:${mid}px; right:0` });
      return h('div', { class: 'street-ground', style: `top:${yAt(i, 1) - 80}px; height:${BLOCK + 160}px`, attrs: { 'data-kitchen': THEMES[s.world].id } }, flat);
    });
    const items: HTMLElement[] = [];
    shifts.forEach((s, i) => {
      const theme = THEMES[s.world];
      const state: ShiftState = s.first > d.unlocked && !d.debug ? 'hazy' : d.unlocked >= s.first && d.unlocked <= s.last ? 'current' : s.last < d.unlocked ? 'done' : 'open';
      const sd = side(i);
      // bunting across the street between two lamp posts, where this kitchen's stretch begins
      if (i > 0) {
        items.push(
          h(
            'div',
            { class: `street-garland ${state}`, style: `left:${X0 + W / 2 - 84}px; top:${yAt(i, 0) - 40}px`, attrs: { 'data-kitchen': theme.id } },
            h('span', { class: 'lamp l' }),
            h('span', { class: 'lamp r' }),
            h('span', { class: 'garland' }),
          ),
        );
      }
      items.push(this.storefront(s, d, state, X0 + W / 2 - sd * W * 0.25, yAt(i, 0.53), Math.min(W * 0.56, 240), sd));
      // a painted prop at the kerb and a food sticker across the street
      const prop = picture('street-prop' + (state === 'hazy' ? ' hazy' : ''), `${ART}street/prop-${theme.id}.webp`, null);
      prop.style.cssText = `left:${X0 + W / 2 - sd * W * 0.4 - 36}px; top:${yAt(i, 0.95) - 44}px`;
      items.push(prop);
      const food = DECOR[s.world][(s.visit + i) % DECOR[s.world].length];
      items.push(
        h(
          'span',
          { class: 'map-deco' + (state === 'hazy' ? ' hazy' : ''), style: `left:${X0 + W / 2 + sd * (A + 76)}px; top:${yAt(i, 0.6)}px; transform: rotate(${((i * 53) % 40) - 20}deg)` },
          h('img', { attrs: { src: icons.food(food), alt: '', draggable: 'false' } }),
        ),
      );
      // the five levels: plates on the street in front of the storefront
      STOPS_T.forEach((f, k) => {
        const stop = this.stop(s.first + k, d, theme.id);
        stop.style.left = `${xAt(i, f)}px`;
        stop.style.top = `${yAt(i, f)}px`;
        items.push(stop);
      });
    });

    this.inner.style.height = `${height}px`;
    this.inner.replaceChildren(...grounds, this.road(shifts, vw, height, xAt, yAt), ...items);
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
  private storefront(s: Shift, d: MapData, state: ShiftState, cx: number, cy: number, size: number, sd: number): HTMLElement {
    const theme = THEMES[s.world];
    const front = h(
      'div',
      {
        class: `storefront ${state} ${sd > 0 ? 'west' : 'east'}`,
        style: `left:${cx - size / 2}px; top:${cy - size / 2}px; width:${size}px; height:${size}px`,
        attrs: { 'data-kitchen': theme.id },
      },
      h('span', { class: 'glow' }),
      picture('front-art', `${ART}street/${theme.id}-${storefrontStage(s.visit)}.webp`, `${ART}kitchens/${theme.id}.webp`),
    );
    const earned = Array.from({ length: SHIFT_LEN }, (_, k) => d.stars[s.first + k] ?? 0).reduce((a, b) => a + b, 0);
    const sign = h('div', { class: 'shop-sign' }, h('b', { text: loc(theme.name) }));
    if (s.endless) sign.prepend(h('span', { class: 'sign-mark', html: glyph('sparkle', 18) }));
    sign.append(h('small', { html: state === 'hazy' ? glyph('lock', 15) : `${glyph('star', 15)}<span>${earned}/${SHIFT_LEN * 3}</span>` }));
    front.append(sign);
    return front;
  }

  /** The street: kerb, each kitchen's paving, a zebra crossing where one stretch meets the next. */
  private road(shifts: Shift[], vw: number, height: number, xAt: (i: number, f: number) => number, yAt: (i: number, f: number) => number): HTMLElement {
    const pt = (i: number, f: number) => `${xAt(i, f).toFixed(1)} ${yAt(i, f).toFixed(1)}`;
    const stretch = (i: number) => {
      let p = `M${pt(i, 0)}`;
      for (let k = 1; k <= 24; k++) p += ` L${pt(i, k / 24)}`;
      return p;
    };
    // the street runs on past both ends of the map
    const whole = `M${xAt(0, 0).toFixed(1)} ${height + 40} ` + shifts.map((_, i) => 'L' + stretch(i).slice(1)).join(' ') + ` L${xAt(shifts.length - 1, 1).toFixed(1)} -40`;
    const last = shifts.length - 1;
    const paving =
      `<path class="paving p${shifts[0].world}" d="M${xAt(0, 0).toFixed(1)} ${height + 40} L${pt(0, 0)}"/>` +
      shifts.map((s, i) => `<path class="paving p${s.world}" d="${stretch(i)}"/>`).join('') +
      `<path class="paving p${shifts[last].world}" d="M${pt(last, 1)} L${xAt(last, 1).toFixed(1)} -40"/>`;
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
      `</defs><path class="kerb-edge" d="${whole}"/><path class="kerb" d="${whole}"/>${paving}${lines}${crossings}</svg>`;
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
