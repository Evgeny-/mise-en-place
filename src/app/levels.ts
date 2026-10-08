import type { LevelDef } from '../core/types';

/** A few hand-made kitchens, used until the generated campaign is built. */
const DEMO: LevelDef[] = [
  {
    n: 1, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 1,
    columns: [['tomato', 'pasta'], ['tomato', 'tomato'], ['pasta', 'tomato']],
    orders: ['spaghetti', 'spaghetti'],
  },
  {
    n: 2, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 2,
    columns: [
      ['tomato', 'tomato', 'tomato', 'potato'],
      ['tomato', 'onion'],
      ['egg', 'potato', 'carrot', 'mushroom', 'pasta'],
      ['onion', 'cheese', 'carrot'],
    ],
    orders: ['minestrone', 'minestrone', 'spaghetti', 'omelette'],
  },
  {
    n: 3, world: 0, menu: 'trattoria', tier: 'hard', slots: 3, seats: 2,
    columns: [
      ['tomato', 'tomato', 'carrot'],
      ['cheese', 'egg', 'tomato', 'pasta', 'onion'],
      ['tomato', 'flour', 'egg', 'mushroom', 'cheese'],
      ['pasta', 'tomato', 'potato', 'tomato'],
      ['tomato'],
    ],
    orders: ['spaghetti', 'minestrone', 'pizza', 'spaghetti', 'omelette'],
    lids: [0, 0, 0, 0, 3],
  },
];

/** The Burger Joint showcase from the design simulation: a superhard kitchen (tests and dev scripts). */
export const BURGER_DEMO: LevelDef = {
  n: 41, world: 1, menu: 'diner', tier: 'superhard', rules: 'burger', slots: 3, seats: 2,
  columns: [
    ['bun_bottom', 'patty', 'tomato_slice', 'bun_bottom', 'lettuce'],
    ['cheese_slice', 'bun_bottom', 'patty', 'lettuce'],
    ['tomato_slice', 'patty', 'bun_top', 'bun_top', 'bun_top'],
  ],
  tickets: [
    ['bun_bottom', 'patty', 'lettuce', 'bun_top'],
    ['bun_bottom', 'lettuce', 'tomato_slice', 'cheese_slice', 'patty', 'bun_top'],
    ['bun_bottom', 'patty', 'tomato_slice', 'bun_top'],
  ],
  orders: ['burger', 'burger', 'burger'],
  intro: 'burger',
};

/** The Taquería showcase from the design simulation (tests and dev scripts). */
export const TACO_DEMO: LevelDef = {
  n: 81, world: 2, menu: 'taqueria', tier: 'normal', rules: 'taco', slots: 4, seats: 2,
  columns: [
    ['chicken', 'tortilla', 'corn', 'onion'],
    ['corn', 'tortilla', 'tortilla', 'lettuce'],
    ['beans', 'lettuce'],
    ['lettuce', 'tomato', 'beans'],
  ],
  orders: ['taco_veggie', 'taco_pollo', 'taco_veggie'],
};

let campaign: LevelDef[] | null = null;

/** The built campaign (src/data/levels.json) if present, else the demo kitchens. */
export async function loadCampaign(): Promise<LevelDef[]> {
  if (campaign) return campaign;
  const files = import.meta.glob<{ default: LevelDef[] }>('../data/levels.json');
  const loader = files['../data/levels.json'];
  if (loader) {
    try {
      const mod = await loader();
      if (Array.isArray(mod.default) && mod.default.length) return (campaign = mod.default);
    } catch {
      /* fall back to the demo levels */
    }
  }
  return (campaign = DEMO);
}

const built = new Map<string, Promise<LevelDef | null>>();
let worker: Worker | null = null;
const waiting = new Map<string, (l: LevelDef | null) => void>();

function genWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: string; level: LevelDef | null }>) => {
      waiting.get(e.data.id)?.(e.data.level);
      waiting.delete(e.data.id);
    };
  }
  return worker;
}

function generate(id: string, n: number, seed?: number): Promise<LevelDef | null> {
  let p = built.get(id);
  if (!p) {
    p = new Promise<LevelDef | null>((resolve) => {
      waiting.set(id, resolve);
      genWorker().postMessage({ id, n, seed });
    });
    built.set(id, p);
  }
  return p;
}

let pool: LevelDef[] | null = null;

/**
 * The endless pool (src/data/levels-endless.json, built offline by scripts/build-endless.ts at
 * campaign quality), loaded on first use; empty if missing.
 */
export async function loadPool(): Promise<LevelDef[]> {
  if (pool) return pool;
  const files = import.meta.glob<{ default: LevelDef[] }>('../data/levels-endless.json');
  const loader = files['../data/levels-endless.json'];
  if (loader) {
    try {
      const mod = await loader();
      if (Array.isArray(mod.default)) return (pool = mod.default);
    } catch {
      /* the worker generates every endless level then */
    }
  }
  return (pool = []);
}

/**
 * A campaign level; past the campaign a level of the endless pool, and past the pool a freshly
 * generated one (the Web Worker; same n = same level).
 */
export async function getLevel(levels: LevelDef[], n: number): Promise<LevelDef | null> {
  if (n <= levels.length) return levels[n - 1] ?? null;
  const p = await loadPool();
  const lv = p.length && n >= p[0].n ? p[n - p[0].n] : undefined;
  if (lv && lv.n === n) return lv;
  return generate('n' + n, n);
}

/** Today's date as YYYY-MM-DD (local time). */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The daily special: one level per calendar day, the same for every player: a normal level of the
 * endless pool (campaign quality), so the kitchen changes from day to day; generated only without
 * a pool.
 */
export async function getDaily(levels: LevelDef[], key = dayKey()): Promise<LevelDef | null> {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  const normals = (await loadPool()).filter((l) => l.tier === 'normal');
  if (normals.length) return normals[h % normals.length];
  let n = levels.length + 1 + (h % 40);
  if (n % 5 === 0) n++;
  return generate('daily' + key, n, h);
}

/** Start building the next endless level early. */
export function prefetch(levels: LevelDef[], n: number): void {
  if (n > levels.length) void getLevel(levels, n);
}
