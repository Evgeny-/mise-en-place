"""Prompts for the illustrated meta-screen art (level map, cookbook, title, social preview).

  .venv-art/bin/python scripts/art/prompts.py [tests] [main] [extra]   (default: main extra)
  .venv-art/bin/python scripts/art/prompts.py main only=bruschetta,caprese seeds=11,23 out=.cache/art/jobs-menus.jsonl

writes the job queue .cache/art/jobs.jsonl (or `out=`) for scripts/art/generate.py (which skips jobs
that are already rendered, so rewriting the queue while it runs is fine). `only=` limits the main and
extra jobs to these subjects, `seeds=` the main jobs to these seeds. Job ids: <group>-<subject>-s<seed>,
re-rolls with a tweaked prompt: <group>-<subject>-v<k>-s<seed>.
"""
import json
import os
import sys

# One look for everything: chunky toy-like 3D food and rooms, soft warm light, like the game itself.
STYLE = ("Cute stylized 3D illustration, soft clay toy diorama look, rounded chunky shapes, "
         "warm soft lighting, gentle shadows, pastel and warm saturated colours, cozy, high detail, "
         "no text, no letters, no logos, no watermark.")

# Candidates compared on two subjects before the full run (see docs/art.md); 'a' == STYLE.
STYLE_TESTS = {
    'a': STYLE,
    'b': ("Cute 3D game art render, chunky toy-like shapes with smooth glossy and soft matte surfaces, "
          "rounded bevelled edges, miniature tilt-shift look, warm soft studio lighting with gentle ambient "
          "occlusion, warm terracotta, cream and pastel palette, cheerful, cozy, clean and readable, "
          "no text, no letters, no logos, no watermark."),
    'c': ("Charming cozy storybook illustration in soft 3D, like a handmade miniature of clay and felt, "
          "simple rounded shapes, smooth surfaces, warm golden light, soft pastel colours with terracotta "
          "and cream accents, gentle depth of field, whimsical and calm, no text, no letters, no logos, "
          "no watermark."),
}

SIZES = {'kitchen': (768, 1024), 'dish': (640, 640), 'title': (768, 1152), 'og': (1216, 640)}
SEEDS = (11, 23, 37)

KITCHEN = ("Cozy miniature diorama of {s} The empty room is seen from slightly above in a three-quarter view, "
           "with the counter, shelves and decorations along the back wall and the sides, and a calm open floor "
           "with few objects in the lower half. No people, no animals, no characters.")
KITCHENS = {
    'trattoria': ("an Italian trattoria kitchen: warm terracotta walls, arched windows with green shutters, "
                  "green, white and red bunting strung across the ceiling, a wooden counter with baskets of ripe "
                  "tomatoes, garlic braids and fresh basil, glass jars of dry pasta on wooden shelves, shiny copper "
                  "pans hanging on the wall, a brick pizza oven with a warm glow, potted herbs and cream floor tiles."),
    'diner': ("a 1950s burger diner kitchen in mint green and cherry red: a chrome-trimmed counter with round red "
              "stools, a black and white checkerboard floor, a flat-top grill with burger patties, a milkshake "
              "mixer, red and yellow squeeze bottles, glowing neon tube decorations shaped like a star and a "
              "lightning bolt on the wall, round chrome lamps and a jukebox in the corner."),
    'taqueria': ("a Mexican taqueria kitchen: walls covered with hand-painted talavera tiles in turquoise, marigold "
                 "yellow and pink, colourful papel picado paper banners strung overhead, terracotta clay pots, a "
                 "griddle with warm tortillas, baskets of limes, avocados and chili peppers, potted cacti, striped "
                 "woven blankets and warm adobe arches."),
    'bakery': ("a French boulangerie kitchen in pastel pink and powder blue: a white marble counter, wicker baskets "
               "of baguettes and round loaves, a glass display case with croissants, macarons and fruit tarts, a "
               "big vaulted bread oven with a warm glow, wooden shelves full of bread, a striped awning over the "
               "window and copper whisks."),
    'wok': ("a Chinese wok station kitchen in red lacquer, black and gold: big woks over blue gas flames with "
            "clouds of white steam, plain red paper lanterns with gold tassels hanging from the ceiling, tall stacks "
            "of bamboo steamer baskets, a dark wooden counter with bok choy, chili peppers, garlic and spring "
            "onions, porcelain bowls, a round moon window with bamboo outside and gold patterned trim."),
    'spice': ("a spice market kitchen in saffron yellow, deep indigo and polished brass: open plain burlap sacks "
              "overflowing with colourful spice powders heaped into cones of red, yellow, orange and green, glass "
              "jars of spices on wooden shelves, brass pots and teapots, hanging pierced brass lanterns, indigo "
              "tiled horseshoe arches, a copper stove with a bubbling pot and woven rugs."),
    'cafeteria': ("a friendly school cafeteria kitchen: a long stainless steel serving counter with a conveyor belt "
                  "carrying purple trays with little bowls, big pots of soup, cheerful lavender and lemon yellow "
                  "walls, bunting of paper stars, stacks of clean plates, a fruit basket, potted plants, bright windows "
                  "and colourful floor tiles."),
    'dimsum': ("a Cantonese dim sum house: tall stacks of round bamboo steamers with puffs of steam, round wooden "
               "tables with porcelain teapots and little teacups, warm honey-coloured wood panels, glowing round "
               "red and gold lanterns, carved wooden lattice screens, a small trolley cart with steamers, a potted "
               "orchid and jade green accents."),
}

DISH = ("{s} The single dish is big and centred, filling most of the frame, seen from a three-quarter view slightly "
        "above, fully visible with a small even margin around it, on a plain smooth soft cream background with a soft "
        "shadow under it, nothing else in the picture.")
DISHES = {
    'pizza': "A pizza margherita with a bubbly golden crust, bright tomato sauce, melted mozzarella and fresh basil leaves, on a round wooden board.",
    'spaghetti': "A plate of spaghetti al pomodoro: a neat twirled nest of spaghetti in bright red tomato sauce topped with fresh basil leaves and grated parmesan, in a white ceramic plate.",
    'minestrone': "A bowl of minestrone soup: tomato broth with chunky carrots, zucchini, beans and small pasta, a basil leaf on top, in a terracotta ceramic bowl.",
    'omelette': "A fluffy yellow folded omelette filled with sauteed mushrooms and sprinkled with chopped chives, on a white plate.",
    'burger': "A cheeseburger with a shiny sesame seed bun, a juicy beef patty, melted cheddar cheese, crisp lettuce, tomato slices and pickles.",
    'taco': "Two soft corn tacos filled with grilled meat, diced onion, cilantro and red salsa, with lime wedges, on a small turquoise plate.",
    'croissant': "A golden flaky butter croissant with crisp layers, on a small white plate.",
    'friedrice': "A bowl of egg fried rice with green peas, diced carrots, scrambled egg and spring onions, in a blue and white porcelain bowl.",
    'dumplings': "A round bamboo steamer basket full of plump pleated dumplings with a soft wisp of steam.",
    'curry': "A bowl of golden chicken curry with chunks of potato and carrot and a sprig of coriander, beside a mound of fluffy white rice, in a copper bowl.",
    # Trattoria menu, second course
    'bruschetta': "Three slices of toasted rustic bread topped with bright diced red tomatoes and fresh green basil leaves, glistening with olive oil, on a small wooden board.",
    'caprese': "A caprese salad: thick slices of white mozzarella and ripe red tomato overlapping in a ring, with fresh green basil leaves, on a round white plate.",
    'risotto': "A creamy mushroom risotto with sliced brown mushrooms, grated parmesan and a sprig of parsley, in a shallow white bowl.",
    'pesto_pasta': "A plate of twisted fusilli pasta tossed in bright green basil pesto, topped with fresh basil leaves, pine nuts and grated parmesan, in a white ceramic plate.",
    'carbonara': "A plate of spaghetti carbonara in a glossy pale golden egg and cheese sauce with crispy bacon pieces and cracked black pepper, a bright egg yolk on top, in a white ceramic plate.",
    'gnocchi': "A bowl of soft potato gnocchi dumplings in bright red tomato sauce with fresh basil leaves and grated parmesan, in a terracotta ceramic bowl.",
    'calzone': "A golden baked calzone, a big folded half-moon pizza pocket with a crimped edge, cut open at one end to show melted mozzarella and ham, on a round wooden board.",
    # Taquería menu
    'quesadilla': "A golden grilled quesadilla cut into three wedges with melted cheese stretching out and chicken inside, with small bowls of red salsa and sour cream, on a turquoise plate.",
    'tostada': "A crispy flat tostada heaped with refried beans, shredded lettuce, a scoop of guacamole, diced tomato and crumbled white cheese, on a blue plate.",
    'enchiladas': "Three rolled enchiladas baked in red chili sauce, topped with melted cheese, a drizzle of sour cream and chopped cilantro, in an oval terracotta baking dish.",
    'burrito': "A big burrito wrapped in a soft flour tortilla, cut in half to show rice, beans, grilled chicken, cheese and salsa inside, half wrapped in shiny foil, on a small plate with lime wedges.",
    # Burger Joint menu
    'hotdog': "A hot dog in a soft golden bun with a grilled sausage, topped with crunchy pickle slices and fried onions, in a red and white paper tray.",
    'pancakes': "A tall stack of fluffy golden pancakes topped with fresh blueberries, raspberries and a melting pat of butter, with a drizzle of maple syrup, on a pastel pink plate.",
    'sandwich': "A club sandwich cut in half and stacked, toasted white bread with crispy bacon, lettuce, tomato and cheese, held with a cocktail pick, on a small wooden board.",
    'sundae': "An ice cream sundae in a footed glass: scoops of vanilla and chocolate ice cream with whipped cream, berries and a bright red cherry on top.",
    'tiramisu': "A square slice of tiramisu with neat layers of coffee-soaked ladyfingers and white mascarpone cream, dusted with dark cocoa powder, on a small white plate.",
}

TITLE = ("A cozy kitchen counter in warm morning light. At the bottom of the picture, a wooden butcher-block counter "
         "with a few fresh ingredients: ripe red tomatoes on the vine, a small pot of fresh basil, a wedge of cheese, "
         "a glass jar of dry pasta and a bowl of eggs. Behind them a soft cream plaster wall and the edge of a window "
         "with golden morning sunbeams. The whole upper half of the picture is calm, soft, empty cream wall and light "
         "with no objects, leaving lots of space for a title logo.")
OG = ("Cute round animal guests, a brown bear, an orange fox, a grey tabby cat and a white bunny, sitting side by side "
      "on stools at a white marble bar counter in a cozy Italian trattoria, smiling happily as they are served a pizza "
      "margherita and plates of spaghetti. Terracotta walls, green, white and red bunting, warm string lights, copper "
      "pans and potted basil. Wide cinematic view.")


def subjects():
    """(group, subject id, prompt without style) for every final picture."""
    out = [('kitchen', k, KITCHEN.format(s=s)) for k, s in KITCHENS.items()]
    out += [('dish', k, DISH.format(s=s)) for k, s in DISHES.items()]
    out += [('title', 'main', TITLE), ('og', 'main', OG)]
    return out


# Re-rolls after review: (group, subject, version or None, prompt override or None, seeds).
EXTRA = [
    # s11 came out as a round bread roll: insist on the crescent.
    ('dish', 'croissant', 2, DISH.format(s="A classic French butter croissant with a curved crescent shape, pointed "
                                           "tapered ends and flaky rolled golden layers, glossy and golden brown, on a "
                                           "small white plate."), (41, 53)),
    # s11 had a fifth guest and a little wall plaque with garbled lettering.
    ('og', 'main', 2, ("Exactly four cute round animal guests side by side, from left to right a brown bear, an orange "
                       "fox, a grey tabby cat and a white bunny, sitting on stools at a white marble bar counter in a "
                       "cozy Italian trattoria, smiling happily as they are served a pizza margherita and plates of "
                       "spaghetti. Plain terracotta walls without any signs, plaques or pictures, green, white and red "
                       "bunting, warm string lights, copper pans and potted basil. Wide cinematic view."), (41, 53)),
]


def job(group, subj, seed, prompt, style=STYLE, tag=''):
    w, h = SIZES[group]
    jid = f'{group}-{subj}{tag}-s{seed}'
    return {'id': jid, 'seed': seed, 'prompt': prompt + ' ' + style, 'w': w, 'h': h}


def tests():
    by = {(g, s): p for g, s, p in subjects()}
    out = []
    for seed in (11, 23):
        for g, s in (('dish', 'pizza'), ('kitchen', 'trattoria')):
            for k, style in STYLE_TESTS.items():
                j = job(g, s, seed, by[(g, s)], style)
                j['id'] = f'style{k}-{j["id"]}'
                out.append(j)
    return out


def main_jobs(only=None, seeds=SEEDS):
    # One seed of everything first, so the contact sheets fill up evenly.
    return [job(g, s, seed, p) for seed in seeds for g, s, p in subjects() if not only or s in only]


def extra_jobs(only=None):
    by = {(g, s): p for g, s, p in subjects()}
    out = []
    for g, s, ver, prompt, seeds in EXTRA:
        if only and s not in only:
            continue
        for seed in seeds:
            out.append(job(g, s, seed, prompt or by[(g, s)], tag=f'-v{ver}' if ver else ''))
    return out


if __name__ == '__main__':
    opts = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
    groups = [a for a in sys.argv[1:] if '=' not in a] or ['main', 'extra']
    only = set(opts['only'].split(',')) if 'only' in opts else None
    seeds = tuple(int(x) for x in opts['seeds'].split(',')) if 'seeds' in opts else SEEDS
    out_path = opts.get('out', '.cache/art/jobs.jsonl')
    jobs = []
    for g in groups:
        jobs += {'tests': tests, 'main': lambda: main_jobs(only, seeds), 'extra': lambda: extra_jobs(only)}[g]()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        for j in jobs:
            f.write(json.dumps(j) + '\n')
    print(len(jobs), 'jobs ->', out_path)
