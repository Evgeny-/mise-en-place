/**
 * The food street's art, drawn by hand in SVG: every kitchen's storefront in four growth stages and
 * the little things standing beside the road. Same language as the rest of the UI (`glyphs.ts`):
 * a 2-unit round espresso-ink line over flat fills from the kitchen palettes, a translucent ink wash
 * for shade and a soft ground shadow. Each piece is a <symbol> in one sprite (`streetSprite`), so a
 * street with dozens of stops is just <use> references.
 *
 * Night is driven by CSS custom properties that reach into the <use> trees: --sa-win (window glass),
 * --sa-in (a kiosk's inside), --sa-bulb (bulbs and lanterns) and --sa-glow (their halo, 0 by day).
 */

const INK = '#3b2a20';
const K = {
  cream: '#fffaf0',
  tomato: '#e04e39',
  basil: '#3f9a52',
  leaf: '#6fb35e',
  leafDk: '#4f9450',
  olive: '#a3b45f',
  oliveDk: '#7e9445',
  butter: '#f7c548',
  terracotta: '#cf6a45',
  terraDk: '#b5573a',
  stucco: '#f3c897',
  stuccoDk: '#e6ad7a',
  wood: '#b97a4b',
  woodLt: '#dba36f',
  woodDk: '#8a5a3a',
  mint: '#2fa38a',
  mintLt: '#bfe7da',
  red: '#e8484a',
  chrome: '#e3e9ec',
  steel: '#a9b4ba',
  bun: '#efa54c',
  patty: '#7a4a2c',
  pink: '#e8578a',
  marigold: '#f2a541',
  teal: '#2a9d8f',
  turq: '#47b3a8',
  cobalt: '#2f7fb0',
  lime: '#9cc94a',
  chili: '#d8452f',
  adobe: '#f6c9a6',
  sand: '#f1d6a6',
  stone: '#e6dccd',
  stoneDk: '#cdbfa9',
  water: '#a5d8e4',
  plum: '#3d2c42',
};
const WIN = 'var(--sa-win,#d6ecef)';
const INSIDE = 'var(--sa-in,#6e4b3b)';
const BULB = 'var(--sa-bulb,#fbe3a0)';
const TRICOLORE = [K.basil, K.cream, K.tomato];
const SERAPE = [K.pink, K.marigold, K.turq, K.cobalt, K.lime];

// ------------------------------------------------------------------ drawing primitives
const r1 = (v: number) => Math.round(v * 10) / 10;
const fa = (f: string) => (f.startsWith('var(') ? ` style="fill:${f}"` : ` fill="${f}"`);
const R = (x: number, y: number, w: number, h: number, f: string, rx = 0) =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${rx ? ` rx="${rx}"` : ''}${fa(f)}/>`;
const O = (cx: number, cy: number, r: number, f: string) => `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}"${fa(f)}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, f: string) => `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${rx}" ry="${ry}"${fa(f)}/>`;
/** an outlined path */
const P = (d: string, f = 'none', w?: number) => `<path d="${d}"${fa(f)}${w ? ` stroke-width="${w}"` : ''}/>`;
/** a fill without outline */
const F = (d: string, f: string, op?: number) => `<path d="${d}"${fa(f)} stroke="none"${op !== undefined ? ` opacity="${op}"` : ''}/>`;
/** a line in another colour */
const L = (d: string, c: string, w = 2, op?: number) => `<path d="${d}" stroke="${c}" stroke-width="${w}"${op !== undefined ? ` opacity="${op}"` : ''}/>`;
const shade = (d: string, op = 0.13) => F(d, INK, op);
const shine = (d: string, w = 1.8) => L(d, '#fff', w, 0.7);
const faint = (d: string, w = 1.2, op = 0.45) => `<path d="${d}" stroke-width="${w}" opacity="${op}"/>`;
const shadow = (cx: number, cy: number, rx: number, ry = 4.5) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}" opacity=".16" stroke="none"/>`;
/** a filled dot centred on (cx, cy), as path data */
const dot = (cx: number, cy: number, r: number) => `M${r1(cx)} ${r1(cy - r)}a${r1(r)} ${r1(r)} 0 1 0 .1 0z`;
const rectD = (x: number, y: number, w: number, h: number) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z`;
/** circles merged into one outlined blob: foliage, whipped cream */
function blob(cs: number[][], f: string): string {
  const c = cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `<g stroke-width="4"${fa(f)}>${c}</g><g stroke="none"${fa(f)}>${c}</g>`;
}
/** a halo that only shows at night */
const halo = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="none" fill="url(#sa-glow)" style="opacity:var(--sa-glow,0)"/>`;
/** point on a quadratic curve */
function qpt(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2];
}

// ------------------------------------------------------------------ shared motifs
/** a striped awning with a scalloped valance */
function awning(x: number, y: number, w: number, h: number, cols: string[], n: number): string {
  const sw = w / n;
  const r = sw / 2;
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = x + k * sw;
    s += F(`M${r1(a)} ${y}H${r1(a + sw)}V${y + h}A${r1(r)} ${r1(r)} 0 0 1 ${r1(a)} ${y + h}Z`, cols[k % cols.length]);
  }
  let out = `M${x} ${y}H${r1(x + w)}V${y + h}`;
  for (let k = n - 1; k >= 0; k--) out += `A${r1(r)} ${r1(r)} 0 0 1 ${r1(x + k * sw)} ${y + h}`;
  return s + shade(rectD(x, y, w, 3.5), 0.18) + faint(`M${x} ${y + h}H${r1(x + w)}`, 1, 0.35) + P(out + 'Z');
}
/** a canopy in horizontal serape stripes with a fringe */
function serape(x: number, y: number, w: number, h: number, cols: string[], flare = 5): string {
  const bh = h / cols.length;
  let s = '';
  cols.forEach((c, k) => {
    const y0 = y + k * bh;
    const y1 = y0 + bh;
    const f0 = (flare * k) / cols.length;
    const f1 = (flare * (k + 1)) / cols.length;
    s += F(`M${r1(x - f0)} ${r1(y0)}H${r1(x + w + f0)}L${r1(x + w + f1)} ${r1(y1)}H${r1(x - f1)}Z`, c);
  });
  let fringe = '';
  for (let fx = x - flare + 3; fx < x + w + flare - 1; fx += 4) fringe += `M${r1(fx)} ${y + h}v4`;
  return s + faint(fringe, 1.3, 0.7) + P(`M${x} ${y}H${x + w}L${x + w + flare} ${y + h}H${x - flare}Z`);
}
/** a market umbrella seen from the side: striped cone, scalloped rim, finial */
function umbrella(cx: number, top: number, w: number, h: number, cols: string[], n: number): string {
  const y = top + h;
  const x0 = cx - w / 2;
  const sw = w / n;
  const r = sw / 2;
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = x0 + k * sw;
    s += F(`M${cx} ${top}L${r1(a + sw)} ${y}A${r1(r)} ${r1(r * 0.75)} 0 0 1 ${r1(a)} ${y}Z`, cols[k % cols.length]);
  }
  let out = `M${cx} ${top}L${r1(x0 + w)} ${y}`;
  for (let k = n - 1; k >= 0; k--) out += `A${r1(r)} ${r1(r * 0.75)} 0 0 1 ${r1(x0 + k * sw)} ${y}`;
  let ribs = '';
  for (let k = 1; k < n; k++) ribs += `M${cx} ${top}L${r1(x0 + k * sw)} ${y}`;
  return s + shade(`M${cx} ${top}L${r1(x0 + w)} ${y}H${r1(cx + sw * 0.4)}Z`, 0.12) + faint(ribs, 1, 0.4) + P(out + 'Z') + O(cx, top - 2, 2.4, INK);
}
/** a wooden cart wheel */
function wheel(cx: number, cy: number, r: number, rim = K.woodDk, hub = K.woodLt): string {
  const ri = r - 3.5;
  let spokes = '';
  for (let a = 0; a < 4; a++) {
    const t = (a * Math.PI) / 4;
    spokes += `M${r1(cx - ri * Math.cos(t))} ${r1(cy - ri * Math.sin(t))}L${r1(cx + ri * Math.cos(t))} ${r1(cy + ri * Math.sin(t))}`;
  }
  return O(cx, cy, r, rim) + O(cx, cy, ri, hub) + faint(spokes, 1.4, 0.8) + O(cx, cy, 2.6, INK);
}
/** a rubber tyre */
const tyre = (cx: number, cy: number, r: number, hub = K.steel) => O(cx, cy, r, INK) + O(cx, cy, r * 0.45, hub) + F(`M${cx - 1} ${cy - r + 2}h2v2h-2z`, '#fff', 0.35);
/** a thin-tyred bicycle wheel */
const spokeWheel = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="3"/>` + faint(`M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}M${r1(cx - r * 0.7)} ${r1(cy - r * 0.7)}L${r1(cx + r * 0.7)} ${r1(cy + r * 0.7)}M${r1(cx - r * 0.7)} ${r1(cy + r * 0.7)}L${r1(cx + r * 0.7)} ${r1(cy - r * 0.7)}`, 1, 0.55) + O(cx, cy, 2, INK);
/** a string of bulbs sagging between two points */
function bulbs(x1: number, y1: number, x2: number, y2: number, sag: number, n: number): string {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag * 2;
  let s = faint(`M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`, 1.2, 0.9);
  for (let k = 0; k < n; k++) {
    const [x, y] = qpt(x1, y1, cx, cy, x2, y2, (k + 0.5) / n);
    s += halo(r1(x), r1(y + 2.5), 7) + `<circle cx="${r1(x)}" cy="${r1(y + 2.5)}" r="2.5" stroke-width="1.2"${fa(BULB)}/>`;
  }
  return s;
}
/** papel picado: cut-paper flags on a sagging string */
function picado(x1: number, y1: number, x2: number, y2: number, sag: number, n: number, fw = 11, fh = 12): string {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag * 2;
  let s = faint(`M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`, 1.2, 0.9);
  const cols = [K.pink, K.marigold, K.turq, K.lime, K.cobalt];
  for (let k = 0; k < n; k++) {
    const [x, y] = qpt(x1, y1, cx, cy, x2, y2, (k + 0.5) / n);
    const a = x - fw / 2;
    const q = fw / 4;
    s +=
      `<path d="M${r1(a)} ${r1(y)}h${fw}v${fh}l${-q} -2.4 ${-q} 2.4 ${-q} -2.4 ${-q} 2.4z"${fa(cols[k % cols.length])} stroke-width="1.3"/>` +
      `<circle cx="${r1(x)}" cy="${r1(y + fh * 0.42)}" r="${r1(fw * 0.16)}" fill="${K.cream}" stroke="none"/>` +
      F(`M${r1(a + 2)} ${r1(y + 2.5)}h1.6v1.6h-1.6zM${r1(a + fw - 3.6)} ${r1(y + 2.5)}h1.6v1.6h-1.6z`, K.cream);
  }
  return s;
}
/** a pizza: the Trattoria's sign */
const pizza = (cx: number, cy: number, r: number) =>
  O(cx, cy, r, '#eeb45c') +
  `<circle cx="${cx}" cy="${cy}" r="${r1(r * 0.76)}" fill="${K.tomato}" stroke="none"/>` +
  F(dot(cx - r * 0.4, cy - r * 0.1, r * 0.2) + dot(cx + r * 0.2, cy - r * 0.4, r * 0.18) + dot(cx + r * 0.1, cy + r * 0.42, r * 0.2), '#fde7a6') +
  E(cx - r * 0.05, cy + r * 0.05, r1(r * 0.2), r1(r * 0.11), K.basil).replace('/>', ' stroke="none"/>') +
  E(cx + r * 0.42, cy + r * 0.05, r1(r * 0.18), r1(r * 0.1), K.basil).replace('/>', ' stroke="none"/>');
/** a burger standing on y = cy, s = half its width */
function burger(cx: number, cy: number, s: number): string {
  const l = cx - s;
  const rr = cx + s;
  const u = s / 10;
  let lettuce = `M${r1(l - u)} ${r1(cy - 5.6 * u)}`;
  for (let k = 0; k < 6; k++) lettuce += `q${r1(s / 6)} ${r1(3 * u)} ${r1(s / 3)} 0`;
  return (
    R(l + u, cy - 3 * u, 2 * s - 2 * u, 3 * u, K.bun, r1(1.4 * u)) +
    R(l, cy - 5.2 * u, 2 * s, 2.6 * u, K.patty, r1(1.3 * u)) +
    P(`M${r1(l + u)} ${r1(cy - 5.4 * u)}H${r1(rr - u)}l${r1(-2 * u)} ${r1(2.4 * u)}l${r1(-2 * u)} ${r1(-1.4 * u)}l${r1(-2.5 * u)} ${r1(2.2 * u)}l${r1(-2.5 * u)} ${r1(-2.2 * u)}z`, K.butter, r1(Math.max(1.2, u * 0.9))) +
    P(lettuce + `v${r1(-1.5 * u)}H${r1(l - u)}z`, K.leaf, r1(Math.max(1.2, u * 0.9))) +
    P(`M${r1(l)} ${r1(cy - 6.6 * u)}Q${r1(l)} ${r1(cy - 13 * u)} ${cx} ${r1(cy - 13 * u)}Q${r1(rr)} ${r1(cy - 13 * u)} ${r1(rr)} ${r1(cy - 6.6 * u)}Z`, K.bun) +
    shine(`M${r1(l + 3 * u)} ${r1(cy - 9 * u)}q${r1(2 * u)} ${r1(-2.4 * u)} ${r1(5 * u)} ${r1(-2.8 * u)}`, r1(Math.max(1, u))) +
    F(`M${r1(cx - 2 * u)} ${r1(cy - 10.6 * u)}h${r1(1.6 * u)}v${r1(0.9 * u)}h${r1(-1.6 * u)}zM${r1(cx + 2.8 * u)} ${r1(cy - 9.4 * u)}h${r1(1.6 * u)}v${r1(0.9 * u)}h${r1(-1.6 * u)}zM${r1(cx + 5.6 * u)} ${r1(cy - 11 * u)}h${r1(1.4 * u)}v${r1(0.9 * u)}h${r1(-1.4 * u)}z`, K.cream)
  );
}
/** a taco standing on its fold at y = cy */
const taco = (cx: number, cy: number, s: number, w = 2) =>
  blob([[cx - s * 0.55, cy - s * 0.15, s * 0.32], [cx, cy - s * 0.28, s * 0.34], [cx + s * 0.55, cy - s * 0.15, s * 0.32]], K.leaf).replace('stroke-width="4"', `stroke-width="${w + 1.5}"`) +
  F(dot(cx - s * 0.3, cy - s * 0.42, s * 0.14) + dot(cx + s * 0.32, cy - s * 0.36, s * 0.13), K.chili) +
  `<path d="M${r1(cx - s)} ${r1(cy - s * 0.1)}A${s} ${r1(s * 0.9)} 0 0 0 ${r1(cx + s)} ${r1(cy - s * 0.1)}Z" fill="#f2c25b" stroke-width="${w}"/>`;
/** a terracotta pot with a flowering bush */
function flowerPot(cx: number, by: number, flower = K.tomato, potC = K.terracotta): string {
  return (
    blob([[cx - 5, by - 18, 5.5], [cx + 5, by - 19, 5.5], [cx, by - 24, 5.5]], K.leaf) +
    F(dot(cx - 6, by - 21, 2) + dot(cx + 3, by - 25, 2) + dot(cx + 6, by - 18, 2) + dot(cx - 2, by - 17, 2), flower) +
    P(`M${cx - 9} ${by - 14}H${cx + 9}L${cx + 7} ${by}H${cx - 7}Z`, potC) +
    shade(`M${cx + 3} ${by - 14}H${cx + 9}L${cx + 7} ${by}H${cx + 2}Z`, 0.14)
  );
}
/** a talavera band: cream tiles with blue rosettes */
function talavera(x: number, y: number, w: number, h: number, step = 12): string {
  let s = R(x, y, w, h, K.cream);
  let dots = '';
  let mid = '';
  for (let tx = x + step / 2; tx < x + w; tx += step) {
    dots += dot(tx, y + h / 2, h * 0.28);
    mid += dot(tx, y + h / 2, h * 0.1);
  }
  let joints = '';
  for (let tx = x + step; tx < x + w - 1; tx += step) joints += `M${r1(tx)} ${y}v${h}`;
  s += F(dots, K.cobalt) + F(mid, K.marigold) + faint(joints, 0.8, 0.3);
  return s;
}
/** a chili, angle in degrees */
const chili = (cx: number, cy: number, a: number, c = K.chili) =>
  `<g transform="translate(${r1(cx)} ${r1(cy)}) rotate(${r1(a)})"><path d="M-2.6 -4.5Q-3 2 0 6.5Q3 2 2.6 -4.5Z"${fa(c)} stroke-width="1.3"/><path d="M0 -4.5V-7" stroke="${K.basil}" stroke-width="1.6"/></g>`;
/** a ladder-back chair */
const chair = (x: number, by: number, c: string, face = 1) =>
  P(`M${x} ${by}V${by - 18}M${x} ${by - 9}H${x + face * 9}V${by}`, 'none', 2.2) + L(`M${x} ${by - 9}H${x + face * 9}`, c, 1.4);
/** a round terrace table */
const table = (cx: number, by: number, top = 15) => P(`M${cx} ${by}V${by - top}M${cx - 5} ${by}H${cx + 5}`, 'none', 2.2) + E(cx, by - top, 11, 3, K.cream);

// ------------------------------------------------------------------ storefronts (200 × 170, ground at y 160)
/** Storefronts share one frame so they swap stage without moving. */
export const FRONT_W = 200;
export const FRONT_H = 170;

const trattoria = [
  // 1: a pasta cart under a tricolore umbrella
  () =>
    shadow(100, 161, 62, 5.5) +
    P('M100 98V38', 'none', 3) +
    umbrella(100, 20, 124, 30, TRICOLORE, 6) +
    P('M58 114L28 104', 'none', 5) + L('M57 114L29 104.4', K.woodLt, 2) +
    P('M66 140v18', 'none', 3) +
    R(62, 74, 32, 22, '#cbd3d8', 5) + E(78, 74, 18, 4, '#eef2f4') + P('M62 81h-5M94 81h5') + shine('M68 80v11') +
    faint('M71 64c-4-5 4-8 0-14M85 62c-4-5 4-8 0-14', 1.6, 0.4) +
    O(116, 86, 6, K.tomato) + O(127, 83, 6.5, K.tomato) + O(138, 87, 5.5, K.tomato) + F('M125 76h4v3h-4zM114 79h3v3h-3z', K.basil) +
    P('M106 96L110 86H146L150 96Z', '#e0ad62') + faint('M116 86v10M124 86v10M132 86v10M140 86v10', 1.1, 0.5) +
    R(52, 96, 100, 7, '#efdcbc', 2) +
    R(56, 103, 92, 38, K.wood, 3) + faint('M56 116H148M56 129H148') +
    F(rectD(68, 109, 23.3, 8), K.basil) + F(rectD(91.3, 109, 23.3, 8), K.cream) + F(rectD(114.6, 109, 23.4, 8), K.tomato) + R(68, 109, 70, 8, 'none') +
    shade(rectD(138, 103, 10, 38), 0.14) +
    wheel(122, 145, 16),
  // 2: a kiosk with a tiled roof and a pizza on top
  () =>
    shadow(100, 161, 72, 5.5) +
    P('M100 56V48') + O(100, 37, 13, K.cream) + pizza(100, 37, 8.5) +
    P('M40 80L54 58H146L160 80Z', K.terracotta) + faint('M66 58l-3 22M80 58l-1.5 22M94 58v22M107 58v22M121 58l1.5 22M135 58l3 22') + R(52, 54, 96, 5, K.terraDk, 2) +
    R(46, 80, 108, 80, K.stucco) + shade(rectD(140, 80, 14, 80), 0.1) +
    R(58, 94, 84, 34, INSIDE) + faint('M60 113H140', 1.4, 0.8) +
    R(66, 102, 5, 11, K.basil, 1) + R(74, 104, 5, 9, K.tomato, 1) + R(82, 103, 5, 10, K.butter, 1) +
    P('M122 98v5') + E(122, 108, 3.5, 6, K.terraDk) + P('M132 98v3') + O(132, 105, 4, K.cream) +
    awning(52, 86, 96, 13, TRICOLORE, 6) +
    R(52, 126, 96, 7, '#efdcbc', 2) +
    R(52, 133, 96, 27, K.stuccoDk) + F(rectD(52, 142, 32, 6), K.basil) + F(rectD(84, 142, 32, 6), K.cream) + F(rectD(116, 142, 32, 6), K.tomato) + R(52, 142, 96, 6, 'none') +
    flowerPot(31, 160) +
    P('M163 160l6-34M185 160l-6-34', 'none', 3) + R(164, 128, 20, 22, '#3f5247', 2) + L('M168 134h12M168 139h8M168 144h11', K.cream, 1.2),
  // 3: a small trattoria: shutters, an arched window and door, geraniums
  () =>
    shadow(100, 161, 84, 5.5) +
    R(26, 58, 148, 102, K.stucco) + shade(rectD(160, 58, 14, 102), 0.1) +
    faint('M36 72q4 3 2 7M152 138q3 4 1 8M98 146q-3 3-1 6', 1, 0.3) +
    R(20, 48, 160, 12, K.terracotta, 2) + faint('M32 48v12M46 48v12M60 48v12M74 48v12M88 48v12M102 48v12M116 48v12M130 48v12M144 48v12M158 48v12M172 48v12') + R(24, 44, 152, 5, K.terraDk, 2) +
    R(60, 64, 80, 18, K.cream, 3) + pizza(100, 73, 6.5) +
    F(rectD(68, 69, 4, 8), K.basil) + F(rectD(72, 69, 4, 8), K.cream) + F(rectD(76, 69, 4, 8), K.tomato) + R(68, 69, 12, 8, 'none') +
    F(rectD(120, 69, 4, 8), K.basil) + F(rectD(124, 69, 4, 8), K.cream) + F(rectD(128, 69, 4, 8), K.tomato) + R(120, 69, 12, 8, 'none') +
    R(30, 92, 10, 42, K.basil, 1.5) + R(80, 92, 10, 42, K.basil, 1.5) + faint('M32 99h6M32 106h6M32 113h6M32 120h6M32 127h6M82 99h6M82 106h6M82 113h6M82 120h6M82 127h6', 1, 0.5) +
    P('M40 134V106A20 20 0 0 1 80 106V134Z', WIN) + faint('M60 86V134M40 114H80', 1.6, 0.9) + shine('M46 110l7-7') +
    awning(36, 90, 48, 11, TRICOLORE, 4) +
    blob([[42, 133, 4], [50, 132, 4], [58, 133, 4], [66, 132, 4], [74, 133, 4]], K.leaf) + F('M44 127a2 2 0 1 0 .1 0zM56 126a2 2 0 1 0 .1 0zM68 127a2 2 0 1 0 .1 0z', K.tomato) +
    R(36, 134, 48, 8, K.woodDk, 1.5) +
    P('M112 160V116A14 14 0 0 1 140 116V160Z', K.basil) + P('M116 116A10 10 0 0 1 136 116Z', WIN) + faint('M118 122h16v14h-16zM118 142h16v12h-16z', 1.2, 0.5) + O(134, 140, 1.6, K.butter) +
    R(108, 157, 36, 4, '#e8d6b8', 1) +
    P('M150 98h8') + halo(158, 106, 16) + P('M154 100h8v11h-8z', BULB) + P('M152 100l6-5 6 5Z', INK) +
    flowerPot(153, 160),
  // 4: a lively trattoria: two floors, a balcony, string lights, a terrace
  () =>
    shadow(100, 162, 96, 6) +
    R(24, 34, 152, 126, K.stucco) + shade(rectD(162, 34, 14, 126), 0.1) +
    P('M14 36L28 16H172L186 36Z', K.terracotta) + faint('M42 16l-2 20M58 16l-1 20M74 16l-.5 20M90 16v20M106 16v20M122 16l.5 20M138 16l1 20M154 16l2 20') + R(26, 12, 148, 5, K.terraDk, 2) + R(146, 2, 10, 10, K.terracotta, 1) +
    R(32, 44, 8, 34, K.basil) + R(60, 44, 8, 34, K.basil) + R(40, 44, 20, 34, WIN) + faint('M50 44V78M40 61H60', 1.4, 0.9) +
    R(132, 44, 8, 34, K.basil) + R(160, 44, 8, 34, K.basil) + R(140, 44, 20, 34, WIN) + faint('M150 44V78M140 61H160', 1.4, 0.9) +
    P('M86 82V56A14 14 0 0 1 114 56V82Z', WIN) + faint('M100 42V82', 1.4, 0.9) +
    R(78, 80, 44, 4, K.stuccoDk) + P('M80 80V69H120V80M86 69v11M93 69v11M100 69v11M107 69v11M114 69v11', 'none', 1.6) +
    blob([[80, 83, 4], [87, 85, 3.5], [113, 85, 3.5], [120, 83, 4]], K.leaf) + F('M78 84a2 2 0 1 0 .1 0zM88 87a2 2 0 1 0 .1 0zM112 87a2 2 0 1 0 .1 0zM121 85a2 2 0 1 0 .1 0z', K.pink) +
    bulbs(24, 36, 176, 36, 6, 12) +
    R(24, 88, 152, 5, K.stuccoDk) +
    R(56, 96, 88, 16, K.cream, 4) + pizza(100, 104, 6) +
    F(rectD(66, 100, 4, 8), K.basil) + F(rectD(70, 100, 4, 8), K.cream) + F(rectD(74, 100, 4, 8), K.tomato) + R(66, 100, 12, 8, 'none') +
    F(rectD(122, 100, 4, 8), K.basil) + F(rectD(126, 100, 4, 8), K.cream) + F(rectD(130, 100, 4, 8), K.tomato) + R(122, 100, 12, 8, 'none') +
    R(34, 130, 36, 30, WIN) + faint('M52 130V160M34 144H70', 1.4, 0.9) + R(130, 130, 36, 30, WIN) + faint('M148 130V160M130 144H166', 1.4, 0.9) +
    P('M86 160V138A14 14 0 0 1 114 138V160Z', K.basil) + O(110, 148, 1.6, K.butter) +
    awning(26, 114, 148, 13, TRICOLORE, 10) +
    P('M16 160V112', 'none', 2.5) + umbrella(16, 98, 44, 18, [K.cream, K.tomato], 4) +
    chair(2, 160, K.woodLt, 1) + table(16, 160) + R(13, 137, 4, 8, '#3f7a4a', 1) + chair(30, 160, K.woodLt, -1) +
    chair(170, 160, K.woodLt, 1) + table(186, 160) + O(190, 142, 2.5, K.tomato) + chair(200, 160, K.woodLt, -1),
];

const diner = [
  // 1: a burger cart under a red-and-white umbrella
  () =>
    shadow(100, 161, 62, 5.5) +
    P('M100 96V38', 'none', 3) +
    umbrella(100, 22, 120, 28, [K.red, K.cream], 6) +
    P('M144 112L168 102', 'none', 5) + L('M145 112L167 102.6', K.chrome, 2) +
    R(64, 77, 7, 17, K.red, 2) + R(65.5, 72, 4, 5, K.cream, 1) + R(74, 80, 7, 14, K.butter, 2) + R(75.5, 75, 4, 5, K.cream, 1) +
    E(126, 94, 15, 2.5, K.cream) + burger(126, 93, 11) +
    R(52, 94, 96, 7, K.chrome, 3) +
    R(56, 101, 88, 41, K.mint, 8) + R(56, 108, 88, 7, K.chrome) + F(rectD(56, 115, 88, 2.5), K.red) + shade(rectD(134, 103, 10, 37), 0.14) +
    O(100, 129, 10.5, K.cream) + burger(100, 134, 6.5) +
    tyre(74, 146, 10) + tyre(126, 146, 10),
  // 2: a walk-up kiosk with a giant burger on the roof
  () =>
    shadow(100, 161, 68, 5.5) +
    P('M90 84V76M110 84V76', 'none', 2.5) + burger(100, 78, 30) +
    P('M48 92Q48 80 60 80H140Q152 80 152 92Z', K.red) +
    P('M48 160V92H152V160Z', K.mintLt) + shade(rectD(140, 92, 12, 68), 0.1) +
    R(60, 98, 80, 30, INSIDE) + R(70, 102, 26, 14, K.cream, 1) + faint('M74 106h18M74 110h14', 1.2, 0.8) +
    R(108, 110, 22, 16, K.steel, 1) + P('M120 98v4') + P('M114 107h12l-3-5h-6z', K.red) +
    awning(56, 92, 88, 11, [K.red, K.cream], 7) +
    R(54, 126, 92, 6, K.chrome, 2) +
    R(48, 132, 104, 28, K.mint) + F(rectD(48, 140, 104, 3), K.red) +
    F('M48 150h8v8h-8zM64 150h8v8h-8zM80 150h8v8h-8zM96 150h8v8h-8zM112 150h8v8h-8zM128 150h8v8h-8zM144 150h8v8h-8z', INK, 0.8) + F('M56 150h8v8h-8zM72 150h8v8h-8zM88 150h8v8h-8zM104 150h8v8h-8zM120 150h8v8h-8zM136 150h8v8h-8z', K.cream) + R(48, 150, 104, 8, 'none') +
    P('M34 160V146', 'none', 2.5) + E(34, 144, 8, 3, K.red) + E(34, 160, 6, 1.6, K.steel) +
    P('M166 160V146', 'none', 2.5) + E(166, 144, 8, 3, K.red) + E(166, 160, 6, 1.6, K.steel),
  // 3: a small streamline diner with a round burger sign
  () =>
    shadow(100, 161, 86, 5.5) +
    P('M112 70V58M128 70V58', 'none', 2.5) + O(120, 42, 17, K.red) + O(120, 42, 12, K.cream) + burger(120, 48, 8.5) +
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<circle cx="${r1(120 + 14.6 * Math.cos((k * Math.PI) / 5))}" cy="${r1(42 + 14.6 * Math.sin((k * Math.PI) / 5))}" r="1.5" stroke="none"${fa(BULB)}/>`).join('') +
    P('M22 160V80Q22 68 34 68H150Q178 68 178 96V160Z', K.cream) +
    P('M22 88V80Q22 68 34 68H150Q172 68 177 88Z', K.mint) + shine('M30 74H148', 1.4) +
    R(56, 94, 22, 28, WIN, 2) + R(82, 94, 22, 28, WIN, 2) + R(108, 94, 22, 28, WIN, 2) + R(134, 94, 22, 28, WIN, 2) + shine('M60 116l12-14M86 116l12-14M112 116l12-14M138 116l12-14', 1.4) +
    P('M160 94H166Q172 100 172 110V122H160Z', WIN) +
    F(rectD(22, 126, 156, 4), K.red) + L('M24 135H176M24 141H176', K.steel, 1.4) +
    F('M22 150h8v8h-8zM38 150h8v8h-8zM54 150h8v8h-8zM70 150h8v8h-8zM86 150h8v8h-8zM102 150h8v8h-8zM118 150h8v8h-8zM134 150h8v8h-8zM150 150h8v8h-8zM166 150h8v8h-8z', INK, 0.8) + R(22, 150, 156, 8, 'none') +
    shade('M164 72Q178 76 178 96V160H164Z', 0.1) +
    R(28, 94, 22, 66, K.mint, 2) + O(39, 110, 6, WIN) + R(44, 126, 3, 10, K.chrome, 1) +
    R(24, 158, 30, 3, K.chrome, 1),
  // 4: a big diner: neon on the roof, marquee bulbs, a pylon sign and a terrace
  () =>
    shadow(104, 162, 96, 6) +
    P('M96 52V48M144 52V48', 'none', 2.5) + R(78, 24, 86, 26, K.plum, 6) +
    L('M90 44Q90 32 100 32Q110 32 110 44ZM89 40H111', '#ff7aa0', 5, 0.3) + L('M90 44Q90 32 100 32Q110 32 110 44ZM89 40H111', '#ff8fb0', 2) +
    L('M124 30l2.6 5.4 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.9z', '#ffe27a', 2) + L('M146 36h10M146 42h7', '#8ff0d8', 2) +
    P('M36 160V64Q36 52 48 52H156Q186 52 186 82V160Z', K.cream) +
    P('M36 74V64Q36 52 48 52H156Q180 52 185 74Z', K.mint) +
    [44, 54, 64, 74, 84, 94, 104, 114, 124, 134, 144, 154, 164].map((x) => halo(x, 57, 5) + `<circle cx="${x}" cy="57" r="2.2" stroke-width="1"${fa(BULB)}/>`).join('') +
    R(46, 80, 22, 34, WIN, 2) + R(72, 80, 22, 34, WIN, 2) + R(126, 80, 22, 34, WIN, 2) + R(152, 80, 22, 34, WIN, 2) + shine('M50 106l12-14M76 106l12-14M130 106l12-14M156 106l12-14', 1.4) +
    F(rectD(36, 120, 150, 4), K.red) + L('M38 132H184M38 138H184', K.steel, 1.4) +
    F('M36 150h8v8h-8zM52 150h8v8h-8zM68 150h8v8h-8zM84 150h8v8h-8zM100 150h8v8h-8zM116 150h8v8h-8zM132 150h8v8h-8zM148 150h8v8h-8zM164 150h8v8h-8zM180 150h6v8h-6z', INK, 0.8) + R(36, 150, 150, 8, 'none') +
    shade('M172 54Q186 60 186 82V160H172Z', 0.1) +
    R(99, 80, 24, 80, K.mint, 2) + O(111, 96, 6.5, WIN) + R(106, 116, 3, 12, K.chrome, 1) +
    P('M20 160V60', 'none', 5) + L('M20 160V60', K.steel, 2.4) +
    R(2, 20, 36, 44, K.red, 8) + R(7, 25, 26, 34, K.cream, 5) + burger(20, 50, 9) +
    [[4, 26], [4, 42], [4, 58], [36, 26], [36, 42], [36, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" stroke="none"${fa(BULB)}/>`).join('') +
    P('M20 6l2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z', K.butter) +
    P('M170 160V118', 'none', 2.5) + umbrella(170, 102, 42, 16, [K.red, K.cream], 4) +
    P('M158 160V150', 'none', 2) + E(158, 149, 5, 2, K.red) + table(170, 160, 14) + R(171, 137, 5, 9, K.cream, 1) + O(173.5, 136, 3, K.cream) + L('M175 136l2-6', K.red, 1.5) + P('M182 160V150', 'none', 2) + E(182, 149, 5, 2, K.red),
];

const taqueria = [
  // 1: a taco tricycle under a serape umbrella
  () =>
    shadow(104, 161, 70, 5.5) +
    P('M98 98V40', 'none', 3) +
    umbrella(98, 22, 120, 28, [K.pink, K.marigold, K.turq, K.lime, K.cobalt, K.marigold], 6) +
    P('M64 94Q58 84 68 78H82Q92 84 86 94Z', K.terracotta) + R(66, 74, 18, 5, K.terraDk, 2) + faint('M70 66c-4-5 4-8 0-14M80 64c-4-5 4-8 0-14', 1.6, 0.4) +
    taco(110, 93, 8) + taco(126, 93, 8) +
    R(50, 94, 92, 7, K.marigold, 2) +
    R(54, 101, 84, 40, K.turq, 4) + talavera(54, 108, 84, 13, 12) + R(54, 108, 84, 13, 'none') + shade(rectD(128, 101, 10, 40), 0.14) +
    P('M138 126L160 112L170 146M138 126L170 146', 'none', 3) + E(160, 109, 8, 2.6, INK) + spokeWheel(170, 146, 13) +
    tyre(72, 147, 9) + tyre(120, 147, 9),
  // 2: a market stall with a serape canopy and papel picado
  () =>
    shadow(100, 161, 72, 5.5) +
    R(54, 78, 92, 40, K.teal) + shade(rectD(54, 78, 92, 6), 0.15) +
    R(48, 58, 6, 102, K.wood, 1) + R(146, 58, 6, 102, K.wood, 1) +
    P('M58 80v28', 'none', 1.2) + [84, 91, 98, 105].map((y, k) => chili(58 + (k % 2 ? 2 : -2), y, k % 2 ? -18 : 18)).join('') +
    picado(54, 80, 146, 80, 3, 6, 10, 11) +
    serape(40, 50, 120, 24, [K.pink, K.marigold, K.turq, K.cobalt, K.lime, K.pink]) +
    O(66, 111, 4, K.lime) + O(73, 109, 4, K.lime) + O(79, 112, 4, K.lime) + P('M58 115A13 7 0 0 0 86 115Z', K.terracotta) +
    E(102, 113, 12, 2.5, '#f4d58a') + E(102, 109, 12, 2.5, '#f4d58a') + E(102, 105, 12, 2.5, '#f4d58a') +
    P('M120 116Q116 106 124 100H136Q144 106 140 116Z', K.terracotta) + R(122, 96, 16, 5, K.terraDk, 2) + faint('M126 90c-3-4 3-6 0-11M134 89c-3-4 3-6 0-11', 1.5, 0.4) +
    R(44, 116, 112, 8, K.woodLt, 2) +
    R(48, 124, 104, 36, K.marigold) + talavera(48, 132, 104, 16, 13) + R(48, 132, 104, 16, 'none') + shade(rectD(140, 124, 12, 36), 0.12),
  // 3: a small adobe taquería with a curved parapet and talavera
  () =>
    shadow(100, 161, 86, 5.5) +
    P('M26 160V70H66Q70 50 100 46Q130 50 134 70H174V160Z', K.adobe) + shade('M160 70H174V160H160Z', 0.1) +
    `<path d="M24 70H66Q70 50 100 46Q130 50 134 70H176" fill="none" stroke-width="5.5"/>` + L('M24 70H66Q70 50 100 46Q130 50 134 70H176', K.turq, 2.6) +
    O(100, 61, 8.5, K.turq) + O(100, 61, 5.5, WIN) +
    R(58, 76, 84, 16, K.teal, 3) + taco(100, 88, 6, 1.5) + F('M70 80a2 2 0 1 0 .1 0zM130 80a2 2 0 1 0 .1 0z', K.marigold) +
    serape(32, 96, 136, 13, SERAPE) +
    R(35, 118, 36, 30, K.marigold, 2) + R(39, 122, 28, 22, WIN, 1) + faint('M53 122v22', 1.4, 0.9) +
    R(129, 118, 36, 30, K.marigold, 2) + R(133, 122, 28, 22, WIN, 1) + faint('M147 122v22', 1.4, 0.9) +
    talavera(26, 150, 148, 10, 10) + R(26, 150, 148, 10, 'none') +
    P('M82 160V126A18 18 0 0 1 118 126V160Z', K.cream) + F('M84 132h4v4h-4zM84 142h4v4h-4zM84 152h4v4h-4zM112 132h4v4h-4zM112 142h4v4h-4zM112 152h4v4h-4zM98 109h4v4h-4z', K.cobalt) +
    P('M88 160V127A12 12 0 0 1 112 127V160Z', K.turq) + faint('M100 118V160', 1.2, 0.5) + O(105, 142, 1.6, K.marigold) +
    blob([[38, 148, 3.5], [46, 147, 3.5], [54, 148, 3.5], [62, 147, 3.5]], K.leaf) + F('M40 143a2 2 0 1 0 .1 0zM52 142a2 2 0 1 0 .1 0zM60 143a2 2 0 1 0 .1 0z', K.pink) +
    P('M174 160V124Q174 118 180 118Q186 118 186 124V146', K.leaf) + P('M174 140H170Q166 140 166 134V130Q166 127 169 127Q172 127 172 130V134H174', K.leaf) + faint('M180 122V146', 1, 0.5) +
    P('M170 160L168 146H190L188 160Z', K.terracotta),
  // 4: a lively taquería: two floors, a balcony with bougainvillea, terrace umbrellas
  () =>
    shadow(100, 162, 96, 6) +
    P('M20 160V46H60Q64 24 100 18Q136 24 140 46H180V160Z', K.adobe) + shade('M166 46H180V160H166Z', 0.1) +
    `<path d="M18 46H60Q64 24 100 18Q136 24 140 46H182" fill="none" stroke-width="5.5"/>` + L('M18 46H60Q64 24 100 18Q136 24 140 46H182', K.turq, 2.6) +
    O(100, 36, 12, K.marigold) + taco(100, 42, 7.5, 1.5) +
    R(26, 58, 8, 28, K.teal) + R(54, 58, 8, 28, K.teal) + R(34, 58, 20, 28, WIN) + faint('M44 58V86', 1.4, 0.9) +
    R(138, 58, 8, 28, K.teal) + R(166, 58, 8, 28, K.teal) + R(146, 58, 20, 28, WIN) + faint('M156 58V86', 1.4, 0.9) +
    P('M86 90V66A14 14 0 0 1 114 66V90Z', WIN) + faint('M100 52V90', 1.4, 0.9) +
    R(76, 88, 48, 4, '#e3a985') + P('M78 88V78H122V88M84 78v10M90 78v10M96 78v10M104 78v10M110 78v10M116 78v10', 'none', 1.6) +
    blob([[78, 80, 5], [74, 87, 4.5], [83, 76, 4], [122, 80, 5], [126, 87, 4.5], [117, 76, 4]], K.pink) + F('M77 82.4a1.6 1.6 0 1 0 .1 0zM124 82.4a1.6 1.6 0 1 0 .1 0zM82 77.6a1.4 1.4 0 1 0 .1 0z', K.leafDk) +
    picado(14, 48, 186, 48, 6, 11, 10, 11) +
    bulbs(20, 96, 180, 96, 5, 12) +
    serape(26, 108, 148, 14, SERAPE) +
    R(32, 128, 34, 24, K.marigold, 2) + R(36, 132, 26, 16, WIN, 1) + R(134, 128, 34, 24, K.marigold, 2) + R(138, 132, 26, 16, WIN, 1) +
    talavera(20, 152, 160, 8, 10) + R(20, 152, 160, 8, 'none') +
    P('M84 160V134A16 16 0 0 1 116 134V160Z', K.cream) + P('M89 160V135A11 11 0 0 1 111 135V160Z', K.turq) + faint('M100 124V160', 1.2, 0.5) +
    P('M14 160V114', 'none', 2.5) + umbrella(14, 100, 42, 17, [K.pink, K.cream], 4) + chair(0, 160, K.turq, 1) + table(14, 160) + chair(28, 160, K.pink, -1) +
    P('M186 160V114', 'none', 2.5) + umbrella(186, 100, 42, 17, [K.marigold, K.cream], 4) + chair(172, 160, K.pink, 1) + table(186, 160) + O(186, 142, 2.6, K.lime) + chair(200, 160, K.turq, -1),
];

const FRONTS = [trattoria, diner, taqueria];

// ------------------------------------------------------------------ street decorations
interface Piece {
  w: number;
  h: number;
  /** may be mirrored to face the other way */
  flip?: boolean;
  draw: () => string;
}

const PIECES: Record<string, Piece> = {
  // ---- Trattoria
  olive: {
    w: 60,
    h: 74,
    flip: true,
    draw: () =>
      shadow(30, 71, 16, 3.5) +
      P('M26 62C28 52 22 46 27 36L33 37C30 46 36 52 34 62Z', '#8a6a4c') +
      blob([[16, 30, 11], [28, 20, 13], [42, 28, 12], [31, 34, 10], [44, 16, 9], [14, 18, 8]], K.olive) +
      shade('M33 40a10 10 0 0 0 19-6a12 12 0 0 1-19 6zM6 30a11 11 0 0 0 16 9a11 11 0 0 1-16-9z', 0.14) +
      L('M18 22q4-3 7-1M34 14q4-2 7 0M38 28q3-2 6 0M22 32q3-2 6 0', K.oliveDk, 1.6) +
      F('M23 22.2a1.8 1.8 0 1 0 .1 0zM39 18.2a1.8 1.8 0 1 0 .1 0zM31 29.2a1.8 1.8 0 1 0 .1 0zM15 26.2a1.8 1.8 0 1 0 .1 0z', '#4b3a4f') +
      P('M20 60H40L37 72H23Z', K.terracotta) + R(18, 57, 24, 5, K.terraDk, 1.5),
  },
  vespa: {
    w: 62,
    h: 44,
    flip: true,
    draw: () =>
      shadow(31, 41, 26, 3) +
      tyre(14, 34, 7) + tyre(48, 34, 7) +
      P('M30 36C30 22 38 17 52 19C58 22 58 30 54 35L50 36Z', '#8fd0c6') +
      P('M14 34A8 8 0 0 1 22 26', 'none', 2) +
      P('M16 34Q14 20 22 12L25 14Q21 22 24 34Z', '#8fd0c6') +
      P('M22 34H34', 'none', 3) +
      P('M22 13L20 6M15 6H26', 'none', 2.2) + O(26, 10, 2.6, BULB) +
      E(42, 18, 9, 2.8, K.woodDk) +
      shade('M44 22C52 21 56 26 53 34L50 35C52 30 51 25 44 22Z', 0.15) + shine('M36 26q3-4 8-5', 1.5) +
      R(50, 13, 8, 4, K.woodDk, 1),
  },
  lemons: {
    w: 34,
    h: 44,
    draw: () =>
      shadow(17, 42, 11, 2.5) +
      P('M17 30V20', 'none', 2.2) +
      blob([[10, 15, 7], [22, 13, 7.5], [17, 7, 6.5], [24, 22, 5.5], [9, 23, 5]], K.leaf) +
      E(11, 13, 2.8, 2.2, K.butter) + E(21, 9, 2.8, 2.2, K.butter) + E(24, 19, 2.8, 2.2, K.butter) + E(13, 22, 2.8, 2.2, K.butter) + E(18, 16, 2.6, 2, K.butter) +
      P('M7 30H27L24 43H10Z', K.terracotta) + R(5, 28, 24, 4, K.terraDk, 1.5) + shade('M20 32H27L24 43H18Z', 0.14),
  },
  fountain: {
    w: 70,
    h: 60,
    draw: () =>
      shadow(35, 56, 32, 4) +
      L('M35 14Q22 10 16 42M35 14Q48 10 54 42', K.water, 2.4) +
      P('M4 44V50Q4 57 35 57Q66 57 66 50V44', K.stoneDk) + E(35, 44, 31, 8, K.stone) + E(35, 44, 26, 5.5, K.water) + shine('M20 43q8-3 18-3', 1.4) +
      R(31, 24, 8, 20, K.stone, 1) + shade(rectD(35, 25, 4, 18), 0.12) +
      P('M23 22Q35 31 47 22Z', K.stoneDk) + E(35, 22, 12, 3.2, K.stone) + E(35, 22, 8.5, 1.8, K.water) +
      R(33, 12, 4, 10, K.stone, 1) + O(35, 11, 3, K.stone) +
      F('M13 46.6a1.4 1.4 0 1 0 .1 0zM57 45.6a1.4 1.4 0 1 0 .1 0zM28 4.8a1.2 1.2 0 1 0 .1 0zM43 3.8a1.2 1.2 0 1 0 .1 0z', K.water),
  },
  lights: {
    w: 96,
    h: 60,
    draw: () =>
      shadow(48, 57, 40, 3) +
      R(5, 12, 4, 46, K.woodDk, 1) + R(87, 12, 4, 46, K.woodDk, 1) +
      bulbs(7, 14, 89, 14, 7, 9) +
      chair(30, 58, K.woodLt, 1) + table(48, 58) + chair(66, 58, K.woodLt, -1) +
      R(46, 36, 4, 7, '#3f7a4a', 1) + O(52, 41, 1.8, K.tomato),
  },
  bicycle: {
    w: 60,
    h: 40,
    flip: true,
    draw: () =>
      shadow(30, 38, 26, 2.5) +
      spokeWheel(12, 28, 10) + spokeWheel(47, 28, 10) +
      `<path d="M12 28L24 14H40L47 28M24 14L30 28L40 14M30 28H12M47 28L42 8M38 8h7" fill="none" stroke-width="4"/>` +
      L('M12 28L24 14H40L47 28M24 14L30 28L40 14M30 28H12M47 28L42 8', K.tomato, 1.8) +
      E(23, 11, 5, 1.8, K.woodDk) +
      L('M47 4l3-4M50 5l4-4', '#e9b56a', 3) + F('M53 4a2 2 0 1 0 .1 0zM48 5.2a1.8 1.8 0 1 0 .1 0z', K.tomato) +
      P('M43 8H57L55 16H45Z', '#d9a35a') + faint('M47 8v8M51 8v8', 1, 0.5),
  },
  // ---- Burger Joint
  neon: {
    w: 46,
    h: 78,
    draw: () =>
      shadow(23, 76, 9, 2.5) +
      P('M23 78V42', 'none', 5) + L('M23 78V42', K.steel, 2.4) +
      R(2, 2, 42, 40, K.plum, 8) + R(5, 5, 36, 34, 'none', 6).replace('/>', ' stroke="#f7c548" stroke-width="1.2" opacity=".7"/>') +
      L('M9 11H17M9 11V25H17M9 18H15M20 25L24 11L28 25M21.5 20.5H26.5M30 11H38M34 11V25', '#ff7aa0', 5, 0.3) +
      L('M9 11H17M9 11V25H17M9 18H15M20 25L24 11L28 25M21.5 20.5H26.5M30 11H38M34 11V25', '#ff9ab6', 2) +
      L('M9 32H33L29 28.5M33 32L29 35.5', '#8ff0d8', 1.8),
  },
  jukebox: {
    w: 36,
    h: 52,
    flip: true,
    draw: () =>
      shadow(18, 50, 15, 2.5) +
      P('M3 50V20A15 15 0 0 1 33 20V50Z', K.red) +
      P('M8 30V21A10 10 0 0 1 28 21V30Z', BULB) + L('M11 30V22A7 7 0 0 1 25 22V30', K.mint, 2) + L('M14.5 30V23A3.5 3.5 0 0 1 21.5 23V30', K.pink, 2) +
      R(8, 33, 20, 11, K.butter, 2) + faint('M12 33v11M16 33v11M20 33v11M24 33v11', 1, 0.6) +
      R(5, 46, 26, 4, K.chrome, 1) + shade('M26 10A15 15 0 0 1 33 20V50H27Z', 0.14) + shine('M7 18q2-6 7-9', 1.4),
  },
  car: {
    w: 84,
    h: 42,
    flip: true,
    draw: () =>
      shadow(42, 39, 38, 3) +
      P('M4 31Q4 23 12 22L23 21Q29 11 40 11H52Q61 11 65 21L76 22Q81 23 81 28V33H4Z', K.red) +
      P('M27 21Q31 14 40 14H45V21Z', WIN) + P('M48 14H52Q58 14 61 21H48Z', WIN) +
      P('M23 21Q29 11 40 11H52Q61 11 65 21Z', 'none') +
      L('M8 27H78', K.cream, 2) + R(2, 30, 8, 4, K.chrome, 2) + R(74, 30, 9, 4, K.chrome, 2) +
      P('M74 22L81 18V24Z', K.red) + O(9, 25, 2, BULB) +
      shade('M4 31H81V33H4Z', 0.15) + shine('M30 18q3-3 8-3', 1.4) +
      O(21, 33, 7, INK) + O(21, 33, 4.4, K.cream) + O(21, 33, 2, K.steel) +
      O(63, 33, 7, INK) + O(63, 33, 4.4, K.cream) + O(63, 33, 2, K.steel),
  },
  palm: {
    w: 56,
    h: 90,
    flip: true,
    draw: () =>
      shadow(28, 88, 12, 2.5) +
      `<path d="M27 80Q24 52 30 28" fill="none" stroke-width="8.5"/>` + L('M27 80Q24 52 30 28', '#c49364', 5) +
      faint('M23.5 70h6M23.4 60h6M24 50h6M25 40h6', 1.4, 0.7) +
      P('M30 26Q14 14 2 24Q14 18 30 28Z', K.leaf) + P('M30 26Q46 12 56 24Q44 18 30 28Z', K.leaf) +
      P('M30 26Q20 4 6 6Q20 10 30 28Z', K.leafDk) + P('M30 26Q40 2 52 8Q40 10 30 28Z', K.leafDk) +
      P('M30 26Q30 4 26 0Q34 8 31 28Z', K.leaf) +
      O(26, 29, 3.2, K.woodDk) + O(32, 30, 3.2, K.woodDk) +
      P('M14 78H42V90H14Z', K.cream) + F(rectD(14, 82, 28, 3), K.red) + R(12, 76, 32, 4, K.mintLt, 1.5),
  },
  shake: {
    w: 36,
    h: 72,
    draw: () =>
      shadow(18, 70, 8, 2.2) +
      P('M18 72V46', 'none', 4.5) + L('M18 72V46', K.steel, 2) +
      L('M22 22L28 2', K.red, 3.4) + P('M22 22L28 2', 'none', 1) +
      blob([[11, 22, 5], [18, 18, 6], [25, 22, 5], [18, 23, 5]], K.cream) +
      O(18, 11, 3.6, K.red) + L('M18 7.5q1-4 4-5', K.basil, 1.4) +
      P('M7 26H29L26 48H10Z', '#f7b5c8') + F('M12 26h3l1 22h-3zM20 26h3l-.6 22h-3z', K.cream) + P('M7 26H29L26 48H10Z') +
      R(9, 48, 18, 4, K.red, 1.5),
  },
  // ---- Taquería
  cactus: {
    w: 38,
    h: 64,
    flip: true,
    draw: () =>
      shadow(19, 61, 15, 3) +
      P('M13 60V14Q13 7 19.5 7Q26 7 26 14V60Z', '#5fae5b') +
      P('M13 40H9Q4 40 4 34V25Q4 21 7.5 21Q11 21 11 25V33H13', '#5fae5b') +
      P('M26 32H30Q34 32 34 27V17Q34 13 30.5 13Q27 13 27 17V26H26', '#5fae5b') +
      faint('M19.5 12V58M7.5 24V35M30.5 16V27', 1.1, 0.4) + shade('M21 9Q26 10 26 15V60H21Z', 0.12) +
      blob([[19.5, 6, 2.6], [17, 7.5, 2.2], [22, 7.5, 2.2]], K.pink) +
      E(19, 61, 15, 3, K.sand).replace('/>', ' stroke-width="1.6"/>'),
  },
  picado: {
    w: 98,
    h: 54,
    draw: () =>
      shadow(49, 52, 44, 2.5) +
      R(3, 6, 4, 46, K.woodDk, 1) + R(91, 6, 4, 46, K.woodDk, 1) +
      picado(5, 9, 93, 9, 6, 6, 12, 14),
  },
  pinata: {
    w: 50,
    h: 54,
    flip: true,
    draw: () => {
      const legs = 'M14 38v13M20 38v13M30 38v13M36 38v13';
      return (
        shadow(25, 52, 18, 2.5) +
        `<path d="${legs}" fill="none" stroke-width="5"/>` + L(legs, K.marigold, 2.6) +
        P('M6 26Q2 22 4 30', 'none', 2.4) + L('M4 30l-2 4M4 30l1 4M4 30l3 3', K.pink, 1.4) +
        R(8, 22, 32, 17, K.pink, 8) + F('M10 27h28v4h-28z', K.marigold) + F('M10 33h28v3h-28z', K.turq) +
        faint('M12 27l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2M12 33l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2', 1, 0.5) + R(8, 22, 32, 17, 'none', 8) +
        P('M33 26L36 12H44L45 26Z', K.pink) + F('M35 18h10v3h-10z', K.lime) +
        P('M38 12L36 3L41 10M42 12L44 3L45 11', K.marigold, 1.6) +
        R(40, 12, 9, 8, K.pink, 3) + O(43, 15, 1.2, INK) + F('M47 17h2v2h-2z', INK, 0.6)
      );
    },
  },
  guitar: {
    w: 34,
    h: 60,
    flip: true,
    draw: () =>
      shadow(17, 58, 13, 2.5) +
      P('M6 58V44H24V58M6 50H24', 'none', 2) + R(4, 41, 22, 4, K.woodLt, 1.5) +
      `<g transform="rotate(-14 18 40)">` +
      R(16.5, 4, 5, 26, K.woodDk, 1.5) + R(15.5, 0, 7, 7, K.woodDk, 2) +
      blob([[19, 44, 10], [19, 30, 7.5]], '#e3a45a') + O(19, 36, 3, INK) + R(15, 47, 8, 2.5, K.woodDk, 1) +
      L('M18 4V48M20 4V48', K.cream, 0.7) + shade('M22 26a7.5 7.5 0 0 1 4 6a10 10 0 0 1 -1 20a10 10 0 0 0 -3-26z', 0.14) +
      `</g>`,
  },
  agave: {
    w: 50,
    h: 42,
    draw: () =>
      shadow(25, 40, 14, 2.5) +
      P('M25 28Q6 26 2 10Q14 18 25 28Z', '#7fb8a4') + P('M25 28Q44 26 48 10Q36 18 25 28Z', '#7fb8a4') +
      P('M25 28Q12 16 12 2Q20 14 25 28Z', '#5f9f8e') + P('M25 28Q38 16 38 2Q30 14 25 28Z', '#5f9f8e') +
      P('M25 28Q21 12 25 0Q29 12 25 28Z', '#8cc4b0') +
      P('M13 28H37L34 41H16Z', K.cream) + F('M14.5 33h21l-.6 3h-19.8z', K.cobalt) + R(11, 26, 28, 4, K.cream, 1.5) + F('M19 36.6a1.4 1.4 0 1 0 .1 0zM25 36.6a1.4 1.4 0 1 0 .1 0zM31 36.6a1.4 1.4 0 1 0 .1 0z', K.marigold),
  },
  ristra: {
    w: 36,
    h: 64,
    draw: () => {
      let ring = '';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ring += chili(18 + 12 * Math.cos(a), 22 + 12 * Math.sin(a), (a * 180) / Math.PI + 90, k % 4 === 3 ? K.leaf : K.chili);
      }
      return (
        shadow(18, 62, 10, 2.5) +
        P('M18 64V34M10 64L18 46L26 64', 'none', 3) + L('M18 63V34', K.woodLt, 1.2) +
        ring +
        P('M18 34l-6 5 1-7zM18 34l6 5-1-7z', K.marigold, 1.4) + O(18, 34, 2.4, K.marigold)
      );
    },
  },
  // ---- shared
  lamp: {
    w: 26,
    h: 80,
    draw: () =>
      shadow(13, 78, 8, 2.2) +
      halo(13, 16, 22) +
      P('M8 78h10l-1-6H9z', INK) +
      `<path d="M13 72V24" stroke-width="4.5"/>` + L('M13 72V24', '#5b4636', 2) +
      P('M8 24h10l-2 -3h-6z', INK) +
      P('M7 10H19L17 21H9Z', BULB) + faint('M13 10V21', 1, 0.5) +
      P('M5 10L13 4L21 10Z', INK) + O(13, 3, 1.6, INK),
  },
  bench: {
    w: 58,
    h: 34,
    flip: true,
    draw: () =>
      shadow(29, 32, 26, 2.5) +
      P('M10 32V22M48 32V22M8 32h4M46 32h4', 'none', 2.6) +
      P('M10 22V6M48 22V6', 'none', 2.6) +
      R(6, 4, 46, 5, K.wood, 2) + R(6, 11, 46, 5, K.wood, 2) +
      R(4, 19, 50, 5, K.woodLt, 2) + shade(rectD(6, 22, 46, 2), 0.18) +
      P('M8 22Q4 18 8 15M50 22Q54 18 50 15', 'none', 2),
  },
  cat: {
    w: 32,
    h: 30,
    flip: true,
    draw: () =>
      shadow(16, 28, 11, 2.2) +
      `<path d="M21 26Q31 27 28 17Q27 13 30 12" fill="none" stroke-width="5"/>` + L('M21 26Q31 27 28 17Q27 13 30 12', K.marigold, 2.4) +
      P('M7 27Q4 16 12 12H18Q24 16 22 27Z', K.marigold) +
      O(15, 10, 6.5, K.marigold) + P('M9.5 7L9.5 1.5L13.5 5M16.5 5L20.5 1.5L20.5 7', K.marigold) +
      faint('M10 18l3 1M10 22l3 1M20 18l-3 1', 1.3, 0.6) +
      F('M8.5 26h13v1.5h-13z', K.cream) +
      faint('M11.5 10q1.2-1.2 2.4 0M16.5 10q1.2-1.2 2.4 0', 1.2, 1) + F('M14.4 12.2h1.6l-.8 1z', K.pink),
  },
  birds: {
    w: 38,
    h: 22,
    flip: true,
    draw: () =>
      shadow(10, 20, 7, 1.6) + shadow(28, 20, 7, 1.6) +
      P('M7 20v-3M11 20v-3M25 20v-3M29 20v-3', 'none', 1.2) +
      E(10, 14, 7, 4.5, '#c08a5a') + O(5, 9, 3.6, '#c08a5a') + P('M1.6 9L-1 10L1.8 10.8Z', K.marigold, 1) + P('M12 12q4 0 6 4', 'none', 1.4) + O(4.4, 8.4, 0.8, INK) + P('M16 15l4-1-3 3', '#c08a5a', 1.4) +
      E(28, 16, 7, 4, '#a7b4bd') + O(33, 13, 3.4, '#a7b4bd') + P('M36.2 13L38.6 14L36.2 14.8Z', K.marigold, 1) + P('M26 14q-4 0-5 4', 'none', 1.4) + O(33.8, 12.4, 0.8, INK) + P('M22 17l-4-1 2 3', '#a7b4bd', 1.4),
  },
  flowers: {
    w: 46,
    h: 30,
    flip: true,
    draw: () =>
      shadow(23, 29, 20, 2.2) +
      blob([[8, 16, 4.5], [15, 14, 4.5], [22, 16, 4.5], [29, 14, 4.5], [36, 16, 4.5], [40, 18, 3.5]], K.leaf) +
      [[9, 12, K.tomato], [17, 9, K.butter], [25, 12, K.pink], [33, 9, K.cream], [39, 13, K.tomato]]
        .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c}" stroke-width="1.3"/><circle cx="${x}" cy="${y}" r="1" fill="${INK}" stroke="none"/>`)
        .join('') +
      R(4, 18, 38, 11, K.wood, 1.5) + faint('M4 23.5H42', 1, 0.5) + shade(rectD(32, 18, 10, 11), 0.14),
  },
  // ---- tiny ground bits
  tuft: { w: 20, h: 12, flip: true, draw: () => L('M4 12Q5 6 3 1M8 12Q8 6 10 2M12 12Q13 7 16 4M16 12Q17 9 19 8', '#7db564', 1.8) },
  daisies: {
    w: 22,
    h: 14,
    flip: true,
    draw: () =>
      L('M5 14Q5 10 6 7M12 14V5M18 14Q18 11 16 8', '#7db564', 1.5) +
      [[6, 6], [12, 4], [16, 7]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff" stroke-width="1"/><circle cx="${x}" cy="${y}" r="1" fill="${K.butter}" stroke="none"/>`).join(''),
  },
  pebbles: {
    w: 22,
    h: 9,
    draw: () => `<g stroke-width="1.2">${E(6, 6, 4.5, 2.6, '#d8cbb6')}${E(14, 6.6, 3.4, 2, '#cbbda6')}${E(19, 5, 2.4, 1.6, '#e2d7c4')}</g>`,
  },
};

/** Decorations themed to each kitchen (world index). */
export const KITCHEN_DECOR: readonly (readonly string[])[] = [
  ['olive', 'vespa', 'lemons', 'fountain', 'lights', 'bicycle'],
  ['neon', 'jukebox', 'car', 'palm', 'shake'],
  ['cactus', 'picado', 'pinata', 'guitar', 'agave', 'ristra'],
];
/** Decorations found anywhere on the street. */
export const SHARED_DECOR: readonly string[] = ['lamp', 'bench', 'cat', 'birds', 'flowers'];
/** Grass and pebbles in the gaps. */
export const GROUND_BITS: readonly string[] = ['tuft', 'daisies', 'pebbles', 'tuft'];

export function pieceSize(id: string): { w: number; h: number; flip: boolean } {
  const p = PIECES[id];
  return { w: p.w, h: p.h, flip: !!p.flip };
}

const sym = (id: string, w: number, h: number, body: string) =>
  `<symbol id="sa-${id}" viewBox="0 0 ${w} ${h}" overflow="visible"><g fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${body}</g></symbol>`;

let sprite = '';
/** The whole street's art as one hidden SVG of symbols (built once). */
export function streetSprite(): string {
  if (sprite) return sprite;
  let s =
    '<svg class="sa-sprite" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="sa-glow"><stop offset="0" stop-color="#ffe7a0" stop-opacity=".95"/><stop offset=".45" stop-color="#ffd27a" stop-opacity=".45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>';
  FRONTS.forEach((stages, world) => stages.forEach((draw, k) => (s += sym(`front-${world}-${k + 1}`, FRONT_W, FRONT_H, draw()))));
  for (const [id, p] of Object.entries(PIECES)) s += sym(id, p.w, p.h, p.draw());
  sprite = s + '</svg>';
  return sprite;
}
