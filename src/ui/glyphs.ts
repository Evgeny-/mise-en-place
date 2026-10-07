/**
 * Mise en Place glyphs: hand-drawn on a 24-unit grid, a 2-unit ink line in currentColor
 * (dark ink on paper, cream ink at night) over flat "tone" fills from the kitchen palette.
 *
 * Elements with class "t" are tone fills (outlined too unless they say stroke="none");
 * class "s" are solid ink (dots, bars); class "hl" a little highlight. On coloured buttons
 * the .mono treatment (ui.css) turns tones into a soft wash of the ink colour.
 */

/** Tone palette: warm, a little chalky, like the clay food. */
export const TONE = {
  butter: '#f7c548',
  gold: '#f0ab2e',
  tomato: '#e8553f',
  terracotta: '#ec8a55',
  basil: '#5bb062',
  cream: '#fff7e6',
  paper: '#f3e3c4',
  peach: '#f9d3ae',
  wood: '#e2ad72',
  sky: '#8fcbe0',
  teal: '#39b3a5',
  plum: '#b48fe0',
  steel: '#dcd6cc',
} as const;

const T = TONE;
const tone = (fill: string, el: string) => el.replace(/^<(\w+)/, `<$1 class="t" fill="${fill}"`);
const solid = (el: string) => el.replace(/^<(\w+)/, '<$1 class="s" fill="currentColor" stroke="none"');
const hl = (d: string) => `<path class="hl" d="${d}" stroke="#fff" stroke-opacity=".75" stroke-width="1.5"/>`;

/** A cog with rounded teeth, computed once. */
function gear(n: number, rOut: number, rIn: number, wOut: number, wIn: number): string {
  const pts: string[] = [];
  const p = (a: number, r: number) => `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const half = Math.PI / n;
    pts.push(p(a - wIn, rIn), p(a - wOut, rOut), p(a + wOut, rOut), p(a + wIn, rIn), p(a + half, rIn - 0.2));
  }
  return 'M' + pts.join('L') + 'Z';
}

const STAR = 'M12 3 14.7 8.8 21 9.6 16.4 13.9 17.6 20.2 12 17.1 6.4 20.2 7.6 13.9 3 9.6 9.3 8.8Z';
const BULB = 'M12 2.8a6.6 6.6 0 0 0-3.9 11.9c.6.5.9 1.1.9 1.8v.5h6v-.5c0-.7.3-1.3.9-1.8A6.6 6.6 0 0 0 12 2.8Z';

export const GLYPHS = {
  // ---------------------------------------------------------------- dock
  undo: tone(T.terracotta, '<path d="M9 4 3 10l6 6v-4h5a2.5 2.5 0 0 1 0 5h-3v4h3a6.5 6.5 0 0 0 0-13H9Z"/>'),
  hint:
    tone(T.butter, `<path d="${BULB}"/>`) +
    hl('M8.9 8.6a3.4 3.4 0 0 1 2.4-2.5') +
    '<path d="M10.3 13.3 12 11.2l1.7 2.1" stroke-width="1.4"/><path d="M9.5 19.4h5M10.6 21.8h2.8"/>' +
    '<path d="M2.6 4.3 4 5.5M21.4 4.3 20 5.5M1.4 10h1.8M22.6 10h-1.8" stroke-width="1.6"/>',
  slot:
    tone(T.wood, '<rect x="1.6" y="12" width="15.4" height="9.6" rx="3"/>') +
    tone(T.cream, '<ellipse cx="9.3" cy="16.8" rx="4.3" ry="2.6" stroke-width="1.5"/>') +
    tone(T.basil, '<circle cx="18.6" cy="7" r="4.5"/>') +
    '<path d="M18.6 5v4M16.6 7h4" stroke-width="1.8"/>',
  recipes:
    tone(T.cream, '<rect x="2.8" y="3" width="15" height="18.4" rx="2.2"/>') +
    tone(T.tomato, '<path d="M2.8 9V5.2A2.2 2.2 0 0 1 5 3h10.6a2.2 2.2 0 0 1 2.2 2.2V9Z"/>') +
    '<path d="M6 12.6h8.4M6 15.6h8.4M6 18.6h4.6" stroke-width="1.5"/>' +
    tone(T.wood, '<ellipse cx="19.4" cy="8.4" rx="2.5" ry="3.4" stroke-width="1.7"/>') +
    '<path d="M19.4 11.8 19 21.4" stroke-width="2.2"/>',

  // ---------------------------------------------------------------- hud
  pause: solid('<rect x="6.2" y="5" width="4" height="14" rx="1.6"/>') + solid('<rect x="13.8" y="5" width="4" height="14" rx="1.6"/>'),
  home:
    tone(T.peach, '<path d="M5.5 10 12 4.6l6.5 5.4V20h-13Z" stroke="none"/>') +
    tone(T.tomato, '<path d="M10 20v-4.4a2 2 0 0 1 4 0V20"/>') +
    '<path d="M3.2 11.6 12 4l8.8 7.6"/><path d="M5.5 9.8V20h13V9.8"/><path d="M15.8 7.3V3.8h2.4v5.5"/>',
  fed:
    tone(T.cream, '<circle cx="12" cy="12.4" r="6.4"/>') +
    tone(T.paper, '<circle cx="12" cy="12.4" r="3.7" stroke-width="1.4"/>') +
    '<path d="M2.8 4.2v3.6a1.4 1.4 0 0 0 2.8 0V4.2M4.2 4.2V20" stroke-width="1.6"/>' +
    '<path d="M19.8 20V4.2c1.5.7 2.1 3 2.1 5.6 0 1.2-.7 1.8-2.1 1.8" stroke-width="1.6"/>',

  // ---------------------------------------------------------------- map & top bar
  star: tone(T.butter, `<path d="${STAR}"/>`) + hl('M9.1 11.2l1.4-.3'),
  coin:
    tone(T.gold, '<circle cx="12" cy="12" r="8.6"/>') +
    '<circle cx="12" cy="12" r="5.4" stroke-width="1.5"/><path d="M12 9.6v4.8" stroke-width="1.8"/>' +
    hl('M7.4 9.4a5.2 5.2 0 0 1 2.4-2.6'),
  daily:
    tone(T.gold, '<path d="M4.6 16.8a7.4 7.4 0 0 1 14.8 0Z"/>') +
    tone(T.wood, '<rect x="3" y="16.8" width="18" height="3.4" rx="1.7"/>') +
    '<path d="M12 9.4V7.8"/>' + solid('<circle cx="12" cy="6.5" r="1.5"/>') +
    hl('M8.1 14.4a4.6 4.6 0 0 1 2.3-2.5') +
    '<path d="M18.4 5.4 19.8 4M20.2 8.8l1.9-.5" stroke-width="1.6"/>',
  cookbook:
    tone(T.tomato, '<rect x="4.8" y="2.8" width="14.4" height="18" rx="2"/>') +
    '<path d="M8.2 2.8v18"/>' +
    tone(T.cream, '<rect x="10.2" y="6.8" width="6.6" height="4.8" rx="1" stroke-width="1.5"/>') +
    tone(T.butter, '<path d="M14.4 20.8v2.6l1.4-1.1 1.4 1.1v-2.6" stroke-width="1.4"/>'),
  settings: tone(T.sky, `<path d="${gear(8, 9.4, 7, 0.2, 0.3)}"/>`) + tone(T.cream, '<circle cx="12" cy="12" r="3.2"/>'),
  lock:
    '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>' +
    tone(T.gold, '<rect x="5" y="10.5" width="14" height="10.5" rx="2.6"/>') +
    solid('<circle cx="12" cy="15" r="1.5"/>') +
    '<path d="M12 15.8v2" stroke-width="1.7"/>',
  play: solid('<path d="M8 5.3v13.4c0 .8.9 1.3 1.6.8l10.3-6.7c.6-.4.6-1.3 0-1.7L9.6 4.5C8.9 4 8 4.5 8 5.3Z"/>'),
  crown:
    tone(T.gold, '<path d="M3.6 8.4 7.8 13 12 6.2l4.2 6.8 4.2-4.6-1.6 10.4H5.2Z"/>') +
    tone(T.tomato, '<circle cx="12" cy="15.2" r="1.5" stroke-width="1.3"/>') +
    solid('<circle cx="3.6" cy="7.6" r="1.4"/>') + solid('<circle cx="12" cy="4.8" r="1.4"/>') + solid('<circle cx="20.4" cy="7.6" r="1.4"/>'),
  fire:
    tone(T.terracotta, '<path d="M12 2.4c1 3.8 6 5.8 6 11.6a6 6 0 0 1-12 0c0-2.6 1.3-4.4 2.6-5.6.1 1.9.9 3.2 2.1 3.6-.6-3.4-.3-6.8 1.3-9.6Z"/>') +
    tone(T.butter, '<path d="M12 12.4c1.2 1.1 2.3 2.2 2.3 3.8a2.3 2.3 0 0 1-4.6 0c0-1.4 1.1-2.5 2.3-3.8Z" stroke="none"/>'),
  toque:
    tone(T.cream, '<path d="M7 15.2v-3A3.6 3.6 0 0 1 6.6 5.4a4.3 4.3 0 0 1 5.4-1.9 4.3 4.3 0 0 1 5.4 1.9A3.6 3.6 0 0 1 17 12.2v3Z"/>') +
    tone(T.paper, '<rect x="7" y="15.2" width="10" height="4.6" rx="1.2"/>') +
    '<path d="M10 12.2v3M14 12.2v3" stroke-width="1.4"/>',
  sparkle:
    tone(T.butter, '<path d="M11 2.6c.6 5.2 1.8 6.4 7 7-5.2.6-6.4 1.8-7 7-.6-5.2-1.8-6.4-7-7 5.2-.6 6.4-1.8 7-7Z"/>') +
    tone(T.butter, '<path d="M18.6 14.4c.3 2.1.9 2.7 3 3-2.1.3-2.7.9-3 3-.3-2.1-.9-2.7-3-3 2.1-.3 2.7-.9 3-3Z" stroke-width="1.5"/>'),
  map:
    tone(T.cream, '<path d="M3.5 6.5l5-2 7 2.5 5-2v13l-5 2-7-2.5-5 2Z"/>') +
    '<path d="M8.5 4.5v13M15.5 7v13" stroke-width="1.6"/>',

  // ---------------------------------------------------------------- dialogs & settings
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke-width="2.6"/>',
  restart: '<path d="M19 12a7 7 0 1 1-2.05-4.95" stroke-width="2.4"/><path d="M19.5 4.5v4h-4" stroke-width="2.4"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5" stroke-width="2.6"/>',
  forward: '<path d="M9.5 5.5 16 12l-6.5 6.5" stroke-width="2.6"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="2.6"/>',
  ff: solid('<path d="M3.5 6.6v10.8c0 .8.9 1.2 1.5.7l6.6-5.4c.5-.4.5-1.1 0-1.5L5 5.8c-.6-.4-1.5 0-1.5.8Z"/>') + solid('<path d="M12.5 6.6v10.8c0 .8.9 1.2 1.5.7l6.6-5.4c.5-.4.5-1.1 0-1.5L14 5.8c-.6-.4-1.5 0-1.5.8Z"/>'),
  music:
    '<path d="M9.5 18V6.2l10-2.2v12M9.5 10l10-2.2"/>' +
    tone(T.plum, '<ellipse cx="6.5" cy="18" rx="3" ry="2.4"/>') +
    tone(T.plum, '<ellipse cx="16.5" cy="16" rx="3" ry="2.4"/>'),
  sound: tone(T.sky, '<path d="M3.5 9.2h3.6l5-4.2v14l-5-4.2H3.5Z"/>') + '<path d="M15.5 8.8a4.6 4.6 0 0 1 0 6.4M18.4 6a8.6 8.6 0 0 1 0 12"/>',
  night:
    tone(T.butter, '<path d="M19.6 14.6A8.2 8.2 0 1 1 9.4 4.4a7.6 7.6 0 0 0 10.2 10.2Z"/>') +
    '<path d="M18 2.8v3.4M16.3 4.5h3.4" stroke-width="1.5"/>',
  language:
    tone(T.cream, '<path d="M4.5 3.5h8A2.5 2.5 0 0 1 15 6v4.5a2.5 2.5 0 0 1-2.5 2.5H8l-3 2.5V13h-.5A2.5 2.5 0 0 1 2 10.5V6a2.5 2.5 0 0 1 2.5-2.5Z"/>') +
    '<path d="M6.3 10.6l2.2-5 2.2 5M7.1 9h2.8" stroke-width="1.5"/>' +
    tone(T.teal, '<path d="M11.5 10h8a2.5 2.5 0 0 1 2.5 2.5V17a2.5 2.5 0 0 1-2.5 2.5H19V22l-3-2.5h-4.5A2.5 2.5 0 0 1 9 17v-4.5a2.5 2.5 0 0 1 2.5-2.5Z"/>') +
    '<path d="M18.2 17.4v-5h-2a1.45 1.45 0 0 0 0 2.9h2M16.2 15.3l-1.8 2.1" stroke-width="1.5"/>',
  debug:
    '<path d="M10.6 5.2 9 3.4M13.4 5.2 15 3.4M5.6 12.4l-2-.9M5.6 16.4l-2 1M18.4 12.4l2-.9M18.4 16.4l2 1" stroke-width="1.5"/>' +
    tone(T.tomato, '<ellipse cx="12" cy="14" rx="6.6" ry="7"/>') +
    solid('<path d="M8.8 8.4a3.2 3.2 0 0 1 6.4 0Z"/>') +
    '<path d="M12 8.4V21" stroke-width="1.6"/>' +
    solid('<circle cx="9.1" cy="12.2" r="1.2"/>') + solid('<circle cx="14.9" cy="12.2" r="1.2"/>') +
    solid('<circle cx="9.4" cy="16.6" r="1.1"/>') + solid('<circle cx="14.6" cy="16.6" r="1.1"/>'),

  // ---------------------------------------------------------------- illustrations (dialog art)
  pot:
    '<path d="M4.6 14.2H2.6M19.4 14.2h2"/>' +
    tone(T.teal, '<path d="M4.6 12.5h14.8v5a3.8 3.8 0 0 1-3.8 3.8H8.4a3.8 3.8 0 0 1-3.8-3.8Z"/>') +
    tone(T.steel, '<path d="M3.8 12.5a8.2 3.2 0 0 1 16.4 0Z"/>') +
    '<path d="M12 9.3V8"/>' +
    '<path d="M15.8 3.4a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1" stroke-width="1.6"/>' + solid('<circle cx="17.5" cy="7.8" r=".95"/>') +
    '<path d="M8 7.6c-.8-1 .8-1.7 0-2.8" stroke-width="1.4"/>',
  lid:
    tone(T.steel, '<path d="M3 16.5a9 6.5 0 0 1 18 0Z"/>') +
    tone(T.paper, '<rect x="2" y="16.5" width="20" height="3" rx="1.5"/>') +
    '<path d="M12 10V8.6"/>' + tone(T.wood, '<rect x="9.6" y="6.4" width="4.8" height="2.2" rx="1.1" stroke-width="1.6"/>') +
    hl('M6.8 14.2a6 4 0 0 1 3-2.8'),
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** Inline SVG for a glyph; add "mono" to `cls` for a single-colour version on coloured buttons. */
export function glyph(name: GlyphName, size = 24, cls = ''): string {
  return (
    `<svg class="gly g-${name}${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
    `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</g></svg>`
  );
}
