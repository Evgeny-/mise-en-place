import * as THREE from 'three';
import type { Text } from '../core/content';
import { marbleTexture, woodTexture } from './painter';

/** Things the player can buy to dress up every kitchen. */
export type DecorKind = 'cloth' | 'plate' | 'tile';

export interface DecorItem {
  kind: DecorKind;
  id: string;
  name: Text;
  price: number;
}

export interface Looks {
  cloth: string;
  plate: string;
  tile: string;
}

export const DEFAULT_LOOKS: Looks = { cloth: 'house', plate: 'white', tile: 'ceramic' };

export const DECOR: DecorItem[] = [
  { kind: 'cloth', id: 'house', name: { en: 'House gingham', ru: 'Клетка заведения' }, price: 0 },
  { kind: 'cloth', id: 'blue', name: { en: 'Blue gingham', ru: 'Синяя клетка' }, price: 120 },
  { kind: 'cloth', id: 'polka', name: { en: 'Polka dots', ru: 'Горошек' }, price: 150 },
  { kind: 'cloth', id: 'stripes', name: { en: 'Café stripes', ru: 'Полоска кафе' }, price: 150 },
  { kind: 'cloth', id: 'lace', name: { en: 'Lace doily', ru: 'Кружевная салфетка' }, price: 220 },
  { kind: 'cloth', id: 'leaf', name: { en: 'Banana leaf', ru: 'Банановый лист' }, price: 260 },
  { kind: 'plate', id: 'white', name: { en: 'White china', ru: 'Белый фарфор' }, price: 0 },
  { kind: 'plate', id: 'terracotta', name: { en: 'Terracotta', ru: 'Терракота' }, price: 160 },
  { kind: 'plate', id: 'mint', name: { en: 'Mint enamel', ru: 'Мятная эмаль' }, price: 180 },
  { kind: 'plate', id: 'blue', name: { en: 'Blue rim', ru: 'Синий кант' }, price: 200 },
  { kind: 'plate', id: 'gold', name: { en: 'Gold rim', ru: 'Золотой кант' }, price: 320 },
  { kind: 'tile', id: 'ceramic', name: { en: 'Ceramic tiles', ru: 'Керамика' }, price: 0 },
  { kind: 'tile', id: 'wood', name: { en: 'Wooden crates', ru: 'Деревянные ящики' }, price: 300 },
  { kind: 'tile', id: 'marble', name: { en: 'Marble', ru: 'Мрамор' }, price: 380 },
  { kind: 'tile', id: 'woven', name: { en: 'Woven baskets', ru: 'Плетёные корзинки' }, price: 420 },
];

export function decorKey(item: Pick<DecorItem, 'kind' | 'id'>): string {
  return `${item.kind}:${item.id}`;
}

const texCache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.Texture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

function gingham(g: CanvasRenderingContext2D, s: number, color: string): void {
  g.fillStyle = '#fffaf2';
  g.fillRect(0, 0, s, s);
  g.fillStyle = color + '88';
  const band = s / 8;
  for (let i = 0; i < 8; i += 2) {
    g.fillRect(i * band, 0, band, s);
    g.fillRect(0, i * band, s, band);
  }
}

/** The placemat texture for a cloth look (`house` uses the kitchen's own colour). */
export function clothTexture(id: string, houseColor: string): THREE.Texture {
  switch (id) {
    case 'blue':
      return canvasTex('cloth-blue', 128, (g, s) => gingham(g, s, '#3a7bd5'), 2);
    case 'polka':
      return canvasTex('cloth-polka', 128, (g, s) => {
        g.fillStyle = '#e8473c';
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#fff4ec';
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          g.beginPath();
          g.arc((x + (y % 2) * 0.5 + 0.25) * (s / 4), (y + 0.5) * (s / 4), s / 22, 0, Math.PI * 2);
          g.fill();
        }
      }, 2);
    case 'stripes':
      return canvasTex('cloth-stripes', 128, (g, s) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? '#fffaf2' : '#2a9d8f';
          g.fillRect((i * s) / 8, 0, s / 8, s);
        }
      }, 2);
    case 'lace':
      return canvasTex('cloth-lace', 256, (g, s) => {
        g.fillStyle = '#fbf7ef';
        g.fillRect(0, 0, s, s);
        g.strokeStyle = '#e7dccb';
        g.lineWidth = 3;
        for (let r = s * 0.08; r < s * 0.5; r += s * 0.07) {
          g.beginPath();
          for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) {
            const rr = r + Math.sin(a * 12) * s * 0.012;
            const x = s / 2 + Math.cos(a) * rr;
            const y = s / 2 + Math.sin(a) * rr;
            if (a === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.fillStyle = '#e7dccb';
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
          g.beginPath();
          g.arc(s / 2 + Math.cos(a) * s * 0.42, s / 2 + Math.sin(a) * s * 0.42, s * 0.022, 0, Math.PI * 2);
          g.fill();
        }
      });
    case 'leaf':
      return canvasTex('cloth-leaf', 256, (g, s) => {
        g.fillStyle = '#3f9a4a';
        g.fillRect(0, 0, s, s);
        g.strokeStyle = '#5fbf5f';
        g.lineWidth = 2;
        for (let i = -s; i < s * 2; i += s / 18) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i + s * 0.6, s);
          g.stroke();
        }
        g.strokeStyle = '#2f7a3a';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(0, s);
        g.lineTo(s, 0);
        g.stroke();
      });
    default:
      return canvasTex('cloth-house' + houseColor, 128, (g, s) => gingham(g, s, houseColor), 2);
  }
}

/** Plate colours: [plate, rim]; the house china uses the kitchen's own colours. */
export function plateColors(id: string, house: string, houseRim = '#e8dccb'): [string, string] {
  switch (id) {
    case 'terracotta':
      return ['#e7a07a', '#c86f4a'];
    case 'mint':
      return ['#d8f3ea', '#7cc8b0'];
    case 'blue':
      return ['#fbfaf6', '#3a6fd5'];
    case 'gold':
      return ['#fffaf0', '#d9a737'];
    default:
      return [house, houseRim];
  }
}

/** Texture for pantry tiles (tinted by each item's colour), or null for plain ceramic. */
export function tileTexture(id: string): THREE.Texture | null {
  switch (id) {
    case 'wood':
      return woodTexture('#f6e8d2', '#c9a77c', 41, 256);
    case 'marble':
      return marbleTexture('#ffffff', '#cdbfb2', 43, 256);
    case 'woven':
      return canvasTex('tile-woven', 128, (g, s) => {
        g.fillStyle = '#f3e3c7';
        g.fillRect(0, 0, s, s);
        const n = 8;
        const w = s / n;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const horiz = (x + y) % 2 === 0;
          const grad = horiz ? g.createLinearGradient(0, y * w, 0, (y + 1) * w) : g.createLinearGradient(x * w, 0, (x + 1) * w, 0);
          grad.addColorStop(0, '#d9bf96');
          grad.addColorStop(0.5, '#fff3dc');
          grad.addColorStop(1, '#cfb085');
          g.fillStyle = grad;
          g.fillRect(x * w + 1, y * w + 1, w - 2, w - 2);
        }
      });
    default:
      return null;
  }
}
