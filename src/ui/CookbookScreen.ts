import { h } from './dom';
import { glyph } from './glyphs';
import { t, loc } from '../app/i18n';
import { DISHES, FOODS, MENUS, type DishId } from '../core/content';
import { THEMES } from '../render/themes';
import { icons } from '../render/icons';
import { audio } from '../audio/audio';

/** Painting for a dish: every taco shares the taco painting, every burrito the burrito one. */
export function dishArt(id: DishId): string {
  if (id.startsWith('taco_')) return 'taco';
  if (id.startsWith('burrito_')) return 'burrito';
  return id;
}

/** Painted dish (public/art/dishes/<id>.webp) over the 3D icon, which shows if the painting is missing. */
function dishPicture(id: DishId): HTMLElement {
  const box = h('div', { class: 'cb-pic' }, h('img', { class: 'cb-icon', attrs: { src: icons.dish(id), alt: '', draggable: 'false' } }));
  const art = h('img', { class: 'cb-art', attrs: { src: `${import.meta.env.BASE_URL}art/dishes/${dishArt(id)}.webp`, alt: '', loading: 'lazy', draggable: 'false' } });
  art.addEventListener('error', () => art.remove());
  art.addEventListener('load', () => box.classList.add('painted'));
  box.append(art);
  return box;
}

/** Every dish of every kitchen: served ones with their recipe, the rest still a mystery. */
export class CookbookScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;

  constructor(root: HTMLElement, onClose: () => void) {
    const back = h('button', { class: 'btn round white', html: glyph('back', 24), attrs: { 'aria-label': t('close') } });
    back.addEventListener('click', () => {
      audio.play('button');
      onClose();
    });
    this.body = h('div', { class: 'cb-body' });
    this.el = h('div', { class: 'cookbook hidden' }, h('div', { class: 'cb-top' }, back, h('h1', { html: `${glyph('cookbook', 32)} ${t('cookbook')}` })), this.body);
    root.append(this.el);
  }

  show(served: string[]): void {
    this.el.classList.remove('hidden');
    const sections: HTMLElement[] = [];
    THEMES.forEach((theme) => {
      const menu = MENUS[theme.id];
      if (!menu) return;
      const grid = h('div', { class: 'cb-grid' });
      for (const d of menu.dishes) {
        const known = served.includes(d.id);
        const card = h('div', { class: 'cb-card' + (known ? '' : ' unknown') });
        card.append(dishPicture(d.id));
        card.append(h('div', { class: 'cb-name', text: known ? loc(DISHES[d.id].name) : '???' }));
        if (known) {
          const parts = h('div', { class: 'cb-parts' });
          d.parts.forEach((p, i) => {
            if (i) parts.append(h('span', { class: 'rop', text: '+' }));
            parts.append(h('img', { attrs: { src: icons.food(p), alt: loc(FOODS[p].name), title: loc(FOODS[p].name), draggable: 'false' } }));
          });
          card.append(parts);
        }
        grid.append(card);
      }
      const count = menu.dishes.filter((d) => served.includes(d.id)).length;
      sections.push(h('section', { class: 'cb-section', style: `--wc:${theme.ui}`, attrs: { 'data-kitchen': theme.id } }, h('h2', {}, h('span', { text: loc(theme.name) }), h('small', { text: `${count}/${menu.dishes.length}` })), grid));
    });
    this.body.replaceChildren(...sections);
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
