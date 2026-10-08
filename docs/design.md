# Mise en Place — design

## The core puzzle (world 1, Trattoria)

- The **pantry** has a few columns of ingredients. Only the top item of a column can be taken.
- A taken item lands on the **counter**, which has only a few spots.
- The counter resolves by itself until nothing changes:
  1. **Preps** fire first, one at a time, in menu order: tomato + tomato → sauce,
     flour + egg → dough, onion + carrot → soffritto, basil + cheese → pesto, potato + flour →
     gnocchi, mascarpone + egg → mascarpone cream. Two tomatoes *always* make sauce.
  2. Only when no prep fires, **one dish** is served: the leftmost seated guest whose dish
     parts are all on the counter. The next guest in line takes that seat and the counter
     resolves again (a new guest can be served at once).
- **Dishes (14, a new one every one or two levels at first):** spaghetti = pasta + sauce,
  bruschetta = bread + a *raw* tomato, caprese = mozzarella + tomato + basil, pizza = dough + sauce +
  cheese, omelette = egg + mushroom + cheese, risotto = rice + mushroom + cheese, pasta al pesto =
  pasta + pesto, carbonara = pasta + egg + cheese + bacon, minestrone = soffritto + potato + a *raw*
  tomato, gnocchi = gnocchi + sauce, calzone = dough + mozzarella + bacon, tiramisu = cream + coffee,
  tagliatelle al ragù = pasta + ragù, lasagne = pasta + ragù + cheese (ragù = sauce + minced beef).
  No dish holds both halves of a prep raw, and a prep only shows up on a level once it was taught.
- **Menus vary:** a level mixes two or three dishes (banquets more), its orders spread evenly over
  them, a new dish leads the level that introduces it, and neighbouring levels never serve the same
  set. Every ladder row has a one-line hook (a new dish, a new reaction, a tighter counter, a lid).
- **Landing rule:** a full counter still accepts an item that combines immediately; any other
  column is shaded and can't be tapped. So you never lose to a misclick, only to planning.
- Levels are **zero-waste**: every item is used, so a win always takes exactly as many moves
  as there are items. Stuck = no column can be taken and guests are still waiting.

## Pantry mechanics (every kitchen)

- **Cloches** (taught at campaign level 17). A steel cloche with a "?" hides a tile until it
  reaches the front of its column, then lifts. The tickets say exactly what the pantry holds, so the
  hidden items are known as a set, only not where they are: a careful player works out what can be
  under each cloche and keeps the plan safe for every possibility. Every cloche level is checked by
  a deducer that never needs to guess (a banquet may need one guess, flagged in the docs), and each
  hides at least one "riddle" (a decision where what is hidden matters). A lifted cloche stays
  lifted after an undo: peeking with undo is allowed, it costs the clean-run star like any undo.
- **Frozen tiles** (taught at campaign level 37). A tile in an ice block can be taken only after a
  number of takes from any column; the big number on the ice counts down and its column waits
  behind it. It asks for that many moves that don't clog the counter. The ice cracks and drips
  away when it thaws.
- **The stove** (moves, not real time). The oven (Trattoria, from campaign level 48): a pizza, a
  calzone or a lasagne whose parts are together bakes for 2–3 takes in its counter spot while its
  guest waits (the ticket shows ♨ and the countdown). The grill (Burger Joint, from level 51): a
  patty grills 2–3 takes in a counter spot before it can go on a plate. Every take cooks one take
  more; when the pantry is empty the stove finishes. A full counter while something cooks jams the
  kitchen — keep moves ready that don't clog it.
- **The ragù chain** (Trattoria, from level 62): tomato + tomato make sauce, sauce + minced beef make
  ragù at once, for tagliatelle al ragù and lasagne. Beef waiting on the counter steals the sauce a
  spaghetti, a pizza or gnocchi needed: a trap that shows several moves later.
- **Set menus** (Trattoria from campaign level 63, Burger Joint from level 96): one guest orders two
  dishes and gets them together. The first one finished waits on the counter on a red napkin (it
  takes a spot) until the second is ready; the guest eats both as one meal.
- **The VIP** (Trattoria from level 78, Burger Joint from level 98): a gold star in the queue shows
  exactly when the VIP arrives. While the VIP is seated nobody else is served: other finished dishes
  wait on the counter (a spot each) until the VIP has been served. Set menus and the VIP share one
  rule — a finished dish that can't go out yet waits on the counter — and are never combined with
  the oven.
- **Lids** (Trattoria L36, Burger Joint L26): a column opens after k dishes.
- **Bigger kitchens** late in each ladder: six columns, a third seat and up to eight guests.

Where the thinking comes from (measured in the design simulations):
- the counter size (one spot fewer is the strongest dial),
- tomato counting: a bruschetta, a caprese or a soup needs a lone raw tomato, a second tomato turns
  it into sauce,
- eggs compete: an egg next to flour becomes dough before an omelette, a carbonara or the
  mascarpone cream can use it; basil next to the cheese becomes pesto; a potato next to flour
  becomes gnocchi,
- queued guests: items for a later order must wait on the counter,
- lids: a column opens only after k dishes, which forces a serving order.

Random levels are trivial, so every level is built around a known winning line and then
**searched**: a hill climb moves tiles between columns until a goal-directed player — one who
reasons backwards from the orders like a person, plans 4 moves along them and slips now and then —
finds it as hard as its place in the campaign asks: it wins most early levels on the first try,
about every third late one, and loses most hard levels and banquets, while a careful player (6 moves,
no slips) still wins them. Narrow passages whose mistakes show late are counted too (see
[difficulty.md](difficulty.md)).

## Help without stress

- Undo is free and unlimited; three stars need a clean run (no undo, no helpers). Undo doesn't put
  a lifted cloche back down.
- Hint shows a safe column, or says how many moves back the kitchen was still winnable.
- +Spot adds a counter spot for the rest of the level.
- On the first levels the game gently says when a kitchen can no longer be finished.

## Worlds (one new rule each)

The campaign alternates the kitchens in **shifts of five levels** (src/core/shifts.ts): two
Trattoria shifts, then the Burger Joint from level 11 and the Taquería from level 26 take turns,
24 shifts in all. Each kitchen keeps its own ladder of 40 local levels (dishes, mechanics, tiers,
targets), so its difficulty keeps climbing across its visits; every shift ends on its kitchen's
hard level or banquet. Endless play keeps rotating the three kitchens in shifts.

- **Burger Joint menu:** five stacked dishes under the same layer rules: burger (bun to bun), hot
  dog (bun, sausage, toppings), pancakes (pancakes, butter or berries on top), club sandwich (toast
  to toast: one toast fits two plates) and sundae (glass, scoops, cherry). Fillings are shared, so
  the left plate still steals from the right one.
- **Taquería menu:** five tacos and the quesadilla and tostada in tortillas (3 fillings), four
  burritos and enchiladas in wraps (4 fillings). Each taco and its burrito share a colour on the
  plate so they're told apart at a glance.

| # | Kitchen | Rule change | You think about |
|---|---|---|---|
| 1 | Trattoria | items combine by themselves | which reactions to avoid |
| 2 | Burger Joint | layers go on in order; the left plate gets first pick | reading columns as recipes |
| 3 | Taquería | an open tortilla takes the next fillings | what a container will swallow |
| 4 | Boulangerie | dough bakes in a 1–2 slot oven for a few moves | timing |
| 5 | Wok Station | you choose where an item lands; only neighbours combine | placement |
| 6 | Spice Market | any three different spices side by side make a blend | patterns, not recipes |
| 7 | Cafeteria | crates with counts ride a belt past the pots | flow and capacity |
| 8 | Dim Sum House | the table turns one notch per take | rotation |

After world 8, "Chef's Table" levels combine two rules. Formats inside a world: a banquet
every 10th level, chef's-choice tickets, mystery menus, a daily special.
