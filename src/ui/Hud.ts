import { h } from './dom';
import { glyph } from './glyphs';
import { t } from '../app/i18n';
import type { Tier } from '../core/types';
import { audio } from '../audio/audio';

export type DockButton = 'undo' | 'hint' | 'slot' | 'recipes';
const DOCK: DockButton[] = ['undo', 'hint', 'slot', 'recipes'];

export interface HudCallbacks {
  onPause(): void;
  onHome(): void;
  onDock(b: DockButton): void;
}

export interface DockState {
  /** null = unlimited */
  count: number | null;
  locked: boolean;
  unlockAt: number;
  usable: boolean;
  glow?: boolean;
}

/** The helper's glyph (dock, shop cards, gift cards). */
export function dockIcon(b: DockButton, size = 34): string {
  return glyph(b, size);
}

/** In-game overlay: pause/home, level title, guests served, and the helper dock. */
export class Hud {
  readonly el: HTMLElement;
  private top: HTMLElement;
  private dock: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  private tierEl: HTMLElement;
  private fedEl: HTMLElement;
  private btns = new Map<DockButton, HTMLButtonElement>();
  private tutorialEl: HTMLElement | null = null;
  private handEl: HTMLElement | null = null;
  private debugEl: HTMLElement;
  private sizeObserver: ResizeObserver | null = null;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.el = h('div', { class: 'hud' });
    const pause = h('button', { class: 'btn round', html: glyph('pause', 24), attrs: { 'aria-label': t('paused') } });
    pause.addEventListener('click', () => {
      audio.play('button');
      cb.onPause();
    });
    const home = h('button', { class: 'btn round white home-btn', html: glyph('home', 26), attrs: { 'aria-label': t('toMap') } });
    home.addEventListener('click', () => {
      audio.play('button');
      cb.onHome();
    });
    this.title = h('div', { class: 'level-name' });
    this.sub = h('div', { class: 'level-sub' });
    this.tierEl = h('div', { class: 'tier hidden' });
    this.fedEl = h('div', { class: 'fed' });
    this.debugEl = h('div', { class: 'hud-debug hidden' });
    this.top = h(
      'div',
      { class: 'hud-top' },
      h('div', { class: 'hud-left' }, pause, home),
      h('div', { class: 'hud-title' }, h('div', { class: 'title-row' }, this.title, this.tierEl), this.sub, this.debugEl),
      this.fedEl,
    );
    this.dock = h('div', { class: 'boosters' });
    for (const b of DOCK) {
      const btn = h('button', { class: 'booster b-' + b, attrs: { 'aria-label': t(`booster_${b}`) } });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.unlock();
        cb.onDock(b);
      });
      this.btns.set(b, btn);
      this.dock.append(btn);
    }
    this.el.append(this.top, this.dock);
    root.append(this.el);
  }

  /** `kitchenId` picks the kitchen's accent colours for the HUD and the tickets (base.css). */
  setLevel(n: number, tier: Tier, kitchen: string, kitchenId?: string): void {
    this.title.textContent = t('level', { n });
    this.sub.textContent = kitchen;
    if (kitchenId && this.el.parentElement) this.el.parentElement.dataset.kitchen = kitchenId;
    this.tierEl.className = 'tier ' + tier + (tier === 'normal' ? ' hidden' : '');
    this.tierEl.innerHTML = glyph(tier === 'superhard' ? 'crown' : 'fire', 19);
    this.tierEl.title = tier === 'superhard' ? t('superhard') : t('hard');
  }

  setTitle(text: string): void {
    this.title.textContent = text;
  }

  setFed(served: number, total: number): void {
    const prev = Number(this.fedEl.dataset.served ?? served);
    this.fedEl.dataset.served = String(served);
    if (served > prev) {
      this.fedEl.classList.remove('bump');
      void this.fedEl.offsetWidth;
      this.fedEl.classList.add('bump');
    }
    this.fedEl.innerHTML = `<span class="fed-plate">${glyph('fed', 25)}</span><b>${served}</b><small>/${total}</small>`;
  }

  setDebug(text: string | null): void {
    this.debugEl.classList.toggle('hidden', !text);
    this.debugEl.textContent = text ?? '';
  }

  setDock(state: Record<DockButton, DockState>): void {
    for (const b of DOCK) {
      const btn = this.btns.get(b)!;
      const s = state[b];
      btn.className = `booster b-${b}` + (s.locked ? ' locked' : '') + (!s.locked && !s.usable ? ' dim' : '') + (s.glow ? ' glow' : '');
      const face = `<span class="bicon">${dockIcon(b)}</span><span class="bname">${t(`booster_${b}`)}</span>`;
      if (s.locked) btn.innerHTML = face + glyph('lock', 22, 'lock') + `<span class="lvl">${t('levelShort', { n: s.unlockAt })}</span>`;
      else if (s.count === null) btn.innerHTML = face;
      else btn.innerHTML = face + (s.count > 0 ? `<span class="count">${s.count}</span>` : `<span class="plus">+</span>`);
    }
  }

  dockRect(b: DockButton): DOMRect {
    return this.btns.get(b)!.getBoundingClientRect();
  }

  insets(): { top: number; bottom: number } {
    const top = this.top.getBoundingClientRect();
    const dock = this.dock.getBoundingClientRect();
    return { top: top.bottom + 4, bottom: window.innerHeight - dock.top + 6 };
  }

  banner(text: string, tier: Tier): void {
    const b = h('div', { class: 'banner ' + tier, html: `${glyph(tier === 'superhard' ? 'crown' : 'fire', 36)}<span>${text}</span>` });
    this.el.append(b);
    setTimeout(() => b.remove(), 2200);
  }

  showTutorial(text: string, y: number, hand?: { x: number; y: number }): void {
    this.hideTutorial();
    this.tutorialEl = h('div', { class: 'tutorial', text });
    this.tutorialEl.style.top = `${y}px`;
    this.el.append(this.tutorialEl);
    if (hand) {
      this.handEl = h('div', { class: 'hand', html: HAND_SVG });
      this.handEl.style.left = `${hand.x - 8}px`;
      this.handEl.style.top = `${hand.y - 4}px`;
      this.el.append(this.handEl);
    }
  }

  hideTutorial(): void {
    this.tutorialEl?.remove();
    this.handEl?.remove();
    this.tutorialEl = this.handEl = null;
  }

  observe(cb: () => void): void {
    this.sizeObserver?.disconnect();
    this.sizeObserver = new ResizeObserver(() => cb());
    this.sizeObserver.observe(this.top);
    this.sizeObserver.observe(this.dock);
  }

  destroy(): void {
    this.sizeObserver?.disconnect();
    this.el.remove();
  }
}

/** The tutorial hand, in the same ink-and-paper style as the glyphs. */
const HAND_SVG =
  '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">' +
  '<path d="M22 30V12a5 5 0 0110 0v14l1-1a5 5 0 017 1l1 1a5 5 0 017 2 5 5 0 016 4v12c0 9-7 15-16 15h-4c-6 0-10-3-13-8l-7-12a4.5 4.5 0 017-5z" fill="#fffaf0" stroke="#3b2a20" stroke-width="3.4" stroke-linejoin="round"/>' +
  '<path d="M33 26v8M41 28v7M48 32v5" stroke="#3b2a20" stroke-width="3" stroke-linecap="round"/>' +
  '</svg>';
