import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { KitchenTheme } from './themes';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color('#ffffff'), k);
  return '#' + c.getHexString();
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function blobs(g: Ctx, rng: Rng, w: number, h: number, colors: string[], n: number, rMin: number, rMax: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = rng.range(rMin, rMax);
    const c = rng.pick(colors);
    for (const dx of [-w, 0, w]) {
      const grad = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      grad.addColorStop(0, hexA(c, alpha));
      grad.addColorStop(1, hexA(c, 0));
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
}

function speckle(g: Ctx, rng: Rng, w: number, h: number, n: number, color: string, alpha: number, r = 1.2): void {
  g.fillStyle = hexA(color, alpha);
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.arc(rng.next() * w, rng.next() * h, rng.range(0.4, r), 0, Math.PI * 2);
    g.fill();
  }
}

function shadowed(g: Ctx, fn: () => void, blur = 6, oy = 3, color = 'rgba(40,20,10,0.28)'): void {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.shadowOffsetY = oy;
  fn();
  g.restore();
}

const cache = new Map<string, THREE.Texture>();

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Butcher-block counter: planks running left to right, with grain, seams and a few knots. */
export function woodTexture(base: string, line: string, seed = 3, size = 1024): THREE.Texture {
  return cached(`wood${base}${line}${seed}${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(seed);
    const planks = 8;
    const ph = size / planks;
    for (let p = 0; p < planks; p++) {
      const y0 = p * ph;
      // Staggered butt joints: two or three pieces per plank row.
      let x = -rng.range(0, size * 0.5);
      while (x < size) {
        const len = rng.range(size * 0.45, size * 0.9);
        const tone = shade(base, rng.range(-0.1, 0.12));
        const grad = g.createLinearGradient(0, y0, 0, y0 + ph);
        grad.addColorStop(0, shade(tone, 0.06));
        grad.addColorStop(0.5, tone);
        grad.addColorStop(1, shade(tone, -0.05));
        g.fillStyle = grad;
        for (const dx of [0, size]) g.fillRect(x + dx - size, y0, len, ph);
        g.fillRect(x, y0, len, ph);
        // grain
        g.lineWidth = 1.2;
        for (let i = 0; i < 9; i++) {
          const gy = y0 + rng.range(4, ph - 4);
          const amp = rng.range(1, 4);
          const freq = rng.range(0.004, 0.012);
          const ph0 = rng.next() * 6;
          g.strokeStyle = hexA(line, rng.range(0.12, 0.3));
          g.beginPath();
          for (let s = 0; s <= len; s += 8) {
            const yy = gy + Math.sin(ph0 + (x + s) * freq) * amp;
            if (s === 0) g.moveTo(x + s, yy);
            else g.lineTo(x + s, yy);
          }
          g.stroke();
        }
        if (rng.chance(0.35)) {
          const kx = x + rng.range(40, len - 40);
          const ky = y0 + rng.range(ph * 0.3, ph * 0.7);
          g.fillStyle = hexA(line, 0.45);
          g.beginPath();
          g.ellipse(kx, ky, rng.range(6, 12), rng.range(3, 6), 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = hexA(line, 0.25);
          g.beginPath();
          g.ellipse(kx, ky, rng.range(14, 22), rng.range(6, 10), 0, 0, Math.PI * 2);
          g.stroke();
        }
        // seam at the end of the piece
        g.fillStyle = hexA(shade(line, -0.3), 0.35);
        g.fillRect(x + len - 1.5, y0, 2, ph);
        x += len;
      }
      // seam between plank rows, with a soft highlight under it
      g.fillStyle = hexA(shade(line, -0.35), 0.45);
      g.fillRect(0, y0, size, 2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, y0 + 2, size, 2);
    }
    speckle(g, rng, size, size, 900, shade(line, -0.2), 0.12);
    return toTexture(c);
  });
}

/** One solid polished board: long grain running its whole length, no joints (tiles seamlessly sideways). */
export function slabWoodTexture(base: string, line: string, seed = 47, w = 1024, h = 256): THREE.Texture {
  return cached(`slab${base}${line}${seed}${w}x${h}`, () => {
    const [c, g] = canvas(w, h);
    const rng = new Rng(seed);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, shade(base, 0.08));
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, shade(base, -0.06));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // grain: wavy lines whose waves repeat a whole number of times across the width
    for (let i = 0; i < 70; i++) {
      const y0 = rng.next() * h;
      const k1 = rng.int(1, 3);
      const k2 = rng.int(3, 7);
      const a1 = rng.range(2, 9);
      const a2 = rng.range(0.5, 2);
      const p1 = rng.next() * 6.28;
      const p2 = rng.next() * 6.28;
      g.strokeStyle = hexA(rng.chance(0.75) ? line : '#ffffff', rng.range(0.05, 0.18));
      g.lineWidth = rng.range(0.6, 2.2);
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const t = (x / w) * Math.PI * 2;
        const y = y0 + Math.sin(k1 * t + p1) * a1 + Math.sin(k2 * t + p2) * a2;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // a polished sheen along the length
    const sheen = g.createLinearGradient(0, h * 0.2, 0, h * 0.5);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);
    const t = toTexture(c);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Polished stone / marble: soft clouds and thin veins. */
export function marbleTexture(base: string, vein: string, seed = 5, size = 1024): THREE.Texture {
  return cached(`marble${base}${vein}${seed}${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    blobs(g, rng, size, size, [shade(base, 0.5), shade(vein, 0.4)], 40, size * 0.08, size * 0.25, 0.35);
    for (let v = 0; v < 9; v++) {
      let x = rng.next() * size;
      let y = rng.next() * size;
      let a = rng.range(-0.6, 0.6) + (rng.chance(0.5) ? 0 : Math.PI);
      const width = rng.range(0.6, 2.2);
      g.strokeStyle = hexA(vein, rng.range(0.35, 0.7));
      g.lineWidth = width;
      g.save();
      g.shadowColor = hexA(vein, 0.5);
      g.shadowBlur = 6;
      g.beginPath();
      g.moveTo(x, y);
      const steps = rng.int(25, 60);
      for (let i = 0; i < steps; i++) {
        a += rng.range(-0.35, 0.35);
        x += Math.cos(a) * 14;
        y += Math.sin(a) * 14;
        g.lineTo(x, y);
        if (rng.chance(0.06)) {
          // a fork
          const fx = x;
          const fy = y;
          let fa = a + rng.range(-1, 1);
          g.moveTo(fx, fy);
          let px = fx;
          let py = fy;
          for (let j = 0; j < 8; j++) {
            fa += rng.range(-0.4, 0.4);
            px += Math.cos(fa) * 10;
            py += Math.sin(fa) * 10;
            g.lineTo(px, py);
          }
          g.moveTo(x, y);
        }
      }
      g.stroke();
      g.restore();
    }
    speckle(g, rng, size, size, 1400, vein, 0.15);
    return toTexture(c);
  });
}

/** Rounded rectangle path helper. */
function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function jar(g: Ctx, rng: Rng, x: number, y: number, w: number, h: number, fill: string, lid: string): void {
  shadowed(g, () => {
    g.fillStyle = 'rgba(235,245,250,0.55)';
    rr(g, x, y - h, w, h, w * 0.18);
    g.fill();
  }, 6, 3);
  g.fillStyle = fill;
  rr(g, x + w * 0.1, y - h * 0.72, w * 0.8, h * 0.66, w * 0.12);
  g.fill();
  // contents texture
  g.strokeStyle = shade(fill, -0.2);
  g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const yy = y - h * 0.68 + rng.range(0, h * 0.58);
    g.beginPath();
    g.moveTo(x + w * 0.14, yy);
    g.lineTo(x + w * 0.86, yy + rng.range(-3, 3));
    g.stroke();
  }
  g.fillStyle = lid;
  rr(g, x - w * 0.04, y - h - h * 0.12, w * 1.08, h * 0.16, 4);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  rr(g, x + w * 0.12, y - h * 0.92, w * 0.12, h * 0.75, 4);
  g.fill();
}

function bottle(g: Ctx, x: number, y: number, w: number, h: number, glass: string, label: string): void {
  shadowed(g, () => {
    g.fillStyle = glass;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - h * 0.62);
    g.quadraticCurveTo(x, y - h * 0.74, x + w * 0.32, y - h * 0.8);
    g.lineTo(x + w * 0.32, y - h);
    g.lineTo(x + w * 0.68, y - h);
    g.lineTo(x + w * 0.68, y - h * 0.8);
    g.quadraticCurveTo(x + w, y - h * 0.74, x + w, y - h * 0.62);
    g.lineTo(x + w, y);
    g.closePath();
    g.fill();
  }, 6, 3);
  g.fillStyle = label;
  rr(g, x + w * 0.08, y - h * 0.5, w * 0.84, h * 0.24, 3);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  rr(g, x + w * 0.14, y - h * 0.6, w * 0.12, h * 0.52, 3);
  g.fill();
  g.fillStyle = '#7a4a2a';
  g.fillRect(x + w * 0.3, y - h - h * 0.07, w * 0.4, h * 0.08);
}

function plant(g: Ctx, rng: Rng, x: number, y: number, s: number, pot: string, leafC: string): void {
  shadowed(g, () => {
    g.fillStyle = pot;
    g.beginPath();
    g.moveTo(x - s * 0.5, y - s * 0.7);
    g.lineTo(x + s * 0.5, y - s * 0.7);
    g.lineTo(x + s * 0.38, y);
    g.lineTo(x - s * 0.38, y);
    g.closePath();
    g.fill();
  }, 6, 3);
  g.fillStyle = shade(pot, -0.15);
  g.fillRect(x - s * 0.55, y - s * 0.8, s * 1.1, s * 0.16);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + rng.range(-1.1, 1.1);
    const l = s * rng.range(0.45, 0.8);
    const cx = x + Math.cos(a) * l * 0.6;
    const cy = y - s * 0.8 + Math.sin(a) * l * 0.6;
    g.fillStyle = shade(leafC, rng.range(-0.15, 0.15));
    g.beginPath();
    g.ellipse(cx, cy, l * 0.32, l * 0.18, a, 0, Math.PI * 2);
    g.fill();
  }
}

function shelf(g: Ctx, x: number, y: number, w: number, wood: string): void {
  shadowed(g, () => {
    g.fillStyle = wood;
    rr(g, x, y, w, 16, 4);
    g.fill();
  }, 10, 6, 'rgba(40,20,10,0.35)');
  g.fillStyle = shade(wood, 0.15);
  g.fillRect(x + 4, y + 2, w - 8, 3);
  g.fillStyle = shade(wood, -0.25);
  for (const bx of [x + 30, x + w - 46]) {
    g.beginPath();
    g.moveTo(bx, y + 16);
    g.lineTo(bx + 16, y + 16);
    g.lineTo(bx + 4, y + 46);
    g.closePath();
    g.fill();
  }
}

function arch(g: Ctx, x: number, y: number, w: number, h: number, frame: string): void {
  // window with a sky and rooftops
  g.save();
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + w / 2);
  g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.clip();
  const sky = g.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#8fd0f5');
  sky.addColorStop(1, '#d9f0fb');
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [cx, cy, r] of [[0.3, 0.35, 0.12], [0.42, 0.33, 0.09], [0.7, 0.5, 0.1]] as const) {
    g.beginPath();
    g.arc(x + w * cx, y + h * cy, w * r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#e59a63';
  g.fillRect(x, y + h * 0.7, w, h * 0.3);
  g.fillStyle = '#c96a3c';
  for (let i = 0; i < 6; i++) g.fillRect(x + (i * w) / 6, y + h * 0.72, w / 12, h * 0.28);
  g.fillStyle = '#5fa96a';
  g.beginPath();
  g.ellipse(x + w * 0.2, y + h * 0.7, w * 0.16, h * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.strokeStyle = frame;
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + w / 2);
  g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.stroke();
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(x + w / 2, y);
  g.lineTo(x + w / 2, y + h);
  g.moveTo(x, y + h * 0.55);
  g.lineTo(x + w, y + h * 0.55);
  g.stroke();
  // flower box
  shadowed(g, () => {
    g.fillStyle = '#b05a35';
    rr(g, x - 14, y + h - 6, w + 28, 26, 6);
    g.fill();
  });
  for (let i = 0; i < 7; i++) {
    g.fillStyle = i % 2 ? '#e2483d' : '#f7c948';
    g.beginPath();
    g.arc(x + (i + 0.5) * (w / 7), y + h - 8, 9, 0, Math.PI * 2);
    g.fill();
  }
}

/** Wall size in world units: the texture maps 1:1 onto a backdrop of this size. */
export const WALL_W = 20;
export const WALL_H = 6.5;
/** How far the wall's lower panelling runs on below the dining-room floor line, so that nothing
 *  between the wall and the counter's ledge ever shows as floor. */
export const WALL_DROP = 1.2;

/**
 * The Trattoria's wall: warm ochre plaster worn through to old brick here and there, a sage-green
 * wooden wainscot behind the guests, shuttered windows, shelves with Chianti bottles, garlic
 * braids and string lights.
 */
function trattoriaWall(g: Ctx, rng: Rng, w: number, h: number, X: (x: number) => number, Y: (y: number) => number, ux: number, uy: number, wl: KitchenTheme['wall']): void {
  // plaster: lighter towards the top, mottled, with soft trowel strokes
  const base = g.createLinearGradient(0, 0, 0, Y(1.2));
  base.addColorStop(0, '#f7e3bd');
  base.addColorStop(1, '#ecc98e');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  blobs(g, rng, w, Y(1.2), ['#fbeccc', '#e2b673', '#f3d49d'], 90, 30, 140, 0.4);
  for (let i = 0; i < 220; i++) {
    const x = rng.next() * w;
    const y = rng.next() * Y(1.3);
    const a0 = rng.range(0, 6.28);
    g.strokeStyle = rng.chance(0.5) ? 'rgba(255,250,235,0.1)' : 'rgba(170,110,50,0.05)';
    g.lineWidth = rng.range(8, 20);
    g.lineCap = 'round';
    g.beginPath();
    g.arc(x, y, rng.range(80, 200), a0, a0 + rng.range(0.15, 0.35));
    g.stroke();
  }
  // a few hairline cracks
  g.strokeStyle = 'rgba(120,75,40,0.35)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    let x = rng.next() * w;
    let y = rng.range(Y(6), Y(1.6));
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += rng.range(-10, 10);
      y += rng.range(4, 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // plaster worn away to the brick underneath
  for (const [px, py, rx, ry] of [[-6.6, 5.3, 1.1, 0.55], [-2.9, 4.6, 0.7, 0.35], [3.4, 5.2, 0.9, 0.42], [6.9, 2.3, 0.8, 0.5], [-7.4, 1.9, 0.6, 0.35]] as const) {
    brickPatch(g, rng, X(px), Y(py), rx * ux, ry * uy, ux);
  }
  // shuttered arched windows, far to the sides
  for (const side of [-1, 1]) {
    const wx = X(side * 6.2) - 1.1 * ux;
    arch(g, wx, Y(4.7), 2.2 * ux, 3.0 * uy, '#f3e6cc');
    for (const k of [-1, 1]) {
      const sx = k < 0 ? wx - 1.0 * ux : wx + 2.2 * ux + 0.05 * ux;
      shadowed(g, () => {
        g.fillStyle = '#4f7a52';
        rr(g, sx, Y(4.6), 0.95 * ux, 2.9 * uy, 6);
        g.fill();
      }, 8, 4);
      g.fillStyle = 'rgba(20,40,20,0.35)';
      for (let i = 0; i < 11; i++) g.fillRect(sx + 10, Y(4.45) + i * 0.25 * uy, 0.95 * ux - 20, 5);
    }
  }
  // shelves: Chianti bottles in straw, jars, a pot of basil
  for (const side of [-1, 1]) {
    const sx = side < 0 ? X(-4.0) : X(2.15);
    shelf(g, sx, Y(2.45), 1.85 * ux, '#7a4a2c');
    fiasco(g, sx + 0.2 * ux, Y(2.45), 0.52 * ux, 0.95 * uy, '#3d6b34');
    jar(g, rng, sx + 0.7 * ux, Y(2.45), 0.38 * ux, 0.66 * uy, '#f0c45a', '#3aa35a');
    bottle(g, sx + 1.15 * ux, Y(2.45), 0.3 * ux, 0.95 * uy, '#7a9a3a', '#f6e3c4');
    plant(g, rng, sx + 1.62 * ux, Y(2.45), 0.42 * ux, '#c96a3c', '#4f9a45');
  }
  // garlic braids hanging between the windows and the shelves
  for (const px of [-4.1, 4.1]) garlicBraid(g, rng, X(px), Y(4.7), 1.4 * uy);
  // string lights across the top
  for (const [x0, x1] of [[0, w * 0.5], [w * 0.5, w]]) stringLights(g, x0, x1, Y(6.15), 0.5 * uy);
  // the wainscot: painted wooden panels below a chair rail, running on past the floor line
  wainscot(g, 0, Y(1.15), w, h - Y(1.15), ux, wl.accent);
}

/** An irregular patch where the plaster has fallen off, showing bricks in running bond. */
function brickPatch(g: Ctx, rng: Rng, cx: number, cy: number, rx: number, ry: number, ux: number): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const k = rng.range(0.7, 1.15);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const path = () => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  g.save();
  path();
  g.clip();
  g.fillStyle = '#c9b39a';
  g.fillRect(cx - rx * 1.3, cy - ry * 1.3, rx * 2.6, ry * 2.6);
  const bw = 0.42 * ux;
  const bh = bw * 0.36;
  for (let row = 0, y = cy - ry * 1.3; y < cy + ry * 1.3; row++, y += bh + 4) {
    for (let x = cx - rx * 1.3 - (row % 2 ? bw / 2 : 0); x < cx + rx * 1.3; x += bw + 4) {
      g.fillStyle = shade(rng.pick(['#b4553a', '#a84b33', '#c0623f', '#9a4430']), rng.range(-0.08, 0.08));
      rr(g, x, y, bw, bh, 3);
      g.fill();
    }
  }
  g.restore();
  // the broken plaster edge casts a little shadow onto the brick
  g.save();
  path();
  g.clip();
  g.shadowColor = 'rgba(70,35,15,0.55)';
  g.shadowBlur = 10;
  g.lineWidth = 10;
  g.strokeStyle = '#ecc98e';
  path();
  g.stroke();
  g.restore();
}

/** A Chianti fiasco: a round bottle in a straw jacket, with a short neck and a red foil cap. */
function fiasco(g: Ctx, x: number, y: number, w: number, h: number, glass: string): void {
  const r = w / 2;
  const cx = x + r;
  const cy = y - r;
  const neckW = r * 0.5;
  shadowed(g, () => {
    g.fillStyle = glass;
    rr(g, cx - neckW / 2, y - h, neckW, h - r, 4);
    g.fill();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = '#c0392b';
  rr(g, cx - neckW * 0.6, y - h - 4, neckW * 1.2, 14, 3);
  g.fill();
  // straw jacket over the lower part, woven, tied at the top
  g.save();
  g.beginPath();
  g.arc(cx, cy, r + 1, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#dcb76c';
  g.fillRect(cx - r - 2, cy - r * 0.35, 2 * r + 4, r * 1.5);
  g.strokeStyle = 'rgba(140,95,40,0.55)';
  g.lineWidth = 1.5;
  for (let k = -r * 1.2; k < r * 1.2; k += 6) {
    g.beginPath();
    g.moveTo(cx + k, cy - r * 0.35);
    g.lineTo(cx + k + 6, cy + r);
    g.stroke();
  }
  g.restore();
  g.fillStyle = '#b8914a';
  g.fillRect(cx - r, cy - r * 0.4, 2 * r, 4);
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.beginPath();
  g.ellipse(cx - r * 0.4, cy - r * 0.62, r * 0.14, r * 0.2, -0.5, 0, Math.PI * 2);
  g.fill();
}

/** A braid of garlic bulbs hanging from a nail. */
function garlicBraid(g: Ctx, rng: Rng, x: number, y: number, len: number): void {
  g.strokeStyle = '#b08a55';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y + len);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const bx = x + (i % 2 ? 9 : -9) + rng.range(-2, 2);
    const by = y + 14 + (i * (len - 20)) / 8;
    shadowed(g, () => {
      g.fillStyle = shade('#f4ede0', rng.range(-0.05, 0.03));
      g.beginPath();
      g.ellipse(bx, by, 12, 11, 0, 0, Math.PI * 2);
      g.fill();
    }, 4, 2);
    g.strokeStyle = 'rgba(190,140,160,0.6)';
    g.lineWidth = 1.2;
    for (const dx of [-5, 0, 5]) {
      g.beginPath();
      g.moveTo(bx + dx * 0.6, by - 9);
      g.quadraticCurveTo(bx + dx * 1.3, by, bx + dx * 0.6, by + 9);
      g.stroke();
    }
  }
}

/** Warm bulbs on a sagging wire. */
function stringLights(g: Ctx, x0: number, x1: number, y: number, sag: number): void {
  g.strokeStyle = '#4a3a2c';
  g.lineWidth = 2.5;
  g.beginPath();
  const at = (k: number) => y + Math.sin(Math.PI * k) * sag;
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    if (i) g.lineTo(x0 + (x1 - x0) * k, at(k));
    else g.moveTo(x0, at(0));
  }
  g.stroke();
  for (let i = 1; i < 12; i++) {
    const k = i / 12;
    const bx = x0 + (x1 - x0) * k;
    const by = at(k) + 12;
    const glow = g.createRadialGradient(bx, by, 0, bx, by, 26);
    glow.addColorStop(0, 'rgba(255,214,120,0.55)');
    glow.addColorStop(1, 'rgba(255,214,120,0)');
    g.fillStyle = glow;
    g.fillRect(bx - 26, by - 26, 52, 52);
    g.fillStyle = '#ffe7a8';
    g.beginPath();
    g.ellipse(bx, by, 6, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a3a2c';
    g.fillRect(bx - 3, by - 13, 6, 5);
  }
}

/** Painted wooden wainscot: a chair rail, then raised panels in frames. */
function wainscot(g: Ctx, x: number, y: number, w: number, h: number, ux: number, color: string): void {
  const paint = shade(color, -0.12);
  g.fillStyle = paint;
  g.fillRect(x, y, w, h);
  const pw = 1.5 * ux;
  for (let px = x - pw * 0.3; px < x + w; px += pw) {
    const ix = px + 14;
    const iy = y + 34;
    const iw = pw - 28;
    const ih = h - 50;
    const grad = g.createLinearGradient(0, iy, 0, iy + ih);
    grad.addColorStop(0, shade(color, 0.08));
    grad.addColorStop(1, shade(color, -0.05));
    g.fillStyle = grad;
    rr(g, ix, iy, iw, ih, 6);
    g.fill();
    g.strokeStyle = shade(color, -0.32);
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 2;
    rr(g, ix + 3, iy + 3, iw - 6, ih - 6, 4);
    g.stroke();
  }
  // the chair rail
  g.fillStyle = '#f2e3c4';
  g.fillRect(x, y, w, 16);
  g.fillStyle = 'rgba(120,80,40,0.35)';
  g.fillRect(x, y + 16, w, 5);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(x, y + 2, w, 3);
}

/** The wall behind the guests, painted for a camera-facing backdrop WALL_W x WALL_H units wide;
 * plus WALL_DROP of panelling below the floor line, which fills the gap down to the ledge. On phones only the middle few units
 * are visible and the tickets cover the centre, so the decorations sit to the sides and up top.
 */
export function wallTexture(theme: KitchenTheme, w = 2048, h = 768): THREE.Texture {
  return cached(`wall${theme.id}${w}x${h}`, () => {
    const [c, g] = canvas(w, h);
    const rng = new Rng(11);
    const wl = theme.wall;
    const ux = w / WALL_W;
    const uy = h / (WALL_H + WALL_DROP);
    const X = (x: number) => w / 2 + x * ux;
    const Y = (height: number) => h - (height + WALL_DROP) * uy;
    g.fillStyle = wl.base;
    g.fillRect(0, 0, w, h);
    blobs(g, rng, w, h, [shade(wl.base, 0.35), shade(wl.base, -0.08)], 70, 40, 160, 0.35);
    speckle(g, rng, w, h, 2500, shade(wl.base, -0.35), 0.08, 1.4);
    if (wl.decor === 'taqueria') {
      // talavera tiles below, papel picado across the top, clay pots and chilli strings
      const by = Y(1.3);
      const tile = 46;
      for (let i = 0; i < w / tile + 1; i++) for (let j = 0; j < (h - by) / tile; j++) {
        const x = i * tile;
        const y = by + j * tile;
        g.fillStyle = '#fbf6ea';
        g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        g.fillStyle = (i + j) % 2 ? '#2a6f97' : '#2a9d8f';
        g.beginPath();
        g.arc(x + tile / 2, y + tile / 2, tile * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e9c46a';
        g.beginPath();
        g.arc(x + tile / 2, y + tile / 2, tile * 0.12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = (i + j) % 2 ? '#2a9d8f' : '#e76f51';
        for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          g.beginPath();
          g.arc(x + cx * tile, y + cy * tile, tile * 0.16, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillStyle = '#c96a3c';
      g.fillRect(0, by - 12, w, 14);
      // papel picado: rows of cut-paper flags
      const colors = ['#e76f51', '#2a9d8f', '#e9c46a', '#f28ab2', '#8ac926'];
      for (const [y0, sag] of [[Y(6.2), 0.4], [Y(5.5), 0.35]] as const) {
        const n = 26;
        g.strokeStyle = '#8a6a4a';
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const k = i / 60;
          const yy = y0 + Math.sin(Math.PI * ((k * 4) % 1)) * sag * uy;
          if (i === 0) g.moveTo(k * w, yy);
          else g.lineTo(k * w, yy);
        }
        g.stroke();
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n;
          const yy = y0 + Math.sin(Math.PI * ((k * 4) % 1)) * sag * uy;
          const fw = (w / n) * 0.78;
          const fh = uy * 0.55;
          shadowed(g, () => {
            g.fillStyle = colors[i % colors.length];
            g.beginPath();
            g.moveTo(k * w - fw / 2, yy);
            g.lineTo(k * w + fw / 2, yy);
            g.lineTo(k * w + fw / 2, yy + fh);
            for (let z = 4; z >= 0; z--) g.lineTo(k * w - fw / 2 + (fw * z) / 4, yy + fh - (z % 2 ? fh * 0.14 : 0));
            g.closePath();
            g.fill();
          }, 4, 3);
          // cut-out pattern
          g.fillStyle = hexA('#ffffff', 0.55);
          g.beginPath();
          g.arc(k * w, yy + fh * 0.45, fw * 0.16, 0, Math.PI * 2);
          g.fill();
        }
      }
      for (const side of [-1, 1]) {
        const sx = side < 0 ? X(-4.0) : X(2.15);
        shelf(g, sx, Y(2.45), 1.85 * ux, '#8a5634');
        plant(g, rng, sx + 0.3 * ux, Y(2.45), 0.42 * ux, '#c96a3c', '#3f9a5a');
        jar(g, rng, sx + 0.75 * ux, Y(2.45), 0.42 * ux, 0.66 * uy, '#d1495b', '#2a9d8f');
        bottle(g, sx + 1.3 * ux, Y(2.45), 0.32 * ux, 0.95 * uy, '#e9c46a', '#e76f51');
      }
      // strings of dried chillies
      for (const px of [-4.7, 4.7]) {
        g.strokeStyle = '#8a6a4a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(X(px), Y(5.2));
        g.lineTo(X(px), Y(3.6));
        g.stroke();
        for (let i = 0; i < 9; i++) {
          g.fillStyle = shade('#c1121f', rng.range(-0.15, 0.1));
          g.beginPath();
          g.ellipse(X(px) + (i % 2 ? 7 : -7), Y(5.1) + i * 0.18 * uy, 6, 14, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (wl.decor === 'diner') {
      const by = Y(1.3);
      const sq = 34;
      for (let i = 0; i < w / sq; i++) for (let j = 0; j < (h - by) / sq; j++) {
        g.fillStyle = (i + j) % 2 ? wl.accent : wl.accent2;
        g.fillRect(i * sq, by + j * sq, sq, sq);
      }
      g.fillStyle = '#c9d2d8';
      g.fillRect(0, by - 10, w, 10);
      // neon signs off to the sides, clear of the level title above the guests
      for (const [x, text] of [[-5.6, 'BURGERS'], [5.6, 'OPEN']] as const) {
        g.save();
        g.font = `900 ${Math.round(uy * 0.55)}px "Nunito Variable", Nunito, sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = 7;
        g.shadowColor = '#ff6a6a';
        g.shadowBlur = 22;
        g.strokeStyle = '#ff5050';
        g.strokeText(text, X(x), Y(3.3));
        g.lineWidth = 2.5;
        g.strokeStyle = '#ffe0e0';
        g.strokeText(text, X(x), Y(3.3));
        g.restore();
      }
      for (const side of [-1, 1]) {
        const sx = side < 0 ? X(-3.9) : X(2.1);
        shelf(g, sx, Y(2.4), 1.8 * ux, '#c43d3d');
        bottle(g, sx + 0.15 * ux, Y(2.4), 0.36 * ux, 0.95 * uy, '#e23b2e', '#ffffff');
        bottle(g, sx + 0.65 * ux, Y(2.4), 0.36 * ux, 0.95 * uy, '#f2c12e', '#ffffff');
        jar(g, rng, sx + 1.15 * ux, Y(2.4), 0.45 * ux, 0.6 * uy, '#f6e2a8', '#e23b2e');
      }
    } else {
      trattoriaWall(g, rng, w, h, X, Y, ux, uy, wl);
    }
    // soft shade towards the floor so the guests stand out
    const fade = g.createLinearGradient(0, Y(2), 0, h);
    fade.addColorStop(0, 'rgba(60,30,10,0)');
    fade.addColorStop(1, 'rgba(60,30,10,0.22)');
    g.fillStyle = fade;
    g.fillRect(0, Y(2), w, h - Y(2));
    return toTexture(c, false);
  });
}

/** Brushed stainless steel. */
export function steelTexture(base: string, line: string, seed = 17, size = 512): THREE.Texture {
  return cached(`steel${base}${line}${seed}${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 1400; i++) {
      const y = rng.next() * size;
      g.strokeStyle = rng.chance(0.5) ? hexA('#ffffff', rng.range(0.04, 0.14)) : hexA(line, rng.range(0.05, 0.16));
      g.lineWidth = rng.range(0.5, 1.6);
      const x = rng.next() * size;
      const len = rng.range(size * 0.1, size * 0.6);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y + rng.range(-1, 1));
      g.stroke();
      if (x + len > size) {
        g.beginPath();
        g.moveTo(x - size, y);
        g.lineTo(x + len - size, y);
        g.stroke();
      }
    }
    return toTexture(c);
  });
}

/** Painted wooden table: wide planks along the counter, the paint worn through to the wood here and there. */
export function paintedWoodTexture(base: string, line: string, seed = 43, size = 1024): THREE.Texture {
  return cached(`painted${base}${line}${seed}${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(seed);
    const planks = 5;
    const ph = size / planks;
    for (let p = 0; p < planks; p++) {
      const y0 = p * ph;
      const tone = shade(base, rng.range(-0.06, 0.06));
      const grad = g.createLinearGradient(0, y0, 0, y0 + ph);
      grad.addColorStop(0, shade(tone, 0.08));
      grad.addColorStop(0.5, tone);
      grad.addColorStop(1, shade(tone, -0.06));
      g.fillStyle = grad;
      g.fillRect(0, y0, size, ph);
      // brush strokes and grain showing through the paint
      for (let i = 0; i < 14; i++) {
        const gy = y0 + rng.range(5, ph - 5);
        g.strokeStyle = hexA(rng.chance(0.5) ? line : '#ffffff', rng.range(0.06, 0.16));
        g.lineWidth = rng.range(1, 2.5);
        g.beginPath();
        const amp = rng.range(1, 3);
        const ph0 = rng.next() * 6;
        for (let x = 0; x <= size; x += 16) {
          const yy = gy + Math.sin(ph0 + x * 0.006) * amp;
          if (x === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
      // worn spots where the bare wood shows
      for (let i = 0; i < 3; i++) {
        const x = rng.next() * size;
        const y = y0 + rng.range(8, ph - 8);
        const w = rng.range(30, 120);
        const wg = g.createRadialGradient(x, y, 0, x, y, w / 2);
        wg.addColorStop(0, 'rgba(214,170,116,0.45)');
        wg.addColorStop(1, 'rgba(214,170,116,0)');
        g.fillStyle = wg;
        g.save();
        g.translate(x, y);
        g.scale(1, 0.25);
        g.fillRect(-w / 2, -w / 2, w, w);
        g.restore();
      }
      // the gap between planks
      g.fillStyle = hexA(shade(line, -0.4), 0.7);
      g.fillRect(0, y0, size, 3);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, y0 + 3, size, 2);
    }
    speckle(g, rng, size, size, 600, shade(line, -0.2), 0.12);
    return toTexture(c);
  });
}

/** Small glazed counter tiles, mostly plain, with now and then a hand-painted one. */
export function counterTileTexture(base: string, accent: string, seed = 19, size = 512): THREE.Texture {
  return cached(`ctile${base}${accent}${seed}${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(seed);
    const n = 6;
    const t = size / n;
    g.fillStyle = shade(base, -0.22);
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const px = x * t + 2;
      const py = y * t + 2;
      const s = t - 4;
      const tone = shade(base, rng.range(-0.05, 0.03));
      const grad = g.createLinearGradient(px, py, px + s, py + s);
      grad.addColorStop(0, shade(tone, 0.1));
      grad.addColorStop(1, shade(tone, -0.03));
      g.fillStyle = grad;
      rr(g, px, py, s, s, 3);
      g.fill();
      if (rng.chance(0.16)) {
        // a painted tile: a little flower in the corner colour
        const cx = px + s / 2;
        const cy = py + s / 2;
        g.fillStyle = hexA(accent, 0.9);
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          g.beginPath();
          g.ellipse(cx + Math.cos(a) * s * 0.17, cy + Math.sin(a) * s * 0.17, s * 0.15, s * 0.08, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#e9a23b';
        g.beginPath();
        g.arc(cx, cy, s * 0.08, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = hexA(accent, 0.7);
        g.lineWidth = 2;
        rr(g, px + 4, py + 4, s - 8, s - 8, 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.4)';
      rr(g, px + 4, py + 3, s * 0.45, 3, 2);
      g.fill();
    }
    return toTexture(c);
  });
}

/** Flour dust around the cutting board: soft white clouds fading out, on a transparent canvas. */
export function flourTexture(seed = 37, size = 512): THREE.Texture {
  return cached(`flour${seed}${size}`, () => {
    const [c, g] = canvas(size, size / 2);
    const rng = new Rng(seed);
    const w = size;
    const h = size / 2;
    for (let i = 0; i < 26; i++) {
      // clouds gather near the middle and thin out towards the edges
      const x = w / 2 + rng.range(-0.42, 0.42) * w;
      const y = h / 2 + rng.range(-0.38, 0.38) * h;
      const r = rng.range(18, 60);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 500; i++) {
      const x = w / 2 + (rng.next() - 0.5) * w * 0.95 * rng.next();
      const y = h / 2 + (rng.next() - 0.5) * h * 0.95;
      g.beginPath();
      g.arc(x, y, rng.range(0.6, 2), 0, Math.PI * 2);
      g.fill();
    }
    return toTexture(c, false);
  });
}

/** Bold woven stripes (a sarape cloth). */
export function stripeTexture(colors: string[], size = 256): THREE.Texture {
  return cached(`stripe${colors.join('')}${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(41);
    let x = 0;
    let i = 0;
    while (x < size) {
      const w = rng.pick([6, 10, 16, 24]);
      g.fillStyle = colors[i++ % colors.length];
      g.fillRect(x, 0, w, size);
      x += w;
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 0; y < size; y += 4) g.fillRect(0, y, size, 1);
    return toTexture(c);
  });
}

/** Retro diner laminate: cream with little coloured boomerangs and speckles. */
export function formicaTexture(base: string, accent: string, seed = 31, size = 512): THREE.Texture {
  return cached(`formica${base}${accent}${seed}${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    const colors = [accent, '#2fa38a', '#f2c12e', '#9aa3a8'];
    for (let i = 0; i < 70; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const a = rng.next() * Math.PI * 2;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.strokeStyle = hexA(rng.pick(colors), 0.55);
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-14, 6);
      g.quadraticCurveTo(0, -10, 14, 6);
      g.stroke();
      g.restore();
    }
    speckle(g, rng, size, size, 1500, '#6b6b6b', 0.25, 1.5);
    return toTexture(c);
  });
}
