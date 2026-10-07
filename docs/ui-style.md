# UI style: "Carte du jour"

The 2D interface of Mise en Place is a **bistro menu and order pad** laid over clay kitchens: cream
menu paper, espresso-ink outlines with a hard printed offset, a hearty serif for names and numbers,
and each kitchen's own materials (tiles, marble, steel, painted wood, garlands) carried into the screens
that belong to it. It replaced the interface inherited from Pixel Picnic (glossy purple candy buttons,
raised coloured header pills, Fluent Emoji).

Review pages (run `npx vite`, then open them):

- `review/ui-directions.html`: the three identities that were compared, over the real Trattoria scene.
- `review/ui-glyphs.html`: the whole icon set at 16/24/40 px, in light, dark and on coloured buttons.
- `review/ui-brand.html`: the loading-screen and app-icon options.

## Why this direction

Three directions were built for the same screens (HUD, ticket, dock, win dialog, map, icons):

| | Direction | Verdict |
|---|---|---|
| **A** | **Carte du jour**: menu paper, ink, Vollkorn + Jost, ticket stubs | **Picked** |
| B | Smalto: speckled enamelware, navy rims, Podkova | Charming, but the glossy rounded pills drift back to Pixel Picnic, the navy fights the terracotta Trattoria, speckle is noisy at ticket size |
| C | Lavagna: chalkboard and wood, Caveat | Atmospheric, but dark slabs weigh on a bright clay kitchen, handwriting hurts small labels and Cyrillic |

A reads best on a phone (ink on paper is the highest contrast over every kitchen), shares the cream of
the clay illustrations, and every motif comes from a real kitchen (order pad, awning, menu leaders, the
pass rail), so it is clearly not Pixel Picnic. After the first pass looked too plain ("just brown"),
it gained **materials**: each kitchen's floor, worktop and garland (`src/ui/surfaces.css`), textured
paper, striped awnings and lit plates. Night is plum dusk under warm lamps, never a flat dark slab.

## Type

- **Vollkorn** (variable 400–900, `font-variant-numeric: lining-nums`): titles, numbers, buttons,
  prices. Hearty and warm, with Cyrillic.
- **Jost** (variable): body text and small-caps labels (`700 10–11px`, `letter-spacing .1–.2em`,
  uppercase), like a printed menu.
- Nunito stays loaded only for the labels painted into the 3D scene (`src/render/textures.ts`).

All three are SIL OFL 1.1, self-hosted through `@fontsource-variable/*` and credited in the credits dialog.

## Tokens (`src/ui/base.css`)

| Token | Day | Night | Use |
|---|---|---|---|
| `--paper` / `--paper-2` / `--paper-hi` | `#fbf3e4` / `#f2e2c4` / `#fffaf0` | `#2f2a3a` / `#25212f` / `#3b3448` | surfaces, wells, cards |
| `--ink` / `--ink-2` | `#3b2a20` / `#7c5e49` | `#f7ecdb` / `#cfc1b0` | text |
| `--edge` / `--shade` | `#3b2a20` | `#ecdfca` / `#120f1a` | outlines / the hard offset under them |
| `--tomato` `--basil` `--cobalt` `--espresso` `--butter` | `#e04e39` `#3f9a52` `#2f6f8e` `#4f3a2d` `#f7c548` | same | red = the big action, green = go, blue, brown = neutral headers |
| `--accent` / `--accent-2` | per kitchen (`[data-kitchen]`) | | washi tape, current shift sign, road centre line |

Kitchen materials (`src/ui/surfaces.css`), switched by `[data-kitchen]` on `#ui` (in game; set by
`Hud.setLevel(…, kitchenId)`), on map stretches and cookbook chapters:

| | `--ground` | `--worktop` (dock tray) | `--garland` | plate rim `--rim-deco` |
|---|---|---|---|---|
| Trattoria | terracotta tiles | marble | green-white-red pennants | green and red dashes |
| Burger Joint | mint checker | brushed steel | marquee bulbs | red and mint bands |
| Taquería | talavera tiles | painted turquoise planks | papel picado | talavera petals |

`--grain` is a fractal-noise paper texture laid over dialogs, cards and the dock; `--veil` darkens
the materials at night.

## Components

- **Buttons** (`.btn`): flat fill, 2.5 px ink outline, `0 4px 0` hard offset that presses flat.
  `green` basil, `blue` cobalt, `purple` espresso, `red` tomato, `white` paper; `.big` (Next) is
  tomato. Labels in Vollkorn 800; `.small` buttons in Jost small caps. Glyphs on coloured buttons go
  single-colour (the coin keeps its gold).
- **Dialogs**: a menu card (textured paper, ink border, a fine inner rule) under a **striped awning**
  with a scalloped valance; the head colour is the dialog's mood. Close is a small paper token on the
  awning. Rewards use dotted menu leaders; dialog art is served on a plate (`.mech-art`).
- **HUD**: paper tokens for pause/home, the title as sticker text (ink with a paper outline), the
  guests-fed chip. The **dock** is the kitchen's worktop holding four paper cards.
- **Tickets** are slips from the order pad held by washi tape in the kitchen colours; the dish is a
  small sticker on top, the **parts** are what you read: 46 px soft-filled slots with 40 px icons,
  a prepared part spells out what it is made of under its slot (tomato + tomato, a drawn "+"), done
  parts turn basil with a check. Three-part orders stack two over one when the seats are close
  (`Tickets.place`), four-part orders always do. The queue is a steel pass rail.
- **Map: the food street** (`MapScreen`): one street climbing uphill; each 5-level shift is a stop
  at a kitchen's storefront (painted, growing from a cart to a busy restaurant by visit:
  `storefrontStage`), its levels are hand-painted plates on the paving in front of it, the current
  plate sits under a warm lamp. Stretches keep their kitchen's floor, paving (cobbles, asphalt with a
  centre line, terracotta pavers), bunting between lamp posts and a painted prop, cross-faded into the
  next. Shifts not reached stand in the haze.
- **Cookbook**: each kitchen's chapter opens on a strip of its floor with its garland and a nameplate;
  dishes are recipe cards held by tape.
- **Toasts** are an ink pill; the hard-level **banner** is a rubber stamp.
- **Loading** (`index.html`, `src/ui/loading.ts`): two tomatoes drop onto a plate, squash, roll together
  and puff into a pot of steaming sauce, the game's one rule as a 3.4 s loop; the title settles in
  letter by letter. It is inline SVG/CSS, so it plays before any script or font loads, and it holds
  still under `prefers-reduced-motion`.

## Icons (`src/ui/glyphs.ts`)

Hand-drawn on a 24-unit grid: a 2-unit round ink line in `currentColor` over flat "tone" fills from the
kitchen palette (`TONE`). `glyph(name, size, cls)`; `cls = 'mono'` turns the tones into a soft wash of
the ink colour, `'off'` greys them (empty stars). Because the ink is `currentColor`, every glyph flips
for night by itself. The set: dock (undo, hint, slot, recipes), HUD (pause, home, fed), map and top bar
(star, coin, daily, cookbook, settings, lock, play, crown, fire, toque, sparkle, map), dialogs and
settings (check, close, restart, back, forward, plus, ff, music, sound, night, language, debug) and
dialog art (pot for a jammed kitchen, lid for the lid rule). `icons.ts` keeps `lineIcon()` and a
deprecated `emoji()` that maps the old Fluent names onto these glyphs; no Fluent Emoji ship any more.

## App icon

**Chef Tomato**: a tomato in a chef's toque on butter yellow (`public/icon.svg`, the bare mark in
`public/logo.svg`). It was picked over a plain toque (says "cooking", not this game) and three prep
bowls (three dots at 16 px): a red ball under a white hat stays unmistakable at 16 px and becomes a
character at home-screen size. `bun scripts/build-app-icons.ts` writes the favicon, the apple-touch icon
and the PWA icons, including the maskable one.

## Storefront art

Painted with the same Z-Image Turbo pipeline as the kitchens (`docs/art.md`):
`scripts/art/street_prompts.py` (4 growth stages per kitchen and street props, isolated on cream),
`scripts/art/street_flat.py` (storefronts kept whole, backdrop evened to the street's cream side) and
`scripts/art/street_finalize.py` (props cut out). Generation holds the shared lock `.cache/mflux.lock`.

## Checks

Phone 390×844, small phone 360×640 and desktop 1280×800, in light and night (headless Chrome is dark by
default: emulate `prefers-color-scheme: light` or set Night mode to Off).
