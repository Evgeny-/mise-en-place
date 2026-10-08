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

| Levels (local) | Goal-directed players | Planner reach | Forced / deep / bottlenecks | Random win | Also |
|---|---|---|---|---|---|
| L1 (tutorial) | – | d2 ≥ 60% | – | 50%–100% | – |
| L2–3 | strong 60%–100%, careful 85%–100% | d1 ≤ 70%, d2 ≥ 60% | forced ≥ 1 | 10%–100% | greedy loses, ≥ 1 critical |
| L4 (park intro) | strong 55%–100%, careful 85%–100% | d1 ≤ 55%, d2 ≥ 55% | forced ≥ 2 | 10%–100% | greedy loses, ≥ 1 critical |
| L5 (hard) | strong 40%–90%, careful 80%–100% | d2 ≤ 50%, d3 ≥ 50% | forced ≥ 2, deep ≥ 1 | 3%–30% | greedy loses, ≥ 3 critical |
| L6 (quesadilla intro) | strong 45%–95%, careful 80%–100% | d2 ≤ 60%, d3 ≥ 50% | forced ≥ 2 | – | greedy loses |
| L7–8 | strong 40%–90%, careful 80%–100% | d2 ≤ 50%, d3 ≥ 55% | forced ≥ 2, deep ≥ 1 | – | greedy loses |
| Normal, L9 | strong 44%–84%, careful 60%–100% | d2 ≤ 59%, d3 30%–88% | forced ≥ 2, deep ≥ 1, bottlenecks ≥ 1 | ≤ 39% | greedy loses |
| Normal, L39 (bands slide linearly) | strong 25%–55%, careful 50%–100% | d2 ≤ 20%, d3 15%–40% | forced ≥ 4, deep ≥ 3, bottlenecks ≥ 4 | ≤ 16% | greedy loses |
| Intro levels (8, 11, 13, 16, 21, 23, 31) | strong 40%–95%, careful 75%–100% | d2 ≤ 75%, d3 ≥ 50% | forced ≥ 1 | ≤ 64% | greedy loses |
| Hard L15 | strong 0%–30%, careful 20%–70% | d2 ≤ 20%, d3 ≤ 37% | forced ≥ 3, deep ≥ 3, bottlenecks ≥ 4 | ≤ 9.6% | greedy loses, ≥ 1 cloche riddle |
| Hard L35 | strong 0%–30%, careful 20%–70% | d2 ≤ 20%, d3 ≤ 27% | forced ≥ 4, deep ≥ 5, bottlenecks ≥ 6 | ≤ 9.6% | greedy loses, ice cuts ≥ 15%, ≥ 1 cloche riddle |
| Banquet L10 | strong 15%–60%, careful 50%–100% | d2 10%–50%, d3 30%–70% | forced ≥ 3, deep ≥ 2 | ≤ 13% | greedy loses |
| Banquets L20, 30, 40 | strong 0%–20%, careful 15%–60% | d3 ≤ 25%, d4 ≤ 40% | forced ≥ 4, deep ≥ 4, bottlenecks ≥ 6 | ≤ 4.8% | greedy loses, ≤ 1 cloche guess, ice cuts ≥ 15% |

L4 must be unwinnable if the OLDEST tortilla received; L7 must be unwinnable without the scoop. Cloches and ice as in the Trattoria.

Teaching order: a tortilla catches fillings and salsa drops in (1–3, the chicken taco at 2) → park a
half-made taco under a new tortilla (4) → the quesadilla's double cheese (6) → queued tickets and
the scoop (7) → frijol (8) → cloches (9, taught in the Trattoria) → a 3-slot counter (11) → burritos
next to tacos: which container receives? (13) → frozen tiles (14, taught in the Burger Joint) →
enchiladas (16) → guacamole and taco verde (21) → the tostada (23) → topping last (31) → a third
guest (36).

## Measured (40 levels)

| Tier | Levels | Strong player | Careful player | Bottlenecks | Planner d1 / d2 / d3 / d4 / d5 | Planning depth | Forced | Deep | Random win (mean / median) | Items | Board | Guests | Seats | Tight | Cloches / ice / stove |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Opening, L1–5 (L1 the tutorial, L5 hard) | 5 | 84% | 100% | 0.8 | 45 / 72 / 89 / 97 / 94 | 1.8 | 1.8 | 2.4 | 53.1% / 47.4% | 14.4 | 3.0 cols | 3.0 | 1–2 | 0/5 | 0 / 0 / 0 |
| Normal, L6–20 | 12 | 69% | 94% | 2.8 | 19 / 32 / 60 / 79 / 86 | 2.8 | 3.8 | 4.0 | 13.5% / 10.6% | 20.5 | 4.3 cols | 4.2 | 2 | 3/12 | 4 / 2 / 0 |
| Normal, L21–39 | 16 | 50% | 84% | 4.4 | 15 / 24 / 44 / 66 / 82 | 3.7 | 4.3 | 5.8 | 4.2% / 2.7% | 25.0 | 5.0 cols | 4.9 | 2–3 | 7/16 | 9 / 6 / 0 |
| Hard, L15–35 | 3 | 16% | 53% | 11.5 | 6 / 3 / 18 / 36 / 47 | 5.3 | 7.0 | 9.0 | 0.9% / 1.1% | 25.7 | 5.0 cols | 5.0 | 2 | 3/3 | 3 / 1 / 0 |
| Banquets, L10–40 | 4 | 23% | 37% | 8.7 | 8 / 14 / 20 / 36 / 50 | 4.8 | 7.5 | 9.5 | 1.8% / 0.9% | 28.0 | 5.8 cols | 5.8 | 2–3 | 1/4 | 2 / 3 / 0 |

## Levels

Dishes: Ca carnitas, Po pollo, Ve veggie, Fr frijol, Vd verde, Qu quesadilla, To tostada; BCa, BPo,
BVe, BVd the burritos, En enchiladas. Board = columns × tallest column.

| Local | # | Tier | Teaches | Guests | Items | Board | Slots | Seats | Strong / careful | Bottlenecks | Planner d1–d5 | Depth | Forced | Deep | Random | Greedy | Tight | Mechanics |
|---:|---:|---|---|---|---:|---|---:|---:|---|---:|---|---:|---:|---:|---:|---|---|---|
| 1 | 26 | normal | **new: tortilla** — a tortilla catches the next three fillings | Ca Ve | 9 | 2×5 | 4 | 1 | 100% / 100% | 0.0 | 100/100/100/100/100 | 1 | 0 | 0 | 100.0% | wins | – | – |
| 2 | 27 | normal | **new: chicken taco** — salsa drops into the tortilla | Po Ca Po | 15 | 3×5 | 4 | 2 | 81% / 100% | 0.4 | 50/84/97/97/100 | 1 | 1 | 3 | 37.3% | loses | – | – |
| 3 | 28 | normal | finish one taco before the next filling | Po Po Ve | 14 | 3×5 | 4 | 2 | 94% / 100% | 0.0 | 30/75/73/100/100 | 2 | 3 | 3 | 47.4% | loses | – | – |
| 4 | 29 | normal | **new: park** — park a half-made taco under a new tortilla | Ca Po Ca | 15 | 3×5 | 4 | 2 | 89% / 100% | 1.2 | 47/67/97/100/72 | 2 | 2 | 1 | 67.8% | loses | – | – |
| 5 | 30 | hard | tortilla stack | Ve Ca Ca Po | 19 | 4×5 | 4 | 2 | 56% / 100% | 2.4 | 0/31/80/88/100 | 3 | 3 | 5 | 13.2% | loses | – | – |
| 6 | 41 | normal | **new: quesadilla** — chicken and double cheese | Qu Qu Ve | 12 | 3×5 | 4 | 2 | 53% / 100% | 4.7 | 0/61/39/67/95 | 2 | 2 | 2 | 34.2% | loses | – | – |
| 7 | 42 | normal | a taco for the queue; loose fillings get scooped in order | Po Ca Ca Qu | 19 | 4×5 | 4 | 2 | 92% / 100% | 0.9 | 33/0/91/98/100 | 3 | 3 | 1 | 11.4% | loses | – | – |
| 8 | 43 | normal | **new: bean taco** — beans, cheese and salsa | Ca Fr Ca Fr | 20 | 4×5 | 4 | 2 | 92% / 98% | 0.4 | 27/34/73/94/100 | 3 | 2 | 9 | 30.4% | loses | – | – |
| 9 | 44 | normal | plan for the queue, under a cloche | Po Ve Po Fr | 19 | 4×5 | 4 | 2 | 84% / 73% | 1.5 | 6/8/55/91/52 | 3 | 6 | 6 | 10.5% | loses | yes | 2 cloches (4 riddles) |
| 10 | 45 | superhard | banquet: taco night | Po Ca Fr Ve Qu | 23 | 5×5 | 4 | 2 | 72% / 72% | 1.4 | 19/38/55/67/63 | 3 | 4 | 2 | 5.3% | loses | – | – |
| 11 | 56 | normal | **new: 3-slot counter** — small counter: three slots | Qu Fr Fr Ca | 19 | 4×5 | 3 | 2 | 69% / 98% | 2.9 | 27/61/70/88/98 | 2 | 3 | 0 | 7.3% | loses | – | – |
| 12 | 57 | normal | small counter | Fr Po Fr Ve | 19 | 4×5 | 3 | 2 | 72% / 98% | 4.4 | 0/28/50/73/84 | 3 | 7 | 5 | 4.0% | loses | yes | 2 cloches (2 riddles) |
| 13 | 58 | normal | **new: burrito** — a wrap holds four | BVe Po Po BVe | 20 | 4×5 | 4 | 2 | 72% / 100% | 0.6 | 28/41/66/95/100 | 3 | 2 | 1 | 29.3% | loses | – | – |
| 14 | 59 | normal | which container is receiving? one is frozen | BVe Qu BVe Ca | 19 | 4×5 | 4 | 2 | 66% / 86% | 7.7 | 0/17/64/73/100 | 3 | 4 | 4 | 10.7% | loses | yes | 1 ice (cuts 18%) |
| 15 | 60 | hard | three-slot rush | BVe BVe Po Fr Fr | 25 | 5×5 | 3 | 2 | 28% / 45% | 11.8 | 5/9/36/48/44 | 6 | 6 | 7 | 1.3% | loses | yes | 2 cloches (6 riddles) |
| 16 | 71 | normal | **new: enchiladas** — chicken, beans, cheese, salsa | En Ve Ve En | 20 | 5×5 | 4 | 2 | 45% / 100% | 2.1 | 50/22/69/70/97 | 1 | 2 | 6 | 17.8% | loses | – | – |
| 17 | 72 | normal | tacos, a burrito and enchiladas | BVe Ca Ca En BVe | 26 | 5×6 | 4 | 2 | 61% / 72% | 2.9 | 2/20/45/66/31 | 4 | 4 | 2 | 2.5% | loses | – | 2 cloches (1 riddle) |
| 18 | 73 | normal | the carnitas burrito | Qu Qu BCa BCa Po | 25 | 5×5 | 4 | 2 | 67% / 98% | 3.8 | 31/45/61/61/98 | 3 | 7 | 6 | 2.7% | loses | – | 1 ice (cuts 82%) |
| 19 | 74 | normal | two wraps | En BCa Fr En Fr | 28 | 5×6 | 4 | 2 | 59% / 98% | 1.4 | 28/44/36/67/75 | 4 | 3 | 6 | 0.96% | loses | – | 2 cloches (2 riddles) |
| 20 | 75 | superhard | banquet: burrito night | En Ca Ve Po BVe BVe | 30 | 6×5 | 4 | 2 | 0% / 23% | 6.8 | 13/16/16/23/50 | 5 | 7 | 10 | 0.71% | loses | – | 1 ice (cuts 39%) |
| 21 | 86 | normal | **new: taco verde** — guacamole: avocado + lime | Vd Po Vd Po | 20 | 4×5 | 4 | 2 | 69% / 92% | 0.8 | 52/53/67/83/89 | 1 | 3 | 3 | 22.6% | loses | – | – |
| 22 | 87 | normal | salsa or guacamole | Vd BVe Ca Vd BVe | 25 | 5×5 | 4 | 2 | 39% / 100% | 7.2 | 19/28/38/100/100 | 4 | 4 | 3 | 2.5% | loses | yes | 2 cloches (6 riddles) |
| 23 | 88 | normal | **new: tostada** — beans, lettuce, guacamole | To To To Fr Fr | 25 | 5×5 | 4 | 2 | 61% / 97% | 0.8 | 14/47/72/98/100 | 3 | 1 | 5 | 5.5% | loses | – | – |
| 24 | 89 | normal | the guacamole menu | Qu Vd To Vd To | 24 | 5×5 | 4 | 2 | 55% / 94% | 6.4 | 16/11/41/89/100 | 4 | 3 | 4 | 3.7% | loses | – | 1 ice (cuts 61%) |
| 25 | 90 | hard | beans for everyone | To To Po BCa BCa | 27 | 5×6 | 4 | 2 | 5% / 53% | 10.3 | 2/0/2/55/69 | 4 | 11 | 10 | 1.1% | loses | yes | 2 cloches (5 riddles) |
| 26 | 101 | normal | the chicken burrito | BPo En BPo Ve En | 28 | 5×6 | 4 | 2 | 52% / 73% | 3.8 | 8/25/22/50/75 | 4 | 6 | 7 | 2.9% | loses | – | 2 cloches (1 riddle), 1 ice (cuts 36%) |
| 27 | 102 | normal | the full menu, small counter | BCa Vd Fr Fr Vd | 26 | 5×6 | 3 | 2 | 45% / 91% | 3.9 | 6/34/34/30/41 | 6 | 5 | 7 | 0.33% | loses | yes | 2 cloches (2 riddles) |
| 28 | 103 | normal | the full menu on ice | Qu BPo Qu BPo To | 25 | 5×5 | 4 | 2 | 39% / 95% | 3.7 | 6/19/38/75/100 | 4 | 4 | 9 | 3.3% | loses | yes | 2 ice (cuts 59%) |
| 29 | 104 | normal | the full menu, small counter | En Ca Ca Vd Vd | 26 | 5×6 | 3 | 2 | 47% / 75% | 5.8 | 2/19/52/70/64 | 3 | 5 | 4 | 0.51% | loses | yes | 2 cloches (2 riddles) |
| 30 | 105 | superhard | banquet: fiesta | Qu Ca Po BVd To Fr | 30 | 6×5 | 4 | 2 | 20% / 39% | 24.0 | 0/2/5/22/61 | 5 | 13 | 18 | 0.00% | loses | yes | 2 cloches (3 riddles), 1 ice (cuts 14%) |
| 31 | 111 | normal | **new: topping** — topping last: cheese goes on top (Ca cheese) | Ca Ca Po Po | 20 | 4×5 | 4 | 2 | 86% / 92% | 2.6 | 55/63/89/95/98 | 1 | 2 | 1 | 10.8% | loses | – | – |
| 32 | 112 | normal | topping last, under a cloche (Ca cheese, Po lettuce) | Ca Po Po Ca BVe | 25 | 5×5 | 4 | 2 | 58% / 88% | 1.8 | 3/3/36/44/59 | 5 | 5 | 6 | 1.6% | loses | – | 2 cloches (3 riddles) |
| 33 | 113 | normal | topping last on ice (Ca cheese, Po lettuce) | Fr Qu Fr Po Po | 24 | 5×5 | 4 | 2 | 31% / 64% | 7.6 | 0/14/47/53/64 | 4 | 5 | 7 | 0.69% | loses | – | 1 ice (cuts 84%) |
| 34 | 114 | normal | topping last, small counter (Ca cheese, Po lettuce) | Ve Ca To To Ca | 24 | 5×5 | 3 | 2 | 44% / 81% | 8.6 | 19/9/17/56/92 | 4 | 4 | 3 | 0.65% | loses | yes | 2 cloches (1 riddle) |
| 35 | 115 | hard | toppings and burritos (Ca cheese, Po lettuce) | BVe BVe Ca Ca Po | 25 | 5×5 | 4 | 2 | 14% / 61% | 12.4 | 13/0/17/6/28 | 6 | 4 | 10 | 0.32% | loses | yes | 2 cloches (2 riddles), 1 ice (cuts 40%) |
| 36 | 116 | normal | three guests: toppings everywhere (Ca cheese, Po lettuce, Ve lettuce, BVe cheese) | BVe Po BVe Ve Ca Po | 29 | 6×5 | 4 | 3 | 42% / 83% | 2.3 | 6/17/28/70/94 | 4 | 6 | 8 | 6.6% | loses | – | 1 ice (cuts 41%) |
| 37 | 117 | normal | three guests: topping last, full menu (Ca cheese, Po lettuce) | En Vd Vd En Po | 27 | 5×6 | 4 | 3 | 44% / 64% | 6.4 | 9/25/56/58/70 | 3 | 6 | 7 | 0.31% | loses | yes | 2 cloches (1 riddle) |
| 38 | 118 | normal | topping last, small counter (Ca cheese, Po lettuce) | BPo Fr BPo Ca Fr | 27 | 5×6 | 3 | 2 | 42% / 91% | 6.1 | 3/8/48/20/84 | 5 | 6 | 11 | 0.87% | loses | yes | 2 cloches (6 riddles), 1 ice (cuts 94%) |
| 39 | 119 | normal | three guests: toppings everywhere (Ca cheese, Po lettuce, Ve lettuce, BVe cheese) | To BVd Ve BVd Ve | 25 | 6×5 | 4 | 3 | 48% / 70% | 3.3 | 22/6/20/66/75 | 4 | 4 | 7 | 3.9% | loses | – | 2 cloches (1 riddle) |
| 40 | 120 | superhard | grand fiesta (Ca cheese, Po lettuce) | BVe Ca Po Qu Fr Vd | 29 | 6×5 | 4 | 3 | 2% / 14% | 2.7 | 0/0/5/31/28 | 6 | 6 | 8 | 1.00% | loses | – | 2 cloches (6 riddles), 1 ice (cuts 64%) |

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
