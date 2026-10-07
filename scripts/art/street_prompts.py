"""Storefronts for the food-street level map: each kitchen grows from a cart to a lively restaurant.

  PYTHONPATH=scripts/art .venv-art/bin/python scripts/art/street_prompts.py [seeds...]   (default seeds: 11 23)

writes .cache/art/street-jobs.jsonl; render it with
  .venv-art/bin/python scripts/art/generate.py .cache/art/street-jobs.jsonl .cache/art/street
(hold the shared lock .cache/mflux.lock while generating), then cut the picks out with
scripts/art/street_finalize.py. Job ids: street-<kitchen>-<stage>-s<seed>.
"""
import json
import os
import sys

from prompts import STYLE

# Same look as the kitchen dioramas, but a single building standing alone so it can be cut out.
SHOT = ("{s} A single miniature building seen from the front at a slight three-quarter angle from a little above, "
        "standing on a small rounded patch of pavement, the whole building fully visible and centred with a margin "
        "around it, on a plain smooth flat soft cream background, nothing else in the picture.")

STAGES = {
    'trattoria': [
        "A tiny Italian street food cart made of wood with two big wheels, a small red and white striped parasol, "
        "a crate of ripe tomatoes, a little pot of basil and a terracotta pot with a lemon tree beside it.",
        "A small Italian trattoria kiosk with terracotta walls, one arched wooden door, a short green and white "
        "striped awning, a window with green shutters, terracotta pots of basil and geraniums by the door.",
        "A charming Italian trattoria shopfront with warm terracotta walls, a long red, white and green striped "
        "awning, warm string lights, two little round café tables with chairs on the terrace, potted lemon trees "
        "and a blank wooden sign board.",
        "A lively two storey Italian trattoria with terracotta and cream walls, a balcony overflowing with red "
        "geraniums, a big green awning, glowing string lights, a busy terrace with checked tablecloths on several "
        "tables, vines over the door, lanterns and a large blank wooden sign board.",
    ],
    'diner': [
        "A tiny retro burger food cart in mint green and cherry red with chrome trim, a little striped canopy, "
        "a round chrome lamp, red and yellow squeeze bottles and a small menu stand with no writing.",
        "A small 1950s roadside burger stand in mint green and cherry red, a walk-up service window with a chrome "
        "counter, a red and white striped awning, two round red stools and a glowing neon star with no writing.",
        "A 1950s American diner shopfront in mint green and cherry red with chrome trim, big windows showing red "
        "stools, black and white checker tiles along the base, glowing neon tubes shaped like a star and a "
        "lightning bolt, two outdoor tables with red umbrellas.",
        "A big lively retro diner with a rounded chrome roof, mint green and cherry red walls, glowing neon stars, "
        "warm string lights, a busy terrace with red umbrellas over several tables with milkshakes and burgers, "
        "a black and white checker floor and a large blank sign on the roof.",
    ],
    'taqueria': [
        "A tiny Mexican taco cart painted turquoise with a big colourful striped parasol, papel picado paper flags "
        "in pink, yellow and turquoise, a small griddle with tortillas, a basket of limes and a potted cactus.",
        "A small Mexican taqueria stall with walls of hand-painted turquoise and marigold talavera tiles, a pink "
        "and orange striped awning, papel picado flags, terracotta pots and a small potted cactus.",
        "A charming Mexican taqueria shopfront with warm adobe walls, a turquoise door under a round arch, "
        "talavera tiles in turquoise and marigold, colourful papel picado strung across the front, potted cacti "
        "and two little terrace tables with striped blankets.",
        "A big lively Mexican cantina with adobe arches, turquoise and marigold talavera tiles, layers of colourful "
        "papel picado, glowing string lights, a busy terrace with several tables, potted cacti and bright flowers, "
        "and a large blank painted sign board.",
    ],
}

SIZE = (640, 640)

# Small props that stand along the street in each kitchen's stretch.
PROP = ("{s} A single small object, centred and fully visible with a margin around it, seen from the front "
        "a little from above, on a plain smooth flat soft cream background, nothing else in the picture.")
PROPS = {
    'trattoria': "A terracotta pot with a small lemon tree full of bright yellow lemons and a few red geraniums.",
    'diner': "A retro chrome street lamp with a round warm glowing globe and a small mint green planter at its foot.",
    'taqueria': "A tall green cactus with a pink flower in a hand-painted turquoise and marigold talavera pot.",
}
PROP_SIZE = (448, 448)


def jobs(seeds):
    for kitchen, stages in STAGES.items():
        for i, subject in enumerate(stages, start=1):
            for seed in seeds:
                yield {'id': f'street-{kitchen}-{i}-s{seed}', 'seed': seed, 'w': SIZE[0], 'h': SIZE[1],
                       'prompt': SHOT.format(s=subject) + ' ' + STYLE}
    for kitchen, subject in PROPS.items():
        for seed in seeds:
            yield {'id': f'prop-{kitchen}-s{seed}', 'seed': seed, 'w': PROP_SIZE[0], 'h': PROP_SIZE[1],
                   'prompt': PROP.format(s=subject) + ' ' + STYLE}


if __name__ == '__main__':
    seeds = [int(a) for a in sys.argv[1:]] or [11, 23]
    os.makedirs('.cache/art', exist_ok=True)
    with open('.cache/art/street-jobs.jsonl', 'w') as f:
        # one candidate of every subject first, then the other seeds
        for j in sorted(jobs(seeds), key=lambda j: j['seed']):
            f.write(json.dumps(j) + '\n')
    print('wrote .cache/art/street-jobs.jsonl')
