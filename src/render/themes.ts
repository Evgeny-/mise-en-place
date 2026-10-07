import type { Text } from '../core/content';
import type { PropKind } from './props';

export type WallDecor = 'trattoria' | 'diner' | 'taqueria' | 'bakery' | 'wok' | 'spice' | 'cafeteria' | 'dimsum';

/** Look of one kitchen (world). */
export interface KitchenTheme {
  id: string;
  name: Text;
  /** scene background behind everything */
  bg: string;
  /** hemisphere light: sky and bounce colours */
  sky: string;
  bounce: string;
  /** the chef's worktop: one counter running from the guests' ledge off the bottom of the screen */
  counter: { kind: 'marble' | 'steel' | 'painted'; base: string; line: string };
  /** the raised serving ledge along the far side of the counter, where the guests eat */
  ledge: { kind: 'wood' | 'formica' | 'tile'; base: string; line: string; trim: string };
  /** kitchen things standing on the worktop: beside the cutting board, then further out */
  props: PropKind[];
  /** what the pantry columns are: wooden produce crates, steel prep pans or clay trays */
  pantry: 'crate' | 'steel' | 'clay';
  /** pantry container colour */
  tray: string;
  /** the house tablecloth colour (placemats) */
  cloth: string;
  /** prep bowls on the cutting board */
  bowl: 'ceramic' | 'steel' | 'clay';
  /** cutting board under the counter slots and the slot plates */
  board: string;
  plate: string;
  /** wall behind the guests */
  wall: { base: string; accent: string; accent2: string; decor: WallDecor };
  /** colour of the UI header pill for this world */
  ui: string;
  /** the kitchen's band: index into SONGS in src/audio/songs.ts (0 trattoria, 1 diner, 2 taqueria, 3 bakery, 4 wok, 5 spice, 6 cafeteria, 7 dimsum) */
  music: number;
}

export const THEMES: KitchenTheme[] = [
  {
    id: 'trattoria',
    name: { en: 'Trattoria', ru: 'Траттория' },
    bg: '#f3dcb8',
    sky: '#fff6e6',
    bounce: '#c7956a',
    counter: { kind: 'marble', base: '#f1ebe2', line: '#b9ada0' },
    ledge: { kind: 'wood', base: '#8a4f30', line: '#4e2a18', trim: '#c9a35f' },
    props: ['oil', 'pepperMill', 'rollingPin', 'candle'],
    pantry: 'crate',
    tray: '#b07a45',
    cloth: '#e2483d',
    bowl: 'ceramic',
    board: '#f0cf98',
    plate: '#fffaf0',
    wall: { base: '#f0d29c', accent: '#7f9a6c', accent2: '#e2483d', decor: 'trattoria' },
    ui: '#e2483d',
    music: 0,
  },
  {
    id: 'diner',
    name: { en: 'Burger Joint', ru: 'Бургерная' },
    bg: '#cdebe0',
    sky: '#f2fffa',
    bounce: '#7fb7a5',
    counter: { kind: 'steel', base: '#d3d9dc', line: '#8d969b' },
    ledge: { kind: 'formica', base: '#f6efe4', line: '#e8484a', trim: '#dfe4e7' },
    props: ['sauces', 'shakers', 'spatula', 'napkins'],
    pantry: 'steel',
    tray: '#c9d1d6',
    cloth: '#e8484a',
    bowl: 'steel',
    board: '#f2d7a6',
    plate: '#ffffff',
    wall: { base: '#d9f1e8', accent: '#e8484a', accent2: '#ffffff', decor: 'diner' },
    ui: '#2fa38a',
    music: 1,
  },
  {
    id: 'taqueria',
    name: { en: 'Taquería', ru: 'Такерия' },
    bg: '#fde7c8',
    sky: '#fff3e0',
    bounce: '#d9905a',
    counter: { kind: 'painted', base: '#3fa9a0', line: '#1f6e68' },
    ledge: { kind: 'tile', base: '#f6eedf', line: '#2a6fb0', trim: '#e76f51' },
    props: ['jug', 'hotSauce', 'sarape', 'chilies'],
    pantry: 'clay',
    tray: '#c9683a',
    cloth: '#e9c46a',
    bowl: 'clay',
    board: '#e9c48a',
    plate: '#fff8ec',
    wall: { base: '#fbe3c2', accent: '#2a9d8f', accent2: '#e9c46a', decor: 'taqueria' },
    ui: '#e76f51',
    music: 2,
  },
];

export function themeForWorld(world: number): KitchenTheme {
  return THEMES[Math.min(world, THEMES.length - 1)];
}
