import { h } from './dom';
import { glyph } from './glyphs';
import { openDialog, toast } from './dialogs';
import { dockIcon } from './Hud';
import { t, loc } from '../app/i18n';
import { writeSave, BOOSTERS, type SaveData } from '../app/save';
import { BOOSTER_PRICE } from '../app/rewards';
import { DECOR, decorKey, clothTexture, plateColors, tileTexture, type DecorKind, type DecorItem } from '../render/decor';
import { audio } from '../audio/audio';

type Tab = DecorKind | 'helpers';

/** A small picture of a decor item, drawn from the same textures the kitchen uses. */
function preview(item: DecorItem): HTMLElement {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  const img = (tex: { image?: unknown } | null) => (tex?.image instanceof HTMLCanvasElement ? tex.image : null);
  if (item.kind === 'cloth') {
    const src = img(clothTexture(item.id, '#e2483d'));
    g.save();
    g.beginPath();
    g.arc(48, 48, 44, 0, Math.PI * 2);
    g.clip();
    if (src) g.drawImage(src, 0, 0, 96, 96);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(48, 48, 44, 0, Math.PI * 2);
    g.stroke();
  } else if (item.kind === 'plate') {
    const [plate, rim] = plateColors(item.id, '#fffaf0');
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.ellipse(48, 56, 42, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rim;
    g.beginPath();
    g.ellipse(48, 50, 42, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = plate;
    g.beginPath();
    g.ellipse(48, 50, 33, 23, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    const src = img(tileTexture(item.id));
    const tints = ['#f6b8b0', '#d9c7f0', '#fde6a6', '#c9e8bf'];
    tints.forEach((tint, i) => {
      const x = 8 + (i % 2) * 42;
      const y = 8 + Math.floor(i / 2) * 42;
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(x + 2, y + 4, 38, 38);
      if (src) {
        g.drawImage(src, x, y, 38, 38);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = tint;
        g.fillRect(x, y, 38, 38);
        g.globalCompositeOperation = 'source-over';
      } else {
        g.fillStyle = tint;
        g.beginPath();
        g.roundRect(x, y, 38, 38, 7);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.fillRect(x + 5, y + 4, 28, 5);
      }
    });
  }
  return h('span', { class: 'look-pic' }, c);
}

/** The decor shop: tablecloths, plates and pantry tiles for every kitchen, plus helpers. */
export function openDecorShop(save: SaveData, onSave: () => void, ui: HTMLElement): void {
  let tab: Tab = 'cloth';
  const coins = h('p', { class: 'shop-coins', attrs: { 'aria-live': 'polite' } });
  const tabs = h('div', { class: 'seg shop-tabs decor-tabs', attrs: { role: 'tablist' } });
  const grid = h('div', { class: 'shop-grid', attrs: { role: 'tabpanel' } });
  const defs: [Tab, string][] = [['cloth', t('shopCloths')], ['plate', t('shopPlates')], ['tile', t('shopTiles')], ['helpers', t('shopHelpers')]];
  let updates: (() => void)[] = [];
  const refresh = () => {
    coins.innerHTML = `${glyph('coin', 28)} ${save.coins}`;
    for (const u of updates) u();
  };
  const commit = () => {
    writeSave(save);
    refresh();
    onSave();
  };
  const render = () => {
    grid.replaceChildren();
    updates = [];
    for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    if (tab === 'helpers') {
      for (const b of BOOSTERS) {
        const price = h('span', { class: 'price' });
        const card = h('button', { class: 'look-card' }, h('span', { class: 'look-pic booster-pic', html: dockIcon(b, 72) }), h('span', { class: 'nm', text: t(`booster_${b}`) }), price);
        updates.push(() => void (price.innerHTML = `×${save.boosters[b]} · ${glyph('coin', 18)} ${BOOSTER_PRICE[b]}`));
        card.addEventListener('click', () => {
          if (save.coins < BOOSTER_PRICE[b]) {
            audio.play('invalid');
            toast(ui, t('notEnough'));
            return;
          }
          save.coins -= BOOSTER_PRICE[b];
          save.boosters[b]++;
          audio.play('coin');
          commit();
        });
        grid.append(card);
      }
    } else {
      for (const item of DECOR.filter((d) => d.kind === tab)) {
        const key = decorKey(item);
        const owned = () => item.price === 0 || save.looks.owned.includes(key);
        const inUse = () => save.looks[item.kind] === item.id;
        const price = h('span', { class: 'price' });
        const card = h('button', { class: 'look-card' }, preview(item), h('span', { class: 'nm', text: loc(item.name) }), price);
        updates.push(() => {
          card.classList.toggle('worn', inUse());
          card.classList.toggle('owned', !inUse() && owned());
          price.innerHTML = inUse() ? `${glyph('check', 14)} ${t('inUse')}` : owned() ? t('use') : `${glyph('coin', 18)} ${item.price}`;
        });
        card.addEventListener('click', () => {
          if (!owned()) {
            if (save.coins < item.price) {
              audio.play('invalid');
              toast(ui, t('notEnough'));
              return;
            }
            save.coins -= item.price;
            save.looks.owned.push(key);
            audio.play('unlock');
            toast(ui, t('bought'));
          } else audio.play('button');
          save.looks[item.kind] = item.id;
          commit();
        });
        grid.append(card);
      }
    }
    refresh();
  };
  for (const [id, label] of defs) {
    const b = h('button', { text: label, attrs: { role: 'tab' } });
    b.dataset.tab = id;
    b.addEventListener('click', () => {
      audio.play('button');
      tab = id;
      render();
    });
    tabs.append(b);
  }
  render();
  openDialog({ title: t('shop'), head: 'purple', cls: 'wide shop-dialog', body: [coins, tabs, grid], onClose: () => undefined });
}
