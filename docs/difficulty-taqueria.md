# Difficulty: the Taquería (world 3)

Built by `bun scripts/build-taqueria.ts` into `src/data/levels-taqueria.json` and merged into the
campaign by `bun scripts/merge-levels.ts`; this file's tables are written by
`bun scripts/audit-levels.ts`. The ladder and targets live in `src/core/tacoGen.ts`
(`taqueriaSpec`, `taqueriaTarget`), the rules in `src/core/taco.ts`. The Taquería's 40 local levels
are spread over 8 shifts of the campaign (T T B T B Q T B Q T B Q T B Q T B Q T B Q B Q Q); tiers follow the local index as in every
kitchen: every 5th level is hard, every 10th a banquet, and a new dish or mechanic always comes on a
normal level. The players, the numbers, the mechanics (cloches, frozen tiles) and the guided
generator are described in [difficulty.md](difficulty.md).

## Rules in one paragraph

A tortilla (holds 3) or a burrito wrap (holds 4) lands open and takes a slot. The newest open
container receives every filling that lands (no slot); full, it folds into a taco and the previous
open one receives again. With nothing open a filling waits loose (one slot), and the next container
scoops the loose fillings in arrival order. Tomato + onion = salsa, avocado + lime = guacamole; the
product drops in like a filling. A folded taco goes to the leftmost guest who ordered it, or waits
(one slot) until that guest sits down. The fit guard dims a column whose top would make a taco no
remaining ticket can take, and the landing-slot rule lets a full counter accept only takes that
resolve. Twist from local L31: a ticket marks a topping that must go in last.

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
than in the Trattoria: the random cap of the planning bands is 1.6 times the Trattoria's. The
opening (L2–8) asks for the same as every kitchen's: a forced decision from L2, about three moves of
planning by L5–8; L1 stays the tutorial. Tightness is recorded but not targeted (a 4-spot
counter rarely is; the receiving tortilla is this world's dial).

| Levels (local) | Planner reach | Forced / deep decisions | Random win | Also |
|---|---|---|---|---|
| L1 (tutorial) | d2 ≥ 60% | – | 50%–100% | – |
| L2–3 | d1 ≤ 70%, d2 ≥ 60% | forced ≥ 1 | 10%–100% | greedy loses, ≥ 1 critical |
| L4 (park intro) | d1 ≤ 55%, d2 ≥ 55% | forced ≥ 2 | 10%–100% | greedy loses, ≥ 1 critical |
| L5 (hard) | d2 ≤ 50%, d3 ≥ 50% | forced ≥ 2, deep ≥ 1 | 3%–30% | greedy loses, ≥ 3 critical |
| L6 (quesadilla intro) | d2 ≤ 60%, d3 ≥ 50% | forced ≥ 2 | – | greedy loses |
| L7–8 | d2 ≤ 50%, d3 ≥ 55% | forced ≥ 2, deep ≥ 1 | – | greedy loses |
| Normal, L9 | d2 ≤ 59%, d3 30%–88%, d5 ≥ 55% | forced ≥ 2, deep ≥ 1 | ≤ 39% | greedy loses |
| Normal, L39 (bands slide linearly) | d2 ≤ 20%, d3 15%–40%, d5 ≥ 55% | forced ≥ 4, deep ≥ 3 | ≤ 16% | greedy loses |
| Intro levels (8, 11, 13, 16, 21, 23, 31) | d2 ≤ 75%, d3 ≥ 50%, d5 ≥ 70% | forced ≥ 1 | ≤ 64% | greedy loses |
| Hard L15 | d2 ≤ 20%, d3 ≤ 37%, d5 ≥ 40% | forced ≥ 3, deep ≥ 3 | ≤ 9.6% | greedy loses, ≥ 1 cloche riddle |
| Hard L35 | d2 ≤ 20%, d3 ≤ 27%, d5 ≥ 40% | forced ≥ 4, deep ≥ 5 | ≤ 9.6% | greedy loses, ice cuts ≥ 15%, ≥ 1 cloche riddle |
| Banquet L10 | d2 10%–50%, d3 30%–70%, d5 ≥ 60% | forced ≥ 3, deep ≥ 2 | ≤ 13% | greedy loses |
| Banquets L20, 30, 40 | d3 ≤ 25%, d4 ≤ 40%, d5 ≥ 25% | forced ≥ 4, deep ≥ 4 | ≤ 4.8% | greedy loses, ≤ 1 cloche guess, ice cuts ≥ 15% |

L4 must be unwinnable if the OLDEST tortilla received; L7 must be unwinnable without the scoop. Cloches and ice as in the Trattoria.

Teaching order: a tortilla catches fillings and salsa drops in (1–3, the chicken taco at 2) → park a
half-made taco under a new tortilla (4) → the quesadilla's double cheese (6) → queued tickets and
the scoop (7) → frijol (8) → cloches (9, taught in the Trattoria) → a 3-slot counter (11) → burritos
next to tacos: which container receives? (13) → frozen tiles (14, taught in the Burger Joint) →
enchiladas (16) → guacamole and taco verde (21) → the tostada (23) → topping last (31) → a third
guest (36).

## Measured (40 levels)

| Tier | Levels | Planner d1 / d2 / d3 / d4 / d5 | Planning depth | Forced | Deep | Random win (mean / median) | Critical | Items | Board | Guests | Seats | Tight | Cloches / ice |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Opening, L1–5 (L1 the tutorial, L5 hard) | 5 | 39 / 73 / 89 / 96 / 98 | 2.0 | 2.6 | 2.8 | 41.5% / 31.7% | 5.2 | 14.2 | 3.0 cols | 3.0 | 1–2 | 0/5 | 0 / 0 |
| Normal, L6–20 | 12 | 17 / 28 / 70 / 77 / 84 | 3.2 | 3.6 | 4.1 | 16.1% / 12.4% | 6.6 | 20.5 | 4.3 cols | 4.2 | 2 | 2/12 | 4 / 2 |
| Normal, L21–39 | 16 | 10 / 15 / 45 / 67 / 73 | 3.9 | 4.9 | 5.1 | 7.2% / 3.5% | 8.3 | 24.9 | 5.0 cols | 4.9 | 2–3 | 5/16 | 9 / 6 |
| Hard, L15–35 | 3 | 9 / 17 / 16 / 24 / 53 | 5.3 | 7.7 | 7.7 | 2.8% / 1.7% | 12.0 | 25.7 | 5.0 cols | 5.0 | 2 | 1/3 | 3 / 1 |
| Banquets, L10–40 | 4 | 5 / 16 / 26 / 37 / 52 | 4.8 | 6.3 | 7.0 | 1.8% / 1.1% | 10.5 | 28.0 | 5.8 cols | 5.8 | 2–3 | 1/4 | 2 / 3 |

## Levels

Dishes: Ca carnitas, Po pollo, Ve veggie, Fr frijol, Vd verde, Qu quesadilla, To tostada; BCa, BPo,
BVe, BVd the burritos, En enchiladas. Board = columns × tallest column.

| Local | # | Tier | Teaches | Guests | Items | Board | Slots | Seats | Planner d1–d5 | Depth | Forced | Deep | Random | Greedy | Tight | Cloches / ice |
|---:|---:|---|---|---|---:|---|---:|---:|---|---:|---:|---:|---:|---|---|---|
| 1 | 26 | normal | **new: tortilla** — a tortilla catches the next three fillings | Ca Ve | 9 | 2×5 | 4 | 1 | 100/100/100/100/100 | 1 | 0 | 0 | 100.0% | wins | – | – |
| 2 | 27 | normal | **new: chicken taco** — salsa drops into the tortilla | Po Po Ca | 15 | 3×5 | 4 | 2 | 25/100/100/100/100 | 2 | 1 | 2 | 31.7% | loses | – | – |
| 3 | 28 | normal | finish one taco before the next filling | Po Po Ve | 14 | 3×5 | 4 | 2 | 17/59/72/100/100 | 2 | 3 | 5 | 24.2% | loses | – | – |
| 4 | 29 | normal | **new: park** — park a half-made taco under a new tortilla | Ca Po Ca | 15 | 3×5 | 4 | 2 | 11/63/91/91/100 | 2 | 3 | 4 | 39.9% | loses | – | – |
| 5 | 30 | hard | tortilla stack | Po Ve Ve Ca | 18 | 4×5 | 4 | 2 | 42/45/84/89/88 | 3 | 6 | 3 | 11.9% | loses | – | – |
| 6 | 41 | normal | **new: quesadilla** — chicken and double cheese | Ve Qu Qu | 12 | 3×5 | 4 | 2 | 14/36/92/95/100 | 3 | 2 | 3 | 54.9% | loses | – | – |
| 7 | 42 | normal | a taco for the queue; loose fillings get scooped in order | Po Ca Ca Qu | 19 | 4×5 | 4 | 2 | 0/0/92/100/59 | 3 | 2 | 1 | 20.9% | loses | yes | – |
| 8 | 43 | normal | **new: bean taco** — beans, cheese and salsa | Ca Fr Ca Fr | 20 | 4×5 | 4 | 2 | 36/45/77/94/100 | 3 | 2 | 2 | 24.9% | loses | – | – |
| 9 | 44 | normal | plan for the queue, under a cloche | Fr Fr Ve Po | 19 | 4×5 | 4 | 2 | 27/31/34/80/73 | 4 | 7 | 7 | 8.7% | loses | – | 2 cloches (1 riddle) |
| 10 | 45 | superhard | banquet: taco night | Qu Po Fr Ve Ca | 23 | 5×5 | 4 | 2 | 20/39/61/81/69 | 3 | 6 | 7 | 4.7% | loses | – | – |
| 11 | 56 | normal | **new: 3-slot counter** — small counter: three slots | Fr Ca Ca Qu | 19 | 4×5 | 3 | 2 | 11/30/94/88/97 | 3 | 5 | 2 | 11.7% | loses | – | – |
| 12 | 57 | normal | small counter | Ve Po Fr Po | 19 | 4×5 | 3 | 2 | 20/58/69/67/88 | 2 | 3 | 5 | 19.2% | loses | yes | 2 cloches (5 riddles) |
| 13 | 58 | normal | **new: burrito** — a wrap holds four | BVe Po BVe Po | 20 | 4×5 | 4 | 2 | 34/39/86/45/81 | 3 | 3 | 2 | 5.2% | loses | – | – |
| 14 | 59 | normal | which container is receiving? one is frozen | Qu BVe BVe Ca | 19 | 4×5 | 4 | 2 | 23/0/64/52/95 | 3 | 2 | 2 | 2.4% | loses | – | 1 ice (cuts 91%) |
| 15 | 60 | hard | three-slot rush | BVe BVe Fr Po Po | 25 | 5×5 | 3 | 2 | 0/31/27/5/53 | 5 | 9 | 7 | 1.3% | loses | yes | 2 cloches (6 riddles) |
| 16 | 71 | normal | **new: enchiladas** — chicken, beans, cheese, salsa | En Ve Ve En | 20 | 5×5 | 4 | 2 | 11/30/81/97/100 | 3 | 2 | 3 | 20.1% | loses | – | – |
| 17 | 72 | normal | tacos, a burrito and enchiladas | En BVe Ca Ca BVe | 26 | 5×6 | 4 | 2 | 2/9/45/56/72 | 4 | 5 | 7 | 6.3% | loses | – | 2 cloches (4 riddles) |
| 18 | 73 | normal | the carnitas burrito | Po Po Qu Qu BCa | 24 | 5×5 | 4 | 2 | 20/23/44/52/63 | 4 | 7 | 6 | 13.2% | loses | – | 1 ice (cuts 75%) |
| 19 | 74 | normal | two wraps | BCa En Fr BCa En | 29 | 5×6 | 4 | 2 | 9/33/59/94/75 | 3 | 3 | 9 | 5.8% | loses | – | 2 cloches (3 riddles) |
| 20 | 75 | superhard | banquet: burrito night | Ca En BVe Ca Ve Po | 30 | 6×5 | 4 | 2 | 2/11/14/30/50 | 5 | 8 | 7 | 1.3% | loses | yes | 1 ice (cuts 95%) |
| 21 | 86 | normal | **new: taco verde** — guacamole: avocado + lime | Vd Po Vd Po | 20 | 4×5 | 4 | 2 | 20/22/88/100/88 | 3 | 3 | 2 | 11.5% | loses | – | – |
| 22 | 87 | normal | salsa or guacamole | Ca Vd Vd BVe Ca | 25 | 5×5 | 4 | 2 | 31/14/66/92/81 | 3 | 3 | 2 | 5.4% | loses | – | 2 cloches (4 riddles) |
| 23 | 88 | normal | **new: tostada** — beans, lettuce, guacamole | To To To Fr Fr | 25 | 5×5 | 4 | 2 | 11/41/72/81/86 | 3 | 2 | 2 | 11.1% | loses | yes | – |
| 24 | 89 | normal | the guacamole menu | Vd Qu Vd To To | 24 | 5×5 | 4 | 2 | 9/8/31/34/53 | 5 | 3 | 5 | 3.5% | loses | – | 1 ice (cuts 92%) |
| 25 | 90 | hard | beans for everyone | BCa BCa Po To Po | 27 | 5×6 | 4 | 2 | 5/9/6/39/63 | 5 | 7 | 7 | 1.7% | loses | – | 2 cloches (2 riddles) |
| 26 | 101 | normal | the chicken burrito | BPo En Ve BPo Ve | 26 | 5×6 | 4 | 2 | 5/13/23/69/36 | 4 | 9 | 8 | 12.8% | loses | – | 2 cloches (1 riddle), 1 ice (cuts 95%) |
| 27 | 102 | normal | the full menu, small counter | Fr BCa Vd BCa Fr | 27 | 5×6 | 3 | 2 | 5/19/45/58/75 | 4 | 5 | 3 | 4.2% | loses | – | 2 cloches (2 riddles) |
| 28 | 103 | normal | the full menu on ice | To To Qu Qu BPo | 24 | 5×5 | 4 | 2 | 9/16/38/48/73 | 5 | 10 | 2 | 1.5% | loses | yes | 2 ice (cuts 55%) |
| 29 | 104 | normal | the full menu, small counter | Ca Vd Ca En En | 27 | 5×6 | 3 | 2 | 6/33/23/80/78 | 4 | 4 | 7 | 1.2% | loses | yes | 2 cloches (1 riddle) |
| 30 | 105 | superhard | banquet: fiesta | Qu To Ca Fr BVd Po | 30 | 6×5 | 4 | 2 | 0/6/14/22/38 | 6 | 5 | 9 | 0.47% | loses | – | 2 cloches (2 riddles), 1 ice (cuts 42%) |
| 31 | 111 | normal | **new: topping** — topping last: cheese goes on top (Ca cheese) | Po Po Ca Ca | 20 | 4×5 | 4 | 2 | 25/23/86/97/89 | 3 | 5 | 7 | 37.8% | loses | – | – |
| 32 | 112 | normal | topping last, under a cloche (Ca cheese, Po lettuce) | BVe BVe Po Ca Po | 25 | 5×5 | 4 | 2 | 14/19/31/52/75 | 4 | 4 | 8 | 2.9% | loses | – | 2 cloches (1 riddle) |
| 33 | 113 | normal | topping last on ice (Ca cheese, Po lettuce) | Fr Fr Po Qu Po | 24 | 5×5 | 4 | 2 | 3/14/31/34/78 | 5 | 4 | 6 | 1.4% | loses | – | 1 ice (cuts 92%) |
| 34 | 114 | normal | topping last, small counter (Ca cheese, Po lettuce) | Ve Ca To Ca To | 24 | 5×5 | 3 | 2 | 0/13/28/66/70 | 4 | 4 | 3 | 2.2% | loses | yes | 2 cloches (1 riddle) |
| 35 | 115 | hard | toppings and burritos (Ca cheese, Po lettuce) | Ca BVe Po Po Ca | 25 | 5×5 | 4 | 2 | 23/9/16/30/44 | 6 | 7 | 9 | 5.5% | loses | – | 2 cloches (1 riddle), 1 ice (cuts 82%) |
| 36 | 116 | normal | three guests: toppings everywhere (Ca cheese, Po lettuce, Ve lettuce, BVe cheese) | Po Ca Po Ca Ve BVe | 29 | 6×5 | 4 | 3 | 0/0/41/63/73 | 4 | 5 | 7 | 0.71% | loses | – | 1 ice (cuts 82%) |
| 37 | 117 | normal | three guests: topping last, full menu (Ca cheese, Po lettuce) | Vd Po Vd En Po | 26 | 5×6 | 4 | 3 | 0/2/52/55/73 | 3 | 7 | 9 | 3.0% | loses | – | 2 cloches (4 riddles) |
| 38 | 118 | normal | topping last, small counter (Ca cheese, Po lettuce) | Fr Fr Ca Ca BPo | 26 | 5×6 | 3 | 2 | 6/3/28/86/64 | 4 | 4 | 4 | 3.5% | loses | yes | 2 cloches (3 riddles), 1 ice (cuts 56%) |
| 39 | 119 | normal | three guests: toppings everywhere (Ca cheese, Po lettuce, Ve lettuce, BVe cheese) | To BVd BVd Ve To | 26 | 6×5 | 4 | 3 | 8/2/42/53/80 | 4 | 7 | 6 | 13.1% | loses | – | 2 cloches (1 riddle) |
| 40 | 120 | superhard | grand fiesta (Ca cheese, Po lettuce) | Fr BVe Vd Po Qu Ca | 29 | 6×5 | 4 | 3 | 0/6/16/14/52 | 5 | 6 | 5 | 0.79% | loses | – | 2 cloches (1 riddle), 1 ice (cuts 30%) |

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

All 40 stored solutions replay to a win in the play simulation, every pantry is zero-waste, neighbouring levels serve different dish sets, no cloche or ice comes before its intro, the careful deducer wins every cloche level without guessing (banquets: at most once), and the stored solver numbers match a fresh measurement.
