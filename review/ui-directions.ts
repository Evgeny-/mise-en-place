/**
 * Review board for the UI identity directions (review/ui-directions.html).
 * The same markup is rendered three times; each direction is a CSS scope (.d-bistro, .d-enamel, .d-chalk).
 */
import { glyph, GLYPHS, type GlyphName } from '../src/ui/glyphs';
import { icons } from '../src/render/icons';
import type { DishId, FoodId } from '../src/core/content';

const food = (id: FoodId) => icons.food(id);
const dish = (id: DishId) => icons.dish(id);
const BASE = import.meta.env.BASE_URL;

interface Dir {
  id: string;
  name: string;
  pitch: string;
  verdict: string;
  /** glyph treatment for icons on coloured buttons */
  head: string;
}

const DIRS: Dir[] = [
  {
    id: 'bistro',
    name: 'A · Carte du jour — bistro menu & order pad',
    pitch: 'Cream menu paper, espresso-ink outlines with a hard printed offset, a hearty serif (Vollkorn) for names and numbers, Futura-like Jost small caps for labels. Dialogs are menu cards under a scalloped awning; tickets are pad slips held by washi tape; prices get dotted menu leaders. Night mode becomes the chalkboard menu.',
    verdict: '<b>Pick.</b> Reads instantly on a phone (ink on paper, highest contrast over every kitchen), sits on the same cream as the clay art, and every motif comes from a real kitchen pass — clearly not Pixel Picnic’s glossy candy.',
    head: 'var(--basil)',
  },
  {
    id: 'enamel',
    name: 'B · Smalto — enamel kitchenware',
    pitch: 'White speckled enamel with navy rolled rims, glossy enamel-mug buttons, a rounded slab (Podkova) on enamel-sign plates with rivets. Very toy-like.',
    verdict: 'Charming and tactile, but the glossy rounded pills drift back towards Pixel Picnic’s chunky candy buttons, the navy rim fights the warm terracotta Trattoria, and the speckle gets noisy at ticket size.',
    head: 'var(--rim)',
  },
  {
    id: 'chalk',
    name: 'C · Lavagna — chalkboard & wood',
    pitch: 'Slate boards in wooden frames, chalk handwriting (Caveat), wooden-block buttons, chalk-dusted glyphs. Cosy café specials board.',
    verdict: 'Most atmospheric, but dark slabs over a bright clay kitchen feel heavy, handwriting hurts readability on small tickets and the dock, and Cyrillic in a chalk hand looks scrappy. Best kept as the night-mode flavour of A.',
    head: 'transparent',
  },
];

function stars(n: number, size: number): string {
  return [1, 2, 3].map((i) => glyph('star', i === 2 ? size + 14 : size, i <= n ? '' : 'off')).join('');
}

function ticket(): string {
  return (
    `<div class="ticket"><div class="clip"></div><img class="dish" src="${dish('pizza')}" alt="">` +
    `<div class="parts"><span class="part ok"><img src="${food('dough')}"></span><span class="part"><img src="${food('sauce')}"></span><span class="part ok"><img src="${food('cheese')}"></span></div></div>`
  );
}

function burgerTicket(): string {
  const layer = (id: FoodId) => `<span style="display:grid;place-items:center;width:40px;height:21px"><img src="${food(id)}" style="width:30px;height:30px;margin:-5px 0"></span>`;
  return `<div class="ticket" style="min-width:56px"><div class="clip"></div>${['bun_top', 'lettuce', 'patty', 'bun_bottom'].map((x) => layer(x as FoodId)).join('')}</div>`;
}

function phone(d: Dir): string {
  const round = (g: GlyphName, extra = '') => `<button class="btn round ${extra}">${glyph(g, 24)}</button>`;
  return `
  <div class="phone" style="background-image:url(./ui-scene-trattoria.jpg)">
    <div class="hud-top">
      <div class="hud-left">${round('pause', 'sq')}${round('home', 'sq')}</div>
      <div class="title sticker"><b class="sticker">Level 12</b><small class="sticker">Trattoria</small></div>
      <div class="chip">${glyph('fed', 24)}<span>2</span><small>/5</small></div>
    </div>
    <div class="queue"><span class="queue-label">Next</span>
      <span class="qitem"><img src="${dish('spaghetti')}"><b>1</b></span><span class="qitem"><img src="${dish('pizza')}"><b>2</b></span><span class="qitem"><img src="${dish('omelette')}"><b>3</b></span>
    </div>
    ${ticket()}
    <div class="toast">Try this one</div>
    <div class="tut">Tap a column to put its top ingredient on the counter</div>
    <div class="dock">
      <button class="booster dim"><span class="bicon">${glyph('undo', 32)}</span><span class="bname">Undo</span></button>
      <button class="booster"><span class="bicon">${glyph('hint', 32)}</span><span class="bname">Hint</span><span class="badge">2</span></button>
      <button class="booster"><span class="bicon">${glyph('slot', 34)}</span><span class="bname">+Spot</span><span class="badge plus">+</span></button>
      <button class="booster"><span class="bicon">${glyph('recipes', 32)}</span><span class="bname">Recipes</span></button>
    </div>
  </div>`;
}

function dialog(d: Dir): string {
  return `
  <div class="dialog-stage" style="background-image:url(./ui-scene-trattoria.jpg)">
    <div class="dialog" style="--head:${d.head}">
      <div class="dialog-head"><small>Level 12 · served</small>Chef’s kiss!</div>
      <button class="btn close-x">${glyph('close', 18)}</button>
      <div class="stars">${stars(3, 58)}</div>
      <p class="subtle">Guests fed: 5</p>
      <div class="reward">
        <div class="reward-line"><span>Level cleared</span><b>+10</b></div>
        <div class="reward-line"><span>Stars</span><b>+5</b></div>
        <div class="reward-line"><span>No undo</span><b>+5</b></div>
      </div>
      <div class="coins">${glyph('coin', 30)} +20</div>
      <div class="actions">
        <button class="btn primary">Next ${glyph('play', 20, 'mono')}</button>
        <button class="btn small">${glyph('map', 20)} Map</button>
      </div>
    </div>
  </div>`;
}

function map(d: Dir): string {
  const pts = [
    { n: 9, x: 120, y: 500, cls: 'done', s: 3 },
    { n: 10, x: 250, y: 400, cls: 'done hard', s: 2 },
    { n: 11, x: 270, y: 280, cls: 'current' },
    { n: 12, x: 150, y: 170, cls: 'locked' },
    { n: 13, x: 210, y: 60, cls: 'locked superhard' },
  ];
  const path = 'M' + pts.map((p) => `${p.x} ${p.y}`).join(' L');
  const stop = (p: (typeof pts)[number]) => {
    const locked = p.cls.includes('locked');
    let html = `<div class="stop ${p.cls}" style="left:${p.x}px;top:${p.y}px"><button class="stop-btn serif">${locked ? glyph('lock', 24) : p.n}</button>`;
    if (p.s) html += `<div class="stop-stars">${[1, 2, 3].map((i) => glyph('star', 17, i <= p.s! ? '' : 'off')).join('')}</div>`;
    if (p.cls.includes('hard') && !p.cls.includes('super')) html += `<span class="stop-badge">${glyph('fire', 22)}</span>`;
    if (p.cls.includes('superhard')) html += `<span class="stop-badge">${glyph('crown', 22)}</span>`;
    if (p.cls.includes('current')) html += `<span class="stop-chef">${glyph('toque', 40)}</span><img class="stop-dish" src="${dish('omelette')}">`;
    return html + '</div>';
  };
  const round = (g: GlyphName) => `<button class="btn round">${glyph(g, 24)}</button>`;
  return `
  <div class="map-mock">
    <div class="topbar">
      <div class="chip">${glyph('star', 22)} 102</div>
      <div class="right"><div class="chip">${glyph('coin', 22)} 50</div>${round('daily')}${round('cookbook')}${round('settings')}</div>
    </div>
    <div class="world-head"><img src="${BASE}art/kitchens/trattoria.webp" alt=""><div class="world-title"><small>Kitchen 1</small><b>Trattoria</b></div></div>
    <div class="path"><svg width="390" height="560"><path d="${path}"/></svg>${pts.map(stop).join('')}</div>
  </div>`;
}

function kit(d: Dir): string {
  const names = Object.keys(GLYPHS) as GlyphName[];
  const grid = (cls: string) => `<div class="icons ${cls}">${names.map((n) => `<span title="${n}">${glyph(n, 28)}</span>`).join('')}</div>`;
  return `
  <div class="kit">
    <div class="row"><button class="btn primary">${glyph('play', 20, 'mono')} Next</button><button class="btn go">${glyph('undo', 20, 'mono')} Undo one move</button></div>
    <div class="row"><button class="btn">${glyph('restart', 20)} Retry</button><button class="btn small">${glyph('home', 20)} Map</button><button class="btn round">${glyph('settings', 24)}</button><button class="btn round sq">${glyph('pause', 22)}</button></div>
    <div class="row"><span class="serif" style="font-size:22px;font-weight:800">Траттория · Шеф-повар! · 38</span></div>
    <div class="ticket-row">${ticket()}${burgerTicket()}</div>
    ${grid('')}
    ${grid('dark')}
  </div>`;
}

document.getElementById('dirs')!.innerHTML = DIRS.map(
  (d) => `
  <section class="dir d-${d.id}">
    <header><h2>${d.name}</h2><p>${d.pitch}</p></header>
    <div class="boards">${phone(d)}<div>${dialog(d)}<p class="cap">Win dialog</p></div>${map(d)}${kit(d)}</div>
    <div class="verdict">${d.verdict}</div>
  </section>`,
).join('');
