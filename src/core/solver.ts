import type { Rules } from './kitchen';

/** surv() value of a position from which the level can still be won. */
export const WIN = 1e9;

export class SolverBudgetError extends Error {
  constructor(states: number) {
    super(`solver budget exceeded (${states} states)`);
  }
}

type WithSuccessors<S> = Rules<S> & { successors?(s: S): [number, S][] };

/**
 * Exact solver: depth-first search over every reachable position with memoized results.
 * Levels are zero-waste and every move takes one item, so the search is finite and acyclic.
 */
export class Solver<S> {
  readonly rules: WithSuccessors<S>;
  private memo = new Map<string, number>();
  private pmemo = new Map<string, number>();
  private wmemo = new Map<string, number>();
  private budget: number;

  constructor(rules: WithSuccessors<S>, budget = 3_000_000) {
    this.rules = rules;
    this.budget = budget;
  }

  get states(): number {
    return this.memo.size;
  }

  successors(s: S): [number, S][] {
    const r = this.rules;
    if (r.successors) return r.successors(s);
    return r.moves(s).map((m) => [m, r.play(s, m)] as [number, S]);
  }

  /**
   * WIN if the level can still be won from `s`; otherwise the largest number of moves that can
   * still be played before getting stuck (0 = stuck now).
   */
  surv(s: S): number {
    const key = this.rules.key(s);
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    if (this.rules.isWin(s)) {
      this.memo.set(key, WIN);
      return WIN;
    }
    if (this.memo.size >= this.budget) throw new SolverBudgetError(this.memo.size);
    let best = -1;
    for (const [, n] of this.successors(s)) {
      const v = this.surv(n);
      if (v === WIN) {
        best = WIN;
        break;
      }
      if (v > best) best = v;
    }
    const v = best === WIN ? WIN : best + 1;
    this.memo.set(key, v);
    return v;
  }

  winnable(s: S = this.rules.start()): boolean {
    return this.surv(s) === WIN;
  }

  /** Moves that keep the level winnable. */
  safeMoves(s: S): number[] {
    return this.successors(s)
      .filter(([, n]) => this.surv(n) === WIN)
      .map(([m]) => m);
  }

  /** A winning line from `s` (leftmost safe move each time), or null. */
  solution(s: S = this.rules.start()): number[] | null {
    if (this.surv(s) !== WIN) return null;
    const line: number[] = [];
    while (!this.rules.isWin(s)) {
      const next = this.successors(s).find(([, n]) => this.surv(n) === WIN)!;
      line.push(next[0]);
      s = next[1];
    }
    return line;
  }

  /** Exact win probability of a player who picks a uniformly random legal move. */
  pRandom(s: S = this.rules.start()): number {
    const key = this.rules.key(s);
    const hit = this.pmemo.get(key);
    if (hit !== undefined) return hit;
    let v: number;
    if (this.rules.isWin(s)) v = 1;
    else if (this.surv(s) !== WIN) v = 0;
    else {
      const next = this.successors(s);
      v = next.length ? next.reduce((a, [, n]) => a + this.pRandom(n), 0) / next.length : 0;
    }
    this.pmemo.set(key, v);
    return v;
  }

  /** Number of distinct winning move sequences (can be huge; returned as a float). */
  countWins(s: S = this.rules.start()): number {
    const key = this.rules.key(s);
    const hit = this.wmemo.get(key);
    if (hit !== undefined) return hit;
    let v: number;
    if (this.rules.isWin(s)) v = 1;
    else if (this.surv(s) !== WIN) v = 0;
    else v = this.successors(s).reduce((a, [, n]) => a + this.countWins(n), 0);
    this.wmemo.set(key, v);
    return v;
  }
}
