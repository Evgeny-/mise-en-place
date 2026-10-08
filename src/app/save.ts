import type { Lang } from './i18n';

/** Counted boosters (undo is free and unlimited, it only costs a star). */
export type BoosterId = 'hint' | 'slot';
export const BOOSTERS: BoosterId[] = ['hint', 'slot'];

export interface Settings {
  music: number;
  sfx: number;
  lang: Lang | null;
  /** Debug mode: every level unlocked, difficulty stats visible. */
  debug: boolean;
  /** Night mode: follow the system (auto), always on or always off. */
  night: 'auto' | 'on' | 'off';
}

/**
 * Version of the campaign's levels. Bump it when the levels are rebuilt so that old stars no
 * longer fit them: every save then restarts the campaign once (coins, boosters, decor, the
 * cookbook and settings stay).
 */
export const CAMPAIGN_VERSION = 3;

export interface SaveData {
  v: 1;
  /** CAMPAIGN_VERSION the level progress belongs to */
  campaign: number;
  /** Next level to play (highest unlocked). */
  level: number;
  stars: Record<number, number>;
  coins: number;
  boosters: Record<BoosterId, number>;
  /** one-time things already shown: tutorials, intro cards */
  seen: string[];
  /** dishes served at least once (the cookbook) */
  cookbook: string[];
  /** daily special: the last day it was served and the run of days in a row */
  daily: { day: string; streak: number };
  /** decor in use and decor bought ("cloth:polka", …) */
  looks: { cloth: string; plate: string; tile: string; owned: string[] };
  settings: Settings;
}

const KEY = 'mise-en-place-save-v1';

function defaults(): SaveData {
  return {
    v: 1,
    campaign: CAMPAIGN_VERSION,
    level: 1,
    stars: {},
    coins: 50,
    boosters: { hint: 0, slot: 0 },
    seen: [],
    cookbook: [],
    daily: { day: '', streak: 0 },
    looks: { cloth: 'house', plate: 'white', tile: 'ceramic', owned: [] },
    settings: { music: 0.5, sfx: 0.8, lang: null, debug: false, night: 'auto' },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = defaults();
    // saves from before versioning belong to the first campaign
    if ((d.campaign ?? 1) !== CAMPAIGN_VERSION) {
      d.level = 1;
      d.stars = {};
      // new levels may introduce things differently: show their cards again
      d.seen = (d.seen ?? []).filter((k) => !k.startsWith('intro:'));
    }
    return {
      ...base,
      ...d,
      campaign: CAMPAIGN_VERSION,
      boosters: { ...base.boosters, ...(d.boosters ?? {}) },
      settings: { ...base.settings, ...(d.settings ?? {}) },
      seen: Array.isArray(d.seen) ? d.seen : [],
      cookbook: Array.isArray(d.cookbook) ? d.cookbook : [],
      daily: d.daily ?? base.daily,
      looks: { ...base.looks, ...(d.looks ?? {}) },
      stars: d.stars ?? {},
    };
  } catch {
    return defaults();
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: progress lives for this session only */
  }
}

export function resetSave(): SaveData {
  const d = defaults();
  writeSave(d);
  return d;
}
