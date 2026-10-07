/**
 * App icons from public/icon.svg (Chef Tomato: a tomato in a toque on butter yellow).
 * Run: bun scripts/build-app-icons.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const file = (name: string) => new URL(`../public/${name}`, import.meta.url);
const icon = readFileSync(file('icon.svg'), 'utf8');

function variant(shape: 'rounded' | 'square' | 'maskable'): string {
  let svg = icon;
  // Apple and Android apply their own mask, so the background fills every corner.
  if (shape !== 'rounded') svg = svg.replace('rx="22"', 'rx="0"');
  // Keep the art inside the central safe circle used by launcher masks.
  if (shape === 'maskable') svg = svg.replace('<g id="icon-art">', '<g id="icon-art" transform="translate(7.2 7.2) scale(.85)">');
  return svg;
}

const png = (svg: string, size: number) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync(file('apple-touch-icon.png'), png(variant('square'), 180));
writeFileSync(file('icon-192.png'), png(variant('rounded'), 192));
writeFileSync(file('icon-512.png'), png(variant('rounded'), 512));
writeFileSync(file('icon-maskable-512.png'), png(variant('maskable'), 512));
writeFileSync(file('favicon.svg'), variant('rounded'));
console.log('icons written');
