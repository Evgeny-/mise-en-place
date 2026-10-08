import { createSim, type PlaySim, type SimEvent } from '../core/sim';
import { Solver, SolverBudgetError } from '../core/solver';
import { greedyStep, kitchenHeuristic } from '../core/metrics';
import type { KitchenRules, KState } from '../core/kitchen';
import type { LevelDef } from '../core/types';
import type { GameView } from '../render/GameView';
import type { KitchenTheme } from '../render/themes';
import { audio } from '../audio/audio';

export interface GameCallbacks {
  onWin(g: Game): void;
  onStuck(g: Game): void;
  /** anything the HUD shows changed (tickets, counts) */
  onChange(g: Game, events: SimEvent[] | null): void;
  onInvalid(g: Game, why: InvalidReason, col: number): void;
}

export type InvalidReason = 'full' | 'lid' | 'frozen' | 'empty' | 'fit' | 'topping';

export type HintResult = { kind: 'safe'; col: number } | { kind: 'dead'; back: number } | { kind: 'none' };

/** Real-time driver: taps → simulation → animated view; undo, hint, extra slot. */
export class Game {
  readonly sim: PlaySim;
  readonly level: LevelDef;
  readonly view: GameView;
  status: 'playing' | 'won' | 'stuck' = 'playing';
  paused = false;
  undos = 0;
  boostersUsed = 0;
  playTime = 0;
  private history: unknown[] = [];
  private cb: GameCallbacks;
  private ended = false;
  private settleAt = 0;

  constructor(view: GameView, level: LevelDef, theme: KitchenTheme, cb: GameCallbacks) {
    this.view = view;
    this.level = level;
    this.cb = cb;
    this.sim = createSim(level);
    view.load(level, this.sim, theme);
  }

  get moves(): number {
    return this.sim.history.length;
  }

  tap(x: number, y: number): void {
    if (this.paused || this.status !== 'playing') return;
    const col = this.view.pickColumn(x, y);
    if (col !== null) this.take(col);
  }

  take(col: number): boolean {
    if (this.status !== 'playing') return false;
    const sim = this.sim;
    if (!sim.canTake(col)) {
      // taco kitchens explain themselves (it won't fit the tortilla you're filling, toppings go last)
      const taco = (sim as unknown as { whyNot?: (c: number) => string | null }).whyNot?.(col);
      const why: InvalidReason =
        taco === 'fit' || taco === 'topping' ? taco
        : sim.remaining(col) === 0 ? 'empty'
        : !sim.lidOpen(col) ? 'lid'
        : sim.thawLeft(col, sim.ptr[col]) > 0 ? 'frozen'
        : 'full';
      audio.play('invalid');
      this.view.shake(col);
      this.cb.onInvalid(this, why, col);
      return false;
    }
    this.history.push(sim.snapshot());
    const events = sim.take(col)!;
    this.view.setHint(-1);
    const dur = this.view.apply(events);
    this.settleAt = this.view.clock + dur;
    if (sim.status === 'won') this.status = 'won';
    else if (sim.status === 'stuck') this.status = 'stuck';
    this.cb.onChange(this, events);
    return true;
  }

  canUndo(): boolean {
    return this.history.length > 0 && this.status !== 'won';
  }

  undo(): boolean {
    const snap = this.history.pop();
    if (!snap) return false;
    this.sim.restore(snap as never);
    this.status = 'playing';
    this.ended = false;
    this.undos++;
    this.view.syncAll(this.sim);
    if (this.view.layout.slotX.length !== this.sim.slots) this.view.relayout();
    audio.play('undo');
    this.cb.onChange(this, null);
    return true;
  }

  /** Undo several moves at once (back to the last winnable position). */
  undoMany(n: number): void {
    for (let i = 0; i < n; i++) {
      const snap = this.history.pop();
      if (!snap) break;
      this.sim.restore(snap as never);
    }
    this.status = 'playing';
    this.ended = false;
    this.undos++;
    this.view.syncAll(this.sim);
    if (this.view.layout.slotX.length !== this.sim.slots) this.view.relayout();
    audio.play('undo');
    this.cb.onChange(this, null);
  }

  /** Is the current position still winnable? (null: too big to tell quickly) */
  winnable(): boolean | null {
    try {
      return new Solver(this.sim.currentRules(), 400_000).winnable(this.sim.state());
    } catch (e) {
      if (e instanceof SolverBudgetError) return null;
      throw e;
    }
  }

  /** dev: the next moves that keep the kitchen winnable (none = lost), or null if too big to tell quickly. */
  safeMoves(): number[] | null {
    try {
      return new Solver(this.sim.currentRules(), 400_000).safeMoves(this.sim.state());
    } catch (e) {
      if (e instanceof SolverBudgetError) return null;
      throw e;
    }
  }

  /** A safe next move, or how far back the last winnable position is. */
  hint(): HintResult {
    try {
      const rules = this.sim.currentRules();
      const solver = new Solver(rules, 800_000);
      const s = this.sim.state();
      const safe = solver.safeMoves(s);
      if (safe.length) {
        // Prefer the move of a stored solution when it is still on track; otherwise the most
        // natural safe move (what a sensible player would pick among the winning ones).
        const planned = this.level.solution?.[this.moves];
        let col = planned !== undefined && safe.includes(planned) && this.followsSolution() ? planned : safe[0];
        if (col !== planned && (this.level.rules ?? 'combo') === 'combo') {
          const kr = rules as unknown as KitchenRules;
          const steps = kr.successors(s as KState).filter(([m]) => safe.includes(m));
          if (steps.length) col = greedyStep(kitchenHeuristic(kr), s as KState, steps)[0];
        }
        return { kind: 'safe', col };
      }
      for (let back = 1; back <= this.history.length; back++) {
        const snap = this.history[this.history.length - back];
        const probe = createSim(this.level);
        probe.restore(snap as never);
        if (new Solver(probe.currentRules(), 800_000).winnable(probe.state())) return { kind: 'dead', back };
      }
      return { kind: 'none' };
    } catch (e) {
      if (e instanceof SolverBudgetError) return { kind: 'none' };
      throw e;
    }
  }

  private followsSolution(): boolean {
    const sol = this.level.solution;
    if (!sol) return false;
    return this.sim.history.every((c, i) => sol[i] === c);
  }

  showHint(col: number): void {
    this.view.setHint(col);
  }

  addSlot(): void {
    this.sim.addSlot();
    if (this.status === 'stuck') this.status = 'playing';
    this.ended = false;
    this.view.relayout();
    this.view.refreshLegal();
    this.cb.onChange(this, null);
  }

  /** Stars: 3 for a clean run, 2 with undo or a booster, 1 with a lot of help. */
  stars(): number {
    const help = this.undos + this.boostersUsed;
    return help === 0 ? 3 : help <= 3 ? 2 : 1;
  }

  update(dt: number): void {
    if (!this.paused && this.status === 'playing') this.playTime += dt;
    this.view.update(this.paused ? 0 : dt);
    if (this.ended || this.paused) return;
    if (this.status === 'won' && this.view.isIdle()) {
      this.ended = true;
      this.cb.onWin(this);
    } else if (this.status === 'stuck' && this.view.clock > this.settleAt + 0.5) {
      this.ended = true;
      this.cb.onStuck(this);
    }
  }

  dispose(): void {
    this.view.unload();
  }
}
