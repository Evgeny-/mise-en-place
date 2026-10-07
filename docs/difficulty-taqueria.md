# Difficulty: the Taquería (world 3)

Built by `bun scripts/build-taqueria.ts` into `src/data/levels-taqueria.json` and merged into the
campaign by `bun scripts/merge-levels.ts`; this file's tables are written by
`bun scripts/audit-levels.ts`. The ladder and targets live in `src/core/tacoGen.ts`
(`taqueriaSpec`, `taqueriaTarget`), the rules in `src/core/taco.ts`. The Taquería's 40 local levels
are spread over 8 shifts of the campaign (T T B T B Q T B Q T B Q T B Q T B Q T B Q B Q Q); tiers follow the local index as in every
kitchen: every 5th level is hard, every 10th a banquet, and a new dish or mechanic always comes on a
normal level.

## Rules in one paragraph

A tortilla (holds 3) or a burrito wrap (holds 4) lands open and takes a slot. The newest open
container receives every filling that lands (no slot); full, it folds into a taco and the previous
open one receives again. With nothing open a filling waits loose (one slot), and the next container
scoops the loose fillings in arrival order. Tomato + onion = salsa, avocado + lime = guacamole; the
product drops in like a filling. A folded taco goes to the leftmost guest who ordered it, or waits
(one slot) until that guest sits down. The fit guard dims a column whose top would make a taco no
remaining ticket can take, and the landing-slot rule lets a full counter accept only takes that
resolve. Twist from local L31: a ticket marks a topping that must go in last.

## Players and numbers

The same players and stats as the Trattoria (see difficulty.md), with the Taquería heuristic:

- **Greedy** (the design research's greedy player, reproduced exactly): a take that serves, else one
  that adds a filling to an open container that still fits a seated guest's ticket, else an item a
  seated guest still needs, else the leftmost column.
- **Thinking player**: plans 2 or 3 moves ahead with a position value of served dishes, waiting
  tacos, fillings in containers that fit a seated guest, free slots, and **columns that can still be
  taken**. Without that last term it walks into "stuck with free slots" even on the tutorial (L81:
  50% → 100%). The tables use a 128-game holdout sample per level.
- **Tight** is recorded but not targeted: with 4 slots only ~10% of candidates are unwinnable with
  3, and the counter isn't this world's main dial (the receiving tortilla is).

The engine is checked against the research engine (`taco.py`) on 75 levels
(`tests/fixtures/taco-parity.json`): winning-line counts, exact random win, legal moves, trap
depths, solutions, greedy lines and required lookahead all agree. The research showcase:
20,374 winning lines, random win 39.9%, `take c1` fatal (stuck within 3 moves), lookahead 4.

## Menu

Twelve dishes, all made the taco way (a container and its exact fillings): tacos (a tortilla + 3)
carnitas (pork, salsa, cheese), pollo (chicken, salsa, lettuce), veggie (beans, corn, lettuce),
frijol (beans, cheese, salsa) and verde (chicken, guacamole, corn); the quesadilla (chicken and a
double helping of cheese) and the tostada (beans, lettuce, guacamole); burritos (a wrap + 4)
carnitas, pollo, veggie and verde, and enchiladas (chicken, beans, cheese, salsa). Every taco and
its burrito share a colour on the plate (red carnitas, gold pollo, green veggie, purple frijol, teal
verde), so they are told apart at a glance. Every level mixes two or three dishes (banquets more),
spread evenly, and neighbouring levels never serve the same set.

## Targets

The fit guard and the landing-slot rule remove every one-move blunder, so random play is stronger
than in the Trattoria and the random-win bands sit higher (as in the research tiers).

| Levels (local) | Random win | Lookahead | Critical decisions | Thinking player | Also |
|---|---|---|---|---|---|
| L1–2 | 50%–100% | 0–1 | ≥ 1 | – | – |
| L3 | 35%–90% | 0–2 | ≥ 1 | – | – |
| L4 (park intro) | 20%–90% | 1–4 | ≥ 1 | 60%–100% | – |
| L5 (gentle hard) | 6%–25% | 2–6 | ≥ 3 | 40%–100% | greedy loses, trap ≤ 10 (soft) |
| Normal, L6 → L39 (slides linearly) | 12%–40% | 2–6 | ≥ 2 (≥ 1 after ⅓) | 50%–100% | greedy loses, random from ⅓ ≤ 60%, trap ≤ 10 (soft) |
| Normal, L39 | 5%–18% | 2–8 | ≥ 4 (≥ 1 after ⅓) | 50%–100% | greedy loses, random from ⅓ ≤ 60%, trap ≤ 10 (soft) |
| Intro levels (6, 8, 11, 13, 16, 21, 23, 31) | 12%–50% | 1–6 | ≥ 2 | 60%–100% | random from ⅓ ≤ 70% |
| Hard (15, 25, 35) | 1%–6% | 5–12 | ≥ 5 (≥ 3 after ⅓) | 25%–85% | greedy loses, random from ⅓ ≤ 30%, trap ≤ 12 (soft) |
| Banquet L10 | 1%–8% | 4–12 | ≥ 6 (≥ 3 after ⅓) | 20%–80% | greedy loses, random from ⅓ ≤ 30%, trap ≤ 14 (soft) |
| Banquets L20, 30, 40 | 0.3%–3% | 6–14 | ≥ 7 (≥ 4 after ⅓) | 15%–75% | greedy loses, random from ⅓ ≤ 20%, trap ≤ 14 (soft) |

L4 must be unwinnable if the OLDEST tortilla received; L7 must be unwinnable without the scoop.

Teaching order: a tortilla catches fillings and salsa drops in (1–3, the chicken taco at 2) → park a
half-made taco under a new tortilla (4) → the quesadilla's double cheese (6) → queued tickets and
the scoop (7) → frijol (8) → a 3-slot counter (11) → burritos next to tacos: which container
receives? (13) → enchiladas (16) → guacamole and taco verde (21) → the tostada (23) → topping last (31).

## Measured (40 levels)

| Tier | Levels | Random win (mean / median) | Random from ⅓ | Greedy wins | Thinking wins | Lookahead | Critical decisions | Safe-move ratio | Items | Slots | Tight |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Teaching, L1–4 | 4 | 59.1% / 59.3% | 55.9% | 75% | 96% | 0.3 | 1.3 (1.3 late) | 0.96 | 13.0 | 4 | 0/4 |
| Normal, L6–39 | 28 | 19.1% / 18.6% | 19.4% | 0% | 78% | 4.6 | 5.9 (4.1 late) | 0.89 | 22.8 | 3–4 | 2/28 |
| Hard, L5–35 | 4 | 7.1% / 4.3% | 15.5% | 0% | 57% | 9.0 | 7.3 (4.3 late) | 0.88 | 23.8 | 3–4 | 3/4 |
| Banquets, L10–40 | 4 | 2.1% / 1.5% | 1.6% | 0% | 37% | 11.0 | 13.5 (9.0 late) | 0.80 | 28.0 | 4 | 1/4 |

## Levels

Dishes: Ca carnitas, Po pollo, Ve veggie, Fr frijol, Vd verde, Qu quesadilla, To tostada; BCa, BPo,
BVe, BVd the burritos, En enchiladas. Board = columns × tallest column.

| Local | # | Tier | Teaches | Guests | Items | Board | Slots | Seats | Random | From ⅓ | Greedy | LA | Critical | Trap | Thinking | Tight |
|---:|---:|---|---|---|---:|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| 1 | 26 | normal | **new: tortilla** — a tortilla catches the next three fillings | Ve Ca | 9 | 2×5 | 4 | 1 | 75.0% | 50% | wins | 0 | 1/5 | 0 | 100% | – |
| 2 | 27 | normal | **new: chicken taco** — salsa drops into the tortilla | Po Po Ca | 15 | 3×5 | 4 | 2 | 69.5% | 67% | wins | 0 | 1/10 | 0 | 100% | – |
| 3 | 28 | normal | finish one taco before the next filling | Ve Ve Po | 13 | 3×5 | 4 | 2 | 49.1% | 56% | wins | 0 | 1/7 | 3 | 100% | – |
| 4 | 29 | normal | **new: park** — park a half-made taco under a new tortilla | Po Po Ca | 15 | 3×5 | 4 | 2 | 42.9% | 51% | loses | 1 | 2/12 | 3 | 83% | – |
| 5 | 30 | hard | tortilla stack | Ca Ve Po Po | 19 | 4×5 | 4 | 2 | 17.1% | 40% | loses | 5 | 3/15 | 4 | 84% | yes |
| 6 | 41 | normal | **new: quesadilla** — chicken and double cheese | Qu Ve Qu | 12 | 3×5 | 4 | 2 | 38.6% | 25% | loses | 3 | 2/5 | 2 | 80% | – |
| 7 | 42 | normal | a taco for the queue; loose fillings get scooped in order | Ca Po Ca Qu | 19 | 4×5 | 4 | 2 | 25.3% | 23% | loses | 4 | 4/16 | 3 | 74% | – |
| 8 | 43 | normal | **new: bean taco** — beans, cheese and salsa | Fr Fr Ca Ca | 20 | 4×5 | 4 | 2 | 30.7% | 12% | loses | 6 | 6/18 | 8 | 72% | – |
| 9 | 44 | normal | plan for the queue | Po Fr Fr Ve | 19 | 4×5 | 4 | 2 | 23.1% | 16% | loses | 3 | 3/12 | 2 | 84% | – |
| 10 | 45 | superhard | banquet: taco night | Po Fr Ca Ve Qu | 23 | 5×5 | 4 | 2 | 4.9% | 4% | loses | 8 | 6/17 | 7 | 41% | – |
| 11 | 56 | normal | **new: 3-slot counter** — small counter: three slots | Qu Ca Ca Fr | 19 | 4×5 | 3 | 2 | 28.2% | 10% | loses | 3 | 6/15 | 6 | 91% | – |
| 12 | 57 | normal | small counter | Fr Po Ve Po | 19 | 4×5 | 3 | 2 | 21.7% | 39% | loses | 5 | 3/16 | 4 | 80% | – |
| 13 | 58 | normal | **new: burrito** — a wrap holds four | BVe Po Po BVe | 20 | 4×5 | 4 | 2 | 16.6% | 23% | loses | 5 | 6/15 | 4 | 78% | – |
| 14 | 59 | normal | which container is receiving? | Qu Ca Qu BVe | 18 | 4×5 | 4 | 2 | 18.8% | 44% | loses | 6 | 2/13 | 5 | 73% | – |
| 15 | 60 | hard | three-slot rush | Po Fr Fr BVe Po | 25 | 5×5 | 3 | 2 | 2.6% | 16% | loses | 12 | 9/16 | 11 | 30% | yes |
| 16 | 71 | normal | **new: enchiladas** — chicken, beans, cheese, salsa | En Ve Ve En | 20 | 5×5 | 4 | 2 | 25.7% | 7% | loses | 5 | 4/17 | 4 | 80% | – |
| 17 | 72 | normal | tacos, a burrito and enchiladas | En En Ca Ca BVe | 27 | 5×6 | 4 | 2 | 22.6% | 9% | loses | 3 | 3/25 | 2 | 76% | – |
| 18 | 73 | normal | the carnitas burrito | BCa BCa Qu Po Qu | 25 | 5×5 | 4 | 2 | 19.9% | 10% | loses | 2 | 6/21 | 8 | 86% | – |
| 19 | 74 | normal | two wraps | Fr En En BCa BCa | 29 | 5×6 | 4 | 2 | 19.7% | 6% | loses | 4 | 5/20 | 8 | 49% | – |
| 20 | 75 | superhard | banquet: burrito night | Ca Ve Ca En BVe Po | 30 | 6×5 | 4 | 2 | 1.6% | 2% | loses | 10 | 22/27 | 11 | 48% | – |
| 21 | 86 | normal | **new: taco verde** — guacamole: avocado + lime | Vd Po Vd Po | 20 | 4×5 | 4 | 2 | 19.9% | 65% | loses | 2 | 3/14 | 2 | 80% | – |
| 22 | 87 | normal | salsa or guacamole | BVe Ca Ca BVe Vd | 25 | 5×5 | 4 | 2 | 24.4% | 5% | loses | 6 | 5/16 | 7 | 80% | – |
| 23 | 88 | normal | **new: tostada** — beans, lettuce, guacamole | Fr To Fr To To | 25 | 5×5 | 4 | 2 | 24.9% | 4% | loses | 3 | 8/18 | 7 | 94% | – |
| 24 | 89 | normal | the guacamole menu | Vd To Qu Qu To | 23 | 5×5 | 4 | 2 | 15.2% | 28% | loses | 6 | 3/19 | 5 | 83% | – |
| 25 | 90 | hard | beans for everyone | Po To To Po BCa | 26 | 5×6 | 4 | 2 | 4.4% | 6% | loses | 9 | 10/20 | 8 | 55% | yes |
| 26 | 101 | normal | the chicken burrito | BPo En BPo Ve En | 28 | 5×6 | 4 | 2 | 15.9% | 7% | loses | 7 | 6/23 | 6 | 78% | – |
| 27 | 102 | normal | the full menu, small counter | Vd BCa Fr Fr Vd | 26 | 5×6 | 3 | 2 | 14.9% | 21% | loses | 4 | 6/21 | 4 | 91% | – |
| 28 | 103 | normal | the full menu | To BPo Qu To Qu | 24 | 5×5 | 4 | 2 | 11.2% | 38% | loses | 2 | 8/17 | 7 | 83% | yes |
| 29 | 104 | normal | the full menu, small counter | Ca Ca En Vd En | 27 | 5×6 | 3 | 2 | 14.4% | 23% | loses | 5 | 4/21 | 4 | 62% | – |
| 30 | 105 | superhard | banquet: fiesta | Fr Ca Po BVd Qu To | 30 | 6×5 | 4 | 2 | 1.4% | 0% | loses | 12 | 12/21 | 12 | 27% | – |
| 31 | 111 | normal | **new: topping** — topping last: cheese goes on top (Ca cheese) | Po Po Ca Ca | 20 | 4×5 | 4 | 2 | 18.4% | 34% | loses | 6 | 8/15 | 9 | 68% | – |
| 32 | 112 | normal | topping last (Ca cheese, Po lettuce) | BVe Po Ca Ca Po | 25 | 5×5 | 4 | 2 | 11.2% | 1% | loses | 6 | 8/20 | 5 | 63% | – |
| 33 | 113 | normal | topping last (Ca cheese, Po lettuce) | Fr Po Qu Po Qu | 23 | 5×5 | 4 | 2 | 14.9% | 3% | loses | 7 | 9/16 | 9 | 77% | – |
| 34 | 114 | normal | topping last, small counter (Ca cheese, Po lettuce) | Ve Ca To Ca To | 24 | 5×5 | 3 | 2 | 10.6% | 19% | loses | 3 | 7/17 | 2 | 80% | yes |
| 35 | 115 | hard | toppings and burritos (Ca cheese, Po lettuce) | Ca Ca Po BVe BVe | 25 | 5×5 | 4 | 2 | 4.1% | 1% | loses | 10 | 7/18 | 9 | 60% | – |
| 36 | 116 | normal | toppings everywhere (Ca cheese, Po lettuce, Ve lettuce, BVe cheese) | Ca BVe Ve Po BVe | 24 | 5×5 | 4 | 2 | 15.1% | 11% | loses | 8 | 8/17 | 7 | 91% | – |
| 37 | 117 | normal | topping last, full menu (Ca cheese, Po lettuce) | Vd Vd Po En Po | 26 | 5×6 | 4 | 2 | 11.6% | 3% | loses | 5 | 12/23 | 6 | 73% | – |
| 38 | 118 | normal | topping last, small counter (Ca cheese, Po lettuce) | Ca Fr Fr BPo Ca | 26 | 5×6 | 3 | 2 | 10.9% | 44% | loses | 4 | 9/21 | 5 | 71% | – |
| 39 | 119 | normal | toppings everywhere (Ca cheese, Po lettuce, Ve lettuce, BVe cheese) | BVd To Ve Ve To | 24 | 5×5 | 4 | 2 | 10.2% | 15% | loses | 5 | 10/17 | 4 | 83% | – |
| 40 | 120 | superhard | grand fiesta (Ca cheese, Po lettuce) | Fr Po BVe Ca Vd Qu | 29 | 6×5 | 4 | 2 | 0.67% | 0% | loses | 14 | 14/23 | 13 | 33% | yes |

## What moves difficulty

From the design research (medium base: 4 columns × 5, four tacos, 4 slots; [greedy win, random
win, lookahead] over 150 generated levels each) and unfiltered candidates of this generator:

- **The newest tortilla receives.** With the oldest receiving, fillings just form consecutive
  triples and parking never happens: [28.0%, 50.4%, 2.7] vs [29.3%, 37.8%, 3.2]. The showcase and
  L84/L86 are unwinnable under that rule; parking is the world's core move.
- **The scoop** (loose fillings go into the next container) keeps natural dig moves legal; without
  it the same levels lose 96% of their winning lines.
- **The fit guard** keeps the winning lines identical but lifts random play from 1.4% to 37.9%:
  like the landing-slot rule it removes one-move blunders, not the puzzle.
- **Size is the strongest dial**: 3 columns / 3 tacos ≈ 58% random win (LA 1.7); 4 / 4 ≈ 39%
  (LA 3.4); 5 / 5 with a burrito ≈ 14% (LA 6.5); 6 / 6 ≈ 5% median (LA 6.6). One more order: [16.7%,
  19.0%, 5.4].
- **Counter 3 instead of 4**: [15.3%, 28.3%, 4.1]; a fifth slot barely helps ([36.0%, 41.9%, 3.4]).
- **Mixing a wrap (holds 4) with tortillas** makes the receiving container's size matter:
  [16.0%, 22.1%, 6.1]; all-burrito levels play like tacos.
- **Topping last** (the guard refuses the topping until it closes the taco): one marked dish
  [31.3%, 33.4%, 3.5], every ticket [22.0%, 27.5%, 4.4]. Without the early refusal a cheese dropped
  too early is an invisible dead end ([6.0%, 12.3%, 6.5]).
- **More seats** make levels slightly easier (3 seats: [33.3%, 38.2%, 3.3]).

## Audit

All 40 stored solutions replay to a win in the play simulation, every pantry is zero-waste, neighbouring levels serve different dish sets and the stored solver numbers match a fresh measurement.
