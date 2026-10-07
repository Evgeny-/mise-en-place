# Pot Luck: build brief for a coding agent

You are building a playable prototype of **Pot Luck**, a calm mobile puzzle game, and running experiments to find the version of its rules that is most fun to think about. Work in a new folder, `~/Projects/pot-luck`. Treat the owner's shipped game **Pixel Picnic** (`~/Projects/ants`) as the reference implementation for stack, look, tooling and level pipeline. Read from it and copy files out of it, but never modify it.

## 0. Reuse from Pixel Picnic (`~/Projects/ants`)

Read `README.md` and `docs/development.md`, `docs/performance.md` and `docs/design-notes.md` first. Pixel Picnic is a shipped game with a solid architecture: copy its structure rather than inventing a new one.

**Stack:** TypeScript 7, Vite 7, three 0.186, vitest 3, Nunito (`@fontsource-variable/nunito`). Content scripts run with **bun**, and CI uses Node 22.

**Architecture**
- **`index.html`:** `#stage` holds the WebGL canvas and `#ui` is the DOM overlay. Only the overlay's children take pointer events.
- **`src/core/`:** pure, deterministic rules with no DOM.
  - `types.ts` (level data), `sim.ts` (a rules engine that emits `SimEvent[]`, with a cheap `clone()` and a hashed `key()`), `solver.ts`, `generator.ts`, `progression.ts`.
  - `rng.ts` (sfc32 + FNV): copy it as is.
- **`src/game/Game.ts`:** the driver. It handles undo through `Sim.clone()` snapshots, boosters, and taps queued while slots are full (`DispatchQueue.ts`).
- **`src/render/`:** the three.js view. `GameView.apply(events)` only animates what the simulation already decided.
- **`src/ui/`:** DOM screens (`Hud`, `MapScreen`, dialogs, an `h()` helper).
- **`src/app/`:** `App.ts` (screen flow, URL flags), `save.ts` (localStorage), `i18n.ts` (an `{en, ru}` string table) and `levels.ts`. Endless mode generates levels in a worker.
- **`src/audio/audio.ts`:** synthesized Web Audio, with no audio files. Copy it and rename the sound effects.

**Rendering:** files to read are `GameView.ts`, `layout.ts`, `BoardView.ts`, `pieces.ts`, `FxView.ts`, `GroundView.ts`, `groundPainter.ts`, `AdaptiveRenderScale.ts`, `textures.ts` and `palette.ts`.
- An orthographic camera tilted about 30°, fitted to the free area between HUD elements.
- `layout.ts` is a pure function that is unit-tested, with a landscape switch.
- Lighting: RoomEnvironment plus a hemisphere light plus one shadow-casting sun, Neutral tone mapping, MeshStandardMaterial.
- Rounded-box or lathe geometry with deduped vertices, instanced meshes, and procedural canvas textures.
- Mobile: `AdaptiveRenderScale` lowers pixel density when frames get slow, `LOW_END` tweaks reduce load on weak phones, and `compileAsync` warms up shaders.
- For Pot Luck: render the cutting board, tiles and pots this way. Tiles are rounded boxes with an ingredient sprite and an arrow; slides and plops are event-driven animations.

**Look:**
- Tokens live in `src/ui/base.css` and `src/ui/ui.css`: ink `#2b2140`, cream `#fff7e8`/`#fbe8c8`, purple `#8b5cf6`, yellow `#ffc933`, green `#5ccf4a`, blue `#45b3ff`, red `#ff5a5f`.
- Components: glossy `.btn` with a 6 px bottom edge, `.dialog` with a raised title pill, the purple booster dock, and the map trail with level nodes.
- Night mode (`html.night` + `GameView.setNight`) and world themes (`src/render/themes.ts`).
- Fluent Emoji icons come through `scripts/build-icons.ts`.
- Check colour readability with `src/render/palette.ts`, which matters for telling ingredients apart.
- Keep this look so the two games feel like one family.

**Art pipeline** (both paths exist, no API key needed):
- **Emoji path:** `scripts/lib/emoji.ts` renders Fluent, Twemoji or Noto icons with resvg, and `scripts/lib/pixelart.ts` (`pixelize()`) turns them into clean pixel art. This is the fastest way to get tomato, carrot, egg, cheese and similar tiles.
- **Generated path:** Z-Image Turbo runs **locally** through **mflux** (MLX, `mflux-community/z-image-turbo-mflux-q4`) at 640×640, 8 steps, about 1 minute per image on the owner's Mac.
  - The weights are in `~/.cache/huggingface/hub`, and mflux was run from a throwaway uv environment.
  - Copy `scripts/art/generate.py` (queue runner, skips finished images) as is.
  - Adapt `scripts/art/scenes.py`: keep the style suffix and the SIMPLE template ("One big cute {s} in the center…"), and swap the scene list for ingredients, pots and dishes.
  - Turn images into tiles with `pixelart.py` (`posterize`, `mode_downsample_fx`, `outline_pass`), and cut out backgrounds with the `backgroundRegion()` idea in `scripts/build-illustrated.ts`.
  - Generated PNGs stay in `.cache/` and are not committed.

**Solver, generator and difficulty search:** this is the most valuable thing to reuse.
- **Solver** (`src/core/solver.ts`):
  - memoized depth-first search with `moveScore` move ordering and a failed-state memo;
  - a node budget, returning solved, unsolvable or unknown;
  - simulated players: random, casual, greedy, and a planner with limited lookahead;
  - `criticalDecisions`: points on the solution where another move fails.
- **Generator** (`src/core/generator.ts`):
  - a solution is built in by construction (`buildSequence`);
  - a "hardness" knob is bisected against `objective()`, the distance from the win-rate bands set by `tierTarget()`;
  - `tuneLevel` runs a local search where every candidate is solver-checked, and `ensureCritical` adds critical decisions until there are enough.
- **Campaign:**
  - `progression.planLevel(n, tier)`: every 5th level is hard, every 10th super hard;
  - each mechanic has an intro level and an intro dialog (`App.introMechanic`).
- **Builders:** `scripts/build-levels.ts` (checkpoints, env flags), `refine-campaign.ts` and `audit-campaign.ts` (re-measure with fresh seeds, contact sheets).
- **Also borrow from `~/Projects/water-sort`:**
  - the "effort" metric in `lab/src/engine/solver.ts`: log2 of positions explored per solution move, median of several noisy runs;
  - `scripts/levelgen.ts` (simulated-annealing `harden`, `searchSteered`) and `scripts/build-tracks.ts` (target difficulty curve, boss levels);
  - water-sort's **orders mode**, a queue of cups with N visible at a time, which is a direct model for recipe queues;
  - `solveAsync.ts`, which runs hint solving in a worker.

**Tests and conventions:**
- vitest runs in a plain Node environment, with `localStorage` stubbed and audio mocked.
- Copy the templates: `sim.test.ts`, `campaign.test.ts` (every stored solution replays), `palette.test.ts` and `save.test.ts`.
- URL flags (`?debug=1`, `?level=N`, `?boosters=K`, `?demo`, `?perf=1`) are very handy. Keep them.
- Generated level JSON is committed, caches go in `.cache/`, developer docs in `docs/`, and the README stays player-facing.
- Commit messages are one plain sentence about the player-visible change.
- Design options are shown to the owner as small comparison pages in `_review/<topic>/index.html`. Use that for rule and art variants too.
- Deployment (`.github/workflows/deploy.yml` → `evgenyio.github.io/games/<name>`) exists, but **do not set up deploys or push anywhere without the owner's OK.**

## 1. Who this is for

The owner is an indie developer who has shipped two browser puzzle games: Pixel Picnic (Pixel Flow-like, three.js) and a Water Sort game (`~/Projects/water-sort`). He wants puzzles with **no timer and no move limit** that feel relaxing but make you think about every move. He dislikes time-management cooking games. He needs levels that can be **generated in large numbers** and a campaign where **difficulty keeps growing** through new mechanics. He has not settled the rules yet: part of your job is to try variations and report back with evidence.

## 2. The core idea

Pot Luck is "Arrows with recipes". Arrows – Puzzle Escape was the #2 most downloaded mobile game worldwide in May 2026, and its clones are charting too. In Arrows you tap a tile, it slides the way its arrow points, and it leaves the board if nothing is in its lane. Pot Luck adds a reason to care about order:

- Every tile is an **ingredient** with an arrow (up, down, left or right).
- Tap a tile: if its lane to the board edge is clear, it slides off. If another tile is in the lane, it doesn't move (a gentle shake, no penalty).
- Each **edge of the board feeds a pot**. Each pot shows a **recipe in order**, e.g. Soup: onion → garlic → tomato → carrot, with the next ingredient highlighted.
- An ingredient that leaves through an edge lands in that edge's pot. If it is the pot's **next** ingredient, the recipe advances. When the recipe is complete, the pot is served.
- If it is **not** the next ingredient, it goes to the **side bowl**, a small holding area with 3 spots. Later the player taps a bowl item to send it to a pot whose next ingredient it is. If the bowl is full, a wrong slide is not allowed.
- **Win:** every pot served and the board empty (levels are zero-waste). **Stuck:** no legal move, so offer undo or restart. No lives, no timer.

### Tiny worked example

```
             SOUP (top edge): onion → tomato
          +---------------------+
          |  .     T^     .     |
          |  O^    .      C>    |   STEW (right edge): carrot
          |  .     .      .     |
          +---------------------+
T^ = tomato pointing up, O^ = onion pointing up, C> = carrot pointing right
```

- Tapping `T^` first works mechanically (its lane is clear), but the soup needs onion first, so the tomato goes to the side bowl and uses 1 of 3 spots.
- Better: tap `O^` (soup advances to tomato), then `T^` (soup served), then `C>` (stew served).
- In real levels, the needed ingredient is usually **blocked** by ingredients nobody needs yet. You can only park 3 of them, and everything you park must still be deliverable later. Several pots compete for the same ingredients. That is the puzzle: **choose which blockers to park, and in what order, so every pot gets its next ingredient in time.**

### Warning: the baseline may be too shallow

With the baseline rules, delivering a pot's next ingredient is **always safe**. It only advances a recipe and frees a cell. So all the depth sits in side-bowl management, and a greedy player ("deliver if possible, otherwise park something") may win most levels. **Measure this first.** If greedy wins too often, the variants in section 4 that break this "always safe" property are the priority. Examples: an ingredient that two pots both want, chopped vs whole, lids, turntables, stacked tiles.

## 3. Mockups that exist (for orientation)

Two concept screens were sketched. The owner can show them to you; the link is private.
- **Level 27:** 6×6 cutting board, 4 pots (Soup top, Stew right, Curry bottom, Salad bowl left), each with a recipe strip showing the next ingredient. Tiles are colored rounded squares with an ingredient icon and a small arrow tab. A dotted line shows the clear lane of the tile being suggested. Side bowl with 3 spots below the bottom pot. Booster bar: Undo, Restart, +1 bowl spot, Hint.
- **Level 31 (new mechanic):** a steel "knife lane" across the board. Anything that slides across it arrives **chopped**. Soup wants chopped carrot, stew wants it whole. Only up/down arrows, two pots, walls on the sides.

## 4. Variations to try (implement as rule flags)

Implement the baseline first, then as many of these as you can behind flags, so one engine, solver and generator handle all of them. Prioritize the ones marked ★, which break "always safe".

**Recipe rules**
- R1 strict order (baseline). R2 any order (an easier tutorial mode). R3 partial order: "base" items first, the rest in any order.
- ★ R4 recipe queue: a served pot loads its next recipe, so the same ingredient means different things over time.

**Wrong deliveries**
- B1 side bowl size 2, 3 or 4. B2 no bowl at all: a wrong tile simply can't leave, a pure ordering puzzle.
- B3 the bowl auto-delivers when a pot's next ingredient matches.

**Edges and pots**
- E1 four pots, one per edge. E2 two pots and two walls; tiles pointing at a wall can't leave until a mechanic redirects them.
- ★ E3 split edges: the left half of the top edge feeds Soup and the right half feeds Salad, so routing depends on position.
- E4 a customer window instead of a pot: the "feeding" flavor, wants a set in any order.

**Tile and board mechanics**
- ★ M1 knife lane: crossing it turns X into "chopped X", and recipes ask for one or the other.
- M2 hot plate lane: raw → cooked, the same idea.
- ★ M3 turntable cell: a tile passing over it turns 90°, which changes its pot.
- M4 long tiles (leek, baguette) that cover 2 cells.
- ★ M5 stacked tiles: under the top ingredient sits another one with its own arrow, revealed when the top one leaves.
- M6 sticky dough: stops at the first obstacle instead of refusing to move, so the board changes.
- ★ M7 lids: a pot opens only after another pot is served.
- M8 wildcard spice, which counts as any ingredient once.
- M9 frozen tile: can't move until a neighbor has left.
- M10 mirror plate: deflects a sliding tile 90°.

**Goals**
- G1 clear the board (baseline). G2 cook N dishes, leftovers allowed. G3 stars for never using the side bowl ("perfect cook").

Feel free to invent better ones. Report which twists give the most depth for the least extra rules to learn.

## 5. Level generator (guaranteed solvable)

Build levels backwards, the way Arrows generators work:
1. Pick recipes per pot (and queues, if the variant has them).
2. Interleave the recipes into one removal order that respects each pot's order. Optionally insert a few deliberate "park in the bowl" detours.
3. Place tiles in **reverse removal order**. When placing tile *k*, put it on an empty cell whose lane to its pot's edge avoids every tile already placed: those are removed **after** *k*, so they are still on the board when *k* moves. Tiles placed later are removed earlier, so they may sit in *k*'s lane.
4. For variants (knife lane, turntables, mirrors, stacks), use the same idea with that variant's movement rules. Verify every level with the solver, never trust construction alone.
5. Generate many candidates per difficulty band, score them (section 6), keep the best, and order them into a campaign.

## 6. Solver and difficulty metrics

- State = remaining tiles (bitmask) + pot progress + bowl contents (multiset) + variant state. Use DFS/IDA* with a memo on canonical state hashes. Prune with safe moves where a variant allows it: in the baseline, delivering a next-needed ingredient is safe.
- Per level, report: solvable (must be 100%), optimal solution length, **greedy win rate**, **random win rate** (~200 rollouts), peak bowl spots the best line needs, **trap density** (the share of legal moves at each step that make the level unsolvable, averaged along the solution), first-move traps, and the number of distinct solutions (sampled).
- Target bands for the campaign. Levels 1–10: greedy wins (teaching). Levels 11–40: greedy fails 20–40%. Levels 41+: greedy fails 40–70%, but there is always at least one non-obvious safe move, never a guess. Tune toward this with the generator knobs: board size, tile count, pots, recipe length, bowl size, ingredient variety, detours in the golden line, twists.
- Reuse Pixel Picnic's difficulty search and scoring ideas wherever they fit (section 0).

## 7. Work plan

1. **Read and plan (short).** Read Pixel Picnic's docs and the key files listed in section 0. Write `docs/PLAN.md`: what you'll reuse, what you'll write fresh, and the rule flags you'll build.
2. **Engine.** Pure TypeScript rules with no rendering: board, tiles, pots, bowl, moves, win/stuck, every variant flag. Unit tests (vitest), plus an ASCII board printer for debugging.
3. **Solver, generator, metrics.** CLI scripts (bun, like Pixel Picnic's `levels` script) that generate N levels per variant and band and print a metrics table.
4. **Experiments.** Run the baseline and every variant. Write `docs/EXPERIMENTS.md` with a comparison table (greedy win %, trap density, solution length, generator yield, rules-to-learn cost) and pick the top 2–3 rule sets with reasons. Include one concrete "trap" example per rule set: a starting board, the tempting move and why it loses, and the right line.
5. **Playable prototype.** A portrait, mobile-first web build in Pixel Picnic's style (three.js scene or the same DOM/CSS layer it uses) with: tap to slide, a blocked shake, a lane preview on press, recipe strips with the next ingredient highlighted, the side bowl, undo, restart, hint, stars, and a level select. Ship about 40 levels: a tutorial ramp, then 2–3 twists, each introduced on a one-screen teaching level.
6. **Art.** Make ingredient tiles (tomato, onion, carrot, mushroom, potato, garlic, pasta, cheese, egg, plus chopped versions) and pots. It doesn't need to be high quality yet.
   - Start with the emoji path (`emoji.ts` + `pixelize()`).
   - Try the local Z-Image Turbo path for 4–6 ingredients, using the copied `generate.py` and an adapted `scenes.py`.
   - Put both side by side on `_review/art/index.html` so the owner can pick a direction.
   - Check every ingredient pair for readability with `palette.ts`.
7. **Report.** `docs/DESIGN.md` covering final rules, the recommended rule set, the difficulty ladder for levels 1–100 (which twist unlocks when), open questions, and screenshots or a short GIF.

## 8. Acceptance criteria

- Every shipped level is solver-verified, and levels in each band hit the target metrics.
- No timer, no move limit, unlimited undo. Getting stuck leads to a gentle restart or undo prompt.
- Every rule is visible on screen: next ingredient, lane preview, bowl spots left.
- Runs at 60 fps on a mid-range phone browser. Portrait 390×844 first.
- `npm test` passes. A README explains how to run the game, the generator and the experiments.

## 9. Constraints

- Don't modify `~/Projects/ants` or `~/Projects/water-sort`. Copy what you need.
- Don't create remotes, push or set up deployment unless the owner asks. Local commits are fine.
- Image generation runs locally (mflux), so there's no API cost. Still, ask before kicking off more than ~30 images, since each takes about a minute. Never print or commit secrets.
- Keep the engine deterministic: the same seed gives the same level.
- Prefer small, readable modules. Comment only where a rule is subtle.
- When a rule is ambiguous, pick the version that's easier to understand on screen, note it in `docs/DESIGN.md`, and move on.
