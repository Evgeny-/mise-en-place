import type { LevelDef } from './types';

/**
 * Pantry tile marks shared by every kitchen: frozen tiles and cloches.
 *
 * - Frozen tile [col, row, thaw]: it can be taken only once `thaw` takes were made in total (any
 *   column). Every take removes one pantry item, so the number of takes is the sum of the column
 *   pointers: the rules need no extra state, and the solver's state key already covers it.
 * - Cloche [col, row]: the tile is hidden until it reaches the front of its column. Cloches don't
 *   change the rules at all (the solver and the hint know what is underneath); they change what the
 *   player knows. Once lifted, a cloche stays lifted, even after an undo.
 */

type Marked = Pick<LevelDef, 'columns' | 'frozen' | 'cloches'>;

/** Per column and row: the take count a frozen tile thaws at (0 = not frozen), or null without ice. */
export function thawTable(level: Marked): number[][] | null {
  if (!level.frozen?.length) return null;
  const t = level.columns.map((c) => new Array<number>(c.length).fill(0));
  for (const [c, r, at] of level.frozen) if (t[c] && r < t[c].length) t[c][r] = at;
  return t;
}

/** Takes made so far (zero-waste kitchens: every take removes one pantry item). */
export function takesOf(ptr: readonly number[]): number {
  let n = 0;
  for (const p of ptr) n += p;
  return n;
}

/** Takes still to go before the top of `col` thaws (0 = not frozen or thawed). */
export function frozenLeft(thaw: number[][] | null, ptr: readonly number[], col: number): number {
  if (!thaw) return 0;
  const at = thaw[col]?.[ptr[col]] ?? 0;
  return at > 0 ? Math.max(0, at - takesOf(ptr)) : 0;
}

/** What the player knows of the cloches: which ones are still down. Kept outside sim snapshots. */
export class ClocheMarks {
  /** col -> row -> still covered */
  private down: boolean[][];

  constructor(level: Marked) {
    this.down = level.columns.map((c) => new Array<boolean>(c.length).fill(false));
    for (const [c, r] of level.cloches ?? []) if (this.down[c] && r < this.down[c].length && r > 0) this.down[c][r] = true;
  }

  get any(): boolean {
    return this.down.some((c) => c.some(Boolean));
  }

  /** Lifts the cloches that reached the front of their columns; returns those columns. */
  reveal(ptr: readonly number[]): number[] {
    const out: number[] = [];
    ptr.forEach((p, c) => {
      const col = this.down[c];
      for (let r = 0; r <= p && r < col.length; r++) {
        if (col[r]) {
          col[r] = false;
          if (r === p) out.push(c);
        }
      }
    });
    return out;
  }

  covered(col: number, row: number): boolean {
    return this.down[col]?.[row] ?? false;
  }

  copy(): boolean[][] {
    return this.down.map((c) => c.slice());
  }

  set(down: boolean[][]): void {
    this.down = down.map((c) => c.slice());
  }
}
