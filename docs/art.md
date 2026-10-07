# Illustrated art

The meta screens use pre-rendered illustrations: a kitchen diorama per world on the level map, a
picture per dish in the cookbook, the title / loading illustration and the social preview. They are
generated locally with **Z-Image Turbo** (Tongyi-MAI, 6B, Apache 2.0) through
[mflux](https://github.com/filipstrand/mflux) on Apple silicon, the same way as Pixel Picnic's
illustrated pictures.

| What | Files | Size |
| --- | --- | --- |
| Kitchens (map backdrops) | `public/art/kitchens/{trattoria,diner,taqueria,bakery,wok,spice,cafeteria,dimsum}.webp` | 768×1024, ≤ 250 KB |
| Dishes (cookbook cards) | `public/art/dishes/<dish>.webp`: the Trattoria's 12 dishes, the Burger Joint's 5, `taco` (every taco), `burrito` (every burrito), `quesadilla`, `tostada`, `enchiladas`, and the later kitchens' `croissant`, `friedrice`, `dumplings`, `curry` | 640×640, ≤ 90 KB |
| Title / loading | `public/art/title.webp` | 768×1152 |
| Social preview | `public/og.jpg` | 1200×630 |

`src/data/art.json` lists every file (path relative to the public root, since the game is built with
`base: './'`), its size in pixels and bytes, its average colour (`color`, a loading placeholder) and the
colour of its plain border (`edge`: use it as the page colour around a kitchen backdrop or as the
cookbook card colour behind a dish, so the picture blends in).

## Style

One style string is appended to every prompt (`STYLE` in `scripts/art/prompts.py`):

> Cute stylized 3D illustration, soft clay toy diorama look, rounded chunky shapes, warm soft lighting,
> gentle shadows, pastel and warm saturated colours, cozy, high detail, no text, no letters, no logos,
> no watermark.

It won a comparison of three candidates on the Trattoria and the pizza (`STYLE_TESTS`): the glossy
"3D game render / tilt-shift" variant blurred details and pushed every kitchen towards the same
terracotta palette, the "clay and felt storybook" variant was grainier and duller. Kitchens come out
as a cut-away room on a floating base over a plain warm cream backdrop, which leaves calm space for
the map UI; dishes sit on a plain cream background and are re-centred at a common scale by
`finalize.py`. No people, famous characters, brands or text are prompted for.

## Regenerating

```bash
# once: a local venv (the q4 weights are read from ~/.cache/huggingface, nothing is downloaded)
uv venv .venv-art --python 3.11 && uv pip install --python .venv-art mflux pillow numpy

.venv-art/bin/python scripts/art/prompts.py              # write .cache/art/jobs.jsonl (main + extra jobs)
.venv-art/bin/python scripts/art/prompts.py main only=hotdog,sundae seeds=11,23 out=.cache/art/jobs-new.jsonl   # chosen subjects
sh scripts/art/generate-locked.sh .cache/art/jobs-new.jsonl   # render under the shared GPU lock (log: .cache/art/gen/_gen.log)
.venv-art/bin/python scripts/art/sheets.py kitchens 300 'kitchen-trattoria-*' 'kitchen-diner-*'   # review
.venv-art/bin/python scripts/art/finalize.py             # selection.json -> public/art, public/og.jpg, art.json
```

- Always render through `generate-locked.sh`: it waits for `.cache/mflux.lock` (another agent or
  script may be using the GPU; two generations at once can exhaust the memory) and frees it on exit.
- `generate.py` keeps the model loaded and renders the queue in order, re-reading it after every
  image and skipping jobs whose PNG exists, so new jobs can be added while it runs. Every job has its
  own size (multiples of 16) and seed; 8 steps.
- To re-roll a subject, add an entry to `EXTRA` in `prompts.py` (new seeds, optionally a tweaked
  prompt with a version tag), run `prompts.py extra` and `generate.py`, look at the contact sheet in
  `.cache/art/sheets/`, then point `scripts/art/selection.json` at the chosen image (each entry keeps a
  note on why it was picked). The main queue has seeds 11, 23 and 37 per subject; the shipped set was
  picked from seed 11 for most subjects, seed 23 for three kitchens, and two prompt re-rolls (croissant
  `v2`, social preview `v2`, seeds 41/53).
- Speed on the M4 Pro (nothing else on the GPU): about 50 s for 640×640, 95–110 s for 768×1024 and
  1216×640, 120 s for 768×1152, plus ~1 min to load the model.

## Licence

Z-Image Turbo is released under the Apache 2.0 licence, which places no restrictions on the use of
generated images; the pictures in `public/art/` and `public/og.jpg` are part of this project.
