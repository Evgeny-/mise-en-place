# Mise en Place — development notes

## Under the hood

- **Rules engine** ([`src/core/kitchen.ts`](../src/core/kitchen.ts)). A menu is compiled to integer
  tables; `KitchenRules` is the compact, immutable state the solver, the generator and the hint
  work on. The play simulation ([`src/core/sim.ts`](../src/core/sim.ts)) runs exactly the same
  resolution but remembers which counter spot holds which item and reports events (`take`,
  `prep`, `serve`, `seat`, `lid`, `win`, `stuck`) for the animations. Tests replay hundreds of
  random games and check that both agree after every move, and that the counts match the
  Python design simulations (e.g. 1,008 winning lines on the showcase kitchen).
- **Solver** ([`src/core/solver.ts`](../src/core/solver.ts)). Exhaustive depth-first search with
  memoized results: whether a position can still be won, the safe moves, a winning line, the
  exact win chance of a random player and the number of winning lines. Hint runs it live.
- **Difficulty is measured and searched for** ([`src/core/metrics.ts`](../src/core/metrics.ts),
  [`src/core/measure.ts`](../src/core/measure.ts), [`src/core/guided.ts`](../src/core/guided.ts)).
  Planners that look 1–5 moves ahead, forced and deep decisions, a blind planner and a careful
  deducer for the cloches. Levels are built around a known winning line and hill-climbed toward the
  target band of their campaign stage ([`src/core/targets.ts`](../src/core/targets.ts)); see
  [difficulty.md](difficulty.md).
- **Pantry marks** ([`src/core/pantry.ts`](../src/core/pantry.ts)): frozen tiles (part of the rules:
  a tile thaws after a number of takes) and cloches (not part of the rules: what the player knows;
  a lifted cloche stays lifted after an undo).
- **Rendering** ([`src/render`](../src/render)). three.js with an orthographic camera tilted like
  Pixel Picnic's. The scene is one chef's counter seen by the chef: the worktop runs off the
  bottom of the screen, the guests sit across it behind a low serving ledge, like at a sushi
  bar. `KitchenSet` (worktop, ledge, painted wall, the props in `props.ts` that give the worktop
  its scale), `PantryView` (columns of tiles),
  `CounterView` (landing, combining with puffs and sparkles), `GuestsView` (dishes come together
  at the pass, guests eat, hearts), `FxView` (particles), food models and animal guests built in
  code. The view animates simulation events; quick taps never fight because every slot change
  is logical first and visual after a delay. `icons.ts` renders the same 3D models into small
  images for the tickets and dialogs.
- **UI** ([`src/ui`](../src/ui)): HUD and helper dock, tickets that follow the guests, the map,
  the food-street map, the cookbook, dialogs, in the game's own bistro-menu style
  ([ui-style.md](ui-style.md)).
- **Sound** ([`src/audio/audio.ts`](../src/audio/audio.ts)): Web Audio synth, no files.

```
src/core/     content (menus), rules, simulation, solver, metrics, generator, progression
src/render/   three.js scene: kitchen set, pantry, counter, guests, effects, layout, icons
src/game/     Game: taps → simulation → animated view; undo, hint, extra spot, stars
src/ui/       HUD, tickets, map, cookbook, dialogs (DOM + CSS)
src/app/      app flow, saves, i18n, level loading, rewards
src/audio/    Web Audio synthesizer
scripts/      level builder and audit, icons, art pipeline, screenshot helper
```

## Debug flags

`?level=12` jumps to a level, `?debug=1` unlocks everything and shows each level's numbers (the
pause menu gets *Auto-solve* and *Skip*), `?progress=20` fakes progress, `?coins=999`,
`?boosters=5`, `?demo` lets the solver play, `?reset` clears the save, `?burger` / `?taco` open
the first level of those kitchens. With debug on, the HUD also says live whether the kitchen can
still be won from the current position and how many undos lead back. Keys 1–9 take from a
column, Ctrl/Cmd+Z undoes.

## Scripts

```bash
npm run build                        # typecheck + production build into dist/
bun scripts/build-levels.ts          # generate the campaign → src/data/levels.json
bun scripts/audit-levels.ts          # difficulty tables → docs/difficulty*.md
bun scripts/build-app-icons.ts       # app icons from public/icon.svg
node scripts/shot.mjs <url> <png> [w,h] [ms] [dpr]   # headless screenshot on the GPU
```

Pushing to `main` deploys to evgeny.io/games/mise-en-place/ (`.github/workflows/deploy.yml`).
