import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import type { GameView } from '../src/render/GameView';
import type { LevelDef } from '../src/core/types';
import { THEMES } from '../src/render/themes';
import { BURGER_DEMO } from '../src/app/levels';

/** A view that records calls instead of drawing. */
function fakeView() {
  const calls: string[] = [];
  const view = {
    clock: 0,
    layout: { slotX: [0, 0, 0] },
    load: () => calls.push('load'),
    apply: () => {
      calls.push('apply');
      return 0.4;
    },
    syncAll: () => calls.push('sync'),
    relayout: () => calls.push('relayout'),
    setHint: () => undefined,
    shake: () => calls.push('shake'),
    refreshLegal: () => undefined,
    update(dt: number) {
      this.clock += dt;
    },
    isIdle: () => true,
    unload: () => undefined,
  };
  return { view: view as unknown as GameView, calls };
}

const SHOWCASE: LevelDef = {
  n: 2, world: 0, menu: 'trattoria', tier: 'normal', slots: 3, seats: 2,
  columns: [
    ['tomato', 'tomato', 'tomato', 'potato'],
    ['tomato', 'onion'],
    ['egg', 'potato', 'carrot', 'mushroom', 'pasta'],
    ['onion', 'cheese', 'carrot'],
  ],
  orders: ['minestrone', 'minestrone', 'spaghetti', 'omelette'],
};

function game(level: LevelDef) {
  const { view, calls } = fakeView();
  const events: string[] = [];
  const g = new Game(view, level, THEMES[0], {
    onWin: () => events.push('win'),
    onStuck: () => events.push('stuck'),
    onChange: () => events.push('change'),
    onInvalid: (_g, why) => events.push('invalid:' + why),
  });
  return { g, calls, events };
}

describe('game controller', () => {
  it('plays the hint line to a win and reports it once', () => {
    const { g, events } = game(SHOWCASE);
    for (let i = 0; i < 30 && g.status === 'playing'; i++) {
      const h = g.hint();
      expect(h.kind).toBe('safe');
      if (h.kind === 'safe') g.take(h.col);
    }
    expect(g.status).toBe('won');
    g.update(1);
    g.update(1);
    expect(events.filter((e) => e === 'win')).toHaveLength(1);
    expect(g.stars()).toBe(3);
  });

  it('a fatal first move is caught by the hint, which points back to it', () => {
    const { g } = game(SHOWCASE);
    g.take(0); // the tempting tomato
    expect(g.winnable()).toBe(false);
    const h = g.hint();
    expect(h).toEqual({ kind: 'dead', back: 1 });
    g.undoMany(1);
    expect(g.moves).toBe(0);
    expect(g.winnable()).toBe(true);
    expect(g.stars()).toBe(2);
  });

  it('undo restores the exact position', () => {
    const { g } = game(SHOWCASE);
    const before = JSON.stringify(g.sim.snapshot());
    g.take(2);
    g.take(3);
    g.undo();
    g.undo();
    expect(JSON.stringify(g.sim.snapshot())).toBe(before);
    expect(g.canUndo()).toBe(false);
  });

  it('refuses illegal taps with a reason', () => {
    const tiny: LevelDef = { n: 1, world: 0, menu: 'trattoria', tier: 'normal', slots: 2, seats: 1, columns: [['tomato', 'pasta'], ['cheese'], ['tomato']], orders: ['spaghetti'] };
    const { g, events, calls } = game(tiny);
    g.take(0); // tomato
    g.take(1); // cheese: the counter is full, only the second tomato (sauce) still fits
    expect(g.status).toBe('playing');
    expect(g.take(0)).toBe(false); // pasta has nowhere to go
    expect(events).toContain('invalid:full');
    expect(calls).toContain('shake');
  });

  it('an extra spot un-sticks a full counter', () => {
    const lv: LevelDef = { n: 3, world: 0, menu: 'trattoria', tier: 'normal', slots: 1, seats: 1, columns: [['pasta', 'potato'], ['tomato', 'tomato']], orders: ['spaghetti'] };
    const { g } = game(lv);
    g.take(0); // pasta fills the counter; potato can't be taken, tomato can't combine yet
    expect(g.status).toBe('stuck');
    g.addSlot();
    expect(g.status).toBe('playing');
    expect(g.sim.slots).toBe(2);
    expect(g.sim.canTake(1)).toBe(true);
  });

  it('runs burger kitchens through the same controller', () => {
    const { g } = game(BURGER_DEMO);
    for (let i = 0; i < 30 && g.status === 'playing'; i++) {
      const h = g.hint();
      if (h.kind !== 'safe') break;
      g.take(h.col);
    }
    expect(g.status).toBe('won');
  });
});
