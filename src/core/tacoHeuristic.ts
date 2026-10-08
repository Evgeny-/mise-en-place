import type { Heuristic } from './metrics';
import { TACO_ITEMS, type TacoRules, type TState } from './taco';

const TOMATO = 8;
const TORTILLA = 12;
/** item index -> raw items it is made of (salsa -> tomato + onion, guacamole -> avocado + lime) */
const EXPAND: number[][] = TACO_ITEMS.map((_, i) => (i === 6 ? [8, 9] : i === 7 ? [10, 11] : [i]));

/**
 * The research engine's greedy player, and a position value for the thinking player.
 * - priority 3: the take serves a guest; 2: it adds a filling to an open container that still fits a
 *   seated guest's ticket; 1: a seated guest still needs the item (containers, fillings and prep
 *   halves on the counter count as supply); 0: anything else. Ties go to the leftmost column.
 * - value: 1000 per served dish, +60 per folded taco waiting for its guest, +25 per filling in an
 *   open container that fits a seated guest (+10 if it only fits a queued one), −6 per slot in use,
 *   +8 per column that can be taken (the guard dims the others: a player sees them). Without the
 *   last term a player planning 2–3 moves ahead walks into "stuck with free slots" even on the
 *   tutorial (L81: 50% -> 100%; 66% -> 75% over a trial build of the campaign).
 */
export function tacoHeuristic(r: TacoRules): Heuristic<TState> {
  const dem = new Array<number>(TACO_ITEMS.length).fill(0);
  const deficit = (s: TState): number[] => {
    const K = r.kitchen(s);
    dem.fill(0);
    for (const d of K.seats) {
      if (d < 0) continue;
      const t = r.tickets[d];
      dem[TORTILLA + t.c]++;
      for (const f of t.exact) for (const x of EXPAND[f]) dem[x]++;
    }
    for (const b of K.opens) {
      dem[TORTILLA + b.c]--;
      for (const f of b.f) for (const x of EXPAND[f]) dem[x]--;
    }
    for (const f of K.loose) for (const x of EXPAND[f]) dem[x]--;
    for (let i = 0; i < 4; i++) dem[TOMATO + i] -= K.raws[i];
    return dem.slice();
  };
  /** fillings in open containers that still fit a seated guest's ticket */
  const progress = (s: TState): number => {
    const K = r.kitchen(s);
    let p = 0;
    for (const b of K.opens) if (b.f.length && K.seats.some((d) => d >= 0 && r.fits(d, b.c, b.f, -1))) p += b.f.length;
    return p;
  };
  return {
    wanted: (s) => deficit(s),
    priorities(s, steps) {
      const sv = r.served(s);
      let p0 = -1;
      let def: number[] | null = null;
      return steps.map(([m, n]) => {
        if (r.served(n) > sv) return 3;
        if (p0 < 0) p0 = progress(s);
        if (progress(n) > p0) return 2;
        def ??= deficit(s);
        return def[r.top(s, m)] > 0 ? 1 : 0;
      });
    },
    value(s) {
      const K = r.kitchen(s);
      let v = 1000 * K.served + 60 * K.closed.length - 6 * K.occ + 8 * r.moves(s).length;
      for (const b of K.opens) {
        if (!b.f.length) continue;
        v += (K.seats.some((d) => d >= 0 && r.fits(d, b.c, b.f, -1)) ? 25 : 10) * b.f.length;
      }
      return v;
    },
  };
}
