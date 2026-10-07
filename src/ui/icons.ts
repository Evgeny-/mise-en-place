import { glyph, type GlyphName } from './glyphs';

export { glyph, type GlyphName } from './glyphs';

/** A glyph for buttons and rows (kept under its old name for existing call sites). */
export function lineIcon(name: GlyphName, size = 24): string {
  return glyph(name, size);
}

/**
 * The game used Fluent Emoji here; every name it asked for now maps to one of our own glyphs.
 * @deprecated use glyph()
 */
const EMOJI_GLYPH = {
  'light-bulb': 'hint',
  coin: 'coin',
  star: 'star',
  locked: 'lock',
  fire: 'fire',
  crown: 'crown',
  sparkles: 'sparkle',
  gear: 'settings',
  'crescent-moon': 'night',
  'lady-beetle': 'debug',
  'fork-and-knife-with-plate': 'fed',
  'bellhop-bell': 'daily',
  'open-book': 'cookbook',
  cook: 'toque',
  'thinking-face': 'pot',
} as const satisfies Record<string, GlyphName>;

export type EmojiName = keyof typeof EMOJI_GLYPH;

/** @deprecated use glyph() */
export function emoji(name: EmojiName, size = 28, cls = ''): string {
  return glyph(EMOJI_GLYPH[name], size, cls);
}
